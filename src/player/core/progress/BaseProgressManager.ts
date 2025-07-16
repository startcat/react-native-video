import { LOG_ENABLED, LOG_KEY, LOG_LEVEL, LOG_TYPE_LEVELS } from './constants';
import {
    type BaseProgressManagerOptions,
    type BaseSliderValues,
    type BaseUpdatePlayerData,
    type SeekableRange
} from './types/base';

export abstract class BaseProgressManager {
    // Estado común del reproductor
    protected _currentTime: number = 0;
    protected _duration: number | null = null;
    protected _seekableRange: SeekableRange = { start: 0, end: 0 };
    protected _isPaused: boolean = false;
    protected _isBuffering: boolean = false;

    // Callbacks comunes
    protected _options: {
        onProgressUpdate?: ((data: any) => void) | null;
        onSeekRequest?: ((playerTime: number) => void) | null;
        onValidationError?: ((error: string) => void) | null;
    } = {};

    constructor(options: BaseProgressManagerOptions = {}) {
        this._options = {
            onProgressUpdate: undefined,
            onSeekRequest: undefined,
            onValidationError: undefined,
            ...options
        };

        // Estado inicial
        this._currentTime = options.currentTime || 0;
        this._duration = options.duration || null;
        this._isPaused = options.isPaused || false;
        this._isBuffering = options.isBuffering || false;

        this.log('Constructor initialized', 'info');
    }

    /*
     *  Métodos públicos comunes
     *
     */

    abstract updatePlayerData(data: BaseUpdatePlayerData): Promise<void> | void;
    abstract getSliderValues(): BaseSliderValues;
    abstract reset(): void;
    abstract getStats(): any;

    // Métodos de callbacks comunes
    updateCallbacks(callbacks: {
        onProgressUpdate?: ((data: any) => void) | null;
        onSeekRequest?: ((playerTime: number) => void) | null;
        onValidationError?: ((error: string) => void) | null;
    }): void {

        if ('onProgressUpdate' in callbacks) {
            this._options.onProgressUpdate = callbacks.onProgressUpdate;
        }

        if ('onSeekRequest' in callbacks) {
            this._options.onSeekRequest = callbacks.onSeekRequest;
        }

        if ('onValidationError' in callbacks) {
            this._options.onValidationError = callbacks.onValidationError;
        }

        const updatedCallbacks = Object.keys(callbacks);
        this.log(`updateCallbacks - Updated ${updatedCallbacks.length} callbacks`, 'debug');

    }

    // Métodos de seeking comunes
    skipForward(seconds: number): void {
        if (!this._isValidState()) {
            this.log('skipForward: Invalid state', 'warn');
            return;
        }
        
        const newTime = this._currentTime + seconds;
        this._seekTo(newTime);
    }

    skipBackward(seconds: number): void {
        if (!this._isValidState()) {
            this.log('skipBackward: Invalid state', 'warn');
            return;
        }
        
        const newTime = Math.max(0, this._currentTime - seconds);
        this._seekTo(newTime);
    }

    seekToProgress(progress: number): void {
        if (!this._isValidState()) {
            this.log('seekToProgress: Invalid state', 'warn');
            return;
        }

        const sliderValues = this.getSliderValues();
        const range = sliderValues.maximumValue - sliderValues.minimumValue;
        const targetValue = sliderValues.minimumValue + (range * progress);
        
        this._seekTo(targetValue);
    }

    seekToTime(time: number): void {
        if (!this._isValidState()) {
            this.log('seekToTime: Invalid state', 'warn');
            return;
        }

        this._seekTo(time);
    }

    setDuration(duration: number | null): void {
        this._duration = duration;
        this.log(`Duration set to: ${duration}`, 'debug');
        this._emitProgressUpdate();
    }

    /*
     *  Getters públicos comunes
     *
     */

    get currentTime(): number {
        return this._currentTime;
    }

    get duration(): number | null {
        return this._duration;
    }

    get isPaused(): boolean {
        return this._isPaused;
    }

    get isBuffering(): boolean {
        return this._isBuffering;
    }

    get seekableRange(): SeekableRange {
        return this._seekableRange;
    }

    /*
     *  Métodos protegidos para las clases hijas
     *
     */

    protected _isValidState(): boolean {
        return this._seekableRange !== null && 
               this._seekableRange.end > 0 &&
               this._currentTime >= 0;
    }

    protected _validatePlayerData(data: BaseUpdatePlayerData): BaseUpdatePlayerData {
        
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

        if (data.duration !== undefined && (typeof data.duration !== 'number' || data.duration < 0)) {
            this.log('Invalid duration, correcting', 'warn');
            data.duration = undefined;
        }

        return data;
    }

    protected _updateBasicPlayerData(data: BaseUpdatePlayerData): void {
        const validatedData = this._validatePlayerData(data);
        
        this._currentTime = validatedData.currentTime;
        this._seekableRange = validatedData.seekableRange;
        this._duration = validatedData.duration || this._duration;
        this._isPaused = validatedData.isPaused;
        this._isBuffering = validatedData.isBuffering;
    }

    protected _seekTo(playerTime: number): void {
        // Validar que el tiempo esté dentro del rango válido
        const clampedTime = Math.max(
            this._seekableRange.start, 
            Math.min(this._seekableRange.end, playerTime)
        );
        
        this.log(`Seeking to: ${clampedTime}`, 'debug');
        
        // Las clases hijas pueden sobrescribir este método para lógica específica
        this._handleSeekTo(clampedTime);
    }

    protected _handleSeekTo(playerTime: number): void {
        // Lógica base de seek - las clases hijas pueden sobrescribir
        if (this._options.onSeekRequest) {
            this._options.onSeekRequest(playerTime);
        }
        
        this._emitProgressUpdate();
    }

    protected _emitProgressUpdate(): void {
        if (!this._isValidState()) {
            this.log('_emitProgressUpdate: Invalid state, skipping', 'warn');
            return;
        }

        try {
            const progressData = this._buildProgressData();
            
            if (this._options.onProgressUpdate) {
                this._options.onProgressUpdate(progressData);
            }
        } catch (error) {
            this.log('_emitProgressUpdate error', 'error', error);
        }
    }

    protected _buildProgressData(): any {
        // Método que las clases hijas deben sobrescribir para construir sus datos específicos
        const sliderValues = this.getSliderValues();
        
        return {
            ...sliderValues,
            isPaused: this._isPaused,
            isBuffering: this._isBuffering,
            canSeekToEnd: true
        };
    }

    protected _emitValidationError(error: string): void {
        this.log(`Validation error: ${error}`, 'error');
        if (this._options.onValidationError) {
            this._options.onValidationError(error);
        }
    }

    /*
     *  Sistema de logs
     *
     */

    protected log(message: string, type: 'debug' | 'info' | 'warn' | 'error' = 'info', data?: any): void {
        const logLevel = LOG_TYPE_LEVELS[type];
        const minLogLevel = LOG_TYPE_LEVELS[LOG_LEVEL];

        if (LOG_ENABLED && minLogLevel <= logLevel) {
            const className = this.constructor.name;
            console[type](`${LOG_KEY}[${className}] ${message}${data ? ` :: ${JSON.stringify(data)}` : ''}`);
        }
    }

    /*
     *  Método de destrucción común
     *
     */

    destroy(): void {
        this.log('Destroying manager', 'info');
        // Las clases hijas pueden sobrescribir para limpiar recursos específicos
    }
}