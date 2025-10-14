/*
 * PlaylistsManager
 *
 * Gestor singleton para playlists de reproducción nativa.
 * Permite gestionar colas de reproducción completamente en el módulo nativo,
 * habilitando auto-next, controles del widget multimedia, y reproducción en background.
 *
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { EventEmitter } from "eventemitter3";
import { NativeEventEmitter, NativeModules, Platform } from "react-native";

import { PlayerError } from "../../core/errors";
import { Logger, LogLevel } from "../logger";
import { DEFAULT_CONFIG } from "./config";
import { LOG_TAGS } from "./constants";

import {
	ConfigChangedEventData,
	ItemChangedEventData,
	PlaylistConfig,
	PlaylistEventType,
	PlaylistItem,
	PlaylistItemStatus,
	PlaylistItemType,
	PlaylistRepeatMode,
	PlaylistShuffleMode,
	PlaylistsManagerConfig,
	PlaylistState,
	PlaylistStats,
	PlaylistUpdatedEventData,
} from "./types";

export class PlaylistsManager {
	private static instance: PlaylistsManager;
	private eventEmitter: EventEmitter;
	private nativeEventEmitter: NativeEventEmitter | null = null;
	private nativeModule: any = null;

	private config: PlaylistsManagerConfig;
	private logger: Logger;
	private isInitialized: boolean = false;

	private items: PlaylistItem[] = [];
	private currentIndex: number = -1;
	private playlistConfig: PlaylistConfig;
	private originalOrder: string[] = [];
	private isPlaying: boolean = false;
	private hasEnded: boolean = false;
	private nativeListeners: any[] = [];

	private constructor() {
		this.eventEmitter = new EventEmitter();
		this.config = DEFAULT_CONFIG;
		this.playlistConfig = DEFAULT_CONFIG.defaultPlaylistConfig!;

		this.logger = new Logger({
			enabled: this.config.logEnabled,
			level: this.config.logLevel,
			prefix: LOG_TAGS.MAIN,
			useColors: true,
		});
	}

	public static getInstance(): PlaylistsManager {
		if (!PlaylistsManager.instance) {
			PlaylistsManager.instance = new PlaylistsManager();
		}
		return PlaylistsManager.instance;
	}

	public async initialize(config?: Partial<PlaylistsManagerConfig>): Promise<void> {
		if (this.isInitialized) {
			this.logger.info(LOG_TAGS.PLAYLISTS_MANAGER, "Already initialized");
			return;
		}

		try {
			this.config = { ...this.config, ...config };

			if (config?.defaultPlaylistConfig) {
				this.playlistConfig = { ...this.playlistConfig, ...config.defaultPlaylistConfig };
			}

			this.logger.updateConfig({
				enabled: this.config.logEnabled,
				level: this.config.logLevel as LogLevel,
			});

			await this.initializeNativeModule();

			if (this.config.enablePersistence) {
				await this.restoreState();
			}

			this.isInitialized = true;
			this.logger.info(LOG_TAGS.PLAYLISTS_MANAGER, "Initialized successfully");
		} catch (error) {
			this.logger.error(LOG_TAGS.PLAYLISTS_MANAGER, "Failed to initialize", error);
			throw new PlayerError("PLAYLIST_INITIALIZATION_FAILED", { originalError: error });
		}
	}

	private async initializeNativeModule(): Promise<void> {
		try {
			this.nativeModule = Platform.select({
				ios: NativeModules.PlaylistControlModule,
				android: NativeModules.PlaylistControlModule,
			});

			if (this.nativeModule) {
				this.nativeEventEmitter = new NativeEventEmitter(this.nativeModule);
				this.setupNativeListeners();
				this.logger.info(LOG_TAGS.PLAYLISTS_MANAGER, "Native module initialized");
			} else {
				this.logger.warn(
					LOG_TAGS.PLAYLISTS_MANAGER,
					"Native module not available - JS-only mode"
				);
			}
		} catch (error) {
			this.logger.warn(
				LOG_TAGS.PLAYLISTS_MANAGER,
				"Failed to initialize native module",
				error
			);
		}
	}

	private setupNativeListeners(): void {
		if (!this.nativeEventEmitter) return;

		const events = [
			{ name: "onNativeItemChanged", handler: this.handleNativeItemChanged.bind(this) },
			{ name: "onNativeItemStarted", handler: this.handleNativeItemStarted.bind(this) },
			{ name: "onNativeItemCompleted", handler: this.handleNativeItemCompleted.bind(this) },
			{ name: "onNativeItemError", handler: this.handleNativeItemError.bind(this) },
			{ name: "onNativeProgressUpdate", handler: this.handleNativeProgressUpdate.bind(this) },
			{ name: "onNativePlaylistEnded", handler: this.handleNativePlaylistEnded.bind(this) },
		];

		this.nativeListeners = events.map(({ name, handler }) =>
			this.nativeEventEmitter!.addListener(name, handler)
		);
	}

	public async setPlaylist(
		items: PlaylistItem[],
		config?: Partial<PlaylistConfig>
	): Promise<void> {
		this.ensureInitialized();

		try {
			const validatedItems = this.validateItems(items);
			if (validatedItems.length === 0) {
				throw new PlayerError("PLAYLIST_EMPTY");
			}

			const previousConfig = { ...this.playlistConfig };
			this.playlistConfig = { ...this.playlistConfig, ...config };

			// Limpiar playlist anterior completamente
			this.originalOrder = validatedItems.map(item => item.id);
			this.items =
				this.playlistConfig.shuffleMode === PlaylistShuffleMode.ON
					? this.shuffleItems(validatedItems)
					: validatedItems;

			this.currentIndex = this.playlistConfig.startIndex || 0;
			this.hasEnded = false;

			// Limpiar módulo nativo antes de enviar nueva playlist
			if (this.nativeModule) {
				try {
					await this.nativeModule.clearPlaylist();
					this.logger.debug(
						LOG_TAGS.PLAYLISTS_MANAGER,
						"Native playlist cleared before setting new one"
					);
				} catch (error) {
					this.logger.warn(
						LOG_TAGS.PLAYLISTS_MANAGER,
						"Failed to clear native playlist",
						error
					);
				}
				await this.sendPlaylistToNative();
			}

			if (this.config.enablePersistence) {
				await this.saveState();
			}

			this.emit(PlaylistEventType.PLAYLIST_LOADED, {
				items: this.items,
				totalItems: this.items.length,
				currentIndex: this.currentIndex,
				config: this.playlistConfig,
				timestamp: Date.now(),
			});

			if (config) {
				this.emit(PlaylistEventType.CONFIG_CHANGED, {
					previousConfig,
					currentConfig: this.playlistConfig,
					changedKeys: Object.keys(config),
					timestamp: Date.now(),
				} as ConfigChangedEventData);
			}

			this.logger.info(
				LOG_TAGS.PLAYLISTS_MANAGER,
				`Playlist set with ${this.items.length} items`
			);

			this.items.forEach((item, index) => {
				this.logger.info(LOG_TAGS.PLAYLISTS_MANAGER, `Item ${index}: ${item.id}`);
			});
		} catch (error) {
			this.logger.error(LOG_TAGS.PLAYLISTS_MANAGER, "Failed to set playlist", error);
			throw new PlayerError("PLAYLIST_SET_FAILED", {
				originalError: error,
				itemCount: items.length,
			});
		}
	}

	public async addItem(item: PlaylistItem): Promise<void> {
		this.ensureInitialized();

		try {
			const validated = this.validateItem(item);
			this.items.push(validated);

			if (this.nativeModule) {
				await this.nativeModule.addItem(validated);
			}

			await this.persistAndNotify("added", [validated.id]);
			this.logger.debug(LOG_TAGS.PLAYLISTS_MANAGER, `Item added: ${validated.id}`);
		} catch (error) {
			this.logger.error(LOG_TAGS.PLAYLISTS_MANAGER, "Failed to add item", error);
			throw new PlayerError("PLAYLIST_ADD_ITEM_FAILED", {
				originalError: error,
				itemId: item.id,
			});
		}
	}

	public async removeItem(itemId: string): Promise<void> {
		this.ensureInitialized();

		const index = this.items.findIndex(item => item.id === itemId);
		if (index === -1) {
			throw new PlayerError("PLAYLIST_ITEM_NOT_FOUND", { itemId });
		}

		this.items.splice(index, 1);
		this.adjustCurrentIndex(index);

		if (this.nativeModule) {
			await this.nativeModule.removeItem(itemId);
		}

		await this.persistAndNotify("removed", [itemId]);
		this.logger.debug(LOG_TAGS.PLAYLISTS_MANAGER, `Item removed: ${itemId}`);
	}

	public async clear(): Promise<void> {
		this.ensureInitialized();

		this.items = [];
		this.currentIndex = -1;
		this.originalOrder = [];
		this.hasEnded = false;

		if (this.nativeModule) {
			await this.nativeModule.clearPlaylist();
		}

		if (this.config.enablePersistence) {
			await this.saveState();
		}

		this.emit(PlaylistEventType.PLAYLIST_CLEARED, { timestamp: Date.now() });
		this.logger.info(LOG_TAGS.PLAYLISTS_MANAGER, "Playlist cleared");
	}

	public async goToNext(): Promise<boolean> {
		this.ensureInitialized();
		const nextIndex = this.getNextIndex();
		if (nextIndex === -1) return false;

		await this.goToIndex(nextIndex, "next");
		return true;
	}

	public async goToPrevious(): Promise<boolean> {
		this.ensureInitialized();
		const previousIndex = this.getPreviousIndex();
		if (previousIndex === -1) return false;

		await this.goToIndex(previousIndex, "previous");
		return true;
	}

	public async goToIndex(
		index: number,
		reason: "next" | "previous" | "goto" | "ended" | "error" | "user" = "goto"
	): Promise<void> {
		this.ensureInitialized();

		if (index < 0 || index >= this.items.length) {
			throw new PlayerError("PLAYLIST_INVALID_INDEX", {
				index,
				maxIndex: this.items.length - 1,
			});
		}

		const previousItem = this.getCurrentItem();
		const previousIndex = this.currentIndex;

		this.currentIndex = index;
		const currentItem = this.items[index];

		if (this.nativeModule) {
			// Native module will emit onNativeItemChanged, so we don't emit here
			await this.nativeModule.goToIndex(index);
		} else {
			// No native module, emit the event from JS
			this.emit(PlaylistEventType.ITEM_CHANGED, {
				previousItem,
				currentItem,
				previousIndex,
				currentIndex: index,
				reason,
				timestamp: Date.now(),
			} as ItemChangedEventData);
		}

		if (this.config.enablePersistence) {
			await this.saveState();
		}

		this.logger.debug(
			LOG_TAGS.PLAYLISTS_MANAGER,
			`Moved to index ${index} (reason: ${reason})`
		);
	}

	public async setRepeatMode(mode: PlaylistRepeatMode): Promise<void> {
		await this.updateConfig({ repeatMode: mode });
		if (this.nativeModule) {
			await this.nativeModule.setRepeatMode(mode);
		}
	}

	public async setShuffleMode(mode: PlaylistShuffleMode): Promise<void> {
		const previousMode = this.playlistConfig.shuffleMode;

		if (mode === PlaylistShuffleMode.ON && previousMode === PlaylistShuffleMode.OFF) {
			if (this.originalOrder.length === 0) {
				this.originalOrder = this.items.map(item => item.id);
			}

			const currentItem = this.getCurrentItem();
			this.items = this.shuffleItems(this.items);

			if (currentItem) {
				this.currentIndex = this.items.findIndex(item => item.id === currentItem.id);
			}
		} else if (mode === PlaylistShuffleMode.OFF && previousMode === PlaylistShuffleMode.ON) {
			const currentItem = this.getCurrentItem();
			this.items = this.restoreOriginalOrder();

			if (currentItem) {
				this.currentIndex = this.items.findIndex(item => item.id === currentItem.id);
			}
		}

		await this.updateConfig({ shuffleMode: mode });

		if (this.nativeModule) {
			await this.nativeModule.setShuffleMode(mode);
			await this.sendPlaylistToNative();
		}

		this.emit(PlaylistEventType.ORDER_CHANGED, {
			items: this.items,
			currentIndex: this.currentIndex,
			shuffleMode: mode,
			timestamp: Date.now(),
		});
	}

	public async setAutoNext(enabled: boolean): Promise<void> {
		await this.updateConfig({ autoNext: enabled });
		if (this.nativeModule) {
			await this.nativeModule.setAutoNext(enabled);
		}
	}

	public getCurrentItem(): PlaylistItem | null {
		if (this.currentIndex < 0 || this.currentIndex >= this.items.length) {
			return null;
		}
		return { ...this.items[this.currentIndex]! };
	}

	public getCurrentIndex(): number {
		return this.currentIndex;
	}

	public getItems(): PlaylistItem[] {
		return this.items.map(item => ({ ...item }));
	}

	public getItem(itemId: string): PlaylistItem | null {
		const item = this.items.find(item => item.id === itemId);
		return item ? { ...item } : null;
	}

	/**
	 * Get the next item without navigating to it
	 * Useful for coordinated playback with external players (e.g., Video component)
	 * @returns The next PlaylistItem or null if there's no next item
	 */
	public getNextItem(): PlaylistItem | null {
		const nextIndex = this.getNextIndex();
		if (nextIndex === -1 || nextIndex >= this.items.length) {
			return null;
		}
		return { ...this.items[nextIndex]! };
	}

	/**
	 * Get the previous item without navigating to it
	 * @returns The previous PlaylistItem or null if there's no previous item
	 */
	public getPreviousItem(): PlaylistItem | null {
		const previousIndex = this.getPreviousIndex();
		if (previousIndex === -1 || previousIndex >= this.items.length) {
			return null;
		}
		return { ...this.items[previousIndex]! };
	}

	/**
	 * Notify that the current item has completed externally
	 * This method is designed for coordinated playback where an external player
	 * (e.g., Video component) is handling the actual playback, but PlaylistsManager
	 * maintains the queue and auto-next logic.
	 *
	 * @param itemId - Optional ID to verify the completed item
	 * @returns Promise<boolean> - true if advanced to next item, false if playlist ended
	 *
	 * @example
	 * // In your Video component's onEnd handler:
	 * const currentItem = playlistsManager.getCurrentItem();
	 * const sourceUri = currentItem?.resolvedSources?.local?.uri;
	 *
	 * <Video
	 *   source={{ uri: sourceUri }}
	 *   onEnd={async () => {
	 *     const hasNext = await playlistsManager.notifyItemCompleted(currentItem.id);
	 *     if (hasNext) {
	 *       const nextItem = playlistsManager.getCurrentItem();
	 *       const nextUri = nextItem?.resolvedSources?.local?.uri;
	 *       setCurrentSource({ uri: nextUri });
	 *     }
	 *   }}
	 * />
	 */
	public async notifyItemCompleted(itemId?: string): Promise<boolean> {
		this.ensureInitialized();

		const currentItem = this.getCurrentItem();

		// Verify item ID matches if provided
		if (itemId && currentItem?.id !== itemId) {
			this.logger.warn(
				LOG_TAGS.PLAYLISTS_MANAGER,
				`Item completion ID mismatch: expected ${currentItem?.id}, got ${itemId}`
			);
		}

		// Update item status
		if (currentItem) {
			const index = this.items.findIndex(item => item.id === currentItem.id);
			if (index !== -1) {
				this.items[index]!.status = PlaylistItemStatus.COMPLETED;
			}
		}

		// Emit completion event
		this.emit(PlaylistEventType.ITEM_COMPLETED, {
			itemId: currentItem?.id || itemId || "",
			index: this.currentIndex,
			timestamp: Date.now(),
		});

		this.logger.debug(
			LOG_TAGS.PLAYLISTS_MANAGER,
			`Item completed notification: ${currentItem?.id}`
		);

		// Auto-advance if type TUDUM
		if (currentItem?.type === PlaylistItemType.TUDUM) {
			this.logger.debug(
				LOG_TAGS.PLAYLISTS_MANAGER,
				"Auto-advancing to next item because current item is TUDUM"
			);
			return await this.goToNext();
		}

		// Auto-advance if enabled
		if (this.playlistConfig.autoNext) {
			this.logger.debug(LOG_TAGS.PLAYLISTS_MANAGER, "Auto-advancing to next item");
			return await this.goToNext();
		}

		return false;
	}

	/**
	 * Update the current index without loading the item
	 * Useful for syncing PlaylistsManager state with external player position
	 * @param index - The new current index
	 */
	public setCurrentIndex(index: number): void {
		this.ensureInitialized();

		if (index < 0 || index >= this.items.length) {
			throw new PlayerError("PLAYLIST_INVALID_INDEX", {
				index,
				maxIndex: this.items.length - 1,
			});
		}

		const previousIndex = this.currentIndex;
		const previousItem = this.getCurrentItem();

		this.currentIndex = index;
		const currentItem = this.getCurrentItem();

		// Emit event
		this.emit(PlaylistEventType.ITEM_CHANGED, {
			previousItem,
			currentItem,
			previousIndex,
			currentIndex: index,
			reason: "user",
			timestamp: Date.now(),
		} as ItemChangedEventData);

		this.logger.debug(LOG_TAGS.PLAYLISTS_MANAGER, `Current index updated to ${index}`);
	}

	public async goToItem(itemId: string): Promise<void> {
		this.ensureInitialized();

		const index = this.items.findIndex(item => item.id === itemId);
		if (index === -1) {
			throw new PlayerError("PLAYLIST_ITEM_NOT_FOUND", { itemId });
		}

		await this.goToIndex(index, "goto");
	}

	public async insertItem(item: PlaylistItem, index: number): Promise<void> {
		this.ensureInitialized();

		try {
			if (index < 0 || index > this.items.length) {
				throw new PlayerError("PLAYLIST_INVALID_INDEX", {
					index,
					maxIndex: this.items.length,
				});
			}

			const validatedItem = this.validateItem(item);
			this.items.splice(index, 0, validatedItem);

			// Ajustar currentIndex si es necesario
			if (index <= this.currentIndex) {
				this.currentIndex++;
			}

			if (this.nativeModule) {
				await this.nativeModule.insertItem(validatedItem, index);
			}

			await this.persistAndNotify("inserted", [validatedItem.id]);
			this.logger.debug(
				LOG_TAGS.PLAYLISTS_MANAGER,
				`Item inserted at index ${index}: ${validatedItem.id}`
			);
		} catch (error) {
			this.logger.error(LOG_TAGS.PLAYLISTS_MANAGER, "Failed to insert item", error);
			throw new PlayerError("PLAYLIST_INSERT_ITEM_FAILED", {
				originalError: error,
				itemId: item.id,
				index,
			});
		}
	}

	public async addItems(
		items: PlaylistItem[],
		options?: Partial<{ continueOnError: boolean }>
	): Promise<void> {
		this.ensureInitialized();

		const opts = {
			continueOnError: true,
			...options,
		};

		try {
			const validatedItems: PlaylistItem[] = [];
			const errors: Array<{ item: PlaylistItem; error: any }> = [];

			for (const item of items) {
				try {
					const validated = this.validateItem(item);
					validatedItems.push(validated);
					this.items.push(validated);
				} catch (error) {
					errors.push({ item, error });
					if (!opts.continueOnError) {
						throw error;
					}
				}
			}

			if (this.nativeModule && validatedItems.length > 0) {
				await this.nativeModule.addItems(validatedItems);
			}

			if (validatedItems.length > 0) {
				await this.persistAndNotify(
					"added",
					validatedItems.map(item => item.id)
				);
			}

			this.logger.info(
				LOG_TAGS.PLAYLISTS_MANAGER,
				`Added ${validatedItems.length} items (${errors.length} errors)`
			);

			if (errors.length > 0 && !opts.continueOnError) {
				throw new PlayerError("PLAYLIST_ADD_ITEMS_PARTIAL_FAILURE", {
					successCount: validatedItems.length,
					errorCount: errors.length,
					errors: errors.map(e => e.error),
				});
			}
		} catch (error) {
			this.logger.error(LOG_TAGS.PLAYLISTS_MANAGER, "Failed to add items", error);
			throw new PlayerError("PLAYLIST_ADD_ITEMS_FAILED", {
				originalError: error,
				itemCount: items.length,
			});
		}
	}

	public findItems(
		filter: Partial<{
			type: PlaylistItemType;
			status: PlaylistItemStatus;
			searchText: string;
			ids: string[];
		}>
	): PlaylistItem[] {
		let results = [...this.items];

		if (filter.type) {
			results = results.filter(item => item.type === filter.type);
		}

		if (filter.status) {
			results = results.filter(item => item.status === filter.status);
		}

		if (filter.ids && filter.ids.length > 0) {
			results = results.filter(item => filter.ids!.includes(item.id));
		}

		if (filter.searchText) {
			const searchLower = filter.searchText.toLowerCase();
			results = results.filter(item => {
				const titleMatch = item?.metadata?.title?.toLowerCase().includes(searchLower);
				const artistMatch = item?.metadata?.artist?.toLowerCase().includes(searchLower);
				return titleMatch || artistMatch;
			});
		}

		return results.map(item => ({ ...item }));
	}

	public getState(): PlaylistState {
		return {
			items: this.getItems(),
			currentIndex: this.currentIndex,
			currentItem: this.getCurrentItem(),
			totalItems: this.items.length,
			repeatMode: this.playlistConfig.repeatMode!,
			shuffleMode: this.playlistConfig.shuffleMode!,
			autoNextEnabled: this.playlistConfig.autoNext!,
			isPlaying: this.isPlaying,
			hasEnded: this.hasEnded,
		};
	}

	public getConfig(): PlaylistConfig {
		return { ...this.playlistConfig };
	}

	public getStats(): PlaylistStats {
		const completed = this.items.filter(i => i.status === PlaylistItemStatus.COMPLETED).length;
		const error = this.items.filter(i => i.status === PlaylistItemStatus.ERROR).length;
		const skipped = this.items.filter(i => i.status === PlaylistItemStatus.SKIPPED).length;
		const pending = this.items.filter(
			i => i.status === PlaylistItemStatus.PENDING || !i.status
		).length;

		const totalDuration = this.items.reduce((sum, item) => sum + (item.duration || 0), 0);
		const playedDuration = this.items
			.filter(i => i.status === PlaylistItemStatus.COMPLETED)
			.reduce((sum, item) => sum + (item.duration || 0), 0);

		return {
			totalItems: this.items.length,
			completedItems: completed,
			errorItems: error,
			skippedItems: skipped,
			pendingItems: pending,
			totalDuration,
			playedDuration,
			overallProgress: totalDuration > 0 ? (playedDuration / totalDuration) * 100 : 0,
		};
	}

	public on(event: PlaylistEventType, callback: (...args: any[]) => void): void {
		this.eventEmitter.on(event, callback);
	}

	public off(event: PlaylistEventType, callback: (...args: any[]) => void): void {
		this.eventEmitter.off(event, callback);
	}

	public removeAllListeners(event?: PlaylistEventType): void {
		if (event) {
			this.eventEmitter.removeAllListeners(event);
		} else {
			this.eventEmitter.removeAllListeners();
		}
	}

	public async destroy(): Promise<void> {
		this.nativeListeners.forEach(listener => listener.remove());
		this.nativeListeners = [];
		this.eventEmitter.removeAllListeners();

		if (this.config.enablePersistence) {
			await this.saveState();
		}

		this.isInitialized = false;
		this.logger.info(LOG_TAGS.PLAYLISTS_MANAGER, "Destroyed");
	}

	// Private helper methods

	private ensureInitialized(): void {
		if (!this.isInitialized) {
			throw new PlayerError("PLAYLIST_NOT_INITIALIZED");
		}
	}

	private emit(event: PlaylistEventType, data: any): void {
		this.eventEmitter.emit(event, data);
	}

	private validateItem(item: PlaylistItem): PlaylistItem {
		// Validar que tenga al menos un source válido
		const hasLocalSource = item.resolvedSources?.local?.uri;
		const hasCastSource = item.resolvedSources?.cast?.uri;
		const hasDownloadSource = item.resolvedSources?.download?.uri;

		if (!hasLocalSource && !hasCastSource && !hasDownloadSource) {
			throw new PlayerError("PLAYLIST_INVALID_ITEM", {
				reason: "Missing resolvedSources - at least one source (local, cast, or download) is required",
			});
		}

		// Generar ID basado en el primer source disponible
		const uriForId = hasLocalSource || hasCastSource || hasDownloadSource || "unknown";

		return {
			...item,
			id: item.id || this.generateItemId(uriForId),
			status: item.status || PlaylistItemStatus.PENDING,
			addedAt: item.addedAt || Date.now(),
		};
	}

	private validateItems(items: PlaylistItem[]): PlaylistItem[] {
		return items.map(item => this.validateItem(item));
	}

	private generateItemId(uri: string): string {
		const clean = uri.replace(/[^a-zA-Z0-9]/g, "_");
		const timestamp = Date.now().toString(36);
		return `${clean.substring(0, 20)}_${timestamp}`;
	}

	private shuffleItems(items: PlaylistItem[]): PlaylistItem[] {
		const shuffled = [...items];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			// Fisher-Yates shuffle - los índices siempre son válidos
			const temp = shuffled[i]!;
			shuffled[i] = shuffled[j]!;
			shuffled[j] = temp;
		}
		return shuffled;
	}

	private restoreOriginalOrder(): PlaylistItem[] {
		return this.originalOrder
			.map(id => this.items.find(item => item.id === id))
			.filter((item): item is PlaylistItem => item !== undefined);
	}

	private getNextIndex(): number {
		if (this.items.length === 0) return -1;

		// Modo ONE: repetir actual
		if (this.playlistConfig.repeatMode === PlaylistRepeatMode.ONE) {
			return this.currentIndex;
		}

		// Siguiente item
		const next = this.currentIndex + 1;

		// Modo ALL: volver al inicio
		if (next >= this.items.length) {
			return this.playlistConfig.repeatMode === PlaylistRepeatMode.ALL ? 0 : -1;
		}

		return next;
	}

	private getPreviousIndex(): number {
		if (this.items.length === 0) return -1;

		const previous = this.currentIndex - 1;

		// Volver al final si repeat ALL
		if (previous < 0) {
			return this.playlistConfig.repeatMode === PlaylistRepeatMode.ALL
				? this.items.length - 1
				: -1;
		}

		return previous;
	}

	private adjustCurrentIndex(removedIndex: number): void {
		if (removedIndex < this.currentIndex) {
			this.currentIndex--;
		} else if (removedIndex === this.currentIndex) {
			if (this.items.length === 0) {
				this.currentIndex = -1;
				this.hasEnded = true;
			} else if (this.currentIndex >= this.items.length) {
				this.currentIndex = this.items.length - 1;
			}
		}
	}

	private async updateConfig(update: Partial<PlaylistConfig>): Promise<void> {
		const previousConfig = { ...this.playlistConfig };
		this.playlistConfig = { ...this.playlistConfig, ...update };

		if (this.config.enablePersistence) {
			await this.saveState();
		}

		this.emit(PlaylistEventType.CONFIG_CHANGED, {
			previousConfig,
			currentConfig: this.playlistConfig,
			changedKeys: Object.keys(update),
			timestamp: Date.now(),
		} as ConfigChangedEventData);
	}

	private async persistAndNotify(
		action: "added" | "removed" | "inserted",
		itemIds: string[]
	): Promise<void> {
		if (this.config.enablePersistence) {
			await this.saveState();
		}

		this.emit(PlaylistEventType.PLAYLIST_UPDATED, {
			totalItems: this.items.length,
			currentIndex: this.currentIndex,
			action,
			affectedItemIds: itemIds,
			timestamp: Date.now(),
		} as PlaylistUpdatedEventData);
	}

	private async sendPlaylistToNative(): Promise<void> {
		if (!this.nativeModule) return;

		try {
			await this.nativeModule.setPlaylist(this.items, {
				startAt: this.currentIndex,
				config: this.playlistConfig,
			});
		} catch (error) {
			this.logger.error(
				LOG_TAGS.PLAYLISTS_MANAGER,
				"Failed to send playlist to native",
				error
			);
		}
	}

	private async saveState(): Promise<void> {
		try {
			const state = {
				items: this.items,
				currentIndex: this.currentIndex,
				config: this.playlistConfig,
				originalOrder: this.originalOrder,
			};
			await AsyncStorage.setItem(this.config.persistenceKey, JSON.stringify(state));
		} catch (error) {
			this.logger.error(LOG_TAGS.PLAYLISTS_MANAGER, "Failed to save state", error);
		}
	}

	private async restoreState(): Promise<void> {
		try {
			const data = await AsyncStorage.getItem(this.config.persistenceKey);
			if (data) {
				const state = JSON.parse(data);
				this.items = state.items || [];
				this.currentIndex = state.currentIndex || -1;
				this.playlistConfig = { ...this.playlistConfig, ...state.config };
				this.originalOrder = state.originalOrder || [];
				this.logger.info(LOG_TAGS.PLAYLISTS_MANAGER, "State restored");
			}
		} catch (error) {
			this.logger.warn(LOG_TAGS.PLAYLISTS_MANAGER, "Failed to restore state", error);
		}
	}

	// Native event handlers

	private handleNativeItemChanged(data: any): void {
		this.currentIndex = data.index;

		// Enriquecer evento con item actual del array JS
		const currentItem = this.items[data.index];

		this.emit(PlaylistEventType.ITEM_CHANGED, {
			...data,
			currentItem, // Agregar referencia al item JS
			totalItems: this.items.length,
			timestamp: data.timestamp || Date.now(),
		} as ItemChangedEventData);
	}

	private handleNativeItemStarted(data: any): void {
		this.isPlaying = true;
		this.emit(PlaylistEventType.ITEM_STARTED, data);
	}

	private handleNativeItemCompleted(data: any): void {
		const index = this.items.findIndex(i => i.id === data.itemId);
		if (index !== -1) {
			try {
				this.items[index]!.status = PlaylistItemStatus.COMPLETED;
			} catch (error) {
				// Ignorar si el objeto está frozen - el status no es crítico
			}
		}
		this.emit(PlaylistEventType.ITEM_COMPLETED, data);
	}

	private handleNativeItemError(data: any): void {
		const index = this.items.findIndex(i => i.id === data.itemId);
		if (index !== -1) {
			try {
				this.items[index]!.status = PlaylistItemStatus.ERROR;
			} catch (error) {
				// Ignorar si el objeto está frozen - el status no es crítico
			}
		}

		if (this.playlistConfig.skipOnError) {
			this.goToNext().catch(error =>
				this.logger.error(LOG_TAGS.PLAYLISTS_MANAGER, "Failed to skip after error", error)
			);
		}

		this.emit(PlaylistEventType.ITEM_ERROR, data);
	}

	private handleNativeProgressUpdate(data: any): void {
		this.emit(PlaylistEventType.PROGRESS_UPDATED, data);
	}

	private handleNativePlaylistEnded(): void {
		this.hasEnded = true;
		this.isPlaying = false;
		this.emit(PlaylistEventType.PLAYLIST_ENDED, { timestamp: Date.now() });
	}
}

// Export singleton instance
export const playlistsManager = PlaylistsManager.getInstance();
