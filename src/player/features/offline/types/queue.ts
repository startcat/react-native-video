import { LogLevel } from '../../logger';
import { DownloadItem } from './download';

export interface QueueServiceConfig {
    logEnabled: boolean;
    logLevel: LogLevel;
    autoProcess: boolean;
    processIntervalMs: number;
    maxConcurrentDownloads: number;
    maxRetries: number;
}

export interface ExtendedDownloadItem extends DownloadItem {
    profileId?: string | null; // Para filtrar por perfil
    retryCount?: number;
}

export interface QueueEventData {
    downloadId?: string;
    item?: ExtendedDownloadItem;
    percent?: number;
    queueSize?: number;
    error?: any;
}

export type QueueStatusCallback = (data: QueueEventData) => void;

export interface QueueStats {
    total: number;
    pending: number;
    downloading: number;
    paused: number;
    completed: number;
    failed: number;
    isPaused: boolean;
    isProcessing: boolean;
}
