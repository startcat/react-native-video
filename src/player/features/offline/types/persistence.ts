import { LogLevel } from '../../logger';
import { DownloadItem } from "./download";
import { ProfileDownloadMapping } from "./profiles";

export interface PersistenceConfig {
    logEnabled?: boolean;
    logLevel?: LogLevel;
    storageKey?: string;
    encryptionEnabled?: boolean;
    compressionEnabled?: boolean;
    autoSave?: boolean;
    autoSaveInterval?: number;
}

export interface PersistedData {
    version: number;
    downloads: Array<[string, DownloadItem]>;
    queue: string[];
    profileMappings: ProfileDownloadMapping[];
    config: any;
    metrics: any;
    timestamp: number;
    checksum?: string;
}

export interface BackupData {
    primary: PersistedData | null;
    backup: PersistedData | null;
    lastBackupTime: number;
}

export enum PersistenceEventType {
    SAVE_STARTED = 'persistence:save_started',
    SAVE_COMPLETED = 'persistence:save_completed',
    SAVE_FAILED = 'persistence:save_failed',
    LOAD_STARTED = 'persistence:load_started',
    LOAD_COMPLETED = 'persistence:load_completed',
    LOAD_FAILED = 'persistence:load_failed',
    RESTORE_STARTED = 'persistence:restore_started',
    RESTORE_COMPLETED = 'persistence:restore_completed',
    RESTORE_FAILED = 'persistence:restore_failed',
    MIGRATION_STARTED = 'persistence:migration_started',
    MIGRATION_COMPLETED = 'persistence:migration_completed',
    DATA_CORRUPTED = 'persistence:data_corrupted',
    AUTO_SAVE = 'persistence:auto_save',
}
