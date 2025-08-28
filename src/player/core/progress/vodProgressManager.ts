import { type SliderValues } from '../../types/types';
import { BaseProgressManager } from './BaseProgressManager';
import { LOGGER_CONFIG } from './constants';
import { type VODProgressManagerOptions, type VODProgressUpdateData, type VODUpdatePlayerData } from './types/vod';

export class VODProgressManagerClass extends BaseProgressManager {
    
    // Estado específico del VOD
    private _autoSeekToEnd: boolean = false;
    private _enableLooping: boolean = false;

    constructor(options: VODProgressManagerOptions = {}) {
        super(options);
        
        // Configuración específica del VOD
        this._autoSeekToEnd = options.autoSeekToEnd || false;
        this._enableLooping = options.enableLooping || false;
        
        // Inicializar seekableRange basado en duration
        if (this._duration) {
            this._seekableRange = { start: 0, end: this._duration };
        }

        if (options.logger) {
            this._currentLogger = options.logger.forComponent(`VOD ${LOGGER_CONFIG.prefix}`, options.loggerEnabled ?? LOGGER_CONFIG.enabled, options.loggerLevel ?? LOGGER_CONFIG.level);
            this._currentLogger?.info(`Constructor initialized - Duration: ${this._duration}`);
        }
    }

    /*
     *  Implementación de métodos abstractos
     *
     */

    updatePlayerData(data: VODUpdatePlayerData): void {
        this._currentLogger?.debug(`updatePlayerData: ${JSON.stringify({ 
            currentTime: data.currentTime, 
            duration: data.duration,
            seekableRange: data.seekableRange 
        })}`);

        // Usar la validación y actualización base
        this._updateBasicPlayerData(data);
        
        // Lógica específica del VOD
        this._updateVODSpecificData(data);
        
        // Verificar si llegamos al final
        this._checkEndOfContent();
        
        // Emitir actualización
        this._emitProgressUpdate();
    }

    getSliderValues(): SliderValues {
        if (!this._isValidState()) {
            this._currentLogger?.warn('getSliderValues: Invalid state');
            return {
                minimumValue: 0,
                maximumValue: 1,
                progress: 0,
                percentProgress: 0,
                duration: this._duration || undefined,
                canSeekToEnd: false,
                isLiveEdgePosition: false, // VOD nunca está en live edge
            };
        }

        // Calcular porcentaje de progreso (0.0 - 1.0)
        const totalDuration = this._seekableRange.end - this._seekableRange.start;
        const currentProgress = this._currentTime - this._seekableRange.start;
        const percentProgress = totalDuration > 0 ? 
            Math.max(0, Math.min(1, currentProgress / totalDuration)) : 0;
        
        return {
            minimumValue: this._seekableRange.start,
            maximumValue: this._seekableRange.end,
            progress: this._currentTime,
            percentProgress,
            duration: this._duration || undefined,
            canSeekToEnd: true,
            isLiveEdgePosition: false, 
        };
    }

    reset(): void {
        this._currentLogger?.info('Resetting VOD progress manager');
        
        // Reset del estado base
        super.reset();
        
        // Reset específico del VOD
        this._autoSeekToEnd = false;
        this._enableLooping = false;
        
        this._emitProgressUpdate();
    }

    getStats(): any {
        const baseStats = super.getStats();
        
        const vodStats = {
            ...baseStats,
            progress: this._duration ? this._currentTime / this._duration : 0,
            percentProgress: this.getSliderValues().percentProgress,
            isLiveStream: false,
            isProgramLive: false,
            autoSeekToEnd: this._autoSeekToEnd,
            enableLooping: this._enableLooping,
            isNearEnd: this._isNearEnd(),
            remainingTime: this._getRemainingTime()
        };

        this._currentLogger?.debug(`getStats: ${JSON.stringify(vodStats)}`);
        return vodStats;
    }

    /*
     *  Métodos públicos específicos del VOD
     *
     */

    setAutoSeekToEnd(enabled: boolean): void {
        this._autoSeekToEnd = enabled;
        this._currentLogger?.info(`Set auto seek to end: ${enabled}`);
    }

    setLooping(enabled: boolean): void {
        this._enableLooping = enabled;
        this._currentLogger?.info(`Set looping: ${enabled}`);
    }

    goToStart(): void {
        this._currentLogger?.info('Going to start');
        this._seekTo(this._seekableRange.start);
    }

    goToEnd(): void {
        this._currentLogger?.info('Going to end');
        this._seekTo(this._seekableRange.end);
    }

    jumpToPercentage(percentage: number): void {
        if (percentage < 0 || percentage > 1) {
            this._currentLogger?.warn(`Invalid percentage: ${percentage}`);
            return;
        }

        const range = this._seekableRange.end - this._seekableRange.start;
        const targetTime = this._seekableRange.start + (range * percentage);
        
        this._currentLogger?.debug(`Jumping to ${(percentage * 100).toFixed(1)}%`);
        this._seekTo(targetTime);
    }

    getRemainingTime(): number {
        return this._getRemainingTime();
    }

    getProgress(): number {
        return this._duration ? this._currentTime / this._duration : 0;
    }

    isNearEnd(thresholdSeconds: number = 10): boolean {
        return this._getRemainingTime() <= thresholdSeconds;
    }

    /*
     *  Métodos protegidos sobrescritos
     *
     */

    protected _handleSeekTo(playerTime: number): void {
        this._currentLogger?.debug(`VOD seeking to: ${playerTime}`);
        
        // Actualizar currentTime para reflejar el seek inmediatamente
        this._currentTime = playerTime;
        
        // Llamar al callback de seek
        if (this._options.onSeekRequest) {
            this._options.onSeekRequest(playerTime);
        }
        
        // Emitir actualización inmediata
        this._emitProgressUpdate();
    }

    protected _buildProgressData(): VODProgressUpdateData {
        const sliderValues = this.getSliderValues();
        
        return {
            ...sliderValues,
            isPaused: this._isPaused,
            isBuffering: this._isBuffering,
            isLiveEdgePosition: false,
            isProgramLive: false,
        };
    }

    /*
     *  Métodos privados específicos del VOD
     *
     */

    private _updateVODSpecificData(data: VODUpdatePlayerData): void {
        // Actualizar seekableRange si tenemos nueva duración
        if (data.duration && data.duration !== this._duration) {
            this._seekableRange.end = data.duration;
            this._currentLogger?.debug(`Updated seekableRange end to: ${data.duration}`);
        }
    }

    private _checkEndOfContent(): void {
        if (!this._duration) return;

        const isAtEnd = this._currentTime >= this._duration - 1; // 1 segundo de tolerancia
        
        if (isAtEnd) {
            this._currentLogger?.info('Reached end of content');
            
            if (this._enableLooping) {
                this._currentLogger?.info('Looping enabled, going to start');
                setTimeout(() => this.goToStart(), 100);
            } else if (this._autoSeekToEnd) {
                this._currentLogger?.info('Auto seek to end enabled');
                this.goToEnd();
            }
        }
    }

    private _getRemainingTime(): number {
        if (!this._duration) return 0;
        return Math.max(0, this._duration - this._currentTime);
    }

    private _isNearEnd(thresholdSeconds: number = 10): boolean {
        return this._getRemainingTime() <= thresholdSeconds;
    }

    /*
     *  Validación específica del VOD
     *
     */

    protected _isValidState(): boolean {
        const baseValid = super._isValidState();
        
        // VOD requiere duración válida
        const vodValid = this._duration !== null && this._duration > 0;
        
        if (!vodValid) {
            this._currentLogger?.warn('VOD invalid state: no duration');
        }
        
        return baseValid && vodValid;
    }

    /*
     *  Destrucción específica del VOD
     *
     */

    destroy(): void {
        this._currentLogger?.info('Destroying VOD progress manager');
        super.destroy();
        
        this._autoSeekToEnd = false;
        this._enableLooping = false;
    }
}