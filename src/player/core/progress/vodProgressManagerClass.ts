import {
    type ProgressUpdateData,
    type SeekableRange,
    type SliderValues
} from "../../types";

import { type BaseUpdatePlayerData } from "./types/base";

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
        this._seekableRange = { start: 0, end: options.duration || 0 };
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

    // Método para actualizar callbacks cuando cambian las referencias
    updateCallbacks(callbacks: {
        onProgressUpdate?: ((data: ProgressUpdateData) => void) | null;
        onSeekRequest?: ((playerTime: number) => void) | null;
    }): void {

        if (callbacks.onProgressUpdate) {
            this._onProgressUpdate = callbacks.onProgressUpdate;
        }
        if (callbacks.onSeekRequest) {
            this._onSeekRequest = callbacks.onSeekRequest;
        }

        // this.log(`updateCallbacks - Updated ${updatedCallbacks.length} callbacks`, 'debug');
    }

    updatePlayerData(data: BaseUpdatePlayerData) {
        // console.log(`[Player] (VOD Progress Manager) updatePlayerData...`);
        const { currentTime, seekableRange, duration, isPaused, isBuffering } = data;
      
        this._currentTime = currentTime || 0;
        this._duration = duration || this._duration;
        this._seekableRange = seekableRange || this._seekableRange;
        this._isPaused = isPaused;
        this._isBuffering = isBuffering;
      
        // Emitir actualización
        this._emitProgressUpdate();

        // console.log(`[Player] (VOD Progress Manager) updatePlayerData - Stats ${JSON.stringify(this.getStats())}`);
    }
  
    /*
     *  Obtiene los valores calculados para el slider VOD
     * 
     */
    
    getSliderValues(): SliderValues {
        // Calcular porcentaje de progreso (0.0 - 1.0)
        const totalDuration = this._seekableRange.end - this._seekableRange.start;
        const currentProgress = this._currentTime - this._seekableRange.start;
        const percentProgress = totalDuration > 0 ? Math.max(0, Math.min(1, currentProgress / totalDuration)) : 0;
        
        return {
            minimumValue: this._seekableRange.start,
            maximumValue: this._seekableRange.end,
            progress: this._currentTime,
            percentProgress: percentProgress,
            duration: this._duration,
            canSeekToEnd: true
        };
    }
  
    /*
     *  Avanzar tiempo determinado (en segundos)
     * 
     */

    skipForward(seconds: number) {
        const newTime = Math.min(this._seekableRange.end, this._currentTime + seconds);
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
                isProgramLive: false, // VOD nunca está en vivo
                canSeekToEnd: true // VOD siempre permite seek al final
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
        this._duration = 0;
        this._seekableRange = { start: 0, end: 0 };
        this._isPaused = false;
        this._isBuffering = false;

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