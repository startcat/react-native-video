/*
 * Servicio singleton para gestión de cola de descargas
 * Usa PersistenceService y StorageService existentes
 *
 */

import { EventEmitter } from "eventemitter3";
import { PlayerError } from "../../../core/errors";
import { Logger } from "../../logger";
import { LOG_TAGS } from "../constants";
import { DEFAULT_CONFIG_QUEUE, LOGGER_DEFAULTS } from "../defaultConfigs";
import { binaryDownloadService } from "../services/download/BinaryDownloadService";
import { persistenceService } from "../services/storage/PersistenceService";
import { storageService } from "../services/storage/StorageService";
import { downloadsManager } from "./DownloadsManager";
import { nativeManager } from "./NativeManager";
import { profileManager } from "./ProfileManager";

import {
	BinaryDownloadTask,
	DownloadEventType,
	DownloadItem,
	DownloadStates,
	DownloadType,
	QueueManagerConfig,
	QueueStats,
	QueueStatusCallback,
	StreamDownloadTask,
} from "../types";
import { speedCalculator } from "../utils/SpeedCalculator";

const TAG = LOG_TAGS.QUEUE_MANAGER;

export class QueueManager {
	private static instance: QueueManager;
	private eventEmitter: EventEmitter;
	private downloadQueue: Map<string, DownloadItem> = new Map();
	private isProcessing: boolean = false;
	private isPaused: boolean = false;
	private isInitialized: boolean = false;
	private initPromise: Promise<void> | null = null;
	private config: QueueManagerConfig;
	private processingInterval: ReturnType<typeof setTimeout> | null = null;
	private currentlyDownloading: Set<string> = new Set();
	private retryTracker: Map<string, number> = new Map();
	private currentLogger: Logger;
	private isProcessingQueue: boolean = false; // Flag para prevenir ejecuciones concurrentes

	// Sistema de locks para operaciones de eliminación
	private pendingOperations: Map<string, "removing" | "updating"> = new Map();
	private lockTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

	private constructor() {
		this.eventEmitter = new EventEmitter();

		this.config = DEFAULT_CONFIG_QUEUE;

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

	public static getInstance(): QueueManager {
		if (!QueueManager.instance) {
			QueueManager.instance = new QueueManager();
		}
		return QueueManager.instance;
	}

	/*
	 * Configura los event listeners para conectar con eventos nativos
	 */
	private setupNativeEventListeners(): void {
		// Suscribirse a eventos de progreso del NativeManager
		nativeManager.subscribe("download_progress", (data: unknown) => {
			this.handleNativeProgressEvent(data).catch(error => {
				this.currentLogger.error(TAG, "Failed to handle native progress event", error);
			});
		});

		// Suscribirse a eventos de estado del NativeManager
		nativeManager.subscribe("download_state_changed", (data: unknown) => {
			this.handleNativeStateEvent(data).catch(error => {
				this.currentLogger.error(TAG, "Failed to handle native state event", error);
			});
		});

		// Suscribirse a eventos de completado del NativeManager
		nativeManager.subscribe("download_completed", (data: unknown) => {
			this.handleNativeCompletedEvent(data).catch(error => {
				this.currentLogger.error(TAG, "Failed to handle native completed event", error);
			});
		});

		// Suscribirse a eventos de error del NativeManager (streams HLS/DASH)
		// FASE 2: Ahora que DownloadService ya no re-emite eventos, necesitamos suscribirnos directamente
		nativeManager.subscribe("download_error", (data: unknown) => {
			this.handleNativeErrorEvent(data).catch(error => {
				this.currentLogger.error(TAG, "Failed to handle native error event", error);
			});
		});

		// FASE 1: Suscribirse a eventos de BinaryDownloadService directamente
		// Los binarios no pasan por NativeManager, usan @kesha-antonov/react-native-background-downloader
		this.setupBinaryEventListeners();

		this.currentLogger.debug(TAG, "Native event listeners configured");
	}

	/*
	 * FASE 1: Configura event listeners para BinaryDownloadService
	 * Los binarios usan @kesha-antonov/react-native-background-downloader, no NativeManager
	 */
	private setupBinaryEventListeners(): void {
		// Suscribirse a eventos de progreso de binarios
		binaryDownloadService.subscribe(DownloadEventType.PROGRESS, (data: unknown) => {
			// BinaryDownloadService emite: { taskId, percent, bytesWritten, totalBytes, downloadSpeed, estimatedTimeRemaining }
			const progressData = data as {
				taskId: string;
				percent: number;
				bytesWritten?: number;
				bytesDownloaded?: number;
				totalBytes: number;
				downloadSpeed?: number;
				speed?: number;
			};
			// Convertir al formato esperado por handleNativeProgressEvent
			const percent = progressData.percent ?? 0;
			const bytesDownloaded = progressData.bytesWritten ?? progressData.bytesDownloaded ?? 0;
			const speed = progressData.downloadSpeed ?? progressData.speed ?? 0;

			this.handleNativeProgressEvent({
				downloadId: progressData.taskId,
				percent,
				bytesDownloaded,
				totalBytes: progressData.totalBytes,
				speed,
			}).catch(error => {
				this.currentLogger.error(TAG, "Failed to handle binary progress event", error);
			});
		});

		// Suscribirse a eventos de completado de binarios
		binaryDownloadService.subscribe(DownloadEventType.COMPLETED, (data: unknown) => {
			const completedData = data as { taskId: string; fileUri?: string; fileSize?: number };
			this.handleNativeCompletedEvent({
				downloadId: completedData.taskId,
				fileUri: completedData.fileUri,
				fileSize: completedData.fileSize,
			}).catch(error => {
				this.currentLogger.error(TAG, "Failed to handle binary completed event", error);
			});
		});

		// Suscribirse a eventos de error de binarios
		binaryDownloadService.subscribe(DownloadEventType.FAILED, (data: unknown) => {
			const errorData = data as { taskId: string; error?: string; errorCode?: string };
			const item = this.downloadQueue.get(errorData.taskId);
			if (item) {
				this.handleDownloadFailure(errorData.taskId, item, {
					code: errorData.errorCode || "UNKNOWN",
					message: errorData.error || "Binary download failed",
					timestamp: Date.now(),
				}).catch((err: Error) => {
					this.currentLogger.error(TAG, "Failed to handle binary error event", err);
				});
			}
		});

		this.currentLogger.debug(TAG, "Binary event listeners configured");
	}

	/*
	 * Inicializa el servicio de cola de descargas
	 *
	 */

	public async initialize(config?: Partial<QueueManagerConfig>): Promise<void> {
		if (this.isInitialized) {
			if (config) {
				this.updateConfig(config);
			}
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

			this.currentLogger.info(
				TAG,
				`Config applied: maxConcurrentDownloads=${this.config.maxConcurrentDownloads}, autoProcess=${this.config.autoProcess}`
			);

			try {
				// Cargar cola persistida usando PersistenceService
				await this.loadPersistedQueue();

				// Configurar event listeners para eventos nativos
				this.setupNativeEventListeners();

				// Inicializar procesamiento automático
				if (this.config.autoProcess) {
					this.startProcessing();
				}

				this.isInitialized = true;
				this.currentLogger.info(
					TAG,
					`QueueManager initialized with ${this.downloadQueue.size} downloads`
				);
			} catch (error) {
				throw new PlayerError("DOWNLOAD_QUEUE_MANAGER_INITIALIZATION_FAILED", {
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
	 * Actualiza la configuración del QueueManager en runtime
	 * Permite cambiar autoProcess y maxConcurrentDownloads después de la inicialización
	 */
	public updateConfig(config: Partial<QueueManagerConfig>): void {
		if (!this.isInitialized) {
			this.currentLogger.warn(TAG, "Cannot update config: QueueManager not initialized");
			return;
		}

		const previousAutoProcess = this.config.autoProcess;
		this.config = { ...this.config, ...config };

		this.currentLogger.info(
			TAG,
			`Config updated: autoProcess=${this.config.autoProcess}, maxConcurrentDownloads=${this.config.maxConcurrentDownloads}`
		);

		// Si autoProcess cambió de false a true y no está procesando, iniciar
		if (
			!previousAutoProcess &&
			this.config.autoProcess &&
			!this.isProcessing &&
			!this.isPaused
		) {
			this.currentLogger.info(TAG, "autoProcess enabled, starting processing");
			this.startProcessing();
		}
	}

	/*
	 * Añadir DownloadItem completo a la cola (nuevo método para la nueva arquitectura)
	 *
	 */

	public async addDownloadItem(downloadItem: DownloadItem): Promise<string> {
		if (!this.isInitialized) {
			throw new PlayerError("DOWNLOAD_QUEUE_MANAGER_NOT_INITIALIZED");
		}

		// Verificar si ya existe
		const existing = this.downloadQueue.get(downloadItem.id);
		if (existing) {
			this.currentLogger.info(
				TAG,
				`Download already exists: ${downloadItem.title} (${downloadItem.id})`
			);
			return downloadItem.id;
		}

		try {
			// Agregar directamente a la cola
			this.downloadQueue.set(downloadItem.id, downloadItem);

			// Persistir usando PersistenceService
			await persistenceService.saveDownloadState(this.downloadQueue);

			// Emitir evento
			this.eventEmitter.emit(DownloadEventType.QUEUED, {
				downloadId: downloadItem.id,
				item: downloadItem,
				queueSize: this.downloadQueue.size,
			});

			this.currentLogger.info(
				TAG,
				`Download queued: ${downloadItem.title} (${downloadItem.id})`
			);

			// OPTIMIZACIÓN: Iniciar procesamiento si hay trabajo y no está procesando
			// IMPORTANTE: Solo iniciar si autoProcess está habilitado (respeta autoStart del DownloadsManager)
			if (!this.isProcessing && !this.isPaused && this.config.autoProcess) {
				this.currentLogger.debug(TAG, "Starting processing due to new download added");
				this.startProcessing();
			}

			return downloadItem.id;
		} catch (error) {
			throw new PlayerError("DOWNLOAD_QUEUE_ADD_ITEM_FAILED", {
				originalError: error,
				contentId: downloadItem.id,
			});
		}
	}

	/*
	 * Elimina una descarga de la cola considerando gestión de perfiles
	 * Según el requisito: solo elimina del disco si no quedan más perfiles asociados
	 *
	 */

	public async removeDownload(downloadId: string, profileId?: string): Promise<void> {
		if (!this.isInitialized) {
			throw new PlayerError("DOWNLOAD_QUEUE_MANAGER_NOT_INITIALIZED");
		}

		// Intentar adquirir lock para evitar race conditions
		if (!this.acquireLock(downloadId, "removing")) {
			this.currentLogger.warn(
				TAG,
				`Cannot remove ${downloadId}: operation already in progress`
			);
			return;
		}

		try {
			const item = this.downloadQueue.get(downloadId);
			if (!item) {
				throw new PlayerError("DOWNLOAD_QUEUE_ITEM_NOT_FOUND", { downloadId });
			}

			// Si no se especifica profileId, usar el perfil activo
			const targetProfileId = profileId || profileManager.getActiveProfileId();
			if (!targetProfileId) {
				throw new PlayerError("DOWNLOAD_FAILED", {
					downloadId,
					message: "No profile ID specified and no active profile available",
				});
			}

			// Verificar si el perfil está asociado a esta descarga
			if (!item.profileIds || !item.profileIds.includes(targetProfileId)) {
				this.currentLogger.warn(
					TAG,
					`Profile ${targetProfileId} is not associated with download ${downloadId}`
				);
				return; // No hacer nada si el perfil no está asociado
			}

			// GESTIÓN DE PERFILES SEGÚN REQUISITO:
			// "Cuando un perfil lo elimine, se eliminará el ID de perfil del array de perfiles"
			const updatedProfileIds = item.profileIds.filter(id => id !== targetProfileId);

			if (updatedProfileIds.length > 0) {
				// AÚN HAY OTROS PERFILES: Solo actualizar array de profileIds
				item.profileIds = updatedProfileIds;
				this.downloadQueue.set(downloadId, item);

				// Persistir cambios
				await persistenceService.saveDownloadState(this.downloadQueue);

				// Emitir evento de perfil eliminado (no descarga eliminada)
				this.eventEmitter.emit("profile_removed_from_download", {
					downloadId,
					profileId: targetProfileId,
					remainingProfiles: updatedProfileIds,
					item,
				});

				this.currentLogger.info(
					TAG,
					`Profile ${targetProfileId} removed from download: ${item.title}. Remaining profiles: ${updatedProfileIds.length}`
				);
			} else {
				// NO QUEDAN MÁS PERFILES: Eliminar completamente según requisito
				// "Si el contenido no tiene asociado ningún perfil, entonces lo eliminamos de disco"

				this.currentLogger.info(
					TAG,
					`No profiles remaining for download ${downloadId}. Removing from disk and queue.`
				);

				// Si se está descargando, detenerla
				if (this.currentlyDownloading.has(downloadId)) {
					this.currentlyDownloading.delete(downloadId);
				}

				// Eliminar archivos del disco
				try {
					// Llamar al módulo nativo para eliminar la descarga
					// Esto debería limpiar tanto la base de datos interna como los archivos físicos
					await nativeManager.removeDownload(downloadId);
					this.currentLogger.info(
						TAG,
						`Download removed via native manager: ${downloadId}`
					);
				} catch (error) {
					this.currentLogger.warn(
						TAG,
						`Failed to remove download via native manager: ${downloadId}`,
						error
					);
				}

				// Cambiar estado a removing
				item.state = DownloadStates.REMOVING;
				this.downloadQueue.set(downloadId, item);

				// Remover completamente de la cola y tracking
				this.downloadQueue.delete(downloadId);
				this.retryTracker.delete(downloadId);

				// Persistir cambios
				await persistenceService.saveDownloadState(this.downloadQueue);

				// Emitir evento de descarga completamente eliminada
				this.eventEmitter.emit(DownloadEventType.REMOVED, {
					downloadId,
					item,
					queueSize: this.downloadQueue.size,
				});

				this.currentLogger.info(
					TAG,
					`Download completely removed: ${item.title} (${downloadId})`
				);
			}
		} catch (error) {
			throw new PlayerError("DOWNLOAD_QUEUE_REMOVE_FAILED", {
				originalError: error,
				downloadId,
				profileId: profileId,
			});
		} finally {
			// Siempre liberar el lock
			this.releaseLock(downloadId);
		}
	}

	/*
	 * Elimina completamente una descarga sin considerar perfiles (para casos especiales)
	 * ADVERTENCIA: Este método ignora la gestión de perfiles y elimina forzosamente
	 *
	 */

	public async forceRemoveDownload(downloadId: string): Promise<void> {
		if (!this.isInitialized) {
			throw new PlayerError("DOWNLOAD_QUEUE_MANAGER_NOT_INITIALIZED");
		}

		try {
			const item = this.downloadQueue.get(downloadId);
			if (!item) {
				// No lanzar error si el item no existe - puede haber sido eliminado por otro proceso
				// o nunca fue añadido correctamente (ej: falló durante preparación)
				this.currentLogger.warn(
					TAG,
					`Download ${downloadId} not found in queue during force removal - may already be removed`
				);
				return;
			}

			this.currentLogger.warn(
				TAG,
				`Force removing download ${downloadId} - ignoring profile management`
			);

			// Cambiar estado a removing
			item.state = DownloadStates.REMOVING;
			this.downloadQueue.set(downloadId, item);

			// Si se está descargando, detenerla
			if (this.currentlyDownloading.has(downloadId)) {
				this.currentlyDownloading.delete(downloadId);
			}

			// Eliminar archivos del disco usando StorageService
			if (item.fileUri) {
				try {
					await storageService.deleteFile(item.fileUri);
					this.currentLogger.info(
						TAG,
						`File forcefully deleted from disk: ${item.fileUri}`
					);
				} catch (error) {
					this.currentLogger.warn(TAG, `Failed to delete file: ${item.fileUri}`, error);
				}
			}

			// Remover completamente de la cola y tracking
			this.downloadQueue.delete(downloadId);
			this.retryTracker.delete(downloadId);

			// Persistir cambios
			await persistenceService.saveDownloadState(this.downloadQueue);

			// Emitir evento de descarga completamente eliminada
			this.eventEmitter.emit(DownloadEventType.REMOVED, {
				downloadId,
				item,
				queueSize: this.downloadQueue.size,
			});

			this.currentLogger.info(
				TAG,
				`Download forcefully removed: ${item.title} (${downloadId})`
			);
		} catch (error) {
			throw new PlayerError("DOWNLOAD_QUEUE_REMOVE_FAILED", {
				originalError: error,
				downloadId,
			});
		}
	}

	/*
	 * Pausa una descarga específica
	 *
	 */

	public async pauseDownload(downloadId: string): Promise<void> {
		const item = this.downloadQueue.get(downloadId);
		if (item && item.state === DownloadStates.DOWNLOADING) {
			await this.updateDownloadState(downloadId, DownloadStates.PAUSED);
			this.currentlyDownloading.delete(downloadId);

			this.eventEmitter.emit(DownloadEventType.PAUSED, { downloadId, item });
		}
	}

	/*
	 * Reanuda una descarga específica
	 *
	 */

	public async resumeDownload(downloadId: string): Promise<void> {
		const item = this.downloadQueue.get(downloadId);
		if (item && item.state === DownloadStates.PAUSED) {
			await this.updateDownloadState(downloadId, DownloadStates.QUEUED);

			this.eventEmitter.emit(DownloadEventType.RESUMED, { downloadId, item });

			// OPTIMIZACIÓN: Iniciar procesamiento si no está procesando
			if (!this.isProcessing && !this.isPaused) {
				this.currentLogger.debug(TAG, "Starting processing due to download resumed");
				this.startProcessing();
			}
		}
	}

	/*
	 * Pausa todas las descargas
	 *
	 */

	public pauseAll(): void {
		this.isPaused = true;

		// Transition all DOWNLOADING downloads to PAUSED state
		// Without this, individual downloads remain in DOWNLOADING state and the UI
		// shows them as "downloading" instead of "paused" (since UI reads per-download state)
		for (const [id, item] of this.downloadQueue.entries()) {
			if (
				item.state === DownloadStates.DOWNLOADING ||
				item.state === DownloadStates.DOWNLOADING_ASSETS
			) {
				item.state = DownloadStates.PAUSED;
				this.downloadQueue.set(id, item);
				this.currentlyDownloading.delete(id);

				// Emit event so useDownloadsProgress hooks update the UI
				this.eventEmitter.emit(DownloadEventType.PAUSED, { downloadId: id, item });
			}
		}

		this.currentLogger.info(TAG, "All downloads paused");
	}

	/*
	 * Reanuda todas las descargas
	 *
	 */

	public resumeAll(): void {
		this.isPaused = false;
		this.currentLogger.info(TAG, "All downloads resumed");

		// Sincronizar estado con el módulo nativo después de reanudar
		// Esto es crítico cuando hay descargas existentes que fueron reanudadas
		this.syncWithNativeState().catch(error => {
			this.currentLogger.error(
				TAG,
				"Failed to sync with native state after resumeAll",
				error
			);
		});

		// Iniciar procesamiento si no está activo (caso autoStart: false)
		// o forzar procesamiento inmediato si ya está activo
		if (!this.isProcessing) {
			this.currentLogger.debug(TAG, "Starting processing after resumeAll (was not active)");
			this.startProcessing();
		}

		// Forzar procesamiento inmediato del queue después de reanudar
		this.currentLogger.debug(TAG, "Forcing immediate queue processing after resumeAll");
		this.processQueue().catch(error => {
			this.currentLogger.error(TAG, "Failed to process queue after resumeAll", error);
		});
	}

	/*
	 * Obtiene todas las descargas
	 *
	 */

	public getAllDownloads(): DownloadItem[] {
		return Array.from(this.downloadQueue.values()).map(item => ({ ...item }));
	}

	/*
	 * Obtiene una descarga específica
	 *
	 */

	public getDownload(downloadId: string): DownloadItem | null {
		const item = this.downloadQueue.get(downloadId);
		return item ? { ...item } : null;
	}

	/*
	 * Limpia descargas completadas
	 *
	 */

	public async cleanupCompleted(): Promise<void> {
		await this.clearByState([DownloadStates.COMPLETED]);
	}

	/*
	 * Limpia descargas fallidas
	 *
	 */

	public async clearFailed(): Promise<void> {
		await this.clearByState([DownloadStates.FAILED]);
	}

	/*
	 * Limpia toda la cola de descargas
	 *
	 */

	public async clearQueue(): Promise<void> {
		try {
			const beforeCount = this.downloadQueue.size;

			// Detener todas las descargas activas
			this.currentlyDownloading.clear();

			// Limpiar archivos de descargas incompletas
			for (const [, item] of this.downloadQueue) {
				if (item.fileUri && item.state !== DownloadStates.COMPLETED) {
					try {
						await storageService.deleteFile(item.fileUri);
					} catch (error) {
						this.currentLogger.warn(TAG, `Failed to delete file: ${item.fileUri}`);
					}
				}
			}

			// Limpiar la cola y tracking
			this.downloadQueue.clear();
			this.retryTracker.clear();

			// Persistir cambios
			await persistenceService.saveDownloadState(this.downloadQueue);

			this.eventEmitter.emit(DownloadEventType.QUEUE_CLEARED, {
				queueSize: 0,
				clearedCount: beforeCount,
			});

			this.currentLogger.info(TAG, `Cleared entire queue (${beforeCount} downloads)`);
		} catch (error) {
			throw new PlayerError("DOWNLOAD_QUEUE_CLEAR_FAILED", {
				originalError: error,
			});
		}
	}

	/*
	 * Reordena la cola de descargas
	 *
	 */

	public async reorderQueue(newOrder: string[]): Promise<void> {
		try {
			// Crear nueva cola con el orden especificado
			const newQueue = new Map<string, DownloadItem>();
			const existingItems = new Map(this.downloadQueue);

			// Agregar items en el orden especificado
			newOrder.forEach(id => {
				const item = existingItems.get(id);
				if (item) {
					newQueue.set(id, item);
					existingItems.delete(id);
				}
			});

			// Agregar items restantes al final
			existingItems.forEach((item, id) => {
				newQueue.set(id, item);
			});

			this.downloadQueue = newQueue;

			// Persistir cambios
			await persistenceService.saveDownloadState(this.downloadQueue);

			this.eventEmitter.emit(DownloadEventType.QUEUE_REORDERED, {
				queueSize: this.downloadQueue.size,
				newOrder,
			});

			this.currentLogger.info(TAG, `Queue reordered with ${newOrder.length} items`);
		} catch (error) {
			throw new PlayerError("DOWNLOAD_QUEUE_REORDER_FAILED", {
				originalError: error,
				newOrder,
			});
		}
	}

	/*
	 * Establece el número máximo de descargas concurrentes
	 *
	 */

	public setMaxConcurrent(count: number): void {
		if (count <= 0) {
			throw new PlayerError("DOWNLOAD_QUEUE_INVALID_CONCURRENT_COUNT", { count });
		}

		this.config.maxConcurrentDownloads = count;
		this.currentLogger.info(TAG, `Max concurrent downloads set to ${count}`);

		this.eventEmitter.emit("max_concurrent_changed", { maxConcurrent: count });
	}

	/*
	 * Filtra descargas por estado
	 *
	 */

	public filterByState(states: DownloadStates[]): DownloadItem[] {
		return Array.from(this.downloadQueue.values())
			.filter(item => states.includes(item.state))
			.map(item => ({ ...item }));
	}

	/*
	 * Filtra descargas por tipo
	 *
	 */

	public filterByType(type: string): DownloadItem[] {
		return Array.from(this.downloadQueue.values())
			.filter(item => item.type.toString() === type)
			.map(item => ({ ...item }));
	}

	/*
	 * Obtiene la posición de cada descarga en la cola
	 *
	 */

	public getQueuePositions(): Map<string, number> {
		const positions = new Map<string, number>();
		let position = 1;

		for (const [id] of this.downloadQueue) {
			positions.set(id, position);
			position++;
		}

		return positions;
	}

	/*
	 * Obtiene estadísticas completas de la cola
	 *
	 */

	public getQueueStats(): QueueStats {
		const items = Array.from(this.downloadQueue.values());
		const pending = items.filter(item => item.state === DownloadStates.QUEUED).length;
		const downloading = items.filter(item => item.state === DownloadStates.DOWNLOADING).length;
		const paused = items.filter(item => item.state === DownloadStates.PAUSED).length;
		const completed = items.filter(item => item.state === DownloadStates.COMPLETED).length;
		const failed = items.filter(item => item.state === DownloadStates.FAILED).length;

		// Calcular velocidad promedio de descargas activas
		const activeDownloads = items.filter(item => item.state === DownloadStates.DOWNLOADING);

		let averageSpeed = 0;
		let totalBytesDownloaded = 0;
		let totalBytes = 0;

		if (activeDownloads.length > 0) {
			const totalSpeed = activeDownloads.reduce((sum, item) => {
				const speed = item.stats?.downloadSpeed || 0;
				totalBytesDownloaded += item.stats?.bytesDownloaded || 0;
				totalBytes += item.stats?.totalBytes || 0;
				return sum + speed;
			}, 0);

			averageSpeed = totalSpeed / activeDownloads.length;
		}

		return {
			total: this.downloadQueue.size,
			pending,
			downloading,
			paused,
			completed,
			failed,
			isPaused: this.isPaused,
			isProcessing: this.isProcessing,
			// Propiedades opcionales para compatibilidad
			active: downloading,
			queued: pending,
			totalBytesDownloaded,
			totalBytesRemaining: totalBytes - totalBytesDownloaded,
			averageSpeed,
			estimatedTimeRemaining:
				averageSpeed > 0
					? Math.round((totalBytes - totalBytesDownloaded) / averageSpeed)
					: 0,
		};
	}

	/*
	 * Limpia descargas por estados específicos (método auxiliar)
	 * Realiza limpieza completa: archivos físicos, estado nativo y cola
	 *
	 */

	private async clearByState(
		states: DownloadStates[],
		skipFileCleanup: boolean = false
	): Promise<void> {
		try {
			const beforeCount = this.downloadQueue.size;
			const idsToRemove: string[] = [];

			// Identificar items a eliminar
			for (const [id, item] of this.downloadQueue) {
				if (states.includes(item.state)) {
					idsToRemove.push(id);
				}
			}

			if (idsToRemove.length === 0) {
				return;
			}

			this.currentLogger.info(
				TAG,
				`Clearing ${idsToRemove.length} downloads with states: ${states.join(", ")}`
			);

			// Limpiar cada item completamente
			for (const id of idsToRemove) {
				const item = this.downloadQueue.get(id);

				// 1. Limpiar archivo físico si existe y no se omite
				if (!skipFileCleanup && item?.fileUri) {
					try {
						await storageService.deleteFile(item.fileUri);
					} catch (error) {
						this.currentLogger.warn(TAG, `Failed to delete file: ${item.fileUri}`);
					}
				}

				// 2. Limpiar estado nativo (para streams)
				if (item?.type === DownloadType.STREAM) {
					try {
						await nativeManager.removeDownload(id);
					} catch (error) {
						// Ignorar errores si ya no existe en nativo
					}
				}

				// 3. Eliminar de la cola
				this.downloadQueue.delete(id);

				// 4. Limpiar tracking asociado
				this.retryTracker.delete(id);
				this.currentlyDownloading.delete(id);
			}

			const removed = beforeCount - this.downloadQueue.size;

			// Persistir cambios
			await persistenceService.saveDownloadState(this.downloadQueue);

			this.eventEmitter.emit("downloads_cleared_by_state", {
				states,
				clearedCount: removed,
				queueSize: this.downloadQueue.size,
			});

			this.currentLogger.info(
				TAG,
				`Cleared ${removed} downloads with states: ${states.join(", ")}`
			);
		} catch (error) {
			throw new PlayerError("DOWNLOAD_QUEUE_CLEAR_BY_STATE_FAILED", {
				originalError: error,
				states,
			});
		}
	}

	/*
	 * Suscribe a eventos de cola
	 *
	 */

	public subscribe(event: DownloadEventType | "all", callback: QueueStatusCallback): () => void {
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
	 * Suscribe a eventos de un download específico (OPTIMIZADO)
	 * Solo emite eventos cuando el downloadId coincide
	 *
	 * @param downloadId - ID del download a monitorear
	 * @param callback - Función a ejecutar cuando hay cambios
	 * @returns Función para cancelar la suscripción
	 */

	public subscribeToDownload(downloadId: string, callback: (data: unknown) => void): () => void {
		// Wrapper que filtra eventos por downloadId
		const filteredCallback = (eventData: unknown) => {
			const data = eventData as { downloadId?: string; taskId?: string };
			// Solo ejecutar callback si el evento es para este downloadId
			if (data.downloadId === downloadId || data.taskId === downloadId) {
				callback(eventData);
			}
		};

		// Suscribirse a todos los eventos relevantes con el filtro
		const events: DownloadEventType[] = [
			DownloadEventType.PROGRESS,
			DownloadEventType.STARTED,
			DownloadEventType.COMPLETED,
			DownloadEventType.FAILED,
			DownloadEventType.PAUSED,
			DownloadEventType.RESUMED,
			DownloadEventType.QUEUED,
			DownloadEventType.REMOVED,
		];

		events.forEach(event => {
			this.eventEmitter.on(event, filteredCallback);
		});

		// Retornar función de cleanup
		return () => {
			events.forEach(event => {
				this.eventEmitter.off(event, filteredCallback);
			});
		};
	}

	/*
	 * Inicia el procesamiento de descargas (método público)
	 *
	 */

	public start(): void {
		this.startProcessing();
	}

	/*
	 * Inicia el procesamiento de descargas (método interno)
	 *
	 */

	private startProcessing(): void {
		if (this.processingInterval) {
			return;
		}

		this.isProcessing = true;
		this.processingInterval = setInterval(() => {
			if (!this.isPaused) {
				this.processQueue();
			}
		}, this.config.processIntervalMs);

		this.currentLogger.debug(TAG, "Download processing started");
	}

	/*
	 * Detiene el procesamiento de descargas
	 *
	 */

	private stopProcessing(): void {
		if (this.processingInterval) {
			clearInterval(this.processingInterval);
			this.processingInterval = null;
		}
		this.isProcessing = false;
		this.currentLogger.debug(TAG, "Download processing stopped");
	}

	/*
	 * Procesa la cola de descargas enviando items a las colas destino
	 * Según el requisito: solo envía a colas destino si no hemos llegado a maxConcurrentDownloads
	 *
	 */

	private async processQueue(): Promise<void> {
		// Prevenir ejecuciones concurrentes de processQueue
		if (this.isProcessingQueue) {
			return;
		}

		this.isProcessingQueue = true;

		try {
			await this.doProcessQueue();
		} finally {
			this.isProcessingQueue = false;
		}
	}

	/*
	 * Implementación real del procesamiento de cola
	 *
	 */

	private async doProcessQueue(): Promise<void> {
		// Verificar límite de descargas concurrentes
		// IMPORTANTE: Contar tanto descargas con estado DOWNLOADING/PAUSED como las que están en currentlyDownloading
		// (pueden estar en transición de QUEUED a DOWNLOADING)
		const stateActive = Array.from(this.downloadQueue.values()).filter(
			item =>
				item.state === DownloadStates.DOWNLOADING || item.state === DownloadStates.PAUSED
		).length;
		const activeDownloads = Math.max(stateActive, this.currentlyDownloading.size);

		const queuedDownloads = Array.from(this.downloadQueue.values()).filter(
			item => item.state === DownloadStates.QUEUED
		).length;

		// OPTIMIZACIÓN: Si no hay nada en cola ni activas, detener el intervalo
		if (queuedDownloads === 0 && activeDownloads === 0) {
			if (this.isProcessing) {
				this.currentLogger.debug(TAG, "No work to do, stopping processing interval");
				this.stopProcessing();
			}
			return;
		}

		// Verificar si hay espacio para más descargas
		if (activeDownloads >= this.config.maxConcurrentDownloads) {
			// Solo loggear si hay descargas esperando en cola
			if (queuedDownloads > 0) {
				this.currentLogger.debug(
					TAG,
					`Max concurrent downloads reached (${activeDownloads}/${this.config.maxConcurrentDownloads}), keeping ${queuedDownloads} items in queue`
				);
			}
			return;
		}

		// Solo loggear cuando realmente vamos a procesar algo
		if (queuedDownloads > 0) {
			this.currentLogger.debug(
				TAG,
				`processQueue - Active: ${activeDownloads}, Queued: ${queuedDownloads}, Max: ${this.config.maxConcurrentDownloads}`
			);
		}

		// Buscar siguiente descarga en cola
		let nextDownload: DownloadItem | null = null;
		let nextDownloadId: string | null = null;

		for (const [id, item] of this.downloadQueue) {
			if (item.state === DownloadStates.QUEUED && !this.currentlyDownloading.has(id)) {
				nextDownload = item;
				nextDownloadId = id;
				break;
			}
		}

		if (!nextDownload || !nextDownloadId) {
			return; // No hay descargas pendientes
		}

		try {
			// Verificar conectividad antes de iniciar
			if (!this.canDownloadNow()) {
				this.currentLogger.debug(TAG, "Network conditions not suitable for download");
				return;
			}

			// DELAY ESCALONADO: Si hay descargas activas, esperar 500ms antes de iniciar la siguiente
			// Esto previene race conditions en el módulo nativo cuando se lanzan múltiples descargas simultáneas
			if (activeDownloads > 0) {
				this.currentLogger.debug(
					TAG,
					`Waiting 500ms before starting next download (${activeDownloads} active downloads)`
				);
				await new Promise(resolve => setTimeout(resolve, 500));
			}

			// Re-verificar límite de concurrencia después del delay
			const stateActiveAfterDelay = Array.from(this.downloadQueue.values()).filter(
				item =>
					item.state === DownloadStates.DOWNLOADING ||
					item.state === DownloadStates.PAUSED
			).length;
			const activeAfterDelay = Math.max(
				stateActiveAfterDelay,
				this.currentlyDownloading.size
			);
			if (activeAfterDelay >= this.config.maxConcurrentDownloads) {
				this.currentLogger.debug(
					TAG,
					`Max concurrent reached after delay (${activeAfterDelay}/${this.config.maxConcurrentDownloads}), skipping`
				);
				return;
			}

			// Verificar de nuevo después del delay que la descarga sigue en QUEUED
			// Puede haber cambiado de estado durante el delay
			const currentItem = this.downloadQueue.get(nextDownloadId);
			if (!currentItem || currentItem.state !== DownloadStates.QUEUED) {
				this.currentLogger.debug(
					TAG,
					`Download ${nextDownloadId} no longer in QUEUED state, skipping`
				);
				return;
			}

			// Verificar que no está ya siendo procesada
			if (this.currentlyDownloading.has(nextDownloadId)) {
				this.currentLogger.debug(
					TAG,
					`Download ${nextDownloadId} already in currentlyDownloading, skipping`
				);
				return;
			}

			this.currentLogger.info(
				TAG,
				`Starting download: ${nextDownload.title} (${nextDownloadId})`
			);

			// Marcar como descargando ANTES de enviar a cola destino
			this.currentlyDownloading.add(nextDownloadId);
			await this.updateDownloadState(nextDownloadId, DownloadStates.DOWNLOADING);

			// ENVIAR A COLA DESTINO: Aquí es donde enviamos a react-native-background-downloader o módulo nativo
			await this.sendToDestinationQueue(nextDownload);

			// Emitir evento de inicio
			this.eventEmitter.emit(DownloadEventType.STARTED, {
				downloadId: nextDownloadId,
				item: nextDownload,
			});

			this.currentLogger.info(
				TAG,
				`Download sent to destination queue: ${nextDownload.title}`
			);
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to start download: ${error}`);
			// Limpiar estado si falla
			this.currentlyDownloading.delete(nextDownloadId);
			if (nextDownloadId) {
				await this.updateDownloadState(nextDownloadId, DownloadStates.FAILED);
			}
		}
	}

	/*
	 * Verifica si las condiciones actuales permiten descargar
	 * (conectividad, configuración de red, etc.)
	 *
	 */

	private canDownloadNow(): boolean {
		// TODO: Integrar con NetworkService para verificar conectividad
		// Por ahora, siempre permitir descargas para que funcione la lógica básica
		return true;
	}

	/*
	 * Envía un item a la cola destino correspondiente (react-native-background-downloader o módulo nativo)
	 * Esta es la implementación del requisito clave
	 *
	 */

	private async sendToDestinationQueue(item: DownloadItem): Promise<void> {
		try {
			// Crear tarea específica según el tipo
			let task: BinaryDownloadTask | StreamDownloadTask;

			if (item.type === DownloadType.BINARY) {
				// Para descargas binarias -> react-native-background-downloader
				// Usar ruta absoluta del directorio de binarios
				const binariesDir = storageService.getBinariesDirectory();
				task = {
					id: item.id,
					url: item.uri,
					destination: `${binariesDir}/${item.id}`,
					headers: {},
					resumable: true,
				} as BinaryDownloadTask;

				this.currentLogger.debug(
					TAG,
					`Sending binary download to react-native-background-downloader: ${item.id}`
				);
			} else if (item.type === DownloadType.STREAM) {
				// Para descargas de streams -> módulo nativo (ExoPlayer/AVPlayer)
				task = {
					id: item.id,
					manifestUrl: item.uri,
					title: item.title,
					config: {
						type: item.uri.includes(".m3u8") ? "HLS" : "DASH",
						quality: "auto",
						drm: item.drm,
					},
				} as StreamDownloadTask;

				this.currentLogger.debug(
					TAG,
					`Sending stream download to native module: ${item.id}`
				);
			} else {
				throw new PlayerError("DOWNLOAD_FAILED", {
					downloadId: item.id,
					message: `Invalid download type: ${item.type}`,
				});
			}

			// DELEGAR AL DOWNLOADS MANAGER: Usar startDownloadNow() que ignora autoStart
			// ya que esta descarga ya fue aprobada para iniciar por el QueueManager
			await downloadsManager.startDownloadNow(task, item.type);

			this.currentLogger.info(
				TAG,
				`Successfully sent to destination queue: ${item.title} (${item.type})`
			);
		} catch (error) {
			this.currentLogger.error(
				TAG,
				`Failed to send to destination queue: ${item.title}`,
				error
			);
			throw error;
		}
	}

	/*
	 * MÉTODOS PÚBLICOS PARA COORDINACIÓN CON DOWNLOADS MANAGER
	 * Estos métodos permiten al DownloadsManager notificar eventos de descarga
	 *
	 */

	/*
	 * Notifica progreso de descarga desde el DownloadsManager
	 *
	 */

	public async notifyDownloadProgress(
		downloadId: string,
		progressPercent: number,
		bytesWritten?: number,
		totalBytes?: number
	): Promise<void> {
		await this.updateDownloadProgress(downloadId, progressPercent, bytesWritten, totalBytes);

		const item = this.downloadQueue.get(downloadId);
		if (item) {
			this.eventEmitter.emit(DownloadEventType.PROGRESS, {
				downloadId,
				percent: Math.floor(progressPercent),
				item,
			});
		}
	}

	/*
	 * Notifica que una descarga se completó exitosamente
	 *
	 */

	public async notifyDownloadCompleted(
		downloadId: string,
		fileUri?: string,
		fileSize?: number
	): Promise<void> {
		await this.updateDownloadState(downloadId, DownloadStates.COMPLETED, fileUri, fileSize);

		// Remover de descargas activas
		this.currentlyDownloading.delete(downloadId);

		// Limpiar muestras de velocidad
		speedCalculator.clear(downloadId);

		const item = this.downloadQueue.get(downloadId);
		if (item) {
			this.eventEmitter.emit(DownloadEventType.COMPLETED, {
				downloadId,
				item: { ...item, fileUri },
			});

			this.currentLogger.info(TAG, `Download completed: ${item.title}`);
		}

		// DEBUG: Log all downloads state after completion
		const allDownloads = Array.from(this.downloadQueue.values());
		const statesSummary = allDownloads.map(d => `${d.id}:${d.state}:${d.type}`).join(", ");
		this.currentLogger.info(TAG, `Queue state after completion: [${statesSummary}]`);
		this.currentLogger.info(
			TAG,
			`currentlyDownloading: [${Array.from(this.currentlyDownloading).join(", ")}]`
		);
		this.currentLogger.info(
			TAG,
			`isProcessing: ${this.isProcessing}, isPaused: ${this.isPaused}`
		);

		// Procesar siguiente item en cola (puede iniciar procesamiento si estaba detenido)
		if (!this.isProcessing && !this.isPaused) {
			this.startProcessing();
		} else {
			this.processQueue();
		}
	}

	/*
	 * Notifica que una descarga falló
	 *
	 */

	public async notifyDownloadFailed(downloadId: string, error: unknown): Promise<void> {
		// DEBUG: Log when notifyDownloadFailed is called
		console.log(`[QueueManager] 🔴 notifyDownloadFailed called for: ${downloadId}`);
		console.log(
			`[QueueManager] 🔴 Queue has ${this.downloadQueue.size} items: [${Array.from(this.downloadQueue.keys()).join(", ")}]`
		);

		const item = this.downloadQueue.get(downloadId);

		// DEDUPLICATION: If item is already FAILED, skip processing
		// This prevents race conditions when multiple error events arrive for the same download
		if (item?.state === DownloadStates.FAILED) {
			console.log(`[QueueManager] 🔴 Item already FAILED, skipping duplicate notification`);
			return;
		}

		if (item) {
			console.log(`[QueueManager] 🔴 Item found, calling handleDownloadFailure`);
			await this.handleDownloadFailure(downloadId, item, error);
		} else {
			console.log(`[QueueManager] 🔴 Item NOT found in queue for downloadId: ${downloadId}`);
		}

		// Remover de descargas activas
		this.currentlyDownloading.delete(downloadId);

		// Limpiar muestras de velocidad
		speedCalculator.clear(downloadId);

		// Procesar siguiente item en cola (puede iniciar procesamiento si estaba detenido)
		if (!this.isProcessing && !this.isPaused) {
			this.startProcessing();
		} else {
			this.processQueue();
		}
	}

	/*
	 * Notifica que une descarga fue pausada desde el servicio externo
	 *
	 */

	public async notifyDownloadPaused(downloadId: string): Promise<void> {
		await this.updateDownloadState(downloadId, DownloadStates.PAUSED);

		// Remover de descargas activas
		this.currentlyDownloading.delete(downloadId);

		const item = this.downloadQueue.get(downloadId);
		if (item) {
			this.eventEmitter.emit(DownloadEventType.PAUSED, { downloadId, item });
		}

		// Procesar siguiente item en cola (puede iniciar procesamiento si estaba detenido)
		if (!this.isProcessing && !this.isPaused) {
			this.startProcessing();
		} else {
			this.processQueue();
		}
	}

	/*
	 * Notifica que una descarga ha sido reanudada y está descargando activamente
	 * Este método se llama cuando BinaryDownloadService confirma que la descarga ha comenzado
	 * Actualiza el estado a DOWNLOADING sin importar el estado previo (QUEUED, PAUSED, etc.)
	 *
	 */

	public async notifyDownloadResumed(downloadId: string): Promise<void> {
		const item = this.downloadQueue.get(downloadId);
		if (!item) {
			this.currentLogger.warn(
				TAG,
				`Cannot notify resumed: download not found: ${downloadId}`
			);
			return;
		}

		// Actualizar estado a DOWNLOADING (sin importar el estado previo)
		await this.updateDownloadState(downloadId, DownloadStates.DOWNLOADING);

		// Agregar a descargas activas
		this.currentlyDownloading.add(downloadId);

		// Emitir evento de actualización
		this.eventEmitter.emit(DownloadEventType.RESUMED, { downloadId, item });

		this.currentLogger.debug(
			TAG,
			`Download confirmed as DOWNLOADING by service: ${downloadId}`
		);
	}

	/*
	 * Notifica un cambio de estado genérico (ej: DOWNLOADING_ASSETS)
	 *
	 */

	public async notifyDownloadStateChange(downloadId: string, newState: string): Promise<void> {
		const item = this.downloadQueue.get(downloadId);
		if (!item) {
			this.currentLogger.warn(
				TAG,
				`Cannot notify state change: download not found: ${downloadId}`
			);
			return;
		}

		// Mapear el string a DownloadStates si es válido
		const mappedState = Object.values(DownloadStates).includes(newState as DownloadStates)
			? (newState as DownloadStates)
			: null;

		if (!mappedState) {
			this.currentLogger.warn(TAG, `Invalid state: ${newState}`);
			return;
		}

		// Actualizar estado
		await this.updateDownloadState(downloadId, mappedState);

		// Emitir evento de cambio de estado
		this.eventEmitter.emit(DownloadEventType.STATE_CHANGE, {
			downloadId,
			item,
			state: mappedState,
		});

		this.currentLogger.info(TAG, `Download state changed: ${downloadId} -> ${mappedState}`);
	}

	/*
	 * MÉTODOS PRIVADOS PARA MANEJO INTERNO
	 *
	 */

	/*
	 * Maneja fallos de descarga
	 * CENTRALIZADO: Toda la lógica de reintentos está aquí.
	 * Los servicios (StreamDownloadService, BinaryDownloadService) solo reportan errores.
	 *
	 */

	private async handleDownloadFailure(
		downloadId: string,
		item: DownloadItem,
		error: unknown
	): Promise<void> {
		const currentRetries = this.retryTracker.get(downloadId) || 0;
		const retryCount = currentRetries + 1;

		// Extraer información de retryable del error si está disponible
		const errorObj = error as {
			isRetryable?: boolean;
			code?: string;
			errorCode?: string;
			message?: string;
		};
		const serviceRecommendation = errorObj?.isRetryable;

		// Determinar si es reintentable: usar recomendación del servicio o verificar localmente
		const isNonRetryableError =
			serviceRecommendation === false || this.isNonRetryableError(error);

		if (isNonRetryableError || retryCount >= this.config.maxRetries) {
			// Non-retryable error or retry limit reached - mark as failed immediately
			this.retryTracker.delete(downloadId);
			await this.updateDownloadState(downloadId, DownloadStates.FAILED);

			// DEBUG: Verify state was updated
			const updatedItem = this.downloadQueue.get(downloadId);
			console.log(`[QueueManager] 🔴 After updateDownloadState FAILED:`, {
				downloadId,
				newState: updatedItem?.state,
				expectedState: DownloadStates.FAILED,
				stateMatches: updatedItem?.state === DownloadStates.FAILED,
			});

			// CRITICAL: Emit FAILED event so UI can update
			this.currentLogger.error(
				TAG,
				`Download failed permanently: ${item.title || downloadId}`,
				{
					isNonRetryableError,
					retryCount,
					maxRetries: this.config.maxRetries,
					errorCode: errorObj?.code || errorObj?.errorCode,
				}
			);

			this.eventEmitter.emit(DownloadEventType.FAILED, {
				downloadId,
				item: updatedItem || item, // Use updated item with FAILED state
				error,
			});
		} else {
			// Actualizar contador de reintentos
			this.retryTracker.set(downloadId, retryCount);

			// Calcular delay con backoff exponencial
			const baseDelay = this.config.retryDelayMs || 2000;
			const delay = Math.min(
				baseDelay * Math.pow(2, retryCount - 1), // Backoff exponencial
				60000 // Máximo 60 segundos
			);

			this.currentLogger.info(
				TAG,
				`Download failed, scheduling retry ${retryCount}/${this.config.maxRetries} in ${delay}ms: ${item.title || downloadId}`
			);

			// Programar reintento con backoff exponencial
			setTimeout(async () => {
				await this.updateDownloadState(downloadId, DownloadStates.QUEUED);
				this.currentLogger.info(
					TAG,
					`Retrying download (${retryCount}/${this.config.maxRetries}): ${item.title || downloadId}`
				);
				// Forzar procesamiento de la cola
				this.processQueue();
			}, delay);
		}
	}

	/**
	 * Check if an error is non-retryable (should fail immediately without retries)
	 */
	private isNonRetryableError(error: unknown): boolean {
		if (!error) {
			return false;
		}

		const errorObj = error as { code?: string; errorCode?: string; message?: string };
		const errorCode = errorObj?.code || errorObj?.errorCode || "";
		// Handle both string errors and object errors with message property
		const errorMessage = typeof error === "string" ? error : errorObj?.message || "";

		// DEBUG: Log error analysis
		console.log("[QueueManager] 🔍 isNonRetryableError analyzing:", {
			errorType: typeof error,
			errorCode,
			errorMessage: errorMessage.substring(0, 100),
		});

		// NO_SPACE_LEFT errors should not be retried
		if (errorCode === "NO_SPACE_LEFT" || errorCode === "DOWNLOAD_NO_SPACE") {
			console.log("[QueueManager] 🔍 Detected NO_SPACE error - non-retryable");
			return true;
		}

		// Check message for space-related errors and HTTP client errors (4xx)
		const lowerMessage = errorMessage.toLowerCase();
		if (
			lowerMessage.includes("no space left") ||
			lowerMessage.includes("no hay espacio") ||
			lowerMessage.includes("insufficient storage") ||
			lowerMessage.includes("disk full")
		) {
			console.log("[QueueManager] 🔍 Detected space error - non-retryable");
			return true;
		}

		// HTTP 4xx client errors should not be retried (resource doesn't exist, unauthorized, etc.)
		if (
			lowerMessage.includes("http 404") ||
			lowerMessage.includes("404") ||
			lowerMessage.includes("http 401") ||
			lowerMessage.includes("http 403") ||
			lowerMessage.includes("file not found") ||
			lowerMessage.includes("not found") ||
			lowerMessage.includes("unauthorized") ||
			lowerMessage.includes("forbidden")
		) {
			console.log("[QueueManager] 🔍 Detected HTTP 4xx error - non-retryable");
			return true;
		}

		// Asset validation errors should not be retried (the asset is corrupted or incomplete)
		if (
			lowerMessage.includes("no playable tracks") ||
			lowerMessage.includes("asset validation failed") ||
			lowerMessage.includes("asset directory") ||
			lowerMessage.includes("asset size too small")
		) {
			console.log("[QueueManager] 🔍 Detected asset validation error - non-retryable");
			return true;
		}

		console.log("[QueueManager] 🔍 Error is retryable");
		return false;
	}

	/*
	 * Sistema de locks para operaciones de eliminación
	 * Previene race conditions cuando se elimina una descarga en progreso
	 *
	 */

	private acquireLock(downloadId: string, operation: "removing" | "updating"): boolean {
		if (this.pendingOperations.has(downloadId)) {
			this.currentLogger.debug(
				TAG,
				`Lock denied for ${downloadId}: ${this.pendingOperations.get(downloadId)} in progress`
			);
			return false;
		}

		this.pendingOperations.set(downloadId, operation);

		// Timeout de seguridad: liberar lock después de 30 segundos
		const timeout = setTimeout(() => {
			this.currentLogger.warn(TAG, `Lock timeout for ${downloadId}`);
			this.releaseLock(downloadId);
		}, 30000);

		this.lockTimeouts.set(downloadId, timeout);

		return true;
	}

	private releaseLock(downloadId: string): void {
		this.pendingOperations.delete(downloadId);

		const timeout = this.lockTimeouts.get(downloadId);
		if (timeout) {
			clearTimeout(timeout);
			this.lockTimeouts.delete(downloadId);
		}
	}

	private isBeingRemoved(downloadId: string): boolean {
		return this.pendingOperations.get(downloadId) === "removing";
	}

	/*
	 * Actualiza el estado de una descarga
	 *
	 */

	private async updateDownloadState(
		downloadId: string,
		state: DownloadStates,
		fileUri?: string,
		fileSize?: number
	): Promise<void> {
		const item = this.downloadQueue.get(downloadId);
		if (item) {
			const previousState = item.state;

			// Recargar desde persistencia para obtener cambios hechos por otros servicios
			// (ej: subtítulos descargados por StreamDownloadService)
			const persistedDownloads = await persistenceService.loadDownloadState();
			const persistedItem = persistedDownloads.get(downloadId);

			// Merge: usar item persistido como base, actualizar con cambios locales
			const mergedItem = persistedItem ? { ...persistedItem } : { ...item };
			mergedItem.state = state;

			if (fileUri) {
				mergedItem.fileUri = fileUri;
			}

			// Establecer timestamps según el estado
			if (
				state === DownloadStates.DOWNLOADING &&
				previousState !== DownloadStates.DOWNLOADING
			) {
				// Iniciar descarga - establecer startedAt si no existe
				if (!mergedItem.stats.startedAt) {
					mergedItem.stats.startedAt = Date.now();
				}
			} else if (state === DownloadStates.COMPLETED) {
				mergedItem.stats.downloadedAt = Date.now();
				// Ensure stats reflect 100% completion
				mergedItem.stats.progressPercent = 100;
				if (fileSize && fileSize > 0) {
					mergedItem.stats.totalBytes = fileSize;
					mergedItem.stats.bytesDownloaded = fileSize;
				} else if (mergedItem.stats.totalBytes > 0) {
					mergedItem.stats.bytesDownloaded = mergedItem.stats.totalBytes;
				}
			}

			this.downloadQueue.set(downloadId, mergedItem);

			// Persistir cambios usando PersistenceService
			await persistenceService.saveDownloadState(this.downloadQueue);
		}
	}

	/*
	 * Actualiza el progreso de una descarga
	 *
	 */

	public async updateDownloadProgress(
		downloadId: string,
		progress: number,
		bytesWritten?: number,
		totalBytes?: number
	): Promise<void> {
		const item = this.downloadQueue.get(downloadId);
		if (item) {
			item.stats.progressPercent = Math.max(0, Math.min(100, progress));

			// Actualizar bytes descargados y totales si están disponibles
			if (bytesWritten !== undefined) {
				item.stats.bytesDownloaded = bytesWritten;
			}
			if (totalBytes !== undefined) {
				item.stats.totalBytes = totalBytes;
			}

			// Calcular velocidad de descarga usando ventana deslizante
			if (bytesWritten !== undefined) {
				speedCalculator.addSample(downloadId, bytesWritten);
				item.stats.downloadSpeed = speedCalculator.getSpeed(downloadId);

				// Calcular tiempo restante estimado
				if (totalBytes !== undefined && totalBytes > 0) {
					item.stats.remainingTime = speedCalculator.getEstimatedTimeRemaining(
						downloadId,
						totalBytes,
						bytesWritten
					);
				}
			}

			this.downloadQueue.set(downloadId, item);

			// Solo persistir en cambios importantes de progreso (cada 10%)
			if (progress % 10 === 0) {
				await persistenceService.saveDownloadState(this.downloadQueue);
			}
		}
	}

	/*
	 * API Pública - Consulta de información
	 *
	 */

	public getDownloadType(downloadId: string): DownloadType | undefined {
		const item = this.downloadQueue.get(downloadId);
		return item?.type;
	}

	public getStats(): QueueStats {
		const downloads = this.getAllDownloads();

		// Filtros según estados definidos en la arquitectura
		const pending = downloads.filter(d => d.state === DownloadStates.QUEUED).length;
		const downloading = downloads.filter(d => d.state === DownloadStates.DOWNLOADING).length;
		const paused = downloads.filter(d => d.state === DownloadStates.PAUSED).length;
		const completed = downloads.filter(d => d.state === DownloadStates.COMPLETED).length;
		const failed = downloads.filter(d => d.state === DownloadStates.FAILED).length;

		// Cálculos de bytes
		const totalBytesDownloaded = downloads.reduce(
			(sum, d) => sum + (d.stats?.bytesDownloaded || 0),
			0
		);
		const totalBytesRemaining = downloads.reduce(
			(sum, d) =>
				sum + Math.max(0, (d.stats?.totalBytes || 0) - (d.stats?.bytesDownloaded || 0)),
			0
		);

		// Cálculo de velocidad promedio (downloads activos)
		const activeDownloads = downloads.filter(d => d.state === DownloadStates.DOWNLOADING);
		const averageSpeed =
			activeDownloads.length > 0
				? activeDownloads.reduce((sum, d) => sum + (d.stats?.downloadSpeed || 0), 0) /
					activeDownloads.length
				: 0;

		// Cálculo de tiempo estimado restante
		const estimatedTimeRemaining =
			averageSpeed > 0 && totalBytesRemaining > 0
				? Math.round(totalBytesRemaining / averageSpeed)
				: 0;

		return {
			// Campos principales requeridos
			total: downloads.length,
			pending,
			downloading,
			paused,
			completed,
			failed,
			isPaused: this.isPaused,
			isProcessing: this.isProcessing,

			// Campos opcionales (aliases para compatibilidad)
			active: downloading, // Alias de downloading
			queued: pending, // Alias de pending

			// Estadísticas de bytes y performance
			totalBytesDownloaded,
			totalBytesRemaining,
			averageSpeed,
			estimatedTimeRemaining,
		};
	}

	/*
	 * Carga la cola persistida usando PersistenceService
	 *
	 */

	private async loadPersistedQueue(): Promise<void> {
		try {
			this.currentLogger.debug(TAG, "Loading persisted download queue");

			// Cargar usando PersistenceService
			const persistedDownloads = await persistenceService.loadDownloadState();
			this.downloadQueue = persistedDownloads;

			// Resetear descargas que estaban en progreso
			for (const [id, item] of this.downloadQueue) {
				if (item.state === DownloadStates.DOWNLOADING) {
					item.state = DownloadStates.QUEUED;
					this.downloadQueue.set(id, item);
				}
			}

			if (this.downloadQueue.size > 0) {
				await persistenceService.saveDownloadState(this.downloadQueue);
			}
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to load persisted queue: ${error}`);
		}
	}

	/*
	 * Sincroniza el estado del QueueManager con el estado del módulo nativo
	 * Esto es crítico después de reanudar descargas existentes
	 *
	 */

	private async syncWithNativeState(): Promise<void> {
		try {
			this.currentLogger.info(TAG, "Syncing queue state with native module");

			// Obtener todas las descargas del módulo nativo
			const nativeDownloads = await nativeManager.getDownloads();

			if (!nativeDownloads || nativeDownloads.length === 0) {
				this.currentLogger.debug(TAG, "No native downloads found during sync");
				// CRÍTICO: Limpiar descargas huérfanas que están en DOWNLOADING pero no existen en nativo
				// Esto ocurre cuando la app se reinicia y las descargas nativas se pierden
				await this.cleanupOrphanedDownloads();
				return;
			}

			// Sincronizar estado para cada descarga
			let syncedCount = 0;
			for (const nativeDownload of nativeDownloads) {
				if (!nativeDownload.id) {
					continue;
				}

				const localItem = this.downloadQueue.get(nativeDownload.id);
				if (localItem && localItem.state !== nativeDownload.state) {
					this.currentLogger.info(
						TAG,
						`Syncing state for ${nativeDownload.id}: ${localItem.state} -> ${nativeDownload.state}`
					);

					// Actualizar estado local con estado nativo
					localItem.state = nativeDownload.state as DownloadStates;

					// Si está descargando en nativo, marcarlo como tal localmente
					if (nativeDownload.state === "DOWNLOADING") {
						this.currentlyDownloading.add(nativeDownload.id);
					} else {
						this.currentlyDownloading.delete(nativeDownload.id);
					}

					this.downloadQueue.set(nativeDownload.id, localItem);
					syncedCount++;
				}
			}

			// Persistir cambios si hubo sincronizaciones
			if (syncedCount > 0) {
				await persistenceService.saveDownloadState(this.downloadQueue);
				this.currentLogger.info(TAG, `Synced ${syncedCount} downloads with native state`);
			} else {
				this.currentLogger.debug(TAG, "All download states already in sync");
			}
		} catch (error: unknown) {
			this.currentLogger.error(TAG, "Failed to sync with native state", error);
			// No lanzar error - esto es una operación de sincronización que no debe fallar
		}
	}

	/*
	 * Limpia descargas huérfanas que quedaron en estado DOWNLOADING pero no existen en el módulo nativo
	 * Esto ocurre cuando la app se reinicia con Metro y las descargas nativas se pierden
	 *
	 */

	private async cleanupOrphanedDownloads(): Promise<void> {
		// Skip orphan cleanup when globally paused - downloads in DOWNLOADING state
		// are expected during pause transition and should not be reset to QUEUED
		if (this.isPaused) {
			this.currentLogger.debug(TAG, "Skipping orphan cleanup while paused");
			return;
		}

		try {
			let cleanedCount = 0;
			const orphanedIds: string[] = [];

			// Buscar descargas que están marcadas como DOWNLOADING pero no existen en nativo
			for (const [downloadId, item] of this.downloadQueue.entries()) {
				if (
					item.state === DownloadStates.DOWNLOADING ||
					item.state === DownloadStates.PREPARING
				) {
					orphanedIds.push(downloadId);
				}
			}

			if (orphanedIds.length === 0) {
				return;
			}

			this.currentLogger.warn(
				TAG,
				`Found ${orphanedIds.length} orphaned downloads, resetting to QUEUED state`
			);

			// Resetear estado de descargas huérfanas a QUEUED para que puedan reiniciarse
			for (const downloadId of orphanedIds) {
				const item = this.downloadQueue.get(downloadId);
				if (item) {
					item.state = DownloadStates.QUEUED;
					// Resetear progreso si existe la propiedad
					if ("progress" in item) {
						(item as { progress: number }).progress = 0;
					}
					this.downloadQueue.set(downloadId, item);
					this.currentlyDownloading.delete(downloadId);
					cleanedCount++;

					this.currentLogger.debug(
						TAG,
						`Reset orphaned download to QUEUED: ${downloadId}`
					);
				}
			}

			// Persistir cambios
			if (cleanedCount > 0) {
				await persistenceService.saveDownloadState(this.downloadQueue);
				this.currentLogger.info(
					TAG,
					`Cleaned up ${cleanedCount} orphaned downloads, reset to QUEUED`
				);

				// Emitir evento genérico para actualizar UI
				this.eventEmitter.emit("orphaned_downloads_cleaned", {
					cleanedCount,
					orphanedIds,
				});
			}
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to cleanup orphaned downloads", error);
		}
	}

	/*
	 * Método público para forzar limpieza de descargas huérfanas
	 * Útil para debugging o cuando el usuario quiere resetear el estado
	 *
	 */

	public async forceCleanupOrphanedDownloads(): Promise<number> {
		await this.cleanupOrphanedDownloads();
		// Retornar número de descargas en estado DOWNLOADING después de la limpieza
		return this.currentlyDownloading.size;
	}

	/*
	 * Handlers para eventos nativos
	 *
	 */

	// Track last progress event times to avoid spam
	private lastProgressEventTime: Map<string, number> = new Map();

	private async handleNativeProgressEvent(data: unknown): Promise<void> {
		// Ignore progress events when globally paused - native module may still
		// send lingering events after stopDownloadProcessing(), including events
		// with progress=0 that would incorrectly reset the displayed progress
		if (this.isPaused) {
			return;
		}

		const eventData = data as {
			downloadId: string;
			percent: number;
			speed?: number;
			remainingTime?: number;
			bytesDownloaded?: number;
			totalBytes?: number;
			[key: string]: unknown;
		};
		const { downloadId, percent } = eventData;

		if (this.downloadQueue.has(downloadId)) {
			// Ignorar eventos si la descarga está siendo eliminada
			if (this.isBeingRemoved(downloadId)) {
				return;
			}

			// FILTRAR eventos innecesarios para evitar ruido
			const item = this.downloadQueue.get(downloadId);

			// No procesar si la descarga no está realmente activa
			if (!item || item.state !== DownloadStates.DOWNLOADING) {
				// FASE 1 FIX: Si recibimos progreso pero el estado no es DOWNLOADING, actualizarlo
				// Solo promover a DOWNLOADING desde QUEUED o PREPARING (estados de espera)
				// NUNCA desde PAUSED, STOPPED, COMPLETED o FAILED (estados explícitos del usuario o finales)
				if (
					item &&
					percent > 0 &&
					(item.state === DownloadStates.QUEUED ||
						item.state === DownloadStates.PREPARING)
				) {
					item.state = DownloadStates.DOWNLOADING;
					this.downloadQueue.set(downloadId, item);
				} else {
					return;
				}
			}

			// No procesar eventos "estáticos" (sin velocidad y sin cambios)
			if (eventData.speed === 0 && !item.stats.startedAt) {
				// Filtrar sin loguear para evitar spam
				return;
			}

			// No procesar si el progreso no ha cambiado significativamente
			// EXCEPCIÓN: Siempre procesar si es el primer evento (currentPercent === 0) o si percent > 0
			// Esto evita que descargas HLS se queden en 0% cuando la velocidad aún no se ha establecido
			const currentPercent = item.stats.progressPercent || 0;
			const isFirstProgressEvent = currentPercent === 0 && percent > 0;
			if (
				Math.abs(percent - currentPercent) < 1 &&
				eventData.speed === 0 &&
				!isFirstProgressEvent
			) {
				// Filtrar sin loguear para evitar spam
				return;
			}

			// FILTRO TEMPORAL: Evitar procesar eventos muy frecuentes (menos de 1 segundo de diferencia)
			const now = Date.now();
			const lastEventTime = this.lastProgressEventTime.get(downloadId) || 0;
			const timeSinceLastEvent = now - lastEventTime;

			// Solo procesar si han pasado al menos 1 segundo o hay cambio significativo de progreso/velocidad
			// NOTA: Reducido de 5% a 1% para evitar que eventos iniciales de HLS se filtren
			// cuando la velocidad aún no se ha establecido (speed=0)
			const significantChange =
				Math.abs(percent - currentPercent) >= 1 || (eventData.speed ?? 0) > 0;
			if (timeSinceLastEvent < 1000 && !significantChange) {
				// Filtrar sin loguear para evitar spam
				return;
			}

			// Actualizar tiempo del último evento procesado
			this.lastProgressEventTime.set(downloadId, now);
			// Actualizar progreso en el item de la cola (solo acepta 2 argumentos)
			await this.updateDownloadProgress(downloadId, percent);

			// También actualizar bytes y otros datos si están disponibles
			if (item && item.stats) {
				// Actualizar velocidad
				if (eventData.speed !== undefined) {
					item.stats.downloadSpeed = eventData.speed;
				}

				// Actualizar tiempo restante
				if (eventData.remainingTime !== undefined) {
					item.stats.remainingTime = eventData.remainingTime;
				}

				// Actualizar bytes descargados si viene del evento nativo
				if (eventData.bytesDownloaded !== undefined && eventData.bytesDownloaded > 0) {
					item.stats.bytesDownloaded = eventData.bytesDownloaded;
				}

				// Actualizar total bytes si viene del evento nativo
				// IMPORTANTE: Para streams adaptativos (DASH/HLS), el totalBytes puede variar
				// según la calidad de los segmentos descargados. Para evitar que el progreso
				// retroceda, solo actualizamos si:
				// 1. No tenemos un valor previo (primera vez)
				// 2. El nuevo valor es significativamente mayor (>5% diferencia)
				if (eventData.totalBytes !== undefined && eventData.totalBytes > 0) {
					const currentTotal = item.stats.totalBytes || 0;

					if (currentTotal === 0) {
						// Primera vez, establecer el valor
						item.stats.totalBytes = eventData.totalBytes;
					} else {
						// Solo actualizar si el nuevo valor es significativamente mayor
						const percentDiff =
							((eventData.totalBytes - currentTotal) / currentTotal) * 100;
						if (percentDiff > 5) {
							// El nuevo total es >5% mayor, actualizar
							item.stats.totalBytes = eventData.totalBytes;
							this.currentLogger.debug(
								TAG,
								`Updated totalBytes for ${downloadId}: ${currentTotal} → ${eventData.totalBytes} (+${percentDiff.toFixed(1)}%)`
							);
						}
						// Si es menor o similar, mantener el valor actual para estabilidad
					}
				}

				// CALCULAR bytes si no vienen del nativo (usando speed y tiempo transcurrido)
				if (
					!eventData.bytesDownloaded &&
					item.stats.startedAt &&
					(eventData.speed ?? 0) > 0
				) {
					const elapsedSeconds = (Date.now() - item.stats.startedAt) / 1000;
					const estimatedBytes = Math.floor((eventData.speed ?? 0) * elapsedSeconds);
					if (estimatedBytes > item.stats.bytesDownloaded) {
						item.stats.bytesDownloaded = estimatedBytes;
					}
				}

				// CALCULAR totalBytes si no viene del nativo (usando progress y bytesDownloaded)
				if (item.stats.totalBytes <= 0 && percent > 0 && item.stats.bytesDownloaded > 0) {
					item.stats.totalBytes = Math.floor(
						item.stats.bytesDownloaded / (percent / 100)
					);
				}

				// CALCULAR remainingTime si es 0 o no viene del nativo
				if (
					(!eventData.remainingTime || eventData.remainingTime === 0) &&
					(eventData.speed ?? 0) > 0 &&
					item.stats.totalBytes > 0 &&
					item.stats.bytesDownloaded > 0
				) {
					const remainingBytes = item.stats.totalBytes - item.stats.bytesDownloaded;
					item.stats.remainingTime = Math.floor(remainingBytes / (eventData.speed ?? 1));
				}

				// Guardar el item actualizado de vuelta en el Map
				this.downloadQueue.set(downloadId, item);
			}

			// Re-emitir evento para que los hooks lo reciban (usar valores calculados)
			const updatedItem = this.downloadQueue.get(downloadId);
			const stats = updatedItem?.stats;

			const progressData = {
				downloadId,
				percent: Math.floor(percent),
				item: updatedItem,
				bytesDownloaded: stats?.bytesDownloaded || 0,
				totalBytes: stats?.totalBytes || 0,
				speed: stats?.downloadSpeed || 0,
				remainingTime: stats?.remainingTime || 0,
			};

			// Log para debug de los valores calculados
			this.currentLogger.debug(TAG, `Progress event data for ${downloadId}:`, {
				percent: progressData.percent,
				bytesDownloaded: progressData.bytesDownloaded,
				totalBytes: progressData.totalBytes,
				speed: progressData.speed,
				remainingTime: progressData.remainingTime,
				startedAt: stats?.startedAt,
			});

			this.eventEmitter.emit(DownloadEventType.PROGRESS, progressData);
		}
	}

	private async handleNativeStateEvent(data: unknown): Promise<void> {
		const eventData = data as { downloadId: string; state: string; [key: string]: unknown };
		const { downloadId, state } = eventData;

		this.currentLogger.debug(TAG, `Handling native state event: ${downloadId} → ${state}`);

		if (this.downloadQueue.has(downloadId)) {
			// Convertir estado nativo a estado interno si es necesario
			const mappedState = this.mapNativeStateToInternal(state);
			const previousState = this.downloadQueue.get(downloadId)?.state;

			await this.updateDownloadState(downloadId, mappedState);

			// Re-emitir evento específico según el estado
			const item = this.downloadQueue.get(downloadId);
			if (item) {
				switch (mappedState) {
					case DownloadStates.COMPLETED:
						this.currentlyDownloading.delete(downloadId);
						this.eventEmitter.emit(DownloadEventType.COMPLETED, {
							downloadId,
							item,
						});
						// Limpiar tracking de eventos para esta descarga
						this.lastProgressEventTime.delete(downloadId);
						break;
					case DownloadStates.FAILED:
						this.currentlyDownloading.delete(downloadId);
						this.eventEmitter.emit(DownloadEventType.FAILED, {
							downloadId,
							item,
							error: eventData.error || null,
						});
						// Limpiar tracking de eventos para esta descarga
						this.lastProgressEventTime.delete(downloadId);
						break;
					case DownloadStates.PAUSED:
						this.currentlyDownloading.delete(downloadId);
						this.eventEmitter.emit(DownloadEventType.PAUSED, {
							downloadId,
							item,
						});
						break;
					case DownloadStates.DOWNLOADING:
						this.eventEmitter.emit(DownloadEventType.STARTED, {
							downloadId,
							item,
						});
						break;
					default:
						// Para otros estados, emitir un evento genérico de cambio
						this.eventEmitter.emit("state_changed", {
							downloadId,
							item,
							previousState,
							newState: mappedState,
						});
				}

				this.currentLogger.debug(
					TAG,
					`Re-emitted event for state change: ${downloadId} ${previousState} → ${mappedState}`
				);

				// Si se liberó un slot de concurrencia, re-procesar la cola
				if (
					mappedState === DownloadStates.COMPLETED ||
					mappedState === DownloadStates.FAILED ||
					mappedState === DownloadStates.PAUSED
				) {
					if (!this.isProcessing && !this.isPaused) {
						this.startProcessing();
					} else {
						this.processQueue();
					}
				}
			}
		} else {
			this.currentLogger.warn(
				TAG,
				`Received state change for unknown download: ${downloadId}`
			);
		}
	}

	private async handleNativeCompletedEvent(data: unknown): Promise<void> {
		const eventData = data as {
			downloadId: string;
			fileUri?: string;
			fileSize?: number;
			path?: string;
			[key: string]: unknown;
		};
		const { downloadId } = eventData;

		if (this.downloadQueue.has(downloadId)) {
			await this.notifyDownloadCompleted(
				downloadId,
				eventData.fileUri || eventData.path,
				eventData.fileSize
			);
		}
	}

	/**
	 * Maneja eventos de error nativos (streams HLS/DASH)
	 * FASE 2: Ahora que DownloadService ya no re-emite eventos, recibimos errores directamente de NativeManager
	 */
	private async handleNativeErrorEvent(data: unknown): Promise<void> {
		const eventData = data as {
			downloadId?: string;
			id?: string;
			error?: { code?: string; message?: string } | string;
			errorCode?: string;
			errorMessage?: string;
		};

		const downloadId = eventData.downloadId || eventData.id;
		if (!downloadId) {
			this.currentLogger.warn(TAG, "Received error event without downloadId", eventData);
			return;
		}

		const item = this.downloadQueue.get(downloadId);
		if (!item) {
			this.currentLogger.debug(TAG, `Error event for unknown download: ${downloadId}`);
			return;
		}

		// Extraer código y mensaje de error
		let errorCode = "UNKNOWN";
		let errorMessage = "Download failed";

		if (typeof eventData.error === "object" && eventData.error) {
			errorCode = eventData.error.code || eventData.errorCode || "UNKNOWN";
			errorMessage = eventData.error.message || eventData.errorMessage || "Download failed";
		} else if (typeof eventData.error === "string") {
			errorMessage = eventData.error;
			errorCode = eventData.errorCode || "UNKNOWN";
		} else {
			errorCode = eventData.errorCode || "UNKNOWN";
			errorMessage = eventData.errorMessage || "Download failed";
		}

		this.currentLogger.error(
			TAG,
			`Native error for ${downloadId}: ${errorCode} - ${errorMessage}`
		);

		await this.handleDownloadFailure(downloadId, item, {
			code: errorCode,
			message: errorMessage,
			timestamp: Date.now(),
		});
	}

	private mapNativeStateToInternal(nativeState: string): DownloadStates {
		// Mapear estados nativos a estados internos
		switch (nativeState.toUpperCase()) {
			case "DOWNLOADING":
			case "ACTIVE":
				return DownloadStates.DOWNLOADING;
			case "QUEUED":
			case "PENDING":
				return DownloadStates.QUEUED;
			case "PAUSED":
			case "STOPPED":
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
	 * Limpia recursos al destruir
	 *
	 */

	public destroy(): void {
		this.stopProcessing();
		this.eventEmitter.removeAllListeners();
		this.downloadQueue.clear();
		this.currentlyDownloading.clear();
		this.retryTracker.clear();
		this.isInitialized = false;
		this.currentLogger.info(TAG, "QueueManager destroyed");
	}
}

// Exportar instancia singleton
export const queueManager = QueueManager.getInstance();
