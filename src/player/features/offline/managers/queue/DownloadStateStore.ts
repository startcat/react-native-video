/*
 * Store independiente para gestión del Map de descargas
 * Encapsula CRUD, persistencia, locks y deep clone
 *
 */

import { Logger } from "../../../logger";
import { LOG_TAGS } from "../../constants";
import { PersistenceService } from "../../services/storage/PersistenceService";
import { DownloadItem, DownloadStates, DownloadType } from "../../types";

const TAG = LOG_TAGS.QUEUE_MANAGER;

export class DownloadStateStore {
	private downloadQueue: Map<string, DownloadItem> = new Map();
	private pendingOperations: Map<string, "removing" | "updating"> = new Map();
	private lockTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
	private persistenceService: PersistenceService;
	private currentLogger: Logger;

	constructor(persistenceService: PersistenceService, logger: Logger) {
		this.persistenceService = persistenceService;
		this.currentLogger = logger;
	}

	/*
	 * Carga la cola persistida usando PersistenceService
	 *
	 */

	async loadFromPersistence(): Promise<void> {
		try {
			this.currentLogger.debug(TAG, "Loading persisted download queue");

			const persistedDownloads = await this.persistenceService.loadDownloadState();
			this.downloadQueue = persistedDownloads;

			// Resetear descargas que estaban en progreso
			for (const [id, item] of this.downloadQueue) {
				if (item.state === DownloadStates.DOWNLOADING) {
					item.state = DownloadStates.QUEUED;
					this.downloadQueue.set(id, item);
				}
			}

			if (this.downloadQueue.size > 0) {
				await this.persist();
			}
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to load persisted queue: ${error}`);
		}
	}

	/*
	 * CRUD Operations
	 *
	 */

	async add(item: DownloadItem): Promise<void> {
		this.downloadQueue.set(item.id, item);
		await this.persist();
	}

	async remove(downloadId: string): Promise<void> {
		if (!this.downloadQueue.has(downloadId)) {
			return;
		}
		this.downloadQueue.delete(downloadId);
		await this.persist();
	}

	get(downloadId: string): DownloadItem | null {
		const item = this.downloadQueue.get(downloadId);
		return item ? this.deepClone(item) : null;
	}

	/*
	 * getRaw: retorna referencia directa al item (sin clone)
	 * Uso interno del QueueManager para mutaciones in-place
	 *
	 */

	getRaw(downloadId: string): DownloadItem | undefined {
		return this.downloadQueue.get(downloadId);
	}

	getAll(): DownloadItem[] {
		return Array.from(this.downloadQueue.values()).map(item => this.deepClone(item));
	}

	has(downloadId: string): boolean {
		return this.downloadQueue.has(downloadId);
	}

	get size(): number {
		return this.downloadQueue.size;
	}

	/*
	 * Filtros
	 *
	 */

	getByState(states: DownloadStates[]): DownloadItem[] {
		return Array.from(this.downloadQueue.values())
			.filter(item => states.includes(item.state))
			.map(item => this.deepClone(item));
	}

	getByType(type: DownloadType): DownloadItem[] {
		return Array.from(this.downloadQueue.values())
			.filter(item => item.type === type)
			.map(item => this.deepClone(item));
	}

	/*
	 * Iteración sobre entries (para pauseAll/resumeAll y otros)
	 *
	 */

	entries(): IterableIterator<[string, DownloadItem]> {
		return this.downloadQueue.entries();
	}

	values(): IterableIterator<DownloadItem> {
		return this.downloadQueue.values();
	}

	/*
	 * Set directo en el Map (para mutaciones in-place desde QueueManager)
	 *
	 */

	set(downloadId: string, item: DownloadItem): void {
		this.downloadQueue.set(downloadId, item);
	}

	/*
	 * Delete directo del Map
	 *
	 */

	delete(downloadId: string): boolean {
		return this.downloadQueue.delete(downloadId);
	}

	/*
	 * Reordenar cola
	 *
	 */

	async reorder(newOrder: string[]): Promise<void> {
		const newQueue = new Map<string, DownloadItem>();
		const existingItems = new Map(this.downloadQueue);

		newOrder.forEach(id => {
			const item = existingItems.get(id);
			if (item) {
				newQueue.set(id, item);
				existingItems.delete(id);
			}
		});

		// Agregar items restantes que no estaban en el nuevo orden
		for (const [id, item] of existingItems) {
			newQueue.set(id, item);
		}

		this.downloadQueue = newQueue;
		await this.persist();
	}

	/*
	 * Limpiar toda la cola
	 *
	 */

	async clear(): Promise<void> {
		this.downloadQueue.clear();
		this.pendingOperations.clear();

		for (const timeout of this.lockTimeouts.values()) {
			clearTimeout(timeout);
		}
		this.lockTimeouts.clear();

		await this.persist();
	}

	/*
	 * Limpiar por estado (solo elimina del Map y persiste)
	 * La limpieza de archivos físicos y estado nativo se hace en QueueManager
	 *
	 */

	async clearByState(states: DownloadStates[]): Promise<string[]> {
		const idsToRemove: string[] = [];

		for (const [id, item] of this.downloadQueue) {
			if (states.includes(item.state)) {
				idsToRemove.push(id);
			}
		}

		for (const id of idsToRemove) {
			this.downloadQueue.delete(id);
		}

		if (idsToRemove.length > 0) {
			await this.persist();
		}

		return idsToRemove;
	}

	/*
	 * Posiciones en la cola
	 *
	 */

	getQueuePositions(): Map<string, number> {
		const positions = new Map<string, number>();
		let position = 1;

		for (const [id] of this.downloadQueue) {
			positions.set(id, position);
			position++;
		}

		return positions;
	}

	/*
	 * Sistema de locks para operaciones concurrentes
	 *
	 */

	acquireLock(downloadId: string, operation: "removing" | "updating"): boolean {
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

	releaseLock(downloadId: string): void {
		this.pendingOperations.delete(downloadId);

		const timeout = this.lockTimeouts.get(downloadId);
		if (timeout) {
			clearTimeout(timeout);
			this.lockTimeouts.delete(downloadId);
		}
	}

	isLocked(downloadId: string): boolean {
		return this.pendingOperations.has(downloadId);
	}

	isBeingRemoved(downloadId: string): boolean {
		return this.pendingOperations.get(downloadId) === "removing";
	}

	/*
	 * Deep clone
	 *
	 */

	deepClone(item: DownloadItem): DownloadItem {
		return JSON.parse(JSON.stringify(item));
	}

	/*
	 * Persistencia privada
	 *
	 */

	async persist(): Promise<void> {
		await this.persistenceService.saveDownloadState(this.downloadQueue);
	}

	/*
	 * Destruir y limpiar recursos
	 *
	 */

	destroy(): void {
		this.downloadQueue.clear();
		this.pendingOperations.clear();

		for (const timeout of this.lockTimeouts.values()) {
			clearTimeout(timeout);
		}
		this.lockTimeouts.clear();
	}
}
