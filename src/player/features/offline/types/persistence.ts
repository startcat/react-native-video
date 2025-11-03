import { LogLevel } from "../../logger";
import { ConfigDownloads } from "./config";
import { DownloadItem } from "./download";
import { ProfileDownloadMapping } from "./profiles";

export interface PersistenceConfig {
	logEnabled?: boolean;
	logLevel?: LogLevel;
	storageKey?: string;
	encryptionEnabled?: boolean;
	compressionEnabled?: boolean;
}

export interface PersistedData {
	version: number;
	downloads: Array<[string, DownloadItem]>;
	queue: string[];
	profileMappings: ProfileDownloadMapping[];
	config: ConfigDownloads;
	timestamp: number;
	checksum?: string;
}

export interface BackupData {
	primary: PersistedData | null;
	backup: PersistedData | null;
	lastBackupTime: number;
}

export enum PersistenceEventType {
	SAVE_STARTED = "persistence:save_started",
	SAVE_COMPLETED = "persistence:save_completed",
	SAVE_FAILED = "persistence:save_failed",
	LOAD_STARTED = "persistence:load_started",
	LOAD_COMPLETED = "persistence:load_completed",
	LOAD_FAILED = "persistence:load_failed",
	RESTORE_STARTED = "persistence:restore_started",
	RESTORE_COMPLETED = "persistence:restore_completed",
	RESTORE_FAILED = "persistence:restore_failed",
	MIGRATION_STARTED = "persistence:migration_started",
	MIGRATION_COMPLETED = "persistence:migration_completed",
	DATA_CORRUPTED = "persistence:data_corrupted",
	AUTO_SAVE = "persistence:auto_save",
}

// Event data types for each persistence event
export type PersistenceEventData =
	| { itemCount: number; dataSize: number } // SAVE_COMPLETED
	| { itemCount: number } // LOAD_COMPLETED, RESTORE_COMPLETED
	| { type: string; dataSize: number } // SAVE_COMPLETED (config)
	| { type: string } // LOAD_STARTED, LOAD_COMPLETED (config)
	| { type: string; error: unknown } // LOAD_FAILED (config)
	| { fromVersion: number; toVersion: number } // MIGRATION_STARTED
	| { restoredFromBackup: boolean } // DATA_CORRUPTED
	| Error // SAVE_FAILED, LOAD_FAILED, RESTORE_FAILED
	| void; // Events without data

export type PersistenceEventCallback = (data?: PersistenceEventData) => void;
