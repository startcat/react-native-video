import { LogLevel } from "../../logger";

export interface DRMServiceConfig {
	logEnabled?: boolean;
	logLevel?: LogLevel;
	maxLicenseRetries?: number;
	licenseTimeout?: number;
	cacheLicenses?: boolean;
}

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
