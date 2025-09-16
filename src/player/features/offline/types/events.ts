import { DownloadError } from './items';

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
