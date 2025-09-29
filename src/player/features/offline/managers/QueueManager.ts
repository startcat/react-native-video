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
						this.currentLogger.info(TAG, `File deleted from disk: ${item.fileUri}`);
					} catch (error) {
						this.currentLogger.warn(
							TAG,
							`Failed to delete file: ${item.fileUri}`,
							error
						);
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
			this.currentLogger.error(TAG, "Failed to sync with native state after resumeAll", error);
		});
		
		// Forzar procesamiento inmediato del queue después de reanudar
		// Esto es necesario cuando hay descargas existentes que fueron reanudadas
		// en el módulo nativo y necesitan ser procesadas inmediatamente
		if (this.isProcessing && !this.isPaused) {
			this.currentLogger.info(TAG, "Forcing immediate queue processing after resumeAll");
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

		return {
			total: this.downloadQueue.size,
			pending,
			downloading,
			paused,
			completed,
			failed,
			isPaused: this.isPaused,
			isProcessing: this.isProcessing,
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
		if (this.currentlyDownloading.size >= this.config.maxConcurrentDownloads) {
			this.currentLogger.debug(
				TAG,
				`Max concurrent downloads reached (${this.config.maxConcurrentDownloads}), keeping items in queue`
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

		// Procesar siguiente item en cola
		this.processQueue();
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

		// Procesar siguiente item en cola
		this.processQueue();
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

		// Procesar siguiente item en cola
		this.processQueue();
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
			item.state = state;
			if (fileUri) {
				item.fileUri = fileUri;
			}
			if (state === DownloadStates.COMPLETED) {
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
					if (nativeDownload.state === 'DOWNLOADING') {
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
