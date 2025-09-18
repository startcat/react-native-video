import { EventEmitter } from 'eventemitter3';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { PlayerError } from '../../../../core/errors';
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
    PATTERNS
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
            prefix: LOG_TAGS.MAIN,
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
            throw new PlayerError('STORAGE_FILE_SYSTEM_601', {
                originalError: error,
                context: 'StorageService.getTotalSpace'
            });
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
            throw new PlayerError('STORAGE_FILE_SYSTEM_601', {
                originalError: error,
                context: 'StorageService.getUsedSpace'
            });
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
            throw new PlayerError('STORAGE_FILE_SYSTEM_601', {
                originalError: error,
                context: 'StorageService.getAvailableSpace'
            });
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
            throw new PlayerError('STORAGE_FILE_SYSTEM_612', {
                originalError: error,
                context: 'StorageService.getDownloadsFolderSize'
            });
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
            throw new PlayerError('STORAGE_FILE_SYSTEM_612', {
                originalError: error,
                context: 'StorageService.getTempFolderSize'
            });
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
        this.eventEmitter.emit(StorageEventType.INFO_UPDATED, info);
        
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
     * Crea un archivo con contenido
     *
     */

    public async createFile(
        path: string,
        content: string | Uint8Array,
        encoding: 'utf8' | 'base64' = 'utf8'
    ): Promise<FileInfo> {
        try {
            // Validar nombre
            this.validateFilename(path);
            
            // Asegurar directorio
            const directory = path.substring(0, path.lastIndexOf('/'));
            await this.createDirectory(directory);
                
            // Escribir archivo
            await RNFS.writeFile(path, content.toString(), encoding);
                
            const fileInfo = await this.getFileInfo(path);
                
            this.currentLogger.debug(TAG, `File created: ${path}`);
            this.eventEmitter.emit(StorageEventType.FILE_CREATED, fileInfo);
                
            return fileInfo!;
        } catch (error) {
            throw new PlayerError('STORAGE_FILE_SYSTEM_609', {
                originalError: error,
                path,
                context: 'StorageService.createFile'
            });
        }
    }

    /*
     * Lee el contenido de un archivo
     *
     */

    public async readFile(
        path: string,
        encoding: 'utf8' | 'base64' = 'utf8'
    ): Promise<string> {
        try {
            const exists = await RNFS.exists(path);
            if (!exists) {
                throw new PlayerError('STORAGE_FILE_SYSTEM_602', {
                    path,
                    context: 'StorageService.readFile'
                });
            }

            return await RNFS.readFile(path, encoding);
        } catch (error) {
            if (error instanceof PlayerError) throw error;
            
            throw new PlayerError('STORAGE_FILE_SYSTEM_610', {
                originalError: error,
                path,
                context: 'StorageService.readFile'
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
                throw new PlayerError('STORAGE_FILE_SYSTEM_602', {
                    filePath,
                    context: 'StorageService.deleteFile'
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
            throw new PlayerError('STORAGE_FILE_SYSTEM_604', {
                originalError: error,
                filePath,
                context: 'StorageService.deleteFile'
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
            this.currentLogger.error(TAG, `Error moving file from ${source} to ${destination}`, error);
            throw new PlayerError('STORAGE_FILE_SYSTEM_605', {
                originalError: error,
                source,
                destination,
                context: 'StorageService.moveFile'
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
            this.currentLogger.error(TAG, `Error copying file from ${source} to ${destination}`, error);
            throw new PlayerError('STORAGE_FILE_SYSTEM_606', {
                originalError: error,
                source,
                destination,
                context: 'StorageService.copyFile'
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
            if (error?.code === 'ENOENT') {
                return null;
            }
            this.currentLogger.error(TAG, `Error getting file info: ${filePath}`, error);
            throw new PlayerError('STORAGE_FILE_SYSTEM_608', {
                originalError: error,
                filePath,
                context: 'StorageService.getFileInfo'
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
                errors.push('File does not exist');
                return { isValid: false, errors };
            }

            if (fileInfo.size === 0) {
                errors.push('File is empty');
            }

            if (expectedSize && fileInfo.size !== expectedSize) {
                errors.push(`Incorrect file size. Expected: ${expectedSize}, Actual: ${fileInfo.size}`);
            }

            // Verificar si el archivo es accesible
            try {
                await RNFS.read(filePath, 1);
            } catch (readError) {
                errors.push('File is not accessible for reading');
            }

            return {
                isValid: errors.length === 0,
                errors: errors.length > 0 ? errors : undefined,
                warnings: warnings.length > 0 ? warnings : undefined,
            };
        } catch (error) {
            this.currentLogger.error(TAG, `Error validating file: ${filePath}`, error);
            throw new PlayerError('STORAGE_FILE_SYSTEM_607', {
                originalError: error,
                filePath,
                expectedSize,
                context: 'StorageService.validateFile'
            });
        }
    }

    /*
     * Genera path único para descargas
     *
     */

    public generateUniquePath(
        directory: string,
        filename: string,
        extension: string
    ): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const sanitized = this.sanitizeFilename(filename);
        return `${directory}/${sanitized}_${timestamp}_${random}${extension}`;
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
            throw new PlayerError('STORAGE_FILE_SYSTEM_603', {
                originalError: error,
                path,
                context: 'StorageService.createDirectory'
            });
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
            throw new PlayerError('STORAGE_FILE_SYSTEM_612', {
                originalError: error,
                folderPath,
                context: 'StorageService.getFolderSize'
            });
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
            throw new PlayerError('STORAGE_FILE_SYSTEM_611', {
                originalError: error,
                tempPath: this.tempPath,
                context: 'StorageService.cleanupTempFiles'
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
            throw new PlayerError('STORAGE_FILE_SYSTEM_611', {
                originalError: error,
                downloadPath: this.downloadPath,
                context: 'StorageService.cleanupPartialFiles'
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
     * Valida un nombre de archivo
     *
     */

    private validateFilename(filename: string): void {
        // Extraer solo el nombre del archivo si es una ruta completa
        const name = filename.includes('/') 
            ? filename.substring(filename.lastIndexOf('/') + 1)
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
        const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
        const nameWithoutExt = name?.split('.')[0]?.toUpperCase();
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
        let sanitized = filename.replace(/[^a-zA-Z0-9._\- ]/g, '_');
        
        // Limitar longitud
        if (sanitized.length > LIMITS.MAX_FILENAME_LENGTH - 20) {
            sanitized = sanitized.substring(0, LIMITS.MAX_FILENAME_LENGTH - 20);
        }

        // Remover espacios al inicio y final
        sanitized = sanitized.trim();

        // Reemplazar múltiples underscores con uno
        sanitized = sanitized.replace(/_+/g, '_');

        return sanitized || 'download';
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
            this.currentLogger.debug(TAG, 'Storage info updated from monitoring');
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