import {
    DVR_PLAYBACK_TYPE,
    type IBasicProgram,
    type ProgressUpdateData,
    type SeekableRange,
    type SliderValues
} from "../../types";

export interface ProgramChangeData {
    previousProgram: IBasicProgram | null;
    currentProgram: IBasicProgram | null;
}

export interface ModeChangeData {
    previousType: DVR_PLAYBACK_TYPE;
    playbackType: DVR_PLAYBACK_TYPE;
    program: IBasicProgram | null;
}

export interface UpdatePlayerData {
    currentTime: number;
    duration: number;
    seekableRange: SeekableRange;
    isBuffering: boolean;
    isPaused: boolean;
}

export interface DVRProgressManagerData {
    dvrWindowSeconds?: number;
    currentTime?: number;
    duration?: number;
    isPaused?: boolean;
    isBuffering?: boolean;
    playbackType?: DVR_PLAYBACK_TYPE;
    endStreamDate?: number; // Fecha límite del stream (opcional)

    // EPG Provider
    getEPGProgramAt?: (timestamp:number) => Promise<IBasicProgram | null>;
    getEPGNextProgram?: (program:IBasicProgram) => Promise<IBasicProgram | null>;

    // Callbacks
    onModeChange?: (data:ModeChangeData) => void;
    onProgramChange?: (data:ProgramChangeData) => void;
    onProgressUpdate?: (data:ProgressUpdateData) => void;
    onSeekRequest?: (playerTime:number) => void;
}

export class DVRProgressManagerClass {

    private _initialTimeWindowSeconds:number;
    private _currentTimeWindowSeconds:number;
    private _currentTime:number;
    private _seekableRange:SeekableRange;
    private _streamStartTime:number; // Hora de inicio del stream
    private _endStreamDate:number | null = null; // Fecha límite del stream (opcional)
    private _duration:number | null = null; // Duración externa (no calculada)
    private _toleranceSeconds = 30; // Tolerancia en segundos para indicar si estamos en directo

    private _pauseStartTime:number;
    private _totalPauseTime:number;
    private _pauseUpdateInterval:NodeJS.Timeout | null = null;

    private _isPaused:boolean = false;
    private _isBuffering:boolean = false;
    private _isLiveEdgePosition:boolean = false;
    private _playbackType:DVR_PLAYBACK_TYPE = DVR_PLAYBACK_TYPE.WINDOW;

    private _currentProgram:IBasicProgram | null = null;

    private _getEPGProgramAt?: (timestamp:number) => Promise<IBasicProgram | null>;
    private _getEPGNextProgram?: (program:IBasicProgram) => Promise<IBasicProgram | null>;

    private _onProgramChange?: (data:ProgramChangeData) => void;
    private _onModeChange?: (data:ModeChangeData) => void;
    private _onProgressUpdate?: (data:ProgressUpdateData) => void;
    private _onSeekRequest?: (playerTime:number) => void;
    
    constructor(options:DVRProgressManagerData = {}) {

        // Configuración inicial
        this._initialTimeWindowSeconds = options.dvrWindowSeconds || 3600; // Ventana de tiempo en segundos (1 hora por defecto)
        this._currentTimeWindowSeconds = this._initialTimeWindowSeconds;
      
        // Estado del reproductor
        this._currentTime = options.currentTime || 0;
        this._seekableRange = { start: 0, end: 0 };
        this._isLiveEdgePosition = true;
        this._isPaused = options.isPaused || false;
        this._isBuffering = options.isBuffering || false;
      
        // Control de tiempo para pausas/buffering
        this._pauseStartTime = 0;
        this._totalPauseTime = 0;
        this._pauseUpdateInterval = null;
      
        // Tipo de reproducción
        this._playbackType = options.playbackType || DVR_PLAYBACK_TYPE.WINDOW;
        this._currentProgram = null;
        
        // Duración externa (no calculada por la clase)
        this._duration = options.duration || null;
      
        // Callbacks
        this._onProgramChange = options.onProgramChange || undefined;
        this._onModeChange = options.onModeChange || undefined;
        this._onProgressUpdate = options.onProgressUpdate || undefined;
        this._onSeekRequest = options.onSeekRequest || undefined;
      
        // EPG provider
        this._getEPGProgramAt = options.getEPGProgramAt || undefined;
        this._getEPGNextProgram = options.getEPGNextProgram || undefined;
      
        // Referencias de tiempo - ahora basadas en timestamps reales
        this._streamStartTime = Date.now();
        this._endStreamDate = options.endStreamDate || null;

        // Inicializar estado si tenemos tiempo inicial
        if (options.currentTime) {
            this._updateLiveStatus();
        }

        // Inicializar programa
        this.getCurrentProgramInfo();

        console.log(`[Player] (DVR Progress Manager) Constructor - Stats ${JSON.stringify(this.getStats())}`);
        
    }
  
    /*
     *  Actualiza los datos del reproductor
     * 
     */

    async updatePlayerData(data:UpdatePlayerData) {
        const { currentTime, seekableRange, isBuffering, isPaused } = data;

        // console.log(`[Player] (DVR Progress Manager) updatePlayerData ${JSON.stringify(data)}`);
      
        this._currentTime = currentTime || 0;
        this._seekableRange = seekableRange || this._seekableRange;
      
        // Manejar cambios de estado de pausa/buffering
        this._handlePlaybackStateChange(isPaused, isBuffering);
      
        // Actualizar ventana de tiempo si hay pausas/buffering
        this._updateTimeWindow();
      
        // Determinar si estamos en vivo
        this._updateLiveStatus();
      
        // Verificar cambios de programa según el tipo de reproducción
        if (this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST || 
            this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST_EXPAND_RIGHT || 
            this._playbackType === DVR_PLAYBACK_TYPE.PROGRAM ||
            this._playbackType === DVR_PLAYBACK_TYPE.WINDOW) {
            await this._checkProgramChange();
        }
      
        // Emitir actualización
        this._emitProgressUpdate();

        // console.log(`[Player] (DVR Progress Manager) updatePlayerData - Stats ${JSON.stringify(this.getStats())}`);
    }
  
    /*
     *  Obtiene los valores calculados para el slider
     * 
     */
    
    getSliderValues(): SliderValues {

        switch (this._playbackType) {
            case DVR_PLAYBACK_TYPE.WINDOW:
                return this._getWindowSliderValues();
            
            case DVR_PLAYBACK_TYPE.PROGRAM:
                return this._getProgramSliderValues();
            
            case DVR_PLAYBACK_TYPE.PLAYLIST_EXPAND_RIGHT:
                return this._getPlaylistExpandRightSliderValues();
            
            case DVR_PLAYBACK_TYPE.PLAYLIST:
                return this._getPlaylistSliderValues();
            
            default:
                return this._getWindowSliderValues();
        }

    }

    /*
     *  Establecer duración externa
     * 
     */
    
    setDuration(duration: number | null) {
        this._duration = duration;
        this._emitProgressUpdate();
    }

    /*
     *  Establecer ventana de tiempo inicial
     * 
     */
    
    setInitialTimeWindowSeconds(seconds: number) {
        // Calcular cuánto ha crecido la ventana desde el valor inicial anterior
        const currentGrowth = this._currentTimeWindowSeconds - this._initialTimeWindowSeconds;
        
        // Actualizar valor inicial
        this._initialTimeWindowSeconds = seconds;
        
        // Recalcular la ventana actual manteniendo el crecimiento
        this._currentTimeWindowSeconds = this._initialTimeWindowSeconds + currentGrowth;
        
        // Emitir actualización para reflejar los cambios
        this._emitProgressUpdate();
    }
  
    /*
     *  Cambiar tipo de reproducción
     * 
     */
    
    async setPlaybackType(playbackType: DVR_PLAYBACK_TYPE, program: IBasicProgram | null = null) {
        const previousType = this._playbackType;
        
        // Si no cambia el tipo, solo actualizamos el programa si es necesario
        if (previousType === playbackType && !program) {
            return;
        }
        
        this._playbackType = playbackType;
      
        // Manejar programa según el tipo
        // Actualizar programa -> lo necesitan todos para hacer el goToProgramStart
        if (playbackType === DVR_PLAYBACK_TYPE.PLAYLIST || 
            playbackType === DVR_PLAYBACK_TYPE.PLAYLIST_EXPAND_RIGHT || 
            playbackType === DVR_PLAYBACK_TYPE.PROGRAM ||
            playbackType === DVR_PLAYBACK_TYPE.WINDOW) {
            if (this._getEPGProgramAt) {
                // Obtener programa actual si no se proporciona
                if (!program) {
                    const currentRealTime = this._getCurrentRealTime();
                    try {
                        this._currentProgram = await this._getEPGProgramAt(currentRealTime);
                    } catch (error) {
                        console.error('Error obteniendo programa EPG:', error);
                        this._currentProgram = null;
                    }
                } else {
                    this._currentProgram = program;
                }
            }
        }

        // Para PROGRAM, iniciar desde el comienzo del programa
        if (playbackType === DVR_PLAYBACK_TYPE.PROGRAM && this._currentProgram) {
            this._isLiveEdgePosition = false;
            this._seekToRealTime(this._currentProgram.startDate);
        }
        
        // Para PLAYLIST_EXPAND_RIGHT, iniciar en el edge live
        if (playbackType === DVR_PLAYBACK_TYPE.PLAYLIST_EXPAND_RIGHT) {
            this._isLiveEdgePosition = true;
        }
      
        if (this._onModeChange){
            this._onModeChange({ 
                previousType: previousType,
                playbackType: this._playbackType, 
                program: this._currentProgram 
            });
        }

        this._emitProgressUpdate();
    }
  
    /*
     *  Ir al inicio del programa actual (solo para tipos PROGRAM y PLAYLIST)
     * 
     */

    goToProgramStart() {
        console.log(`[Player] (DVR Progress Manager) goToProgramStart ${JSON.stringify(this._currentProgram)}`);
        if (!this._currentProgram) return;
        
        if (this._playbackType === DVR_PLAYBACK_TYPE.PROGRAM || 
            this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST ||
            this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST_EXPAND_RIGHT ||
            this._playbackType === DVR_PLAYBACK_TYPE.WINDOW) {
            this._isLiveEdgePosition = false;
            this._seekToRealTime(this._currentProgram.startDate);
        }
    }
  
    /*
     *  Ir al edge live
     * 
     */

    goToLive() {
        this._isLiveEdgePosition = true;
        
        // Para WINDOW y PROGRAM: resetear pausas pero mantener crecimiento natural
        if (this._playbackType === DVR_PLAYBACK_TYPE.WINDOW || this._playbackType === DVR_PLAYBACK_TYPE.PROGRAM) {
            this._totalPauseTime = 0;
            this._pauseStartTime = 0;
            // NO reseteamos _streamStartTime ni _currentTimeWindowSeconds 
            // porque la ventana debe seguir creciendo naturalmente
            
            // En WINDOW y PROGRAM, ir al final del rango seekable
            const targetTime = this._seekableRange.end;
            this._seekTo(targetTime);
            
        } else if (this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST || 
                   this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST_EXPAND_RIGHT) {
            // En PLAYLIST, ir al tiempo real actual (live edge)
            const currentLiveEdge = this._getCurrentLiveEdge();
            this._seekToRealTime(currentLiveEdge);
        }
    }
  
    /*
     *  Ir a una hora específica (timestamp)
     * 
     */
    
    seekToTime(timestamp:number) {
        this._isLiveEdgePosition = false;
      
        if (this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST || 
            this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST_EXPAND_RIGHT) {
            this._seekToRealTime(timestamp);
        } else {
            // Para WINDOW y PROGRAM, convertir timestamp a tiempo del reproductor
            const targetTime = this._timestampToPlayerTime(timestamp);
            this._seekTo(targetTime);
        }
    }
  
    /*
     *  Avanzar tiempo determinado (en segundos)
     * 
     */

    skipForward(seconds:number) {
        const newTime = this._currentTime + seconds;
        this._seekTo(newTime);
    }
  
    /*
     *  Retroceder tiempo determinado (en segundos)
     * 
     */

    skipBackward(seconds:number) {
        const newTime = Math.max(0, this._currentTime - seconds);
        this._seekTo(newTime);
    }
  
    /*
     *  Buscar a una posición específica del slider (0-1)
     * 
     */

    seekToProgress(progress: number) {
        const sliderValues = this.getSliderValues();
        const range = sliderValues.maximumValue - sliderValues.minimumValue;
        const targetValue = sliderValues.minimumValue + (range * progress);
      
        // Actualizar estado live según la posición
        const tolerance = 0.95; // 95% del slider
        this._isLiveEdgePosition = progress >= tolerance;
      
        if (this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST || 
            this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST_EXPAND_RIGHT) {
            this._seekToRealTime(targetValue);
        } else {
            // Para WINDOW y PROGRAM, buscar directamente al valor
            this._seekTo(targetValue);
        }
    }
  
    /*
     *  Obtener información del programa actual
     * 
     */

    async getCurrentProgramInfo(): Promise<IBasicProgram | null> {
        if (!this._getEPGProgramAt) return null;
      
        const currentRealTime = this._getCurrentRealTime();
        try {
            this._currentProgram = await this._getEPGProgramAt(currentRealTime);
            return this._currentProgram;
        } catch (error) {
            console.error('Error obteniendo información del programa:', error);
            return null;
        }
    }
  
    // MÉTODOS PRIVADOS

    _isValidState(): boolean {
        return this._seekableRange !== null && 
               this._seekableRange.end > 0 && 
               this._currentTime >= 0;
    }
  
    _handlePlaybackStateChange(isPaused: boolean, isBuffering: boolean) {
        const wasStalled = this._isPaused || this._isBuffering;
        const isStalled = isPaused || isBuffering;
      
        if (!wasStalled && isStalled) {
            this._pauseStartTime = Date.now();
            
            // Iniciar timer para actualizar progreso cada segundo durante pausa
            this._pauseUpdateInterval = setInterval(() => {

                if (this._isLiveEdgePosition && this._pauseStartTime > 0 && (Date.now() - this._pauseStartTime) >= (this._toleranceSeconds * 1000)){
                    this._isLiveEdgePosition = false;
                }
                
                this._emitProgressUpdate();
            }, 1000);

        } else if (wasStalled && !isStalled) {
            if (this._pauseStartTime > 0) {
                this._totalPauseTime += Date.now() - this._pauseStartTime;
                this._pauseStartTime = 0;
            }
            
            // Detener timer de updates
            if (this._pauseUpdateInterval) {
                clearInterval(this._pauseUpdateInterval);
                this._pauseUpdateInterval = null;
            }
        }
      
        this._isPaused = isPaused;
        this._isBuffering = isBuffering;
    }
  
    _updateTimeWindow() {
        // Para PLAYLIST y PLAYLIST_EXPAND_RIGHT, la ventana está definida por el programa actual, no por tiempo transcurrido
        if (this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST || 
            this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST_EXPAND_RIGHT) {
            return;
        }

        // Para WINDOW y PROGRAM: la ventana crece continuamente desde el inicio del stream
        const timeElapsedSinceStart = (Date.now() - this._streamStartTime) / 1000;
        const naturalWindowSize = this._initialTimeWindowSeconds + timeElapsedSinceStart;
        
        // Calcular tiempo adicional por pausas/buffering
        let totalPauseTime = this._totalPauseTime;
        if (this._pauseStartTime > 0) {
            totalPauseTime += Date.now() - this._pauseStartTime;
        }
        
        // La ventana final incluye el crecimiento natural + pausas adicionales
        this._currentTimeWindowSeconds = naturalWindowSize + (totalPauseTime / 1000);
    }
  
    _updateLiveStatus() {
        if (!this._isValidState()) return;

        // Considerar que estamos en vivo si estamos cerca del final del rango seekable
        this._isLiveEdgePosition = (this._seekableRange.end - this._currentTime) <= this._toleranceSeconds;
    }
  
    async _checkProgramChange() {
        if (!this._getEPGNextProgram || !this._currentProgram) return;
      
        const currentRealTime = this._getCurrentRealTime();
      
        // Verificar si hemos salido del programa actual
        if (currentRealTime >= this._currentProgram.endDate) {
            const previousProgram = this._currentProgram;
            
            try {
                const nextProgram = await this._getEPGNextProgram(this._currentProgram);
        
                if (nextProgram) {
                    this._currentProgram = nextProgram;

                    // Comportamiento según el tipo de reproducción
                    if (this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST || 
                        this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST_EXPAND_RIGHT) {
                        // En PLAYLIST y PLAYLIST_EXPAND_RIGHT, continuar con el siguiente programa automáticamente
                        // No necesitamos hacer seek, el contenido continúa
                    } else if (this._playbackType === DVR_PLAYBACK_TYPE.PROGRAM) {
                        // En PROGRAM, empezar desde el inicio del nuevo programa
                        this._isLiveEdgePosition = false;
                        this._seekToRealTime(nextProgram.startDate);
                    }

                    if (this._onProgramChange){
                        this._onProgramChange({
                            previousProgram: previousProgram,
                            currentProgram: nextProgram
                        });
                    }
                }
            } catch (error) {
                console.error('Error obteniendo siguiente programa EPG:', error);
            }
        }
    }
  
    _getWindowSliderValues(): SliderValues {
        const currentLiveEdge = this._getCurrentLiveEdge();
        const windowStart = currentLiveEdge - (this._currentTimeWindowSeconds * 1000);
        const progressDatum = this._getProgressDatum();
        
        // Calcular porcentaje de progreso
        const range = currentLiveEdge - windowStart;
        const progressInRange = progressDatum - windowStart;
        const percentProgress = range > 0 ? Math.max(0, Math.min(1, progressInRange / range)) : 0;
        
        return {
            minimumValue: windowStart,
            maximumValue: currentLiveEdge,
            progress: progressDatum,
            percentProgress: percentProgress,
            duration: this._duration || 0, // Usar duración externa, no calculada
            canSeekToEnd: true,
            isProgramLive: false,
            progressDatum: progressDatum,
            liveEdgeOffset: this._getLiveEdgeOffset(),
            isLiveEdgePosition: this._isLiveEdgePosition
        };
    }

    _getPlaylistSliderValues(): SliderValues {
        if (!this._currentProgram) {
            return this._getWindowSliderValues();
        }
      
        const currentLiveEdge = this._getCurrentLiveEdge();
        const programStart = this._currentProgram.startDate;
        const programEnd = this._currentProgram.endDate;
        const progressDatum = this._getProgressDatum();
      
        // Determinar si el programa está en directo
        const isProgramLive = programEnd > currentLiveEdge;
        
        // Calcular porcentaje de progreso dentro del programa
        const range = programEnd - programStart;
        const progressInRange = progressDatum - programStart;
        const percentProgress = range > 0 ? Math.max(0, Math.min(1, progressInRange / range)) : 0;
      
        return {
            minimumValue: programStart,
            maximumValue: programEnd,
            progress: progressDatum,
            percentProgress: percentProgress,
            duration: this._duration || 0, // Usar duración externa, no calculada
            canSeekToEnd: !isProgramLive,
            liveEdge: isProgramLive ? currentLiveEdge : undefined,
            isProgramLive: isProgramLive,
            progressDatum: progressDatum,
            liveEdgeOffset: this._getLiveEdgeOffset(),
            isLiveEdgePosition: this._isLiveEdgePosition
        };
    }

    _getProgramSliderValues(): SliderValues {
        if (!this._currentProgram) {
            return this._getWindowSliderValues();
        }
      
        const currentLiveEdge = this._getCurrentLiveEdge();
        const programStart = this._currentProgram.startDate;
        const progressDatum = this._getProgressDatum();
      
        // Calcular porcentaje de progreso entre inicio programa y live edge
        const range = currentLiveEdge - programStart;
        const progressInRange = progressDatum - programStart;
        const percentProgress = range > 0 ? Math.max(0, Math.min(1, progressInRange / range)) : 0;
      
        return {
            minimumValue: programStart,
            maximumValue: currentLiveEdge,
            progress: progressDatum,
            percentProgress: percentProgress,
            duration: this._duration || 0, // Usar duración externa, no calculada
            canSeekToEnd: true,
            isProgramLive: false,
            progressDatum: progressDatum,
            liveEdgeOffset: this._getLiveEdgeOffset(),
            isLiveEdgePosition: this._isLiveEdgePosition
        };
    }

    _getPlaylistExpandRightSliderValues(): SliderValues {
        if (!this._currentProgram) {
            return this._getWindowSliderValues();
        }
      
        const currentLiveEdge = this._getCurrentLiveEdge();
        const programStart = this._currentProgram.startDate;
        const progressDatum = this._getProgressDatum();
        
        // El slider va desde el inicio del programa hasta el live edge actual
        // Calcular porcentaje de progreso entre inicio programa y live edge
        const range = currentLiveEdge - programStart;
        const progressInRange = progressDatum - programStart;
        const percentProgress = range > 0 ? Math.max(0, Math.min(1, progressInRange / range)) : 0;
        
        return {
            minimumValue: programStart,
            maximumValue: currentLiveEdge,
            progress: progressDatum,
            percentProgress: percentProgress,
            duration: this._duration || 0, // Usar duración externa, no calculada
            canSeekToEnd: true,
            isProgramLive: false,
            progressDatum: progressDatum,
            liveEdgeOffset: this._getLiveEdgeOffset(),
            isLiveEdgePosition: this._isLiveEdgePosition
        };
    }
  
    _getCurrentRealTime(): number {
        // Calcular el tiempo real basándose SOLO en el crecimiento natural, no en pausas
        const currentLiveEdge = this._getCurrentLiveEdge();
        
        // Usar solo el crecimiento natural de la ventana (sin pausas)
        const timeElapsedSinceStart = (Date.now() - this._streamStartTime) / 1000;
        const naturalWindowSize = this._initialTimeWindowSeconds + timeElapsedSinceStart;
        const windowStart = currentLiveEdge - (naturalWindowSize * 1000);
        
        // El tiempo real es: inicio de ventana + posición actual del player
        const realTime = windowStart + (this._currentTime * 1000);
        
        return realTime;
    }

    _getCurrentLiveEdge(): number {
        // El live edge actual es el menor entre "ahora" y endStreamDate (si existe)
        const now = Date.now();
        return this._endStreamDate ? Math.min(now, this._endStreamDate) : now;
    }

    _getProgressDatum(): number {
        // progressDatum es el timestamp real del punto de reproducción actual
        return this._getCurrentRealTime();
    }

    _getLiveEdgeOffset(): number {
        // Segundos entre el punto de progreso y el live edge
        const currentLiveEdge = this._getCurrentLiveEdge();
        const progressDatum = this._getProgressDatum();
        return Math.max(0, (currentLiveEdge - progressDatum) / 1000);
    }
  
    _timestampToPlayerTime(timestamp:number) {
        // Convertir timestamp real a tiempo del reproductor
        const currentLiveEdge = this._getCurrentLiveEdge();
        const timeDiff = (currentLiveEdge - timestamp) / 1000;
        return this._seekableRange.end - timeDiff;
    }
  
    _seekTo(playerTime:number) {
        // Aquí invocarías el método seek del reproductor
        // player.seek(playerTime);
      
        // Por ahora solo emitimos el evento
        this._emitSeekRequest(playerTime);
    }
  
    _seekToRealTime(timestamp:number) {
        const playerTime = this._timestampToPlayerTime(timestamp);
        this._seekTo(playerTime);
    }

    _emitProgressUpdate() {
        const sliderValues = this.getSliderValues();
      
        if (this._onProgressUpdate){
            this._onProgressUpdate({
                ...sliderValues,
                isLiveEdgePosition: this._isLiveEdgePosition,
                isPaused: this._isPaused,
                isBuffering: this._isBuffering,
                playbackType: this._playbackType,
                currentProgram: this._currentProgram,
                currentRealTime: this._getCurrentRealTime()
            });
        }
    }
  
    _emitSeekRequest(playerTime:number) {
        // Callback para que el componente padre ejecute el seek
        this._updateLiveStatus();
        if (this._onSeekRequest) {
            this._onSeekRequest(playerTime);
        }
    }
    
    // MÉTODOS PÚBLICOS ADICIONALES
  
    /*
     *  Limpiar recursos (llamar al desmontar el componente)
     * 
     */

    destroy() {
        if (this._pauseUpdateInterval) {
            clearInterval(this._pauseUpdateInterval);
            this._pauseUpdateInterval = null;
        }
    }
  
    /*
     *  Resetear el gestor a estado inicial
     * 
     */

    reset() {
        // Resetear completamente - como si empezáramos de nuevo
        this._totalPauseTime = 0;
        this._pauseStartTime = 0;
        this._isLiveEdgePosition = true;
        this._streamStartTime = Date.now(); // Nueva referencia temporal
        this._currentTimeWindowSeconds = this._initialTimeWindowSeconds; // Resetear ventana
        this._duration = null;
        
        // Limpiar timer de pausa si existe
        if (this._pauseUpdateInterval) {
            clearInterval(this._pauseUpdateInterval);
            this._pauseUpdateInterval = null;
        }
        
        this.setPlaybackType(DVR_PLAYBACK_TYPE.WINDOW, null);
    }
  
    /*
     *  Obtener estadísticas actuales
     * 
     */

    getStats() {
        return {
            initialTimeWindowSeconds: this._initialTimeWindowSeconds,
            currentTimeWindowSeconds: this._currentTimeWindowSeconds,
            totalPauseTime: this._totalPauseTime / 1000, // en segundos
            isLiveEdgePosition: this._isLiveEdgePosition,
            playbackType: this._playbackType,
            currentProgram: this._currentProgram,
            streamStartTime: this._streamStartTime,
            endStreamDate: this._endStreamDate,
            duration: this._duration,
            currentLiveEdge: this._getCurrentLiveEdge(),
            progressDatum: this._getProgressDatum(),
            liveEdgeOffset: this._getLiveEdgeOffset()
        };
    }

    // ATRIBUTOS PÚBLICOS
    
    get currentTimeWindowSeconds() {
        return this._currentTimeWindowSeconds;
    }

    get totalPauseTime() {
        return this._totalPauseTime;
    }

    get isLiveEdgePosition() {
        return this._isLiveEdgePosition;
    }

    get playbackType() {
        return this._playbackType;
    }

    get currentProgram() {
        return this._currentProgram;
    }

    get streamStartTime() {
        return this._streamStartTime;
    }

    get endStreamDate() {
        return this._endStreamDate;
    }

    get duration() {
        return this._duration;
    }

    get currentLiveEdge() {
        return this._getCurrentLiveEdge();
    }

    get progressDatum() {
        return this._getProgressDatum();
    }

    get liveEdgeOffset() {
        return this._getLiveEdgeOffset();
    }
}