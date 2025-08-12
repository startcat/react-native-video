import { Platform } from 'react-native';
import { type SliderValues } from '../../types/types';
import { BaseProgressManager } from './BaseProgressManager';
import { EPG_RETRY_DELAYS, LIVE_EDGE_TOLERANCE, PROGRESS_SIGNIFICANT_CHANGE } from './constants';
import { type DVRProgressManagerOptions, type DVRProgressUpdateData, type DVRUpdatePlayerData, type EPGErrorData, type ModeChangeData, type ProgramChangeData } from './types/dvr';
import { DVR_PLAYBACK_TYPE } from './types/enums';

export class DVRProgressManagerClass extends BaseProgressManager {
    // Estado específico del DVR
    private _initialTimeWindowSeconds: number | null = null; // Solo referencia del CMS
    private _streamStartTime: number = 0;
    private _endStreamDate: number | null = null;

    // Estado de reproducción DVR
    private _isLiveEdgePosition: boolean = true;
    private _playbackType: DVR_PLAYBACK_TYPE = DVR_PLAYBACK_TYPE.WINDOW;
    private _currentProgram: any | null = null;
    private _lastProgressForEPG: number | null = null;

    // Gestión de pausas específica del DVR
    private _pauseStartTime: number = 0;
    private _totalPauseTime: number = 0;
    private _frozenProgressDatum?: number;
    private _pauseUpdateInterval: ReturnType<typeof setTimeout> | null = null;

    // Gestión de errores EPG
    private _epgRetryCount: Map<number, number> = new Map();
    private _epgRetryTimeouts: Map<number, ReturnType<typeof setTimeout>> = new Map();

    // Manual seeking (CORREGIDO: sin timeout automático)
    private _isManualSeeking: boolean = false;

    // Callbacks específicos del DVR
    private _dvrCallbacks: {
        getEPGProgramAt?: ((timestamp: number) => Promise<any>) | null;
        onModeChange?: ((data: ModeChangeData) => void) | null;
        onProgramChange?: ((data: ProgramChangeData) => void) | null;
        onEPGRequest?: ((timestamp: number) => void) | null;
        onEPGError?: ((data: EPGErrorData) => void) | null;
    } = {};

    constructor(options: DVRProgressManagerOptions = {}) {
        super(options);
        
        // Configuración específica del DVR
        this._initialTimeWindowSeconds = options.dvrWindowSeconds || null; // Solo referencia
        this._playbackType = options.playbackType || DVR_PLAYBACK_TYPE.WINDOW;
        
        // Callbacks específicos del DVR
        this._dvrCallbacks = {
            getEPGProgramAt: options.getEPGProgramAt,
            onModeChange: options.onModeChange,
            onProgramChange: options.onProgramChange,
            onEPGRequest: options.onEPGRequest,
            onEPGError: options.onEPGError
        };

        this.log(`DVR initialized - waiting for seekableRange data from player`, 'info');
    }

    /*
     *  Implementación de métodos abstractos
     *
     */

    async updatePlayerData(data: DVRUpdatePlayerData): Promise<void> {
        this.log('updatePlayerData', 'debug', { 
            currentTime: data.currentTime, 
            seekableRange: data.seekableRange,
            hasReceivedDataBefore: this._hasReceivedPlayerData,
            isManualSeeking: this._isManualSeeking
        });

        if (!data) return;

        const wasValidBefore = this._isValidState();
        
        // Gestión de pausas ANTES de actualizar estado básico
        this._updateDVRPauseTracking(data.isPaused, data.isBuffering);
        
        // Usar la validación y actualización base
        this._updateBasicPlayerData(data);

        const isValidNow = this._isValidState();
        
        // Calcular ventana desde seekableRange (fuente de verdad)
        if (isValidNow) {
            this._updateTimeWindowFromSeekableRange();
        }

        this.log('State validation after update', 'debug', {
            wasValidBefore,
            isValidNow,
            currentTime: this._currentTime,
            seekableRange: this._seekableRange,
            hasReceivedPlayerData: this._hasReceivedPlayerData,
            isManualSeeking: this._isManualSeeking
        });

        // Solo ejecutar lógica compleja si el estado es válido
        if (isValidNow) {
            this.log('Executing DVR-specific logic', 'debug');
            
            // Solo actualizar live edge position si NO estamos en seek manual
            if (!this._isManualSeeking) {
                this._updateLiveEdgePosition();
                this._checkSignificantProgressChange();
            } else {
                this.log('Skipping live edge update during manual seeking', 'debug');
            }

            // EPG en modo PLAYLIST/PROGRAM
            if ((this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST || 
                 this._playbackType === DVR_PLAYBACK_TYPE.PROGRAM) && 
                this._dvrCallbacks.getEPGProgramAt) {
                this._checkProgramChange().catch(console.error);
            }

            // Marcar como inicializado cuando todo esté listo
            if (!this._isInitialized) {
                this._initializeStreamTimesFromSeekableRange();
                this._markAsInitialized();
            }
        }

        // Si el estado se volvió válido, obtener programa inicial
        if (!wasValidBefore && isValidNow && !this._currentProgram) {
            this.log('Getting initial program info', 'debug');
            this.getCurrentProgramInfo().catch(console.error);
        }

        // Mostrar información de debug con formato solicitado (solo si no estamos pausados)
        if (!this._isPaused && !this._isBuffering) {
            this._logProgressInfo();
        }
        
        // Siempre emitir update
        this.log('About to emit progress update', 'debug', {
            isValidState: isValidNow,
            hasCallback: !!this._options.onProgressUpdate,
            isManualSeeking: this._isManualSeeking
        });
        
        this._emitProgressUpdate();
    }

    getSliderValues(): SliderValues {
        this.log('getSliderValues called', 'debug', {
            isValidState: this._isValidState(),
            currentTime: this._currentTime,
            seekableRange: this._seekableRange
        });

        if (!this._isValidState()) {
            this.log('getSliderValues: Invalid state', 'warn');
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
                isProgramLive: false,
                isLiveEdgePosition: false
            };
        }

        const { minimumValue, maximumValue } = this._getSliderBounds();
        const progress = this._getProgressValue();
        const liveEdge = this._getCurrentLiveEdge();
        const range = maximumValue - minimumValue;

        const result = {
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
            isProgramLive: this._isProgramCurrentlyLive(),
            isLiveEdgePosition: this._isLiveEdgePosition
        };

        this.log('getSliderValues final result', 'debug', {
            result,
            calculations: {
                range,
                progressCalc: `(${progress} - ${minimumValue}) / ${range}`,
                liveEdgeCalc: liveEdge !== null ? `(${liveEdge} - ${minimumValue}) / ${range}` : 'null'
            }
        });

        return result;
    }

    reset(): void {
        this.log('Resetting DVR progress manager', 'info');
        
        // Reset del estado base
        super.reset();
        
        // Reset específico del DVR
        this._totalPauseTime = 0;
        this._pauseStartTime = 0;
        this._isLiveEdgePosition = true;
        this._frozenProgressDatum = undefined;
        this._currentProgram = null;
        this._lastProgressForEPG = null;
        this._epgRetryCount.clear();
        this._isManualSeeking = false;
        
        // Limpiar timeouts de EPG
        this._clearEPGRetryTimeouts();
        
        // Limpiar interval de pausa si existe
        if (this._pauseUpdateInterval) {
            clearInterval(this._pauseUpdateInterval);
            this._pauseUpdateInterval = null;
        }
        
        this.setPlaybackType(DVR_PLAYBACK_TYPE.WINDOW);
    }

    /*
     *  Métodos públicos específicos del DVR
     *
     */

    updateDVRCallbacks(callbacks: {
        getEPGProgramAt?: ((timestamp: number) => Promise<any>) | null;
        onModeChange?: ((data: ModeChangeData) => void) | null;
        onProgramChange?: ((data: ProgramChangeData) => void) | null;
        onEPGRequest?: ((timestamp: number) => void) | null;
        onEPGError?: ((data: EPGErrorData) => void) | null;
    }): void {
        Object.assign(this._dvrCallbacks, callbacks);
        
        const updatedCallbacks = Object.keys(callbacks);
        this.log(`updateDVRCallbacks - Updated ${updatedCallbacks.length} DVR callbacks`, 'debug');
    }

    setDVRWindowSeconds(seconds: number): void {
        if (seconds <= 0) {
            this.log('setDVRWindowSeconds: Invalid window size', 'warn');
            return;
        }

        // Solo actualizar referencia - NO bloquea funcionalidad
        this._initialTimeWindowSeconds = seconds;
        this.log(`setDVRWindowSeconds: ${seconds}s (reference only, seekableRange is source of truth)`, 'info');

        // Si ya tenemos datos válidos, emitir update
        if (this._isValidState()) {
            this._emitProgressUpdate();
        }
    }

    checkInitialSeek(mode: 'player' | 'cast'): void {
        this.log(`checkInitialSeek for ${mode}`, 'info');
        
        if (mode === 'player' && Platform.OS === 'ios') {
            setTimeout(() => {
                this.goToLive();
            }, 300);
        }
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

        // Emitir callbacks
        if (this._dvrCallbacks.onModeChange) {
            this._dvrCallbacks.onModeChange({
                previousType,
                playbackType,
                program: this._currentProgram
            });
        }

        this._emitProgressUpdate();
    }

    goToProgramStart(): void {
        if (!this._isValidState() || !this._currentProgram) {
            this.log('goToProgramStart: Invalid state or no program', 'warn');
            return;
        }

        this.log(`goToProgramStart to: ${this._currentProgram.startDate}`, 'info');
        this._isLiveEdgePosition = false;
        
        // Si estamos pausados, actualizar la posición congelada al inicio del programa
        if (this._isPaused || this._isBuffering) {
            this._frozenProgressDatum = this._currentProgram.startDate;
            this.log('Updated frozen position to program start during pause', 'debug', this._frozenProgressDatum);
        }
        
        const playerTime = this._timestampToPlayerTime(this._currentProgram.startDate);
        this._handleSeekTo(playerTime);
    }

    goToLive(): void {
        if (!this._isValidState()) {
            this.log('goToLive: Invalid state', 'warn');
            return;
        }

        this.log('goToLive', 'info');
        this._isLiveEdgePosition = true;
        
        // Si estamos pausados, actualizar la posición congelada al live edge
        if (this._isPaused || this._isBuffering) {
            this._frozenProgressDatum = this._getCurrentLiveEdge();
            this.log('Updated frozen position to live edge during pause', 'debug', this._frozenProgressDatum);
        }
        
        const liveEdge = this._getCurrentLiveEdgePlayerTime();
        this._handleSeekTo(liveEdge);
    }

    seekToTime(time: number): void {
        if (!this._isValidState()) {
            this.log('seekToTime: Invalid state - operation queued until ready', 'warn');
            return;
        }

        this.log(`seekToTime called with: ${time} (mode: ${this._playbackType})`, 'debug');

        // NOTA: Manual seeking se controla desde eventos de slider externos
        // No establecemos _isManualSeeking aquí

        // time es un timestamp, necesitamos convertir a playerTime
        // En todos los modos, time viene como timestamp absoluto
        
        // Lógica específica para modo PLAYLIST
        if (this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST && this._currentProgram) {
            this._handlePlaylistSeek(time); // time = timestamp para PLAYLIST
            return;
        }

        // Para WINDOW y PROGRAM, convertir timestamp a playerTime
        const playerTime = this._timestampToPlayerTime(time);
        this.log(`Converted timestamp ${time} to playerTime ${playerTime}`, 'debug');
        
        this._handleStandardSeek(playerTime); // Ahora pasamos playerTime correctamente
    }

    // Métodos públicos para eventos de slider (SIN timeout automático)
    onSliderSlidingStart(): void {
        this.log('Slider sliding started - entering manual seeking mode', 'debug');
        this._isManualSeeking = true;
    }

    onSliderSlidingComplete(): void {
        this.log('Slider sliding completed - exiting manual seeking mode', 'debug');
        this._isManualSeeking = false;
        
        // Actualizar live edge position inmediatamente después del seek
        this._updateLiveEdgePosition();
    }

    async getCurrentProgramInfo(): Promise<any | null> {
        this.log(`getCurrentProgramInfo - EPG available: ${!!this._dvrCallbacks.getEPGProgramAt}`, 'debug');
        
        // Verificar que no hemos sido destruidos
        if (!this._dvrCallbacks.getEPGProgramAt || !this._isValidState() || !this._epgRetryTimeouts) {
            this.log('getCurrentProgramInfo: Manager destroyed or invalid state', 'debug');
            return null;
        }

        const timestamp = this._getProgressDatum();
        this.log(`EPG request for timestamp: ${timestamp}`, 'debug');

        if (this._dvrCallbacks.onEPGRequest) {
            this._dvrCallbacks.onEPGRequest(timestamp);
        }

        try {
            this._currentProgram = await this._dvrCallbacks.getEPGProgramAt(timestamp);
            this._epgRetryCount.delete(timestamp);
            this._epgRetryTimeouts.delete(timestamp);
            return this._currentProgram;
        } catch (error) {
            this.log('EPG error', 'error', error);
            this._handleEPGError(timestamp, error);
            return null;
        }
    }

    /*
     *  Getters específicos del DVR
     *
     */

    get isDVRWindowConfigured(): boolean {
        return this._isValidState(); // Basado en seekableRange, no en CMS
    }

    get currentTimeWindowSeconds(): number | null {
        return this._isValidState() ? this._seekableRange.end - this._seekableRange.start : null;
    }

    get totalPauseTime(): number {
        let total = this._totalPauseTime;
        if ((this._isPaused || this._isBuffering) && this._pauseStartTime > 0) {
            total += (Date.now() - this._pauseStartTime);
        }
        return Math.floor(total / 1000);
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
        return this._streamStartTime;
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

    /*
     *  Métodos protegidos sobrescritos
     *
     */

    protected _isValidState(): boolean {
        const baseValid = super._isValidState();
        // DVR es válido si tenemos seekableRange válido (NO requiere dvrWindowSeconds)
        const dvrValid = this._seekableRange.end > this._seekableRange.start;
        
        if (!baseValid) {
            this.log('DVR validation failed: base state invalid', 'debug');
        } else if (!dvrValid) {
            this.log('DVR validation failed: invalid seekableRange', 'debug');
        }
        
        return baseValid && dvrValid;
    }

    protected _handleSeekTo(playerTime: number): void {
        this.log(`DVR seeking to: ${playerTime}`, 'debug');
        
        // Si estamos pausados, actualizar frozen position inmediatamente
        if (this._isPaused || this._isBuffering) {
            const newTimestamp = this._playerTimeToTimestamp(playerTime);
            this._frozenProgressDatum = newTimestamp;
            this.log('Updated frozen position due to seek during pause', 'info', {
                newPosition: newTimestamp,
                newTime: new Date(newTimestamp).toLocaleTimeString('es-ES')
            });
        }
        
        if (this._options.onSeekRequest) {
            this._options.onSeekRequest(playerTime);
        }
        
        this._emitProgressUpdate();
    }

    protected _buildProgressData(): DVRProgressUpdateData {
        const sliderValues = this.getSliderValues();
        
        return {
            ...sliderValues,
            isPaused: this._isPaused,
            isBuffering: this._isBuffering,
            isLiveEdgePosition: this._isLiveEdgePosition,
            playbackType: this._playbackType,
            currentProgram: this._currentProgram,
            windowCurrentSizeInSeconds: this.currentTimeWindowSeconds,
            canSeekToEnd: true
        };
    }

    protected _emitProgressUpdate(): void {
        if (!this._hasReceivedPlayerData) {
            this.log('_emitProgressUpdate: No player data received yet, skipping', 'debug');
            return;
        }

        // Validar consistencia durante pausas
        if ((this._isPaused || this._isBuffering) && !this._validatePauseConsistency()) {
            this.log('_emitProgressUpdate: Pause values inconsistent, recalculating', 'warn');
            this._recalculatePauseValues();
        }

        if (!this._isValidState()) {
            this.log('_emitProgressUpdate: Invalid state, emitting fallback data', 'warn');
            this._emitFallbackProgressUpdate();
            return;
        }

        try {
            const progressData = this._buildProgressData();
            
            if (this._options.onProgressUpdate) {
                this._options.onProgressUpdate(progressData);
            }
        } catch (error) {
            this.log('_emitProgressUpdate error', 'error', error);
            this._emitFallbackProgressUpdate();
        }
    }

    protected _seekTo(playerTime: number): void {
        // Validar que el tiempo esté dentro del rango válido del seekableRange
        const clampedTime = Math.max(
            this._seekableRange.start, 
            Math.min(this._seekableRange.end, playerTime)
        );
        
        if (clampedTime !== playerTime) {
            this.log(`Player time clamped: ${playerTime} → ${clampedTime} (seekableRange: ${this._seekableRange.start} - ${this._seekableRange.end})`, 'debug');
        }
        
        this.log(`Final seek to player time: ${clampedTime}`, 'debug');
        
        // Ejecutar seek
        this._handleSeekTo(clampedTime);
    }

    /*
     *  Métodos privados específicos del DVR
     *
     */

    // Actualizar ventana desde seekableRange (fuente de verdad)
    private _updateTimeWindowFromSeekableRange(): void {
        const seekableDuration = this._seekableRange.end - this._seekableRange.start;
        
        this.log(`Time window updated from seekableRange: ${seekableDuration}s`, 'debug');
        
        // Opcional: comparar con valor del CMS si está disponible
        if (this._initialTimeWindowSeconds) {
            const difference = Math.abs(seekableDuration - this._initialTimeWindowSeconds);
            if (difference > 10) { // Más de 10 segundos de diferencia
                this.log(`Window size differs from CMS: seekable=${seekableDuration}s vs cms=${this._initialTimeWindowSeconds}s`, 'info');
            }
        }
    }

    // Inicializar tiempos basado en seekableRange
    private _initializeStreamTimesFromSeekableRange(): void {
        const seekableDuration = this._seekableRange.end - this._seekableRange.start;
        const now = Date.now();
        this._streamStartTime = now - (seekableDuration * 1000);
        
        this.log(`Stream times initialized from seekableRange: ${seekableDuration}s`, 'debug');
    }

    // Validar consistencia durante pausas
    private _validatePauseConsistency(): boolean {
        if (!this._frozenProgressDatum) return true;
        
        const liveEdge = this._getCurrentLiveEdge();
        const expectedOffset = (liveEdge - this._frozenProgressDatum) / 1000;
        
        // El offset debe ser positivo y creciente
        const isValid = expectedOffset >= 0;
        
        if (!isValid) {
            this.log(`Pause consistency failed: offset=${expectedOffset}s`, 'warn');
        }
        
        return isValid;
    }

    // Recalcular valores durante pausa
    private _recalculatePauseValues(): void {
        if (this._isValidState()) {
            this._frozenProgressDatum = this._getProgressDatum();
            this.log('Recalculated pause values', 'debug', this._frozenProgressDatum);
        }
    }

    // Log con información de progreso en formato solicitado
    private _logProgressInfo(): void {
        if (!this._isValidState()) return;

        const progressDatum = this._getProgressDatum();
        const liveEdge = this._getCurrentLiveEdge();
        const offsetSeconds = (liveEdge - progressDatum) / 1000;
        
        // Formato de hora local
        const progressTime = new Date(progressDatum);
        const timeStr = progressTime.toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        // Formato de offset -MM:SS
        const offsetMinutes = Math.floor(Math.abs(offsetSeconds) / 60);
        const offsetSecondsRemainder = Math.floor(Math.abs(offsetSeconds) % 60);
        const offsetStr = `-${offsetMinutes.toString().padStart(2, '0')}:${offsetSecondsRemainder.toString().padStart(2, '0')}`;
        
        // Indicar si estamos en pausa
        const statusIcon = (this._isPaused || this._isBuffering) ? '⏸️' : '📺';
        const statusText = this._isPaused ? 'PAUSED' : this._isBuffering ? 'BUFFERING' : 'PLAYING';
        
        this.log(`${statusIcon} Progress: ${timeStr} | Offset: ${offsetStr} | Mode: ${this._playbackType} | Status: ${statusText}`, 'info');
    }

    // Limpiar todos los timeouts de EPG
    private _clearEPGRetryTimeouts(): void {
        for (const [timestamp, timeoutId] of this._epgRetryTimeouts) {
            clearTimeout(timeoutId);
            this.log(`Cleared EPG retry timeout for timestamp: ${timestamp}`, 'debug');
        }
        this._epgRetryTimeouts.clear();
        this._epgRetryCount.clear();
    }

    private _updateDVRPauseTracking(isPaused: boolean, isBuffering: boolean): void {
        const wasStalled = this._isPaused || this._isBuffering;
        const isStalled = isPaused || isBuffering;

        this.log(`Pause tracking: wasStalled=${wasStalled}, isStalled=${isStalled}`, 'debug');

        // Verificar el código exacto del timer de pausa
        if (!wasStalled && isStalled) {

            // CRITICAL: Only start pause tracking if we have valid player data
            if (!this._hasReceivedPlayerData || !this._isValidState()) {
                this.log('⚠️ Skipping pause timer start - no valid player data yet', 'debug');
                this._isPaused = isPaused;
                this._isBuffering = isBuffering;
                return;
            }

            // Iniciando pausa/buffering
            this._pauseStartTime = Date.now();
            if (this._isValidState()) {
                this._frozenProgressDatum = this._getProgressDatum();
                this.log('🔄 PAUSE STARTED - Freezing progressDatum', 'info', {
                    frozenAt: this._frozenProgressDatum,
                    frozenTime: new Date(this._frozenProgressDatum).toLocaleTimeString('es-ES')
                });
            }
            
            // Iniciar timer con mejor logging
            this.log('⏰ Starting pause timer (1 second interval)', 'info');
            this._pauseUpdateInterval = setInterval(() => {
                if (this._pauseStartTime > 0 && (this._isPaused || this._isBuffering)) {
                    const pausedDuration = (Date.now() - this._pauseStartTime) / 1000;
                    
                    this.log(`⏱️ Pause timer tick - duration: ${Math.floor(pausedDuration)}s`, 'debug');
                    
                    // Actualizar liveEdgePosition basado en offset real
                    if (this._isLiveEdgePosition) {
                        const currentOffset = this._getLiveEdgeOffset();
                        if (currentOffset > LIVE_EDGE_TOLERANCE) {
                            this._isLiveEdgePosition = false;
                            this.log(`🔴 Left live edge due to offset: ${currentOffset.toFixed(1)}s > ${LIVE_EDGE_TOLERANCE}s`, 'info');
                        }
                    }
                    
                    // Log cada segundo durante pausa para mostrar crecimiento del offset
                    this._logProgressInfo();
                    
                    // SIEMPRE emitir update durante pausa
                    this._emitProgressUpdate();
                } else {
                    this.log('⏰ Pause timer tick but conditions not met', 'debug', {
                        pauseStartTime: this._pauseStartTime,
                        isPaused: this._isPaused,
                        isBuffering: this._isBuffering
                    });
                }
            }, 1000);
            
        } else if (wasStalled && !isStalled) {
            // Terminando pausa/buffering
            if (this._pauseStartTime > 0) {
                const pauseDuration = (Date.now() - this._pauseStartTime) / 1000;
                this._totalPauseTime += (Date.now() - this._pauseStartTime);
                this._pauseStartTime = 0;
                
                this.log('▶️ PAUSE ENDED', 'info', {
                    pauseDurationSeconds: Math.floor(pauseDuration),
                    totalPauseTimeSeconds: this.totalPauseTime
                });
            }
            this._frozenProgressDatum = undefined;
            this.log('Unfreezing progressDatum', 'debug');
            
            if (this._pauseUpdateInterval) {
                this.log('⏰ Stopping pause timer', 'info');
                clearInterval(this._pauseUpdateInterval);
                this._pauseUpdateInterval = null;
            }
        }
    }

    private _updateLiveEdgePosition(): void {
        if (!this._isValidState()) {
            this._isLiveEdgePosition = false;
            return;
        }

        // No actualizar durante pausas o manual seeking (evita flickering)
        if (this._isPaused || this._isBuffering || this._isManualSeeking) {
            this.log('Skipping live edge position update during pause/buffering/manual seeking', 'debug');
            return;
        }

        const offset = this._seekableRange.end - this._currentTime;
        const wasLiveEdge = this._isLiveEdgePosition;
        this._isLiveEdgePosition = offset <= LIVE_EDGE_TOLERANCE;
        
        if (wasLiveEdge !== this._isLiveEdgePosition) {
            this.log(`Live edge position changed: ${wasLiveEdge} → ${this._isLiveEdgePosition} (offset: ${offset}s)`, 'debug');
        }
    }

    private _handlePlaylistSeek(timestamp: number): void {
        const { startDate, endDate } = this._currentProgram!;
        const liveEdge = this._getCurrentLiveEdge();
        
        this.log(`PLAYLIST seek - Program: ${startDate} - ${endDate}, LiveEdge: ${liveEdge}, Target: ${timestamp}`, 'debug');

        // Validar que el timestamp esté dentro del rango válido del programa
        const maxAvailableTimestamp = Math.min(endDate, liveEdge);
        
        if (timestamp < startDate) {
            this.log(`Seek target before program start, clamping: ${timestamp} → ${startDate}`, 'warn');
            timestamp = startDate;
        } else if (timestamp > maxAvailableTimestamp) {
            this.log(`Seek target beyond available content, clamping: ${timestamp} → ${maxAvailableTimestamp}`, 'warn');
            timestamp = maxAvailableTimestamp;
        }

        // Convertir timestamp a playerTime usando método específico para PLAYLIST
        const playerTime = this._timestampToPlayerTime(timestamp);
        
        this.log(`PLAYLIST seek converted: ${timestamp} → ${playerTime}s (player time)`, 'debug');

        // Actualizar live edge position para el timestamp
        const offsetFromLive = (liveEdge - timestamp) / 1000;
        this._isLiveEdgePosition = offsetFromLive <= LIVE_EDGE_TOLERANCE;
        
        // Ejecutar seek con playerTime
        this._seekTo(playerTime);
    }

    private _handleStandardSeek(playerTime: number): void {
        // Para WINDOW y PROGRAM, playerTime ya está convertido correctamente
        this.log(`Standard seek to playerTime: ${playerTime}`, 'debug');
        this._seekTo(playerTime);
    }

    // Método unificado simple para los 3 modos
    private _getSliderBounds(): { minimumValue: number; maximumValue: number } {
        const liveEdge = this._getCurrentLiveEdge();
        
        this.log('_getSliderBounds called', 'debug', {
            playbackType: this._playbackType,
            liveEdge,
            currentProgram: this._currentProgram?.title
        });
        
        switch (this._playbackType) {
            case DVR_PLAYBACK_TYPE.PROGRAM:
                // Programa específico: del inicio del programa al live edge
                const programStart = this._currentProgram?.startDate || this._getWindowStart();
                const result1 = { minimumValue: programStart, maximumValue: liveEdge };
                this.log('_getSliderBounds PROGRAM result', 'debug', result1);
                return result1;
                
            case DVR_PLAYBACK_TYPE.PLAYLIST:
                // Programa actual completo: inicio a fin del programa
                if (!this._currentProgram) {
                    return this._getWindowBounds();
                }
                const result2 = {
                    minimumValue: this._currentProgram.startDate,
                    maximumValue: this._currentProgram.endDate // Nota: liveEdge puede estar dentro o fuera
                };
                this.log('_getSliderBounds PLAYLIST result', 'debug', result2);
                return result2;
                
            case DVR_PLAYBACK_TYPE.WINDOW:
            default:
                // Ventana completa: windowStart a liveEdge
                return this._getWindowBounds();
        }
    }

    private _getWindowBounds(): { minimumValue: number; maximumValue: number } {
        const liveEdge = this._getCurrentLiveEdge();
        const windowStart = this._getWindowStart();
        const result = { minimumValue: windowStart, maximumValue: liveEdge };
        
        this.log('_getWindowBounds calculated', 'debug', {
            liveEdge,
            windowStart,
            result
        });
        
        return result;
    }

    // Calcular windowStart desde seekableRange (fuente de verdad)
    private _getWindowStart(): number {
        const liveEdge = this._getCurrentLiveEdge();
        const seekableDuration = this._seekableRange.end - this._seekableRange.start;
        return liveEdge - (seekableDuration * 1000);
    }

    private _getProgressValue(): number {
        return this._getProgressDatum();
    }

    private _getCurrentLiveEdge(): number {
        const now = Date.now();
        return this._endStreamDate ? Math.min(now, this._endStreamDate) : now;
    }

    private _getCurrentLiveEdgePlayerTime(): number {
        return this._seekableRange.end;
    }

    private _getProgressDatum(): number {
        if (this._frozenProgressDatum !== undefined && (this._isPaused || this._isBuffering)) {
            return this._frozenProgressDatum;
        }
        return this._playerTimeToTimestamp(this._currentTime);
    }

    private _getLiveEdgeOffset(): number {
        const liveEdge = this._getCurrentLiveEdge();
        const progress = this._getProgressDatum();
        return Math.max(0, (liveEdge - progress) / 1000);
    }

    // Simplificado según regla fundamental
    private _isProgramCurrentlyLive(): boolean {
        if (!this._currentProgram) return false;
        
        // Simple: el programa está en directo si aún no ha terminado
        const now = Date.now();
        return this._currentProgram.endDate > now;
    }

    // Conversión simple y unificada para todos los modos
    private _playerTimeToTimestamp(playerTime: number): number {
        const windowStart = this._getWindowStart();
        return windowStart + (playerTime * 1000);
    }

    // Conversión simple basada en el modo
    private _timestampToPlayerTime(timestamp: number): number {
        if (this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST && this._currentProgram) {
            // En PLAYLIST: timestamp relativo al programa
            const programStart = this._currentProgram.startDate;
            return Math.max(0, (timestamp - programStart) / 1000);
        }
        
        // Para WINDOW y PROGRAM: timestamp relativo a ventana
        const windowStart = this._getWindowStart();
        return Math.max(0, (timestamp - windowStart) / 1000);
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
            this.log('Program ended, checking for next program', 'debug');
            
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

    private async _handleEPGError(timestamp: number, error: any): Promise<void> {
        const retryCount = this._epgRetryCount.get(timestamp) || 0;
        
        if (retryCount < EPG_RETRY_DELAYS.length) {
            const delay = EPG_RETRY_DELAYS[retryCount];
            this._epgRetryCount.set(timestamp, retryCount + 1);
            
            this.log(`EPG retry ${retryCount + 1} in ${delay}ms`, 'info');
            
            // Almacenar timeout para poder limpiarlo después
            const timeoutId = setTimeout(() => {
                // Limpiar el timeout del map cuando se ejecute
                this._epgRetryTimeouts.delete(timestamp);
                
                // Solo reintentar si el manager no ha sido destruido
                if (this._epgRetryTimeouts && this._dvrCallbacks.getEPGProgramAt) {
                    this.getCurrentProgramInfo();
                } else {
                    this.log('EPG retry cancelled - manager destroyed', 'debug');
                }
            }, delay);
            
            this._epgRetryTimeouts.set(timestamp, timeoutId);
            
        } else {
            this.log('EPG max retries reached', 'error');
            if (this._dvrCallbacks.onEPGError) {
                this._dvrCallbacks.onEPGError({ timestamp, error, retryCount });
            }
            this._epgRetryCount.delete(timestamp);
            this._epgRetryTimeouts.delete(timestamp);
        }
    }

    /*
     *  Destrucción específica del DVR
     *
     */

    destroy(): void {
        this.log('Destroying DVR progress manager', 'info');
        super.destroy();
        
        this._isManualSeeking = false;
        
        // Limpiar timeouts EPG pendientes
        this._clearEPGRetryTimeouts();
        
        // Limpiar callbacks para evitar requests después de destrucción
        this._dvrCallbacks = {};
        
        // Limpiar recursos específicos del DVR
        this._epgRetryCount.clear();
        
        if (this._pauseUpdateInterval) {
            clearInterval(this._pauseUpdateInterval);
            this._pauseUpdateInterval = null;
        }
    }
}