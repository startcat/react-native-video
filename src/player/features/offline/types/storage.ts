import { LogLevel } from '../../logger';

export interface StorageServiceConfig {
	logEnabled?: boolean;
	logLevel?: LogLevel;
	downloadDirectory?: string;
	tempDirectory?: string;
	cleanupEnabled?: boolean;
	cleanupIntervalHours?: number;
}

export interface StorageInfoHookConfig extends StorageServiceConfig {
	monitoringInterval?: number;
}

export interface StorageInfo {
	totalSpace: number;
	usedSpace: number;
	availableSpace: number;
	downloadsFolderSize: number;
	lastUpdated: number;
}

export interface FileInfo {
	path: string;
	size: number;
	exists: boolean;
	isDirectory: boolean;
	createdAt?: number;
	modifiedAt?: number;
	mimeType?: string;
}

export enum StorageEventType {
	SPACE_WARNING = 'storage:space_warning',
	SPACE_CRITICAL = 'storage:space_critical',
	SPACE_RECOVERED = 'storage:space_recovered',
	CLEANUP_STARTED = 'storage:cleanup_started',
	CLEANUP_COMPLETED = 'storage:cleanup_completed',
	INFO_UPDATED = 'storage:info_updated',
	FILE_CREATED = 'storage:file_created',
	ERROR = 'storage:error',
}
