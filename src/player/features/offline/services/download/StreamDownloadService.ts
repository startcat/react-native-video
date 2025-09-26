/*
 * Servicio singleton para gestión de descargas de streams (HLS/DASH)
 * Usa NativeManager (DownloadsModule2) para descargas nativas con DRM
 * Integra con NetworkService y ProfileManager
 *
 */

import { EventEmitter } from "eventemitter3";
import { PlayerError } from "../../../../core/errors";
import { Logger } from "../../../logger";
import { LOG_TAGS } from "../../constants";
import { DEFAULT_CONFIG_STREAM_DOWNLOAD, LOGGER_DEFAULTS } from "../../defaultConfigs";
import { nativeManager } from "../../managers/NativeManager";
import {
	ActiveStreamDownload,
	DownloadError,
	DownloadErrorCode,
	DownloadEventType,
	DownloadStates,
	StreamDownloadServiceConfig,
	StreamDownloadTask,
	ValidationResult,
} from "../../types";
import { networkService } from "../network/NetworkService";

const TAG = LOG_TAGS.STREAM_DOWNLOADER;

export class StreamDownloadService {
	private static instance: StreamDownloadService;
	private eventEmitter: EventEmitter;
	private config: StreamDownloadServiceConfig;
	private currentLogger: Logger;
	private isInitialized: boolean = false;
	private activeDownloads: Map<string, ActiveStreamDownload> = new Map();
	private downloadQueue: StreamDownloadTask[] = [];
	private isProcessingQueue: boolean = false;

	private constructor() {
		this.eventEmitter = new EventEmitter();
		this.config = DEFAULT_CONFIG_STREAM_DOWNLOAD;
		this.currentLogger = new Logger({
			...LOGGER_DEFAULTS,
			enabled: this.config.logEnabled,
			level: this.config.logLevel,
		});
	}

	public static getInstance(): StreamDownloadService {
		if (!StreamDownloadService.instance) {
			StreamDownloadService.instance = new StreamDownloadService();
		}
		return StreamDownloadService.instance;
	}

	public async initialize(config?: Partial<StreamDownloadServiceConfig>): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		// Actualizar configuración
		this.config = { ...this.config, ...config };
		this.currentLogger.updateConfig({
			enabled: this.config.logEnabled,
			level: this.config.logLevel,
		});

		try {
			// Verificar dependencias
			if (!nativeManager) {
				throw new PlayerError("DOWNLOAD_BINARY_SERVICE_INITIALIZATION_FAILED", {
					originalError: new Error("NativeManager is required"),
				});
			}

			if (!networkService) {
				throw new PlayerError("DOWNLOAD_BINARY_SERVICE_INITIALIZATION_FAILED", {
					originalError: new Error("NetworkService is required"),
				});
			}

			// Configurar NativeManager si no está inicializado
			if (!nativeManager.isNativeModuleAvailable()) {
				await nativeManager.initialize();
			}

			// Suscribirse a eventos nativos
			this.setupNativeEventListeners();

			// Suscribirse a eventos de red
			networkService.subscribe("all", this.handleNetworkChange.bind(this));

			// Recuperar descargas pendientes
			await this.recoverPendingDownloads();

			this.isInitialized = true;
			this.currentLogger.info(TAG, "StreamDownloadService initialized with NativeManager");

			// Iniciar procesamiento de cola
			this.startQueueProcessing();
		} catch (error) {
			throw new PlayerError("DOWNLOAD_BINARY_SERVICE_INITIALIZATION_FAILED", {
				originalError: error,
			});
		}
	}

	/*
	 * Configuración de event listeners nativos
	 *
	 */

	private setupNativeEventListeners(): void {
		// Suscribirse a todos los eventos del NativeManager
		nativeManager.subscribe("all", (data: any) => {
			this.handleNativeEvent(data);
		});

		this.currentLogger.debug(TAG, "Native event listeners configured");
	}

	/*
	 * Manejo de eventos nativos
	 *
	 */

	private handleNativeEvent(data: any): void {
		try {
			// Los eventos nativos ya están mapeados por el NativeManager
			// Solo necesitamos reenviarlos con el contexto correcto
			this.eventEmitter.emit(data.type || "unknown", data);
		} catch (error) {
			this.currentLogger.error(TAG, "Error handling native event", error);
		}
	}

	/*
	 * Recupera descargas pendientes del sistema nativo
	 *
	 */

	private async recoverPendingDownloads(): Promise<void> {
		try {
			const downloads = await nativeManager.getDownloads();

			for (const download of downloads) {
				if (download.type === "STREAM") {
					this.currentLogger.info(
						TAG,
						`Recovered stream download: ${download.id} - State: ${download.state}`
					);

					// Crear ActiveStreamDownload para las descargas recuperadas
					const activeDownload: ActiveStreamDownload = {
						task: {
							id: download.id,
							manifestUrl: download.uri,
							title: download.title,
							config: {
								type: download.uri.includes(".m3u8") ? "HLS" : "DASH",
								quality: this.config.defaultQuality,
								drm: download.drm,
							},
						},
						startTime: download.stats?.startedAt || Date.now(),
						retryCount: download.stats?.retryCount || 0,
						state: download.state,
						progress: {
							downloadId: download.id,
							percent: download.stats?.progressPercent || 0,
							bytesDownloaded: download.stats?.bytesDownloaded || 0,
							totalBytes: download.stats?.totalBytes || 0,
							segmentsCompleted: download.stats?.segmentsCompleted,
							segmentsTotal: download.stats?.segmentsTotal,
						},
					};

					this.activeDownloads.set(download.id, activeDownload);
				}
			}

			this.currentLogger.info(
				TAG,
				`Recovered ${this.activeDownloads.size} pending stream downloads`
			);
		} catch (error) {
			this.currentLogger.warn(TAG, `Failed to recover pending downloads: ${error}`);
		}
	}

	/*
	 * Maneja cambios de red
	 *
	 */

	private handleNetworkChange(networkStatus: any): void {
		// Si WiFi es requerido y se perdió la conexión WiFi
		if (this.config.requiresWifi && !networkStatus.isWifi && networkStatus.isCellular) {
			this.currentLogger.info(TAG, "WiFi lost, pausing downloads that require WiFi");

			for (const [downloadId, download] of this.activeDownloads) {
				if (download.state === DownloadStates.DOWNLOADING) {
					this.pauseDownload(downloadId).catch(error => {
						this.currentLogger.error(
							TAG,
							`Failed to pause download on network change: ${downloadId}`,
							error
						);
					});
				}
			}
		}

		// Si se perdió toda la conectividad
		if (!networkStatus.isConnected) {
			this.currentLogger.info(TAG, "Network lost, downloads will pause automatically");
		}

		// Si volvió la conectividad adecuada, reanudar descargas pausadas
		if (networkStatus.isConnected && (!this.config.requiresWifi || networkStatus.isWifi)) {
			this.currentLogger.info(TAG, "Network restored, resuming paused downloads");

			for (const [downloadId, download] of this.activeDownloads) {
				if (
					download.state === DownloadStates.PAUSED ||
					download.state === DownloadStates.WAITING_FOR_NETWORK
				) {
					this.resumeDownload(downloadId).catch(error => {
						this.currentLogger.error(
							TAG,
							`Failed to resume download on network restoration: ${downloadId}`,
							error
						);
					});
				}
			}
		}
	}

	/*
	 * Inicia el procesamiento periódico de la cola
	 *
	 */

	private startQueueProcessing(): void {
		if (this.isProcessingQueue) return;

		this.isProcessingQueue = true;
		setInterval(() => {
			this.processNextInQueue();
		}, this.config.progressUpdateInterval);

		this.currentLogger.debug(TAG, "Queue processing started");
	}

	/*
	 * Procesa la siguiente descarga en cola
	 *
	 */

	private processNextInQueue(): void {
		if (
			this.downloadQueue.length === 0 ||
			this.activeDownloads.size >= this.config.maxConcurrentDownloads
		) {
			return;
		}

		const nextTask = this.downloadQueue.shift();
		if (nextTask) {
			this.executeStreamDownload(nextTask);
		}
	}

	/*
	 * API Pública - Gestión de descargas de streams
	 *
	 */

	public async startDownload(task: StreamDownloadTask): Promise<void> {
		if (!this.isInitialized) {
			throw new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE");
		}

		// Validar tarea
		const validation = this.validateStreamTask(task);
		if (!validation.isValid) {
			throw new PlayerError("DOWNLOAD_INVALID_CONTENT_ID", {
				errors: validation.errors,
				taskId: task.id,
			});
		}

		try {
			// Verificar si ya está descargando
			if (this.activeDownloads.has(task.id)) {
				this.currentLogger.warn(TAG, `Stream download already active: ${task.id}`);
				return;
			}

			// Verificar conectividad
			if (!networkService.isOnline()) {
				throw new PlayerError("NETWORK_CONNECTION_001", { taskId: task.id });
			}

			// Verificar WiFi si es requerido
			if (this.config.requiresWifi && !networkService.isWifiConnected()) {
				throw new PlayerError("NETWORK_DOWNLOADS_WIFI_RESTRICTED", { taskId: task.id });
			}

			// Si hay demasiadas descargas activas, agregar a cola
			if (this.activeDownloads.size >= this.config.maxConcurrentDownloads) {
				this.downloadQueue.push(task);
				this.currentLogger.info(TAG, `Stream download queued: ${task.id}`);

				this.eventEmitter.emit(DownloadEventType.QUEUED, {
					taskId: task.id,
					queuePosition: this.downloadQueue.length,
				});
				return;
			}

			// Iniciar descarga inmediatamente
			await this.executeStreamDownload(task);
		} catch (error) {
			throw new PlayerError("DOWNLOAD_FAILED", {
				originalError: error,
				taskId: task.id,
			});
		}
	}

	public async pauseDownload(downloadId: string): Promise<void> {
		const download = this.activeDownloads.get(downloadId);
		if (!download) {
			throw new PlayerError("DOWNLOAD_QUEUE_ITEM_NOT_FOUND", { downloadId });
		}

		if (download.state !== DownloadStates.DOWNLOADING) {
			this.currentLogger.warn(TAG, `Stream download not in downloading state: ${downloadId}`);
			return;
		}

		try {
			await nativeManager.pauseDownload(downloadId);
			this.currentLogger.info(TAG, `Stream download paused: ${downloadId}`);
		} catch (error) {
			throw new PlayerError("DOWNLOAD_FAILED", {
				originalError: error,
				downloadId,
			});
		}
	}

	public async resumeDownload(downloadId: string): Promise<void> {
		const download = this.activeDownloads.get(downloadId);
		if (!download) {
			throw new PlayerError("DOWNLOAD_QUEUE_ITEM_NOT_FOUND", { downloadId });
		}

		if (download.state !== DownloadStates.PAUSED) {
			this.currentLogger.warn(TAG, `Stream download not paused: ${downloadId}`);
			return;
		}

		try {
			// Verificar conectividad
			if (!networkService.isOnline()) {
				throw new PlayerError("NETWORK_CONNECTION_001", { downloadId });
			}

			// Verificar WiFi si es requerido
			if (this.config.requiresWifi && !networkService.isWifiConnected()) {
				throw new PlayerError("NETWORK_DOWNLOADS_WIFI_RESTRICTED", { downloadId });
			}

			await nativeManager.resumeDownload(downloadId);
			this.currentLogger.info(TAG, `Stream download resumed: ${downloadId}`);
		} catch (error) {
			throw new PlayerError("DOWNLOAD_FAILED", {
				originalError: error,
				downloadId,
			});
		}
	}

	public async cancelDownload(downloadId: string): Promise<void> {
		const download = this.activeDownloads.get(downloadId);

		if (!download) {
			// Verificar si está en cola
			const queueIndex = this.downloadQueue.findIndex(task => task.id === downloadId);
			if (queueIndex >= 0) {
				this.downloadQueue.splice(queueIndex, 1);
				this.eventEmitter.emit(DownloadEventType.CANCELLED, { taskId: downloadId });
				return;
			}
			throw new PlayerError("DOWNLOAD_QUEUE_ITEM_NOT_FOUND", { downloadId });
		}

		try {
			await nativeManager.cancelDownload(downloadId);

			// Remover de descargas activas
			this.activeDownloads.delete(downloadId);

			this.eventEmitter.emit(DownloadEventType.CANCELLED, {
				taskId: downloadId,
				progress: download.progress,
			});

			this.currentLogger.info(TAG, `Stream download cancelled: ${downloadId}`);
		} catch (error) {
			throw new PlayerError("DOWNLOAD_FAILED", {
				originalError: error,
				downloadId,
			});
		}
	}

	/*
	 * Ejecuta la descarga de un stream usando NativeManager
	 *
	 */

	private async executeStreamDownload(task: StreamDownloadTask): Promise<void> {
		const activeDownload: ActiveStreamDownload = {
			task,
			startTime: Date.now(),
			retryCount: 0,
			state: DownloadStates.PREPARING,
			progress: {
				downloadId: task.id,
				percent: 0,
				bytesDownloaded: 0,
				totalBytes: 0,
			},
		};

		this.activeDownloads.set(task.id, activeDownload);

		try {
			// Configurar descarga nativa
			const nativeConfig = {
				id: task.id,
				uri: task.manifestUrl,
				title: task.title,
				quality: task.config.quality || this.config.defaultQuality,
				allowCellular: this.config.allowCellular,
				drm: task.config.drm,
				subtitles: task.config.subtitleLanguages?.map(lang => ({
					language: lang,
					uri: "", // Will be resolved by native module
					label: lang,
				})),
			};

			// Iniciar descarga nativa
			await nativeManager.addDownload(nativeConfig);

			// Actualizar estado
			activeDownload.state = DownloadStates.DOWNLOADING;
			this.activeDownloads.set(task.id, activeDownload);

			// Emitir evento de inicio
			this.eventEmitter.emit(DownloadEventType.STARTED, {
				taskId: task.id,
				manifestUrl: task.manifestUrl,
				title: task.title,
			});

			this.currentLogger.info(
				TAG,
				`Stream download started: ${task.id} - ${task.manifestUrl}`
			);
		} catch (error) {
			await this.handleStreamDownloadError(task.id, error);
		}
	}

	/*
	 * Maneja errores de descarga de streams
	 *
	 */

	private async handleStreamDownloadError(downloadId: string, error: any): Promise<void> {
		const download = this.activeDownloads.get(downloadId);
		if (!download) return;

		const downloadError: DownloadError = {
			code: this.mapErrorToCode(error),
			message: error.message || "Unknown stream download error",
			details: error,
			timestamp: Date.now(),
		};

		download.error = downloadError;
		download.retryCount++;

		// Intentar reintento si no se han agotado
		if (download.retryCount < this.config.maxRetries) {
			this.currentLogger.warn(
				TAG,
				`Stream download failed, retrying (${download.retryCount}/${this.config.maxRetries}): ${downloadId}`
			);

			// Reintento después de un delay exponencial
			const delay = Math.pow(2, download.retryCount) * 1500; // Más delay para streams
			setTimeout(() => {
				this.executeStreamDownload(download.task);
			}, delay);

			return;
		}

		// Marcar como fallido
		download.state = DownloadStates.FAILED;
		this.activeDownloads.set(downloadId, download);

		this.eventEmitter.emit(DownloadEventType.FAILED, {
			taskId: downloadId,
			error: downloadError,
		});

		this.currentLogger.error(TAG, `Stream download failed: ${downloadId}`, downloadError);

		// Procesar siguiente en cola
		this.processNextInQueue();
	}

	/*
	 * Valida una tarea de descarga de stream
	 *
	 */

	private validateStreamTask(task: StreamDownloadTask): ValidationResult {
		const errors: string[] = [];

		if (!task.id || task.id.trim().length === 0) {
			errors.push("Task ID is required");
		}

		if (!task.manifestUrl || !this.isValidManifestUrl(task.manifestUrl)) {
			errors.push("Valid manifest URL is required");
		}

		if (!task.title || task.title.trim().length === 0) {
			errors.push("Title is required");
		}

		if (!task.config) {
			errors.push("Stream configuration is required");
		}

		return {
			isValid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined,
		};
	}

	/*
	 * Verifica si una URL de manifest es válida
	 *
	 */

	private isValidManifestUrl(url: string): boolean {
		try {
			const parsed = new URL(url);
			const isHttps = parsed.protocol === "http:" || parsed.protocol === "https:";
			const isManifest = url.includes(".m3u8") || url.includes(".mpd");
			return isHttps && isManifest;
		} catch {
			return false;
		}
	}

	/*
	 * Mapea errores a códigos conocidos
	 *
	 */

	private mapErrorToCode(error: any): DownloadErrorCode {
		if (!error) return DownloadErrorCode.UNKNOWN;

		const message = error.message?.toLowerCase() || "";

		if (message.includes("network") || message.includes("connection")) {
			return DownloadErrorCode.NETWORK_ERROR;
		}

		if (message.includes("drm") || message.includes("license")) {
			return DownloadErrorCode.DRM_ERROR;
		}

		if (message.includes("space") || message.includes("disk")) {
			return DownloadErrorCode.INSUFFICIENT_SPACE;
		}

		if (message.includes("permission")) {
			return DownloadErrorCode.PERMISSION_DENIED;
		}

		if (message.includes("timeout")) {
			return DownloadErrorCode.TIMEOUT;
		}

		return DownloadErrorCode.UNKNOWN;
	}

	/*
	 * API Pública - Consultas y estadísticas
	 *
	 */

	public getDownloadState(downloadId: string): ActiveStreamDownload | null {
		const download = this.activeDownloads.get(downloadId);
		return download ? { ...download } : null;
	}

	public getAllActiveDownloads(): ActiveStreamDownload[] {
		return Array.from(this.activeDownloads.values()).map(d => ({ ...d }));
	}

	public getStats() {
		const downloads = Array.from(this.activeDownloads.values());

		return {
			activeDownloads: this.activeDownloads.size,
			queuedDownloads: this.downloadQueue.length,
			totalDownloaded: downloads.reduce((sum, d) => sum + d.progress.bytesDownloaded, 0),
			averageSpeed: this.calculateAverageSpeed(downloads),
			states: {
				downloading: downloads.filter(d => d.state === DownloadStates.DOWNLOADING).length,
				paused: downloads.filter(d => d.state === DownloadStates.PAUSED).length,
				failed: downloads.filter(d => d.state === DownloadStates.FAILED).length,
				completed: downloads.filter(d => d.state === DownloadStates.COMPLETED).length,
				preparing: downloads.filter(d => d.state === DownloadStates.PREPARING).length,
			},
		};
	}

	/*
	 * API Pública - Configuración
	 *
	 */

	public setStreamQuality(quality: "auto" | "low" | "medium" | "high" | "max"): void {
		this.config.defaultQuality = quality;

		// Propagar cambio al NativeManager para futuras descargas
		nativeManager.setStreamQuality(quality).catch(error => {
			this.currentLogger.warn(TAG, `Failed to update native stream quality: ${error}`);
		});

		this.currentLogger.info(TAG, `Stream quality updated to: ${quality}`);
	}

	public setNetworkPolicy(requiresWifi: boolean, allowCellular: boolean): void {
		this.config.requiresWifi = requiresWifi;
		this.config.allowCellular = allowCellular;

		// Propagar cambio al NativeManager
		nativeManager
			.setNetworkPolicy({
				allowCellular,
				requireWifi: requiresWifi,
			})
			.catch(error => {
				this.currentLogger.warn(TAG, `Failed to update native network policy: ${error}`);
			});

		this.currentLogger.info(
			TAG,
			`Network policy updated: WiFi required=${requiresWifi}, Cellular allowed=${allowCellular}`
		);
	}

	public setNotificationsEnabled(enabled: boolean): void {
		this.config.enableNotifications = enabled;
		this.currentLogger.info(TAG, `Notifications ${enabled ? "enabled" : "disabled"}`);
	}

	/*
	 * Sistema de eventos
	 *
	 */

	public subscribe(event: DownloadEventType | "all", callback: (data: any) => void): () => void {
		if (event === "all") {
			Object.values(DownloadEventType).forEach(eventType => {
				this.eventEmitter.on(eventType, callback);
			});

			return () => {
				Object.values(DownloadEventType).forEach(eventType => {
					this.eventEmitter.off(eventType, callback);
				});
			};
		} else {
			this.eventEmitter.on(event, callback);
			return () => this.eventEmitter.off(event, callback);
		}
	}

	/*
	 * Utilidades privadas
	 *
	 */

	private calculateAverageSpeed(downloads: ActiveStreamDownload[]): number {
		const activeDownloads = downloads.filter(d => d.state === DownloadStates.DOWNLOADING);
		if (activeDownloads.length === 0) return 0;

		const totalSpeed = activeDownloads.reduce((sum, download) => {
			const elapsedTime = (Date.now() - download.startTime) / 1000; // segundos
			const speed = elapsedTime > 0 ? download.progress.bytesDownloaded / elapsedTime : 0;
			return sum + speed;
		}, 0);

		return Math.round(totalSpeed / activeDownloads.length);
	}

	/*
	 * Limpieza de recursos
	 *
	 */

	public destroy(): void {
		this.isProcessingQueue = false;

		// Cancelar todas las descargas activas
		for (const downloadId of this.activeDownloads.keys()) {
			this.cancelDownload(downloadId).catch((error: any) => {
				this.currentLogger.error(
					TAG,
					`Failed to cancel download during destroy: ${downloadId}`,
					error
				);
			});
		}

		this.eventEmitter.removeAllListeners();
		this.activeDownloads.clear();
		this.downloadQueue.length = 0;
		this.isInitialized = false;

		this.currentLogger.info(TAG, "StreamDownloadService destroyed");
	}
}

// Exportar instancia singleton
export const streamDownloadService = StreamDownloadService.getInstance();
