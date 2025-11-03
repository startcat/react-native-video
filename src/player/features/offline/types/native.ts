import { LogLevel } from "../../logger";
import { IDrm } from "../../../types";

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
	quality?: "auto" | "low" | "medium" | "high" | "max";
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
	| "module_ready"
	| "module_error"
	| "download_progress"
	| "download_state_changed"
	| "download_completed"
	| "download_error"
	| "license_downloaded"
	| "license_error"
	| "license_expired"
	| "license_check"
	| "license_check_failed"
	| "system_info_updated";

// Event data types for each native manager event
export type NativeManagerEventData =
	| { downloadId: string; progress: number; bytesDownloaded: number; totalBytes: number } // download_progress
	| { downloadId: string; state: string; previousState?: string } // download_state_changed
	| { downloadId: string; filePath: string; fileSize: number } // download_completed
	| { downloadId: string; error: { code: string; message: string; details?: unknown } } // download_error
	| { downloadId: string; licenseUri: string } // license_downloaded
	| { downloadId: string; error: { code: string; message: string } } // license_error
	| { downloadId: string; expiryDate: number } // license_expired
	| { downloadId: string } // license_check
	| { downloadId: string; reason: string } // license_check_failed
	| { systemInfo: SystemInfo } // system_info_updated
	| { error: { code: string; message: string } } // module_error
	| void; // module_ready

export type NativeManagerEventCallback = (data?: NativeManagerEventData) => void;
