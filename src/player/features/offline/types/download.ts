import { DownloadTask } from 'react-native-background-downloader';
import { LogLevel } from '../../logger';
import { Drm } from './drm';

export enum DownloadStates {
    RESTART = 'RESTART',
    RESTARTING = 'RESTARTING',
    FAILED = 'FAILED',
    REMOVING = 'REMOVING',
    STOPPED = 'STOPPED',
    DOWNLOADING = 'DOWNLOADING',
    NOT_DOWNLOADED = 'NOT_DOWNLOADED',
    COMPLETED = 'COMPLETED',
    QUEUED = 'QUEUED',
    PAUSED = 'PAUSED',
    WAITING_FOR_NETWORK = 'WAITING_FOR_NETWORK',
    PREPARING = 'PREPARING'
}

export enum DownloadEventType {
    STARTED = 'download:started',
    PROGRESS = 'download:progress',
    COMPLETED = 'download:completed',
    FAILED = 'download:failed',
    PAUSED = 'download:paused',
    RESUMED = 'download:resumed',
    CANCELLED = 'download:cancelled',
    QUEUED = 'download:queued',
    REMOVED = 'download:removed',
}

export enum DownloadErrorCode {
    NETWORK_ERROR = 'NETWORK_ERROR',
    INSUFFICIENT_SPACE = 'INSUFFICIENT_SPACE',
    FILE_SYSTEM_ERROR = 'FILE_SYSTEM_ERROR',
    DRM_ERROR = 'DRM_ERROR',
    INVALID_URL = 'INVALID_URL',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    CANCELLED = 'CANCELLED',
    TIMEOUT = 'TIMEOUT',
    UNKNOWN = 'UNKNOWN',
}

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

export interface BinaryDownloadServiceConfig {
    logEnabled: boolean;
    logLevel: LogLevel;
    maxConcurrentDownloads: number;
    progressUpdateInterval: number;
    timeoutMs: number;
    maxRetries: number;
    showNotifications: boolean;
    allowCellular: boolean;
    requiresWifi: boolean;
}

export interface StreamDownloadConfig {
    type: 'DASH' | 'HLS';
    quality?: 'auto' | 'low' | 'medium' | 'high' | 'max';
    audioLanguages?: string[];
    subtitleLanguages?: string[];
    drm?: Drm;
}

export interface ActiveBinaryDownload {
    task: BinaryDownloadTask;
    downloadTask?: DownloadTask;
    startTime: number;
    retryCount: number;
    state: DownloadStates;
    progress: BinaryDownloadProgress;
    error?: DownloadError;
}

export interface DownloadError {
    code: DownloadErrorCode;
    message: string;
    details?: any;
    timestamp: number;
}

export interface StreamDownloadTask {
    id: string;
    manifestUrl: string;
    config: StreamDownloadConfig;
    estimatedSize?: number;
}

export interface BinaryDownloadTask {
    id: string;
    url: string;
    destination: string;
    headers?: Record<string, string>;
    progressInterval?: number;
    resumable?: boolean;
}

export interface BinaryDownloadProgress {
    taskId: string;
    bytesWritten: number;
    totalBytes: number;
    percent: number;
}

export interface ValidationResult {
    isValid: boolean;
    errors?: string[];
    warnings?: string[];
}

export interface DownloadItem {
    media?: any; // Metadatos del video, que dependen de proyecto
    profileId?: string | null; // ID del perfil asociado a la descarga
    retryCount?: number; // Número de reintentos realizados
    offlineData: {
        session_ids: Array<string>;
        source: {
            id: string;
            title: string;
            uri: string;
            type?: string;
            drmScheme?: string;
        };
        state: DownloadStates;
        drm?: Drm;
        percent?: number;
        isBinary?: boolean;
        fileUri?: string;
        bytesDownloaded?: number;
        totalBytes?: number;
        downloadedAt?: number;
        startedAt?: number;
        error?: DownloadError;
    };
}

export interface DownloadMetrics {
    totalDownloaded: number;
    totalFailed: number;
    totalCancelled: number;
    averageSpeed: number;
    averageDuration: number;
    successRate: number;
    dataUsage: {
        wifi: number;
        cellular: number;
        total: number;
    };
}

export interface DownloadProgressEvent {
    downloadId: string;
    percent: number;
    bytesDownloaded: number;
    totalBytes: number;
    speed?: number; // bytes per second
    remainingTime?: number; // seconds
}

export interface DownloadCompleteEvent {
    downloadId: string;
    fileUri: string;
    totalBytes: number;
    duration: number; // milliseconds
}

export interface DownloadFailedEvent {
    downloadId: string;
    error: DownloadError;
}
