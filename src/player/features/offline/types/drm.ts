import { LogLevel } from '../../logger';

export enum DRMType {
    WIDEVINE = 'widevine',
    PLAYREADY = 'playready',
    CLEARKEY = 'clearkey',
    FAIRPLAY = 'fairplay',
}

export interface DRMServiceConfig {
    logEnabled?: boolean;
    logLevel?: LogLevel;
    maxLicenseRetries?: number;
    licenseTimeout?: number;
    cacheLicenses?: boolean;
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

export interface DRMLicenseRequest {
    contentId: string;
    licenseUrl: string;
    headers?: Record<string, string>;
    certificateUrl?: string;
}

export interface DRMLicenseResponse {
    license: string;
    expiresAt?: number;
    restrictions?: {
        hdcpRequired?: boolean;
        maxResolution?: string;
        allowOffline?: boolean;
    };
}