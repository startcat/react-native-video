/*
 * Singleton que gestiona la comunicación con los módulos nativos de descargas (iOS/Android)
 * Unifica el acceso a DownloadsModule2 y proporciona una API consistente
 *
 */

import { EventEmitter } from "eventemitter3";
import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import { PlayerError } from "../../../core/errors";
import { Logger } from "../../logger";
import { LOG_TAGS } from "../constants";
import { DEFAULT_CONFIG_NATIVE, LOGGER_DEFAULTS } from "../defaultConfigs";
import {
	DownloadCompleteEvent,
	DownloadErrorCode,
	DownloadFailedEvent,
	DownloadItem,
	DownloadProgressEvent,
	NativeDownloadConfig,
	NativeDownloadStats,
	NativeManagerConfig,
	NativeManagerEventCallback,
	NativeManagerEventType,
	SystemInfo,
} from "../types";

import { IDrm } from "../../../types";
import { storageService } from "../services/storage/StorageService";

const TAG = LOG_TAGS.NATIVE_MANAGER;

export class NativeManager {
	private static instance: NativeManager;
	private eventEmitter: EventEmitter;
	private config: NativeManagerConfig;
	private currentLogger: Logger;
	private isInitialized: boolean = false;
	private initPromise: Promise<void> | null = null;

	// Referencias a módulos nativos
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private nativeModule: any = null;
	private nativeEventEmitter: NativeEventEmitter | null = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private eventSubscriptions: Map<string, any> = new Map();

	// Estado interno
	private systemInfo: SystemInfo | null = null;
	private eventBuffer: Array<{ event: string; data: unknown; timestamp: number }> = [];
	private completedDownloads: Set<string> = new Set();

	// Throttle de eventos de progreso
	private lastProgressLogTime: Map<string, number> = new Map();
	private lastProgressEmitTime: Map<string, number> = new Map();
	private static readonly PROGRESS_THROTTLE_MS = 2000;

	private constructor() {
		// Configuración por defecto del manager
		this.config = { ...DEFAULT_CONFIG_NATIVE };

		// Logger setup
		this.currentLogger = new Logger({
			...LOGGER_DEFAULTS,
			enabled: this.config.logEnabled,
			level: this.config.logLevel,
		});

		this.eventEmitter = new EventEmitter();

		// Detectar y configurar módulo nativo
		this.setupNativeModule();
	}

	public static getInstance(): NativeManager {
		if (!NativeManager.instance) {
			NativeManager.instance = new NativeManager();
		}
		return NativeManager.instance;
	}

	public async initialize(config?: Partial<NativeManagerConfig>): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		// Si hay una inicialización en progreso, esperar a que termine
		if (this.initPromise) {
			return this.initPromise;
		}

		// Crear promesa que otras llamadas concurrentes pueden esperar
		this.initPromise = (async () => {
			try {
				// Actualizar configuración del manager
				if (config) {
					this.config = { ...this.config, ...config };
					this.currentLogger = new Logger({
						enabled: this.config.logEnabled,
						level: this.config.logLevel,
					});
				}

				// Verificar que el módulo nativo esté disponible
				if (!this.nativeModule) {
					throw new Error("Native downloads module not available");
				}

				// Configurar event listeners nativos
				this.setupNativeEventListeners();

				// Inicializar módulo nativo
				await this.initializeNativeModule();

				this.isInitialized = true;
				this.currentLogger.info(TAG, "NativeManager initialized successfully");

				// Emitir evento de listo
				this.eventEmitter.emit("module_ready", {
					platform: Platform.OS,
					systemInfo: this.systemInfo,
				});
			} catch (error) {
				this.currentLogger.error(TAG, "Failed to initialize NativeManager", error);
				throw new PlayerError("NATIVE_MANAGER_INITIALIZATION_FAILED", {
					originalError: error,
					platform: Platform.OS,
				});
			} finally {
				// Limpiar promesa pendiente
				this.initPromise = null;
			}
		})();

		return this.initPromise;
	}

	/*
	 * Configuración y setup del módulo nativo
	 *
	 */

	private setupNativeModule(): void {
		try {
			// Buscar el módulo nativo
			this.nativeModule = NativeModules.DownloadsModule2;

			if (this.nativeModule) {
				// Crear event emitter nativo
				this.nativeEventEmitter = new NativeEventEmitter(this.nativeModule);
				this.currentLogger.debug(TAG, `Native module found for ${Platform.OS}`);
			} else {
				this.currentLogger.warn(
					TAG,
					`Native module DownloadsModule2 not found for ${Platform.OS}`
				);
			}
		} catch (error) {
			this.currentLogger.error(TAG, "Error setting up native module", error);
			throw new PlayerError("NATIVE_MODULE_SETUP_FAILED", {
				originalError: error,
				platform: Platform.OS,
			});
		}
	}

	private setupNativeEventListeners(): void {
		if (!this.nativeEventEmitter) {
			throw new Error("Native event emitter not available");
		}

		const events = [
			"overonDownloadProgress",
			"overonDownloadStateChanged",
			"overonDownloadCompleted",
			"overonDownloadError",
			"overonDownloadPrepared",
			"overonDownloadPrepareError",
			"overonLicenseDownloaded",
			"overonLicenseError",
			"overonLicenseExpired",
			"overonLicenseCheck",
			"overonLicenseCheckFailed",
		];

		events.forEach(eventName => {
			const subscription = this.nativeEventEmitter!.addListener(
				eventName,
				(data: unknown) => {
					this.handleNativeEvent(eventName, data);
				}
			);

			this.eventSubscriptions.set(eventName, subscription);
		});

		this.currentLogger.debug(TAG, `Configured ${events.length} native event listeners`);
	}

	private async initializeNativeModule(): Promise<void> {
		try {
			const moduleConfig = {
				logEnabled: this.config.logEnabled,
				eventBufferSize: this.config.eventBufferSize,
			};

			// Llamar a moduleInit en el módulo nativo
			const systemInfo = await this.nativeModule.moduleInit(moduleConfig);

			if (systemInfo) {
				this.systemInfo = {
					platform: Platform.OS,
					version: systemInfo.version || "1.0.0",
					totalSpace: systemInfo.totalSpace || 0,
					availableSpace: systemInfo.availableSpace || 0,
					downloadDirectory: systemInfo.downloadDirectory || "Downloads",
					tempDirectory: systemInfo.tempDirectory || "Temp",
					maxConcurrentDownloads: systemInfo.maxConcurrentDownloads || 3,
					supportsDRM: systemInfo.supportsDRM !== false,
					supportsBackgroundDownloads: systemInfo.supportsBackgroundDownloads !== false,
				};
			}

			// CRÍTICO: Configurar directorios de descarga antes de poder descargar
			// IMPORTANTE: El módulo nativo construye paths como reactContext.getFilesDir() + downloadDir
			// Por lo tanto, debemos pasar SOLO el nombre del directorio, no paths absolutos
			try {
				const downloadDirs = {
					downloadDir: "Downloads",
					tempDir: "TempDownloads",
					streamsDir: "Streams",
					binariesDir: "Binaries",
					licensesDir: "Licenses",
					subtitlesDir: "Subtitles",
				};

				await this.nativeModule.setDownloadDirectories(downloadDirs);
				this.currentLogger.info(TAG, "Download directories configured", {
					...downloadDirs,
					note: "Native module will construct absolute paths",
				});
			} catch (error) {
				this.currentLogger.error(TAG, "Failed to configure download directories", error);
				// Este error es crítico - sin directorios configurados, addDownload fallará con "null"
				throw new PlayerError("NATIVE_MODULE_INIT_FAILED", {
					originalError: error,
					systemInfo: this.systemInfo,
					reason: "Failed to configure download directories",
				});
			}

			// Asegurar que todas las descargas estén pausadas por defecto después de la inicialización
			// El módulo nativo debe inicializar en estado pausado, pero lo garantizamos explícitamente
			try {
				await this.nativeModule.pauseAll();
				this.currentLogger.info(TAG, "All downloads paused after native initialization");
			} catch (error) {
				this.currentLogger.warn(
					TAG,
					"Failed to pause downloads after initialization",
					error
				);
				// No es crítico si falla el pauseAll inicial
			}

			this.currentLogger.info(TAG, "Native module initialized", this.systemInfo);
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to initialize native module", error);
			throw new PlayerError("NATIVE_MODULE_INIT_FAILED", {
				originalError: error,
				platform: Platform.OS,
			});
		}
	}

	/*
	 * Manejo de eventos nativos
	 *
	 */

	private handleNativeEvent(eventName: string, data: unknown): void {
		try {
			// DEBUG: Log native progress events (throttled to avoid spam)
			if (eventName === "overonDownloadProgress") {
				const progressData = data as { id?: string };
				const id = progressData?.id || "unknown";
				const now = Date.now();
				const lastLog = this.lastProgressLogTime.get(id) || 0;
				if (now - lastLog >= NativeManager.PROGRESS_THROTTLE_MS) {
					const { remainingTime: _rt, ...logData } = data as Record<string, unknown>;
					console.log(`[NativeManager] 📥 Received native progress event:`, logData);
					this.lastProgressLogTime.set(id, now);
				}
			}

			// Buffer del evento para debugging
			this.bufferEvent(eventName, data);

			// Mapear evento nativo a evento del manager
			switch (eventName) {
				case "overonDownloadProgress":
					this.handleDownloadProgress(data);
					break;
				case "overonDownloadStateChanged":
					this.handleDownloadStateChanged(data);
					break;
				case "overonDownloadCompleted":
					this.handleDownloadCompleted(data);
					break;
				case "overonDownloadError":
					this.handleDownloadError(data);
					break;
				case "overonDownloadPrepared":
					this.handleDownloadPrepared(data);
					break;
				case "overonDownloadPrepareError":
					this.handleDownloadPrepareError(data);
					break;
				case "overonLicenseDownloaded":
				case "overonLicenseError":
				case "overonLicenseExpired":
				case "overonLicenseCheck":
				case "overonLicenseCheckFailed":
					this.handleLicenseEvent(eventName, data);
					break;
				default:
					this.currentLogger.warn(TAG, `Unhandled native event: ${eventName}`, data);
			}
		} catch (error) {
			const playerError =
				error instanceof PlayerError
					? error
					: new PlayerError("NATIVE_EVENT_HANDLING_FAILED", {
							originalError: error,
							eventName,
							eventData: data,
						});

			this.currentLogger.error(TAG, `Error handling native event ${eventName}`, playerError);
			this.eventEmitter.emit("module_error", {
				event: eventName,
				data,
				error: playerError,
			});
		}
	}

	private handleDownloadProgress(data: unknown): void {
		const eventData = data as {
			id: string;
			progress?: number;
			speed?: number;
			bytesDownloaded?: number;
			downloadedBytes?: number; // Android sends this name
			totalBytes?: number;
			remainingTime?: number;
			localPath?: string;
			fileUri?: string;
			duration?: number;
		};
		// FILTRAR eventos innecesarios desde la fuente nativa
		const percent = eventData.progress || 0;
		const speed = eventData.speed || 0;

		// Log de debug para entender qué está pasando con descargas al 100%
		if (percent >= 100 && speed === 0) {
			this.currentLogger.warn(
				TAG,
				`Native module sending progress events for completed download: ${eventData.id}`,
				{
					progress: percent,
					speed: speed,
					state: "unknown_from_progress_event",
				}
			);
		}

		// Cuando el progreso llega a 100%, emitir evento de completado de forma determinística
		// Solo emitir si no hemos emitido ya para esta descarga
		if (percent >= 100 && speed === 0) {
			const alreadyCompleted = this.completedDownloads?.has(eventData.id);
			if (!alreadyCompleted) {
				this.currentLogger.info(
					TAG,
					`Download reached 100%, emitting completion: ${eventData.id}`
				);

				// Marcar como completada para evitar duplicados
				if (!this.completedDownloads) {
					this.completedDownloads = new Set<string>();
				}
				this.completedDownloads.add(eventData.id);

				// Emitir evento de completado
				this.eventEmitter.emit("download_completed", {
					downloadId: eventData.id,
					fileUri: eventData.localPath || eventData.fileUri,
					totalBytes: eventData.totalBytes || 0,
					duration: 0,
				});
			}
			return;
		}

		// Emitir evento de progreso - throttleado para reducir carga en el bridge JS
		// Android sends downloadedBytes, iOS sends bytesDownloaded - normalize here
		const bytesDownloaded = eventData.bytesDownloaded || eventData.downloadedBytes || 0;

		// Throttle: solo emitir si han pasado >= 2s, es el primer evento, o está cerca de completar
		const now = Date.now();
		const lastEmit = this.lastProgressEmitTime.get(eventData.id) || 0;
		const isFirstEvent = lastEmit === 0;
		const isNearCompletion = percent >= 95;
		const timeSinceLastEmit = now - lastEmit;

		if (!isFirstEvent && !isNearCompletion && timeSinceLastEmit < NativeManager.PROGRESS_THROTTLE_MS) {
			return;
		}

		this.lastProgressEmitTime.set(eventData.id, now);

		const progressEvent: DownloadProgressEvent = {
			downloadId: eventData.id,
			percent: percent,
			bytesDownloaded: bytesDownloaded,
			totalBytes: eventData.totalBytes || 0,
			speed: speed,
		};
		this.eventEmitter.emit("download_progress", progressEvent);
	}

	private handleDownloadStateChanged(data: unknown): void {
		const eventData = data as {
			id: string;
			state: string;
			previousState?: string;
		};
		this.eventEmitter.emit("download_state_changed", {
			downloadId: eventData.id,
			state: eventData.state,
			previousState: eventData.previousState,
			timestamp: Date.now(),
		});
	}

	private handleDownloadCompleted(data: unknown): void {
		const eventData = data as {
			id: string;
			fileUri?: string;
			localPath?: string;
			fileSize?: number;
			duration?: number;
		};
		const completeEvent: DownloadCompleteEvent = {
			downloadId: eventData.id,
			fileUri: eventData.fileUri || eventData.localPath || "",
			totalBytes: eventData.fileSize || 0,
			duration: eventData.duration || 0,
		};

		// Invalidar cache de download space en iOS
		if (Platform.OS === "ios") {
			storageService.invalidateDownloadSpaceCache();
		}

		this.eventEmitter.emit("download_completed", completeEvent);
	}

	private handleDownloadError(data: unknown): void {
		const eventData = data as {
			id: string;
			progress?: number;
			error?: {
				code?: string;
				message?: string;
				details?: unknown;
				domain?: string;
				errorCode?: number;
			};
			errorCode?: string;
			errorMessage?: string;
			errorDetails?: unknown;
		};

		// Map native error code to DownloadErrorCode enum
		const errorCode = eventData.error?.code || eventData.errorCode || "UNKNOWN";
		const mappedCode = Object.values(DownloadErrorCode).includes(errorCode as DownloadErrorCode)
			? (errorCode as DownloadErrorCode)
			: DownloadErrorCode.UNKNOWN;

		const errorMessage = eventData.error?.message || eventData.errorMessage || "Unknown error";

		// Check for NO_SPACE_LEFT error and create PlayerError
		if (mappedCode === DownloadErrorCode.NO_SPACE_LEFT || errorCode === "NO_SPACE_LEFT") {
			this.currentLogger.error(
				TAG,
				`❌ NO SPACE LEFT ON DEVICE for download: ${eventData.id}`
			);

			// Create and emit PlayerError for no space left
			const playerError = new PlayerError("DOWNLOAD_NO_SPACE", {
				downloadId: eventData.id,
				progress: eventData.progress,
				originalError: eventData.error,
				domain: eventData.error?.domain,
				errorCode: eventData.error?.errorCode,
			});

			// Emit module_error with PlayerError for consumers that listen to errors
			this.eventEmitter.emit("module_error", {
				event: "download_error",
				data: eventData,
				error: playerError,
			});
		}

		const errorEvent: DownloadFailedEvent = {
			downloadId: eventData.id,
			error: {
				code:
					mappedCode === DownloadErrorCode.UNKNOWN && errorCode === "NO_SPACE_LEFT"
						? DownloadErrorCode.NO_SPACE_LEFT
						: mappedCode,
				message: errorMessage,
				details: eventData.error?.details || eventData.errorDetails,
				timestamp: Date.now(),
			},
		};

		this.eventEmitter.emit("download_error", errorEvent);
	}

	private handleDownloadPrepared(data: unknown): void {
		this.eventEmitter.emit("download_prepared", data);
	}

	private handleDownloadPrepareError(data: unknown): void {
		this.eventEmitter.emit("download_prepare_error", data);
	}

	private handleLicenseEvent(eventName: string, data: unknown): void {
		this.eventEmitter.emit(eventName.replace(/([A-Z])/g, "_$1").toLowerCase(), data);
	}

	private bufferEvent(eventName: string, data: unknown): void {
		if (this.eventBuffer.length >= this.config.eventBufferSize) {
			this.eventBuffer.shift(); // Remover el más antiguo
		}

		this.eventBuffer.push({
			event: eventName,
			data,
			timestamp: Date.now(),
		});
	}

	/*
	 * API Pública - Gestión de descargas
	 *
	 */

	public async addDownload(config: NativeDownloadConfig): Promise<string> {
		this.validateInitialized();

		try {
			if (typeof this.nativeModule.addDownload !== "function") {
				throw new Error("nativeModule.addDownload is not a function");
			}

			// Verificar si el download ya existe en un estado válido para reanudar
			// hasDownload() en Android ahora devuelve false para descargas en estados inválidos
			// (FAILED, STOPPED, REMOVING), y addDownload() las limpia automáticamente
			try {
				const existingDownload = await this.nativeModule.hasDownload(config.id);

				if (existingDownload) {
					// La descarga existe en un estado válido (DOWNLOADING, QUEUED, COMPLETED, etc.)
					// Intentar reanudarla en lugar de crear una nueva
					try {
						await this.nativeModule.resumeDownload(config.id);
						this.currentLogger.info(TAG, `Resumed existing download: ${config.id}`);
						return config.id;
					} catch (resumeError) {
						// Si no se puede reanudar, el módulo nativo manejará la limpieza
						this.currentLogger.warn(
							TAG,
							`Failed to resume download ${config.id}, will attempt fresh download`,
							resumeError
						);
					}
				}
			} catch (checkError) {
				// Log pero no fallar - el módulo nativo manejará descargas problemáticas
				this.currentLogger.warn(
					TAG,
					`Failed to check existing download ${config.id}`,
					checkError
				);
			}

			// El módulo nativo (addDownload en Android) ahora limpia automáticamente
			// descargas en estados inválidos antes de crear nuevas
			const result = await this.nativeModule.addDownload(config);
			this.currentLogger.debug(TAG, `Download added: ${config.id}`);
			return result || config.id;
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to add download: ${config.id}`, error);
			throw new PlayerError("NATIVE_ADD_DOWNLOAD_FAILED", {
				originalError: error,
				downloadId: config.id,
				uri: config.uri,
			});
		}
	}

	public async removeDownload(downloadId: string): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.removeDownload(downloadId);
			this.currentLogger.debug(TAG, `Download removed: ${downloadId}`);

			// Invalidar cache de download space en iOS
			if (Platform.OS === "ios") {
				storageService.invalidateDownloadSpaceCache();
			}
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to remove download: ${downloadId}`, error);
			throw new PlayerError("NATIVE_REMOVE_DOWNLOAD_FAILED", {
				originalError: error,
				downloadId,
			});
		}
	}

	public async pauseDownload(downloadId: string): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.pauseDownload(downloadId);
			this.currentLogger.debug(TAG, `Download paused: ${downloadId}`);
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to pause download: ${downloadId}`, error);
			throw new PlayerError("NATIVE_PAUSE_DOWNLOAD_FAILED", {
				originalError: error,
				downloadId,
			});
		}
	}

	public async resumeDownload(downloadId: string): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.resumeDownload(downloadId);
			this.currentLogger.debug(TAG, `Download resumed: ${downloadId}`);
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to resume download: ${downloadId}`, error);
			throw new PlayerError("NATIVE_RESUME_DOWNLOAD_FAILED", {
				originalError: error,
				downloadId,
			});
		}
	}

	public async cancelDownload(downloadId: string): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.cancelDownload(downloadId);
			this.currentLogger.debug(TAG, `Download cancelled: ${downloadId}`);
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to cancel download: ${downloadId}`, error);
			throw new PlayerError("NATIVE_CANCEL_DOWNLOAD_FAILED", {
				originalError: error,
				downloadId,
			});
		}
	}

	/*
	 * API Pública - Control masivo
	 *
	 */

	public async pauseAll(): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.pauseAll();
			this.currentLogger.debug(TAG, "All downloads paused");
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to pause all downloads", error);
			throw new PlayerError("NATIVE_PAUSE_ALL_FAILED", {
				originalError: error,
			});
		}
	}

	public async resumeAll(): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.resumeAll();
			this.currentLogger.debug(TAG, "All downloads resumed");
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to resume all downloads", error);
			throw new PlayerError("NATIVE_RESUME_ALL_FAILED", {
				originalError: error,
			});
		}
	}

	/**
	 * Inicia el procesamiento de descargas de forma controlada
	 * Este método debe ser llamado explícitamente cuando se quiera empezar las descargas
	 */
	public async startDownloadProcessing(): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.resumeAll();
			this.currentLogger.info(
				TAG,
				"Download processing started via startDownloadProcessing()"
			);
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to start download processing", error);
			throw new PlayerError("NATIVE_START_PROCESSING_FAILED", {
				originalError: error,
			});
		}
	}

	/*
	 * Pausa todo el procesamiento de descargas
	 *
	 */

	public async stopDownloadProcessing(): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.pauseAll();
			this.currentLogger.info(
				TAG,
				"Download processing stopped via stopDownloadProcessing()"
			);
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to stop download processing", error);
			throw new PlayerError("NATIVE_STOP_PROCESSING_FAILED", {
				originalError: error,
			});
		}
	}

	public async cancelAll(): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.cancelAll();
			this.currentLogger.debug(TAG, "All downloads cancelled");
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to cancel all downloads", error);
			throw new PlayerError("NATIVE_CANCEL_ALL_FAILED", {
				originalError: error,
			});
		}
	}

	/*
	 * API Pública - Consultas
	 *
	 */

	public async getDownloads(): Promise<DownloadItem[]> {
		this.validateInitialized();

		try {
			const result = await this.nativeModule.getDownloads();
			this.currentLogger.debug(TAG, "getDownloads raw result:", result);

			// El módulo Android devuelve { downloads: [...] } en lugar de [...]
			const downloads = result?.downloads || result || [];

			return Array.isArray(downloads) ? downloads : [];
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to get downloads", error);
			throw new PlayerError("NATIVE_GET_DOWNLOADS_FAILED", {
				originalError: error,
			});
		}
	}

	/*
	 * Método público para obtener información de una descarga específica
	 *
	 */

	public async getDownload(downloadId: string): Promise<DownloadItem | null> {
		this.validateInitialized();

		try {
			const downloads = await this.nativeModule.getDownloads();
			const download = downloads.find((d: DownloadItem) => d.id === downloadId);
			return download || null;
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to get download info: ${downloadId}`, error);
			throw new PlayerError("NATIVE_GET_DOWNLOAD_FAILED", {
				originalError: error,
				downloadId,
			});
		}
	}

	public async hasDownload(downloadId: string): Promise<boolean> {
		this.validateInitialized();

		try {
			return await this.nativeModule.hasDownload(downloadId);
		} catch (error) {
			this.currentLogger.error(
				TAG,
				`Failed to check download existence: ${downloadId}`,
				error
			);
			return false;
		}
	}

	public async getStats(): Promise<NativeDownloadStats> {
		this.validateInitialized();

		try {
			const stats = await this.nativeModule.getStats();
			return (
				stats || {
					totalDownloads: 0,
					activeDownloads: 0,
					completedDownloads: 0,
					failedDownloads: 0,
					totalBytes: 0,
					downloadedBytes: 0,
					avgSpeed: 0,
				}
			);
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to get download stats", error);
			throw new PlayerError("NATIVE_GET_STATS_FAILED", {
				originalError: error,
			});
		}
	}

	/*
	 * API Pública - Configuración
	 *
	 */

	public async setStreamQuality(
		quality: "auto" | "low" | "medium" | "high" | "max"
	): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.setStreamQuality(quality);
			this.currentLogger.debug(TAG, `Stream quality set to: ${quality}`);
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to set stream quality: ${quality}`, error);
			throw new PlayerError("NATIVE_SET_QUALITY_FAILED", {
				originalError: error,
				quality,
			});
		}
	}

	public async setNetworkPolicy(config: {
		allowCellular: boolean;
		requireWifi?: boolean;
	}): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.setNetworkPolicy(config);
			this.currentLogger.debug(TAG, "Network policy updated", config);
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to set network policy", error);
			throw new PlayerError("NATIVE_SET_NETWORK_POLICY_FAILED", {
				originalError: error,
				config,
			});
		}
	}

	public async setDownloadLimits(config: { maxConcurrent?: number }): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.setDownloadLimits(config);
			this.currentLogger.debug(TAG, "Download limits updated", config);
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to set download limits", error);
			throw new PlayerError("NATIVE_SET_LIMITS_FAILED", {
				originalError: error,
				config,
			});
		}
	}

	/*
	 * API Pública - DRM
	 *
	 */

	public async downloadLicense(contentId: string, drmConfig: IDrm): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.downloadLicense(contentId, drmConfig);
			this.currentLogger.debug(TAG, `License download started for: ${contentId}`);
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to download license: ${contentId}`, error);
			throw new PlayerError("NATIVE_DOWNLOAD_LICENSE_FAILED", {
				originalError: error,
				contentId,
			});
		}
	}

	public async checkLicense(contentId: string): Promise<boolean> {
		this.validateInitialized();

		try {
			return await this.nativeModule.checkLicense(contentId);
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to check license: ${contentId}`, error);
			throw new PlayerError("NATIVE_CHECK_LICENSE_FAILED", {
				originalError: error,
				contentId,
			});
		}
	}

	public async renewLicense(contentId: string): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.renewLicense(contentId);
			this.currentLogger.debug(TAG, `License renewal started for: ${contentId}`);
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to renew license: ${contentId}`, error);
			throw new PlayerError("NATIVE_RENEW_LICENSE_FAILED", {
				originalError: error,
				contentId,
			});
		}
	}

	public async releaseLicense(contentId: string): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.releaseLicense(contentId);
			this.currentLogger.debug(TAG, `License released for: ${contentId}`);
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to release license: ${contentId}`, error);
			throw new PlayerError("NATIVE_RELEASE_LICENSE_FAILED", {
				originalError: error,
				contentId,
			});
		}
	}

	public async releaseAllLicenses(): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.releaseAllLicenses();
			this.currentLogger.debug(TAG, "All licenses released");
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to release all licenses", error);
			throw new PlayerError("NATIVE_RELEASE_ALL_LICENSES_FAILED", {
				originalError: error,
			});
		}
	}

	/*
	 * API Pública - Utilidades
	 *
	 */

	public async generateDownloadId(uri: string): Promise<string> {
		this.validateInitialized();

		try {
			return await this.nativeModule.generateDownloadId(uri);
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to generate download ID for: ${uri}`, error);
			throw new PlayerError("NATIVE_GENERATE_ID_FAILED", {
				originalError: error,
				uri,
			});
		}
	}

	public async validateDownloadUri(
		uri: string
	): Promise<{ isValid: boolean; errors?: string[] }> {
		this.validateInitialized();

		try {
			return await this.nativeModule.validateDownloadUri(uri);
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to validate URI: ${uri}`, error);
			return { isValid: false, errors: ["Validation failed"] };
		}
	}

	/*
	 * Método para limpiar descargas problemáticas que siguen enviando eventos
	 *
	 */

	public async cleanupCompletedDownload(downloadId: string): Promise<boolean> {
		this.validateInitialized();

		try {
			this.currentLogger.info(TAG, `Attempting to cleanup completed download: ${downloadId}`);

			// Primero intentar obtener info de la descarga
			const downloadInfo = await this.getDownload(downloadId);
			if (downloadInfo) {
				this.currentLogger.info(TAG, "Download info before cleanup:", downloadInfo);

				// Si está al 100%, intentar removerla del módulo nativo
				if (downloadInfo.stats?.progressPercent >= 100) {
					await this.nativeModule.removeDownload(downloadId);
					this.currentLogger.info(
						TAG,
						`Successfully removed completed download: ${downloadId}`
					);
					return true;
				}
			}

			return false;
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to cleanup download ${downloadId}`, error);
			return false;
		}
	}

	public async setDownloadDirectories(config: {
		downloadDir?: string;
		tempDir?: string;
		subtitlesDir?: string;
	}): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.setDownloadDirectories(config);
			this.currentLogger.debug(TAG, "Download directories updated", config);
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to set download directories", error);
			throw new PlayerError("NATIVE_SET_DIRECTORIES_FAILED", {
				originalError: error,
				config,
			});
		}
	}

	/*
	 * Subtitle Bookmark Management (iOS only - survives sandbox UUID changes)
	 *
	 */

	/**
	 * Save a bookmark for a subtitle file (iOS only)
	 * This allows the path to survive sandbox UUID changes between app sessions
	 */
	public async saveSubtitleBookmark(
		downloadId: string,
		language: string,
		filePath: string
	): Promise<boolean> {
		if (Platform.OS !== "ios") {
			// Android doesn't need bookmarks - paths are stable
			return true;
		}

		this.validateInitialized();

		try {
			const result = await this.nativeModule.saveSubtitleBookmarkFromPath(
				downloadId,
				language,
				filePath
			);
			this.currentLogger.debug(TAG, `Saved subtitle bookmark for ${downloadId}:${language}`);
			return result === true;
		} catch (error) {
			this.currentLogger.error(
				TAG,
				`Failed to save subtitle bookmark for ${downloadId}:${language}`,
				error
			);
			return false;
		}
	}

	/**
	 * Resolve a subtitle bookmark to get the current valid path (iOS only)
	 * Returns the resolved path or null if bookmark doesn't exist
	 */
	public async resolveSubtitlePath(downloadId: string, language: string): Promise<string | null> {
		if (Platform.OS !== "ios") {
			// Android doesn't need resolution - paths are stable
			return null;
		}

		this.validateInitialized();

		try {
			const resolvedPath = await this.nativeModule.resolveSubtitlePath(downloadId, language);
			if (resolvedPath && typeof resolvedPath === "string") {
				this.currentLogger.debug(
					TAG,
					`Resolved subtitle path for ${downloadId}:${language}: ${resolvedPath}`
				);
				return resolvedPath;
			}
			return null;
		} catch (error) {
			this.currentLogger.error(
				TAG,
				`Failed to resolve subtitle path for ${downloadId}:${language}`,
				error
			);
			return null;
		}
	}

	/**
	 * Resolve multiple subtitle bookmarks at once (iOS only)
	 * More efficient than calling resolveSubtitlePath multiple times
	 */
	public async resolveSubtitlePaths(
		subtitles: Array<{ downloadId: string; language: string }>
	): Promise<Map<string, string>> {
		const results = new Map<string, string>();

		if (Platform.OS !== "ios") {
			// Android doesn't need resolution - paths are stable
			return results;
		}

		this.validateInitialized();

		try {
			const resolved = await this.nativeModule.resolveSubtitlePaths(subtitles);
			if (resolved && typeof resolved === "object") {
				for (const [key, path] of Object.entries(resolved)) {
					if (path && typeof path === "string") {
						results.set(key, path);
					}
				}
			}
			this.currentLogger.debug(
				TAG,
				`Resolved ${results.size}/${subtitles.length} subtitle paths`
			);
			return results;
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to resolve subtitle paths", error);
			return results;
		}
	}

	/*
	 * Sistema de eventos
	 *
	 */

	public subscribe(
		event: NativeManagerEventType | "all",
		callback: NativeManagerEventCallback
	): () => void {
		if (event === "all") {
			const events: NativeManagerEventType[] = [
				"module_ready",
				"module_error",
				"download_progress",
				"download_state_changed",
				"download_completed",
				"download_error",
				"license_downloaded",
				"license_error",
				"license_expired",
				"license_check",
				"license_check_failed",
				"system_info_updated",
			];

			events.forEach(eventType => {
				this.eventEmitter.on(eventType, callback);
			});

			return () => {
				events.forEach(eventType => {
					this.eventEmitter.off(eventType, callback);
				});
			};
		} else {
			this.eventEmitter.on(event, callback);
			return () => this.eventEmitter.off(event, callback);
		}
	}

	/*
	 * Información del sistema
	 *
	 */

	public getSystemInfo(): SystemInfo | null {
		return this.systemInfo;
	}

	public async refreshSystemInfo(): Promise<SystemInfo> {
		this.validateInitialized();

		try {
			const info = await this.nativeModule.getSystemInfo();
			if (info) {
				this.systemInfo = {
					...this.systemInfo!,
					...info,
					platform: Platform.OS,
				};

				this.eventEmitter.emit("system_info_updated", this.systemInfo);
			}
			return this.systemInfo!;
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to refresh system info", error);
			throw new PlayerError("NATIVE_REFRESH_SYSTEM_INFO_FAILED", {
				originalError: error,
			});
		}
	}

	/*
	 * Debugging y utilidades
	 *
	 */

	public getEventHistory(): Array<{ event: string; data: unknown; timestamp: number }> {
		return [...this.eventBuffer];
	}

	public clearEventHistory(): void {
		this.eventBuffer = [];
	}

	public isNativeModuleAvailable(): boolean {
		return this.nativeModule !== null;
	}

	public getConfig(): NativeManagerConfig {
		return { ...this.config };
	}

	/*
	 * Utilidades privadas
	 *
	 */

	private validateInitialized(): void {
		if (!this.isInitialized) {
			throw new PlayerError("NATIVE_MANAGER_NOT_INITIALIZED");
		}
	}

	public destroy(): void {
		// Limpiar event subscriptions nativas
		this.eventSubscriptions.forEach((subscription, eventName) => {
			try {
				subscription.remove();
			} catch (error) {
				this.currentLogger.warn(
					TAG,
					`Error removing native subscription: ${eventName}`,
					error
				);
			}
		});
		this.eventSubscriptions.clear();

		// Remover listeners del event emitter
		this.eventEmitter.removeAllListeners();

		// Reset estado
		this.isInitialized = false;
		this.systemInfo = null;
		this.eventBuffer = [];
		this.nativeEventEmitter = null;

		this.currentLogger.info(TAG, "NativeManager destroyed");
	}
}

// Export singleton instance
export const nativeManager = NativeManager.getInstance();
