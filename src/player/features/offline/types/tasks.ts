import { StreamDownloadConfig } from './config';

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