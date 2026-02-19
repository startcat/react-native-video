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
import { networkService } from "../services/network/NetworkService";
import { persistenceService } from "../services/storage/PersistenceService";
import { storageService } from "../services/storage/StorageService";
import { configManager } from "./ConfigManager";
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
import { DownloadStateStore } from "./queue/DownloadStateStore";
import { NativeEventBridge, NativeProgressData } from "./queue/NativeEventBridge";
import { RetryManager } from "./queue/RetryManager";

const TAG = LOG_TAGS.QUEUE_MANAGER;

export class QueueManager {
	private static instance: QueueManager;
	private eventEmitter: EventEmitter;
	private store: DownloadStateStore;
	private isProcessing: boolean = false;
	private isPaused: boolean = false;
	private isInitialized: boolean = false;
	private initPromise: Promise<void> | null = null;
	private config: QueueManagerConfig;
	private processingInterval: ReturnType<typeof setTimeout> | null = null;
	private currentlyDownloading: Set<string> = new Set();
	private retryManager: RetryManager;
	private eventBridge!: NativeEventBridge;
	private currentLogger: Logger;
	private isProcessingQueue: boolean = false; // Flag para prevenir ejecuciones concurrentes

	private constructor() {
		this.eventEmitter = new EventEmitter();

		this.config = DEFAULT_CONFIG_QUEUE;

		this.currentLogger = new Logger({
			...LOGGER_DEFAULTS,
			enabled: this.config.logEnabled,
			level: this.config.logLevel,
		});

		this.store = new DownloadStateStore(persistenceService, this.currentLogger);

		this.retryManager = new RetryManager(
			{
				maxRetries: this.config.maxRetries,
				retryDelayMs: this.config.retryDelayMs,
				maxDelayMs: 60000,
			},
			this.currentLogger
		);
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

				// Configurar event bridge para eventos nativos y binarios
				this.eventBridge = new NativeEventBridge(
					{
						nativeManager,
						binaryDownloadService,
						isBeingRemoved: (id: string) => this.isBeingRemoved(id),
						hasDownload: (id: string) => this.store.has(id),
						isPaused: () => this.isPaused,
					},
					{
						onProgress: (id: string, progressData: NativeProgressData) => {
							this.handleBridgeProgress(id, progressData).catch(error => {
								this.currentLogger.error(
									TAG,
									"Failed to handle progress event",
									error
								);
							});
						},
						onCompleted: (id: string, fileUri?: string, fileSize?: number) => {
							this.handleBridgeCompleted(id, fileUri, fileSize).catch(error => {
								this.currentLogger.error(
									TAG,
									"Failed to handle completed event",
									error
								);
							});
						},
						onFailed: (
							id: string,
							error: { code: string; message: string; timestamp: number }
						) => {
							this.handleBridgeFailed(id, error).catch(err => {
								this.currentLogger.error(TAG, "Failed to handle error event", err);
							});
						},
						onStateChanged: (
							id: string,
							state: DownloadStates,
							rawState: string,
							extraData?: Record<string, unknown>
						) => {
							this.handleBridgeStateChanged(id, state, rawState, extraData).catch(
								error => {
									this.currentLogger.error(
										TAG,
										"Failed to handle state change event",
										error
									);
								}
							);
						},
					},
					this.currentLogger
				);
				this.eventBridge.setup();

				// NO iniciar procesamiento automático aquí.
				// DownloadsManager.start() llamará a queueManager.start() después de
				// marcar isInitialized=true, evitando que processQueue intente descargar
				// antes de que el sistema esté completamente listo.

				this.isInitialized = true;
				this.currentLogger.info(
					TAG,
					`QueueManager initialized with ${this.store.size} downloads`
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
		const existing = this.store.getRaw(downloadItem.id);
		if (existing) {
			this.currentLogger.info(
				TAG,
				`Download already exists: ${downloadItem.title} (${downloadItem.id}) [state=${existing.state}, isProcessing=${this.isProcessing}, isPaused=${this.isPaused}]`
			);
			// Si el item existe pero está en QUEUED, asegurar que el procesamiento esté activo
			// addDownloadItem es una acción explícita del usuario → forzar unpause e iniciar procesamiento
			// Pero respetar restricciones de red (ej: WiFi-only en cellular)
			if (existing.state === DownloadStates.QUEUED && !this.isProcessing) {
				if (this.canDownloadNow()) {
					if (this.isPaused) {
						this.currentLogger.info(
							TAG,
							"Force unpausing: user explicitly requested download"
						);
						this.isPaused = false;
					}
					this.currentLogger.debug(
						TAG,
						"Starting processing for existing queued download"
					);
					this.startProcessing();
				} else {
					this.currentLogger.info(
						TAG,
						"Download queued but network conditions prevent starting"
					);
				}
			}
			return downloadItem.id;
		}

		try {
			// Agregar directamente a la cola
			this.store.set(downloadItem.id, downloadItem);

			// Persistir usando PersistenceService
			await this.store.persist();

			// Emitir evento
			this.eventEmitter.emit(DownloadEventType.QUEUED, {
				downloadId: downloadItem.id,
				item: downloadItem,
				queueSize: this.store.size,
			});

			this.currentLogger.info(
				TAG,
				`Download queued: ${downloadItem.title} (${downloadItem.id})`
			);

			// addDownloadItem es una acción explícita del usuario → forzar unpause e iniciar procesamiento
			// autoProcess solo controla el inicio automático durante la inicialización del sistema.
			// Pero respetar restricciones de red (ej: WiFi-only en cellular)
			if (!this.isProcessing) {
				if (this.canDownloadNow()) {
					if (this.isPaused) {
						this.currentLogger.info(
							TAG,
							"Force unpausing: user explicitly requested download"
						);
						this.isPaused = false;
					}
					this.currentLogger.debug(TAG, "Starting processing due to new download added");
					this.startProcessing();
				} else {
					this.currentLogger.info(
						TAG,
						"Download queued but network conditions prevent starting"
					);
				}
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
			const item = this.store.getRaw(downloadId);
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
				this.store.set(downloadId, item);

				// Persistir cambios
				await this.store.persist();

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

				// Remover completamente de la cola y tracking
				this.store.delete(downloadId);
				this.retryManager.clearRetries(downloadId);
				this.lastProgressEventTime.delete(downloadId);

				// Persistir cambios
				await this.store.persist();

				// Emitir evento de descarga completamente eliminada
				this.eventEmitter.emit(DownloadEventType.REMOVED, {
					downloadId,
					item,
					queueSize: this.store.size,
				});

				this.currentLogger.info(
					TAG,
					`Download completely removed: ${item.title} (${downloadId})`
				);

				// Force storage update so FilesystemBar reflects freed space immediately
				storageService
					.forceUpdate()
					.catch(err =>
						this.currentLogger.warn(
							TAG,
							"Failed to force storage update after remove",
							err
						)
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
			const item = this.store.getRaw(downloadId);
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
			this.store.delete(downloadId);
			this.retryManager.clearRetries(downloadId);
			this.lastProgressEventTime.delete(downloadId);

			// Persistir cambios
			await this.store.persist();

			// Emitir evento de descarga completamente eliminada
			this.eventEmitter.emit(DownloadEventType.REMOVED, {
				downloadId,
				item,
				queueSize: this.store.size,
			});

			this.currentLogger.info(
				TAG,
				`Download forcefully removed: ${item.title} (${downloadId})`
			);

			// Force storage update so FilesystemBar reflects freed space immediately
			storageService
				.forceUpdate()
				.catch(err =>
					this.currentLogger.warn(
						TAG,
						"Failed to force storage update after force remove",
						err
					)
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
		const item = this.store.getRaw(downloadId);
		if (item && item.state === DownloadStates.DOWNLOADING) {
			await this.updateDownloadState(downloadId, DownloadStates.PAUSED);
			this.currentlyDownloading.delete(downloadId);

			const updatedItem = this.store.getRaw(downloadId);
			this.eventEmitter.emit(DownloadEventType.PAUSED, {
				downloadId,
				item: updatedItem || item,
			});
		}
	}

	/*
	 * Reanuda una descarga específica
	 *
	 */

	public async resumeDownload(downloadId: string): Promise<void> {
		const item = this.store.getRaw(downloadId);
		if (item && item.state === DownloadStates.PAUSED) {
			await this.updateDownloadState(downloadId, DownloadStates.QUEUED);

			const updatedItem = this.store.getRaw(downloadId);
			this.eventEmitter.emit(DownloadEventType.RESUMED, {
				downloadId,
				item: updatedItem || item,
			});

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
		for (const [id, item] of this.store.entries()) {
			if (
				item.state === DownloadStates.DOWNLOADING ||
				item.state === DownloadStates.DOWNLOADING_ASSETS
			) {
				item.state = DownloadStates.PAUSED;
				this.store.set(id, item);
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

	public async resumeAll(): Promise<void> {
		this.isPaused = false;
		this.currentLogger.info(TAG, "All downloads resumed");

		// FIX: await syncWithNativeState() to prevent race condition with processQueue().
		// Previously this was fire-and-forget, causing syncWithNativeState to overwrite
		// QUEUED states back to PAUSED (native state) while processQueue was trying to
		// start those same downloads.
		try {
			await this.syncWithNativeState();
		} catch (error) {
			this.currentLogger.error(
				TAG,
				"Failed to sync with native state after resumeAll",
				error
			);
		}

		// Transition PAUSED downloads back to QUEUED so processQueue can pick them up.
		// Without this, after pauseAll+resumeAll items stay PAUSED and processQueue
		// finds nothing to process (it only looks for QUEUED items).
		for (const [id, item] of this.store.entries()) {
			if (item.state === DownloadStates.PAUSED) {
				item.state = DownloadStates.QUEUED;
				this.store.set(id, item);
				this.currentLogger.debug(
					TAG,
					`Transitioned ${id} from PAUSED to QUEUED for processing`
				);
			}
		}

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
		return Array.from(this.store.values()).map(item => this.deepCloneItem(item));
	}

	/*
	 * Obtiene una descarga específica
	 *
	 */

	public getDownload(downloadId: string): DownloadItem | null {
		const item = this.store.getRaw(downloadId);
		return item ? this.deepCloneItem(item) : null;
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
			const beforeCount = this.store.size;

			// Detener todas las descargas activas
			this.currentlyDownloading.clear();

			// Limpiar archivos de descargas incompletas
			for (const [, item] of this.store.entries()) {
				if (item.fileUri && item.state !== DownloadStates.COMPLETED) {
					try {
						await storageService.deleteFile(item.fileUri);
					} catch (error) {
						this.currentLogger.warn(TAG, `Failed to delete file: ${item.fileUri}`);
					}
				}
			}

			// Limpiar la cola y tracking
			await this.store.clear();
			this.retryManager.clearAll();
			this.lastProgressEventTime.clear();

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
			// Reordenar y persistir via store
			await this.store.reorder(newOrder);

			this.eventEmitter.emit(DownloadEventType.QUEUE_REORDERED, {
				queueSize: this.store.size,
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
		return Array.from(this.store.values())
			.filter(item => states.includes(item.state))
			.map(item => this.deepCloneItem(item));
	}

	/*
	 * Filtra descargas por tipo
	 *
	 */

	public filterByType(type: string): DownloadItem[] {
		return Array.from(this.store.values())
			.filter(item => item.type.toString() === type)
			.map(item => this.deepCloneItem(item));
	}

	/*
	 * Obtiene la posición de cada descarga en la cola
	 *
	 */

	public getQueuePositions(): Map<string, number> {
		const positions = new Map<string, number>();
		let position = 1;

		for (const [id] of this.store.entries()) {
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
		const items = Array.from(this.store.values());
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
			total: this.store.size,
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
			const beforeCount = this.store.size;
			const idsToRemove: string[] = [];

			// Identificar items a eliminar
			for (const [id, item] of this.store.entries()) {
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
				const item = this.store.getRaw(id);

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
				this.store.delete(id);

				// 4. Limpiar tracking asociado
				this.retryManager.clearRetries(id);
				this.currentlyDownloading.delete(id);
				this.lastProgressEventTime.delete(id);
			}

			const removed = beforeCount - this.store.size;

			// Persistir cambios
			await this.store.persist();

			this.eventEmitter.emit("downloads_cleared_by_state", {
				states,
				clearedCount: removed,
				queueSize: this.store.size,
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
	 * Suscribe a un evento arbitrario del eventEmitter interno
	 * Permite suscribirse a eventos custom (max_concurrent_changed, etc.)
	 * sin acceder directamente al eventEmitter privado
	 *
	 */

	public onEvent(event: string, callback: (...args: unknown[]) => void): () => void {
		this.eventEmitter.on(event, callback);
		return () => this.eventEmitter.off(event, callback);
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
			DownloadEventType.STATE_CHANGE,
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
		if (this.processingInterval) {
			// Interval already running — force an immediate processQueue() so that
			// downloads waiting for changed network conditions are picked up now
			// instead of waiting for the next interval tick.
			this.processQueue();
			return;
		}
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

		// Procesar inmediatamente sin esperar al primer tick del interval
		this.processQueue();

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
		// FIX: Only count DOWNLOADING as active. PAUSED downloads are not actively downloading
		// and should not block concurrency slots. Previously, PAUSED items counted as active,
		// which blocked the queue when syncWithNativeState set items to PAUSED.
		const stateActive = Array.from(this.store.values()).filter(
			item => item.state === DownloadStates.DOWNLOADING
		).length;
		const activeDownloads = Math.max(stateActive, this.currentlyDownloading.size);

		const queuedDownloads = Array.from(this.store.values()).filter(
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

		for (const [id, item] of this.store.entries()) {
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
			const stateActiveAfterDelay = Array.from(this.store.values()).filter(
				item => item.state === DownloadStates.DOWNLOADING
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
			const currentItem = this.store.getRaw(nextDownloadId);
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

			// Emitir evento de inicio (re-fetch para obtener item con estado DOWNLOADING)
			const startedItem = this.store.getRaw(nextDownloadId);
			this.eventEmitter.emit(DownloadEventType.STARTED, {
				downloadId: nextDownloadId,
				item: startedItem || nextDownload,
			});

			this.currentLogger.info(
				TAG,
				`Download sent to destination queue: ${nextDownload.title}`
			);
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to start download: ${error}`);
			if (nextDownloadId) {
				// Si el error es de red, volver a QUEUED para reintentar en el siguiente ciclo
				const isNetworkError =
					error instanceof PlayerError &&
					(error.key === "NETWORK_DOWNLOADS_WIFI_RESTRICTED" ||
						error.key === "NETWORK_CONNECTION_001" ||
						(error.context?.originalError instanceof PlayerError &&
							(error.context.originalError.key ===
								"NETWORK_DOWNLOADS_WIFI_RESTRICTED" ||
								error.context.originalError.key === "NETWORK_CONNECTION_001")));

				if (isNetworkError) {
					this.currentlyDownloading.delete(nextDownloadId);
					this.currentLogger.info(
						TAG,
						`Download ${nextDownloadId} returned to QUEUED due to network conditions`
					);
					await this.updateDownloadState(nextDownloadId, DownloadStates.QUEUED);
				} else {
					// Usar handleDownloadFailure para emitir DownloadEventType.FAILED
					// y que la app pueda mostrar el modal de error al usuario
					await this.handleDownloadFailure(nextDownloadId, nextDownload!, error);
				}
			} else {
				this.currentlyDownloading.delete(nextDownloadId);
			}
		}
	}

	/*
	 * Verifica si las condiciones actuales permiten descargar
	 * (conectividad, configuración de red, etc.)
	 *
	 */

	private canDownloadNow(): boolean {
		if (!networkService.isOnline()) {
			return false;
		}

		const wifiOnly = configManager.getConfig().download_just_wifi;
		if (wifiOnly && !networkService.isWifiConnected()) {
			return false;
		}

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
				// Extract file extension from the source URL (e.g., ".mp3" from "https://.../file.mp3")
				// iOS AVFoundation requires the extension to recognize the media format
				const urlPath = item.uri.split("?")[0]?.split("#")[0] || "";
				const extMatch = urlPath.match(/\.\w+$/);
				const fileExtension = extMatch ? extMatch[0] : "";
				task = {
					id: item.id,
					url: item.uri,
					destination: `${binariesDir}/${item.id}${fileExtension}`,
					title: item.title,
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

		const item = this.store.getRaw(downloadId);
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

		const item = this.store.getRaw(downloadId);
		if (item) {
			const clonedItem = this.deepCloneItem(item);
			if (fileUri) {
				clonedItem.fileUri = fileUri;
			}
			this.eventEmitter.emit(DownloadEventType.COMPLETED, {
				downloadId,
				item: clonedItem,
			});

			this.currentLogger.info(TAG, `Download completed: ${item.title}`);
		}

		// DEBUG: Log all downloads state after completion
		const allDownloads = Array.from(this.store.values());
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

		// Force storage update so FilesystemBar reflects new download space immediately
		storageService
			.forceUpdate()
			.catch(err =>
				this.currentLogger.warn(TAG, "Failed to force storage update after completion", err)
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
		const item = this.store.getRaw(downloadId);

		// DEDUPLICATION: If item is already FAILED, skip processing
		// This prevents race conditions when multiple error events arrive for the same download
		if (item?.state === DownloadStates.FAILED) {
			return;
		}

		if (item) {
			await this.handleDownloadFailure(downloadId, item, error);
		} else {
			// Limpiar por seguridad aunque no esté en la cola
			this.currentlyDownloading.delete(downloadId);
			speedCalculator.clear(downloadId);
		}

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

		const item = this.store.getRaw(downloadId);
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
		const item = this.store.getRaw(downloadId);
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

		// Emitir evento de actualización (re-fetch para obtener item con estado actualizado)
		const updatedItem = this.store.getRaw(downloadId);
		this.eventEmitter.emit(DownloadEventType.RESUMED, {
			downloadId,
			item: updatedItem || item,
		});

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
		const item = this.store.getRaw(downloadId);
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

		// Emitir evento de cambio de estado (re-fetch para obtener item actualizado)
		const updatedItem = this.store.getRaw(downloadId);
		this.eventEmitter.emit(DownloadEventType.STATE_CHANGE, {
			downloadId,
			item: updatedItem || item,
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
		// FIX: Liberar slot de concurrencia inmediatamente para desbloquear la cola.
		// Antes, solo notifyDownloadFailed (Path C) limpiaba currentlyDownloading,
		// pero los callbacks de NativeEventBridge (onFailed)
		// llaman a este método directamente sin limpiar, bloqueando la cola.
		this.currentlyDownloading.delete(downloadId);
		speedCalculator.clear(downloadId);

		if (this.retryManager.shouldRetry(downloadId, error)) {
			// Reintentable: programar retry con backoff exponencial
			this.retryManager.scheduleRetry(downloadId, async () => {
				await this.updateDownloadState(downloadId, DownloadStates.QUEUED);
				// Forzar procesamiento de la cola
				this.processQueue();
			});
		} else {
			// Non-retryable error or retry limit reached - mark as failed immediately
			const retryCount = this.retryManager.getRetryCount(downloadId);
			this.retryManager.clearRetries(downloadId);
			await this.updateDownloadState(downloadId, DownloadStates.FAILED);

			const updatedItem = this.store.getRaw(downloadId);
			const errorObj = error as { code?: string; errorCode?: string };

			// CRITICAL: Emit FAILED event so UI can update
			this.currentLogger.error(
				TAG,
				`Download failed permanently: ${item.title || downloadId}`,
				{
					isNonRetryableError: this.retryManager.isNonRetryableError(error),
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
		}
	}

	/*
	 * Sistema de locks para operaciones de eliminación
	 * Previene race conditions cuando se elimina una descarga en progreso
	 *
	 */

	private acquireLock(downloadId: string, operation: "removing" | "updating"): boolean {
		return this.store.acquireLock(downloadId, operation);
	}

	private releaseLock(downloadId: string): void {
		this.store.releaseLock(downloadId);
	}

	private isBeingRemoved(downloadId: string): boolean {
		return this.store.isBeingRemoved(downloadId);
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
		const item = this.store.getRaw(downloadId);
		if (item) {
			const previousState = item.state;

			// FIX: Use in-memory item as source of truth to avoid race conditions
			// during parallel downloads. The previous implementation loaded from
			// async persistence (loadDownloadState), creating a window where
			// concurrent progress events for other downloads could be missed.
			// Only merge from persistence for COMPLETED state where subtitle data
			// from StreamDownloadService may need to be picked up.
			let mergedItem: typeof item;

			if (state === DownloadStates.COMPLETED) {
				// For completion, merge with persisted data to pick up subtitles
				// downloaded by StreamDownloadService
				try {
					const persistedDownloads = await persistenceService.loadDownloadState();
					const persistedItem = persistedDownloads.get(downloadId);
					mergedItem = persistedItem ? { ...persistedItem } : { ...item };
				} catch {
					mergedItem = { ...item };
				}
			} else {
				// For all other states (FAILED, DOWNLOADING, QUEUED, etc.),
				// use in-memory item directly - no async gap
				mergedItem = { ...item };
			}

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

			this.store.set(downloadId, mergedItem);

			// Persistir cambios usando PersistenceService
			await this.store.persist();
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
		const item = this.store.getRaw(downloadId);
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

			this.store.set(downloadId, item);

			// Solo persistir en cambios importantes de progreso (cada 10%)
			if (progress % 10 === 0) {
				await this.store.persist();
			}
		}
	}

	/*
	 * API Pública - Consulta de información
	 *
	 */

	public getDownloadType(downloadId: string): DownloadType | undefined {
		const item = this.store.getRaw(downloadId);
		return item?.type;
	}

	/*
	 * Carga la cola persistida usando PersistenceService
	 *
	 */

	private async loadPersistedQueue(): Promise<void> {
		await this.store.loadFromPersistence();
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

				const localItem = this.store.getRaw(nativeDownload.id);
				if (localItem && localItem.state !== nativeDownload.state) {
					// Proteger estados terminales: COMPLETED and FAILED must not be
					// overwritten by native state. iOS can report completed streams
					// as "PAUSED", which would corrupt the local state.
					if (
						localItem.state === DownloadStates.COMPLETED ||
						localItem.state === DownloadStates.FAILED
					) {
						this.currentLogger.debug(
							TAG,
							`Skipping sync for ${nativeDownload.id}: terminal state ${localItem.state} preserved (native reported: ${nativeDownload.state})`
						);
						continue;
					}

					// FIX: Protect QUEUED state from being overwritten by native PAUSED.
					// QUEUED means "pending processing by processQueue()" and must not be
					// degraded to PAUSED. The native module reports PAUSED because
					// NativeManager.initializeNativeModule() calls pauseAll() on startup,
					// but the JS layer intends to restart these downloads.
					if (
						localItem.state === DownloadStates.QUEUED &&
						nativeDownload.state === "PAUSED"
					) {
						this.currentLogger.debug(
							TAG,
							`Skipping sync for ${nativeDownload.id}: QUEUED state preserved (native reported: PAUSED)`
						);
						continue;
					}

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

					this.store.set(nativeDownload.id, localItem);
					syncedCount++;
				}
			}

			// Persistir cambios si hubo sincronizaciones
			if (syncedCount > 0) {
				await this.store.persist();
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
			for (const [downloadId, item] of this.store.entries()) {
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
				const item = this.store.getRaw(downloadId);
				if (item) {
					item.state = DownloadStates.QUEUED;
					// Resetear progreso si existe la propiedad
					if ("progress" in item) {
						(item as { progress: number }).progress = 0;
					}
					this.store.set(downloadId, item);
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
				await this.store.persist();
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
	 * Callbacks para NativeEventBridge — reciben datos ya normalizados
	 *
	 */

	// Track last progress event times to avoid spam
	private lastProgressEventTime: Map<string, number> = new Map();

	private async handleBridgeProgress(
		downloadId: string,
		eventData: NativeProgressData
	): Promise<void> {
		const { percent } = eventData;

		// FILTRAR eventos innecesarios para evitar ruido
		const item = this.store.getRaw(downloadId);

		// No procesar si la descarga no está realmente activa
		if (!item || item.state !== DownloadStates.DOWNLOADING) {
			// FASE 1 FIX: Si recibimos progreso pero el estado no es DOWNLOADING, actualizarlo
			// Solo promover a DOWNLOADING desde QUEUED o PREPARING (estados de espera)
			// NUNCA desde PAUSED, STOPPED, COMPLETED o FAILED (estados explícitos del usuario o finales)
			if (
				item &&
				percent > 0 &&
				(item.state === DownloadStates.QUEUED || item.state === DownloadStates.PREPARING)
			) {
				item.state = DownloadStates.DOWNLOADING;
				this.store.set(downloadId, item);
			} else {
				return;
			}
		}

		// No procesar eventos "estáticos" (sin velocidad y sin cambios)
		if (eventData.speed === 0 && !item.stats.startedAt) {
			// Filtrar sin loguear para evitar spam
			return;
		}

		// Calcular si es el primer evento de progreso
		const currentPercent = item.stats.progressPercent || 0;
		const isFirstProgressEvent = currentPercent === 0 && percent > 0;

		// No procesar si el progreso no ha cambiado significativamente Y no hay velocidad
		if (
			Math.abs(percent - currentPercent) < 1 &&
			eventData.speed === 0 &&
			!isFirstProgressEvent
		) {
			return;
		}

		// ═══════════════════════════════════════════════════════════════
		// BLOQUE A: Actualización de datos internos (SIEMPRE se ejecuta)
		// Garantiza que downloadQueue tiene datos frescos y SpeedCalculator
		// recibe muestras regulares, independientemente del throttle de emisión
		// ═══════════════════════════════════════════════════════════════

		// Actualizar progreso en el item de la cola (con bytes para SpeedCalculator)
		// NOTA: Solo pasar totalBytes si es > 0 para evitar sobrescribir estimaciones previas
		// (Android envía totalBytes=0 durante el inicio de descargas HLS/DASH)
		await this.updateDownloadProgress(
			downloadId,
			percent,
			eventData.bytesDownloaded,
			eventData.totalBytes && eventData.totalBytes > 0 ? eventData.totalBytes : undefined
		);

		// También actualizar bytes y otros datos si están disponibles
		if (item && item.stats) {
			// Actualizar velocidad
			if (eventData.speed !== undefined) {
				item.stats.downloadSpeed = eventData.speed;
			}

			// remainingTime se calcula siempre en JS (fallback más abajo)
			// El módulo nativo no envía este valor para streams HLS/DASH

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
			if (!eventData.bytesDownloaded && item.stats.startedAt && (eventData.speed ?? 0) > 0) {
				const elapsedSeconds = (Date.now() - item.stats.startedAt) / 1000;
				const estimatedBytes = Math.floor((eventData.speed ?? 0) * elapsedSeconds);
				if (estimatedBytes > item.stats.bytesDownloaded) {
					item.stats.bytesDownloaded = estimatedBytes;
				}
			}

			// CALCULAR totalBytes si no viene del nativo (usando progress y bytesDownloaded)
			if (item.stats.totalBytes <= 0 && percent > 0 && item.stats.bytesDownloaded > 0) {
				item.stats.totalBytes = Math.floor(item.stats.bytesDownloaded / (percent / 100));
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
			this.store.set(downloadId, item);
		}

		// ═══════════════════════════════════════════════════════════════
		// BLOQUE B: Emisión de evento (THROTTLEADA)
		// Solo emitir DownloadEventType.PROGRESS cada 2s para reducir
		// callbacks a hooks y re-renders de React
		// ═══════════════════════════════════════════════════════════════

		const now = Date.now();
		const lastEventTime = this.lastProgressEventTime.get(downloadId) || 0;
		const timeSinceLastEvent = now - lastEventTime;

		// Solo emitir si han pasado al menos 2 segundos O es el primer evento de progreso
		if (timeSinceLastEvent < 2000 && !isFirstProgressEvent) {
			return;
		}

		// Actualizar tiempo del último evento emitido
		this.lastProgressEventTime.set(downloadId, now);

		// Re-emitir evento para que los hooks lo reciban (usar valores calculados)
		const updatedItem = this.store.getRaw(downloadId);
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

	private async handleBridgeCompleted(
		downloadId: string,
		fileUri?: string,
		fileSize?: number
	): Promise<void> {
		if (this.store.has(downloadId)) {
			await this.notifyDownloadCompleted(downloadId, fileUri, fileSize);
		}
	}

	private async handleBridgeFailed(
		downloadId: string,
		error: { code: string; message: string; timestamp: number }
	): Promise<void> {
		const item = this.store.getRaw(downloadId);
		if (!item) {
			this.currentLogger.debug(TAG, `Error event for unknown download: ${downloadId}`);
			return;
		}

		this.currentLogger.error(
			TAG,
			`Native error for ${downloadId}: ${error.code} - ${error.message}`
		);

		await this.handleDownloadFailure(downloadId, item, error);
	}

	private async handleBridgeStateChanged(
		downloadId: string,
		mappedState: DownloadStates,
		rawState: string,
		extraData?: Record<string, unknown>
	): Promise<void> {
		this.currentLogger.debug(
			TAG,
			`Handling state event: ${downloadId} → ${rawState} (mapped: ${mappedState})`
		);

		if (this.store.has(downloadId)) {
			const previousState = this.store.getRaw(downloadId)?.state;

			await this.updateDownloadState(downloadId, mappedState);

			// Re-emitir evento específico según el estado
			const item = this.store.getRaw(downloadId);
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
							error: extraData?.error || null,
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

	/*
	 * Limpia recursos al destruir
	 *
	 */

	private deepCloneItem(item: DownloadItem): DownloadItem {
		return JSON.parse(JSON.stringify(item));
	}

	public destroy(): void {
		this.stopProcessing();
		this.eventBridge?.teardown();
		this.eventEmitter.removeAllListeners();
		this.store.destroy();
		this.currentlyDownloading.clear();
		this.lastProgressEventTime.clear();
		this.retryManager.destroy();
		this.isInitialized = false;
		this.currentLogger.info(TAG, "QueueManager destroyed");
	}
}

// Exportar instancia singleton
export const queueManager = QueueManager.getInstance();
