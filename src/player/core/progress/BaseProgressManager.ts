import { ComponentLogger } from '../../features/logger';
import { type SliderValues } from '../../types/types';
import { formatTimestamp } from '../../utils/time';
import {
	type BaseProgressManagerOptions,
	type BaseUpdatePlayerData,
	type SeekableRange,
} from './types/base';

export abstract class BaseProgressManager {
	// Estado común del reproductor
	protected _currentTime: number = 0;
	protected _duration: number | null = null;
	protected _seekableRange: SeekableRange = { start: 0, end: 0 };
	protected _isPaused: boolean = false;
	protected _isBuffering: boolean = false;

	// Estado de inicialización
	protected _hasReceivedPlayerData: boolean = false;
	protected _isInitialized: boolean = false;

	// Logger
	protected _currentLogger: ComponentLogger | null = null;

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
			...options,
		};

		// Estado inicial
		this._currentTime = options.currentTime || 0;
		this._duration = options.duration || null;
		this._isPaused = options.isPaused || false;
		this._isBuffering = options.isBuffering || false;
	}

	/*
	 *  Métodos públicos comunes
	 *
	 */

	abstract updatePlayerData(data: BaseUpdatePlayerData): Promise<void> | void;
	abstract getSliderValues(): SliderValues;

	reset(): void {
		this._currentLogger?.info('Resetting base progress manager');

		// Reset del estado base
		this._currentTime = 0;
		this._duration = null;
		this._seekableRange = { start: 0, end: 0 };
		this._isPaused = false;
		this._isBuffering = false;
		this._hasReceivedPlayerData = false;
		this._isInitialized = false;

		this._emitProgressUpdate();
	}

	getStats(): any {
		return {
			currentTime: this._currentTime,
			duration: this._duration,
			seekableRange: this._seekableRange,
			isPaused: this._isPaused,
			isBuffering: this._isBuffering,
			hasReceivedPlayerData: this._hasReceivedPlayerData,
			isInitialized: this._isInitialized,
			isValidState: this._isValidState(),
		};
	}

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
		this._currentLogger?.debug(
			`updateCallbacks - Updated ${updatedCallbacks.length} callbacks`
		);
	}

	// Métodos de seeking comunes
	skipForward(seconds: number): void {
		if (!this._isValidState()) {
			this._currentLogger?.debug('skipForward: Invalid state - operation queued until ready');
			return;
		}

		const newTime = this._currentTime + seconds;
		this._seekTo(newTime);
	}

	skipBackward(seconds: number): void {
		if (!this._isValidState()) {
			this._currentLogger?.debug(
				'skipBackward: Invalid state - operation queued until ready'
			);
			return;
		}

		const newTime = Math.max(0, this._currentTime - seconds);
		this._seekTo(newTime);
	}

	seekToProgress(progress: number): void {
		if (!this._isValidState()) {
			this._currentLogger?.debug(
				'seekToProgress: Invalid state - operation queued until ready'
			);
			return;
		}

		const sliderValues = this.getSliderValues();
		const range = sliderValues.maximumValue - sliderValues.minimumValue;
		const targetValue = sliderValues.minimumValue + range * progress;

		this._seekTo(targetValue);
	}

	seekToTime(time: number): void {
		if (!this._isValidState()) {
			this._currentLogger?.debug('seekToTime: Invalid state - operation queued until ready');
			return;
		}

		this._seekTo(time);
	}

	setDuration(duration: number | null): void {
		this._duration = duration;
		this._currentLogger?.info(`Duration set to: ${duration}`);
		this._emitProgressUpdate();
	}

	public setManualSeeking(isManualSeeking: boolean): void {
		this._currentLogger?.debug(`Manual seeking: ${isManualSeeking}`);
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

	get isInitialized(): boolean {
		return this._isInitialized;
	}

	get hasReceivedPlayerData(): boolean {
		return this._hasReceivedPlayerData;
	}

	/*
	 *  Métodos protegidos para las clases hijas
	 *
	 */

	protected _isValidState(): boolean {
		const hasValidSeekableRange = this._seekableRange !== null && this._seekableRange.end > 0;
		const hasValidCurrentTime = this._currentTime >= 0;

		const isValid = hasValidSeekableRange && hasValidCurrentTime && this._hasReceivedPlayerData;

		if (!isValid) {
			this._currentLogger?.debug(
				`State validation failed - seekableRange: ${JSON.stringify(this._seekableRange)}, currentTime: ${this._currentTime}, hasPlayerData: ${this._hasReceivedPlayerData}`
			);
		}

		return isValid;
	}

	protected _markAsInitialized(): void {
		if (!this._isInitialized) {
			this._isInitialized = true;
			this._currentLogger?.info('Manager fully initialized and ready');
		}
	}

	protected _validatePlayerData(data: BaseUpdatePlayerData): BaseUpdatePlayerData {
		// Validación básica con corrección automática
		if (typeof data.currentTime !== 'number' || data.currentTime < 0) {
			this._currentLogger?.debug('Invalid currentTime, correcting to 0');
			data.currentTime = 0;
		}

		const currentTimeVariation = Math.abs(data.currentTime - this._currentTime);

		if (
			!data.seekableRange ||
			typeof data.seekableRange.start !== 'number' ||
			typeof data.seekableRange.end !== 'number' ||
			data.seekableRange.start > data.seekableRange.end
		) {
			this._currentLogger?.debug("Invalid seekableRange, correcting");
			data.seekableRange = { start: 0, end: Math.max(data.currentTime, 1) };
		}

		if (
			this._seekableRange.end > 0 &&
			Math.abs(data.seekableRange.end - this._seekableRange.end) < 10 &&
			currentTimeVariation < 2
		) {
			this._currentLogger?.debug('Normalizing seekableRange, correcting');
			data.seekableRange = {
				start: this._seekableRange.start,
				end: this._seekableRange.end + currentTimeVariation,
			};
		}

		if (
			data.duration !== undefined &&
			(typeof data.duration !== 'number' || data.duration < 0)
		) {
			this._currentLogger?.debug('Invalid duration, correcting');
			data.duration = undefined;
		}

		return data;
	}

	protected _updateBasicPlayerData(data: BaseUpdatePlayerData): void {
		const wasValidBefore = this._isValidState();
		const validatedData = this._validatePlayerData(data);

		this._currentTime = validatedData.currentTime;
		this._seekableRange = validatedData.seekableRange;
		this._duration = validatedData.duration || this._duration;
		this._isPaused = validatedData.isPaused;
		this._isBuffering = validatedData.isBuffering;

		// Marcar que hemos recibido datos del reproductor
		if (!this._hasReceivedPlayerData) {
			this._hasReceivedPlayerData = true;
			this._currentLogger?.info('Received first player data');
		}

		// Verificar si el estado se volvió válido
		const isValidNow = this._isValidState();
		if (!wasValidBefore && isValidNow) {
			this._currentLogger?.info('State became valid - manager ready for operations');
		}
	}

	protected _seekTo(playerTime: number): void {
		// Validar que el tiempo esté dentro del rango válido
		const clampedTime = Math.max(
			this._seekableRange.start,
			Math.min(this._seekableRange.end, playerTime)
		);

		this._currentLogger?.debug(`Seeking to: ${clampedTime}`);

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
		if (!this._hasReceivedPlayerData) {
			this._currentLogger?.debug(
				'_emitProgressUpdate: No player data received yet, skipping'
			);
			return;
		}

		if (!this._isValidState()) {
			this._currentLogger?.debug(
				'_emitProgressUpdate: Invalid state, emitting fallback data'
			);
			// Emitir datos básicos para mantener la UI funcionando
			this._emitFallbackProgressUpdate();
			return;
		}

		try {
			const progressData = this._buildProgressData();

			this._currentLogger?.debug(
				'_emitProgressUpdate :: ' +
					`${formatTimestamp(progressData.progress)} / ${formatTimestamp(progressData.maximumValue)} ` +
					`(${((progressData.percentProgress || 0) * 100).toFixed(1)}%)`
			);

			// this._currentLogger?.temp(`[BaseProgressManager] _emitProgressUpdate :: ` +
			//     `Window: ${formatTimestamp(progressData.minimumValue)} - ${formatTimestamp(progressData.maximumValue)} ` +
			//     `[${formatTimestampDifference(progressData.minimumValue, progressData.maximumValue)}]`
			// );

			// this._currentLogger?.temp(`[BaseProgressManager] _emitProgressUpdate :: ` +
			//     `Live Edge: ${progressData.isLiveEdgePosition ? '🔴 LIVE' : '⏸️ DELAYED'} ` +
			//     `-${formatOffset(progressData.liveEdgeOffset)} ` +
			//     `(${((progressData.percentLiveEdge || 0) * 100).toFixed(1)}% of slider)`
			// );

			// this._currentLogger?.temp(`[BaseProgressManager] _emitProgressUpdate :: ` +
			//     `Progress: ${formatTimestamp(progressData.progressDatum)} ` +
			//     `| Live: ${formatTimestamp(progressData.liveEdge)} ` +
			//     `| Mode: ${progressData.playbackType || 'WINDOW'}`
			// );

			if (this._options.onProgressUpdate) {
				this._options.onProgressUpdate(progressData);
			}
		} catch (error) {
			this._currentLogger?.error('_emitProgressUpdate error', error);
			this._emitFallbackProgressUpdate();
		}
	}

	protected _emitFallbackProgressUpdate(): void {
		// Emitir datos mínimos para mantener la UI funcionando
		const fallbackData = {
			minimumValue: 0,
			maximumValue: 1,
			progress: 0,
			percentProgress: 0,
			isPaused: this._isPaused,
			isBuffering: this._isBuffering,
			canSeekToEnd: false,
		};

		if (this._options.onProgressUpdate) {
			this._options.onProgressUpdate(fallbackData);
		}
	}

	protected _buildProgressData(): any {
		// Método que las clases hijas deben sobrescribir para construir sus datos específicos
		const sliderValues = this.getSliderValues();

		return {
			...sliderValues,
			isPaused: this._isPaused,
			isBuffering: this._isBuffering,
			canSeekToEnd: true,
		};
	}

	protected _emitValidationError(error: string): void {
		this._currentLogger?.warn(`Validation error: ${error}`);
		if (this._options.onValidationError) {
			this._options.onValidationError(error);
		}
	}

	/*
	 *  Método de destrucción común
	 *  Las clases hijas pueden sobrescribir para limpiar recursos específicos
	 *
	 */

	destroy(): void {
		this._currentLogger?.info('Destroying manager');
	}
}
