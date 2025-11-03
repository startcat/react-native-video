import { LogLevel } from "../../logger";
import { SubtitleFormat } from "./download";

/*
 * Tipos específicos del servicio de descargas de subtítulos
 *
 */

export interface SubtitleDownloadTask {
	id: string;
	downloadId: string; // ID de la descarga padre (stream/binary)
	uri: string;
	language: string;
	label: string;
	format: SubtitleFormat;
	isDefault: boolean;
	encoding?: string;
}

export interface SubtitleDownloadProgress {
	subtitleId: string;
	downloadId: string;
	bytesDownloaded: number;
	totalBytes: number;
	percent: number;
}

export interface SubtitleDownloadResult {
	subtitleId: string;
	downloadId: string;
	localPath: string;
	fileSize: number;
	format: SubtitleFormat;
	downloadedAt: number;
}

export enum SubtitleDownloadEventType {
	STARTED = "subtitle_download_started",
	PROGRESS = "subtitle_download_progress",
	COMPLETED = "subtitle_download_completed",
	FAILED = "subtitle_download_failed",
}

export interface SubtitleServiceConfig {
	maxConcurrentDownloads: number;
	requestTimeout: number;
	maxRetries: number;
	validateContent: boolean;
	logEnabled: boolean;
	logLevel: LogLevel;
}
