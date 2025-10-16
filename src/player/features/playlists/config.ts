import { LogLevel } from "../logger";
import { PlaylistRepeatMode, PlaylistShuffleMode, PlaylistsManagerConfig } from "./types";

export const DEFAULT_CONFIG: PlaylistsManagerConfig = {
	logEnabled: true,
	logLevel: LogLevel.INFO,
	defaultPlaylistConfig: {
		autoNext: true,
		repeatMode: PlaylistRepeatMode.OFF,
		shuffleMode: PlaylistShuffleMode.OFF,
		startIndex: 0,
		skipOnError: true,
		loadTimeoutMs: 30000,
		coordinatedMode: true, // Por defecto, modo coordinado con Video component
	},
	enablePersistence: true,
	persistenceKey: "@rnvideo:playlist_state",
};
