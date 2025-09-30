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

const TAG = LOG_TAGS.QUEUE_MANAGER;

export class QueueManager {
	private static instance: QueueManager;
	private eventEmitter: EventEmitter;
	private downloadQueue: Map<string, DownloadItem> = new Map();
	private isProcessing: boolean = false;
	private isPaused: boolean = false;
	private isInitialized: boolean = false;
	private config: QueueManagerConfig;
	private processingInterval: ReturnType<typeof setTimeout> | null = null;
	private currentlyDownloading: Set<string> = new Set();
	private retryTracker: Map<string, number> = new Map();
	private currentLogger: Logger;

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
		nativeManager.subscribe("download_progress", (data: any) => {
			this.handleNativeProgressEvent(data).catch(error => {
				this.currentLogger.error(TAG, "Failed to handle native progress event", error);
			});
		});

		// Suscribirse a eventos de estado del NativeManager
		nativeManager.subscribe("download_state_changed", (data: any) => {
			this.handleNativeStateEvent(data).catch(error => {
				this.currentLogger.error(TAG, "Failed to handle native state event", error);
			});
		});

		// Suscribirse a eventos de completado del NativeManager
		nativeManager.subscribe("download_completed", (data: any) => {
			this.handleNativeCompletedEvent(data).catch(error => {
				this.currentLogger.error(TAG, "Failed to handle native completed event", error);
			});
		});

		// Suscribirse a eventos de error del NativeManager
		nativeManager.subscribe("download_error", (data: any) => {
			this.handleNativeErrorEvent(data).catch(error => {
				this.currentLogger.error(TAG, "Failed to handle native error event", error);
			});
		});

		this.currentLogger.debug(TAG, "Native event listeners configured");
	}

	/*
	 * Inicializa el servicio de cola de descargas
	 *
	 */

	public async initialize(config?: Partial<QueueManagerConfig>): Promise<void> {
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
			if (!this.isProcessing && !this.isPaused) {
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

				// Guardar estado original antes de cambiar a REMOVING
				const originalState = item.state;

				// Si se está descargando, detenerla
				if (this.currentlyDownloading.has(downloadId)) {
					this.currentlyDownloading.delete(downloadId);
				}

				// Eliminar archivos del disco
				// Para descargas COMPLETADAS: eliminar archivo final usando fileUri
				if (item.fileUri) {
					try {
						await storageService.deleteFile(item.fileUri);
						this.currentLogger.info(
							TAG,
							`Completed download file deleted from disk: ${item.fileUri}`
						);
					} catch (error) {
						this.currentLogger.warn(
							TAG,
							`Failed to delete completed download file: ${item.fileUri}`,
							error
						);
					}
				}

				// Para descargas INCOMPLETAS o EN PROGRESO: eliminar archivos temporales vía módulo nativo
				// El módulo nativo (ExoPlayer/AVPlayer) gestiona sus propios archivos temporales
				// y debe limpiarlos cuando se cancela la descarga
				if (
					originalState !== DownloadStates.COMPLETED &&
					item.type === DownloadType.STREAM
				) {
					try {
						// El módulo nativo ya debería haber limpiado archivos temporales en cancelDownload,
						// pero lo llamamos explícitamente para asegurarnos
						await nativeManager.removeDownload(downloadId);
						this.currentLogger.info(
							TAG,
							`Temporary files cleaned via native manager: ${downloadId}`
						);
					} catch (error) {
						this.currentLogger.warn(
							TAG,
							`Failed to clean temporary files via native manager: ${downloadId}`,
							error
						);
					}
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
				throw new PlayerError("DOWNLOAD_QUEUE_ITEM_NOT_FOUND", { downloadId });
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

		// Forzar procesamiento inmediato del queue después de reanudar
		// Esto es necesario cuando hay descargas existentes que fueron reanudadas
		// en el módulo nativo y necesitan ser procesadas inmediatamente
		if (this.isProcessing && !this.isPaused) {
			this.currentLogger.debug(TAG, "Forcing immediate queue processing after resumeAll");
			this.processQueue().catch(error => {
				this.currentLogger.error(TAG, "Failed to process queue after resumeAll", error);
			});
		}
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
	 *
	 */

	private async clearByState(states: DownloadStates[]): Promise<void> {
		try {
			const beforeCount = this.downloadQueue.size;
			const idsToRemove: string[] = [];

			for (const [id, item] of this.downloadQueue) {
				if (states.includes(item.state)) {
					idsToRemove.push(id);
				}
			}

			idsToRemove.forEach(id => this.downloadQueue.delete(id));

			const removed = beforeCount - this.downloadQueue.size;

			if (removed > 0) {
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
			}
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
		// Verificar límite de descargas concurrentes
		// IMPORTANTE: Solo contar descargas activas (DOWNLOADING o PAUSED), no COMPLETED ni FAILED
		const activeDownloads = Array.from(this.downloadQueue.values()).filter(
			item =>
				item.state === DownloadStates.DOWNLOADING || item.state === DownloadStates.PAUSED
		).length;

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

		// Solo loggear cuando hay trabajo real que procesar
		this.currentLogger.debug(
			TAG,
			`processQueue - Active: ${activeDownloads}, Queued: ${queuedDownloads}, Max: ${this.config.maxConcurrentDownloads}`
		);

		if (activeDownloads >= this.config.maxConcurrentDownloads) {
			this.currentLogger.debug(
				TAG,
				`Max concurrent downloads reached (${activeDownloads}/${this.config.maxConcurrentDownloads}), keeping items in queue`
			);
			return;
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
				this.currentLogger.debug(TAG, `Network conditions not suitable for download`);
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
				task = {
					id: item.id,
					url: item.uri,
					destination: `/downloads/binary/${item.id}`,
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

			// DELEGAR AL DOWNLOADS MANAGER: Este enviará a la cola destino apropiada
			await downloadsManager.addDownload(task, item.type);

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
		progressPercent: number
	): Promise<void> {
		await this.updateDownloadProgress(downloadId, progressPercent);

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

	public async notifyDownloadCompleted(downloadId: string, fileUri?: string): Promise<void> {
		await this.updateDownloadState(downloadId, DownloadStates.COMPLETED, fileUri);

		// Remover de descargas activas
		this.currentlyDownloading.delete(downloadId);

		const item = this.downloadQueue.get(downloadId);
		if (item) {
			this.eventEmitter.emit(DownloadEventType.COMPLETED, {
				downloadId,
				item: { ...item, fileUri },
			});

			this.currentLogger.info(TAG, `Download completed: ${item.title}`);
		}

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

	public async notifyDownloadFailed(downloadId: string, error: any): Promise<void> {
		const item = this.downloadQueue.get(downloadId);
		if (item) {
			await this.handleDownloadFailure(downloadId, item, error);
		}

		// Remover de descargas activas
		this.currentlyDownloading.delete(downloadId);

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
	 * MÉTODOS PRIVADOS PARA MANEJO INTERNO
	 *
	 */

	/*
	 * Maneja fallos de descarga
	 *
	 */

	private async handleDownloadFailure(
		downloadId: string,
		item: DownloadItem,
		error: any
	): Promise<void> {
		const currentRetries = this.retryTracker.get(downloadId) || 0;
		const retryCount = currentRetries + 1;

		if (retryCount >= this.config.maxRetries) {
			// Límite de reintentos alcanzado - marcar como fallida
			this.retryTracker.delete(downloadId);
			await this.updateDownloadState(downloadId, DownloadStates.FAILED);

			this.eventEmitter.emit(DownloadEventType.FAILED, {
				downloadId,
				item,
				error,
			});

			this.currentLogger.error(
				TAG,
				`Download failed after ${retryCount} retries: ${item.title || downloadId}`
			);
		} else {
			// Actualizar contador de reintentos
			this.retryTracker.set(downloadId, retryCount);

			// Programar reintento
			setTimeout(async () => {
				await this.updateDownloadState(downloadId, DownloadStates.QUEUED);
				this.currentLogger.info(
					TAG,
					`Retrying download (${retryCount}/${this.config.maxRetries}): ${item.title || downloadId}`
				);
			}, 5000);
		}
	}

	/*
	 * Actualiza el estado de una descarga
	 *
	 */

	private async updateDownloadState(
		downloadId: string,
		state: DownloadStates,
		fileUri?: string
	): Promise<void> {
		const item = this.downloadQueue.get(downloadId);
		if (item) {
			const previousState = item.state;
			item.state = state;

			if (fileUri) {
				item.fileUri = fileUri;
			}

			// Establecer timestamps según el estado
			if (
				state === DownloadStates.DOWNLOADING &&
				previousState !== DownloadStates.DOWNLOADING
			) {
				// Iniciar descarga - establecer startedAt si no existe
				if (!item.stats.startedAt) {
					item.stats.startedAt = Date.now();
				}
			} else if (state === DownloadStates.COMPLETED) {
				item.stats.downloadedAt = Date.now();
			}

			this.downloadQueue.set(downloadId, item);

			// Persistir cambios usando PersistenceService
			await persistenceService.saveDownloadState(this.downloadQueue);
		}
	}

	/*
	 * Actualiza el progreso de una descarga
	 *
	 */

	private async updateDownloadProgress(downloadId: string, progress: number): Promise<void> {
		const item = this.downloadQueue.get(downloadId);
		if (item) {
			item.stats.progressPercent = Math.max(0, Math.min(100, progress));
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
				return;
			}

			// Sincronizar estado para cada descarga
			let syncedCount = 0;
			for (const nativeDownload of nativeDownloads) {
				if (!nativeDownload.id) continue;

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
		} catch (error: any) {
			this.currentLogger.error(TAG, "Failed to sync with native state", error);
			// No lanzar error - esto es una operación de sincronización que no debe fallar
		}
	}

	/*
	 * Limpia recursos al destruir
	 *
	 */

	/*
	 * Handlers para eventos nativos
	 */

	// Track last progress event times to avoid spam
	private lastProgressEventTime: Map<string, number> = new Map();

	private async handleNativeProgressEvent(data: any): Promise<void> {
		const { downloadId, percent } = data;

		if (this.downloadQueue.has(downloadId)) {
			// FILTRAR eventos innecesarios para evitar ruido
			const item = this.downloadQueue.get(downloadId);

			// No procesar si la descarga no está realmente activa
			if (!item || item.state !== DownloadStates.DOWNLOADING) {
				// Solo log ocasional para debugging, no spam
				if (Math.random() < 0.1) {
					// 10% de los eventos
					this.currentLogger.debug(
						TAG,
						`Ignoring progress event for inactive download: ${downloadId} (state: ${item?.state})`
					);
				}
				return;
			}

			// No procesar eventos "estáticos" (sin velocidad y sin cambios)
			if (data.speed === 0 && !item.stats.startedAt) {
				// Solo log ocasional para debugging, no spam
				if (Math.random() < 0.1) {
					// 10% de los eventos
					this.currentLogger.debug(
						TAG,
						`Ignoring static progress event for ${downloadId}: no speed and not started`
					);
				}
				return;
			}

			// No procesar si el progreso no ha cambiado significativamente
			const currentPercent = item.stats.progressPercent || 0;
			if (Math.abs(percent - currentPercent) < 1 && data.speed === 0) {
				// Solo log ocasional para debugging, no spam
				if (Math.random() < 0.1) {
					// 10% de los eventos
					this.currentLogger.debug(
						TAG,
						`Ignoring duplicate progress event for ${downloadId}: ${percent}% (no change)`
					);
				}
				return;
			}

			// FILTRO TEMPORAL: Evitar procesar eventos muy frecuentes (menos de 2 segundos de diferencia)
			const now = Date.now();
			const lastEventTime = this.lastProgressEventTime.get(downloadId) || 0;
			const timeSinceLastEvent = now - lastEventTime;

			// Solo procesar si han pasado al menos 2 segundos o hay cambio significativo de progreso/velocidad
			const significantChange = Math.abs(percent - currentPercent) >= 5 || data.speed > 0;
			if (timeSinceLastEvent < 2000 && !significantChange) {
				// Solo log ocasional para debugging, no spam
				if (Math.random() < 0.05) {
					// 5% de los eventos
					this.currentLogger.debug(
						TAG,
						`Throttling progress event for ${downloadId}: too frequent (${timeSinceLastEvent}ms ago)`
					);
				}
				return;
			}

			// Actualizar tiempo del último evento procesado
			this.lastProgressEventTime.set(downloadId, now);
			// Actualizar progreso en el item de la cola (solo acepta 2 argumentos)
			await this.updateDownloadProgress(downloadId, percent);

			// También actualizar bytes y otros datos si están disponibles
			if (item && item.stats) {
				// Actualizar velocidad
				if (data.speed !== undefined) {
					item.stats.downloadSpeed = data.speed;
				}

				// Actualizar tiempo restante
				if (data.remainingTime !== undefined) {
					item.stats.remainingTime = data.remainingTime;
				}

				// Actualizar bytes descargados si viene del evento nativo
				if (data.bytesDownloaded !== undefined && data.bytesDownloaded > 0) {
					item.stats.bytesDownloaded = data.bytesDownloaded;
				}

				// Actualizar total bytes si viene del evento nativo
				if (data.totalBytes !== undefined && data.totalBytes > 0) {
					item.stats.totalBytes = data.totalBytes;
				}

				// CALCULAR bytes si no vienen del nativo (usando speed y tiempo transcurrido)
				if (!data.bytesDownloaded && item.stats.startedAt && data.speed > 0) {
					const elapsedSeconds = (Date.now() - item.stats.startedAt) / 1000;
					const estimatedBytes = Math.floor(data.speed * elapsedSeconds);
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
					(!data.remainingTime || data.remainingTime === 0) &&
					data.speed > 0 &&
					item.stats.totalBytes > 0 &&
					item.stats.bytesDownloaded > 0
				) {
					const remainingBytes = item.stats.totalBytes - item.stats.bytesDownloaded;
					item.stats.remainingTime = Math.floor(remainingBytes / data.speed);
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

	private async handleNativeStateEvent(data: any): Promise<void> {
		const { downloadId, state } = data;

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
						this.eventEmitter.emit(DownloadEventType.COMPLETED, {
							downloadId,
							item,
						});
						// Limpiar tracking de eventos para esta descarga
						this.lastProgressEventTime.delete(downloadId);
						break;
					case DownloadStates.FAILED:
						this.eventEmitter.emit(DownloadEventType.FAILED, {
							downloadId,
							item,
							error: data.error || null,
						});
						// Limpiar tracking de eventos para esta descarga
						this.lastProgressEventTime.delete(downloadId);
						break;
					case DownloadStates.PAUSED:
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
			}
		} else {
			this.currentLogger.warn(
				TAG,
				`Received state change for unknown download: ${downloadId}`
			);
		}
	}

	private async handleNativeCompletedEvent(data: any): Promise<void> {
		const { downloadId } = data;

		if (this.downloadQueue.has(downloadId)) {
			await this.notifyDownloadCompleted(downloadId, data.fileUri || data.path);
		}
	}

	private async handleNativeErrorEvent(data: any): Promise<void> {
		const { downloadId, error } = data;

		if (this.downloadQueue.has(downloadId)) {
			const playerError = new PlayerError(error.code || "DOWNLOAD_FAILED", {
				originalError: error,
				downloadId,
				message: error.message || "Native download error",
			});
			await this.notifyDownloadFailed(downloadId, playerError);
		}
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
