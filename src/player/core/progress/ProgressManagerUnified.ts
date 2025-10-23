/*
 * ProgressManagerUnified - Fachada Unificada de Progress Tracking
 *
 * Proporciona un único punto de interacción para la gestión de progreso,
 * abstrayendo la complejidad de tener dos managers separados (VOD y DVR).
 * Delega automáticamente las operaciones al manager apropiado según el tipo de contenido.
 */

import { type SliderValues } from "../../types/types";
import { VODProgressManagerClass } from "./vodProgressManager";
import { DVRProgressManagerClass } from "./dvrProgressManager";
import { 
  type ProgressManagerUnifiedConfig,
  type ProgressManagerUnifiedPlayerData,
  type ProgressManagerUnifiedContentLoadData,
  type IProgressManagerUnified
} from "./types/unified";
import { DVR_PLAYBACK_TYPE } from "./types/enums";
import { PlayerError } from "../errors";

export class ProgressManagerUnified implements IProgressManagerUnified {
	// Managers internos
	private vodManager: VODProgressManagerClass | null = null;
	private dvrManager: DVRProgressManagerClass | null = null;

	// Estado
	private contentType: "vod" | "live" = "vod";
	private isInitialized = false;

	// Configuración guardada
	private config: ProgressManagerUnifiedConfig | null = null;

	constructor() {
		// Los managers se crearán en initialize()
	}

	// === CONFIGURACIÓN ===

	/**
	 * Inicializa el manager con la configuración necesaria
	 */
	initialize(config: ProgressManagerUnifiedConfig): void {
		if (this.isInitialized) {
			throw new PlayerError('PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED', {
				reason: 'Already initialized. Call reset() first if you want to reinitialize.'
			});
		}

		this.config = config;

		try {
			// Crear VOD manager
			this.vodManager = new VODProgressManagerClass({
				onProgressUpdate: config.vod?.onProgressUpdate,
				logger: config.logger,
				loggerEnabled: config.loggerEnabled,
				loggerLevel: config.loggerLevel,
				currentTime: config.vod?.currentTime,
				duration: config.vod?.duration,
				isPaused: config.vod?.isPaused,
				isBuffering: config.vod?.isBuffering,
				autoSeekToEnd: config.vod?.autoSeekToEnd,
				enableLooping: config.vod?.enableLooping,
			});

			// Crear DVR manager
			this.dvrManager = new DVRProgressManagerClass({
				onProgressUpdate: config.dvr?.onProgressUpdate,
				onModeChange: config.dvr?.onModeChange,
				onProgramChange: config.dvr?.onProgramChange,
				onEPGRequest: config.dvr?.onEPGRequest,
				onEPGError: config.dvr?.onEPGError,
				getEPGProgramAt: config.dvr?.getEPGProgramAt,
				logger: config.logger,
				loggerEnabled: config.loggerEnabled,
				loggerLevel: config.loggerLevel,
				currentTime: config.dvr?.currentTime,
				duration: config.dvr?.duration,
				isPaused: config.dvr?.isPaused,
				isBuffering: config.dvr?.isBuffering,
				dvrWindowSeconds: config.dvr?.dvrWindowSeconds,
				playbackType: config.dvr?.playbackType,
			});
		} catch (error) {
			throw new PlayerError('PLAYER_PROGRESS_MANAGER_CREATION_FAILED', {
				originalError: error
			});
		}

		// Establecer tipo de contenido inicial
		this.contentType = config.initialContentType || "vod";
		this.isInitialized = true;

		config.logger?.info("ProgressManagerUnified", "Initialized", {
			initialContentType: this.contentType,
			hasVODManager: !!this.vodManager,
			hasDVRManager: !!this.dvrManager,
		});
	}

	/*
	 * Cambia el tipo de contenido (VOD <-> DVR)
	 *
	 */

	setContentType(contentType: "vod" | "live"): void {
		this.ensureInitialized();

		if (this.contentType !== contentType) {
			this.config?.logger?.info("ProgressManagerUnified", "Content type changed", {
				from: this.contentType,
				to: contentType,
			});

			// Resetear el manager anterior antes de cambiar
			if (this.contentType === "vod") {
				this.vodManager?.reset();
			} else {
				this.dvrManager?.reset();
			}

			this.contentType = contentType;
		}
	}

	// === ACTUALIZACIÓN DE DATOS ===

	/*
	 * Actualiza los datos del reproductor
	 * Delega automáticamente al manager apropiado
	 *
	 */

	async updatePlayerData(data: ProgressManagerUnifiedPlayerData): Promise<void> {
		this.ensureInitialized();

		try {
			// Delegar al manager apropiado
			if (this.contentType === "vod") {
				this.vodManager!.updatePlayerData({
					currentTime: data.currentTime,
					duration: data.duration,
					seekableRange: data.seekableRange || { start: 0, end: data.duration || 0 },
					isBuffering: data.isBuffering ?? false,
					isPaused: data.isPaused ?? false,
				});
			} else {
				await this.dvrManager!.updatePlayerData({
					currentTime: data.currentTime,
					duration: data.duration,
					seekableRange: data.seekableRange || { start: 0, end: data.duration || 0 },
					isBuffering: data.isBuffering ?? false,
					isPaused: data.isPaused ?? false,
				});
			}
		} catch (error) {
			if (error instanceof PlayerError) {
				throw error;
			}
			throw new PlayerError('PLAYER_PROGRESS_UPDATE_FAILED', {
				contentType: this.contentType,
				data,
				originalError: error
			});
		}
	}

	/*
	 * Actualiza el estado de pausa
	 * Nota: Los managers actuales no tienen updatePausedState,
	 * el estado se actualiza vía updatePlayerData
	 *
	 */

	updatePausedState(_isPaused: boolean): void {
		this.ensureInitialized();
		// El estado de pausa se maneja internamente en updatePlayerData
		// Este método existe para compatibilidad con la interface
	}

	/*
	 * Notifica que el contenido ha cargado
	 *
	 */

	onContentLoaded(data: ProgressManagerUnifiedContentLoadData): void {
		this.ensureInitialized();

		// Detectar automáticamente el tipo de contenido
		const detectedType = data.isLive ? "live" : "vod";
		this.setContentType(detectedType);

		this.config?.logger?.info("ProgressManagerUnified", "Content loaded", {
			contentType: this.contentType,
			duration: data.duration,
			isLive: data.isLive,
		});

		// Notificar al manager apropiado
		if (this.contentType === "vod") {
			// VOD no tiene método onContentLoaded, solo necesita duration
			// que se establecerá en el primer updatePlayerData
		} else {
			// DVR tampoco tiene onContentLoaded explícito
			// La inicialización se hace en el primer updatePlayerData con seekableRange
		}
	}

	// === OBTENCIÓN DE VALORES ===

	/*
	 * Obtiene los valores actuales del slider
	 * Funciona tanto para VOD como DVR
	 *
	 */

	getSliderValues(): SliderValues {
		this.ensureInitialized();
		return this.getActiveManager().getSliderValues();
	}

	/*
	 * Obtiene el tiempo actual de reproducción
	 *
	 */

	getCurrentTime(): number {
		this.ensureInitialized();
		const manager = this.getActiveManager();
		// Los managers no tienen getCurrentTime, accedemos al campo privado vía getStats
		const stats = manager.getStats();
		return stats.currentTime || 0;
	}

	/*
	 * Obtiene la duración total
	 *
	 */

	getDuration(): number {
		this.ensureInitialized();
		const manager = this.getActiveManager();
		// Los managers no tienen getDuration, accedemos al campo privado vía getStats
		const stats = manager.getStats();
		return stats.duration || 0;
	}

	/*
	 * Verifica si el contenido actual es live/DVR
	 *
	 */

	isLiveContent(): boolean {
		return this.contentType === "live";
	}

	/*
	 * Verifica si estamos en el edge (live) del stream DVR
	 *
	 */

	isAtLiveEdge(): boolean {
		if (this.contentType !== "live") return false;
		this.ensureInitialized();
		// DVR manager no tiene isAtLiveEdge público, usar getSliderValues
		const values = this.dvrManager!.getSliderValues();
		return values.isLiveEdgePosition || false;
	}

	// === OPERACIONES DE SEEK ===

	/*
	 * Convierte un valor del slider a tiempo de seek
	 *
	 */

	sliderValueToSeekTime(sliderValue: number): number {
		this.ensureInitialized();

		if (this.contentType === "vod") {
			// Para VOD, el slider value es directamente el tiempo
			return sliderValue;
		} else {
			// Para DVR, el slider value también es el tiempo (en el rango seekable)
			return sliderValue;
		}
	}

	/*
	 * Valida un tiempo de seek según las restricciones del contenido
	 *
	 */

	validateSeekTime(time: number): number {
		this.ensureInitialized();
		const manager = this.getActiveManager();
		const stats = manager.getStats();
		const seekableRange = stats.seekableRange || { start: 0, end: stats.duration || 0 };

		// Validar dentro del rango seekable
		return Math.max(seekableRange.start, Math.min(time, seekableRange.end));
	}

	/*
	 * Calcula el tiempo para saltar adelante/atrás
	 *
	 */

	calculateSkipTime(direction: "forward" | "backward", seconds: number = 10): number {
		this.ensureInitialized();
		const currentTime = this.getCurrentTime();
		const targetTime = direction === "forward" ? currentTime + seconds : currentTime - seconds;
		return this.validateSeekTime(targetTime);
	}

	// === CALLBACKS DVR (solo para contenido live) ===

	/*
	 * Registra callback para cambios de modo DVR
	 *
	 */

	onDVRModeChange(callback: (mode: DVR_PLAYBACK_TYPE) => void): void {
		if (this.config && this.config.dvr) {
			this.config.dvr.onModeChange = (data: { playbackType: DVR_PLAYBACK_TYPE }) => {
				callback(data.playbackType);
			};
		}
	}

	/*
	 * Registra callback para cambios de programa DVR
	 *
	 */

	onDVRProgramChange(callback: (program: any | null) => void): void {
		if (this.config && this.config.dvr) {
			this.config.dvr.onProgramChange = (data: { currentProgram: any | null }) => {
				callback(data.currentProgram);
			};
		}
	}

	// === GESTIÓN DE PROGRAMAS DVR ===

	/*
	 * Obtiene el programa actual (solo DVR)
	 *
	 */

	async getCurrentProgram(): Promise<any | null> {
		if (this.contentType !== "live") return null;
		this.ensureInitialized();
		return await this.dvrManager!.getCurrentProgramInfo();
	}

	/*
	 * Obtiene todos los programas disponibles (solo DVR)
	 *
	 */

	getAvailablePrograms(): any[] {
		if (this.contentType !== "live") return [];
		// Los managers actuales no tienen este método
		// Retornar array vacío por ahora
		return [];
	}

	/*
	 * Salta a un programa específico (solo DVR)
	 *
	 */

	seekToProgram(_programId: string): number | null {
		if (this.contentType !== "live") return null;
		// Los managers actuales no tienen este método
		// Retornar null por ahora
		return null;
	}

	// === MÉTODOS ADICIONALES DE LOS MANAGERS ===

	/*
	 * Inicia el seguimiento manual de seek
	 *
	 */

	startManualSeeking(): void {
		this.ensureInitialized();
		if (this.contentType === "live") {
			this.dvrManager!.onSliderSlidingStart();
		}
	}

	/*
	 * Finaliza el seguimiento manual de seek
	 *
	 */

	endManualSeeking(): void {
		this.ensureInitialized();
		if (this.contentType === "live") {
			this.dvrManager!.onSliderSlidingComplete();
		}
	}

	/*
	 * Navega al edge en vivo (solo DVR)
	 *
	 */

	goToLive(): number | null {
		if (this.contentType !== "live") return null;
		this.ensureInitialized();
		this.dvrManager!.goToLive();
		// goToLive no retorna valor, retornar null
		return null;
	}

	/*
	 * Establece el tipo de reproducción DVR
	 *
	 */

	setPlaybackType(playbackType: DVR_PLAYBACK_TYPE): void {
		if (this.contentType === "live") {
			this.ensureInitialized();
			this.dvrManager!.setPlaybackType(playbackType);
		}
	}

	/*
	 * Obtiene estadísticas del manager activo
	 *
	 */

	getStats(): any {
		this.ensureInitialized();
		return this.getActiveManager().getStats();
	}

	// === LIFECYCLE ===

	/*
	 * Resetea el estado del manager
	 *
	 */

	reset(): void {
		if (this.isInitialized) {
			this.config?.logger?.info("ProgressManagerUnified", "Resetting");
			this.vodManager?.reset();
			this.dvrManager?.reset();
			this.contentType = "vod";
		}
	}

	/*
	 * Limpia recursos y callbacks
	 *
	 */

	dispose(): void {
		if (this.isInitialized) {
			this.config?.logger?.info("ProgressManagerUnified", "Disposing");
			// Los managers no tienen dispose, usar destroy si existe
			if (this.vodManager && "destroy" in this.vodManager) {
				(this.vodManager as any).destroy();
			}
			if (this.dvrManager && "destroy" in this.dvrManager) {
				(this.dvrManager as any).destroy();
			}
			this.vodManager = null;
			this.dvrManager = null;
			this.config = null;
			this.isInitialized = false;
		}
	}

	// === HELPERS PRIVADOS ===

	/*
	 * Asegura que el manager esté inicializado
	 *
	 */

	private ensureInitialized(): void {
		if (!this.isInitialized) {
			throw new PlayerError('PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED', {
				operation: 'ensureInitialized',
				message: 'Call initialize() first'
			});
		}
	}

	/*
	 * Obtiene el manager activo según el tipo de contenido
	 *
	 */

	private getActiveManager(): VODProgressManagerClass | DVRProgressManagerClass {
		if (this.contentType === "vod") {
			if (!this.vodManager) {
				throw new PlayerError('PLAYER_PROGRESS_INVALID_STATE', {
					reason: 'VOD manager not initialized',
					contentType: this.contentType
				});
			}
			return this.vodManager;
		} else {
			if (!this.dvrManager) {
				throw new PlayerError('PLAYER_PROGRESS_INVALID_STATE', {
					reason: 'DVR manager not initialized',
					contentType: this.contentType
				});
			}
			return this.dvrManager;
		}
	}
}
