/*
 * Playlists Module
 *
 * Sistema de gestión de playlists nativo para reproducción en background
 * sin dependencias de JavaScript activo.
 *
 */

export { PlaylistsManager, playlistsManager } from "./PlaylistsManager";

export type {
	ConfigChangedEventData,
	ItemChangedEventData,
	ItemCompletedEventData,
	ItemErrorEventData,
	ItemStartedEventData,
	PlaylistBatchOptions,
	PlaylistConfig,
	PlaylistEventCallback,
	PlaylistItem,
	PlaylistItemFilter,
	PlaylistItemProgress,
	PlaylistsManagerConfig,
	PlaylistState,
	PlaylistStats,
	PlaylistUpdatedEventData,
	ProgressUpdatedEventData,
} from "./types";

export {
	PlaylistEventType,
	PlaylistItemStatus,
	PlaylistItemType,
	PlaylistRepeatMode,
	PlaylistShuffleMode,
} from "./types";
