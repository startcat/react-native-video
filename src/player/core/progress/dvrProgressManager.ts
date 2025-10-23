import { type PlaylistItemSimplified } from "../../features/playlists/types";
import { type SliderValues } from "../../types/types";
import { BaseProgressManager } from "./BaseProgressManager";
import {
	EPG_RETRY_DELAYS,
	LIVE_EDGE_TOLERANCE,
	LOGGER_CONFIG,
	PROGRESS_SIGNIFICANT_CHANGE,
} from "./constants";
import {
	type DVRProgressManagerOptions,
	type DVRProgressUpdateData,
	type DVRUpdatePlayerData,
	type EPGErrorData,
	type ModeChangeData,
	type ProgramChangeData,
} from "./types/dvr";
import { DVR_PLAYBACK_TYPE } from "./types/enums";

export class DVRProgressManagerClass extends BaseProgressManager {
	// Estado específico del DVR
	private _initialTimeWindowSeconds: number | null = null; // Solo referencia del CMS
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
	private _epgRetryTimeouts: Map<number, ReturnType<typeof setTimeout>> = new Map();

	// Manual seeking (CORREGIDO: sin timeout automático)
	private _isManualSeeking: boolean = false;

	// Referencia al item de playlist actual (para hooks)
	private _currentPlaylistItem: PlaylistItemSimplified | null = null;

	// Callbacks específicos del DVR
	private _dvrCallbacks: {
		getEPGProgramAt?:
			| ((item: PlaylistItemSimplified, timestamp: number) => Promise<any>)
			| null;
		onModeChange?: ((data: ModeChangeData) => void) | null;
		onProgramChange?: ((data: ProgramChangeData) => void) | null;
		onEPGRequest?: ((timestamp: number) => void) | null;
		onEPGError?: ((data: EPGErrorData) => void) | null;
	} = {};

	constructor(options: DVRProgressManagerOptions = {}) {
		super(options);

		if (options.logger) {
			this._currentLogger = options.logger.forComponent(
				`DVR ${LOGGER_CONFIG.prefix}`,
				options.loggerEnabled ?? LOGGER_CONFIG.enabled,
				options.loggerLevel ?? LOGGER_CONFIG.level
			);
		}

		// Configuración específica del DVR
		this._initialTimeWindowSeconds = options.dvrWindowSeconds || null; // Solo referencia
		this._playbackType = options.playbackType || DVR_PLAYBACK_TYPE.WINDOW;

		this._currentLogger?.info(
			`Constructor - playbackType: ${this._playbackType}, currentProgram: ${options.currentProgram ? JSON.stringify({ id: options.currentProgram.id, startDate: options.currentProgram.startDate, endDate: options.currentProgram.endDate }) : "null"}`
		);

		// Programa actual si se proporciona (para inicialización en modo PROGRAM/PLAYLIST)
		if (options.currentProgram) {
			this._currentProgram = options.currentProgram;
		}

		// Playlist item actual si se proporciona
		if (options.playlistItem) {
			this._currentPlaylistItem = options.playlistItem;
		}

		// Callbacks específicos del DVR
		this._dvrCallbacks = {
			getEPGProgramAt: options.getEPGProgramAt,
			onModeChange: options.onModeChange,
			onProgramChange: options.onProgramChange,
			onEPGRequest: options.onEPGRequest,
			onEPGError: options.onEPGError,
		};

		this._currentLogger?.info(
			`Constructor initialized - Waiting for seekableRange data from player`
		);
	}

	/*
	 *  Implementación de métodos abstractos
	 *
	 */

	async updatePlayerData(data: DVRUpdatePlayerData): Promise<void> {
		if (!data) return;

		this._currentLogger?.debug(
			`updatePlayerData: ${JSON.stringify({
				currentTime: data.currentTime,
				seekableRange: data.seekableRange,
				hasReceivedDataBefore: this._hasReceivedPlayerData,
				isManualSeeking: this._isManualSeeking,
			})}`
		);

		const wasValidBefore = this._isValidState();

		// Gestión de pausas ANTES de actualizar estado básico
		this._updateDVRPauseTracking(data.isPaused, data.isBuffering);

		// Usar la validación y actualización base
		this._updateBasicPlayerData(data);

		const isValidNow = this._isValidState();

		// Calcular ventana desde seekableRange (fuente de verdad)
		if (isValidNow) {
			this._updateTimeWindowFromSeekableRange();
		}

		this._currentLogger?.debug(
			`State validation after update: ${JSON.stringify({
				wasValidBefore,
				isValidNow,
				currentTime: this._currentTime,
				seekableRange: this._seekableRange,
				hasReceivedPlayerData: this._hasReceivedPlayerData,
				isManualSeeking: this._isManualSeeking,
			})}`
		);

		// Solo ejecutar lógica compleja si el estado es válido
		if (isValidNow) {
			this._currentLogger?.debug("Executing DVR-specific logic");

			// Solo actualizar live edge position si NO estamos en seek manual
			if (!this._isManualSeeking) {
				this._updateLiveEdgePosition();
				this._checkSignificantProgressChange();
			} else {
				this._currentLogger?.debug("Skipping live edge update during manual seeking");
			}

			// EPG en modo PLAYLIST/PROGRAM
			if (
				(this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST ||
					this._playbackType === DVR_PLAYBACK_TYPE.PROGRAM) &&
				this._dvrCallbacks.getEPGProgramAt
			) {
				this._checkProgramChange().catch(console.error);
			}

			// Marcar como inicializado cuando todo esté listo
			if (!this._isInitialized) {
				this._initializeStreamTimesFromSeekableRange();
				this._markAsInitialized();
			}
		}

		// Si el estado se volvió válido, obtener programa inicial
		if (!wasValidBefore && isValidNow && !this._currentProgram) {
			this._currentLogger?.debug("Getting initial program info");
			this.getCurrentProgramInfo().catch(console.error);
		}

		// Mostrar información de debug con formato solicitado (solo si no estamos pausados)
		if (!this._isPaused && !this._isBuffering) {
			this._logProgressInfo();
		}

		// Siempre emitir update
		this._currentLogger?.debug(
			`About to emit progress update: ${JSON.stringify({
				isValidState: isValidNow,
				hasCallback: !!this._options.onProgressUpdate,
				isManualSeeking: this._isManualSeeking,
			})}`
		);

		this._emitProgressUpdate();
	}

	getSliderValues(): SliderValues {
		this._currentLogger?.debug(
			`getSliderValues called: ${JSON.stringify({
				isValidState: this._isValidState(),
				currentTime: this._currentTime,
				seekableRange: this._seekableRange,
			})}`
		);

		if (!this._isValidState()) {
			this._currentLogger?.warn("getSliderValues: Invalid state");
			return {
				minimumValue: 0,
				maximumValue: 1,
				progress: 0,
				percentProgress: 0,
				liveEdge: null,
				percentLiveEdge: 0,
				progressDatum: null,
				liveEdgeOffset: null,
				canSeekToEnd: false,
				isProgramLive: false,
				isLiveEdgePosition: false,
			};
		}

		const { minimumValue, maximumValue } = this._getSliderBounds();
		const progress = this._getProgressValue();
		const liveEdge = this._getCurrentLiveEdge();
		const range = maximumValue - minimumValue;

		const result = {
			minimumValue,
			maximumValue,
			progress,
			percentProgress:
				range > 0 ? Math.max(0, Math.min(1, (progress - minimumValue) / range)) : 0,
			liveEdge,
			percentLiveEdge:
				range > 0 && liveEdge !== null
					? Math.max(0, Math.min(1, (liveEdge - minimumValue) / range))
					: 0,
			progressDatum: this._getProgressDatum(),
			liveEdgeOffset: this._getLiveEdgeOffset(),
			canSeekToEnd: true,
			isProgramLive: this._isProgramCurrentlyLive(),
			isLiveEdgePosition: this._isLiveEdgePosition,
		};

		this._currentLogger?.debug(
			`getSliderValues final result: ${JSON.stringify({
				result,
				calculations: {
					range,
					progressCalc: `(${progress} - ${minimumValue}) / ${range}`,
					liveEdgeCalc:
						liveEdge !== null ? `(${liveEdge} - ${minimumValue}) / ${range}` : "null",
				},
			})}`
		);

		return result;
	}

	reset(): void {
		this._currentLogger?.info("Resetting DVR progress manager");

		// Reset del estado base
		super.reset();

		// Reset específico del DVR
		this._totalPauseTime = 0;
		this._pauseStartTime = 0;
		this._isLiveEdgePosition = true;
		this._frozenProgressDatum = undefined;
		this._currentProgram = null;
		this._lastProgressForEPG = null;
		this._epgRetryCount.clear();
		this._isManualSeeking = false;

		// Limpiar timeouts de EPG
		this._clearEPGRetryTimeouts();

		// Limpiar interval de pausa si existe
		if (this._pauseUpdateInterval) {
			clearInterval(this._pauseUpdateInterval);
			this._pauseUpdateInterval = null;
		}

		this.setPlaybackType(DVR_PLAYBACK_TYPE.WINDOW);
	}

	/*
	 *  Métodos públicos específicos del DVR
	 *
	 */

	updateDVRCallbacks(callbacks: {
		getEPGProgramAt?:
			| ((item: PlaylistItemSimplified, timestamp: number) => Promise<any>)
			| null;
		onModeChange?: ((data: ModeChangeData) => void) | null;
		onProgramChange?: ((data: ProgramChangeData) => void) | null;
		onEPGRequest?: ((timestamp: number) => void) | null;
		onEPGError?: ((data: EPGErrorData) => void) | null;
	}): void {
		Object.assign(this._dvrCallbacks, callbacks);

		const updatedCallbacks = Object.keys(callbacks);
		this._currentLogger?.debug(
			`updateDVRCallbacks - Updated ${updatedCallbacks.length} DVR callbacks`
		);
	}

	setPlaylistItem(item: PlaylistItemSimplified | null): void {
		this._currentPlaylistItem = item;
		this._currentLogger?.debug(
			`setPlaylistItem - Updated playlist item: ${item ? item.id : "null"}`
		);
	}

	setDVRWindowSeconds(seconds: number): void {
		if (seconds <= 0) {
			this._currentLogger?.warn("setDVRWindowSeconds: Invalid window size");
			return;
		}

		// Solo actualizar referencia - NO bloquea funcionalidad
		this._initialTimeWindowSeconds = seconds;
		this._currentLogger?.info(
			`setDVRWindowSeconds: ${seconds}s (reference only, seekableRange is source of truth)`
		);

		// Si ya tenemos datos válidos, emitir update
		if (this._isValidState()) {
			this._emitProgressUpdate();
		}
	}

	checkInitialSeek(mode: "player" | "cast", isLiveProgramRestricted: boolean): void {
		// CRITICAL: No ejecutar si no tenemos datos válidos del player
		if (!this._hasReceivedPlayerData || !this._isValidState()) {
			this._currentLogger?.warn(
				`checkInitialSeek called but no valid player data yet - deferring initial seek logic`
			);
			this._currentLogger?.debug(
				`checkInitialSeek state: ${JSON.stringify({
					hasReceivedPlayerData: this._hasReceivedPlayerData,
					isValidState: this._isValidState(),
					seekableRange: this._seekableRange,
					currentTime: this._currentTime,
				})}`
			);
			return;
		}

		// Calcular la posición real actual basada en datos del player
		const actualOffset = this._seekableRange.end - this._currentTime;
		const isActuallyAtLiveEdge = actualOffset <= LIVE_EDGE_TOLERANCE;

		this._currentLogger?.info(
			`checkInitialSeek for ${mode} - isLiveProgramRestricted: ${isLiveProgramRestricted}, actualOffset: ${actualOffset.toFixed(1)}s, isActuallyAtLiveEdge: ${isActuallyAtLiveEdge}, playbackType: ${this._playbackType}`
		);

		// PLAYLIST mode: SIEMPRE inicia en live edge (como WINDOW)
		// isLiveProgramRestricted solo afecta a la navegación (límites del slider), NO a la posición inicial
		// IMPORTANTE: En PLAYLIST, siempre hacemos seek al live edge para garantizar posición exacta,
		// incluso si estamos dentro de la tolerancia (ej: al cambiar de directo a directo)
		if (this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST) {
			// Usar tolerancia más estricta (5 segundos) para PLAYLIST mode
			const strictOffset = 5; // segundos
			const needsSeek = actualOffset > strictOffset;
			
			if (needsSeek) {
				this._currentLogger?.info(
					`PLAYLIST mode - going to live edge (actualOffset: ${actualOffset.toFixed(1)}s > ${strictOffset}s)`
				);
				setTimeout(() => {
					this.goToLive();
				}, 300);
			} else {
				this._currentLogger?.info(
					`PLAYLIST mode - already at live edge (offset: ${actualOffset.toFixed(1)}s <= ${strictOffset}s), no seek needed`
				);
			}
			return;
		}

		// PROGRAM mode: inicia en el inicio del programa
		if (this._playbackType === DVR_PLAYBACK_TYPE.PROGRAM && this._currentProgram) {
			this._currentLogger?.info(`PROGRAM mode - seeking to program start`);
			setTimeout(() => {
				this._isLiveEdgePosition = false;
				this.goToProgramStart();
			}, 300);
			return;
		}

		// WINDOW mode: si no estamos en live edge, ir al live edge
		if (!isActuallyAtLiveEdge) {
			this._currentLogger?.info(
				`WINDOW mode - going to live edge (offset: ${actualOffset.toFixed(1)}s)`
			);
			setTimeout(() => {
				this.goToLive();
			}, 300);
			return;
		}

		this._currentLogger?.debug(
			`checkInitialSeek - No action needed (already at correct position)`
		);
	}

	async setPlaybackType(playbackType: DVR_PLAYBACK_TYPE, program: any = null): Promise<void> {
		if (!this._isValidState()) {
			this._currentLogger?.error(`setPlaybackType: Invalid state`);
			throw new Error("setPlaybackType: Invalid state");
		}

		const previousType = this._playbackType;
		this._currentLogger?.info(`setPlaybackType: ${previousType} -> ${playbackType}`);

		this._playbackType = playbackType;

		// Obtener programa si es necesario
		if (
			(playbackType === DVR_PLAYBACK_TYPE.PROGRAM ||
				playbackType === DVR_PLAYBACK_TYPE.PLAYLIST) &&
			!program &&
			this._dvrCallbacks.getEPGProgramAt &&
			this._currentPlaylistItem
		) {
			try {
				const timestamp = this._getProgressDatum();
				program = await this._dvrCallbacks.getEPGProgramAt(
					this._currentPlaylistItem,
					timestamp
				);
			} catch (error) {
				this._currentLogger?.error(
					`Error getting program for mode change: ${JSON.stringify(error)}`
				);
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
				program: this._currentProgram,
			});
		}

		this._emitProgressUpdate();
	}

	goToProgramStart(): void {
		if (!this._isValidState() || !this._currentProgram) {
			this._currentLogger?.warn("goToProgramStart: Invalid state or no program");
			return;
		}

		this._currentLogger?.info(`goToProgramStart to: ${this._currentProgram.startDate}`);
		this._isLiveEdgePosition = false;

		// Si estamos pausados, actualizar la posición congelada al inicio del programa
		if (this._isPaused || this._isBuffering) {
			this._frozenProgressDatum = this._currentProgram.startDate;
			this._currentLogger?.debug(
				`Updated frozen position to program start during pause: ${this._frozenProgressDatum}`
			);
		}

		const playerTime = this._timestampToPlayerTime(this._currentProgram.startDate);
		this._handleSeekTo(playerTime);
	}

	goToLive(): void {
		if (!this._isValidState()) {
			this._currentLogger?.warn("goToLive: Invalid state");
			return;
		}

		this._currentLogger?.info("goToLive");
		this._isLiveEdgePosition = true;

		// Si estamos pausados, actualizar la posición congelada al live edge
		if (this._isPaused || this._isBuffering) {
			this._frozenProgressDatum = this._getCurrentLiveEdge();
			this._currentLogger?.debug(
				`Updated frozen position to live edge during pause: ${this._frozenProgressDatum}`
			);
		}

		const liveEdge = this._getCurrentLiveEdgePlayerTime();
		this._handleSeekTo(liveEdge);
	}

	seekToTime(time: number): void {
		if (!this._isValidState()) {
			this._currentLogger?.warn("seekToTime: Invalid state - operation queued until ready");
			return;
		}

		this._currentLogger?.debug(`seekToTime called with: ${time} (mode: ${this._playbackType})`);

		// NOTA: Manual seeking se controla desde eventos de slider externos
		// No establecemos _isManualSeeking aquí

		// time es un timestamp, necesitamos convertir a playerTime
		// En todos los modos, time viene como timestamp absoluto

		// Lógica específica para modo PLAYLIST
		if (this._playbackType === DVR_PLAYBACK_TYPE.PLAYLIST && this._currentProgram) {
			this._handlePlaylistSeek(time); // time = timestamp para PLAYLIST
			return;
		}

		// Para WINDOW y PROGRAM, convertir timestamp a playerTime
		const playerTime = this._timestampToPlayerTime(time);
		this._currentLogger?.debug(
			`seekToTime - Converted timestamp ${time} to playerTime ${playerTime}`
		);

		this._handleStandardSeek(playerTime); // Ahora pasamos playerTime correctamente
	}

	// Métodos públicos para eventos de slider (SIN timeout automático)
	onSliderSlidingStart(): void {
		this._currentLogger?.debug("Slider sliding started - entering manual seeking mode");
		this._isManualSeeking = true;
	}

	onSliderSlidingComplete(): void {
		this._currentLogger?.debug("Slider sliding completed - exiting manual seeking mode");
		this._isManualSeeking = false;

		// Actualizar live edge position inmediatamente después del seek
		this._updateLiveEdgePosition();
	}

	async getCurrentProgramInfo(): Promise<any | null> {
		this._currentLogger?.debug(
			`getCurrentProgramInfo - EPG available: ${!!this._dvrCallbacks.getEPGProgramAt}`
		);

		// Verificar que no hemos sido destruidos
		if (
			!this._dvrCallbacks.getEPGProgramAt ||
			!this._currentPlaylistItem ||
			!this._isValidState() ||
			!this._epgRetryTimeouts
		) {
			this._currentLogger?.warn(
				"getCurrentProgramInfo: Manager destroyed, no playlist item, or invalid state"
			);
			return null;
		}

		const timestamp = this._getProgressDatum();
		this._currentLogger?.debug(`EPG request for timestamp: ${timestamp}`);

		if (this._dvrCallbacks.onEPGRequest) {
			this._dvrCallbacks.onEPGRequest(timestamp);
		}

		try {
			this._currentProgram = await this._dvrCallbacks.getEPGProgramAt(
				this._currentPlaylistItem,
				timestamp
			);
			this._epgRetryCount.delete(timestamp);
			this._epgRetryTimeouts.delete(timestamp);
			return this._currentProgram;
		} catch (error) {
			this._currentLogger?.error(`EPG error: ${JSON.stringify(error)}`);
			this._handleEPGError(timestamp, error);
			return null;
		}
	}

	/*
	 *  Getters específicos del DVR
	 *
	 */

	get isDVRWindowConfigured(): boolean {
		return this._isValidState(); // Basado en seekableRange, no en CMS
	}

	get currentTimeWindowSeconds(): number | null {
		return this._isValidState() ? this._seekableRange.end - this._seekableRange.start : null;
	}

	get totalPauseTime(): number {
		let total = this._totalPauseTime;
		if ((this._isPaused || this._isBuffering) && this._pauseStartTime > 0) {
			total += Date.now() - this._pauseStartTime;
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

	get isLiveStream(): boolean {
		return true; // DVR siempre es stream en directo
	}

	get isProgramLive(): boolean {
		return this._isValidState() ? this._isProgramCurrentlyLive() : false;
	}

	get isReadyForSeek(): boolean {
		return this._hasReceivedPlayerData && this._isValidState();
	}

	/*
	 *  Métodos protegidos sobrescritos
	 *
	 */

	protected _isValidState(): boolean {
		const baseValid = super._isValidState();
		// DVR es válido si tenemos seekableRange válido (NO requiere dvrWindowSeconds)
		const dvrValid = this._seekableRange.end > this._seekableRange.start;

		if (!baseValid) {
			this._currentLogger?.debug(
				`DVR validation failed: base state invalid - ${JSON.stringify({
					hasReceivedPlayerData: this._hasReceivedPlayerData,
					seekableRange: this._seekableRange,
					currentTime: this._currentTime,
				})}`
			);
		} else if (!dvrValid) {
			this._currentLogger?.warn(
				`DVR validation failed: invalid seekableRange - ${JSON.stringify({
					seekableRange: this._seekableRange,
					start: this._seekableRange.start,
					end: this._seekableRange.end,
				})}`
			);
		}

		return baseValid && dvrValid;
	}

	protected _handleSeekTo(playerTime: number): void {
		this._currentLogger?.debug(`DVR seeking to: ${playerTime}`);

		// Si estamos pausados, actualizar frozen position inmediatamente
		if (this._isPaused || this._isBuffering) {
			const newTimestamp = this._playerTimeToTimestamp(playerTime);
			this._frozenProgressDatum = newTimestamp;
			this._currentLogger?.info("Updated frozen position due to seek during pause", {
				newPosition: newTimestamp,
				newTime: new Date(newTimestamp).toLocaleTimeString("es-ES"),
			});
		}

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
			windowCurrentSizeInSeconds: this.currentTimeWindowSeconds,
			canSeekToEnd: true,
		};
	}

	protected _emitProgressUpdate(): void {
		if (!this._hasReceivedPlayerData) {
			this._currentLogger?.warn("_emitProgressUpdate: No player data received yet, skipping");
			return;
		}

		// Validar consistencia durante pausas
		if ((this._isPaused || this._isBuffering) && !this._validatePauseConsistency()) {
			this._currentLogger?.warn(
				"_emitProgressUpdate: Pause values inconsistent, recalculating"
			);
			this._recalculatePauseValues();
		}

		if (!this._isValidState()) {
			this._currentLogger?.warn("_emitProgressUpdate: Invalid state, emitting fallback data");
			this._emitFallbackProgressUpdate();
			return;
		}

		try {
			const progressData = this._buildProgressData();

			if (this._options.onProgressUpdate) {
				this._options.onProgressUpdate(progressData);
			}
		} catch (error) {
			this._currentLogger?.error(`_emitProgressUpdate error: ${JSON.stringify(error)}`);
			this._emitFallbackProgressUpdate();
		}
	}

	protected _seekTo(playerTime: number): void {
		// Validar que el tiempo esté dentro del rango válido del seekableRange
		const clampedTime = Math.max(
			this._seekableRange.start,
			Math.min(this._seekableRange.end, playerTime)
		);

		if (clampedTime !== playerTime) {
			this._currentLogger?.debug(
				`Player time clamped: ${playerTime} → ${clampedTime} (seekableRange: ${this._seekableRange.start} - ${this._seekableRange.end})`
			);
		}

		this._currentLogger?.info(`Final seek to player time: ${clampedTime}`);

		// Ejecutar seek
		this._handleSeekTo(clampedTime);
	}

	/*
	 *  Métodos privados específicos del DVR
	 *
	 */

	// Actualizar ventana desde seekableRange (fuente de verdad)
	private _updateTimeWindowFromSeekableRange(): void {
		const seekableDuration = this._seekableRange.end - this._seekableRange.start;

		this._currentLogger?.debug(`Time window updated from seekableRange: ${seekableDuration}s`);

		// Opcional: comparar con valor del CMS si está disponible
		if (this._initialTimeWindowSeconds) {
			const difference = Math.abs(seekableDuration - this._initialTimeWindowSeconds);
			if (difference > 10) {
				// Más de 10 segundos de diferencia
				this._currentLogger?.debug(
					`Window size differs from CMS: seekable=${seekableDuration}s vs cms=${this._initialTimeWindowSeconds}s`
				);
			}
		}
	}

	// Inicializar tiempos basado en seekableRange
	private _initializeStreamTimesFromSeekableRange(): void {
		const seekableDuration = this._seekableRange.end - this._seekableRange.start;
		const now = Date.now();
		this._streamStartTime = now - seekableDuration * 1000;

		this._currentLogger?.info(
			`Stream times initialized from seekableRange: ${seekableDuration}s`
		);
	}

	// Validar consistencia durante pausas
	private _validatePauseConsistency(): boolean {
		if (!this._frozenProgressDatum) return true;

		const liveEdge = this._getCurrentLiveEdge();
		const expectedOffset = (liveEdge - this._frozenProgressDatum) / 1000;

		// El offset debe ser positivo y creciente
		const isValid = expectedOffset >= 0;

		if (!isValid) {
			this._currentLogger?.warn(`Pause consistency failed: offset=${expectedOffset}s`);
		}

		return isValid;
	}

	// Recalcular valores durante pausa
	private _recalculatePauseValues(): void {
		if (this._isValidState()) {
			this._frozenProgressDatum = this._getProgressDatum();
			this._currentLogger?.debug(`Recalculated pause value: ${this._frozenProgressDatum}`);
		}
	}

	// Log con información de progreso en formato solicitado
	private _logProgressInfo(): void {
		if (!this._isValidState()) return;

		const progressDatum = this._getProgressDatum();
		const liveEdge = this._getCurrentLiveEdge();
		const offsetSeconds = (liveEdge - progressDatum) / 1000;

		// Formato de hora local
		const progressTime = new Date(progressDatum);
		const timeStr = progressTime.toLocaleTimeString("es-ES", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});

		// Formato de offset -MM:SS
		const offsetMinutes = Math.floor(Math.abs(offsetSeconds) / 60);
		const offsetSecondsRemainder = Math.floor(Math.abs(offsetSeconds) % 60);
		const offsetStr = `-${offsetMinutes.toString().padStart(2, "0")}:${offsetSecondsRemainder.toString().padStart(2, "0")}`;

		// Indicar si estamos en pausa
		const statusIcon = this._isPaused || this._isBuffering ? "⏸️" : "▶️";
		const statusText = this._isPaused ? "PAUSED" : this._isBuffering ? "BUFFERING" : "PLAYING";

		this._currentLogger?.info(
			`${statusIcon} Progress: ${timeStr} | Offset: ${offsetStr} | Mode: ${this._playbackType} | Status: ${statusText}`
		);
	}

	// Limpiar todos los timeouts de EPG
	private _clearEPGRetryTimeouts(): void {
		for (const [timestamp, timeoutId] of this._epgRetryTimeouts) {
			clearTimeout(timeoutId);
			this._currentLogger?.debug(`Cleared EPG retry timeout for timestamp: ${timestamp}`);
		}
		this._epgRetryTimeouts.clear();
		this._epgRetryCount.clear();
	}

	private _updateDVRPauseTracking(isPaused: boolean, isBuffering: boolean): void {
		const wasStalled = this._isPaused || this._isBuffering;
		const isStalled = isPaused || isBuffering;

		this._currentLogger?.debug(
			`Pause tracking: wasStalled=${wasStalled}, isStalled=${isStalled}`
		);

		// Verificar el código exacto del timer de pausa
		if (!wasStalled && isStalled) {
			// CRITICAL: Only start pause tracking if we have valid player data
			if (!this._hasReceivedPlayerData || !this._isValidState()) {
				this._currentLogger?.warn("Skipping pause timer start - no valid player data yet");
				this._isPaused = isPaused;
				this._isBuffering = isBuffering;
				return;
			}

			// Iniciando pausa/buffering
			this._pauseStartTime = Date.now();
			if (this._isValidState()) {
				this._frozenProgressDatum = this._getProgressDatum();
				this._currentLogger?.info("Pause Started - Freezing progressDatum", {
					frozenAt: this._frozenProgressDatum,
					frozenTime: new Date(this._frozenProgressDatum).toLocaleTimeString("es-ES"),
				});
			}

			// Iniciar timer con mejor logging
			this._currentLogger?.info("Starting pause timer (1 second interval)");
			this._pauseUpdateInterval = setInterval(() => {
				if (this._pauseStartTime > 0 && (this._isPaused || this._isBuffering)) {
					const pausedDuration = (Date.now() - this._pauseStartTime) / 1000;

					this._currentLogger?.debug(
						`⏱️ Pause timer tick - duration: ${Math.floor(pausedDuration)}s`
					);

					// Actualizar liveEdgePosition basado en offset real
					if (this._isLiveEdgePosition) {
						const currentOffset = this._getLiveEdgeOffset();
						if (currentOffset > LIVE_EDGE_TOLERANCE) {
							this._isLiveEdgePosition = false;
							this._currentLogger?.info(
								`Left live edge due to offset: ${currentOffset.toFixed(1)}s > ${LIVE_EDGE_TOLERANCE}s`
							);
						}
					}

					// Log cada segundo durante pausa para mostrar crecimiento del offset
					this._logProgressInfo();

					// SIEMPRE emitir update durante pausa
					this._emitProgressUpdate();
				} else {
					this._currentLogger?.warn(
						`Pause timer tick but conditions not met: ${JSON.stringify({
							pauseStartTime: this._pauseStartTime,
							isPaused: this._isPaused,
							isBuffering: this._isBuffering,
						})}`
					);
				}
			}, 1000);
		} else if (wasStalled && !isStalled) {
			// Terminando pausa/buffering
			if (this._pauseStartTime > 0) {
				const pauseDuration = (Date.now() - this._pauseStartTime) / 1000;
				this._totalPauseTime += Date.now() - this._pauseStartTime;
				this._pauseStartTime = 0;

				this._currentLogger?.info(
					`Pause Ended: ${JSON.stringify({
						pauseDurationSeconds: Math.floor(pauseDuration),
						totalPauseTimeSeconds: this.totalPauseTime,
					})}`
				);
			}
			this._frozenProgressDatum = undefined;
			this._currentLogger?.debug("Unfreezing progressDatum");

			if (this._pauseUpdateInterval) {
				this._currentLogger?.info("⏰ Stopping pause timer");
				clearInterval(this._pauseUpdateInterval);
				this._pauseUpdateInterval = null;
			}
		}
	}

	private _updateLiveEdgePosition(): void {
		if (!this._isValidState()) {
			this._isLiveEdgePosition = false;
			return;
		}

		// No actualizar durante pausas o manual seeking (evita flickering)
		if (this._isPaused || this._isBuffering || this._isManualSeeking) {
			this._currentLogger?.debug(
				"Skipping live edge position update during pause/buffering/manual seeking"
			);
			return;
		}

		const offset = this._seekableRange.end - this._currentTime;
		const wasLiveEdge = this._isLiveEdgePosition;
		this._isLiveEdgePosition = offset <= LIVE_EDGE_TOLERANCE;

		if (wasLiveEdge !== this._isLiveEdgePosition) {
			this._currentLogger?.info(
				`Live edge position changed: ${wasLiveEdge} → ${this._isLiveEdgePosition} (offset: ${offset}s)`
			);
		}
	}

	private _handlePlaylistSeek(timestamp: number): void {
		const { startDate, endDate } = this._currentProgram!;
		const liveEdge = this._getCurrentLiveEdge();

		this._currentLogger?.debug(
			`PLAYLIST seek - Program: ${startDate} - ${endDate}, LiveEdge: ${liveEdge}, Target: ${timestamp}`
		);

		// Validar que el timestamp esté dentro del rango válido del programa
		const maxAvailableTimestamp = Math.min(endDate, liveEdge);

		if (timestamp < startDate) {
			this._currentLogger?.debug(
				`Seek target before program start, clamping: ${timestamp} → ${startDate}`
			);
			timestamp = startDate;
		} else if (timestamp > maxAvailableTimestamp) {
			this._currentLogger?.debug(
				`Seek target beyond available content, clamping: ${timestamp} → ${maxAvailableTimestamp}`
			);
			timestamp = maxAvailableTimestamp;
		}

		// Convertir timestamp a playerTime usando método específico para PLAYLIST
		const playerTime = this._timestampToPlayerTime(timestamp);

		this._currentLogger?.debug(
			`PLAYLIST seek converted: ${timestamp} → ${playerTime}s (player time)`
		);

		// Actualizar live edge position para el timestamp
		const offsetFromLive = (liveEdge - timestamp) / 1000;
		this._isLiveEdgePosition = offsetFromLive <= LIVE_EDGE_TOLERANCE;

		// Ejecutar seek con playerTime
		this._seekTo(playerTime);
	}

	private _handleStandardSeek(playerTime: number): void {
		// Para WINDOW y PROGRAM, playerTime ya está convertido correctamente
		this._currentLogger?.debug(`Standard seek to playerTime: ${playerTime}`);
		this._seekTo(playerTime);
	}

	// Método unificado simple para los 3 modos
	private _getSliderBounds(): { minimumValue: number; maximumValue: number } {
		const liveEdge = this._getCurrentLiveEdge();

		this._currentLogger?.debug(
			`_getSliderBounds called: ${JSON.stringify({
				playbackType: this._playbackType,
				liveEdge,
				currentProgram: this._currentProgram?.title,
			})}`
		);

		switch (this._playbackType) {
			case DVR_PLAYBACK_TYPE.PROGRAM:
				// Programa específico: del inicio del programa al live edge
				const programStart = this._currentProgram?.startDate || this._getWindowStart();
				const result1 = { minimumValue: programStart, maximumValue: liveEdge };
				this._currentLogger?.debug(
					`_getSliderBounds PROGRAM result: ${JSON.stringify(result1)}`
				);
				return result1;

			case DVR_PLAYBACK_TYPE.PLAYLIST:
				// Programa actual completo: inicio a fin del programa
				if (!this._currentProgram) {
					return this._getWindowBounds();
				}
				const result2 = {
					minimumValue: this._currentProgram.startDate,
					maximumValue: this._currentProgram.endDate, // Nota: liveEdge puede estar dentro o fuera
				};
				this._currentLogger?.debug(
					`_getSliderBounds PLAYLIST result: ${JSON.stringify(result2)}`
				);
				return result2;

			case DVR_PLAYBACK_TYPE.WINDOW:
			default:
				// Ventana completa: windowStart a liveEdge
				return this._getWindowBounds();
		}
	}

	private _getWindowBounds(): { minimumValue: number; maximumValue: number } {
		const liveEdge = this._getCurrentLiveEdge();
		const windowStart = this._getWindowStart();
		const result = { minimumValue: windowStart, maximumValue: liveEdge };

		this._currentLogger?.debug(
			`_getWindowBounds calculated: ${JSON.stringify({
				liveEdge,
				windowStart,
				result,
			})}`
		);

		return result;
	}

	// Calcular windowStart desde seekableRange (fuente de verdad)
	private _getWindowStart(): number {
		const liveEdge = this._getCurrentLiveEdge();
		const seekableDuration = this._seekableRange.end - this._seekableRange.start;
		return liveEdge - seekableDuration * 1000;
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

	// Simplificado según regla fundamental
	private _isProgramCurrentlyLive(): boolean {
		if (!this._currentProgram) return false;

		// Simple: el programa está en directo si aún no ha terminado
		const now = Date.now();
		return this._currentProgram.endDate > now;
	}

	// Conversión simple y unificada para todos los modos
	// playerTime del reproductor SIEMPRE es relativo al inicio de la ventana DVR (windowStart)
	private _playerTimeToTimestamp(playerTime: number): number {
		const windowStart = this._getWindowStart();
		return windowStart + playerTime * 1000;
	}

	// Conversión simple y unificada para todos los modos
	// El reproductor SIEMPRE espera playerTime relativo al inicio de la ventana DVR (windowStart)
	private _timestampToPlayerTime(timestamp: number): number {
		const windowStart = this._getWindowStart();
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
			this._currentLogger?.info(`Significant progress change: ${progressDiff}s`);
			this._lastProgressForEPG = currentProgress;
			this._dvrCallbacks.onEPGRequest(currentProgress);
		}
	}

	private async _checkProgramChange(): Promise<void> {
		if (
			!this._currentProgram ||
			!this._dvrCallbacks.getEPGProgramAt ||
			!this._currentPlaylistItem
		)
			return;

		const currentProgress = this._getProgressDatum();

		if (currentProgress >= this._currentProgram.endDate) {
			this._currentLogger?.info("Program ended, checking for next program");

			try {
				const nextProgram = await this._dvrCallbacks.getEPGProgramAt(
					this._currentPlaylistItem,
					currentProgress
				);
				if (nextProgram && nextProgram.id !== this._currentProgram.id) {
					const previousProgram = this._currentProgram;
					this._currentProgram = nextProgram;

					if (this._dvrCallbacks.onProgramChange) {
						this._dvrCallbacks.onProgramChange({
							previousProgram,
							currentProgram: nextProgram,
						});
					}
				}
			} catch (error) {
				this._currentLogger?.error("Error checking program change", error);
			}
		}
	}

	private async _handleEPGError(timestamp: number, error: any): Promise<void> {
		const retryCount = this._epgRetryCount.get(timestamp) || 0;

		if (retryCount < EPG_RETRY_DELAYS.length) {
			const delay = EPG_RETRY_DELAYS[retryCount];
			this._epgRetryCount.set(timestamp, retryCount + 1);

			this._currentLogger?.info(`EPG retry ${retryCount + 1} in ${delay}ms`);

			// Almacenar timeout para poder limpiarlo después
			const timeoutId = setTimeout(() => {
				// Limpiar el timeout del map cuando se ejecute
				this._epgRetryTimeouts.delete(timestamp);

				// Solo reintentar si el manager no ha sido destruido
				if (this._epgRetryTimeouts && this._dvrCallbacks.getEPGProgramAt) {
					this.getCurrentProgramInfo();
				} else {
					this._currentLogger?.debug("EPG retry cancelled - manager destroyed");
				}
			}, delay);

			this._epgRetryTimeouts.set(timestamp, timeoutId);
		} else {
			this._currentLogger?.error("EPG max retries reached");
			if (this._dvrCallbacks.onEPGError) {
				this._dvrCallbacks.onEPGError({ timestamp, error, retryCount });
			}
			this._epgRetryCount.delete(timestamp);
			this._epgRetryTimeouts.delete(timestamp);
		}
	}

	/*
	 *  Destrucción específica del DVR
	 *
	 */

	destroy(): void {
		this._currentLogger?.info("Destroying DVR progress manager");
		super.destroy();

		this._isManualSeeking = false;

		// Limpiar timeouts EPG pendientes
		this._clearEPGRetryTimeouts();

		// Limpiar callbacks para evitar requests después de destrucción
		this._dvrCallbacks = {};

		// Limpiar recursos específicos del DVR
		this._epgRetryCount.clear();

		if (this._pauseUpdateInterval) {
			clearInterval(this._pauseUpdateInterval);
			this._pauseUpdateInterval = null;
		}
	}
}
