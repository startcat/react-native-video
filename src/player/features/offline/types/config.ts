import { LogLevel } from '../../logger';
import { Drm } from './items';

export type ConfigDownloads = {
    download_just_wifi?: boolean;
    max_concurrent_downloads?: number;
    auto_resume_on_network?: boolean;
    storage_warning_threshold?: number; // 0-1 percentage
    min_free_space_mb?: number;
    retry_attempts?: number;
    retry_delay_ms?: number;
    chunk_size_bytes?: number;
    progress_update_interval_ms?: number;
};

export interface PersistenceConfig {
    storageKey?: string;
    encryptionEnabled?: boolean;
    compressionEnabled?: boolean;
    autoSave?: boolean;
    autoSaveInterval?: number;
}

export interface DRMServiceConfig {
    logEnabled?: boolean;
    logLevel?: LogLevel;
    maxLicenseRetries?: number;
    licenseTimeout?: number;
    cacheLicenses?: boolean;
}

export interface StreamDownloadConfig {
    type: 'DASH' | 'HLS';
    quality?: 'auto' | 'low' | 'medium' | 'high' | 'max';
    audioLanguages?: string[];
    subtitleLanguages?: string[];
    drm?: Drm;
}