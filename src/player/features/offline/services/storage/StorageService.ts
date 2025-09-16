import { EventEmitter } from 'eventemitter3';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { Logger, LogLevel } from '../../../logger';

import {
    FileInfo,
    StorageEventType,
    StorageInfo,
    StorageServiceConfig,
    ValidationResult
} from '../../types';

import {
    DEFAULT_CONFIG,
    DIRECTORIES,
    LIMITS,
    LOG_TAGS,
} from '../../constants';

const TAG = LOG_TAGS.STORAGE_SERVICE;

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
    private lastStorageInfo: StorageInfo | null = null;

    private constructor() {
        this.eventEmitter = new EventEmitter();

        this.config = {
            logEnabled: true,
            logLevel: LogLevel.DEBUG,
            downloadDirectory: DIRECTORIES.ROOT,
            tempDirectory: DIRECTORIES.TEMP,
            cleanupEnabled: true,
            cleanupIntervalHours: DEFAULT_CONFIG.CLEANUP_INTERVAL_HOURS,
        };

        this.currentLogger = new Logger({
            enabled: this.config.logEnabled,
            level: this.config.logLevel,
            prefix: `💾 Downloads Storage`,
            useColors: true,
            includeLevelName: false,
            includeTimestamp: true,
            includeInstanceId: true,
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
     * Inicializa el servicio de almacenamiento
     *
     */

    public async initialize(config?: Partial<StorageServiceConfig>): Promise<void> {
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

        this.currentLogger.info(TAG, 'Storage Service initialized', {
            downloadPath: this.downloadPath,
            tempPath: this.tempPath,
        });
    }

    /*
     * Obtiene el espacio total del dispositivo
     *
     */
    
    public async getTotalSpace(): Promise<number> {
        try {
            const info = await RNFS.getFSInfo();
            return info.totalSpace;
        } catch (error) {
            this.currentLogger.error(TAG, 'Error getting total space', error);
            return 0;
        }
    }

    /*
     * Obtiene el espacio usado del dispositivo
     *
     */
    
    public async getUsedSpace(): Promise<number> {
        try {
            const info = await RNFS.getFSInfo();
            return info.totalSpace - info.freeSpace;
        } catch (error) {
            this.currentLogger.error(TAG, 'Error getting used space', error);
            return 0;
        }
    }

    /*
     * Obtiene el espacio disponible del dispositivo
     *
     */

    public async getAvailableSpace(): Promise<number> {
        try {
            const info = await RNFS.getFSInfo();
            return info.freeSpace;
        } catch (error) {
            this.currentLogger.error(TAG, 'Error getting available space', error);
            return 0;
        }
    }

    /*
     * Obtiene el tamaño de la carpeta de descargas
     *
     */
    
    public async getDownloadsFolderSize(): Promise<number> {
        try {
            return await this.getFolderSize(this.downloadPath);
        } catch (error) {
            this.currentLogger.error(TAG, 'Error getting downloads folder size', error);
            return 0;
        }
    }

    /*
     * Obtiene el tamaño de la carpeta temporal
     *
     */
    
    public async getTempFolderSize(): Promise<number> {
        try {
            return await this.getFolderSize(this.tempPath);
        } catch (error) {
            this.currentLogger.error(TAG, 'Error getting temp folder size', error);
            return 0;
        }
    }

    /*
     * Verifica si hay suficiente espacio para una descarga
     *
     */

    public async hasEnoughSpace(requiredSpace: number): Promise<boolean> {
        const availableSpace = await this.getAvailableSpace();
        const minSpace = LIMITS.MIN_DISK_SPACE_MB * 1024 * 1024;
        
        return availableSpace > (requiredSpace + minSpace);
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

        this.lastStorageInfo = info;
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
        this.eventEmitter.emit('storage_info_updated', info);
        
        return info;
    }

    /*
     * Limpia archivos huérfanos y temporales
     *
     */
    
    public async cleanupOrphanedFiles(): Promise<number> {
        this.currentLogger.info(TAG, 'Starting cleanup of orphaned files');
        this.eventEmitter.emit(StorageEventType.CLEANUP_STARTED);

        let deletedBytes = 0;

        try {
            // Limpiar archivos temporales antiguos
            deletedBytes += await this.cleanupTempFiles();

            // Limpiar archivos parciales
            deletedBytes += await this.cleanupPartialFiles();

            this.currentLogger.info(TAG, `Cleanup completed. Freed ${this.formatBytes(deletedBytes)}`);
            this.eventEmitter.emit(StorageEventType.CLEANUP_COMPLETED, { freedBytes: deletedBytes });
        } catch (error) {
            this.currentLogger.error(TAG, 'Error during cleanup', error);
            this.eventEmitter.emit(StorageEventType.ERROR, error);
        }

        return deletedBytes;
    }

    /*
     * Elimina un archivo
     *
     */
    
    public async deleteFile(filePath: string): Promise<boolean> {
        try {
            const exists = await RNFS.exists(filePath);
            if (!exists) {
                this.currentLogger.warn(TAG, `File not found: ${filePath}`);
                return false;
            }

            await RNFS.unlink(filePath);
            this.currentLogger.debug(TAG, `File deleted: ${filePath}`);
            return true;
        } catch (error) {
            this.currentLogger.error(TAG, `Error deleting file: ${filePath}`, error);
            return false;
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
            this.currentLogger.error(TAG, `Error moving file from ${source} to ${destination}`, error);
            return false;
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
            this.currentLogger.error(TAG, `Error copying file from ${source} to ${destination}`, error);
            return false;
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
        } catch (error) {
            this.currentLogger.debug(TAG, `File not found: ${filePath}`);
            return null;
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
                errors.push('El archivo no existe');
                return { isValid: false, errors };
            }

            if (fileInfo.size === 0) {
                errors.push('El archivo está vacío');
            }

            if (expectedSize && fileInfo.size !== expectedSize) {
                errors.push(`Tamaño incorrecto. Esperado: ${expectedSize}, Actual: ${fileInfo.size}`);
            }

            // Verificar si el archivo es accesible
            try {
                await RNFS.read(filePath, 1);
            } catch (readError) {
                errors.push('El archivo no es accesible para lectura');
            }

            return {
                isValid: errors.length === 0,
                errors: errors.length > 0 ? errors : undefined,
                warnings: warnings.length > 0 ? warnings : undefined,
            };
        } catch (error) {
            errors.push(`Error al validar: ${error}`);
            return { isValid: false, errors };
        }
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
            return false;
        }
    }

    /*
     * Obtiene el path de descarga según la plataforma
     *
     */

    private getDownloadPath(customPath?: string): string {
        const basePath = Platform.select({
            ios: RNFS.DocumentDirectoryPath,
            android: RNFS.ExternalDirectoryPath || RNFS.DocumentDirectoryPath,
            default: RNFS.DocumentDirectoryPath,
        });

        return `${basePath}/${customPath || DIRECTORIES.ROOT}`;
    }

    /*
     * Obtiene el path temporal según la plataforma
     *
     */
    
    private getTempPath(customPath?: string): string {
        const basePath = RNFS.TemporaryDirectoryPath || RNFS.CachesDirectoryPath;
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
    }

    /*
     * Obtiene el tamaño de una carpeta recursivamente
     *
     */
    
    private async getFolderSize(folderPath: string): Promise<number> {
        try {
            const exists = await RNFS.exists(folderPath);
            if (!exists) return 0;

            const items = await RNFS.readDir(folderPath);
            let totalSize = 0;

            for (const item of items) {
                if (item.isDirectory()) {
                    totalSize += await this.getFolderSize(item.path);
                } else {
                    totalSize += item.size;
                }
            }

            return totalSize;
        } catch (error) {
            this.currentLogger.error(TAG, `Error calculating folder size: ${folderPath}`, error);
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
            this.currentLogger.error(TAG, 'Error cleaning temp files', error);
        }

        return deletedBytes;
    }

    /*
     * Limpia archivos parciales (.part, .tmp, etc)
     *
     */
    
    private async cleanupPartialFiles(): Promise<number> {
        let deletedBytes = 0;
        const partialExtensions = ['.part', '.tmp', '.download', '.partial'];

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
            this.currentLogger.error(TAG, 'Error cleaning partial files', error);
        }

        return deletedBytes;
    }

    /*
     * Verifica umbrales de almacenamiento y emite eventos
     *
     */
    
    private checkStorageThresholds(info: StorageInfo): void {
        const usagePercent = info.usedSpace / info.totalSpace;

        if (usagePercent >= DEFAULT_CONFIG.STORAGE_WARNING_THRESHOLD) {
            this.eventEmitter.emit(StorageEventType.SPACE_CRITICAL, {
                usagePercent,
                availableSpace: info.availableSpace,
            });
        } else if (usagePercent >= 0.8) {
            this.eventEmitter.emit(StorageEventType.SPACE_WARNING, {
                usagePercent,
                availableSpace: info.availableSpace,
            });
        } else if (this.lastStorageInfo) {
            const prevUsagePercent = this.lastStorageInfo.usedSpace / this.lastStorageInfo.totalSpace;
            
            if (prevUsagePercent >= 0.8 && usagePercent < 0.8) {
                this.eventEmitter.emit(StorageEventType.SPACE_RECOVERED, {
                    usagePercent,
                    availableSpace: info.availableSpace,
                });
            }
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
                this.currentLogger.info(TAG, 'Running scheduled cleanup');
                await this.cleanupOrphanedFiles();
            }, intervalMs);

            this.currentLogger.info(TAG, `Cleanup scheduler started (every ${this.config.cleanupIntervalHours} hours)`);
        }
    }

    /*
     * Formatea bytes a string legible
     *
     */
    
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /*
     * Inicia el monitoreo de espacio
     *
     */
    
    public startMonitoring(intervalMs: number = 60000): void {
        if (this.isMonitoring) return;

        this.isMonitoring = true;
        this.monitoringInterval = setInterval(async () => {
            await this.updateStorageInfo();
        }, intervalMs);

        this.currentLogger.info(TAG, 'Storage monitoring started');
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

        this.currentLogger.info(TAG, 'Storage monitoring stopped');
    }

    /*
     * Suscribe a eventos del servicio
     *
     */
    
    public subscribe(event: StorageEventType | 'all', callback: (data: any) => void): () => void {
        if (event === 'all') {
            Object.values(StorageEventType).forEach((eventType) => {
                this.eventEmitter.on(eventType, callback);
            });

            return () => {
                Object.values(StorageEventType).forEach((eventType) => {
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
        this.currentLogger.info(TAG, 'StorageService destroyed');
    }
}

// Exportar instancia singleton
export const storageService = StorageService.getInstance();