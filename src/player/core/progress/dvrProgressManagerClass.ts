import { Platform } from 'react-native';
import { EPG_RETRY_DELAYS, LIVE_EDGE_TOLERANCE, LOG_ENABLED, LOG_KEY, LOG_LEVEL, LOG_TYPE_LEVELS, PROGRESS_SIGNIFICANT_CHANGE } from './constants';
import { type BaseUpdatePlayerData } from './types/base';
import { DVR_PLAYBACK_TYPE } from './types/enums';

export class DVRProgressManagerClass {
    // Estado principal
    private _initialTimeWindowSeconds: number | null = null;
    private _currentTimeWindowSeconds: number | null = null;
    private _streamStartTime: number = 0;
    private _endStreamDate: number | null = null;
    private _duration: number | null = null;

    // Estado del reproductor
    private _currentTime: number = 0;
    private _seekableRange: { start: number; end: number } = { start: 0, end: 0 };
    private _isPaused: boolean = false;
    private _isBuffering: boolean = false;
    private _isLiveEdgePosition: boolean = true;

    // Gestión de pausas simplificada
    private _pauseStartTime: number = 0;
    private _totalPauseTime: number = 0;
    private _frozenProgressDatum?: number; // Buena idea de tu implementación
    private _pauseUpdateInterval: ReturnType<typeof setTimeout> | null = null;

    // Estado de reproducción
    private _playbackType: DVR_PLAYBACK_TYPE = DVR_PLAYBACK_TYPE.WINDOW;
    private _currentProgram: any | null = null;
    private _lastProgressForEPG: number | null = null;

    // Gestión de errores EPG
    private _epgRetryCount: Map<number, number> = new Map();

    // Callbacks
    private _options: any = {};

    constructor(options: any = {}) {
        this.log(`Constructor - DVR window configured: ${!!options.dvrWindowSeconds}`, 'info');
        
        this._options = {
            dvrWindowSeconds: null,
            playbackType: DVR_PLAYBACK_TYPE.WINDOW,
            getEPGProgramAt: null,
            onModeChange: null,
            onProgramChange: null,
            onProgressUpdate: null,
            onSeekRequest: null,
            onEPGRequest: null,
            onEPGError: null,
            onValidationError: null,
            ...options
        };

        // Configuración inicial
        this._initialTimeWindowSeconds = options.dvrWindowSeconds || null;
        this._currentTimeWindowSeconds = this._initialTimeWindowSeconds;
        this._playbackType = this._options.playbackType;
        this._isPaused = options.isPaused || false;
        this._isBuffering = options.isBuffering || false;
        this._duration = options.duration || null;

        // Inicializar tiempo de stream si tenemos ventana
        if (this._initialTimeWindowSeconds) {
            this._initializeStreamTimes();
        }
    }

    /*
     *  Métodos públicos
     * 
     */

    // Método para actualizar callbacks cuando cambian las referencias
    updateCallbacks(callbacks: {
        getEPGProgramAt?: ((timestamp: number) => Promise<any>) | null;
        onModeChange?: ((data: any) => void) | null;
        onProgramChange?: ((data: any) => void) | null;
        onProgressUpdate?: ((data: any) => void) | null;
        onSeekRequest?: ((playerTime: number) => void) | null;
        onEPGRequest?: ((timestamp: number) => void) | null;
        onEPGError?: ((data: any) => void) | null;
        onValidationError?: ((error: string) => void) | null;
    }): void {

        if (callbacks.getEPGProgramAt !== undefined) {
            this._options.getEPGProgramAt = callbacks.getEPGProgramAt;
        }
        if (callbacks.onModeChange !== undefined) {
            this._options.onModeChange = callbacks.onModeChange;
        }
        if (callbacks.onProgramChange !== undefined) {
            this._options.onProgramChange = callbacks.onProgramChange;
        }
        if (callbacks.onProgressUpdate !== undefined) {
            this._options.onProgressUpdate = callbacks.onProgressUpdate;
        }
        if (callbacks.onSeekRequest !== undefined) {
            this._options.onSeekRequest = callbacks.onSeekRequest;
        }
        if (callbacks.onEPGRequest !== undefined) {
            this._options.onEPGRequest = callbacks.onEPGRequest;
        }
        if (callbacks.onEPGError !== undefined) {
            this._options.onEPGError = callbacks.onEPGError;
        }
        if (callbacks.onValidationError !== undefined) {
            this._options.onValidationError = callbacks.onValidationError;
        }
        
        const updatedCallbacks = Object.keys(callbacks).filter(key => callbacks[key as keyof typeof callbacks] !== undefined);
        this.log(`updateCallbacks - Updated ${updatedCallbacks.length} callbacks`, 'debug');
    }

    async updatePlayerData(data: BaseUpdatePlayerData): Promise<void> {
        console.log(`[DANI] updatePlayerData: ${JSON.stringify(data)}`);
        if (!data) return;

        const wasValidBefore = this._isValidState();
        this.log('updatePlayerData', 'debug', { 
            currentTime: data.currentTime, 
            wasValidBefore,
            seekableRange: data.seekableRange 
        });

        // Validar y actualizar datos
        const validatedData = this._validatePlayerData({ ...data });
        this._currentTime = validatedData.currentTime;
        this._seekableRange = validatedData.seekableRange;
        this._duration = validatedData.duration || this._duration;

        // Gestión de pausas simplificada
        this._updatePauseTracking(validatedData.isPaused, validatedData.isBuffering);

        // Solo ejecutar lógica compleja si el estado es válido
        const isValidNow = this._isValidState();
        if (isValidNow) {
            this._updateTimeWindow();
            this._updateLiveEdgePosition();
            this._checkSignificantProgressChange();

            // EPG en modo PLAYLIST/PROGRAM
            if ((this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST || 
                 this._playbackType === DVR_PLAYBACK_TYPE.PROGRAM) && 
                this._options.getEPGProgramAt) {
                this._checkProgramChange().catch(console.error);
            }
        }

        // Si el estado se volvió válido, obtener programa inicial
        if (!wasValidBefore && isValidNow && !this._currentProgram) {
            this.getCurrentProgramInfo().catch(console.error);
        }

        this._emitProgressUpdate();
    }

    checkInitialSeek(mode: 'player' | 'cast'): void {
        this.log(`checkInitialSeek for ${mode}`, 'info');
        
        if (mode === 'player' && Platform.OS === 'ios') {
            setTimeout(() => {
                this.goToLive();
            }, 300);
        }
    }

    getSliderValues(): any {
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

    setDuration(duration: number | null): void {
        this._duration = duration;
        this._emitProgressUpdate();
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
            !program && this._options.getEPGProgramAt) {
            
            try {
                const timestamp = this._getProgressDatum();
                program = await this._options.getEPGProgramAt(timestamp);
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
        if (this._options.onModeChange) {
            this._options.onModeChange({
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
            this.log(`🎯 Updated frozen position to program start during pause: ${this._frozenProgressDatum}`, 'debug');
        }
        
        // Llamar directamente al seek sin duplicar la lógica
        const playerTime = this._timestampToPlayerTime(this._currentProgram.startDate);
        if (this._options.onSeekRequest) {
            this._options.onSeekRequest(playerTime);
        }
        
        // Emitir update inmediato
        this._emitProgressUpdate();
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
            this.log(`🎯 Updated frozen position to live edge during pause: ${this._frozenProgressDatum}`, 'debug');
        }
        
        if (this._options.onSeekRequest) {
            const liveEdge = this._getCurrentLiveEdgePlayerTime();
            this._options.onSeekRequest(liveEdge);
        }
        
        // Emitir update inmediato
        this._emitProgressUpdate();
    }

    seekToTime(timestamp: number): void {
        if (!this._isValidState()) {
            this.log('seekToTime: Invalid state', 'warn');
            return;
        }

        this.log(`seekToTime: ${timestamp}`, 'info');
        this._isLiveEdgePosition = false;
        
        // Si estamos pausados, actualizar la posición congelada
        if (this._isPaused || this._isBuffering) {
            this._frozenProgressDatum = timestamp;
            this.log(`🎯 Updated frozen position during pause to: ${timestamp}`, 'debug');
        }
        
        const playerTime = this._timestampToPlayerTime(timestamp);
        if (this._options.onSeekRequest) {
            this._options.onSeekRequest(playerTime);
        }
        
        // Emitir update inmediato para reflejar el cambio en la UI
        this._emitProgressUpdate();
    }

    skipForward(seconds: number): void {
        if (!this._isValidState()) return;
        
        const newTime = this._currentTime + seconds;
        
        // Si estamos pausados, calcular la nueva posición y actualizar frozen datum
        if (this._isPaused || this._isBuffering) {
            const currentPosition = this._frozenProgressDatum || this._getProgressDatum();
            const newTimestamp = currentPosition + (seconds * 1000);
            this._frozenProgressDatum = newTimestamp;
            this.log(`🎯 Updated frozen position during pause (skip forward): ${newTimestamp}`, 'debug');
        }
        
        if (this._options.onSeekRequest) {
            this._options.onSeekRequest(newTime);
        }
        
        // Emitir update inmediato
        this._emitProgressUpdate();
    }

    skipBackward(seconds: number): void {
        if (!this._isValidState()) return;
        
        const newTime = Math.max(0, this._currentTime - seconds);
        
        // Si estamos pausados, calcular la nueva posición y actualizar frozen datum
        if (this._isPaused || this._isBuffering) {
            const currentPosition = this._frozenProgressDatum || this._getProgressDatum();
            const newTimestamp = Math.max(0, currentPosition - (seconds * 1000));
            this._frozenProgressDatum = newTimestamp;
            this.log(`🎯 Updated frozen position during pause (skip backward): ${newTimestamp}`, 'debug');
        }
        
        if (this._options.onSeekRequest) {
            this._options.onSeekRequest(newTime);
        }
        
        // Emitir update inmediato
        this._emitProgressUpdate();
    }

    seekToProgress(progress: number): void {
        if (!this._isValidState()) return;

        const { minimumValue, maximumValue } = this._getSliderBounds();
        const range = maximumValue - minimumValue;
        const targetTimestamp = minimumValue + (range * progress);

        this._isLiveEdgePosition = progress >= 0.95; // 95% threshold
        
        // Si estamos pausados, actualizar la posición congelada
        if (this._isPaused || this._isBuffering) {
            this._frozenProgressDatum = targetTimestamp;
            this.log(`🎯 Updated frozen position during pause (seek to progress): ${targetTimestamp}`, 'debug');
        }
        
        // Llamar directamente al seek sin duplicar la lógica de pausa
        const playerTime = this._timestampToPlayerTime(targetTimestamp);
        if (this._options.onSeekRequest) {
            this._options.onSeekRequest(playerTime);
        }
        
        // Emitir update inmediato
        this._emitProgressUpdate();
    }

    async getCurrentProgramInfo(): Promise<any | null> {
        this.log(`getCurrentProgramInfo - EPG available: ${!!this._options.getEPGProgramAt}`, 'debug');
        
        if (!this._options.getEPGProgramAt || !this._isValidState()) {
            return null;
        }

        const timestamp = this._getProgressDatum();
        this.log(`EPG request for timestamp: ${timestamp}`, 'debug');

        if (this._options.onEPGRequest) {
            this._options.onEPGRequest(timestamp);
        }

        try {
            this._currentProgram = await this._options.getEPGProgramAt(timestamp);
            this._epgRetryCount.delete(timestamp);
            return this._currentProgram;
        } catch (error) {
            this.log('EPG error', 'error', error);
            this._handleEPGError(timestamp, error);
            return null;
        }
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
            duration: this._duration,
            currentLiveEdge: this.currentLiveEdge,
            progressDatum: this.progressDatum,
            liveEdgeOffset: this.liveEdgeOffset
        };
    }

    destroy(): void {
        // Limpiar recursos si es necesario
        this._epgRetryCount.clear();
        
        // Limpiar interval de pausa si existe
        if (this._pauseUpdateInterval) {
            clearInterval(this._pauseUpdateInterval);
            this._pauseUpdateInterval = null;
        }
    }

    reset(): void {
        this.log('Reset', 'debug');
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

    /*
     *  Getters públicos
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

    get playbackType(): string {
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

    get duration(): number | null {
        return this._duration;
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
     *  Métodos privados
     * 
     */

    private _initializeStreamTimes(): void {
        const now = Date.now();
        this._streamStartTime = now - (this._initialTimeWindowSeconds! * 1000);
        this.log(`Stream initialized, starts at: ${new Date(this._streamStartTime).toISOString()}`);
    }

    private _isValidState(): boolean {
        console.log(`[DANI] isValidState: ${this._seekableRange, this._seekableRange.end, this._currentTime, this._initialTimeWindowSeconds}`);
        return this._seekableRange !== null && 
               this._seekableRange.end > 0 &&
               this._currentTime >= 0 &&
               this._initialTimeWindowSeconds !== null && 
               this._initialTimeWindowSeconds > 0;
    }

    private _validatePlayerData(data: BaseUpdatePlayerData): BaseUpdatePlayerData {
        // Validación básica con corrección automática
        if (typeof data.currentTime !== 'number' || data.currentTime < 0) {
            this.log('Invalid currentTime, correcting to 0', 'warn');
            data.currentTime = 0;
        }

        if (!data.seekableRange || 
            typeof data.seekableRange.start !== 'number' ||
            typeof data.seekableRange.end !== 'number' ||
            data.seekableRange.start > data.seekableRange.end) {
            
            this.log('Invalid seekableRange, correcting', 'warn');
            data.seekableRange = { start: 0, end: Math.max(data.currentTime, 1) };
        }

        return data;
    }

    private _updatePauseTracking(isPaused: boolean, isBuffering: boolean): void {
        const wasStalled = this._isPaused || this._isBuffering;
        const isStalled = isPaused || isBuffering;

        if (!wasStalled && isStalled) {
            // Iniciando pausa/buffering
            this._pauseStartTime = Date.now();
            if (this._isValidState()) {
                this._frozenProgressDatum = this._getProgressDatum();
                this.log('🧊 Freezing progressDatum at:', 'debug', this._frozenProgressDatum);
            }
            
            // Iniciar timer para actualizar progreso cada segundo durante pausa
            // Esto permite que el liveEdgeOffset se actualice en tiempo real en la UI
            this._pauseUpdateInterval = setInterval(() => {
                // Verificar si ya no estamos en live edge después de cierto tiempo pausado
                if (this._isLiveEdgePosition && this._pauseStartTime > 0) {
                    const pausedDuration = (Date.now() - this._pauseStartTime) / 1000;
                    if (pausedDuration >= LIVE_EDGE_TOLERANCE) {
                        this._isLiveEdgePosition = false;
                    }
                }
                
                // Emitir update para que la UI muestre el offset creciente
                this._emitProgressUpdate();
            }, 1000);
            
        } else if (wasStalled && !isStalled) {
            // Terminando pausa/buffering
            if (this._pauseStartTime > 0) {
                this._totalPauseTime += (Date.now() - this._pauseStartTime);
                this._pauseStartTime = 0;
            }
            this._frozenProgressDatum = undefined;
            this.log('❄️ Unfreezing progressDatum', 'debug');
            
            // Detener timer de updates
            if (this._pauseUpdateInterval) {
                clearInterval(this._pauseUpdateInterval);
                this._pauseUpdateInterval = null;
            }
        }

        this._isPaused = isPaused;
        this._isBuffering = isBuffering;
    }

    private _updateTimeWindow(): void {
        if (!this._initialTimeWindowSeconds) return;

        // La ventana crece naturalmente con el tiempo transcurrido
        const elapsed = (Date.now() - this._streamStartTime) / 1000;
        this._currentTimeWindowSeconds = Math.max(this._initialTimeWindowSeconds, elapsed);
    }

    private _updateLiveEdgePosition(): void {
        if (!this._isValidState()) {
            this._isLiveEdgePosition = false;
            return;
        }

        // Considerar "en vivo" si estamos cerca del final del rango seekable
        const offset = this._seekableRange.end - this._currentTime;
        this._isLiveEdgePosition = offset <= LIVE_EDGE_TOLERANCE;
    }

    private _getSliderBounds(): { minimumValue: number; maximumValue: number } {
        const liveEdge = this._getCurrentLiveEdge();
        
        switch (this._playbackType) {
            case DVR_PLAYBACK_TYPE.PROGRAM:
                const programStart = this._currentProgram?.startDate || liveEdge - (this._currentTimeWindowSeconds! * 1000);
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
        const windowStart = liveEdge - (this._currentTimeWindowSeconds! * 1000);
        return { minimumValue: windowStart, maximumValue: liveEdge };
    }

    private _getProgressValue(): number {
        if (this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST) {
            return this._getProgressDatum();
        }
        
        // Para WINDOW y PROGRAM, usar timestamp calculado
        return this._getProgressDatum();
    }

    private _getCurrentLiveEdge(): number {
        const now = Date.now();
        return this._endStreamDate ? Math.min(now, this._endStreamDate) : now;
    }

    private _getCurrentLiveEdgePlayerTime(): number {
        // Convertir live edge timestamp a tiempo del reproductor
        return this._seekableRange.end;
    }

    private _getProgressDatum(): number {
        // Usar valor congelado durante pausas para evitar fluctuaciones
        if (this._frozenProgressDatum !== undefined && (this._isPaused || this._isBuffering)) {
            return this._frozenProgressDatum;
        }

        // Calcular timestamp real basado en la posición del reproductor
        return this._playerTimeToTimestamp(this._currentTime);
    }

    private _getLiveEdgeOffset(): number {
        const liveEdge = this._getCurrentLiveEdge();
        const progress = this._getProgressDatum();
        return Math.max(0, (liveEdge - progress) / 1000);
    }

    private _playerTimeToTimestamp(playerTime: number): number {
        if (!this._streamStartTime) return Date.now();
        
        // Para streams DVR: playerTime = 0 corresponde al inicio de la ventana
        const windowStart = this._getCurrentLiveEdge() - (this._currentTimeWindowSeconds! * 1000);
        return windowStart + (playerTime * 1000);
    }

    private _timestampToPlayerTime(timestamp: number): number {
        if (!this._streamStartTime) return 0;
        
        const windowStart = this._getCurrentLiveEdge() - (this._currentTimeWindowSeconds! * 1000);
        return Math.max(0, (timestamp - windowStart) / 1000);
    }

    private _checkSignificantProgressChange(): void {
        if (!this._options.onEPGRequest || this._playbackType !== DVR_PLAYBACK_TYPE.WINDOW) {
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
            this._options.onEPGRequest(currentProgress);
        }
    }

    private async _checkProgramChange(): Promise<void> {
        if (!this._currentProgram || !this._options.getEPGProgramAt) return;

        const currentProgress = this._getProgressDatum();
        
        // Verificar si hemos salido del programa actual
        if (currentProgress >= this._currentProgram.endDate) {
            this.log('Program ended, checking for next program');
            
            try {
                const nextProgram = await this._options.getEPGProgramAt(currentProgress);
                if (nextProgram && nextProgram.id !== this._currentProgram.id) {
                    const previousProgram = this._currentProgram;
                    this._currentProgram = nextProgram;

                    if (this._options.onProgramChange) {
                        this._options.onProgramChange({
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
            if (this._options.onEPGError) {
                this._options.onEPGError({ timestamp, error, retryCount });
            }
            this._epgRetryCount.delete(timestamp);
        }
    }

    private _emitProgressUpdate(): void {
        if (!this._isValidState()) {
            this.log('_emitProgressUpdate: Invalid state, skipping', 'warn');
            return;
        }

        try {
            const sliderValues = this.getSliderValues();
            
            if (this._options.onProgressUpdate) {
                this._options.onProgressUpdate({
                    ...sliderValues,
                    isLiveEdgePosition: this._isLiveEdgePosition,
                    isPaused: this._isPaused,
                    isBuffering: this._isBuffering,
                    playbackType: this._playbackType,
                    currentProgram: this._currentProgram,
                    windowCurrentSizeInSeconds: this._currentTimeWindowSeconds,
                    canSeekToEnd: true
                });
            }
        } catch (error) {
            this.log('_emitProgressUpdate error', 'error', error);
        }
    }

    private log(message: string, type: 'debug' | 'info' | 'warn' | 'error' = 'info', data?: any): void {
        const logLevel = LOG_TYPE_LEVELS[type];
        const minLogLevel = LOG_TYPE_LEVELS[LOG_LEVEL];

        if (LOG_ENABLED && minLogLevel <= logLevel) {
            console[type](`${LOG_KEY} ${message} ${data ? `:: ${JSON.stringify(data)}` : ''}`);
        }
    }
}