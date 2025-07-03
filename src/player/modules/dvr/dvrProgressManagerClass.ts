import { 
    DVR_PLAYBACK_TYPE,
    type SeekableRange,
    type IBasicProgram,
    type SliderValues,
    type ProgressUpdateData
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
    seekableRange: SeekableRange;
    isBuffering: boolean;
    isPaused: boolean;
}

export interface DVRProgressManagerData {
    dvrWindowSeconds?: number;
    currentTime?: number;
    isPaused?: boolean;
    isBuffering?: boolean;
    playbackType?: DVR_PLAYBACK_TYPE;

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
    private _liveEdgeReference:number;

    private _pauseStartTime:number;
    private _totalPauseTime:number;

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
      
        // Tipo de reproducción
        this._playbackType = options.playbackType || DVR_PLAYBACK_TYPE.WINDOW;
        this._currentProgram = null;
      
        // Callbacks
        this._onProgramChange = options.onProgramChange || undefined;
        this._onModeChange = options.onModeChange || undefined;
        this._onProgressUpdate = options.onProgressUpdate || undefined;
        this._onSeekRequest = options.onSeekRequest || undefined;
      
        // EPG provider
        this._getEPGProgramAt = options.getEPGProgramAt || undefined;
        this._getEPGNextProgram = options.getEPGNextProgram || undefined;
      
        // Referencia de tiempo inicial (timestamp del edge live inicial)
        this._liveEdgeReference = Date.now();

        if (options.currentTime && this._seekableRange.end > 0) {
            this._updateLiveStatus();
        }

        console.log(`[Player] (DVR Progress Manager) Constructor - Stats ${JSON.stringify(this.getStats())}`);
        
    }

    setInitialTimeWindowSeconds(seconds:number) {
        console.log(`[Player] (DVR Progress Manager) setInitialTimeWindowSeconds...`);
        this._initialTimeWindowSeconds = seconds;
        this._currentTimeWindowSeconds = this._initialTimeWindowSeconds;

        // Referencia de tiempo inicial (timestamp del edge live inicial)
        this._liveEdgeReference = Date.now();

        console.log(`[Player] (DVR Progress Manager) setInitialTimeWindowSeconds - Stats ${JSON.stringify(this.getStats())}`);
    }
  
    /*
     *  Actualiza los datos del reproductor
     * 
     */

    updatePlayerData(data:UpdatePlayerData) {
        console.log(`[Player] (DVR Progress Manager) updatePlayerData...`);
        const { currentTime, seekableRange, isBuffering, isPaused } = data;
      
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
            this._playbackType === DVR_PLAYBACK_TYPE.PROGRAM) {
            this._checkProgramChange();
        }
      
        // Emitir actualización
        this._emitProgressUpdate();

        console.log(`[Player] (DVR Progress Manager) updatePlayerData - Stats ${JSON.stringify(this.getStats())}`);
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
        if (playbackType === DVR_PLAYBACK_TYPE.PLAYLIST || 
            playbackType === DVR_PLAYBACK_TYPE.PLAYLIST_EXPAND_RIGHT || 
            playbackType === DVR_PLAYBACK_TYPE.PROGRAM) {
            if (this._getEPGProgramAt) {
                // Obtener programa actual si no se proporciona
                if (!program) {
                    try {
                        const currentRealTime = this._getCurrentRealTime();
                        this._currentProgram = await this._getEPGProgramAt(currentRealTime);
                    } catch (error) {
                        console.warn('DVRProgressManager: Error obteniendo programa EPG:', error);
                        this._currentProgram = null;
                    }
                } else {
                    this._currentProgram = program;
                }
            } else {
                this._currentProgram = null;
            }
        } else {
            // En modo WINDOW no necesitamos programa
            this._currentProgram = null;
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
        if (!this._currentProgram) return;
        
        if (this._playbackType === DVR_PLAYBACK_TYPE.PROGRAM || 
            this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST ||
            this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST_EXPAND_RIGHT) {
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
            // NO reseteamos _liveEdgeReference ni _currentTimeWindowSeconds 
            // porque la ventana debe seguir creciendo naturalmente
        }
      
        // En todos los tipos, ir al live edge (final del rango seekable)
        const targetTime = this._seekableRange.end;
        this._seekTo(targetTime);
    }
  
    /*
     *  Ir a una hora específica (timestamp)
     * 
     */

    goToTime(timestamp:number) {
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
            return await this._getEPGProgramAt(currentRealTime);
        } catch {
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

        } else if (wasStalled && !isStalled) {
            if (this._pauseStartTime > 0) {
                this._totalPauseTime += Date.now() - this._pauseStartTime;
                this._pauseStartTime = 0;
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

        // Para WINDOW y PROGRAM: la ventana crece continuamente desde el inicio
        const timeElapsedSinceStart = (Date.now() - this._liveEdgeReference) / 1000;
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
        const tolerance = 10; // 10 segundos de tolerancia
        this._isLiveEdgePosition = (this._seekableRange.end - this._currentTime) <= tolerance;
    }
  
    _checkProgramChange() {
        if (!this._getEPGNextProgram || !this._currentProgram) return;
      
        const currentRealTime = this._getCurrentRealTime();
      
        // Verificar si hemos salido del programa actual
        if (currentRealTime >= this._currentProgram.endDate) {
            const previousProgram = this._currentProgram;
            
            this._getEPGNextProgram(this._currentProgram).then(nextProgram => {
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
            }).catch(() => {
                // Error obteniendo el siguiente programa
                // No hacer nada, mantener el programa actual
            });
        }
    }
  
    _getWindowSliderValues(): SliderValues {
        const now = Date.now();
        const liveEdge = this._liveEdgeReference + (now - this._liveEdgeReference);
        const windowStart = liveEdge - (this._currentTimeWindowSeconds * 1000);
      
        return {
            minimumValue: windowStart,
            maximumValue: liveEdge,
            progress: this._getCurrentRealTime(),
            canSeekToEnd: true,
            isProgramLive: false // En modo WINDOW no hay restricciones de programa en directo
        };
    }

    _getPlaylistSliderValues(): SliderValues {
        if (!this._currentProgram) {
            return this._getWindowSliderValues();
        }
      
        const now = Date.now();
        const programStart = this._currentProgram.startDate;
        const programEnd = this._currentProgram.endDate;
        const currentRealTime = this._getCurrentRealTime();
      
        // Determinar si el programa está en directo
        const isProgramLive = programEnd > now;
      
        return {
            minimumValue: programStart,
            maximumValue: programEnd,
            progress: currentRealTime,
            canSeekToEnd: !isProgramLive, // Solo se puede ir al final si el programa ya terminó
            liveEdge: isProgramLive ? now : undefined, // En vivo: límite es "ahora", terminado: sin límite
            isProgramLive: isProgramLive
        };
    }

    _getProgramSliderValues(): SliderValues {
        if (!this._currentProgram) {
            return this._getWindowSliderValues();
        }
      
        const now = Date.now();
        const programStart = this._currentProgram.startDate;
        const liveEdge = this._liveEdgeReference + (now - this._liveEdgeReference);
        const currentRealTime = this._getCurrentRealTime();
      
        return {
            minimumValue: programStart,
            maximumValue: liveEdge, // El edge live, no el final del programa
            progress: currentRealTime,
            canSeekToEnd: true, // Siempre se puede ir al live edge
            isProgramLive: false // No hay restricciones como en PLAYLIST
        };
    }

    _getPlaylistExpandRightSliderValues(): SliderValues {
        if (!this._currentProgram) {
            return this._getWindowSliderValues();
        }
      
        const now = Date.now();
        const programStart = this._currentProgram.startDate;
        const currentRealTime = this._getCurrentRealTime();
        
        // El slider va desde el inicio del programa hasta "ahora" (edge live)
        // No muestra el futuro, solo lo que ha pasado del programa hasta el momento
        return {
            minimumValue: programStart,
            maximumValue: now, // Hasta "ahora", no hasta el final del programa
            progress: currentRealTime,
            canSeekToEnd: true, // Siempre se puede ir hasta "ahora"
            isProgramLive: false // No hay restricciones de futuro
        };
    }
  
    _getCurrentRealTime(): number {
        
        // Validar que tenemos datos válidos
        if (!this._seekableRange || this._seekableRange.end <= 0) {
            return Date.now(); // Fallback seguro
        }
        
        const timeSinceLiveReference = this._seekableRange.end - this._currentTime;
        
        // Proteger contra valores negativos extremos
        const calculatedTime = Date.now() - (timeSinceLiveReference * 1000);
        return Math.max(calculatedTime, this._liveEdgeReference - (this._currentTimeWindowSeconds * 1000));

    }
  
    _timestampToPlayerTime(timestamp:number) {
        const timeDiff = (Date.now() - timestamp) / 1000;
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
        if (this._onSeekRequest) {
            this._onSeekRequest(playerTime);
        }
    }
  
    // MÉTODOS PÚBLICOS ADICIONALES
  
    /*
     *  Resetear el gestor a estado inicial
     * 
     */

    reset() {
        // Resetear completamente - como si empezáramos de nuevo
        this._totalPauseTime = 0;
        this._pauseStartTime = 0;
        this._isLiveEdgePosition = true;
        this._liveEdgeReference = Date.now(); // Nueva referencia temporal
        this._currentTimeWindowSeconds = this._initialTimeWindowSeconds; // Resetear ventana

        console.log(`[Player] (DVR Progress Manager) reset - Stats ${JSON.stringify(this.getStats())}`);
    }
  
    /*
     *  Obtener estadísticas actuales
     * 
     */

    getStats() {
        console.log(`[Player] (DVR Progress Manager) getStats...`);
        return {
            initialTimeWindowSeconds: this._initialTimeWindowSeconds,
            currentTimeWindowSeconds: this._currentTimeWindowSeconds,
            totalPauseTime: this._totalPauseTime / 1000, // en segundos
            isLiveEdgePosition: this._isLiveEdgePosition,
            playbackType: this._playbackType,
            currentProgram: this._currentProgram
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

}