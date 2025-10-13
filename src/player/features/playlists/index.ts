/*
 * Playlists Module
 *
 * Sistema de gestión de playlists nativo para reproducción en background
 * sin dependencias de JavaScript activo.
 *
 */

export { PlaylistsManager, playlistsManager } from "./PlaylistsManager";
export { resolveSourcesFromManifests, createSimpleResolvedSources } from "./utils/sourceResolver";

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
	ResolvedEPG,
	ResolvedSources,
} from "./types";

export {
	PlaylistEventType,
	PlaylistItemStatus,
	PlaylistItemType,
	PlaylistRepeatMode,
	PlaylistShuffleMode,
} from "./types";
