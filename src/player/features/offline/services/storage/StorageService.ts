import { EventEmitter } from "eventemitter3";
import { NativeModules, Platform } from "react-native";
import RNFS from "react-native-fs";
import { PlayerError } from "../../../../core/errors";
import { Logger } from "../../../logger";
import { DEFAULT_CONFIG, DIRECTORIES, LIMITS, LOG_TAGS, PATTERNS } from "../../constants";
import { DEFAULT_CONFIG_STORAGE, LOGGER_DEFAULTS } from "../../defaultConfigs";
import {
	FileInfo,
	StorageEventType,
	StorageInfo,
	StorageServiceConfig,
	ValidationResult,
} from "../../types";
import { formatFileSize } from "../../utils/formatters";
const TAG = LOG_TAGS.STORAGE_SERVICE;

// Obtener módulo nativo para información de almacenamiento precisa
const { DownloadsModule2 } = NativeModules;

/*
 * Servicio singleton para gestión de almacenamiento
 *
 */

export class StorageService {
	private static instance: StorageService;
	private eventEmitter: EventEmitter;
	private config: StorageServiceConfig;
	private currentLogger: Logger;
	private downloadPath: string;
	private tempPath: string;
	private isMonitoring: boolean = false;
	private monitoringInterval: ReturnType<typeof setTimeout> | null = null;
	private isInitialized: boolean = false;
	private initPromise: Promise<void> | null = null;
	private lastWarningLevel: "none" | "warning" | "critical" = "none";

	// Cache para getSystemInfo (evitar exceso de llamadas nativas)
	private systemInfoCache: {
		totalSpace: number;
		availableSpace: number;
		downloadSpace: number;
		timestamp: number;
	} | null = null;
	private readonly CACHE_TTL_MS = 5000; // Cache válido por 5 segundos
	private pendingSystemInfoPromise: Promise<{
		totalSpace: number;
		availableSpace: number;
		downloadSpace: number;
	}> | null = null;
	private pendingDownloadsFolderSizePromise: Promise<number> | null = null;

	private constructor() {
		this.eventEmitter = new EventEmitter();

		this.config = DEFAULT_CONFIG_STORAGE;

		this.currentLogger = new Logger({
			...LOGGER_DEFAULTS,
			enabled: this.config.logEnabled,
			level: this.config.logLevel,
		});

		// Configurar paths según la plataforma
		this.downloadPath = this.getDownloadPath();
		this.tempPath = this.getTempPath();
	}

	/*
	 * Obtiene la instancia singleton del servicio
	 *
	 */

	public static getInstance(): StorageService {
		if (!StorageService.instance) {
			StorageService.instance = new StorageService();
		}
		return StorageService.instance;
	}

	/*
	 * Inicializa el servicio de almacenamiento (idempotente)
	 *
	 */

	public async initialize(config?: Partial<StorageServiceConfig>): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		// Si hay una inicialización en progreso, esperar a que termine
		if (this.initPromise) {
			return this.initPromise;
		}

		// Crear promesa de inicialización
		this.initPromise = this.doInitialize(config);
		await this.initPromise;
		this.isInitialized = true;
		this.initPromise = null;
	}

	/*
	 * Realiza la inicialización real (llamado solo una vez)
	 *
	 */

	private async doInitialize(config?: Partial<StorageServiceConfig>): Promise<void> {
		// Actualizar configuración
		this.config = { ...this.config, ...config };

		this.currentLogger.updateConfig({
			enabled: this.config.logEnabled,
			level: this.config.logLevel,
		});

		// Actualizar paths si se proporcionaron
		if (config?.downloadDirectory) {
			this.downloadPath = this.getDownloadPath(config.downloadDirectory);
		}

		if (config?.tempDirectory) {
			this.tempPath = this.getTempPath(config.tempDirectory);
		}

		// Crear directorios si no existen
		await this.ensureDirectories();

		// Obtener información inicial
		await this.updateStorageInfo();

		// Iniciar limpieza automática si está habilitada
		if (this.config.cleanupEnabled) {
			this.startCleanupScheduler();
		}

		// Log detallado de configuración de paths
		this.currentLogger.info(TAG, "Storage Service initialized", {
			downloadPath: this.downloadPath,
			tempPath: this.tempPath,
			subtitlesPath: this.getSubtitlesDirectory(),
		});

		// Verificar información del módulo nativo si está disponible
		if (DownloadsModule2 && DownloadsModule2.getSystemInfo) {
			try {
				// No usar cache en init, es solo una vez
				const systemInfo = await DownloadsModule2.getSystemInfo();
				this.currentLogger.info(TAG, "Native module system info", {
					nativeDownloadDirectory: systemInfo.downloadDirectory,
					nativeTempDirectory: systemInfo.tempDirectory,
					storageServiceDownloadPath: this.downloadPath,
					storageServiceTempPath: this.tempPath,
					pathsMatch: systemInfo.downloadDirectory === this.downloadPath,
				});

				// ADVERTENCIA si los paths no coinciden
				if (
					systemInfo.downloadDirectory &&
					systemInfo.downloadDirectory !== this.downloadPath
				) {
					this.currentLogger.warn(
						TAG,
						"⚠️ PATH MISMATCH: Native module is using different download directory!",
						{
							storageServicePath: this.downloadPath,
							issue: "Downloads will not be counted correctly in downloadSpace calculations",
						}
					);
				}
			} catch (error) {
				// Ignore system info errors during init
				this.currentLogger.warn(TAG, "Ignoring system info error during init", error);
			}
		}
	}

	/*
	 * Obtiene system info con cache para evitar exceso de llamadas nativas
	 *
	 */

	private async getCachedSystemInfo(): Promise<{
		totalSpace: number;
		availableSpace: number;
		downloadSpace: number;
	}> {
		// Cache funciona para iOS y Android
		if (!DownloadsModule2?.getSystemInfo) {
			return { totalSpace: 0, availableSpace: 0, downloadSpace: 0 };
		}

		const now = Date.now();

		// Verificar cache primero
		if (this.systemInfoCache && now - this.systemInfoCache.timestamp < this.CACHE_TTL_MS) {
			return {
				totalSpace: this.systemInfoCache.totalSpace,
				availableSpace: this.systemInfoCache.availableSpace,
				downloadSpace: this.systemInfoCache.downloadSpace,
			};
		}

		// Si ya hay una llamada en progreso, esperar a que termine
		if (this.pendingSystemInfoPromise) {
			return this.pendingSystemInfoPromise;
		}

		// Crear promesa que otras llamadas concurrentes pueden esperar
		this.pendingSystemInfoPromise = (async () => {
			try {
				this.currentLogger.debug(TAG, "Getting system info from native");
				const systemInfo = await DownloadsModule2.getSystemInfo();

				// Actualizar cache
				this.systemInfoCache = {
					totalSpace: systemInfo.totalSpace || 0,
					availableSpace: systemInfo.availableSpace || 0,
					downloadSpace: systemInfo.downloadSpace || 0,
					timestamp: Date.now(), // Usar timestamp actualizado
				};

				return {
					totalSpace: this.systemInfoCache.totalSpace,
					availableSpace: this.systemInfoCache.availableSpace,
					downloadSpace: this.systemInfoCache.downloadSpace,
				};
			} catch (error) {
				this.currentLogger.warn(TAG, "Failed to get system info from native", error);
				return { totalSpace: 0, availableSpace: 0, downloadSpace: 0 };
			} finally {
				// Limpiar promesa pendiente
				this.pendingSystemInfoPromise = null;
			}
		})();

		return this.pendingSystemInfoPromise;
	}

	/*
	 * Obtiene el espacio total del dispositivo
	 *
	 */

	public async getTotalSpace(): Promise<number> {
		try {
			// Usar DownloadsModule2 si está disponible para obtener valores precisos
			if (DownloadsModule2 && DownloadsModule2.getSystemInfo) {
				// Siempre usar cache si es iOS o Android
				const cached = await this.getCachedSystemInfo();
				return cached.totalSpace;
			}

			// Fallback usando RNFS
			return 0; // RNFS no proporciona espacio total en iOS
		} catch (error) {
			this.currentLogger.error(TAG, "Error getting total space", error);
			throw new PlayerError("STORAGE_FILE_SYSTEM_601", {
				originalError: error,
				context: "StorageService.getTotalSpace",
			});
		}
	}

	/*
	 * Obtiene el espacio usado del dispositivo
	 *
	 */

	public async getUsedSpace(): Promise<number> {
		try {
			// Usar DownloadsModule2 si está disponible para obtener valores precisos
			if (DownloadsModule2 && DownloadsModule2.getSystemInfo) {
				const cached = await this.getCachedSystemInfo();
				return cached.totalSpace - cached.availableSpace;
			}

			// Fallback a RNFS si el módulo nativo no está disponible
			const info = await RNFS.getFSInfo();
			return info.totalSpace - info.freeSpace;
		} catch (error) {
			this.currentLogger.error(TAG, "Error getting used space", error);
			throw new PlayerError("STORAGE_FILE_SYSTEM_601", {
				originalError: error,
				context: "StorageService.getUsedSpace",
			});
		}
	}

	/*
	 * Obtiene el espacio disponible del dispositivo
	 * IMPORTANTE: En iOS usa volumeAvailableCapacityForImportantUsage que incluye espacio purgeable
	 * Coincide con el valor mostrado en Configuración de iOS
	 *
	 */

	public async getAvailableSpace(): Promise<number> {
		try {
			// Usar DownloadsModule2 si está disponible para obtener valores precisos
			// iOS: usa volumeAvailableCapacityForImportantUsage (incluye espacio purgeable)
			// Android: usa valores correctos del sistema
			if (DownloadsModule2 && DownloadsModule2.getSystemInfo) {
				// Siempre usar cache para evitar llamadas excesivas
				const cached = await this.getCachedSystemInfo();
				return cached.availableSpace;
			}

			// Fallback a RNFS si el módulo nativo no está disponible
			// ADVERTENCIA: En iOS esto usa volumeAvailableCapacity (valor conservador sin purgeable)
			this.currentLogger.warn(
				TAG,
				"Using RNFS fallback for storage info (may be inaccurate on iOS)"
			);
			const info = await RNFS.getFSInfo();
			return info.freeSpace;
		} catch (error) {
			this.currentLogger.error(TAG, "Error getting available space", error);
			throw new PlayerError("STORAGE_FILE_SYSTEM_601", {
				originalError: error,
				context: "StorageService.getAvailableSpace",
			});
		}
	}

	/*
	 * Obtiene el tamaño de la carpeta de descargas usando RNFS
	 *
	 */

	public async getDownloadsFolderSize(): Promise<number> {
		// Si ya hay una llamada en progreso, esperar a que termine
		if (this.pendingDownloadsFolderSizePromise) {
			return this.pendingDownloadsFolderSizePromise;
		}

		// Crear promesa que otras llamadas concurrentes pueden esperar
		this.pendingDownloadsFolderSizePromise = (async () => {
			try {
				// En iOS, usar el tamaño del native module porque los assets se guardan
				// en una ubicación especial del sistema que RNFS no puede acceder
				if (Platform.OS === "ios" && DownloadsModule2?.getSystemInfo) {
					try {
						const cached = await this.getCachedSystemInfo();
						this.currentLogger.info(TAG, "Using native download space (iOS)", {
							downloadSpace: cached.downloadSpace,
							sizeFormatted: formatFileSize(cached.downloadSpace),
						});
						return cached.downloadSpace;
					} catch (error) {
						this.currentLogger.warn(
							TAG,
							"Failed to get native download space, falling back to RNFS",
							error
						);
						// Fall through to RNFS calculation
					}
				}

				// Android o fallback para iOS: usar RNFS
				let totalSize = 0;

				// Calcular tamaño del directorio de descargas
				const downloadSize = await this.calculateDirectorySize(this.downloadPath);
				totalSize += downloadSize;

				this.currentLogger.debug(TAG, "Download path size calculated", {
					path: this.downloadPath,
					size: downloadSize,
					sizeFormatted: formatFileSize(downloadSize),
				});

				// Calcular tamaño del directorio temporal
				const tempSize = await this.calculateDirectorySize(this.tempPath);
				totalSize += tempSize;

				if (tempSize > 0) {
					this.currentLogger.debug(TAG, "Temp path size calculated", {
						path: this.tempPath,
						size: tempSize,
						sizeFormatted: formatFileSize(tempSize),
					});
				}

				this.currentLogger.info(TAG, "Total downloads folder size", {
					downloadPath: this.downloadPath,
					tempPath: this.tempPath,
					totalSize,
					sizeFormatted: formatFileSize(totalSize),
				});

				return totalSize;
			} catch (error) {
				this.currentLogger.error(TAG, "Error getting downloads folder size", error);
				throw new PlayerError("STORAGE_FILE_SYSTEM_612", {
					originalError: error,
					context: "StorageService.getDownloadsFolderSize",
				});
			} finally {
				// Limpiar promesa pendiente
				this.pendingDownloadsFolderSizePromise = null;
			}
		})();

		return this.pendingDownloadsFolderSizePromise;
	}

	/*
	 * Obtiene el tamaño de la carpeta temporal usando RNFS
	 *
	 */

	public async getTempFolderSize(): Promise<number> {
		try {
			return await this.calculateDirectorySize(this.tempPath);
		} catch (error) {
			this.currentLogger.error(TAG, "Error getting temp folder size", error);
			throw new PlayerError("STORAGE_FILE_SYSTEM_612", {
				originalError: error,
				context: "StorageService.getTempFolderSize",
			});
		}
	}

	/*
	 * Invalida el cache de system info
	 * Llamar cuando se complete o elimine una descarga
	 *
	 */

	public invalidateDownloadSpaceCache(): void {
		this.systemInfoCache = null;
		this.pendingDownloadsFolderSizePromise = null;
		this.currentLogger.debug(TAG, "Download space cache invalidated");
	}

	/*
	 * Verifica si hay suficiente espacio para una descarga
	 *
	 */

	public async hasEnoughSpace(requiredSpace: number): Promise<boolean> {
		const availableSpace = await this.getAvailableSpace();
		const minSpace = LIMITS.MIN_DISK_SPACE_MB * 1024 * 1024;

		return availableSpace > requiredSpace + minSpace;
	}

	/*
	 * Estima el espacio necesario para una descarga (implementación básica)
	 *
	 */

	public async estimateSpaceNeeded(
		downloadId?: string,
		downloadType?: string,
		quality?: string
	): Promise<number> {
		// Implementación básica de estimación
		// En una implementación real, esto consultaría metadatos del contenido usando downloadId
		// Por ahora, downloadId no se usa pero se mantiene para compatibilidad futura
		void downloadId; // Silenciar warning de linter

		const estimates = {
			BINARY: 50 * 1024 * 1024, // 50MB para archivos binarios
			STREAM: {
				low: 100 * 1024 * 1024, // 100MB para calidad baja
				medium: 300 * 1024 * 1024, // 300MB para calidad media
				high: 800 * 1024 * 1024, // 800MB para calidad alta
				max: 1500 * 1024 * 1024, // 1.5GB para calidad máxima
				auto: 500 * 1024 * 1024, // 500MB para auto
			},
		};

		if (downloadType === "BINARY") {
			return estimates.BINARY;
		} else if (downloadType === "STREAM") {
			const streamEstimates = estimates.STREAM;
			return streamEstimates[quality as keyof typeof streamEstimates] || streamEstimates.auto;
		}

		// Estimación por defecto si no se conoce el tipo
		return 200 * 1024 * 1024; // 200MB por defecto
	}

	/*
	 * Obtiene el porcentaje de uso del almacenamiento
	 *
	 */

	public async getUsagePercentage(): Promise<number> {
		const info = await this.getStorageInfo();
		return Math.round((info.usedSpace / info.totalSpace) * 100);
	}

	/*
	 * Obtiene el porcentaje de espacio usado por descargas
	 *
	 */

	public async getDownloadPercentage(): Promise<number> {
		const info = await this.getStorageInfo();
		return Math.round((info.downloadsFolderSize / info.totalSpace) * 100);
	}

	/*
	 * Obtiene el nivel de advertencia de espacio
	 *
	 */

	public async getSpaceWarningLevel(): Promise<"none" | "warning" | "critical"> {
		const usagePercent = await this.getUsagePercentage();

		if (usagePercent >= DEFAULT_CONFIG.STORAGE_WARNING_THRESHOLD * 100) {
			return "critical";
		} else if (usagePercent >= 80) {
			return "warning";
		} else {
			return "none";
		}
	}

	/*
	 * Verifica si el espacio está bajo
	 *
	 */

	public async isLowSpace(): Promise<boolean> {
		const warningLevel = await this.getSpaceWarningLevel();
		return warningLevel !== "none";
	}

	/*
	 * Obtiene información completa del almacenamiento
	 *
	 */

	public async getStorageInfo(): Promise<StorageInfo> {
		const [totalSpace, usedSpace, availableSpace, downloadsFolderSize] = await Promise.all([
			this.getTotalSpace(),
			this.getUsedSpace(),
			this.getAvailableSpace(),
			this.getDownloadsFolderSize(),
		]);

		const info: StorageInfo = {
			totalSpace,
			usedSpace,
			availableSpace,
			downloadsFolderSize,
			lastUpdated: Date.now(),
		};

		this.checkStorageThresholds(info);

		return info;
	}

	/*
	 * Actualiza la información de almacenamiento
	 *
	 */

	public async updateStorageInfo(): Promise<StorageInfo> {
		const info = await this.getStorageInfo();

		// Emitir evento con la información actualizada
		this.eventEmitter.emit(StorageEventType.INFO_UPDATED, info);

		return info;
	}

	/*
	 * Limpia archivos huérfanos y temporales
	 *
	 */

	public async cleanupOrphanedFiles(): Promise<number> {
		this.currentLogger.info(TAG, "Starting cleanup of orphaned files");
		this.eventEmitter.emit(StorageEventType.CLEANUP_STARTED);

		let deletedBytes = 0;

		try {
			// Limpiar archivos temporales antiguos
			deletedBytes += await this.cleanupTempFiles();

			// Limpiar archivos parciales
			deletedBytes += await this.cleanupPartialFiles();

			this.currentLogger.info(
				TAG,
				`Cleanup completed. Freed ${formatFileSize(deletedBytes)}`
			);
			this.eventEmitter.emit(StorageEventType.CLEANUP_COMPLETED, {
				freedBytes: deletedBytes,
			});
		} catch (error) {
			this.currentLogger.error(TAG, "Error during cleanup", error);
			this.eventEmitter.emit(StorageEventType.ERROR, error);
		}

		return deletedBytes;
	}

	/*
	 * Crea un archivo con contenido
	 *
	 */

	public async createFile(
		path: string,
		content: string | Uint8Array,
		encoding: "utf8" | "base64" = "utf8"
	): Promise<FileInfo> {
		try {
			// Validar nombre
			this.validateFilename(path);

			// Asegurar directorio
			const directory = path.substring(0, path.lastIndexOf("/"));
			await this.createDirectory(directory);

			// Escribir archivo
			await RNFS.writeFile(path, content.toString(), encoding);

			const fileInfo = await this.getFileInfo(path);

			this.currentLogger.debug(TAG, `File created: ${path}`);
			this.eventEmitter.emit(StorageEventType.FILE_CREATED, fileInfo);

			return fileInfo!;
		} catch (error) {
			throw new PlayerError("STORAGE_FILE_SYSTEM_609", {
				originalError: error,
				path,
				context: "StorageService.createFile",
			});
		}
	}

	/*
	 * Lee el contenido de un archivo
	 *
	 */

	public async readFile(path: string, encoding: "utf8" | "base64" = "utf8"): Promise<string> {
		try {
			const exists = await RNFS.exists(path);
			if (!exists) {
				throw new PlayerError("STORAGE_FILE_SYSTEM_602", {
					path,
					context: "StorageService.readFile",
				});
			}

			return await RNFS.readFile(path, encoding);
		} catch (error) {
			if (error instanceof PlayerError) throw error;

			throw new PlayerError("STORAGE_FILE_SYSTEM_610", {
				originalError: error,
				path,
				context: "StorageService.readFile",
			});
		}
	}

	/*
	 * Elimina un archivo
	 *
	 */

	public async deleteFile(filePath: string): Promise<boolean> {
		try {
			const exists = await RNFS.exists(filePath);
			if (!exists) {
				throw new PlayerError("STORAGE_FILE_SYSTEM_602", {
					filePath,
					context: "StorageService.deleteFile",
				});
			}

			await RNFS.unlink(filePath);
			this.currentLogger.debug(TAG, `File deleted: ${filePath}`);
			return true;
		} catch (error) {
			if (error instanceof PlayerError) {
				throw error;
			}
			this.currentLogger.error(TAG, `Error deleting file: ${filePath}`, error);
			throw new PlayerError("STORAGE_FILE_SYSTEM_604", {
				originalError: error,
				filePath,
				context: "StorageService.deleteFile",
			});
		}
	}

	/*
	 * Elimina un directorio completo y todo su contenido
	 *
	 */

	public async deleteDirectory(dirPath: string): Promise<boolean> {
		try {
			const exists = await RNFS.exists(dirPath);
			if (!exists) {
				this.currentLogger.warn(TAG, `Directory does not exist: ${dirPath}`);
				return false;
			}

			// Verificar que sea un directorio
			const stat = await RNFS.stat(dirPath);
			if (!stat.isDirectory()) {
				throw new PlayerError("STORAGE_FILE_SYSTEM_605", {
					dirPath,
					context: "StorageService.deleteDirectory - path is not a directory",
				});
			}

			await RNFS.unlink(dirPath);
			this.currentLogger.info(TAG, `Directory deleted: ${dirPath}`);
			return true;
		} catch (error) {
			if (error instanceof PlayerError) {
				throw error;
			}
			this.currentLogger.error(TAG, `Error deleting directory: ${dirPath}`, error);
			throw new PlayerError("STORAGE_FILE_SYSTEM_606", {
				originalError: error,
				dirPath,
				context: "StorageService.deleteDirectory",
			});
		}
	}

	/*
	 * Mueve un archivo
	 *
	 */

	public async moveFile(source: string, destination: string): Promise<boolean> {
		try {
			await RNFS.moveFile(source, destination);
			this.currentLogger.debug(TAG, `File moved from ${source} to ${destination}`);
			return true;
		} catch (error) {
			this.currentLogger.error(
				TAG,
				`Error moving file from ${source} to ${destination}`,
				error
			);
			throw new PlayerError("STORAGE_FILE_SYSTEM_605", {
				originalError: error,
				source,
				destination,
				context: "StorageService.moveFile",
			});
		}
	}

	/*
	 * Copia un archivo
	 *
	 */

	public async copyFile(source: string, destination: string): Promise<boolean> {
		try {
			await RNFS.copyFile(source, destination);
			this.currentLogger.debug(TAG, `File copied from ${source} to ${destination}`);
			return true;
		} catch (error) {
			this.currentLogger.error(
				TAG,
				`Error copying file from ${source} to ${destination}`,
				error
			);
			throw new PlayerError("STORAGE_FILE_SYSTEM_606", {
				originalError: error,
				source,
				destination,
				context: "StorageService.copyFile",
			});
		}
	}

	/*
	 * Obtiene información de un archivo
	 *
	 */

	public async getFileInfo(filePath: string): Promise<FileInfo | null> {
		try {
			const stat = await RNFS.stat(filePath);

			return {
				path: stat.path,
				size: stat.size,
				exists: true,
				isDirectory: stat.isDirectory(),
				createdAt: stat.ctime ? new Date(stat.ctime).getTime() : undefined,
				modifiedAt: stat.mtime ? new Date(stat.mtime).getTime() : undefined,
			};
		} catch (error: any) {
			// File not found is not an error, return null
			if (error?.code === "ENOENT") {
				return null;
			}
			this.currentLogger.error(TAG, `Error getting file info: ${filePath}`, error);
			throw new PlayerError("STORAGE_FILE_SYSTEM_608", {
				originalError: error,
				filePath,
				context: "StorageService.getFileInfo",
			});
		}
	}

	/*
	 * Valida un archivo descargado
	 *
	 */

	public async validateFile(filePath: string, expectedSize?: number): Promise<ValidationResult> {
		const errors: string[] = [];
		const warnings: string[] = [];

		try {
			const fileInfo = await this.getFileInfo(filePath);

			if (!fileInfo || !fileInfo.exists) {
				errors.push("File does not exist");
				return { isValid: false, errors };
			}

			if (fileInfo.size === 0) {
				errors.push("File is empty");
			}

			if (expectedSize && fileInfo.size !== expectedSize) {
				errors.push(
					`Incorrect file size. Expected: ${expectedSize}, Actual: ${fileInfo.size}`
				);
			}

			// Verificar si el archivo es accesible
			try {
				await RNFS.read(filePath, 1);
			} catch (readError) {
				errors.push("File is not accessible for reading");
			}

			return {
				isValid: errors.length === 0,
				errors: errors.length > 0 ? errors : undefined,
				warnings: warnings.length > 0 ? warnings : undefined,
			};
		} catch (error) {
			this.currentLogger.error(TAG, `Error validating file: ${filePath}`, error);
			throw new PlayerError("STORAGE_FILE_SYSTEM_607", {
				originalError: error,
				filePath,
				expectedSize,
				context: "StorageService.validateFile",
			});
		}
	}

	/*
	 * Genera path único para descargas
	 *
	 */

	public generateUniquePath(directory: string, filename: string, extension: string): string {
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(2, 8);
		const sanitized = this.sanitizeFilename(filename);
		return `${directory}/${sanitized}_${timestamp}_${random}${extension}`;
	}

	/*
	 * Obtiene el directorio de descargas
	 *
	 */

	public getDownloadDirectory(): string {
		return this.downloadPath;
	}

	/*
	 * Obtiene el directorio temporal
	 *
	 */

	public getTempDirectory(): string {
		return this.tempPath;
	}

	/*
	 * Obtiene el directorio de streams
	 *
	 */

	public getStreamsDirectory(): string {
		return `${this.downloadPath}/${DIRECTORIES.STREAMS}`;
	}

	/*
	 * Obtiene el directorio de binarios
	 *
	 */

	public getBinariesDirectory(): string {
		return `${this.downloadPath}/${DIRECTORIES.BINARIES}`;
	}

	/*
	 * Obtiene el directorio de licencias DRM
	 *
	 */

	public getDRMLicensesDirectory(): string {
		return `${this.downloadPath}/${DIRECTORIES.DRM_LICENSES}`;
	}

	/*
	 * Obtiene el directorio de subtítulos
	 *
	 */

	public getSubtitlesDirectory(): string {
		return `${this.downloadPath}/${DIRECTORIES.SUBTITLES}`;
	}

	/*
	 * Asegura que el directorio de subtítulos existe
	 *
	 */

	public async ensureSubtitlesDirectory(): Promise<string> {
		const subtitlesPath = this.getSubtitlesDirectory();
		await this.createDirectory(subtitlesPath);
		return subtitlesPath;
	}

	/*
	 * Crea un directorio si no existe
	 *
	 */

	public async createDirectory(path: string): Promise<boolean> {
		try {
			const exists = await RNFS.exists(path);
			if (!exists) {
				await RNFS.mkdir(path);
				this.currentLogger.debug(TAG, `Directory created: ${path}`);
			}
			return true;
		} catch (error) {
			this.currentLogger.error(TAG, `Error creating directory: ${path}`, error);
			throw new PlayerError("STORAGE_FILE_SYSTEM_603", {
				originalError: error,
				path,
				context: "StorageService.createDirectory",
			});
		}
	}

	/*
	 * Obtiene el path de descarga según la plataforma
	 * IMPORTANTE: En Android usa DocumentDirectoryPath (internal storage)
	 * para coincidir con reactContext.getFilesDir() del módulo nativo
	 */

	private getDownloadPath(customPath?: string): string {
		const basePath = Platform.select({
			ios: RNFS.DocumentDirectoryPath,
			android: RNFS.DocumentDirectoryPath, // Internal storage para coincidir con módulo nativo
			default: RNFS.DocumentDirectoryPath,
		});

		return `${basePath}/${customPath || DIRECTORIES.ROOT}`;
	}

	/*
	 * Obtiene el path temporal según la plataforma
	 * IMPORTANTE: Usa CachesDirectoryPath para coincidir con
	 * reactContext.getCacheDir() del módulo nativo Android
	 */

	private getTempPath(customPath?: string): string {
		const basePath = RNFS.CachesDirectoryPath || RNFS.TemporaryDirectoryPath;
		return `${basePath}/${customPath || DIRECTORIES.TEMP}`;
	}

	/*
	 * Asegura que los directorios necesarios existen
	 *
	 */

	private async ensureDirectories(): Promise<void> {
		await this.createDirectory(this.downloadPath);
		await this.createDirectory(this.tempPath);
		await this.createDirectory(`${this.downloadPath}/${DIRECTORIES.STREAMS}`);
		await this.createDirectory(`${this.downloadPath}/${DIRECTORIES.BINARIES}`);
		await this.createDirectory(`${this.downloadPath}/${DIRECTORIES.DRM_LICENSES}`);
		await this.createDirectory(`${this.downloadPath}/${DIRECTORIES.SUBTITLES}`);
	}

	/*
	 * Calcula el tamaño de un directorio recursivamente usando RNFS
	 *
	 */

	private async calculateDirectorySize(dirPath: string): Promise<number> {
		try {
			const exists = await RNFS.exists(dirPath);
			if (!exists) {
				this.currentLogger.debug(TAG, "Directory does not exist", { dirPath });
				return 0;
			}

			const items = await RNFS.readDir(dirPath);
			let totalSize = 0;
			let fileCount = 0;
			let dirCount = 0;

			for (const item of items) {
				if (item.isDirectory()) {
					dirCount++;
					// Recursivamente calcular subdirectorios
					totalSize += await this.calculateDirectorySize(item.path);
				} else {
					fileCount++;
					// Sumar tamaño de archivos
					totalSize += item.size;

					// Log cada archivo encontrado con su tamaño
					if (item.size > 0) {
						this.currentLogger.debug(TAG, `📄 File: ${item.name}`, {
							path: item.path,
							size: item.size,
							sizeFormatted: formatFileSize(item.size),
						});
					}
				}
			}

			if (fileCount > 0 || dirCount > 0) {
				this.currentLogger.debug(TAG, `📁 Directory scanned: ${dirPath}`, {
					files: fileCount,
					directories: dirCount,
					totalSize,
					sizeFormatted: formatFileSize(totalSize),
				});
			}

			return totalSize;
		} catch (error) {
			this.currentLogger.warn(TAG, `Error calculating directory size: ${dirPath}`, error);
			// Devolver 0 en caso de error en lugar de lanzar excepción
			// para que el cálculo pueda continuar con otros directorios
			return 0;
		}
	}

	/*
	 * Limpia archivos temporales antiguos
	 *
	 */

	private async cleanupTempFiles(): Promise<number> {
		let deletedBytes = 0;
		const maxAge = 24 * 60 * 60 * 1000; // 24 horas

		try {
			const tempFiles = await RNFS.readDir(this.tempPath);
			const now = Date.now();

			for (const file of tempFiles) {
				if (!file.isDirectory()) {
					const fileAge = now - new Date(file.mtime).getTime();

					if (fileAge > maxAge) {
						await RNFS.unlink(file.path);
						deletedBytes += file.size;
						this.currentLogger.debug(TAG, `Deleted old temp file: ${file.name}`);
					}
				}
			}
		} catch (error) {
			this.currentLogger.error(TAG, "Error cleaning temp files", error);
			throw new PlayerError("STORAGE_FILE_SYSTEM_611", {
				originalError: error,
				tempPath: this.tempPath,
				context: "StorageService.cleanupTempFiles",
			});
		}

		return deletedBytes;
	}

	/*
	 * Limpia archivos parciales (.part, .tmp, etc)
	 *
	 */

	private async cleanupPartialFiles(): Promise<number> {
		let deletedBytes = 0;
		const partialExtensions = [".part", ".tmp", ".download", ".partial"];

		try {
			const downloadFiles = await RNFS.readDir(this.downloadPath);

			for (const file of downloadFiles) {
				if (!file.isDirectory()) {
					const hasPartialExt = partialExtensions.some(ext =>
						file.name.toLowerCase().endsWith(ext)
					);

					if (hasPartialExt) {
						// Verificar si el archivo tiene más de 48 horas
						const fileAge = Date.now() - new Date(file.mtime).getTime();
						const maxAge = 48 * 60 * 60 * 1000;

						if (fileAge > maxAge) {
							await RNFS.unlink(file.path);
							deletedBytes += file.size;
							this.currentLogger.debug(TAG, `Deleted partial file: ${file.name}`);
						}
					}
				}
			}
		} catch (error) {
			this.currentLogger.error(TAG, "Error cleaning partial files", error);
			throw new PlayerError("STORAGE_FILE_SYSTEM_611", {
				originalError: error,
				downloadPath: this.downloadPath,
				context: "StorageService.cleanupPartialFiles",
			});
		}

		return deletedBytes;
	}

	/*
	 * Verifica umbrales de almacenamiento y emite eventos
	 *
	 */

	private checkStorageThresholds(info: StorageInfo): void {
		const usagePercent = info.usedSpace / info.totalSpace;
		let currentLevel: "none" | "warning" | "critical" = "none";

		if (usagePercent >= DEFAULT_CONFIG.STORAGE_WARNING_THRESHOLD) {
			currentLevel = "critical";
		} else if (usagePercent >= 0.8) {
			currentLevel = "warning";
		}

		// Solo emitir eventos si el nivel cambió
		if (currentLevel !== this.lastWarningLevel) {
			this.currentLogger.debug(
				TAG,
				`Storage warning level changed: ${this.lastWarningLevel} -> ${currentLevel}`
			);

			if (currentLevel === "critical") {
				this.eventEmitter.emit(StorageEventType.SPACE_CRITICAL, {
					usagePercent,
					availableSpace: info.availableSpace,
				});
			} else if (currentLevel === "warning") {
				this.eventEmitter.emit(StorageEventType.SPACE_WARNING, {
					usagePercent,
					availableSpace: info.availableSpace,
				});
			} else if (this.lastWarningLevel !== "none") {
				// Solo emitir SPACE_RECOVERED si antes estaba en warning o critical
				this.eventEmitter.emit(StorageEventType.SPACE_RECOVERED, {
					usagePercent,
					availableSpace: info.availableSpace,
				});
			}

			this.lastWarningLevel = currentLevel;
		}
	}

	/*
	 * Inicia el programador de limpieza automática
	 *
	 */

	private startCleanupScheduler(): void {
		if (this.config.cleanupEnabled && this.config.cleanupIntervalHours) {
			const intervalMs = this.config.cleanupIntervalHours * 60 * 60 * 1000;

			setInterval(async () => {
				this.currentLogger.info(TAG, "Running scheduled cleanup");
				await this.cleanupOrphanedFiles();
			}, intervalMs);

			this.currentLogger.info(
				TAG,
				`Cleanup scheduler started (every ${this.config.cleanupIntervalHours} hours)`
			);
		}
	}

	/*
	 * Valida un nombre de archivo
	 *
	 */

	private validateFilename(filename: string): void {
		// Extraer solo el nombre del archivo si es una ruta completa
		const name = filename.includes("/")
			? filename.substring(filename.lastIndexOf("/") + 1)
			: filename;

		// Verificar longitud
		if (name.length > LIMITS.MAX_FILENAME_LENGTH) {
			throw new Error(`Filename too long: ${name.length} > ${LIMITS.MAX_FILENAME_LENGTH}`);
		}

		// Verificar caracteres válidos
		if (!PATTERNS.FILENAME.test(name)) {
			throw new Error(`Invalid filename: ${name}`);
		}

		// Verificar que no use nombres reservados
		const reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "LPT1"];
		const nameWithoutExt = name?.split(".")[0]?.toUpperCase();
		if (nameWithoutExt && reserved.includes(nameWithoutExt)) {
			throw new Error(`Reserved filename: ${name}`);
		}
	}

	/*
	 * Sanitiza un nombre de archivo
	 *
	 */

	private sanitizeFilename(filename: string): string {
		// Remover caracteres no válidos
		let sanitized = filename.replace(/[^a-zA-Z0-9._\- ]/g, "_");

		// Limitar longitud
		if (sanitized.length > LIMITS.MAX_FILENAME_LENGTH - 20) {
			sanitized = sanitized.substring(0, LIMITS.MAX_FILENAME_LENGTH - 20);
		}

		// Remover espacios al inicio y final
		sanitized = sanitized.trim();

		// Reemplazar múltiples underscores con uno
		sanitized = sanitized.replace(/_+/g, "_");

		return sanitized || "download";
	}

	/*
	 * Inicia el monitoreo de espacio
	 *
	 */

	public startMonitoring(intervalMs: number = 120000): void {
		if (this.isMonitoring) return;

		this.isMonitoring = true;
		this.monitoringInterval = setInterval(async () => {
			await this.updateStorageInfo();
			this.currentLogger.debug(TAG, "Storage info updated from monitoring");
		}, intervalMs);

		this.currentLogger.info(TAG, "Storage monitoring started");
	}

	/*
	 * Detiene el monitoreo de espacio
	 *
	 */

	public stopMonitoring(): void {
		if (!this.isMonitoring) return;

		this.isMonitoring = false;
		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval);
			this.monitoringInterval = null;
		}

		this.currentLogger.info(TAG, "Storage monitoring stopped");
	}

	/*
	 * Suscribe a eventos del servicio
	 *
	 */

	public subscribe(event: StorageEventType | "all", callback: (data: any) => void): () => void {
		if (event === "all") {
			Object.values(StorageEventType).forEach(eventType => {
				this.eventEmitter.on(eventType, callback);
			});

			return () => {
				Object.values(StorageEventType).forEach(eventType => {
					this.eventEmitter.off(eventType, callback);
				});
			};
		} else {
			this.eventEmitter.on(event, callback);
			return () => this.eventEmitter.off(event, callback);
		}
	}

	/*
	 * Limpia recursos al destruir
	 *
	 */

	public destroy(): void {
		this.stopMonitoring();
		this.eventEmitter.removeAllListeners();
		this.currentLogger.info(TAG, "StorageService destroyed");
	}
}

// Exportar instancia singleton
export const storageService = StorageService.getInstance();
