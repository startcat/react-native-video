/*
 * Servicio singleton para gestión de descargas binarias
 * Usa react-native-background-downloader para descargas en background
 * Integra con StorageService y NetworkService
 *
 */

import RNBackgroundDownloader from "@kesha-antonov/react-native-background-downloader";
import { EventEmitter } from "eventemitter3";
import { PlayerError } from "../../../../core/errors";
import { Logger } from "../../../logger";
import { LOG_TAGS } from "../../constants";
import { DEFAULT_CONFIG_BINARY_DOWNLOAD, LOGGER_DEFAULTS } from "../../defaultConfigs";
import {
	ActiveBinaryDownload,
	BinaryDownloadProgress,
	BinaryDownloadServiceConfig,
	BinaryDownloadTask,
	DownloadError,
	DownloadErrorCode,
	DownloadEventType,
	DownloadStates,
	ValidationResult,
} from "../../types";
import { formatFileSize } from "../../utils/formatters";
import { networkService } from "../network/NetworkService";
import { storageService } from "../storage/StorageService";

const TAG = LOG_TAGS.BINARY_DOWNLOADER;

export class BinaryDownloadService {
	private static instance: BinaryDownloadService;
	private eventEmitter: EventEmitter;
	private config: BinaryDownloadServiceConfig;
	private currentLogger: Logger;
	private isInitialized: boolean = false;
	private initPromise: Promise<void> | null = null;
	private activeDownloads: Map<string, ActiveBinaryDownload> = new Map();
	private downloadQueue: BinaryDownloadTask[] = [];
	private isProcessingQueue: boolean = false;
	// Tracking para cálculo de velocidad y tiempo estimado
	private lastProgressUpdate: Map<string, { bytes: number; timestamp: number }> = new Map();

	private constructor() {
		this.eventEmitter = new EventEmitter();

		this.config = DEFAULT_CONFIG_BINARY_DOWNLOAD;

		this.currentLogger = new Logger({
			...LOGGER_DEFAULTS,
			enabled: this.config.logEnabled,
			level: this.config.logLevel,
		});
	}

	/*
	 * Obtiene la instancia singleton del servicio
	 *
	 */

	public static getInstance(): BinaryDownloadService {
		if (!BinaryDownloadService.instance) {
			BinaryDownloadService.instance = new BinaryDownloadService();
		}
		return BinaryDownloadService.instance;
	}

	/*
	 * Inicializa el servicio
	 *
	 */

	public async initialize(config?: Partial<BinaryDownloadServiceConfig>): Promise<void> {
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
				if (!storageService) {
					throw new PlayerError("DOWNLOAD_BINARY_SERVICE_INITIALIZATION_FAILED", {
						originalError: new Error("StorageService is required"),
					});
				}

				if (!networkService) {
					throw new PlayerError("DOWNLOAD_BINARY_SERVICE_INITIALIZATION_FAILED", {
						originalError: new Error("NetworkService is required"),
					});
				}

				// Configurar RNBackgroundDownloader
				await this.configureBackgroundDownloader();

				// Suscribirse a eventos de red
				networkService.subscribe("all", this.handleNetworkChange.bind(this));

				// Recuperar descargas pendientes del background downloader
				await this.recoverPendingDownloads();

				this.isInitialized = true;
				this.currentLogger.info(
					TAG,
					"BinaryDownloadService initialized with background downloader"
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
	 * Configura RNBackgroundDownloader
	 *
	 */

	private async configureBackgroundDownloader(): Promise<void> {
		try {
			// Configurar opciones globales según la API de la librería
			RNBackgroundDownloader.setConfig({
				progressInterval: this.config.progressUpdateInterval,
				isLogsEnabled: this.config.logEnabled,
			});

			this.currentLogger.info(TAG, "Background downloader configured");
		} catch (error) {
			throw new PlayerError("DOWNLOAD_BINARY_SERVICE_INITIALIZATION_FAILED", {
				originalError: error,
			});
		}
	}

	/*
	 * Recupera descargas pendientes al inicializar
	 *
	 */

	private async recoverPendingDownloads(): Promise<void> {
		try {
			const tasks = await RNBackgroundDownloader.checkForExistingDownloads();

			for (const task of tasks) {
				this.currentLogger.info(TAG, `Recovered download: ${task.id}`);

				// Crear ActiveDownload para las tareas recuperadas
				const activeDownload: ActiveBinaryDownload = {
					task: {
						id: task.id,
						url: "", // No disponible en recovered tasks
						destination: "", // No disponible en recovered tasks
					},
					downloadTask: task,
					startTime: Date.now(), // No conocemos el tiempo real
					retryCount: 0,
					state: DownloadStates.DOWNLOADING, // Asumimos que está descargando
					progress: {
						taskId: task.id,
						bytesWritten: task.bytesDownloaded || 0,
						totalBytes: task.bytesTotal || 0,
						percent:
							task.bytesTotal > 0
								? Math.round((task.bytesDownloaded / task.bytesTotal) * 100)
								: 0,
					},
				};

				this.activeDownloads.set(task.id, activeDownload);

				this.setupTaskCallbacks(task, activeDownload);
			}

			this.currentLogger.info(
				TAG,
				"Recovered 0 pending downloads (binary downloads temporarily disabled)"
			);
		} catch (error) {
			this.currentLogger.warn(TAG, `Failed to recover pending downloads: ${error}`);
		}
	}

	/*
	 * Inicia la descarga de un archivo binario
	 *
	 */

	public async startDownload(task: BinaryDownloadTask): Promise<void> {
		if (!this.isInitialized) {
			throw new PlayerError("DOWNLOAD_BINARY_SERVICE_NOT_INITIALIZED");
		}

		// Validar tarea
		const validation = this.validateDownloadTask(task);
		if (!validation.isValid) {
			throw new PlayerError("DOWNLOAD_BINARY_TASK_INVALID", {
				errors: validation.errors,
				task: task.id,
			});
		}

		try {
			// Verificar si ya está descargando
			const existingDownload = this.activeDownloads.get(task.id);
			if (existingDownload) {
				// Si está pausada, reanudarla
				if (existingDownload.state === DownloadStates.PAUSED) {
					this.currentLogger.info(
						TAG,
						`Download exists in PAUSED state, resuming: ${task.id}`
					);
					return this.resumeDownload(task.id);
				}
				// Si ya está descargando o en otro estado, ignorar
				this.currentLogger.warn(
					TAG,
					`Download already active in state ${existingDownload.state}: ${task.id}`
				);
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

			// Verificar espacio disponible
			const hasSpace = await storageService.hasEnoughSpace(100 * 1024 * 1024); // 100MB mínimo
			if (!hasSpace) {
				throw new PlayerError("DOWNLOAD_NO_SPACE", { taskId: task.id });
			}

			// Si hay demasiadas descargas activas, agregar a cola
			if (this.activeDownloads.size >= this.config.maxConcurrentDownloads) {
				this.downloadQueue.push(task);
				this.currentLogger.info(TAG, `Download queued: ${task.id}`);

				this.eventEmitter.emit(DownloadEventType.QUEUED, {
					taskId: task.id,
					queuePosition: this.downloadQueue.length,
				});
				return;
			}

			// Iniciar descarga inmediatamente
			await this.executeDownload(task);
		} catch (error) {
			throw new PlayerError("DOWNLOAD_BINARY_START_FAILED", {
				originalError: error,
				taskId: task.id,
			});
		}
	}

	/*
	 * Pausa una descarga activa
	 *
	 */

	public async pauseDownload(taskId: string): Promise<void> {
		const download = this.activeDownloads.get(taskId);
		if (!download || !download.downloadTask) {
			throw new PlayerError("DOWNLOAD_BINARY_NOT_FOUND", { taskId });
		}

		if (download.state !== DownloadStates.DOWNLOADING) {
			this.currentLogger.warn(TAG, `Download not in downloading state: ${taskId}`);
			return;
		}

		try {
			// NOTA: react-native-background-downloader NO soporta pause() en Android
			// pause() solo funciona en iOS. En Android, debemos usar stop() para detener completamente
			// y reiniciar la descarga desde cero al reanudar (no hay resume parcial)
			download.downloadTask.stop(); // stop() detiene completamente la descarga

			// Actualizar estado manualmente ya que stop() no dispara callbacks
			download.state = DownloadStates.PAUSED;
			this.activeDownloads.set(taskId, download);

			this.eventEmitter.emit(DownloadEventType.PAUSED, { taskId });
			this.currentLogger.info(TAG, `Download stopped (paused): ${taskId}`);
		} catch (error) {
			throw new PlayerError("DOWNLOAD_BINARY_PAUSE_FAILED", {
				originalError: error,
				taskId,
			});
		}
	}

	/*
	 * Reanuda una descarga pausada
	 *
	 */

	public async resumeDownload(taskId: string): Promise<void> {
		const download = this.activeDownloads.get(taskId);
		if (!download) {
			throw new PlayerError("DOWNLOAD_BINARY_NOT_FOUND", { taskId });
		}

		if (download.state !== DownloadStates.PAUSED) {
			this.currentLogger.warn(TAG, `Download not paused: ${taskId}`);
			return;
		}

		try {
			// Verificar conectividad
			if (!networkService.isOnline()) {
				throw new PlayerError("NETWORK_CONNECTION_001", { taskId });
			}

			// Verificar WiFi si es requerido
			if (this.config.requiresWifi && !networkService.isWifiConnected()) {
				throw new PlayerError("NETWORK_DOWNLOADS_WIFI_RESTRICTED", { taskId });
			}

			// IMPORTANTE: Como usamos stop() en pauseDownload(), debemos reiniciar la descarga desde cero
			// La librería react-native-background-downloader NO soporta resume parcial en Android
			this.currentLogger.info(
				TAG,
				`Restarting download from beginning (no partial resume support): ${taskId}`
			);

			// Emitir evento RESUMED inmediatamente para que QueueManager sepa que está activa
			this.eventEmitter.emit(DownloadEventType.RESUMED, { taskId });

			// CRÍTICO: Limpiar la tarea pausada anterior de RNBackgroundDownloader
			// Si no lo hacemos, la librería puede seguir reportando progreso de la tarea vieja
			if (download.downloadTask) {
				try {
					download.downloadTask.stop();
					this.currentLogger.debug(TAG, `Stopped old download task: ${taskId}`);
				} catch (stopError) {
					this.currentLogger.warn(TAG, `Failed to stop old task: ${stopError}`);
				}
			}

			// Reiniciar descarga con el MISMO ID (sin cambiar el ID)
			// La recreación completa (eliminar + crear nueva) se maneja en DownloadsManager
			this.currentLogger.debug(TAG, `Restarting download with same ID: ${taskId}`);

			// Reiniciar la descarga desde cero manteniendo el mismo ID
			await this.executeDownload(download.task);
		} catch (error) {
			throw new PlayerError("DOWNLOAD_BINARY_RESUME_FAILED", {
				originalError: error,
				taskId,
			});
		}
	}

	/*
	 * Cancela una descarga
	 *
	 */

	public async cancelDownload(taskId: string): Promise<void> {
		const download = this.activeDownloads.get(taskId);

		// Si no está en activeDownloads, verificar si está en cola interna
		if (!download) {
			const queueIndex = this.downloadQueue.findIndex(task => task.id === taskId);
			if (queueIndex >= 0) {
				this.downloadQueue.splice(queueIndex, 1);
				this.eventEmitter.emit(DownloadEventType.CANCELLED, { taskId });
				this.currentLogger.info(TAG, `Binary download removed from queue: ${taskId}`);
				return;
			}

			// Si no está en ningún lado, es válido cuando QueueManager gestiona la descarga
			// Emitir evento de cancelación de todos modos para mantener consistencia
			this.currentLogger.warn(
				TAG,
				`Download ${taskId} not found in service, considering it cancelled`
			);
			this.eventEmitter.emit(DownloadEventType.CANCELLED, { taskId });
			return;
		}

		try {
			// Cancelar usando background downloader
			if (download.downloadTask) {
				download.downloadTask.stop(); // stop() es síncrono, no devuelve Promise
			}

			// Eliminar archivo físico del disco
			const deleted = await storageService.deleteFile(download.task.destination);
			if (deleted) {
				this.currentLogger.info(TAG, `Deleted binary file: ${download.task.destination}`);
			}

			// Remover de descargas activas
			this.activeDownloads.delete(taskId);

			this.eventEmitter.emit(DownloadEventType.CANCELLED, {
				taskId,
				progress: download.progress,
			});

			// Desregistrar de StorageService
			storageService.unregisterActiveDownload(taskId);

			this.currentLogger.info(TAG, `Binary download cancelled: ${taskId}`);
		} catch (error) {
			// Si falla al cancelar, emitir evento de todos modos
			this.currentLogger.warn(
				TAG,
				`Error cancelling binary download ${taskId}, emitting event anyway`,
				error
			);
			this.eventEmitter.emit(DownloadEventType.CANCELLED, { taskId });
		}
	}

	/*
	 * Obtiene el estado de una descarga
	 *
	 */

	public getDownloadState(taskId: string): ActiveBinaryDownload | null {
		const download = this.activeDownloads.get(taskId);
		return download ? { ...download } : null;
	}

	/*
	 * Obtiene todas las descargas activas
	 *
	 */

	public getAllActiveDownloads(): ActiveBinaryDownload[] {
		return Array.from(this.activeDownloads.values()).map(d => ({ ...d }));
	}

	/*
	 * Obtiene estadísticas del servicio
	 *
	 */

	public getStats() {
		const downloads = Array.from(this.activeDownloads.values());

		return {
			activeDownloads: this.activeDownloads.size,
			queuedDownloads: this.downloadQueue.length,
			totalDownloaded: downloads.reduce((sum, d) => sum + d.progress.bytesWritten, 0),
			averageSpeed: this.calculateAverageSpeed(downloads),
			states: {
				downloading: downloads.filter(d => d.state === DownloadStates.DOWNLOADING).length,
				paused: downloads.filter(d => d.state === DownloadStates.PAUSED).length,
				failed: downloads.filter(d => d.state === DownloadStates.FAILED).length,
				completed: downloads.filter(d => d.state === DownloadStates.COMPLETED).length,
			},
		};
	}

	/*
	 * Ejecuta la descarga de un archivo usando background downloader
	 *
	 */

	private async executeDownload(task: BinaryDownloadTask): Promise<void> {
		// Preservar retryCount si ya existe una descarga activa
		const existingDownload = this.activeDownloads.get(task.id);
		const retryCount = existingDownload?.retryCount || 0;

		const activeDownload: ActiveBinaryDownload = {
			task,
			startTime: Date.now(),
			retryCount,
			state: DownloadStates.DOWNLOADING,
			progress: {
				taskId: task.id,
				bytesWritten: 0,
				totalBytes: 0,
				percent: 0,
			},
		};

		this.activeDownloads.set(task.id, activeDownload);

		try {
			// Limpiar archivo parcial/corrupto antes de iniciar/reiniciar descarga
			// Esto incluye: retries por error, o reanudaciones después de pause/stop
			if (retryCount > 0 || existingDownload?.state === DownloadStates.PAUSED) {
				this.currentLogger.debug(
					TAG,
					`Cleaning up partial/corrupted file before download: ${task.destination}`
				);
				try {
					// Intentar eliminar archivo (deleteFile ya verifica existencia internamente)
					await storageService.deleteFile(task.destination);
				} catch (cleanupError) {
					// Si falla (ej: archivo no existe), continuar de todas formas
					this.currentLogger.debug(
						TAG,
						`File cleanup skipped (may not exist): ${cleanupError}`
					);
				}
			}

			// Crear directorio de destino si no existe (idempotente)
			const destinationDir = task.destination.substring(0, task.destination.lastIndexOf("/"));
			try {
				await storageService.createDirectory(destinationDir);
			} catch (dirError: any) {
				// Si el error es que el directorio ya existe, continuar
				// De lo contrario, lanzar el error
				if (
					!dirError.message?.includes("already exists") &&
					!dirError.message?.includes("could not be created")
				) {
					throw dirError;
				}
				// Directorio ya existe o no se pudo crear por razón válida, continuar
				this.currentLogger.debug(
					TAG,
					`Directory creation skipped (may already exist): ${destinationDir}`
				);
			}

			// Configurar opciones de descarga según la API de la librería
			const downloadOptions = {
				id: task.id,
				url: task.url,
				destination: task.destination,
				headers: task.headers || {},
				// Título para la notificación (Android/iOS)
				notificationTitle: task.title || task.id,
				// Android specific options
				isAllowedOverRoaming: this.config.allowCellular,
				isAllowedOverMetered: this.config.allowCellular,
				isNotificationVisible: this.config.showNotifications,
			};

			this.currentLogger.info(
				TAG,
				`Creating download task with RNBackgroundDownloader: ${task.id}`,
				{ url: task.url, destination: task.destination }
			);

			// Crear tarea de descarga usando la API correcta
			const downloadTask = RNBackgroundDownloader.download(downloadOptions)
				.begin(({ expectedBytes }: { expectedBytes: number }) => {
					// Callback de inicio
					activeDownload.progress.totalBytes = expectedBytes || 0;
					activeDownload.state = DownloadStates.DOWNLOADING;
					this.activeDownloads.set(task.id, activeDownload);

					this.eventEmitter.emit(DownloadEventType.STARTED, {
						taskId: task.id,
						url: task.url,
						destination: task.destination,
						expectedBytes,
					});

					this.currentLogger.info(
						TAG,
						`Download started: ${task.id} - ${task.url} (${expectedBytes} bytes)`
					);
				})
				.progress(
					({
						bytesDownloaded,
						bytesTotal,
					}: {
						bytesDownloaded: number;
						bytesTotal: number;
					}) => {
						// Callback de progreso
						// Calcular velocidad y tiempo estimado
						const now = Date.now();
						const lastUpdate = this.lastProgressUpdate.get(task.id);
						let downloadSpeed = 0;
						let estimatedTimeRemaining = 0;

						if (lastUpdate) {
							const timeDiff = (now - lastUpdate.timestamp) / 1000; // segundos
							const bytesDiff = bytesDownloaded - lastUpdate.bytes;
							if (timeDiff > 0) {
								downloadSpeed = bytesDiff / timeDiff; // bytes/segundo
								const remainingBytes = bytesTotal - bytesDownloaded;
								estimatedTimeRemaining =
									downloadSpeed > 0
										? Math.round(remainingBytes / downloadSpeed)
										: 0;
							}
						}

						// Actualizar tracking
						this.lastProgressUpdate.set(task.id, {
							bytes: bytesDownloaded,
							timestamp: now,
						});

						const progress: BinaryDownloadProgress = {
							taskId: task.id,
							bytesWritten: bytesDownloaded,
							totalBytes: bytesTotal,
							percent:
								bytesTotal > 0
									? Math.round((bytesDownloaded / bytesTotal) * 100)
									: 0,
							downloadSpeed, // bytes/segundo
							estimatedTimeRemaining, // segundos
						};

						activeDownload.progress = progress;
						this.activeDownloads.set(task.id, activeDownload);

						// Registrar en StorageService para incluir en cálculo de espacio
						storageService.registerActiveDownload(task.id, bytesDownloaded, bytesTotal);

						this.eventEmitter.emit(DownloadEventType.PROGRESS, progress);
						this.currentLogger.debug(
							TAG,
							`Download progress: ${task.id} - ${progress.percent}%`
						);
					}
				)
				.done(() => {
					this.handleDownloadSuccess(task.id);
				})
				.error(({ error, errorCode }: { error: string; errorCode: number }) => {
					this.handleDownloadError(task.id, { message: error, code: errorCode });
				});

			// Guardar referencia a la tarea
			activeDownload.downloadTask = downloadTask;
			this.activeDownloads.set(task.id, activeDownload);
		} catch (error) {
			await this.handleDownloadError(task.id, error);
		}
	}

	/*
	 * Configura callbacks para tareas recuperadas del background
	 *
	 */

	private setupTaskCallbacks(downloadTask: any, activeDownload: ActiveBinaryDownload): void {
		const taskId = activeDownload.task.id;

		// Para tareas recuperadas, configuramos los callbacks necesarios
		downloadTask
			.progress(
				({
					bytesDownloaded,
					bytesTotal,
				}: {
					bytesDownloaded: number;
					bytesTotal: number;
				}) => {
					// Calcular velocidad y tiempo estimado
					const now = Date.now();
					const lastUpdate = this.lastProgressUpdate.get(taskId);
					let downloadSpeed = 0;
					let estimatedTimeRemaining = 0;

					if (lastUpdate) {
						const timeDiff = (now - lastUpdate.timestamp) / 1000; // segundos
						const bytesDiff = bytesDownloaded - lastUpdate.bytes;
						if (timeDiff > 0) {
							downloadSpeed = bytesDiff / timeDiff; // bytes/segundo
							const remainingBytes = bytesTotal - bytesDownloaded;
							estimatedTimeRemaining =
								downloadSpeed > 0 ? Math.round(remainingBytes / downloadSpeed) : 0;
						}
					}

					// Actualizar tracking
					this.lastProgressUpdate.set(taskId, {
						bytes: bytesDownloaded,
						timestamp: now,
					});

					const progress: BinaryDownloadProgress = {
						taskId: taskId,
						bytesWritten: bytesDownloaded,
						totalBytes: bytesTotal,
						percent:
							bytesTotal > 0 ? Math.round((bytesDownloaded / bytesTotal) * 100) : 0,
						downloadSpeed, // bytes/segundo
						estimatedTimeRemaining, // segundos
					};

					activeDownload.progress = progress;
					this.activeDownloads.set(taskId, activeDownload);

					// Registrar en StorageService para incluir en cálculo de espacio
					storageService.registerActiveDownload(taskId, bytesDownloaded, bytesTotal);

					this.eventEmitter.emit(DownloadEventType.PROGRESS, progress);
					this.currentLogger.debug(
						TAG,
						`Recovery progress: ${taskId} - ${progress.percent}%`
					);
				}
			)
			.done(() => {
				this.handleDownloadSuccess(taskId);
			})
			.error(({ error, errorCode }: { error: string; errorCode: number }) => {
				this.handleDownloadError(taskId, { message: error, code: errorCode });
			});
	}

	/*
	 * Maneja descarga exitosa
	 *
	 */

	private async handleDownloadSuccess(taskId: string): Promise<void> {
		const download = this.activeDownloads.get(taskId);
		if (!download) {
			return;
		}

		try {
			// Esperar un momento para asegurar que el archivo esté completamente escrito
			// La librería react-native-background-downloader puede disparar .done() antes
			// de que el filesystem haya sincronizado completamente el archivo
			await new Promise(resolve => setTimeout(resolve, 500));

			// Log detallado del estado del archivo antes de validar
			this.currentLogger.debug(
				TAG,
				`Validating downloaded file: ${download.task.destination}`,
				{
					taskId,
					expectedSize: download.progress.totalBytes,
					downloadedSize: download.progress.bytesWritten,
				}
			);

			// Validar archivo descargado
			// skipReadTest: true porque en Android RNFS.read() falla con archivos de react-native-background-downloader
			// debido a permisos, incluso si el archivo es válido
			const validation = await storageService.validateFile(
				download.task.destination,
				undefined,
				true // skipReadTest
			);

			if (!validation.isValid) {
				// Log detallado del error de validación
				this.currentLogger.error(TAG, `Download validation failed: ${taskId}`, {
					filePath: download.task.destination,
					expectedSize: download.progress.totalBytes,
					downloadedSize: download.progress.bytesWritten,
					validationErrors: validation.errors,
					validationWarnings: validation.warnings,
				});
				throw new PlayerError("DOWNLOAD_CORRUPTED", {
					taskId,
					filePath: download.task.destination,
					validationErrors: validation.errors,
				});
			}

			// Log warnings si existen (ej: size mismatch)
			if (validation.warnings && validation.warnings.length > 0) {
				this.currentLogger.warn(
					TAG,
					`Download validation warnings: ${taskId}`,
					validation.warnings
				);
			}

			// Actualizar estado
			download.state = DownloadStates.COMPLETED;
			download.progress.percent = 100;

			// Log de éxito con detalles
			this.currentLogger.info(
				TAG,
				`Download completed successfully: ${taskId} - ${formatFileSize(download.progress.totalBytes)}`,
				{
					filePath: download.task.destination,
					duration: Date.now() - download.startTime,
				}
			);

			// Emitir evento de completado
			this.eventEmitter.emit(DownloadEventType.COMPLETED, {
				taskId,
				filePath: download.task.destination,
				fileSize: download.progress.totalBytes,
				duration: Date.now() - download.startTime,
			});

			// Desregistrar de StorageService
			storageService.unregisterActiveDownload(taskId);

			// Remover de descargas activas después de un breve delay
			setTimeout(() => {
				this.activeDownloads.delete(taskId);

				this.currentLogger.debug(TAG, `Removed from active downloads: ${taskId}`);
				this.processNextInQueue();
			}, 1000);
		} catch (error) {
			await this.handleDownloadError(taskId, error);
		}
	}

	/*
	 * Maneja errores de descarga
	 *
	 */

	private async handleDownloadError(taskId: string, error: any): Promise<void> {
		const download = this.activeDownloads.get(taskId);
		if (!download) {
			return;
		}

		const downloadError: DownloadError = {
			code: this.mapErrorToCode(error),
			message: error.message || "Unknown download error",
			details: error,
			timestamp: Date.now(),
		};

		download.error = downloadError;
		download.retryCount++;

		// Log detallado del error
		this.currentLogger.error(
			TAG,
			`Download error for ${taskId} (attempt ${download.retryCount}/${this.config.maxRetries})`,
			{
				errorCode: downloadError.code,
				errorMessage: downloadError.message,
				filePath: download.task.destination,
				url: download.task.url,
			}
		);

		// Intentar reintento si no se han agotado
		if (download.retryCount < this.config.maxRetries) {
			this.currentLogger.warn(
				TAG,
				`Download failed, retrying (${download.retryCount}/${this.config.maxRetries}): ${taskId}`
			);

			// Reintento después de un delay exponencial
			const delay = Math.pow(2, download.retryCount) * 1000;
			setTimeout(() => {
				// Cancelar tarea anterior y crear nueva
				if (download.downloadTask) {
					try {
						download.downloadTask.stop(); // stop() es síncrono, no devuelve Promise
					} catch (stopError) {
						this.currentLogger.warn(TAG, `Error stopping download task: ${stopError}`);
					}
				}
				this.executeDownload(download.task);
			}, delay);

			return;
		}

		// Marcar como fallido
		download.state = DownloadStates.FAILED;
		this.activeDownloads.set(taskId, download);

		this.eventEmitter.emit(DownloadEventType.FAILED, {
			taskId,
			error: downloadError,
		});

		this.currentLogger.error(TAG, `Download failed: ${taskId}`, downloadError);

		// Desregistrar de StorageService
		storageService.unregisterActiveDownload(taskId);

		// Procesar siguiente en cola
		this.processNextInQueue();
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
			this.executeDownload(nextTask);
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
		}, 5000); // Cada 5 segundos

		this.currentLogger.debug(TAG, "Queue processing started");
	}

	/*
	 * Maneja cambios de red
	 *
	 */

	private handleNetworkChange(networkStatus: any): void {
		// Si WiFi es requerido y se perdió la conexión WiFi
		if (this.config.requiresWifi && !networkStatus.isWifi && networkStatus.isCellular) {
			this.currentLogger.info(TAG, "WiFi lost, pausing downloads that require WiFi");

			for (const [taskId, download] of this.activeDownloads) {
				if (download.state === DownloadStates.DOWNLOADING) {
					this.pauseDownload(taskId).catch(error => {
						this.currentLogger.error(
							TAG,
							`Failed to pause download on network change: ${taskId}`,
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

		// Si volvió la conectividad adecuada, las descargas se reanudan automáticamente
		// gracias a react-native-background-downloader
	}

	/*
	 * Valida una tarea de descarga
	 *
	 */

	private validateDownloadTask(task: BinaryDownloadTask): ValidationResult {
		const errors: string[] = [];

		if (!task.id || task.id.trim().length === 0) {
			errors.push("Task ID is required");
		}

		if (!task.url || !this.isValidUrl(task.url)) {
			errors.push("Valid URL is required");
		}

		if (!task.destination || task.destination.trim().length === 0) {
			errors.push("Destination path is required");
		}

		return {
			isValid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined,
		};
	}

	/*
	 * Verifica si una URL es válida
	 *
	 */

	private isValidUrl(url: string): boolean {
		// Usar regex para evitar bug de React Native con new URL()
		return /^https?:\/\//.test(url.trim());
	}

	/*
	 * Mapea errores a códigos conocidos
	 *
	 */

	private mapErrorToCode(error: any): DownloadErrorCode {
		if (!error) {
			return DownloadErrorCode.UNKNOWN;
		}

		const message = error.message?.toLowerCase() || "";

		if (message.includes("network") || message.includes("connection")) {
			return DownloadErrorCode.NETWORK_ERROR;
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

		if (message.includes("cancelled") || message.includes("stopped")) {
			return DownloadErrorCode.CANCELLED;
		}

		return DownloadErrorCode.UNKNOWN;
	}

	/*
	 * Calcula velocidad promedio de descargas activas
	 *
	 */

	private calculateAverageSpeed(downloads: ActiveBinaryDownload[]): number {
		const activeDownloads = downloads.filter(d => d.state === DownloadStates.DOWNLOADING);
		if (activeDownloads.length === 0) {
			return 0;
		}

		const totalSpeed = activeDownloads.reduce((sum, download) => {
			const elapsedTime = (Date.now() - download.startTime) / 1000; // segundos
			const speed = elapsedTime > 0 ? download.progress.bytesWritten / elapsedTime : 0;
			return sum + speed;
		}, 0);

		return Math.round(totalSpeed / activeDownloads.length);
	}

	/*
	 * Configura opciones de WiFi/celular
	 *
	 */

	public setNetworkPolicy(requiresWifi: boolean, allowCellular: boolean): void {
		this.config.requiresWifi = requiresWifi;
		this.config.allowCellular = allowCellular;

		this.currentLogger.info(
			TAG,
			`Network policy updated: WiFi required=${requiresWifi}, Cellular allowed=${allowCellular}`
		);
	}

	/*
	 * Habilita/deshabilita notificaciones
	 * Nota: Las notificaciones se configuran por descarga individual
	 */

	public setNotificationsEnabled(enabled: boolean): void {
		this.config.showNotifications = enabled;
		// No hay configuración global de notificaciones en esta librería
		// Las notificaciones se configuran por descarga en downloadOptions.isNotificationVisible

		this.currentLogger.info(TAG, `Notifications ${enabled ? "enabled" : "disabled"}`);
	}

	/*
	 * Suscribe a eventos del servicio
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
	 * Limpia recursos al destruir
	 *
	 */

	public destroy(): void {
		this.isProcessingQueue = false;

		// Cancelar todas las descargas activas
		for (const taskId of this.activeDownloads.keys()) {
			this.cancelDownload(taskId).catch(error => {
				this.currentLogger.error(
					TAG,
					`Failed to cancel download during destroy: ${taskId}`,
					error
				);
			});
		}

		this.eventEmitter.removeAllListeners();
		this.activeDownloads.clear();
		this.downloadQueue = [];
		this.lastProgressUpdate.clear();
		this.isInitialized = false;

		this.currentLogger.info(TAG, "BinaryDownloadService destroyed");
	}
}

// Exportar instancia singleton
export const binaryDownloadService = BinaryDownloadService.getInstance();
