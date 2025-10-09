import { LogLevel } from "../logger";
import { PlaylistRepeatMode, PlaylistShuffleMode, PlaylistsManagerConfig } from "./types";

export const DEFAULT_CONFIG: PlaylistsManagerConfig = {
	logEnabled: true,
	logLevel: LogLevel.INFO,
	defaultPlaylistConfig: {
		autoNext: true,
		repeatMode: PlaylistRepeatMode.OFF,
		shuffleMode: PlaylistShuffleMode.OFF,
		preloadNextItemSeconds: 30,
		startIndex: 0,
		skipOnError: true,
		loadTimeoutMs: 30000,
		saveProgress: true,
		saveProgressIntervalSeconds: 10,
	},
	enablePersistence: true,
	persistenceKey: "@rnvideo:playlist_state",
};
