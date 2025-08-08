import { Platform } from 'react-native';
import { type SliderValues } from '../../types/types';
import { BaseProgressManager } from './BaseProgressManager';
import { EPG_RETRY_DELAYS, LIVE_EDGE_TOLERANCE, PROGRESS_SIGNIFICANT_CHANGE } from './constants';
import { type DVRProgressManagerOptions, type DVRProgressUpdateData, type DVRUpdatePlayerData, type EPGErrorData, type ModeChangeData, type ProgramChangeData } from './types/dvr';
import { DVR_PLAYBACK_TYPE } from './types/enums';

/**
 * DVRProgressManagerClass
 * 
 * Gestiona el progreso de reproducción para streams con DVR (Digital Video Recording/timeshift).
 * 
 * CONCEPTOS CLAVE:
 * - La ventana DVR crece naturalmente con el tiempo real
 * - Durante pausas: el timestamp de posición se congela pero el liveEdgeOffset crece
 * - El liveEdge es siempre Date.now() (o endStreamDate si está definido)
 * - currentTime del player = segundos desde el inicio de la ventana DVR
 * 
 * IMPORTANTE - DISCREPANCIA ENTRE VENTANA TEÓRICA Y REAL:
 * - La ventana DVR configurada (ej: 5 horas) puede NO coincidir con lo que el player tiene disponible
 * - El player puede tener menos contenido buffereado que la ventana teórica
 * - SIEMPRE usamos el seekableRange del player como fuente de verdad cuando está disponible
 * - Solo usamos la ventana teórica como fallback cuando no tenemos datos del player
 * 
 * FLUJO DE DATOS:
 * 1. Recibimos dvrWindowSeconds → calculamos ventana teórica
 * 2. Player envía currentTime y seekableRange → usamos seekableRange.end - seekableRange.start como ventana real
 * 3. Calculamos progressDatum basándonos en la ventana REAL del player, no la teórica
 * 4. Durante pausas → congelamos progressDatum pero el tiempo real sigue avanzando
 * 5. Emitimos SliderValues con todos los valores calculados
 */
export class DVRProgressManagerClass extends BaseProgressManager {
    // ========================================
    // TIMESTAMPS FIJOS (no cambian tras inicialización)
    // ========================================
    private _windowStartTimestamp: number = 0; // Timestamp absoluto del inicio de la ventana DVR
    private _initializationTimestamp: number = 0; // Cuando se inicializó el manager con ventana
    
    // ========================================
    // CONFIGURACIÓN DVR
    // ========================================
    private _initialTimeWindowSeconds: number | null = null; // Tamaño inicial de ventana en segundos
    private _endStreamDate: number | null = null; // Si el stream ha terminado

    // ========================================
    // ESTADO DE REPRODUCCIÓN
    // ========================================
    private _isLiveEdgePosition: boolean = true;
    private _playbackType: DVR_PLAYBACK_TYPE = DVR_PLAYBACK_TYPE.WINDOW;
    private _currentProgram: any | null = null;
    
    // ========================================
    // GESTIÓN DE PAUSAS
    // ========================================
    private _pausedProgressDatum: number | null = null; // Timestamp absoluto cuando se pausó
    private _pauseUpdateInterval: ReturnType<typeof setTimeout> | null = null;
    
    // ========================================
    // ÚLTIMO ESTADO VÁLIDO CONOCIDO (para transiciones)
    // ========================================
    private _lastValidSliderValues: SliderValues | null = null;
    
    // ========================================
    // TRACKING Y EPG
    // ========================================
    private _lastProgressForEPG: number | null = null;
    private _epgRetryCount: Map<number, number> = new Map();
    private _isManualSeeking: boolean = false;
    private _manualSeekTimeout: ReturnType<typeof setTimeout> | null = null;
    private _pendingInitialSeek: boolean = false;

    // ========================================
    // CALLBACKS DVR
    // ========================================
    private _dvrCallbacks: {
        getEPGProgramAt?: ((timestamp: number) => Promise<any>) | null;
        onModeChange?: ((data: ModeChangeData) => void) | null;
        onProgramChange?: ((data: ProgramChangeData) => void) | null;
        onEPGRequest?: ((timestamp: number) => void) | null;
        onEPGError?: ((data: EPGErrorData) => void) | null;
    } = {};

    constructor(options: DVRProgressManagerOptions = {}) {
        super(options);
        
        this.log(`DVR window configured: ${!!options.dvrWindowSeconds}`, 'info');
        
        this._playbackType = options.playbackType || DVR_PLAYBACK_TYPE.WINDOW;
        this._dvrCallbacks = {
            getEPGProgramAt: options.getEPGProgramAt,
            onModeChange: options.onModeChange,
            onProgramChange: options.onProgramChange,
            onEPGRequest: options.onEPGRequest,
            onEPGError: options.onEPGError
        };

        // Si tenemos ventana inicial, inicializar timestamps
        if (options.dvrWindowSeconds) {
            this._initializeDVRWindow(options.dvrWindowSeconds);
        }

        this.log(`DVR initialized - waiting for player data`, 'info');
    }

    // ========================================
    // MÉTODOS PÚBLICOS PRINCIPALES
    // ========================================
    
    async updatePlayerData(data: DVRUpdatePlayerData): Promise<void> {
        // Validación inicial de datos
        if (!data) {
            this.log('updatePlayerData: No data provided', 'warn');
            return;
        }
        
        // Detectar si es una actualización inválida (valores en 0 o negativos cuando no deberían)
        const isInvalidUpdate = data.currentTime === 0 && 
                               this._currentTime > 0 && 
                               this._hasReceivedPlayerData &&
                               !data.isPaused && 
                               !data.isBuffering;
        
        if (isInvalidUpdate) {
            this.log('updatePlayerData: Ignoring invalid update with currentTime=0', 'warn', {
                previousTime: this._currentTime,
                newTime: data.currentTime,
                isPaused: data.isPaused,
                isBuffering: data.isBuffering
            });
            
            // Solo actualizar el estado de pausa/buffering si cambió
            const wasPausedBefore = this._isPaused || this._isBuffering;
            
            // Si vamos a entrar en pausa y aún no hemos capturado la posición, hacerlo ahora
            if (!wasPausedBefore && (data.isPaused || data.isBuffering) && !this._pausedProgressDatum) {
                this._pausedProgressDatum = this._getProgressDatum();
                this.log('Capturing position before invalid pause update', 'debug', {
                    pausedAt: this._pausedProgressDatum
                });
            }
            
            this._isPaused = data.isPaused;
            this._isBuffering = data.isBuffering;
            const isPausedNow = this._isPaused || this._isBuffering;
            
            // Gestionar transición de pausa si hubo cambio
            if (wasPausedBefore !== isPausedNow) {
                this._handlePauseTransition(wasPausedBefore, isPausedNow);
            }
            
            // Emitir update con los valores anteriores
            this._emitProgressUpdate();
            return;
        }
        
        this.log('updatePlayerData', 'debug', { 
            currentTime: data.currentTime, 
            seekableRange: data.seekableRange,
            seekableSize: data.seekableRange ? data.seekableRange.end - data.seekableRange.start : 0,
            isPaused: data.isPaused,
            isBuffering: data.isBuffering,
            isManualSeeking: this._isManualSeeking,
            configuredWindowSize: this._initialTimeWindowSeconds
        });

        const wasValidBefore = this._isValidState();
        const wasPausedBefore = this._isPaused || this._isBuffering;
        
        // Si vamos a entrar en pausa, capturar la posición ANTES de actualizar los datos
        if (!wasPausedBefore && (data.isPaused || data.isBuffering) && this._isValidState()) {
            this._pausedProgressDatum = this._getProgressDatum();
            this.log('Pre-capturing pause position', 'debug', {
                pausedAt: this._pausedProgressDatum ? new Date(this._pausedProgressDatum).toISOString() : 'null'
            });
        }
        
        // Actualizar datos básicos del player
        this._updateBasicPlayerData(data);
        
        const isValidNow = this._isValidState();
        const isPausedNow = this._isPaused || this._isBuffering;
        
        // Si el estado se volvió válido y tenemos un seek inicial pendiente
        if (!wasValidBefore && isValidNow && this._pendingInitialSeek) {
            this.log('State became valid, executing pending initial seek to live', 'info');
            this._pendingInitialSeek = false;
            setTimeout(() => {
                this.goToLive();
            }, 100);
        }
        
        // Gestionar transiciones de pausa (esto ahora solo maneja el timer)
        this._handlePauseTransition(wasPausedBefore, isPausedNow);
        
        // Solo ejecutar lógica DVR si el estado es válido
        if (isValidNow) {
            // Actualizar posición live edge si no estamos en seek manual
            if (!this._isManualSeeking) {
                this._updateLiveEdgePosition();
                this._checkSignificantProgressChange();
            }

            // Gestión de EPG para modos PLAYLIST/PROGRAM
            if ((this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST || 
                 this._playbackType === DVR_PLAYBACK_TYPE.PROGRAM) && 
                this._dvrCallbacks.getEPGProgramAt) {
                this._checkProgramChange().catch(console.error);
            }

            // Marcar como inicializado
            if (!this._isInitialized && this._initialTimeWindowSeconds) {
                this._markAsInitialized();
            }
        }

        // Obtener programa inicial si es necesario
        if (!wasValidBefore && isValidNow && !this._currentProgram) {
            this.getCurrentProgramInfo().catch(console.error);
        }

        this._emitProgressUpdate();
    }

    getSliderValues(): SliderValues {
        // Si el estado no es válido, intentar usar valores anteriores
        if (!this._isValidState()) {
            // Si tenemos valores anteriores válidos guardados, usarlos con ajustes
            if (this._lastValidSliderValues) {
                const liveEdge = this._getCurrentLiveEdge();
                const updatedValues = { ...this._lastValidSliderValues };
                
                // Actualizar solo los valores que pueden cambiar durante pausa
                updatedValues.liveEdge = liveEdge;
                updatedValues.liveEdgeOffset = this._pausedProgressDatum ? 
                    Math.max(0, (liveEdge - this._pausedProgressDatum) / 1000) : 
                    updatedValues.liveEdgeOffset;
                updatedValues.isPaused = this._isPaused;
                updatedValues.isBuffering = this._isBuffering;
                
                this.log('Using cached slider values during invalid state', 'debug');
                return updatedValues;
            }
            
            return this._getInvalidSliderValues();
        }

        const { minimumValue, maximumValue } = this._getSliderBounds();
        const progress = this._getProgressValue();
        const liveEdge = this._getCurrentLiveEdge();
        const range = maximumValue - minimumValue;
        
        // Validación adicional para evitar valores inválidos
        if (range <= 0 || progress < minimumValue || progress > maximumValue) {
            this.log('Invalid slider values detected', 'warn', {
                minimumValue,
                maximumValue,
                progress,
                range
            });
            
            // Si tenemos valores anteriores válidos, usarlos
            if (this._lastValidSliderValues) {
                const updatedValues = { ...this._lastValidSliderValues };
                updatedValues.isPaused = this._isPaused;
                updatedValues.isBuffering = this._isBuffering;
                return updatedValues;
            }
            
            return this._getInvalidSliderValues();
        }

        // Crear los valores del slider
        const sliderValues: SliderValues = {
            minimumValue,
            maximumValue,
            progress,
            percentProgress: range > 0 ? Math.max(0, Math.min(1, (progress - minimumValue) / range)) : 0,
            liveEdge,
            percentLiveEdge: range > 0 && liveEdge !== null ? 
                Math.max(0, Math.min(1, (liveEdge - minimumValue) / range)) : 0,
            progressDatum: this._getProgressDatum(),
            liveEdgeOffset: this._getLiveEdgeOffset(),
            canSeekToEnd: true,
            isProgramLive: this._isProgramCurrentlyLive()
        };
        
        // Guardar estos valores como los últimos válidos conocidos
        this._lastValidSliderValues = { ...sliderValues };
        
        return sliderValues;
    }

    setDVRWindowSeconds(seconds: number): void {
        if (seconds <= 0) {
            this.log('setDVRWindowSeconds: Invalid window size', 'warn');
            return;
        }

        const wasNull = this._initialTimeWindowSeconds === null;
        this.log(`setDVRWindowSeconds: ${seconds}s${wasNull ? ' (initial)' : ' (updated)'}`, 'info');

        if (wasNull) {
            this._initializeDVRWindow(seconds);
            this._updateLiveEdgePosition();
            this.getCurrentProgramInfo().catch(console.error);
        } else {
            // Si ya teníamos ventana, actualizar el tamaño
            this._initialTimeWindowSeconds = seconds;
        }

        this._emitProgressUpdate();
    }

    setEndStreamDate(timestamp: number | null): void {
        this._endStreamDate = timestamp;
        this.log(`End stream date set to: ${timestamp ? new Date(timestamp).toISOString() : 'null'}`, 'info');
        this._emitProgressUpdate();
    }

    async setPlaybackType(playbackType: DVR_PLAYBACK_TYPE, program: any = null): Promise<void> {
        if (!this._isValidState()) {
            this.log('goToLive: Invalid state', 'warn');
            return;
        }

        this.log('goToLive', 'info');
        this._isLiveEdgePosition = true;
        
        // Si estamos pausados, actualizar la posición pausada al live edge
        if (this._isPaused || this._isBuffering) {
            this._pausedProgressDatum = this._getCurrentLiveEdge();
        }
        
        const liveEdgePlayerTime = this._seekableRange.end;
        this._handleSeekTo(liveEdgePlayerTime);
    }

    seekToTime(time: number): void {
        if (!this._isValidState()) {
            this.log('seekToTime: Invalid state', 'warn');
            return;
        }

        this.log(`seekToTime called with: ${time} (mode: ${this._playbackType})`, 'debug');
        
        this._setManualSeeking(true);

        if (this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST && this._currentProgram) {
            this._handlePlaylistSeek(time);
        } else {
            this._seekTo(time);
        }
    }

    reset(): void {
        this.log('Resetting DVR progress manager', 'info');
        
        super.reset();
        
        // Reset específico del DVR
        this._pausedProgressDatum = null;
        this._isLiveEdgePosition = true;
        this._currentProgram = null;
        this._lastProgressForEPG = null;
        this._epgRetryCount.clear();
        this._isManualSeeking = false;
        this._pendingInitialSeek = false;
        this._lastValidSliderValues = null; // Limpiar valores guardados
        
        // Limpiar timers
        if (this._pauseUpdateInterval) {
            clearInterval(this._pauseUpdateInterval);
            this._pauseUpdateInterval = null;
        }
        
        if (this._manualSeekTimeout) {
            clearTimeout(this._manualSeekTimeout);
            this._manualSeekTimeout = null;
        }
        
        // IMPORTANTE: NO resetear _windowStartTimestamp, _initializationTimestamp ni _initialTimeWindowSeconds
        // ya que estos definen la ventana DVR teórica original que necesitamos mantener
        
        this.setPlaybackType(DVR_PLAYBACK_TYPE.WINDOW);
    }

    // ========================================
    // MÉTODOS PRIVADOS - CORE DVR
    // ========================================

    private _initializeDVRWindow(seconds: number): void {
        const now = Date.now();
        this._initialTimeWindowSeconds = seconds;
        this._initializationTimestamp = now;
        // El inicio teórico de la ventana (puede no coincidir con lo que el player tiene disponible)
        this._windowStartTimestamp = now - (seconds * 1000);
        
        this.log(`DVR Window initialized (theoretical):`, 'info', {
            windowSize: seconds,
            theoreticalWindowStart: new Date(this._windowStartTimestamp).toISOString(),
            initTime: new Date(now).toISOString(),
            note: 'Actual player window may differ - will use seekableRange when available'
        });
    }

    private _getCurrentWindowSizeSeconds(): number {
        // Primero, intentar usar el tamaño real del seekableRange del player
        if (this._seekableRange && this._seekableRange.end > 0) {
            const playerWindowSize = this._seekableRange.end - this._seekableRange.start;
            
            // Si hay una discrepancia significativa con la ventana teórica, loguearlo
            if (this._initialTimeWindowSeconds && this._initializationTimestamp) {
                const realTimeElapsed = (Date.now() - this._initializationTimestamp) / 1000;
                const theoreticalSize = this._initialTimeWindowSeconds + realTimeElapsed;
                const discrepancy = Math.abs(theoreticalSize - playerWindowSize);
                
                if (discrepancy > 60) { // Más de 1 minuto de diferencia
                    this.log(`Window size discrepancy detected`, 'warn', {
                        playerWindow: playerWindowSize,
                        theoreticalWindow: theoreticalSize,
                        difference: discrepancy,
                        note: 'Using player window as source of truth'
                    });
                }
            }
            
            return playerWindowSize;
        }
        
        // Si no hay datos del player, calcular el tamaño teórico
        if (!this._initialTimeWindowSeconds || !this._initializationTimestamp) {
            return 0;
        }
        
        // La ventana teórica crece naturalmente con el tiempo real
        const realTimeElapsed = (Date.now() - this._initializationTimestamp) / 1000;
        const theoreticalSize = this._initialTimeWindowSeconds + realTimeElapsed;
        
        this.log(`Using theoretical window size (no player data): ${theoreticalSize}s`, 'debug');
        return theoreticalSize;
    }

    private _getWindowStartTimestamp(): number {
        // IMPORTANTE: Usar el seekableRange del player como fuente de verdad
        // El player puede tener menos contenido disponible que la ventana teórica
        const liveEdge = this._getCurrentLiveEdge();
        
        if (this._seekableRange && this._seekableRange.end > 0) {
            // Si tenemos datos del player, usar su rango real
            // seekableRange.end - seekableRange.start = ventana real disponible
            const actualWindowSize = this._seekableRange.end - this._seekableRange.start;
            return liveEdge - (actualWindowSize * 1000);
        }
        
        // Fallback: usar la ventana teórica si no hay datos del player
        const windowSize = this._getCurrentWindowSizeSeconds();
        return liveEdge - (windowSize * 1000);
    }

    private _getCurrentLiveEdge(): number {
        const now = Date.now();
        return this._endStreamDate ? Math.min(now, this._endStreamDate) : now;
    }

    private _getProgressDatum(): number {
        // Si estamos pausados y tenemos una posición congelada válida, usarla
        if (this._pausedProgressDatum !== null && this._pausedProgressDatum > 0 && (this._isPaused || this._isBuffering)) {
            return this._pausedProgressDatum;
        }
        
        // Validar que tenemos datos suficientes para calcular
        if (!this._isValidState() || this._currentTime < 0) {
            // Si tenemos una posición pausada anterior, mantenerla
            if (this._pausedProgressDatum !== null && this._pausedProgressDatum > 0) {
                return this._pausedProgressDatum;
            }
            
            // Como fallback, devolver el live edge si está disponible
            const liveEdge = this._getCurrentLiveEdge();
            if (liveEdge > 0) {
                return liveEdge;
            }
            
            return 0;
        }
        
        // IMPORTANTE: Usar el seekableRange real del player, no la ventana teórica
        const liveEdge = this._getCurrentLiveEdge();
        
        // El player nos da currentTime relativo al inicio de SU ventana
        // Y seekableRange nos dice cuál es el tamaño real de esa ventana
        if (this._seekableRange && this._seekableRange.end > 0) {
            // Calcular el inicio real basado en lo que el player tiene disponible
            const playerWindowSize = this._seekableRange.end - this._seekableRange.start;
            const realWindowStart = liveEdge - (playerWindowSize * 1000);
            
            // currentTime es relativo al inicio del seekableRange
            const adjustedCurrentTime = this._currentTime - this._seekableRange.start;
            
            // Validar que el resultado sea razonable
            const result = realWindowStart + (adjustedCurrentTime * 1000);
            if (result > 0 && result <= liveEdge) {
                return result;
            }
        }
        
        // Fallback al cálculo original si no hay seekableRange válido
        const windowStart = this._getWindowStartTimestamp();
        const fallbackResult = windowStart + (this._currentTime * 1000);
        
        // Validar que el resultado sea razonable
        if (fallbackResult > 0 && fallbackResult <= liveEdge) {
            return fallbackResult;
        }
        
        // Como último recurso, devolver el live edge
        return liveEdge;
    }

    private _getLiveEdgeOffset(): number {
        if (!this._isValidState()) {
            return 0;
        }
        
        const liveEdge = this._getCurrentLiveEdge();
        const progress = this._getProgressDatum();
        return Math.max(0, (liveEdge - progress) / 1000);
    }

    private _timestampToPlayerTime(timestamp: number): number {
        // Si tenemos seekableRange del player, usar su ventana real
        if (this._seekableRange && this._seekableRange.end > 0) {
            const liveEdge = this._getCurrentLiveEdge();
            const playerWindowSize = this._seekableRange.end - this._seekableRange.start;
            const realWindowStart = liveEdge - (playerWindowSize * 1000);
            
            // Convertir timestamp a tiempo del player
            const playerTime = Math.max(0, (timestamp - realWindowStart) / 1000);
            
            // Ajustar al rango del seekableRange
            return this._seekableRange.start + playerTime;
        }
        
        // Fallback al cálculo original
        const windowStart = this._getWindowStartTimestamp();
        return Math.max(0, (timestamp - windowStart) / 1000);
    }

    // ========================================
    // GESTIÓN DE PAUSAS
    // ========================================

    private _handlePauseTransition(wasPaused: boolean, isPaused: boolean): void {
        if (!wasPaused && isPaused) {
            // Entrando en pausa
            // La captura de _pausedProgressDatum ya se hizo en updatePlayerData
            
            this.log('Entering pause state', 'debug', {
                pausedAt: this._pausedProgressDatum ? new Date(this._pausedProgressDatum).toISOString() : 'not captured',
                currentOffset: this._pausedProgressDatum ? this._getLiveEdgeOffset() : 'unknown'
            });
            
            // Iniciar timer para actualizar el UI durante la pausa
            this._startPauseUpdateTimer();
            
        } else if (wasPaused && !isPaused) {
            // Saliendo de pausa: descongelar la posición
            this.log('Exiting pause state', 'debug', {
                wasAt: this._pausedProgressDatum ? new Date(this._pausedProgressDatum).toISOString() : 'unknown'
            });
            
            this._pausedProgressDatum = null;
            
            // Detener timer de pausa
            this._stopPauseUpdateTimer();
        }
    }

    private _startPauseUpdateTimer(): void {
        if (this._pauseUpdateInterval) return;
        
        // Actualizar cada segundo durante la pausa para que el UI refleje el offset creciente
        this._pauseUpdateInterval = setInterval(() => {
            // Verificar si hemos perdido el live edge por estar pausados mucho tiempo
            if (this._isLiveEdgePosition) {
                const offset = this._getLiveEdgeOffset();
                if (offset >= LIVE_EDGE_TOLERANCE) {
                    this._isLiveEdgePosition = false;
                    this.log('Lost live edge position during pause', 'debug', { offset });
                }
            }
            
            // Emitir actualización para que el UI se actualice
            this._emitProgressUpdate();
        }, 1000);
    }

    private _stopPauseUpdateTimer(): void {
        if (this._pauseUpdateInterval) {
            clearInterval(this._pauseUpdateInterval);
            this._pauseUpdateInterval = null;
        }
    }

    // ========================================
    // MÉTODOS DE BOUNDS Y VALORES
    // ========================================

    private _getSliderBounds(): { minimumValue: number; maximumValue: number } {
        const liveEdge = this._getCurrentLiveEdge();
        
        switch (this._playbackType) {
            case DVR_PLAYBACK_TYPE.PROGRAM:
                const programStart = this._currentProgram?.startDate || 
                    this._getWindowStartTimestamp();
                return { 
                    minimumValue: programStart, 
                    maximumValue: liveEdge 
                };
                
            case DVR_PLAYBACK_TYPE.PLAYLIST:
                if (!this._currentProgram) {
                    return this._getWindowBounds();
                }
                return {
                    minimumValue: this._currentProgram.startDate,
                    maximumValue: this._currentProgram.endDate
                };
                
            case DVR_PLAYBACK_TYPE.WINDOW:
            default:
                return this._getWindowBounds();
        }
    }

    private _getWindowBounds(): { minimumValue: number; maximumValue: number } {
        const liveEdge = this._getCurrentLiveEdge();
        
        // Usar el tamaño real de la ventana del player si está disponible
        if (this._seekableRange && this._seekableRange.end > 0) {
            const playerWindowSize = this._seekableRange.end - this._seekableRange.start;
            const windowStart = liveEdge - (playerWindowSize * 1000);
            
            this.log(`Window bounds from player: ${windowStart} - ${liveEdge} (${playerWindowSize}s)`, 'debug');
            
            return { 
                minimumValue: windowStart, 
                maximumValue: liveEdge 
            };
        }
        
        // Fallback al cálculo teórico
        const windowStart = this._getWindowStartTimestamp();
        return { 
            minimumValue: windowStart, 
            maximumValue: liveEdge 
        };
    }

    private _getProgressValue(): number {
        return this._getProgressDatum();
    }

    private _getInvalidSliderValues(): SliderValues {
        return {
            minimumValue: 0,
            maximumValue: 1,
            progress: 0,
            percentProgress: 0,
            liveEdge: null,
            percentLiveEdge: 0,
            progressDatum: null,
            liveEdgeOffset: null,
            canSeekToEnd: false,
            isProgramLive: false
        };
    }

    // ========================================
    // GESTIÓN DE LIVE EDGE Y PROGRAMAS
    // ========================================

    private _updateLiveEdgePosition(): void {
        if (!this._isValidState() || this._isManualSeeking) {
            return;
        }

        const wasLiveEdge = this._isLiveEdgePosition;
        
        // Método 1: Si tenemos seekableRange, usar la diferencia directa del player
        if (this._seekableRange && this._seekableRange.end > 0) {
            const offsetFromPlayerEnd = this._seekableRange.end - this._currentTime;
            this._isLiveEdgePosition = offsetFromPlayerEnd <= LIVE_EDGE_TOLERANCE;
            
            if (wasLiveEdge !== this._isLiveEdgePosition) {
                this.log(`Live edge position changed: ${wasLiveEdge} → ${this._isLiveEdgePosition} (player offset: ${offsetFromPlayerEnd}s)`, 'debug');
            }
            return;
        }
        
        // Método 2: Fallback al cálculo por timestamps
        const offsetInSeconds = this._getLiveEdgeOffset();
        this._isLiveEdgePosition = offsetInSeconds <= LIVE_EDGE_TOLERANCE;
        
        if (wasLiveEdge !== this._isLiveEdgePosition) {
            this.log(`Live edge position changed: ${wasLiveEdge} → ${this._isLiveEdgePosition} (timestamp offset: ${offsetInSeconds}s)`, 'debug');
        }
    }

    private _isProgramCurrentlyLive(): boolean {
        if (!this._isLiveEdgePosition) {
            return false;
        }

        if (this._currentProgram) {
            const now = Date.now();
            return this._currentProgram.endDate > now;
        }

        return this._isLiveEdgePosition;
    }

    private _setManualSeeking(isSeeking: boolean): void {
        this._isManualSeeking = isSeeking;
        
        if (this._manualSeekTimeout) {
            clearTimeout(this._manualSeekTimeout);
            this._manualSeekTimeout = null;
        }
        
        if (isSeeking) {
            // Timeout de seguridad por si no se llama el complete
            this._manualSeekTimeout = setTimeout(() => {
                this._isManualSeeking = false;
                this.log('Manual seeking timeout - resuming normal operation', 'debug');
            }, 3000);
        }
        
        this.log(`Manual seeking: ${isSeeking}`, 'debug');
    }

    // ========================================
    // MÉTODOS DE PLAYLIST
    // ========================================

    private _handlePlaylistSeek(timestamp: number): void {
        if (!this._currentProgram) return;
        
        const { startDate, endDate } = this._currentProgram;
        const liveEdge = this._getCurrentLiveEdge();
        const maxAvailable = Math.min(endDate, liveEdge);
        
        // Validar límites
        timestamp = Math.max(startDate, Math.min(maxAvailable, timestamp));
        
        // Convertir a tiempo del player
        const playerTime = this._timestampToPlayerTime(timestamp);
        
        // Actualizar live edge position
        const offset = (liveEdge - timestamp) / 1000;
        this._isLiveEdgePosition = offset <= LIVE_EDGE_TOLERANCE;
        
        this._seekTo(playerTime);
    }

    // ========================================
    // EPG Y CALLBACKS
    // ========================================

    async getCurrentProgramInfo(): Promise<any | null> {
        if (!this._dvrCallbacks.getEPGProgramAt || !this._isValidState()) {
            return null;
        }

        const timestamp = this._getProgressDatum();
        
        if (this._dvrCallbacks.onEPGRequest) {
            this._dvrCallbacks.onEPGRequest(timestamp);
        }

        try {
            this._currentProgram = await this._dvrCallbacks.getEPGProgramAt(timestamp);
            this._epgRetryCount.delete(timestamp);
            return this._currentProgram;
        } catch (error) {
            this._handleEPGError(timestamp, error);
            return null;
        }
    }

    private _checkSignificantProgressChange(): void {
        if (!this._dvrCallbacks.onEPGRequest || this._playbackType !== DVR_PLAYBACK_TYPE.WINDOW) {
            return;
        }

        const currentProgress = this._getProgressDatum();
        
        if (this._lastProgressForEPG === null) {
            this._lastProgressForEPG = currentProgress;
            return;
        }

        const progressDiff = Math.abs(currentProgress - this._lastProgressForEPG) / 1000;
        
        if (progressDiff >= PROGRESS_SIGNIFICANT_CHANGE) {
            this.log(`Significant progress change: ${progressDiff}s`, 'debug');
            this._lastProgressForEPG = currentProgress;
            this._dvrCallbacks.onEPGRequest(currentProgress);
        }
    }

    private async _checkProgramChange(): Promise<void> {
        if (!this._currentProgram || !this._dvrCallbacks.getEPGProgramAt) return;

        const currentProgress = this._getProgressDatum();
        
        if (currentProgress >= this._currentProgram.endDate) {
            try {
                const nextProgram = await this._dvrCallbacks.getEPGProgramAt(currentProgress);
                if (nextProgram && nextProgram.id !== this._currentProgram.id) {
                    const previousProgram = this._currentProgram;
                    this._currentProgram = nextProgram;

                    if (this._dvrCallbacks.onProgramChange) {
                        this._dvrCallbacks.onProgramChange({
                            previousProgram,
                            currentProgram: nextProgram
                        });
                    }
                }
            } catch (error) {
                this.log('Error checking program change', 'error', error);
            }
        }
    }

    private _handleEPGError(timestamp: number, error: any): void {
        const retryCount = this._epgRetryCount.get(timestamp) || 0;
        
        if (retryCount < EPG_RETRY_DELAYS.length) {
            const delay = EPG_RETRY_DELAYS[retryCount];
            this._epgRetryCount.set(timestamp, retryCount + 1);
            
            this.log(`EPG retry ${retryCount + 1} in ${delay}ms`, 'info');
            setTimeout(() => {
                this.getCurrentProgramInfo();
            }, delay);
        } else {
            this.log('EPG max retries reached', 'error');
            if (this._dvrCallbacks.onEPGError) {
                this._dvrCallbacks.onEPGError({ timestamp, error, retryCount });
            }
            this._epgRetryCount.delete(timestamp);
        }
    }

    /**
     * Obtiene información de debugging sobre el estado actual
     */
    getDebugInfo(): string {
        const playerWindowSize = this._seekableRange ? 
            this._seekableRange.end - this._seekableRange.start : 0;
        
        const theoreticalWindowSize = this._initialTimeWindowSeconds && this._initializationTimestamp ?
            this._initialTimeWindowSeconds + ((Date.now() - this._initializationTimestamp) / 1000) : 0;
        
        const formatSeconds = (s: number): string => {
            const hours = Math.floor(s / 3600);
            const minutes = Math.floor((s % 3600) / 60);
            const seconds = Math.floor(s % 60);
            if (hours > 0) {
                return `${hours}h${minutes}m${seconds}s`;
            }
            return `${minutes}m${seconds}s`;
        };
        
        const liveEdgeOffset = this._isValidState() ? this._getLiveEdgeOffset() : 0;
        
        const info = [
            `=== DVR Progress Manager Debug ===`,
            `Player Window: ${playerWindowSize.toFixed(0)}s (${formatSeconds(playerWindowSize)})`,
            `Theoretical Window: ${theoreticalWindowSize.toFixed(0)}s (${formatSeconds(theoreticalWindowSize)})`,
            `Window Discrepancy: ${Math.abs(theoreticalWindowSize - playerWindowSize).toFixed(0)}s`,
            `Current Time: ${this._currentTime.toFixed(1)}s / ${(this._seekableRange?.end || 0).toFixed(1)}s`,
            `Live Edge Position: ${this._isLiveEdgePosition}`,
            `Live Edge Offset: ${liveEdgeOffset.toFixed(1)}s`,
            `Mode: ${this._playbackType}`,
            `Paused: ${this._isPaused} | Buffering: ${this._isBuffering}`,
            `Valid State: ${this._isValidState()}`,
            `=================================`
        ];
        
        return info.join('\n');
    }

    // ========================================
    // MÉTODOS DE COMPATIBILIDAD (OPCIONALES)
    // ========================================
    
    /**
     * Método de compatibilidad para notificar pausas manualmente.
     * NO ES NECESARIO si updatePlayerData recibe isPaused correctamente.
     * @deprecated Usar updatePlayerData con isPaused: true
     */
    notifyManualPause(isPaused: boolean): void {
        this.log(`notifyManualPause called (deprecated): ${isPaused}`, 'debug');
        // Simular una actualización con el estado de pausa
        this.updatePlayerData({
            currentTime: this._currentTime,
            seekableRange: this._seekableRange,
            isPaused: isPaused,
            isBuffering: this._isBuffering
        });
    }

    // ========================================
    // MÉTODOS PÚBLICOS DE NAVEGACIÓN
    // ========================================

    goToProgramStart(): void {
        if (!this._isValidState() || !this._currentProgram) {
            this.log('goToProgramStart: Invalid state or no program', 'warn');
            return;
        }

        this.log(`goToProgramStart to: ${this._currentProgram.startDate}`, 'info');
        this._isLiveEdgePosition = false;
        
        if (this._isPaused || this._isBuffering) {
            this._pausedProgressDatum = this._currentProgram.startDate;
        }
        
        const playerTime = this._timestampToPlayerTime(this._currentProgram.startDate);
        this._handleSeekTo(playerTime);
    }

    async setPlaybackType(playbackType: DVR_PLAYBACK_TYPE, program: any = null): Promise<void> {
        if (!this._isValidState()) {
            throw new Error('setPlaybackType: Invalid state');
        }

        const previousType = this._playbackType;
        this.log(`setPlaybackType: ${previousType} -> ${playbackType}`, 'info');

        this._playbackType = playbackType;

        // Obtener programa si es necesario
        if ((playbackType === DVR_PLAYBACK_TYPE.PROGRAM || 
             playbackType === DVR_PLAYBACK_TYPE.PLAYLIST) && 
            !program && this._dvrCallbacks.getEPGProgramAt) {
            
            try {
                const timestamp = this._getProgressDatum();
                program = await this._dvrCallbacks.getEPGProgramAt(timestamp);
            } catch (error) {
                this.log('Error getting program for mode change', 'error', error);
            }
        }

        this._currentProgram = program;

        // Acciones específicas por modo
        switch (playbackType) {
            case DVR_PLAYBACK_TYPE.PROGRAM:
                if (this._currentProgram) {
                    this.goToProgramStart();
                }
                break;
            case DVR_PLAYBACK_TYPE.WINDOW:
                this.goToLive();
                break;
            // PLAYLIST mantiene posición actual
        }

        if (this._dvrCallbacks.onModeChange) {
            this._dvrCallbacks.onModeChange({
                previousType,
                playbackType,
                program: this._currentProgram
            });
        }

        this._emitProgressUpdate();
    }

    updateDVRCallbacks(callbacks: {
        getEPGProgramAt?: ((timestamp: number) => Promise<any>) | null;
        onModeChange?: ((data: ModeChangeData) => void) | null;
        onProgramChange?: ((data: ProgramChangeData) => void) | null;
        onEPGRequest?: ((timestamp: number) => void) | null;
        onEPGError?: ((data: EPGErrorData) => void) | null;
    }): void {
        Object.assign(this._dvrCallbacks, callbacks);
        const updatedCount = Object.keys(callbacks).length;
        this.log(`Updated ${updatedCount} DVR callbacks`, 'debug');
    }

    checkInitialSeek(mode: 'player' | 'cast'): void {
        this.log(`checkInitialSeek for ${mode}`, 'info');
        
        // Forzar ir al live edge al iniciar
        if (this._isValidState()) {
            // En iOS necesitamos un pequeño delay
            if (mode === 'player' && Platform.OS === 'ios') {
                setTimeout(() => {
                    this.goToLive();
                }, 300);
            } else {
                // En Android y cast, ir inmediatamente
                this.goToLive();
            }
        } else {
            this.log('checkInitialSeek: Invalid state, queuing for when ready', 'warn');
            // Marcar que necesitamos ir al live cuando estemos listos
            this._pendingInitialSeek = true;
        }
    }

    // ========================================
    // MÉTODOS PROTEGIDOS SOBRESCRITOS
    // ========================================

    protected _isValidState(): boolean {
        const baseValid = super._isValidState();
        
        // Detectar si esto es realmente contenido VOD mal configurado
        if (this._duration && this._duration < 36000) { // Menos de 10 horas
            this.log('WARNING: DVRProgressManager being used with VOD content', 'error', {
                duration: this._duration,
                seekableRange: this._seekableRange,
                suggestion: 'Use VODProgressManager instead'
            });
        }
        
        const dvrValid = this._initialTimeWindowSeconds !== null && this._initialTimeWindowSeconds > 0;
        return baseValid && dvrValid;
    }

    protected _buildProgressData(): DVRProgressUpdateData {
        const sliderValues = this.getSliderValues();
        
        // Si tenemos duración y es pequeña (menos de 10 horas), probablemente es VOD mal configurado
        if (this._duration && this._duration < 36000) {
            this.log('Warning: DVRProgressManager being used with VOD-like content', 'warn', {
                duration: this._duration,
                seekableRange: this._seekableRange
            });
        }
        
        return {
            ...sliderValues,
            isPaused: this._isPaused,
            isBuffering: this._isBuffering,
            isLiveEdgePosition: this._isLiveEdgePosition,
            playbackType: this._playbackType,
            currentProgram: this._currentProgram,
            windowCurrentSizeInSeconds: this._getCurrentWindowSizeSeconds(),
            canSeekToEnd: true
        };
    }

    protected _seekTo(playerTime: number): void {
        const clampedTime = Math.max(
            this._seekableRange.start, 
            Math.min(this._seekableRange.end, playerTime)
        );
        
        if (clampedTime !== playerTime) {
            this.log(`Player time clamped: ${playerTime} → ${clampedTime}`, 'debug');
        }
        
        this._handleSeekTo(clampedTime);
    }

    protected _handleSeekTo(playerTime: number): void {
        this.log(`DVR seeking to: ${playerTime}`, 'debug');
        
        if (this._options.onSeekRequest) {
            this._options.onSeekRequest(playerTime);
        }
        
        this._emitProgressUpdate();
    }

    // ========================================
    // GETTERS
    // ========================================

    get isDVRWindowConfigured(): boolean {
        return this._initialTimeWindowSeconds !== null && this._initialTimeWindowSeconds > 0;
    }

    get currentTimeWindowSeconds(): number {
        // Devuelve el tamaño REAL de la ventana (del player si está disponible, teórico si no)
        return this._getCurrentWindowSizeSeconds();
    }

    get totalPauseTime(): number {
        // Para compatibilidad - ya no rastreamos el tiempo total de pausa
        // pero podemos devolver 0 o el offset actual si estamos pausados
        if (this._isPaused || this._isBuffering) {
            return Math.floor(this._getLiveEdgeOffset());
        }
        return 0;
    }

    get isLiveEdgePosition(): boolean {
        return this._isLiveEdgePosition;
    }

    get playbackType(): DVR_PLAYBACK_TYPE {
        return this._playbackType;
    }

    get currentProgram(): any | null {
        return this._currentProgram;
    }

    get streamStartTime(): number {
        // Para compatibilidad - ahora usamos _windowStartTimestamp
        return this._windowStartTimestamp;
    }

    get endStreamDate(): number | null {
        return this._endStreamDate;
    }

    get currentLiveEdge(): number | null {
        return this._isValidState() ? this._getCurrentLiveEdge() : null;
    }

    get progressDatum(): number | null {
        return this._isValidState() ? this._getProgressDatum() : null;
    }

    get liveEdgeOffset(): number | null {
        return this._isValidState() ? this._getLiveEdgeOffset() : null;
    }

    get isLiveStream(): boolean {
        return true; // DVR siempre es stream en directo
    }

    get isProgramLive(): boolean {
        return this._isValidState() ? this._isProgramCurrentlyLive() : false;
    }

    getStats(): any {
        const baseStats = super.getStats();
        
        // Calcular ventana real del player
        const playerWindowSize = this._seekableRange ? 
            this._seekableRange.end - this._seekableRange.start : 0;
        
        // Calcular ventana teórica
        const theoreticalWindowSize = this._initialTimeWindowSeconds && this._initializationTimestamp ?
            this._initialTimeWindowSeconds + ((Date.now() - this._initializationTimestamp) / 1000) : 0;
        
        return {
            ...baseStats,
            initialTimeWindowSeconds: this._initialTimeWindowSeconds,
            currentTimeWindowSeconds: this._getCurrentWindowSizeSeconds(),
            playerWindowSize: playerWindowSize,
            theoreticalWindowSize: theoreticalWindowSize,
            windowDiscrepancy: Math.abs(theoreticalWindowSize - playerWindowSize),
            totalPauseTime: this.totalPauseTime,
            windowStartTimestamp: this._getWindowStartTimestamp(),
            streamStartTime: this._windowStartTimestamp, // compatibilidad
            isLiveEdgePosition: this._isLiveEdgePosition,
            isLiveStream: this.isLiveStream,
            isProgramLive: this.isProgramLive,
            playbackType: this._playbackType,
            currentProgram: this._currentProgram,
            endStreamDate: this._endStreamDate,
            currentLiveEdge: this.currentLiveEdge,
            progressDatum: this.progressDatum,
            liveEdgeOffset: this.liveEdgeOffset,
            pausedAt: this._pausedProgressDatum
        };
    }

    // ========================================
    // DESTRUCCIÓN
    // ========================================

    destroy(): void {
        this.log('Destroying DVR progress manager', 'info');
        super.destroy();
        
        if (this._manualSeekTimeout) {
            clearTimeout(this._manualSeekTimeout);
            this._manualSeekTimeout = null;
        }
        
        if (this._pauseUpdateInterval) {
            clearInterval(this._pauseUpdateInterval);
            this._pauseUpdateInterval = null;
        }
        
        this._isManualSeeking = false;
        this._epgRetryCount.clear();
        this._lastValidSliderValues = null;
    }
}