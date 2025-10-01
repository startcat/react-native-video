/*
 * Servicio singleton para descargar subtítulos asociados a streams/binaries
 * Usa llamadas HTTP simples sin colas complejas (archivos pequeños)
 */

import { EventEmitter } from "eventemitter3";
import RNFS from "react-native-fs";
import { PlayerError } from "../../../../core/errors";
import { Logger } from "../../../logger";
import { LOG_TAGS } from "../../constants";
import { DEFAULT_CONFIG_SUBTITLE, LOGGER_DEFAULTS } from "../../defaultConfigs";
import {
	DownloadedSubtitleItem,
	SubtitleDownloadEventType,
	SubtitleDownloadResult,
	SubtitleDownloadState,
	SubtitleDownloadTask,
	SubtitleFormat,
	SubtitleServiceConfig,
} from "../../types";
import { storageService } from "../storage/StorageService";

const TAG = LOG_TAGS.DOWNLOAD_SERVICE;

/*
 * Servicio singleton para descargar subtítulos
 * Usa llamadas HTTP simples sin colas complejas
 *
 */

export class SubtitleDownloadService {
	private static instance: SubtitleDownloadService;
	private eventEmitter: EventEmitter;
	private config: SubtitleServiceConfig;
	private currentLogger: Logger;
	private activeDownloads: Map<string, AbortController>;
	private downloadedSubtitles: Map<string, DownloadedSubtitleItem[]>; // downloadId -> subtitles

	private constructor() {
		this.eventEmitter = new EventEmitter();
		this.config = DEFAULT_CONFIG_SUBTITLE;
		this.currentLogger = new Logger({
			...LOGGER_DEFAULTS,
			enabled: this.config.logEnabled,
			level: this.config.logLevel,
		});

		this.activeDownloads = new Map();
		this.downloadedSubtitles = new Map();
	}

	public static getInstance(): SubtitleDownloadService {
		if (!SubtitleDownloadService.instance) {
			SubtitleDownloadService.instance = new SubtitleDownloadService();
		}
		return SubtitleDownloadService.instance;
	}

	/*
	 * Inicializa el servicio
	 *
	 */

	public async initialize(config?: Partial<SubtitleServiceConfig>): Promise<void> {
		if (config) {
			this.config = { ...this.config, ...config };
			this.currentLogger.updateConfig({
				enabled: this.config.logEnabled,
				level: this.config.logLevel,
			});
		}

		// Asegurar que el directorio de subtítulos existe
		const subtitlesDir = storageService.getSubtitlesDirectory();
		await storageService.createDirectory(subtitlesDir);

		this.currentLogger.info(TAG, "SubtitleDownloadService initialized", {
			subtitlesDirectory: subtitlesDir,
			config: this.config,
		});
	}

	/*
	 * Descarga subtítulos para una descarga específica
	 *
	 */

	public async downloadSubtitles(
		downloadId: string,
		subtitles: SubtitleDownloadTask[]
	): Promise<DownloadedSubtitleItem[]> {
		if (!subtitles || subtitles.length === 0) {
			this.currentLogger.debug(TAG, `No subtitles to download for ${downloadId}`);
			return [];
		}

		this.currentLogger.info(TAG, `Downloading ${subtitles.length} subtitles for ${downloadId}`);

		const results: DownloadedSubtitleItem[] = [];

		// Descargar subtítulos en paralelo (son archivos pequeños)
		const downloadPromises = subtitles.map(subtitle => this.downloadSingleSubtitle(subtitle));

		const settled = await Promise.allSettled(downloadPromises);

		// Procesar resultados
		for (let i = 0; i < settled.length; i++) {
			const result = settled[i];
			const subtitle = subtitles[i];

			if (!result || !subtitle) continue;

			if (result.status === "fulfilled") {
				results.push(result.value);
				this.currentLogger.info(
					TAG,
					`Subtitle downloaded: ${subtitle.language} (${subtitle.id})`
				);
			} else {
				// Crear item fallido
				const failedItem: DownloadedSubtitleItem = {
					id: subtitle.id,
					language: subtitle.language,
					label: subtitle.label,
					state: SubtitleDownloadState.FAILED,
					isDefault: subtitle.isDefault,
					uri: subtitle.uri,
					format: subtitle.format,
					encoding: subtitle.encoding,
					error: result.reason,
					retryCount: this.config.maxRetries,
				};
				results.push(failedItem);

				this.currentLogger.error(
					TAG,
					`Subtitle download failed: ${subtitle.language}`,
					result.reason
				);
			}
		}

		// Guardar resultados
		this.downloadedSubtitles.set(downloadId, results);

		return results;
	}

	/*
	 * Descarga un único subtítulo
	 *
	 */

	private async downloadSingleSubtitle(
		task: SubtitleDownloadTask
	): Promise<DownloadedSubtitleItem> {
		const abortController = new AbortController();
		this.activeDownloads.set(task.id, abortController);

		try {
			// Emitir evento de inicio
			this.eventEmitter.emit(SubtitleDownloadEventType.STARTED, {
				subtitleId: task.id,
				downloadId: task.downloadId,
				language: task.language,
				uri: task.uri,
			});

			// Generar nombre de archivo
			const filename = this.generateFilename(task);
			const subtitlesDir = storageService.getSubtitlesDirectory();
			const localPath = `${subtitlesDir}/${filename}`;

			// Descargar con reintentos
			let lastError: any = null;
			for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
				try {
					if (attempt > 0) {
						this.currentLogger.debug(
							TAG,
							`Retry ${attempt}/${this.config.maxRetries} for ${task.language}`
						);
						await this.delay(1000 * attempt); // Backoff exponencial
					}

					const result = await this.downloadFile(
						task.uri,
						localPath,
						task,
						abortController.signal
					);

					// Validar contenido si está habilitado
					if (this.config.validateContent) {
						await this.validateSubtitleContent(localPath, task.format);
					}

					// Crear item exitoso
					const downloadedItem: DownloadedSubtitleItem = {
						id: task.id,
						language: task.language,
						label: task.label,
						state: SubtitleDownloadState.COMPLETED,
						isDefault: task.isDefault,
						uri: task.uri,
						localPath: localPath,
						format: task.format,
						encoding: task.encoding || "utf-8",
						fileSize: result.fileSize,
						downloadedAt: Date.now(),
						retryCount: attempt,
					};

					// Emitir evento de completado
					this.eventEmitter.emit(SubtitleDownloadEventType.COMPLETED, {
						subtitleId: task.id,
						downloadId: task.downloadId,
						localPath: localPath,
						fileSize: result.fileSize,
					});

					return downloadedItem;
				} catch (error: any) {
					lastError = error;
					if (attempt === this.config.maxRetries) {
						throw error;
					}
				}
			}

			throw lastError;
		} catch (error: any) {
			// Emitir evento de error
			this.eventEmitter.emit(SubtitleDownloadEventType.FAILED, {
				subtitleId: task.id,
				downloadId: task.downloadId,
				error: error.message || "Unknown error",
			});

			throw new PlayerError("SUBTITLE_DOWNLOAD_FAILED", {
				originalError: error,
				subtitleId: task.id,
				language: task.language,
				uri: task.uri,
			});
		} finally {
			this.activeDownloads.delete(task.id);
		}
	}

	/*
	 * Descarga el archivo usando fetch
	 *
	 */

	private async downloadFile(
		uri: string,
		localPath: string,
		task: SubtitleDownloadTask,
		signal: AbortSignal
	): Promise<SubtitleDownloadResult> {
		try {
			// Timeout promise
			const timeoutPromise = new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error("Download timeout")), this.config.requestTimeout)
			);

			// Fetch promise
			const fetchPromise = fetch(uri, {
				signal,
				headers: {
					"User-Agent": "react-native-video-offline-subtitles/1.0",
				},
			});

			// Race entre timeout y fetch
			const response = await Promise.race([fetchPromise, timeoutPromise]);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			// Obtener tamaño total
			const totalBytes = parseInt(response.headers.get("content-length") || "0", 10);

			// Leer contenido
			const text = await response.text();
			const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
			const bytesDownloaded = blob.size;

			// Emitir progreso
			this.eventEmitter.emit(SubtitleDownloadEventType.PROGRESS, {
				subtitleId: task.id,
				downloadId: task.downloadId,
				bytesDownloaded,
				totalBytes: totalBytes || bytesDownloaded,
				percent: 100,
			});

			// Guardar archivo
			await RNFS.writeFile(localPath, text, "utf8");

			this.currentLogger.debug(
				TAG,
				`Subtitle downloaded: ${task.language} (${bytesDownloaded} bytes)`
			);

			return {
				subtitleId: task.id,
				downloadId: task.downloadId,
				localPath,
				fileSize: bytesDownloaded,
				format: task.format,
				downloadedAt: Date.now(),
			};
		} catch (error: any) {
			if (error.name === "AbortError") {
				throw new Error("Download cancelled");
			}
			throw error;
		}
	}

	/*
	 * Valida que el contenido del subtítulo sea válido
	 *
	 */

	private async validateSubtitleContent(
		localPath: string,
		format: SubtitleFormat
	): Promise<void> {
		try {
			const content = await RNFS.readFile(localPath, "utf8");

			if (!content || content.trim().length === 0) {
				throw new Error("Subtitle file is empty");
			}

			// Validaciones básicas según formato
			switch (format) {
				case SubtitleFormat.VTT:
					if (!content.startsWith("WEBVTT")) {
						throw new Error("Invalid VTT format: missing WEBVTT header");
					}
					break;

				case SubtitleFormat.SRT:
					// SRT debe tener números de secuencia
					if (!/^\d+\s*$/m.test(content)) {
						throw new Error("Invalid SRT format: missing sequence numbers");
					}
					break;

				case SubtitleFormat.TTML:
					if (!content.includes("<tt") && !content.includes("<tt:tt")) {
						throw new Error("Invalid TTML format: missing <tt> root element");
					}
					break;

				// Otros formatos: validación básica
				default:
					// Solo verificar que no esté vacío
					break;
			}

			this.currentLogger.debug(TAG, `Subtitle validation passed: ${format}`);
		} catch (error) {
			throw new PlayerError("SUBTITLE_VALIDATION_FAILED", {
				originalError: error,
				localPath,
				format,
			});
		}
	}

	/*
	 * Genera nombre de archivo para el subtítulo
	 *
	 */

	private generateFilename(task: SubtitleDownloadTask): string {
		const timestamp = Date.now();
		const extension = this.getExtensionForFormat(task.format);
		const sanitizedLanguage = task.language.replace(/[^a-zA-Z0-9-_]/g, "_");

		return `${task.downloadId}_${sanitizedLanguage}_${timestamp}${extension}`;
	}

	/*
	 * Obtiene la extensión según el formato
	 *
	 */

	private getExtensionForFormat(format: SubtitleFormat): string {
		switch (format) {
			case SubtitleFormat.VTT:
				return ".vtt";
			case SubtitleFormat.SRT:
				return ".srt";
			case SubtitleFormat.TTML:
				return ".ttml";
			case SubtitleFormat.SSA:
				return ".ssa";
			case SubtitleFormat.ASS:
				return ".ass";
			case SubtitleFormat.SUB:
				return ".sub";
			default:
				return ".txt";
		}
	}

	/*
	 * Obtiene subtítulos descargados para una descarga
	 *
	 */

	public getSubtitlesForDownload(downloadId: string): DownloadedSubtitleItem[] {
		return this.downloadedSubtitles.get(downloadId) || [];
	}

	/*
	 * Elimina subtítulos de una descarga
	 *
	 */

	public async deleteSubtitles(downloadId: string): Promise<void> {
		const subtitles = this.downloadedSubtitles.get(downloadId);

		if (!subtitles || subtitles.length === 0) {
			return;
		}

		for (const subtitle of subtitles) {
			if (subtitle.localPath && subtitle.state === SubtitleDownloadState.COMPLETED) {
				try {
					const exists = await RNFS.exists(subtitle.localPath);
					if (exists) {
						await RNFS.unlink(subtitle.localPath);
						this.currentLogger.debug(
							TAG,
							`Deleted subtitle: ${subtitle.language} (${subtitle.localPath})`
						);
					}
				} catch (error) {
					this.currentLogger.error(
						TAG,
						`Failed to delete subtitle: ${subtitle.language}`,
						error
					);
				}
			}
		}

		this.downloadedSubtitles.delete(downloadId);
	}

	/*
	 * Cancela descarga de subtítulo
	 *
	 */

	public cancelDownload(subtitleId: string): void {
		const controller = this.activeDownloads.get(subtitleId);
		if (controller) {
			controller.abort();
			this.activeDownloads.delete(subtitleId);
			this.currentLogger.info(TAG, `Cancelled subtitle download: ${subtitleId}`);
		}
	}

	/*
	 * Cancela todas las descargas activas
	 *
	 */

	public cancelAllDownloads(): void {
		for (const [id, controller] of this.activeDownloads) {
			controller.abort();
			this.currentLogger.debug(TAG, `Cancelled subtitle download: ${id}`);
		}
		this.activeDownloads.clear();
	}

	/*
	 * Obtiene estadísticas
	 *
	 */

	public getStats(): {
		activeDownloads: number;
		totalDownloaded: number;
		downloadsByLanguage: Map<string, number>;
	} {
		const downloadsByLanguage = new Map<string, number>();

		for (const subtitles of this.downloadedSubtitles.values()) {
			for (const subtitle of subtitles) {
				if (subtitle.state === SubtitleDownloadState.COMPLETED) {
					const count = downloadsByLanguage.get(subtitle.language) || 0;
					downloadsByLanguage.set(subtitle.language, count + 1);
				}
			}
		}

		return {
			activeDownloads: this.activeDownloads.size,
			totalDownloaded: Array.from(this.downloadedSubtitles.values()).reduce(
				(total, subtitles) =>
					total +
					subtitles.filter(s => s.state === SubtitleDownloadState.COMPLETED).length,
				0
			),
			downloadsByLanguage,
		};
	}

	/*
	 * Suscribirse a eventos
	 *
	 */

	public subscribe(event: SubtitleDownloadEventType, callback: (data: any) => void): () => void {
		this.eventEmitter.on(event, callback);
		return () => this.eventEmitter.off(event, callback);
	}

	/*
	 * Limpieza
	 *
	 */

	public destroy(): void {
		this.cancelAllDownloads();
		this.eventEmitter.removeAllListeners();
		this.downloadedSubtitles.clear();
		this.currentLogger.info(TAG, "SubtitleDownloadService destroyed");
	}

	/*
	 * Helper: delay
	 *
	 */

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

// Export singleton instance
export const subtitleDownloadService = SubtitleDownloadService.getInstance();
