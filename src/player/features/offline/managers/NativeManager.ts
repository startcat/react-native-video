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

const TAG = LOG_TAGS.NATIVE_MANAGER;

export class NativeManager {
	private static instance: NativeManager;
	private eventEmitter: EventEmitter;
	private config: NativeManagerConfig;
	private currentLogger: Logger;
	private isInitialized: boolean = false;

	// Referencias a módulos nativos
	private nativeModule: any = null;
	private nativeEventEmitter: NativeEventEmitter | null = null;
	private eventSubscriptions: Map<string, any> = new Map();

	// Estado interno
	private systemInfo: SystemInfo | null = null;
	private eventBuffer: Array<{ event: string; data: any; timestamp: number }> = [];

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
		}
	}

	/*
	 * Configuración y setup del módulo nativo
	 *
	 */

	private setupNativeModule(): void {
		try {
			// Buscar el módulo nativo
			this.nativeModule = NativeModules.DownloadsModule2;

			console.log(
				`[NativeManager] Available native modules:`,
				Object.keys(NativeModules).filter(name => name.includes("Download"))
			);
			console.log(`[NativeManager] DownloadsModule2 available:`, !!this.nativeModule);

			if (this.nativeModule) {
				// Crear event emitter nativo
				this.nativeEventEmitter = new NativeEventEmitter(this.nativeModule);
				this.currentLogger.debug(TAG, `Native module found for ${Platform.OS}`);
				console.log(`[NativeManager] Native module DownloadsModule2 loaded successfully`);
			} else {
				this.currentLogger.warn(
					TAG,
					`Native module DownloadsModule2 not found for ${Platform.OS}`
				);
				console.warn(
					`[NativeManager] DownloadsModule2 not available. Stream downloads will not work.`
				);
			}
		} catch (error) {
			this.currentLogger.error(TAG, "Error setting up native module", error);
			console.error(`[NativeManager] Error setting up native module:`, error);
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

		console.log(`[NativeManager] Setting up native event listeners for:`, events);

		events.forEach(eventName => {
			const subscription = this.nativeEventEmitter!.addListener(eventName, (data: any) => {
				console.log(`[NativeManager] Native event listener triggered: ${eventName}`, data);
				this.handleNativeEvent(eventName, data);
			});

			this.eventSubscriptions.set(eventName, subscription);
			console.log(`[NativeManager] Event listener configured for: ${eventName}`);
		});

		console.log(`[NativeManager] All ${events.length} native event listeners configured`);
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

			// Asegurar que todas las descargas estén pausadas por defecto después de la inicialización
			// El módulo nativo debe inicializar en estado pausado, pero lo garantizamos explícitamente
			try {
				await this.nativeModule.pauseAll();
				this.currentLogger.info(TAG, "All downloads paused after native initialization");
			} catch (error) {
				this.currentLogger.warn(TAG, "Failed to pause downloads after initialization", error);
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

	private handleNativeEvent(eventName: string, data: any): void {
		try {
			console.log(`[NativeManager] Received native event: ${eventName}`, data);

			// Buffer del evento para debugging
			this.bufferEvent(eventName, data);

			// Mapear evento nativo a evento del manager
			switch (eventName) {
				case "overonDownloadProgress":
					console.log(`[NativeManager] Handling overonDownloadProgress:`, data);
					this.handleDownloadProgress(data);
					break;
				case "overonDownloadStateChanged":
					console.log(`[NativeManager] Handling overonDownloadStateChanged:`, data);
					this.handleDownloadStateChanged(data);
					break;
				case "overonDownloadCompleted":
					console.log(`[NativeManager] Handling overonDownloadCompleted:`, data);
					this.handleDownloadCompleted(data);
					break;
				case "overonDownloadError":
					console.log(`[NativeManager] Handling overonDownloadError:`, data);
					this.handleDownloadError(data);
					break;
				case "overonDownloadPrepared":
					console.log(`[NativeManager] Handling overonDownloadPrepared:`, data);
					this.handleDownloadPrepared(data);
					break;
				case "overonDownloadPrepareError":
					console.log(`[NativeManager] Handling overonDownloadPrepareError:`, data);
					this.handleDownloadPrepareError(data);
					break;
				case "overonLicenseDownloaded":
				case "overonLicenseError":
				case "overonLicenseExpired":
				case "overonLicenseCheck":
				case "overonLicenseCheckFailed":
					console.log(`[NativeManager] Handling license event: ${eventName}`, data);
					this.handleLicenseEvent(eventName, data);
					break;
				default:
					console.warn(`[NativeManager] Unhandled native event: ${eventName}`, data);
					this.currentLogger.warn(TAG, `Unhandled native event: ${eventName}`, data);
			}
		} catch (error) {
			console.error(`[NativeManager] Error handling native event ${eventName}:`, error);
			this.currentLogger.error(TAG, `Error handling native event ${eventName}`, error);
			this.eventEmitter.emit("module_error", {
				event: eventName,
				data,
				error: error,
			});
		}
	}

	private handleDownloadProgress(data: any): void {
		const progressEvent: DownloadProgressEvent = {
			downloadId: data.id,
			percent: data.progress || 0,
			bytesDownloaded: data.bytesDownloaded || 0,
			totalBytes: data.totalBytes || 0,
			speed: data.speed,
			remainingTime: data.remainingTime,
		};

		this.eventEmitter.emit("download_progress", progressEvent);
	}

	private handleDownloadStateChanged(data: any): void {
		this.eventEmitter.emit("download_state_changed", {
			downloadId: data.id,
			state: data.state,
			previousState: data.previousState,
			timestamp: Date.now(),
		});
	}

	private handleDownloadCompleted(data: any): void {
		const completeEvent: DownloadCompleteEvent = {
			downloadId: data.id,
			fileUri: data.fileUri || data.localPath,
			totalBytes: data.totalBytes || 0,
			duration: data.duration || 0,
		};

		this.eventEmitter.emit("download_completed", completeEvent);
	}

	private handleDownloadError(data: any): void {
		const errorEvent: DownloadFailedEvent = {
			downloadId: data.id,
			error: {
				code: data.errorCode || "UNKNOWN",
				message: data.message || "Unknown download error",
				details: data.details,
				timestamp: Date.now(),
			},
		};

		this.eventEmitter.emit("download_error", errorEvent);
	}

	private handleDownloadPrepared(data: any): void {
		console.log(`[NativeManager] Download prepared successfully:`, data);
		this.eventEmitter.emit("download_prepared", data);
	}

	private handleDownloadPrepareError(data: any): void {
		console.log(`[NativeManager] Download prepare failed:`, data);
		this.eventEmitter.emit("download_prepare_error", data);
	}

	private handleLicenseEvent(eventName: string, data: any): void {
		this.eventEmitter.emit(eventName.replace(/([A-Z])/g, "_$1").toLowerCase(), data);
	}

	private bufferEvent(eventName: string, data: any): void {
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
			console.log(
				`[NativeManager] About to call nativeModule.addDownload with config:`,
				JSON.stringify(config, null, 2)
			);
			console.log(
				`[NativeManager] Config validation - ID: ${config.id}, URI: ${config.uri}, Title: ${config.title}`
			);

			// Verificar que nativeModule tiene la función
			console.log(
				`[NativeManager] Available nativeModule methods:`,
				Object.keys(this.nativeModule)
			);
			if (typeof this.nativeModule.addDownload !== "function") {
				throw new Error("nativeModule.addDownload is not a function");
			}

			// Verificar si el download ya existe antes de llamar al nativo
			try {
				const existingDownload = await this.nativeModule.hasDownload(config.id);
				console.log(
					`[NativeManager] hasDownload(${config.id}) returned:`,
					existingDownload
				);
				
				if (existingDownload) {
					console.log(`[NativeManager] Download ${config.id} already exists, attempting to resume...`);
					try {
						await this.nativeModule.resumeDownload(config.id);
						console.log(`[NativeManager] Successfully resumed existing download: ${config.id}`);
						return config.id;
					} catch (resumeError) {
						console.warn(`[NativeManager] Failed to resume download, will try to remove and re-add:`, resumeError);
						try {
							await this.nativeModule.removeDownload(config.id);
							console.log(`[NativeManager] Removed existing download: ${config.id}`);
						} catch (removeError) {
							console.warn(`[NativeManager] Failed to remove existing download:`, removeError);
						}
					}
				}
			} catch (e) {
				console.warn(`[NativeManager] Failed to check existing download:`, e);
			}

			console.log(`[NativeManager] Calling nativeModule.addDownload...`);
			const result = await this.nativeModule.addDownload(config);
			console.log(`[NativeManager] addDownload completed, result:`, result);

			console.log(`[NativeManager] nativeModule.addDownload returned:`, result);
			this.currentLogger.debug(TAG, `Download added: ${config.id}`);
			return result || config.id;
		} catch (error) {
			console.error(`[NativeManager] nativeModule.addDownload failed:`, error);
			console.error(`[NativeManager] Failed config was:`, JSON.stringify(config, null, 2));
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
			this.currentLogger.info(TAG, "Download processing started via startDownloadProcessing()");
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to start download processing", error);
			throw new PlayerError("DOWNLOAD_FAILED", {
				originalError: error,
				operation: "startDownloadProcessing",
			});
		}
	}

	/**
	 * Pausa todo el procesamiento de descargas
	 */
	public async stopDownloadProcessing(): Promise<void> {
		this.validateInitialized();

		try {
			await this.nativeModule.pauseAll();
			this.currentLogger.info(TAG, "Download processing stopped via stopDownloadProcessing()");
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to stop download processing", error);
			throw new PlayerError("DOWNLOAD_FAILED", {
				originalError: error,
				operation: "stopDownloadProcessing",
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
			console.log(`[NativeManager] getDownloads raw result:`, result);

			// El módulo Android devuelve { downloads: [...] } en lugar de [...]
			const downloads = result?.downloads || result || [];
			console.log(`[NativeManager] extracted downloads:`, downloads);

			return Array.isArray(downloads) ? downloads : [];
		} catch (error) {
			console.error(`[NativeManager] getDownloads failed:`, error);
			this.currentLogger.error(TAG, "Failed to get downloads", error);
			throw new PlayerError("NATIVE_GET_DOWNLOADS_FAILED", {
				originalError: error,
			});
		}
	}

	public async getDownload(downloadId: string): Promise<DownloadItem | null> {
		this.validateInitialized();

		try {
			const download = await this.nativeModule.getDownload(downloadId);
			return download || null;
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to get download: ${downloadId}`, error);
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

	public getEventHistory(): Array<{ event: string; data: any; timestamp: number }> {
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
