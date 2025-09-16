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

export enum DRMType {
    WIDEVINE = 'widevine',
    PLAYREADY = 'playready',
    CLEARKEY = 'clearkey',
    FAIRPLAY = 'fairplay',
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

export type Drm = Readonly<{
    type?: DRMType;
    licenseServer?: string;
    headers?: Record<string, string>;
    contentId?: string; // ios
    certificateUrl?: string; // ios
    base64Certificate?: boolean; // ios default: false
    /* eslint-disable @typescript-eslint/no-unused-vars */
    getLicense?: (
        spcBase64: string,
        contentId: string,
        licenseUrl: string,
        loadedLicenseUrl: string,
    ) => void; // ios
    /* eslint-enable @typescript-eslint/no-unused-vars */
}>;

export interface DownloadError {
    code: DownloadErrorCode;
    message: string;
    details?: any;
    timestamp: number;
}

export interface DownloadItem {
    media?: any; // Metadatos del video, que dependen de proyecto
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
