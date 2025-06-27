export interface SeekableRange {
    start: number;
    end: number;
}

export interface SliderValues {
    minimumValue: number;
    maximumValue: number;
    progress: number;
    canSeekToEnd: boolean;
}

export interface ProgressUpdateData extends SliderValues {
    isEnded: boolean;
    isPaused: boolean;
    isBuffering: boolean;
}

export interface UpdatePlayerData {
    currentTime: number;
    duration: number;
    seekableRange: SeekableRange;
    isBuffering: boolean;
    isPaused: boolean;
}

export interface VODProgressManagerData {
    currentTime?: number;
    duration?: number;
    isPaused?: boolean;
    isBuffering?: boolean;

    // Callbacks
    onProgressUpdate?: (data:ProgressUpdateData) => void;
    onSeekRequest?: (playerTime:number) => void;
}

export class VODProgressManager {

    private _currentTime:number;
    private _duration:number;
    private _seekableRange:SeekableRange;

    private _isPaused:boolean = false;
    private _isBuffering:boolean = false;
    private _isEnded:boolean = false;

    private _onProgressUpdate?: (data:ProgressUpdateData) => void;
    private _onSeekRequest?: (playerTime:number) => void;
    
    constructor(options:VODProgressManagerData = {}) {
      
        // Estado del reproductor
        this._currentTime = options.currentTime || 0;
        this._duration = options.duration || 0;
        this._seekableRange = { start: 0, end: this._duration };
        this._isPaused = options.isPaused || false;
        this._isBuffering = options.isBuffering || false;
      
        // Callbacks
        this._onProgressUpdate = options.onProgressUpdate || undefined;
        this._onSeekRequest = options.onSeekRequest || undefined;

    }
  
    /*
     *  Actualiza los datos del reproductor
     * 
     */

    updatePlayerData(data:UpdatePlayerData) {
        const { currentTime, duration, seekableRange, isBuffering, isPaused } = data;
      
        this._currentTime = currentTime || 0;
        this._duration = duration || this._duration;
        this._seekableRange = seekableRange || this._seekableRange;
        this._isEnded = this._currentTime >= this._duration;
        this._isPaused = isPaused || false;
        this._isBuffering = isBuffering || false;
      
        // Emitir actualización
        this._emitProgressUpdate();
    }
  
    /*
     *  Obtiene los valores calculados para el slider
     * 
     */
    
    getSliderValues(): SliderValues {
        return this._getSliderValues();

    }

    /*
     *  Ir al inicio
     * 
     */

    goToStart() {
        this._currentTime = 0;
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
      
        this._seekTo(targetValue);
    }
  
    // MÉTODOS PRIVADOS

    _isValidState(): boolean {
        return this._seekableRange !== null && 
               this._seekableRange.end > 0 && 
               this._currentTime >= 0;
    }

    _getSliderValues(): SliderValues {
        return {
            minimumValue: 0,
            maximumValue: this._duration,
            progress: this._currentTime,
            canSeekToEnd: true,
        };
    }
  
    _seekTo(playerTime:number) {
        // Aquí invocarías el método seek del reproductor
        // player.seek(playerTime);
      
        // Por ahora solo emitimos el evento
        this._emitSeekRequest(playerTime);
    }
  
    _emitProgressUpdate() {
        const sliderValues = this.getSliderValues();
      
        if (this._onProgressUpdate){
            this._onProgressUpdate({
                ...sliderValues,
                isPaused: this._isPaused,
                isBuffering: this._isBuffering,
                isEnded: this._isEnded
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
        this._currentTime = 0;
        this._duration = 0;
        this._seekableRange = { start: 0, end: 0 };
        this._isEnded = false;
        this._isPaused = false;
        this._isBuffering = false;
    }
  
    /*
     *  Obtener estadísticas actuales
     * 
     */

    getStats() {
        return {
            currentTime: this._currentTime,
            duration: this._duration,
            seekableRange: this._seekableRange,
            isEnded: this._isEnded,
            isPaused: this._isPaused,
            isBuffering: this._isBuffering
        };
    }

    // ATRIBUTOS PÚBLICOS
    
    get currentTime() {
        return this._currentTime;
    }

    get duration() {
        return this._duration;
    }

    get isEnded() {
        return this._isEnded;
    }

    get isPaused() {
        return this._isPaused;
    }

    get isBuffering() {
        return this._isBuffering;
    }

}