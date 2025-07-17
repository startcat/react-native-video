import { Platform } from 'react-native';
import { BaseProgressManager } from './BaseProgressManager';
import { EPG_RETRY_DELAYS, LIVE_EDGE_TOLERANCE, PROGRESS_SIGNIFICANT_CHANGE } from './constants';
import { type DVRProgressManagerOptions, type DVRProgressUpdateData, type DVRSliderValues, type DVRUpdatePlayerData, type EPGErrorData, type ModeChangeData, type ProgramChangeData } from './types/dvr';
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

        // Inicializar tiempo de stream si tenemos ventana
        if (this._initialTimeWindowSeconds) {
            this._initializeStreamTimes();
        }
    }

    /*
     *  Implementación de métodos abstractos
     */

    async updatePlayerData(data: DVRUpdatePlayerData): Promise<void> {
        this.log('updatePlayerData', 'debug', { 
            currentTime: data.currentTime, 
            seekableRange: data.seekableRange 
        });

        if (!data) return;

        const wasValidBefore = this._isValidState();
        
        // Usar la validación y actualización base
        this._updateBasicPlayerData(data);

        // Gestión de pausas específica del DVR
        this._updateDVRPauseTracking(data.isPaused, data.isBuffering);

        // Solo ejecutar lógica compleja si el estado es válido
        const isValidNow = this._isValidState();
        if (isValidNow) {
            this._updateTimeWindow();
            this._updateLiveEdgePosition();
            this._checkSignificantProgressChange();

            // EPG en modo PLAYLIST/PROGRAM
            if ((this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST || 
                 this._playbackType === DVR_PLAYBACK_TYPE.PROGRAM) && 
                this._dvrCallbacks.getEPGProgramAt) {
                this._checkProgramChange().catch(console.error);
            }
        }

        // Si el estado se volvió válido, obtener programa inicial
        if (!wasValidBefore && isValidNow && !this._currentProgram) {
            this.getCurrentProgramInfo().catch(console.error);
        }

        this._emitProgressUpdate();
    }

    getSliderValues(): DVRSliderValues {
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
                canSeekToEnd: false
            };
        }

        const { minimumValue, maximumValue } = this._getSliderBounds();
        const progress = this._getProgressValue();
        const liveEdge = this._getCurrentLiveEdge();
        const range = maximumValue - minimumValue;

        return {
            minimumValue,
            maximumValue,
            progress,
            percentProgress: range > 0 ? Math.max(0, Math.min(1, (progress - minimumValue) / range)) : 0,
            liveEdge,
            percentLiveEdge: range > 0 && liveEdge !== null ? 
                Math.max(0, Math.min(1, (liveEdge - minimumValue) / range)) : 0,
            progressDatum: this._getProgressDatum(),
            liveEdgeOffset: this._getLiveEdgeOffset(),
            canSeekToEnd: true
        };
    }

    reset(): void {
        this.log('Resetting DVR progress manager', 'info');
        
        // Reset del estado base
        this._currentTime = 0;
        this._duration = null;
        this._seekableRange = { start: 0, end: 0 };
        this._isPaused = false;
        this._isBuffering = false;
        
        // Reset específico del DVR
        this._totalPauseTime = 0;
        this._pauseStartTime = 0;
        this._isLiveEdgePosition = true;
        this._frozenProgressDatum = undefined;
        this._currentProgram = null;
        this._lastProgressForEPG = null;
        this._epgRetryCount.clear();
        
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
        
        return {
            initialTimeWindowSeconds: this._initialTimeWindowSeconds,
            currentTimeWindowSeconds: this._currentTimeWindowSeconds,
            totalPauseTime: this.totalPauseTime,
            isLiveEdgePosition: this._isLiveEdgePosition,
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
     */

    // Actualizar callbacks específicos del DVR
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
        this.log(`setDVRWindowSeconds: ${seconds}s${wasNull ? ' (initial)' : ' (updated)'}`, 'info');

        this._initialTimeWindowSeconds = seconds;
        this._currentTimeWindowSeconds = seconds;

        if (wasNull) {
            this._initializeStreamTimes();
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

    /*
     *  Métodos protegidos sobrescritos
     */

    protected _isValidState(): boolean {
        const baseValid = super._isValidState();
        const dvrValid = this._initialTimeWindowSeconds !== null && this._initialTimeWindowSeconds > 0;
        
        if (!dvrValid) {
            this.log('DVR invalid state: no window configured', 'debug');
        }
        
        return baseValid && dvrValid;
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

    /*
     *  Métodos privados específicos del DVR
     */

    private _initializeStreamTimes(): void {
        const now = Date.now();
        this._streamStartTime = now - (this._initialTimeWindowSeconds! * 1000);
        this.log(`Stream initialized, starts at: ${new Date(this._streamStartTime).toISOString()}`, 'debug');
    }

    private _updateDVRPauseTracking(isPaused: boolean, isBuffering: boolean): void {
        const wasStalled = this._isPaused || this._isBuffering;
        const isStalled = isPaused || isBuffering;

        if (!wasStalled && isStalled) {
            // Iniciando pausa/buffering
            this._pauseStartTime = Date.now();
            if (this._isValidState()) {
                this._frozenProgressDatum = this._getProgressDatum();
                this.log('Freezing progressDatum', 'debug', this._frozenProgressDatum);
            }
            
            // Iniciar timer para actualizar progreso cada segundo durante pausa
            this._pauseUpdateInterval = setInterval(() => {
                if (this._isLiveEdgePosition && this._pauseStartTime > 0) {
                    const pausedDuration = (Date.now() - this._pauseStartTime) / 1000;
                    if (pausedDuration >= LIVE_EDGE_TOLERANCE) {
                        this._isLiveEdgePosition = false;
                    }
                }
                this._emitProgressUpdate();
            }, 1000);
            
        } else if (wasStalled && !isStalled) {
            // Terminando pausa/buffering
            if (this._pauseStartTime > 0) {
                this._totalPauseTime += (Date.now() - this._pauseStartTime);
                this._pauseStartTime = 0;
            }
            this._frozenProgressDatum = undefined;
            this.log('Unfreezing progressDatum', 'debug');
            
            if (this._pauseUpdateInterval) {
                clearInterval(this._pauseUpdateInterval);
                this._pauseUpdateInterval = null;
            }
        }
    }

    private _updateTimeWindow(): void {
        if (!this._initialTimeWindowSeconds) return;

        const elapsed = (Date.now() - this._streamStartTime) / 1000;
        this._currentTimeWindowSeconds = Math.max(this._initialTimeWindowSeconds, elapsed);
    }

    private _updateLiveEdgePosition(): void {
        if (!this._isValidState()) {
            this._isLiveEdgePosition = false;
            return;
        }

        const offset = this._seekableRange.end - this._currentTime;
        this._isLiveEdgePosition = offset <= LIVE_EDGE_TOLERANCE;
    }

    private _getSliderBounds(): { minimumValue: number; maximumValue: number } {
        const liveEdge = this._getCurrentLiveEdge();
        
        switch (this._playbackType) {
            case DVR_PLAYBACK_TYPE.PROGRAM:
                const programStart = this._currentProgram?.startDate || liveEdge - (this._currentTimeWindowSeconds! * 1000);
                return { minimumValue: programStart, maximumValue: liveEdge };
                
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
        const windowStart = liveEdge - (this._currentTimeWindowSeconds! * 1000);
        return { minimumValue: windowStart, maximumValue: liveEdge };
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

    private _playerTimeToTimestamp(playerTime: number): number {
        if (!this._streamStartTime) return Date.now();
        
        const windowStart = this._getCurrentLiveEdge() - (this._currentTimeWindowSeconds! * 1000);
        return windowStart + (playerTime * 1000);
    }

    private _timestampToPlayerTime(timestamp: number): number {
        if (!this._streamStartTime) return 0;
        
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
     */

    destroy(): void {
        this.log('Destroying DVR progress manager', 'info');
        super.destroy();
        
        // Limpiar recursos específicos del DVR
        this._epgRetryCount.clear();
        
        if (this._pauseUpdateInterval) {
            clearInterval(this._pauseUpdateInterval);
            this._pauseUpdateInterval = null;
        }
    }
}