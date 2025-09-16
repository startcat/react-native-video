import { LogLevel } from '../../logger';

export interface ProfileDownloadMapping {
    profileId: string;
    downloadIds: string[];
    addedAt: number;
}

export interface ProfileManagerConfig {
    logEnabled?: boolean;
    logLevel?: LogLevel;
    maxDownloadsPerProfile?: number;
    autoCleanup?: boolean;
}