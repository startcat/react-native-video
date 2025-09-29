import { LogLevel } from '../../logger';
import { IDrm } from '../../../types';

export interface NativeManagerConfig {
    logEnabled: boolean;
    logLevel: LogLevel;
    autoInitialize: boolean;
    eventBufferSize: number;
}

export interface SystemInfo {
    platform: string;
    version: string;
    totalSpace: number;
    availableSpace: number;
    downloadDirectory: string;
    tempDirectory: string;
    maxConcurrentDownloads: number;
    supportsDRM: boolean;
    supportsBackgroundDownloads: boolean;
}

export interface NativeDownloadConfig {
    id: string;
    uri: string;
    title: string;
    quality?: 'auto' | 'low' | 'medium' | 'high' | 'max';
    allowCellular?: boolean;
    drm?: IDrm | null;
    subtitles?: Array<{
        language: string;
        uri: string;
        label?: string;
    }>;
}

export interface NativeDownloadStats {
    totalDownloads: number;
    activeDownloads: number;
    completedDownloads: number;
    failedDownloads: number;
    totalBytes: number;
    downloadedBytes: number;
    avgSpeed: number;
}

// Tipos de eventos del manager
export type NativeManagerEventType = 
    | 'module_ready'
    | 'module_error'
    | 'download_progress'
    | 'download_state_changed'
    | 'download_completed'
    | 'download_error'
    | 'license_downloaded'
    | 'license_error' 
    | 'license_expired'
    | 'license_check'
    | 'license_check_failed'
    | 'system_info_updated';

export type NativeManagerEventCallback = (data?: any) => void;
