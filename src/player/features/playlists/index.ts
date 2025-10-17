/*
 * Playlists Module
 *
 * Sistema de gestión de playlists nativo para reproducción en background
 * sin dependencias de JavaScript activo.
 *
 */

export { PlaylistControl, PlaylistEvents } from "./PlaylistControl";
export type {
	PlaybackState,
	PlaylistControlActionEvent,
	PlaylistEndedEvent,
	PlaylistItemChangedEvent,
	PlaylistItemCompletedEvent,
	PlaylistItemErrorEvent,
	PlaylistItemStartedEvent,
	PlaylistPlaybackStateChangedEvent,
} from "./PlaylistControl";
export { PlaylistsManager, playlistsManager } from "./PlaylistsManager";
export { createSimpleResolvedSources, resolveSourcesFromManifests } from "./utils/sourceResolver";

export type {
	ConfigChangedEventData,
	ItemChangedEventData,
	ItemCompletedEventData,
	ItemErrorEventData,
	ItemStartedEventData,
	liveSettings,
	PlaylistBatchOptions,
	PlaylistConfig,
	PlaylistEventCallback,
	PlaylistItem,
	PlaylistItemFilter,
	PlaylistItemProgress,
	PlaylistItemSimplified,
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
