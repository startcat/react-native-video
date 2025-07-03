import { 
    type SeekableRange,
    type SliderValues,
    type ProgressUpdateData
} from "../../types";


export interface UpdatePlayerData {
    currentTime: number;
    seekableRange: SeekableRange;
    duration: number;
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

export class VODProgressManagerClass {

    private _currentTime: number;
    private _duration: number;
    private _seekableRange: SeekableRange;

    private _isPaused: boolean = false;
    private _isBuffering: boolean = false;

    private _onProgressUpdate?: (data:ProgressUpdateData) => void;
    private _onSeekRequest?: (playerTime:number) => void;
    
    constructor(options: VODProgressManagerData = {}) {
        // Estado del reproductor VOD
        this._currentTime = options.currentTime || 0;
        this._duration = options.duration || 0;
        this._seekableRange = { start: 0, end: this._duration };
        this._isPaused = options.isPaused || false;
        this._isBuffering = options.isBuffering || false;
      
        // Callbacks
        this._onProgressUpdate = options.onProgressUpdate;
        this._onSeekRequest = options.onSeekRequest;
      
        console.log(`[Player] (VOD Progress Manager) Constructor - Stats ${JSON.stringify(this.getStats())}`);
    }
  
    /*
     *  Actualiza los datos del reproductor
     * 
     */

    updatePlayerData(data: UpdatePlayerData) {
        console.log(`[Player] (VOD Progress Manager) updatePlayerData...`);
        const { currentTime, seekableRange, duration, isPaused, isBuffering } = data;
      
        this._currentTime = currentTime || 0;
        this._duration = duration || this._duration;
        this._seekableRange = seekableRange || { start: 0, end: this._duration };
        this._isPaused = isPaused;
        this._isBuffering = isBuffering;
      
        // Emitir actualización
        this._emitProgressUpdate();

        console.log(`[Player] (VOD Progress Manager) updatePlayerData - Stats ${JSON.stringify(this.getStats())}`);
    }
  
    /*
     *  Obtiene los valores calculados para el slider VOD
     * 
     */
    
    getSliderValues(): SliderValues {
        return {
            minimumValue: this._seekableRange.start,
            maximumValue: this._seekableRange.end,
            progress: this._currentTime,
            canSeekToEnd: true,
            isProgramLive: false // VOD nunca está en vivo
        };
    }
  
    /*
     *  Avanzar tiempo determinado (en segundos)
     * 
     */

    skipForward(seconds: number) {
        const newTime = Math.min(this._duration, this._currentTime + seconds);
        this._seekTo(newTime);
    }
  
    /*
     *  Retroceder tiempo determinado (en segundos)
     * 
     */

    skipBackward(seconds: number) {
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
  
    /*
     *  Buscar a una posición específica en segundos
     * 
     */

    seekToTime(time: number) {
        this._seekTo(time);
    }
  
    // MÉTODOS PRIVADOS
  
    private _seekTo(playerTime: number) {
        // Validar que el tiempo esté dentro del rango válido
        const clampedTime = Math.max(
            this._seekableRange.start, 
            Math.min(this._seekableRange.end, playerTime)
        );
        
        // Actualizar el tiempo actual
        this._currentTime = clampedTime;
        
        // Emitir solicitud de seek
        this._emitSeekRequest(clampedTime);
    }

    private _emitProgressUpdate() {
        const sliderValues = this.getSliderValues();
      
        if (this._onProgressUpdate) {
            this._onProgressUpdate({
                ...sliderValues,
                isPaused: this._isPaused,
                isBuffering: this._isBuffering,
                isLiveEdgePosition: false,
            });
        }
    }
  
    private _emitSeekRequest(playerTime: number) {
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
        this._currentTime = 0;
        this._seekableRange = { start: 0, end: this._duration };

        console.log(`[Player] (VOD Progress Manager) reset - Stats ${JSON.stringify(this.getStats())}`);
    }
  
    /*
     *  Obtener estadísticas actuales
     * 
     */

    getStats() {
        console.log(`[Player] (VOD Progress Manager) getStats...`);
        return {
            currentTime: this._currentTime,
            duration: this._duration,
            progress: this._duration > 0 ? this._currentTime / this._duration : 0,
            isPaused: this._isPaused,
            isBuffering: this._isBuffering
        };
    }

    // GETTERS PÚBLICOS
    
    get currentTime() {
        return this._currentTime;
    }
    
    get duration() {
        return this._duration;
    }
    
    get progress() {
        return this._duration > 0 ? this._currentTime / this._duration : 0;
    }
    
    get isPaused() {
        return this._isPaused;
    }
    
    get isBuffering() {
        return this._isBuffering;
    }

}