import { Platform } from 'react-native';
import { type SliderValues } from '../../types/types';
import { BaseProgressManager } from './BaseProgressManager';
import { EPG_RETRY_DELAYS, LIVE_EDGE_TOLERANCE, PROGRESS_SIGNIFICANT_CHANGE } from './constants';
import { type DVRProgressManagerOptions, type DVRProgressUpdateData, type DVRUpdatePlayerData, type EPGErrorData, type ModeChangeData, type ProgramChangeData } from './types/dvr';
import { DVR_PLAYBACK_TYPE } from './types/enums';

export class DVRProgressManagerClass extends BaseProgressManager {
    // Estado específico del DVR
    private _initialTimeWindowSeconds: number | null = null;
    private _currentTimeWindowSeconds: number | null = null;
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

    // Manual seeking sin timeout - se gestiona desde eventos de slider
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
        
        this.log(`DVR window configured: ${!!options.dvrWindowSeconds}`, 'info');
        
        // Configuración específica del DVR
        this._initialTimeWindowSeconds = options.dvrWindowSeconds || null;
        this._currentTimeWindowSeconds = this._initialTimeWindowSeconds;
        this._playbackType = options.playbackType || DVR_PLAYBACK_TYPE.WINDOW;
        
        // Callbacks específicos del DVR
        this._dvrCallbacks = {
            getEPGProgramAt: options.getEPGProgramAt,
            onModeChange: options.onModeChange,
            onProgramChange: options.onProgramChange,
            onEPGRequest: options.onEPGRequest,
            onEPGError: options.onEPGError
        };

        // NO inicializar streamStartTime aquí
        // Solo se inicializa cuando recibamos el windowSeconds real

        this.log(`DVR initialized - waiting for window size and player data`, 'info');
    }

    /*
     *  Implementación de métodos abstractos
     *
     */

    async updatePlayerData(data: DVRUpdatePlayerData): Promise<void> {
        this.log('updatePlayerData', 'debug', { 
            currentTime: data.currentTime, 
            seekableRange: data.seekableRange,
            hasReceivedDataBefore: this._hasReceivedPlayerData
        });

        if (!data) return;

        const wasValidBefore = this._isValidState();
        
        // Usar la validación y actualización base
        this._updateBasicPlayerData(data);

        // Gestión de pausas DVR (funcionalidad base)
        this._updateDVRPauseTracking(data.isPaused, data.isBuffering);

        const isValidNow = this._isValidState();
        
        this.log('State validation after update', 'debug', {
            wasValidBefore,
            isValidNow,
            currentTime: this._currentTime,
            seekableRange: this._seekableRange,
            hasReceivedPlayerData: this._hasReceivedPlayerData
        });

        // Solo ejecutar lógica compleja si el estado es válido
        if (isValidNow) {
            this.log('Executing DVR-specific logic', 'debug');
            
            // Actualizar ventana en cada update
            this._updateTimeWindow();
            
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

            // Marcar como inicializado cuando tengamos window + datos + streamStart
            if (!this._isInitialized && this._initialTimeWindowSeconds && this._streamStartTime > 0) {
                this._markAsInitialized();
            }
        }

        // Si el estado se volvió válido, obtener programa inicial
        if (!wasValidBefore && isValidNow && !this._currentProgram) {
            this.log('Getting initial program info', 'debug');
            this.getCurrentProgramInfo().catch(console.error);
        }

        // Siempre emitir update
        this.log('About to emit progress update', 'debug', {
            isValidState: isValidNow,
            hasCallback: !!this._options.onProgressUpdate
        });
        
        this._emitProgressUpdate();
    }

    getSliderValues(): SliderValues {
        this.log('getSliderValues called', 'debug', {
            isValidState: this._isValidState(),
            currentTime: this._currentTime,
            seekableRange: this._seekableRange,
            currentTimeWindowSeconds: this._currentTimeWindowSeconds
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
                isProgramLive: false, // Sin datos válidos, no podemos estar viendo en directo
                isLiveEdgePosition: false // Sin datos válidos, no podemos estar en live edge
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
        
        // Limpiar interval de pausa si existe
        if (this._pauseUpdateInterval) {
            clearInterval(this._pauseUpdateInterval);
            this._pauseUpdateInterval = null;
        }
        
        // Recalcular ventana actual basada en tiempo transcurrido
        if (this._streamStartTime && this._initialTimeWindowSeconds) {
            const elapsed = (Date.now() - this._streamStartTime) / 1000;
            this._currentTimeWindowSeconds = Math.max(this._initialTimeWindowSeconds, elapsed);
        }
        
        this.setPlaybackType(DVR_PLAYBACK_TYPE.WINDOW);
    }

    getStats(): any {
        const baseStats = super.getStats();
        
        return {
            ...baseStats,
            initialTimeWindowSeconds: this._initialTimeWindowSeconds,
            currentTimeWindowSeconds: this._currentTimeWindowSeconds,
            totalPauseTime: this.totalPauseTime,
            isLiveEdgePosition: this._isLiveEdgePosition,
            isLiveStream: this.isLiveStream,
            isProgramLive: this.isProgramLive,
            playbackType: this._playbackType,
            currentProgram: this._currentProgram,
            streamStartTime: this._streamStartTime,
            endStreamDate: this._endStreamDate,
            currentLiveEdge: this.currentLiveEdge,
            progressDatum: this.progressDatum,
            liveEdgeOffset: this.liveEdgeOffset
        };
    }

    /*
     *  Métodos públicos específicos del DVR
     *
     */

    // Método específico para pausas manuales (al arrastrar slider)
    public notifyManualPause(isPaused: boolean): void {
        this.log(`Manual pause notification: ${isPaused}`, 'info');
        
        if (isPaused && !this._isPaused && !this._isBuffering) {
            // Iniciando pausa manual - forzar inicio del timer
            this.log('Force starting pause timer for manual pause', 'info');
            this._pauseStartTime = Date.now();
            
            if (this._isValidState()) {
                this._frozenProgressDatum = this._playerTimeToTimestamp(this._currentTime);
                this.log('MANUAL PAUSE - Starting internal timer and freezing progressDatum', 'info', {
                    frozenTimestamp: new Date(this._frozenProgressDatum).toISOString(),
                    currentTime: this._currentTime
                });
            }
            
            // Timer obligatorio cada 1 segundo
            this._pauseUpdateInterval = setInterval(() => {
                const pausedFor = this._pauseStartTime > 0 ? (Date.now() - this._pauseStartTime) / 1000 : 0;
                this.log('MANUAL PAUSE TIMER TICK - emitting progress update', 'info', {
                    pausedForSeconds: pausedFor.toFixed(1),
                    currentOffset: this._getLiveEdgeOffset().toFixed(1)
                });
                
                if (this._isLiveEdgePosition && this._pauseStartTime > 0) {
                    const pausedDuration = (Date.now() - this._pauseStartTime) / 1000;
                    if (pausedDuration >= LIVE_EDGE_TOLERANCE) {
                        this._isLiveEdgePosition = false;
                        this.log('Left live edge due to manual pause duration', 'info', { pausedDuration });
                    }
                }
                
                this._emitProgressUpdate();
            }, 1000);
            
        } else if (!isPaused && (this._isPaused || this._isBuffering)) {
            // Terminando pausa manual - limpiar timer
            this.log('Manual resume - stopping timer', 'info');
            
            if (this._pauseStartTime > 0) {
                const pauseDuration = Date.now() - this._pauseStartTime;
                this._totalPauseTime += pauseDuration;
                this._pauseStartTime = 0;
                
                this.log('MANUAL RESUME - stopping timer and unfreezing progressDatum', 'info', {
                    pauseDurationSeconds: (pauseDuration / 1000).toFixed(1),
                    totalPauseTimeSeconds: this.totalPauseTime
                });
            }
            
            this._frozenProgressDatum = undefined;
            
            if (this._pauseUpdateInterval) {
                clearInterval(this._pauseUpdateInterval);
                this._pauseUpdateInterval = null;
            }
        }
    }

    updateDVRCallbacks(callbacks: {
        getEPGProgramAt?: ((timestamp: number) => Promise<any>) | null;
        onModeChange?: ((data: ModeChangeData) => void) | null;
        onProgramChange?: ((data: ProgramChangeData) => void) | null;
        onEPGRequest?: ((timestamp: number) => void) | null;
        onEPGError?: ((data: EPGErrorData) => void) | null;
    }): void {
        if ('getEPGProgramAt' in callbacks) {
            this._dvrCallbacks.getEPGProgramAt = callbacks.getEPGProgramAt;
        }
        if ('onModeChange' in callbacks) {
            this._dvrCallbacks.onModeChange = callbacks.onModeChange;
        }
        if ('onProgramChange' in callbacks) {
            this._dvrCallbacks.onProgramChange = callbacks.onProgramChange;
        }
        if ('onEPGRequest' in callbacks) {
            this._dvrCallbacks.onEPGRequest = callbacks.onEPGRequest;
        }
        if ('onEPGError' in callbacks) {
            this._dvrCallbacks.onEPGError = callbacks.onEPGError;
        }
        
        const updatedCallbacks = Object.keys(callbacks);
        this.log(`updateDVRCallbacks - Updated ${updatedCallbacks.length} DVR callbacks`, 'debug');
    }

    checkInitialSeek(mode: 'player' | 'cast'): void {
        this.log(`checkInitialSeek for ${mode}`, 'info');
        
        if (mode === 'player' && Platform.OS === 'ios') {
            setTimeout(() => {
                this.goToLive();
            }, 300);
        }
    }

    setDVRWindowSeconds(seconds: number): void {
        if (seconds <= 0) {
            this.log('setDVRWindowSeconds: Invalid window size', 'warn');
            return;
        }

        const wasNull = this._initialTimeWindowSeconds === null;
        const now = Date.now();
        
        this.log(`setDVRWindowSeconds: ${seconds}s${wasNull ? ' (initial)' : ' (updated)'}`, 'info');

        this._initialTimeWindowSeconds = seconds;
        this._currentTimeWindowSeconds = seconds;
        
        // windowStart = ahora - tamaño_ventana
        this._streamStartTime = now - (seconds * 1000);
        
        this.log(`Stream window established - Start: ${new Date(this._streamStartTime).toISOString()}, Size: ${seconds}s`, 'info');

        if (wasNull) {
            // Primera vez que recibimos el tamaño de ventana
            this._updateLiveEdgePosition();
            this.getCurrentProgramInfo().catch(console.error);
        }

        this._emitProgressUpdate();
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

        this.log('goToLive - moving to live edge', 'info');
        this._isLiveEdgePosition = true;
        
        // Si estamos pausados, congelar en el live edge actual
        if (this._isPaused || this._isBuffering) {
            this._frozenProgressDatum = this._getCurrentLiveEdge();
            this.log('Frozen position updated to current live edge during pause', 'debug', {
                frozenTimestamp: new Date(this._frozenProgressDatum).toISOString()
            });
        }
        
        // Ir al final del seekableRange (live edge en términos del player)
        const liveEdgePlayerTime = this._seekableRange.end;
        this._handleSeekTo(liveEdgePlayerTime);
    }

    // Manual seeking usa eventos de slider
    public setManualSeeking(isManualSeeking: boolean): void {
        this._isManualSeeking = isManualSeeking;
        this.log(`Manual seeking: ${isManualSeeking} (via slider events)`, 'debug');
    }

    seekToTime(time: number): void {
        if (!this._isValidState()) {
            this.log('seekToTime: Invalid state - operation queued until ready', 'warn');
            return;
        }

        this.log(`seekToTime called with: ${time} (mode: ${this._playbackType})`, 'debug');

        // Lógica específica para modo PLAYLIST
        if (this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST && this._currentProgram) {
            this._handlePlaylistSeek(time);
            return;
        }

        // Lógica para otros modos (WINDOW, PROGRAM)
        this._handleStandardSeek(time);
    }

    async getCurrentProgramInfo(): Promise<any | null> {
        this.log(`getCurrentProgramInfo - EPG available: ${!!this._dvrCallbacks.getEPGProgramAt}`, 'debug');
        
        if (!this._dvrCallbacks.getEPGProgramAt || !this._isValidState()) {
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
        return this._initialTimeWindowSeconds !== null && this._initialTimeWindowSeconds > 0;
    }

    get currentTimeWindowSeconds(): number | null {
        return this._currentTimeWindowSeconds;
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
        return this._isLiveStream();
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
        const hasWindow = this._initialTimeWindowSeconds !== null && this._initialTimeWindowSeconds > 0;
        const hasStreamStart = this._streamStartTime > 0;
        
        const isValid = baseValid && hasWindow && hasStreamStart;
        
        if (!isValid) {
            this.log(`DVR validation failed - base: ${baseValid}, window: ${hasWindow}, streamStart: ${hasStreamStart}`, 'debug');
        }
        
        return isValid;
    }

    protected _handleSeekTo(playerTime: number): void {
        this.log(`DVR seeking to: ${playerTime}`, 'debug');
        
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
            windowCurrentSizeInSeconds: this._currentTimeWindowSeconds,
            canSeekToEnd: true
        };
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

    private _updateTimeWindow(): void {
        if (!this._initialTimeWindowSeconds || this._streamStartTime <= 0) return;

        const elapsed = (Date.now() - this._streamStartTime) / 1000;
        const newWindowSize = Math.max(this._initialTimeWindowSeconds, elapsed);
        
        // Solo log si hay cambio significativo
        if (Math.abs(newWindowSize - (this._currentTimeWindowSeconds || 0)) > 1) {
            this.log(`Window growing: ${this._currentTimeWindowSeconds?.toFixed(1)}s → ${newWindowSize.toFixed(1)}s`, 'debug');
        }
        
        this._currentTimeWindowSeconds = newWindowSize;
    }

    private _updateDVRPauseTracking(isPaused: boolean, isBuffering: boolean): void {
        const wasStalled = this._isPaused || this._isBuffering;
        const isStalled = isPaused || isBuffering;

        if (!wasStalled && isStalled) {
            // Iniciando pausa/buffering
            this._pauseStartTime = Date.now();
            
            if (this._isValidState()) {
                // Congelar timestamp actual
                this._frozenProgressDatum = this._playerTimeToTimestamp(this._currentTime);
                this.log('PAUSED - Starting internal timer and freezing progressDatum', 'info', {
                    frozenTimestamp: new Date(this._frozenProgressDatum).toISOString(),
                    currentTime: this._currentTime,
                    pauseStartTime: this._pauseStartTime
                });
            }
            
            // Timer obligatorio cada 1 segundo en pausa
            this.log('Starting pause timer - will emit updates every 1 second', 'info');
            this._pauseUpdateInterval = setInterval(() => {
                const pausedFor = this._pauseStartTime > 0 ? (Date.now() - this._pauseStartTime) / 1000 : 0;
                this.log('PAUSE TIMER TICK - emitting progress update', 'info', {
                    pausedForSeconds: pausedFor.toFixed(1),
                    currentOffset: this._getLiveEdgeOffset().toFixed(1)
                });
                
                // Verificar si dejamos live edge durante pausa
                if (this._isLiveEdgePosition && this._pauseStartTime > 0) {
                    const pausedDuration = (Date.now() - this._pauseStartTime) / 1000;
                    if (pausedDuration >= LIVE_EDGE_TOLERANCE) {
                        this._isLiveEdgePosition = false;
                        this.log('Left live edge due to pause duration', 'info', { pausedDuration });
                    }
                }
                
                // Emitir update para mostrar crecimiento del offset
                this._emitProgressUpdate();
            }, 1000);
            
        } else if (wasStalled && !isStalled) {
            // Terminando pausa/buffering
            if (this._pauseStartTime > 0) {
                const pauseDuration = Date.now() - this._pauseStartTime;
                this._totalPauseTime += pauseDuration;
                
                this.log('RESUMED - stopping timer and unfreezing progressDatum', 'info', {
                    pauseDurationSeconds: (pauseDuration / 1000).toFixed(1),
                    totalPauseTimeSeconds: this.totalPauseTime,
                    finalOffset: this._getLiveEdgeOffset().toFixed(1)
                });
                
                this._pauseStartTime = 0;
            }
            
            // Descongelar progressDatum
            this._frozenProgressDatum = undefined;
            
            // Limpiar timer obligatorio
            if (this._pauseUpdateInterval) {
                this.log('Stopping pause timer', 'info');
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

        // Calcular offset basado en seekableRange (tiempo del player)
        const playerOffset = Math.abs(this._seekableRange.end - this._currentTime);
        const wasLiveEdge = this._isLiveEdgePosition;
        this._isLiveEdgePosition = playerOffset <= LIVE_EDGE_TOLERANCE;

        console.log(`[DANI] _updateLiveEdgePosition :: seekableRange end ${this._seekableRange.end}, currentTime: ${this._currentTime}, playerOffset: ${playerOffset}, wasLiveEdge: ${wasLiveEdge}, isLiveEdgePosition: ${this._isLiveEdgePosition}, LIVE_EDGE_TOLERANCE: ${LIVE_EDGE_TOLERANCE}`);
        
        if (wasLiveEdge !== this._isLiveEdgePosition) {
            this.log(`Live edge position changed: ${wasLiveEdge} → ${this._isLiveEdgePosition} (player offset: ${playerOffset}s)`, 'debug');
        }
    }

    private _updateLiveEdgePositionForTimestamp(timestamp: number): void {
        const liveEdge = this._getCurrentLiveEdge();
        const offset = (liveEdge - timestamp) / 1000; // Convertir a segundos
        this._isLiveEdgePosition = offset <= LIVE_EDGE_TOLERANCE;
        
        console.log(`[DANI] _updateLiveEdgePositionForTimestamp :: liveEdge ${liveEdge}, timestamp: ${timestamp}, offset: ${offset}, isLiveEdgePosition: ${this._isLiveEdgePosition}, LIVE_EDGE_TOLERANCE: ${LIVE_EDGE_TOLERANCE}`);
        
        this.log(`Live edge position for timestamp ${timestamp}: ${this._isLiveEdgePosition} (offset: ${offset}s)`, 'debug');
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

        // Convertir timestamp a tiempo del player usando el programa como referencia
        const playerTime = this._playlistTimestampToPlayerTime(timestamp);
        
        this.log(`PLAYLIST seek converted: ${timestamp} → ${playerTime}s (player time)`, 'debug');

        // Actualizar estado antes del seek
        this._updateLiveEdgePositionForTimestamp(timestamp);
        
        // Ejecutar seek
        this._seekTo(playerTime);
    }

    private _handleStandardSeek(time: number): void {
        // Para WINDOW y PROGRAM, usar la lógica original
        this._seekTo(time);
    }

    private _playlistTimestampToPlayerTime(timestamp: number): number {
        if (!this._currentProgram) {
            this.log('playlistTimestampToPlayerTime: No current program', 'error');
            return 0;
        }

        const programStart = this._currentProgram.startDate;
        const liveEdge = this._getCurrentLiveEdge();
        const windowStart = liveEdge - (this._currentTimeWindowSeconds! * 1000);
        
        // En PLAYLIST, el tiempo del player se calcula desde el inicio de la ventana DVR,
        // no desde el inicio del programa
        const playerTime = Math.max(0, (timestamp - windowStart) / 1000);
        
        this.log(`PLAYLIST conversion: timestamp=${timestamp}, programStart=${programStart}, windowStart=${windowStart}, playerTime=${playerTime}`, 'debug');
        
        return playerTime;
    }

    private _getSliderBounds(): { minimumValue: number; maximumValue: number } {
        const liveEdge = this._getCurrentLiveEdge();
        
        this.log('_getSliderBounds called', 'debug', {
            playbackType: this._playbackType,
            liveEdge,
            currentProgram: this._currentProgram?.title,
            currentTimeWindowSeconds: this._currentTimeWindowSeconds
        });
        
        switch (this._playbackType) {
            case DVR_PLAYBACK_TYPE.PROGRAM:
                const programStart = this._currentProgram?.startDate || liveEdge - (this._currentTimeWindowSeconds! * 1000);
                const result1 = { minimumValue: programStart, maximumValue: liveEdge };
                this.log('_getSliderBounds PROGRAM result', 'debug', result1);
                return result1;
                
            case DVR_PLAYBACK_TYPE.PLAYLIST:
                if (!this._currentProgram) {
                    return this._getWindowBounds();
                }
                const result2 = {
                    minimumValue: this._currentProgram.startDate,
                    maximumValue: this._currentProgram.endDate
                };
                this.log('_getSliderBounds PLAYLIST result', 'debug', result2);
                return result2;
                
            case DVR_PLAYBACK_TYPE.WINDOW:
            default:
                return this._getWindowBounds();
        }
    }

    private _getWindowBounds(): { minimumValue: number; maximumValue: number } {
        const liveEdge = this._getCurrentLiveEdge();
        const windowStart = liveEdge - (this._currentTimeWindowSeconds! * 1000);
        const result = { minimumValue: windowStart, maximumValue: liveEdge };
        
        this.log('_getWindowBounds calculated', 'debug', {
            liveEdge,
            currentTimeWindowSeconds: this._currentTimeWindowSeconds,
            windowStart,
            result
        });
        
        return result;
    }

    private _getProgressValue(): number {
        const result = this._getProgressDatum();
        
        this.log('_getProgressValue calculated', 'debug', {
            result,
            playbackType: this._playbackType
        });
        
        return result;
    }

    private _getCurrentLiveEdge(): number {
        const now = Date.now();

        // Validación con seekableRange.end si tenemos datos válidos
        if (this._streamStartTime > 0 && this._seekableRange && this._seekableRange.end > 0) {
            // Convertir seekableRange.end a timestamp absoluto
            const seekableEndTimestamp = this._streamStartTime + (this._seekableRange.end * 1000);
            
            return seekableEndTimestamp;
        }
        return this._endStreamDate ? Math.min(now, this._endStreamDate) : now;
    }

    private _getProgressDatum(): number {
        // Si estamos pausados/buffering, usar el valor congelado
        if (this._frozenProgressDatum !== undefined && (this._isPaused || this._isBuffering)) {
            return this._frozenProgressDatum;
        }
        
        // Cálculo básico del timestamp: windowStart + (currentTime * 1000)
        return this._playerTimeToTimestamp(this._currentTime);
    }

    private _getLiveEdgeOffset(): number {
        const liveEdge = this._getCurrentLiveEdge(); // Siempre Date.now() (o endStreamDate)
        const progress = this._getProgressDatum(); // Timestamp actual o congelado
        const offsetSeconds = Math.max(0, (liveEdge - progress) / 1000);
        
        this.log('_getLiveEdgeOffset calculated', 'debug', {
            liveEdge: new Date(liveEdge).toISOString(),
            progress: new Date(progress).toISOString(),
            offsetSeconds,
            isPaused: this._isPaused,
            isBuffering: this._isBuffering
        });
    
        return offsetSeconds;
    }

    private _isLiveStream(): boolean {
        // DVR siempre es un stream en directo (puede tener contenido DVR)
        return true;
    }

    private _isProgramCurrentlyLive(): boolean {
        // Para determinar si el programa específico está en directo:
        // 1. Debemos estar cerca del live edge
        // 2. Si tenemos programa actual, debe estar actualmente transmitiéndose
        
        const liveEdgeOffset = this._getLiveEdgeOffset();
        const isNearLiveEdge = liveEdgeOffset <= LIVE_EDGE_TOLERANCE;
        
        if (!isNearLiveEdge) {
            // Si no estamos cerca del live edge, definitivamente no estamos viendo en directo
            return false;
        }

        // Si tenemos información del programa actual
        if (this._currentProgram) {
            const now = Date.now();
            const programEnd = this._currentProgram.endDate;
            
            // El programa está en directo si aún no ha terminado Y estamos cerca del live edge
            return programEnd > now && isNearLiveEdge;
        }

        // Si no tenemos info del programa pero estamos cerca del live edge, 
        // asumimos que estamos viendo contenido en directo
        return isNearLiveEdge;
    }

    private _playerTimeToTimestamp(playerTime: number): number {
        if (!this._isValidState()) {
            return Date.now();
        }
        
        // windowStart = liveEdge - currentTimeWindowSeconds
        const liveEdge = this._getCurrentLiveEdge();
        const windowStart = liveEdge - (this._currentTimeWindowSeconds! * 1000);
        const timestamp = windowStart + (playerTime * 1000);
        
        this.log('_playerTimeToTimestamp', 'debug', {
            playerTime,
            windowStart: new Date(windowStart).toISOString(),
            timestamp: new Date(timestamp).toISOString()
        });
        
        return timestamp;
    }

    private _timestampToPlayerTime(timestamp: number): number {
        if (!this._streamStartTime) return 0;
        
        // En modo PLAYLIST, usar conversión específica
        if (this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST && this._currentProgram) {
            return this._playlistTimestampToPlayerTime(timestamp);
        }
        
        // Lógica original para WINDOW y PROGRAM
        const windowStart = this._getCurrentLiveEdge() - (this._currentTimeWindowSeconds! * 1000);
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

    /*
     *  Destrucción específica del DVR
     *
     */

    destroy(): void {
        this.log('Destroying DVR progress manager', 'info');
        super.destroy();
        
        // Limpiar recursos específicos del DVR
        this._epgRetryCount.clear();
        this._isManualSeeking = false;
        
        if (this._pauseUpdateInterval) {
            clearInterval(this._pauseUpdateInterval);
            this._pauseUpdateInterval = null;
        }
    }
}