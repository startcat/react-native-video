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
	DownloadEventCallback,
	DownloadEventType,
	DownloadStates,
	NativeDownloadConfig,
	NativeManagerEventData,
	NetworkStatus,
	StreamDownloadServiceConfig,
	StreamDownloadTask,
	SubtitleDownloadTask,
	ValidationResult,
} from "../../types";
import { networkService } from "../network/NetworkService";
import { subtitleDownloadService } from "./SubtitleDownloadService";

const TAG = LOG_TAGS.STREAM_DOWNLOADER;

export class StreamDownloadService {
	private static instance: StreamDownloadService;
	private eventEmitter: EventEmitter;
	private config: StreamDownloadServiceConfig;
	private currentLogger: Logger;
	private isInitialized: boolean = false;
	private initPromise: Promise<void> | null = null;
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

		// Si hay una inicialización en progreso, esperar a que termine
		if (this.initPromise) {
			return this.initPromise;
		}

		// Crear promesa que otras llamadas concurrentes pueden esperar
		this.initPromise = (async () => {
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

				// Verificar si el módulo nativo está disponible
				if (!nativeManager.isNativeModuleAvailable()) {
					console.warn(
						"[StreamDownloadService] Native module DownloadsModule2 not available. Stream downloads will not work."
					);
					throw new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE", {
						originalError: new Error("DownloadsModule2 native module not found"),
						message: "Stream downloads require native module support",
					});
				}

				// Inicializar el manager si no está inicializado
				try {
					await nativeManager.initialize();
				} catch (error) {
					console.error(
						"[StreamDownloadService] Failed to initialize NativeManager:",
						error
					);
					throw new PlayerError("DOWNLOAD_FAILED", {
						originalError: error,
						message: "Failed to initialize native download manager",
					});
				}

				// Suscribirse a eventos nativos
				this.setupNativeEventListeners();

				// Suscribirse a eventos de red
				networkService.subscribe("all", this.handleNetworkChange.bind(this));

				// Recuperar descargas pendientes
				await this.recoverPendingDownloads();

				this.isInitialized = true;
				this.currentLogger.info(
					TAG,
					"StreamDownloadService initialized with NativeManager"
				);

				// Iniciar procesamiento de cola
				this.startQueueProcessing();
			} catch (error) {
				throw new PlayerError("DOWNLOAD_BINARY_SERVICE_INITIALIZATION_FAILED", {
					originalError: error,
				});
			} finally {
				// Limpiar promesa pendiente
				this.initPromise = null;
			}
		})();

		return this.initPromise;
	}

	/*
	 * Configuración de event listeners nativos
	 *
	 */

	private setupNativeEventListeners(): void {
		// Suscribirse a eventos específicos del NativeManager
		nativeManager.subscribe("download_progress", data => {
			this.handleNativeEvent("download_progress", data);
		});

		nativeManager.subscribe("download_state_changed", data => {
			this.handleNativeEvent("download_state_changed", data);
		});

		nativeManager.subscribe("download_completed", data => {
			this.handleNativeEvent("download_completed", data);
		});

		nativeManager.subscribe("download_error", data => {
			this.handleNativeEvent("download_error", data);
		});

		this.currentLogger.debug(TAG, "Native event listeners configured");
	}

	/*
	 * Manejo de eventos nativos
	 *
	 */

	private handleNativeEvent(eventName: string, data: NativeManagerEventData): void {
		try {
			// Manejar eventos específicos que nos interesan
			switch (eventName) {
				case "download_progress":
					this.handleProgressEvent(data);
					break;
				case "download_state_changed":
					this.handleStateChangeEvent(data);
					break;
				case "download_completed":
					this.handleCompletedEvent(data);
					break;
				case "download_error":
					this.handleErrorEvent(data);
					break;
				default:
					// Reenviar otros eventos tal como están
					this.eventEmitter.emit(eventName, data);
			}
		} catch (error) {
			this.currentLogger.error(TAG, "Error handling native event", { eventName, error });
		}
	}

	private handleProgressEvent(data: unknown): void {
		const { downloadId, percent, bytesDownloaded, totalBytes, speed, remainingTime } = data as {
			downloadId: string;
			percent?: number;
			bytesDownloaded?: number;
			totalBytes?: number;
			speed?: number;
			remainingTime?: number;
		};

		if (this.activeDownloads.has(downloadId)) {
			const activeDownload = this.activeDownloads.get(downloadId)!;

			// Actualizar progreso interno
			activeDownload.progress = {
				downloadId,
				percent: percent || 0,
				bytesDownloaded: bytesDownloaded || 0,
				totalBytes: totalBytes || 0,
			};

			// Re-emitir evento con formato correcto para QueueManager
			this.eventEmitter.emit(DownloadEventType.PROGRESS, {
				taskId: downloadId,
				progress: percent || 0,
				bytesDownloaded: bytesDownloaded || 0,
				totalBytes: totalBytes || 0,
				speed: speed || 0,
				remainingTime: remainingTime || 0,
			});
		}
	}

	private handleStateChangeEvent(data: unknown): void {
		const eventData = data as { downloadId: string; state: string; error?: unknown };
		const { downloadId, state } = eventData;

		if (this.activeDownloads.has(downloadId)) {
			const activeDownload = this.activeDownloads.get(downloadId)!;
			const mappedState = this.mapNativeStateToInternal(state);
			activeDownload.state = mappedState;

			// Emitir eventos específicos según el estado
			switch (mappedState) {
				case DownloadStates.COMPLETED:
					this.eventEmitter.emit(DownloadEventType.COMPLETED, {
						taskId: downloadId,
						progress: activeDownload.progress.percent,
					});
					break;
				case DownloadStates.FAILED:
					this.eventEmitter.emit(DownloadEventType.FAILED, {
						taskId: downloadId,
						error: eventData.error || "Download failed",
					});
					break;
				case DownloadStates.PAUSED:
					this.eventEmitter.emit(DownloadEventType.PAUSED, {
						taskId: downloadId,
						progress: activeDownload.progress.percent,
					});
					break;
			}
		}
	}

	private async handleCompletedEvent(data: unknown): Promise<void> {
		const eventData = data as { downloadId: string; fileUri?: string; localPath?: string };
		const { downloadId } = eventData;

		if (this.activeDownloads.has(downloadId)) {
			const activeDownload = this.activeDownloads.get(downloadId);

			// Descargar subtítulos si existen
			if (activeDownload?.task.subtitles && activeDownload.task.subtitles.length > 0) {
				this.currentLogger.info(
					TAG,
					`Starting subtitle downloads for ${downloadId} (${activeDownload.task.subtitles.length} subtitles)`
				);

				try {
					// Convertir a formato de SubtitleDownloadTask
					const subtitleTasks: SubtitleDownloadTask[] = activeDownload.task.subtitles.map(
						sub => ({
							id: sub.id,
							downloadId: downloadId,
							uri: sub.uri,
							language: sub.language,
							label: sub.label,
							format: sub.format,
							isDefault: sub.isDefault,
							encoding: sub.encoding,
						})
					);

					// Descargar subtítulos (en paralelo, sin cola)
					await subtitleDownloadService.downloadSubtitles(downloadId, subtitleTasks);

					this.currentLogger.info(
						TAG,
						`Subtitles downloaded successfully for ${downloadId}`
					);
				} catch (error) {
					this.currentLogger.error(
						TAG,
						`Failed to download subtitles for ${downloadId}`,
						error
					);
				} finally {
					this.eventEmitter.emit(DownloadEventType.COMPLETED, {
						taskId: downloadId,
						fileUri: eventData.fileUri || eventData.localPath,
					});

					// Remover de descargas activas cuando se complete
					this.activeDownloads.delete(downloadId);
				}
			} else {
				this.eventEmitter.emit(DownloadEventType.COMPLETED, {
					taskId: downloadId,
					fileUri: eventData.fileUri || eventData.localPath,
				});

				// Remover de descargas activas cuando se complete
				this.activeDownloads.delete(downloadId);
			}
		}
	}

	private handleErrorEvent(data: unknown): void {
		const { downloadId, error } = data as {
			downloadId: string;
			error?: { message?: string };
		};

		if (this.activeDownloads.has(downloadId)) {
			this.eventEmitter.emit(DownloadEventType.FAILED, {
				taskId: downloadId,
				error: error?.message || "Native download error",
			});
		}
	}

	private mapNativeStateToInternal(nativeState: string): DownloadStates {
		switch (nativeState?.toUpperCase()) {
			case "DOWNLOADING":
			case "ACTIVE":
				return DownloadStates.DOWNLOADING;
			case "QUEUED":
			case "PENDING":
				return DownloadStates.QUEUED;
			case "PAUSED":
				return DownloadStates.PAUSED;
			case "COMPLETED":
				return DownloadStates.COMPLETED;
			case "FAILED":
			case "ERROR":
				return DownloadStates.FAILED;
			default:
				return DownloadStates.QUEUED;
		}
	}

	/*
	 * Recupera descargas pendientes del sistema nativo
	 *
	 */

	private async recoverPendingDownloads(): Promise<void> {
		try {
			console.log("[StreamDownloadService] Attempting to recover pending downloads...");
			const downloads = await nativeManager.getDownloads();

			console.log("[StreamDownloadService] getDownloads() returned:", downloads);
			console.log("[StreamDownloadService] getDownloads() type:", typeof downloads);
			console.log(
				"[StreamDownloadService] getDownloads() is array:",
				Array.isArray(downloads)
			);

			// Validar que downloads es un array válido
			if (!downloads || !Array.isArray(downloads)) {
				console.warn(
					"[StreamDownloadService] Invalid downloads response, skipping recovery"
				);
				return;
			}

			for (const download of downloads) {
				if (download && download.type === "STREAM") {
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

	private handleNetworkChange(networkStatus: NetworkStatus): void {
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
		if (this.isProcessingQueue) {
			return;
		}

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

		// Si no está en activeDownloads, verificar si está en cola
		if (!download) {
			const queueIndex = this.downloadQueue.findIndex(task => task.id === downloadId);
			if (queueIndex >= 0) {
				this.downloadQueue.splice(queueIndex, 1);
				this.eventEmitter.emit(DownloadEventType.CANCELLED, { taskId: downloadId });
				this.currentLogger.info(TAG, `Stream download removed from queue: ${downloadId}`);
				return;
			}

			// Si no está ni en activeDownloads ni en queue, intentar cancelar en nativo de todos modos
			// Esto puede ocurrir cuando el QueueManager gestiona la descarga
			this.currentLogger.warn(
				TAG,
				`Download ${downloadId} not found in service, attempting native cancellation`
			);
		}

		try {
			// Intentar cancelar en módulo nativo (puede fallar si no existe, pero es OK)
			await nativeManager.cancelDownload(downloadId);

			// Remover de descargas activas si existe
			if (download) {
				this.activeDownloads.delete(downloadId);
			}

			this.eventEmitter.emit(DownloadEventType.CANCELLED, {
				taskId: downloadId,
				progress: download?.progress || { percent: 0, bytesWritten: 0, totalBytes: 0 },
			});

			this.currentLogger.info(TAG, `Stream download cancelled: ${downloadId}`);
		} catch (error) {
			// Si el error es que no existe en nativo, es OK (ya fue cancelada o no existe)
			const errorMessage = error instanceof Error ? error.message : String(error);
			if (errorMessage.includes("not found") || errorMessage.includes("doesn't exist")) {
				this.currentLogger.warn(
					TAG,
					`Download ${downloadId} not found in native, considering it cancelled`
				);
				this.eventEmitter.emit(DownloadEventType.CANCELLED, { taskId: downloadId });
				return;
			}

			// Para otros errores, propagar
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
		// Preservar retryCount existente si hay un download previo
		const existingDownload = this.activeDownloads.get(task.id);
		const currentRetryCount = existingDownload ? existingDownload.retryCount : 0;

		const activeDownload: ActiveStreamDownload = {
			task,
			startTime: Date.now(),
			retryCount: currentRetryCount, // Preservar contador existente
			state: DownloadStates.PREPARING,
			progress: {
				downloadId: task.id,
				percent: 0,
				bytesDownloaded: 0,
				totalBytes: 0,
			},
		};

		console.log(
			`[StreamDownloadService] ExecuteStreamDownload - Preserving retryCount: ${currentRetryCount} for ${task.id}`
		);
		this.activeDownloads.set(task.id, activeDownload);

		try {
			// Normalizar quality: si no está definido o es "auto", usar defaultQuality del servicio
			let effectiveQuality = task.config.quality;
			if (!effectiveQuality || effectiveQuality === "auto") {
				effectiveQuality = this.config.defaultQuality;
				console.log(
					`[StreamDownloadService] Quality normalized from "${task.config.quality}" to "${effectiveQuality}" (using service default)`
				);

				// Actualizar el task para que refleje la calidad efectiva
				task.config.quality = effectiveQuality;
			}

			// Configurar descarga nativa
			const nativeConfig: NativeDownloadConfig & { headers?: Record<string, string> } = {
				id: task.id,
				uri: task.manifestUrl,
				title: task.title,
				quality: effectiveQuality,
				allowCellular: this.config.allowCellular,
				subtitles: task.subtitles
					? task.subtitles.map(subtitle => ({
							id: subtitle.id,
							uri: subtitle.uri,
							language: subtitle.language,
							label: subtitle.label,
							format: subtitle.format,
							isDefault: subtitle.isDefault,
							encoding: subtitle.encoding,
						}))
					: [],
			};

			// Agregar headers HTTP si están disponibles (necesario para autenticación)
			if (task.headers && Object.keys(task.headers).length > 0) {
				nativeConfig.headers = task.headers;
				this.currentLogger.debug(
					TAG,
					`Adding HTTP headers for ${task.id}:`,
					Object.keys(task.headers)
				);
			}

			// Solo agregar DRM si existe configuración
			if (task.config.drm) {
				nativeConfig.drm = task.config.drm;
			}

			console.log(
				`[StreamDownloadService] Creating native config for ${task.id}:`,
				JSON.stringify(nativeConfig, null, 2)
			);
			console.log(
				"[StreamDownloadService] Task config details:",
				JSON.stringify(task.config, null, 2)
			);

			// Pequeño delay para evitar problemas de concurrencia
			await new Promise(resolve => setTimeout(resolve, 100));

			// Iniciar descarga nativa
			console.log(
				`[StreamDownloadService] About to call nativeManager.addDownload for ${task.id}`
			);
			await nativeManager.addDownload(nativeConfig);
			console.log(
				`[StreamDownloadService] nativeManager.addDownload completed for ${task.id}`
			);

			// Actualizar estado
			activeDownload.state = DownloadStates.DOWNLOADING;
			this.activeDownloads.set(task.id, activeDownload);

			// Los eventos nativos se manejan automáticamente vía setupNativeEventListeners

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

	private async handleStreamDownloadError(downloadId: string, error: unknown): Promise<void> {
		const download = this.activeDownloads.get(downloadId);
		if (!download) {
			return;
		}

		const errorMessage =
			(error as { message?: string })?.message || "Unknown stream download error";

		const downloadError: DownloadError = {
			code: this.mapErrorToCode(error),
			message: errorMessage,
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
		// Usar regex para evitar bug de React Native con new URL()
		const isHttps = /^https?:\/\//.test(url.trim());
		const isManifest = url.includes(".m3u8") || url.includes(".mpd");

		console.log(`[StreamDownloadService] Validating manifest URL: ${url}`);
		console.log(`[StreamDownloadService] isHttps: ${isHttps}, isManifest: ${isManifest}`);

		return isHttps && isManifest;
	}

	/*
	 * Mapea errores a códigos conocidos
	 *
	 */

	private mapErrorToCode(error: unknown): DownloadErrorCode {
		if (!error) {
			return DownloadErrorCode.UNKNOWN;
		}

		const message = ((error as { message?: string })?.message || "").toLowerCase();

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

	public subscribe(
		event: DownloadEventType | "all",
		callback: DownloadEventCallback
	): () => void {
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
		if (activeDownloads.length === 0) {
			return 0;
		}

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
			this.cancelDownload(downloadId).catch((error: unknown) => {
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
