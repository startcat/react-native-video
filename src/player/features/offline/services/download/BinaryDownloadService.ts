/*
 * Servicio singleton para gestión de descargas binarias
 * Usa react-native-background-downloader para descargas en background
 * Integra con StorageService y NetworkService
 * 
 */

import { EventEmitter } from 'eventemitter3';
import RNBackgroundDownloader, {
    DownloadTask,
    network,
    priority,
    TaskState
} from 'react-native-background-downloader';

import { PlayerError } from '../../../../core/errors';
import { Logger, LogLevel } from '../../../logger';
import { networkService } from '../network/NetworkService';
import { storageService } from '../storage/StorageService';

import {
    ActiveBinaryDownload,
    BinaryDownloadProgress,
    BinaryDownloadServiceConfig,
    BinaryDownloadTask,
    DownloadError,
    DownloadErrorCode,
    DownloadEventType,
    DownloadStates,
    ValidationResult
} from '../../types';

import {
    LOG_TAGS,
} from '../../constants';

const TAG = LOG_TAGS.BINARY_DOWNLOADER;

export class BinaryDownloadService {

    private static instance: BinaryDownloadService;
    private eventEmitter: EventEmitter;
    private config: BinaryDownloadServiceConfig;
    private currentLogger: Logger;
    private isInitialized: boolean = false;
    private activeDownloads: Map<string, ActiveBinaryDownload> = new Map();
    private downloadQueue: BinaryDownloadTask[] = [];
    private isProcessingQueue: boolean = false;

    // Mapeo de estados de la librería a nuestros estados
    private stateMap = {
        [TaskState.DOWNLOADING]: DownloadStates.DOWNLOADING,
        [TaskState.PAUSED]: DownloadStates.PAUSED,
        [TaskState.DONE]: DownloadStates.COMPLETED,
        [TaskState.FAILED]: DownloadStates.FAILED,
        [TaskState.STOPPED]: DownloadStates.STOPPED,
    };

    private constructor() {
        this.eventEmitter = new EventEmitter();

        this.config = {
            logEnabled: true,
            logLevel: LogLevel.DEBUG,
            maxConcurrentDownloads: 3,
            progressUpdateInterval: 500, // 500ms
            timeoutMs: 30000, // 30 seconds
            maxRetries: 3,
            showNotifications: true,
            allowCellular: false, // Solo WiFi por defecto
            requiresWifi: true,
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
    }

    /*
     * Obtiene la instancia singleton del servicio
     *
     */

    public static getInstance(): BinaryDownloadService {
        if (!BinaryDownloadService.instance) {
            BinaryDownloadService.instance = new BinaryDownloadService();
        }
        return BinaryDownloadService.instance;
    }

    /*
     * Inicializa el servicio
     *
     */

    public async initialize(config?: Partial<BinaryDownloadServiceConfig>): Promise<void> {
        if (this.isInitialized) {
            this.currentLogger.info(TAG, 'BinaryDownloadService already initialized');
            return;
        }

        // Actualizar configuración
        this.config = { ...this.config, ...config };

        this.currentLogger.updateConfig({
            enabled: this.config.logEnabled,
            level: this.config.logLevel,
        });

        try {
            // Verificar dependencias
            if (!storageService) {
                throw new PlayerError('DOWNLOAD_BINARY_SERVICE_INITIALIZATION_FAILED', {
                    originalError: new Error('StorageService is required')
                });
            }

            if (!networkService) {
                throw new PlayerError('DOWNLOAD_BINARY_SERVICE_INITIALIZATION_FAILED', {
                    originalError: new Error('NetworkService is required')
                });
            }

            // Configurar RNBackgroundDownloader
            await this.configureBackgroundDownloader();

            // Suscribirse a eventos de red
            networkService.subscribe('all', this.handleNetworkChange.bind(this));

            // Recuperar descargas pendientes del background downloader
            await this.recoverPendingDownloads();

            this.isInitialized = true;
            this.currentLogger.info(TAG, 'BinaryDownloadService initialized with background downloader');

            // Iniciar procesamiento de cola
            this.startQueueProcessing();

        } catch (error) {
            throw new PlayerError('DOWNLOAD_BINARY_SERVICE_INITIALIZATION_FAILED', {
                originalError: error
            });
        }
    }

    /*
     * Configura RNBackgroundDownloader
     *
     */
    
    private async configureBackgroundDownloader(): Promise<void> {
        try {
            // Configurar opciones globales
            RNBackgroundDownloader.setConfig({
                maxConcurrentTasks: this.config.maxConcurrentDownloads,
                progressReportInterval: this.config.progressUpdateInterval,
                showNotification: this.config.showNotifications,
            });

            this.currentLogger.info(TAG, 'Background downloader configured');

        } catch (error) {
            throw new PlayerError('DOWNLOAD_BINARY_SERVICE_INITIALIZATION_FAILED', {
                originalError: error
            });
        }
    }

    /*
     * Recupera descargas pendientes al inicializar
     *
     */

    private async recoverPendingDownloads(): Promise<void> {
        try {
            const tasks = await RNBackgroundDownloader.checkForExistingDownloads();
            
            for (const task of tasks) {
                this.currentLogger.info(TAG, `Recovered download: ${task.id} - State: ${task.state}`);
                
                // Crear ActiveDownload para las tareas recuperadas
                const activeDownload: ActiveBinaryDownload = {
                    task: {
                        id: task.id,
                        url: task.url,
                        destination: task.destination,
                    },
                    downloadTask: task,
                    startTime: Date.now(), // No conocemos el tiempo real
                    retryCount: 0,
                    state: this.stateMap[task.state] || DownloadStates.QUEUED,
                    progress: {
                        taskId: task.id,
                        bytesWritten: task.bytesWritten || 0,
                        totalBytes: task.totalBytes || 0,
                        percent: task.percent || 0,
                    }
                };

                this.activeDownloads.set(task.id, activeDownload);
                this.setupTaskCallbacks(task, activeDownload);
            }

            this.currentLogger.info(TAG, `Recovered ${tasks.length} pending downloads`);

        } catch (error) {
            this.currentLogger.warn(TAG, `Failed to recover pending downloads: ${error}`);
        }
    }

    /*
     * Inicia la descarga de un archivo binario
     *
     */

    public async startDownload(task: BinaryDownloadTask): Promise<void> {
        if (!this.isInitialized) {
            throw new PlayerError('DOWNLOAD_BINARY_SERVICE_NOT_INITIALIZED');
        }

        // Validar tarea
        const validation = this.validateDownloadTask(task);
        if (!validation.isValid) {
            throw new PlayerError('DOWNLOAD_BINARY_TASK_INVALID', {
                errors: validation.errors,
                task: task.id
            });
        }

        try {
            // Verificar si ya está descargando
            if (this.activeDownloads.has(task.id)) {
                this.currentLogger.warn(TAG, `Download already active: ${task.id}`);
                return;
            }

            // Verificar conectividad
            if (!networkService.isOnline()) {
                throw new PlayerError('NETWORK_CONNECTION_001', { taskId: task.id });
            }

            // Verificar WiFi si es requerido
            if (this.config.requiresWifi && !networkService.isWifiConnected()) {
                throw new PlayerError('NETWORK_DOWNLOADS_WIFI_RESTRICTED', { taskId: task.id });
            }

            // Verificar espacio disponible
            const hasSpace = await storageService.hasEnoughSpace(100 * 1024 * 1024); // 100MB mínimo
            if (!hasSpace) {
                throw new PlayerError('DOWNLOAD_NO_SPACE', { taskId: task.id });
            }

            // Si hay demasiadas descargas activas, agregar a cola
            if (this.activeDownloads.size >= this.config.maxConcurrentDownloads) {
                this.downloadQueue.push(task);
                this.currentLogger.info(TAG, `Download queued: ${task.id}`);
                
                this.eventEmitter.emit(DownloadEventType.QUEUED, {
                    taskId: task.id,
                    queuePosition: this.downloadQueue.length
                });
                return;
            }

            // Iniciar descarga inmediatamente
            await this.executeDownload(task);

        } catch (error) {
            throw new PlayerError('DOWNLOAD_BINARY_START_FAILED', {
                originalError: error,
                taskId: task.id
            });
        }
    }

    /*
     * Pausa una descarga activa
     *
     */

    public async pauseDownload(taskId: string): Promise<void> {
        const download = this.activeDownloads.get(taskId);
        if (!download || !download.downloadTask) {
            throw new PlayerError('DOWNLOAD_BINARY_NOT_FOUND', { taskId });
        }

        if (download.state !== DownloadStates.DOWNLOADING) {
            this.currentLogger.warn(TAG, `Download not in downloading state: ${taskId}`);
            return;
        }

        try {
            // Pausar usando background downloader
            await download.downloadTask.pause();

            // El callback se encargará de actualizar el estado
            this.currentLogger.info(TAG, `Download paused: ${taskId}`);

        } catch (error) {
            throw new PlayerError('DOWNLOAD_BINARY_PAUSE_FAILED', {
                originalError: error,
                taskId
            });
        }
    }

    /*
     * Reanuda una descarga pausada
     *
     */

    public async resumeDownload(taskId: string): Promise<void> {
        const download = this.activeDownloads.get(taskId);
        if (!download || !download.downloadTask) {
            throw new PlayerError('DOWNLOAD_BINARY_NOT_FOUND', { taskId });
        }

        if (download.state !== DownloadStates.PAUSED) {
            this.currentLogger.warn(TAG, `Download not paused: ${taskId}`);
            return;
        }

        try {
            // Verificar conectividad
            if (!networkService.isOnline()) {
                throw new PlayerError('NETWORK_CONNECTION_001', { taskId });
            }

            // Verificar WiFi si es requerido
            if (this.config.requiresWifi && !networkService.isWifiConnected()) {
                throw new PlayerError('NETWORK_DOWNLOADS_WIFI_RESTRICTED', { taskId });
            }

            // Reanudar usando background downloader
            await download.downloadTask.resume();

            this.currentLogger.info(TAG, `Download resumed: ${taskId}`);

        } catch (error) {
            throw new PlayerError('DOWNLOAD_BINARY_RESUME_FAILED', {
                originalError: error,
                taskId
            });
        }
    }

    /*
     * Cancela una descarga
     *
     */

    public async cancelDownload(taskId: string): Promise<void> {
        const download = this.activeDownloads.get(taskId);
        
        if (!download) {
            // Verificar si está en cola
            const queueIndex = this.downloadQueue.findIndex(task => task.id === taskId);
            if (queueIndex >= 0) {
                this.downloadQueue.splice(queueIndex, 1);
                this.eventEmitter.emit(DownloadEventType.CANCELLED, { taskId });
                return;
            }
            throw new PlayerError('DOWNLOAD_BINARY_NOT_FOUND', { taskId });
        }

        try {
            // Cancelar usando background downloader
            if (download.downloadTask) {
                await download.downloadTask.stop();
            }

            // Remover de descargas activas
            this.activeDownloads.delete(taskId);

            this.eventEmitter.emit(DownloadEventType.CANCELLED, {
                taskId,
                progress: download.progress
            });

            this.currentLogger.info(TAG, `Download cancelled: ${taskId}`);

        } catch (error) {
            throw new PlayerError('DOWNLOAD_BINARY_CANCEL_FAILED', {
                originalError: error,
                taskId
            });
        }
    }

    /*
     * Obtiene el estado de una descarga
     *
     */

    public getDownloadState(taskId: string): ActiveBinaryDownload | null {
        const download = this.activeDownloads.get(taskId);
        return download ? { ...download } : null;
    }

    /*
     * Obtiene todas las descargas activas
     *
     */

    public getAllActiveDownloads(): ActiveBinaryDownload[] {
        return Array.from(this.activeDownloads.values()).map(d => ({ ...d }));
    }

    /*
     * Obtiene estadísticas del servicio
     *
     */
    
    public getStats() {
        const downloads = Array.from(this.activeDownloads.values());
        
        return {
            activeDownloads: this.activeDownloads.size,
            queuedDownloads: this.downloadQueue.length,
            totalDownloaded: downloads.reduce((sum, d) => sum + d.progress.bytesWritten, 0),
            averageSpeed: this.calculateAverageSpeed(downloads),
            states: {
                downloading: downloads.filter(d => d.state === DownloadStates.DOWNLOADING).length,
                paused: downloads.filter(d => d.state === DownloadStates.PAUSED).length,
                failed: downloads.filter(d => d.state === DownloadStates.FAILED).length,
                completed: downloads.filter(d => d.state === DownloadStates.COMPLETED).length,
            }
        };
    }

    /*
     * Ejecuta la descarga de un archivo usando background downloader
     *
     */

    private async executeDownload(task: BinaryDownloadTask): Promise<void> {
        const activeDownload: ActiveBinaryDownload = {
            task,
            startTime: Date.now(),
            retryCount: 0,
            state: DownloadStates.DOWNLOADING,
            progress: {
                taskId: task.id,
                bytesWritten: 0,
                totalBytes: 0,
                percent: 0
            }
        };

        this.activeDownloads.set(task.id, activeDownload);

        try {
            // Crear directorio de destino si no existe
            const destinationDir = task.destination.substring(0, task.destination.lastIndexOf('/'));
            await storageService.createDirectory(destinationDir);

            // Configurar opciones de descarga
            const downloadOptions = {
                id: task.id,
                url: task.url,
                destination: task.destination,
                headers: task.headers || {},
                priority: priority.HIGH,
                network: this.config.allowCellular ? network.ALL : network.WIFI_ONLY,
                progressInterval: task.progressInterval || this.config.progressUpdateInterval,
            };

            // Crear tarea de descarga
            const downloadTask = RNBackgroundDownloader.download(downloadOptions);
            
            // Guardar referencia a la tarea
            activeDownload.downloadTask = downloadTask;
            this.activeDownloads.set(task.id, activeDownload);

            // Configurar callbacks
            this.setupTaskCallbacks(downloadTask, activeDownload);

            // Emitir evento de inicio
            this.eventEmitter.emit(DownloadEventType.STARTED, {
                taskId: task.id,
                url: task.url,
                destination: task.destination
            });

            this.currentLogger.info(TAG, `Download started: ${task.id} - ${task.url}`);

        } catch (error) {
            await this.handleDownloadError(task.id, error);
        }
    }

    /*
     * Configura callbacks para una tarea de descarga
     *
     */
    
    private setupTaskCallbacks(downloadTask: DownloadTask, activeDownload: ActiveBinaryDownload): void {
        const taskId = activeDownload.task.id;

        // Callback de progreso
        downloadTask.progress((percent: number, bytesWritten: number, totalBytes: number) => {
            const progress: BinaryDownloadProgress = {
                taskId,
                bytesWritten,
                totalBytes,
                percent: Math.round(percent * 100)
            };

            activeDownload.progress = progress;
            this.activeDownloads.set(taskId, activeDownload);

            this.eventEmitter.emit(DownloadEventType.PROGRESS, progress);

            this.currentLogger.debug(TAG, `Download progress: ${taskId} - ${progress.percent}%`);
        });

        // Callback de estado
        downloadTask.state((state: TaskState) => {
            const mappedState = this.stateMap[state] || DownloadStates.QUEUED;
            activeDownload.state = mappedState;
            this.activeDownloads.set(taskId, activeDownload);

            this.currentLogger.debug(TAG, `Download state changed: ${taskId} - ${mappedState}`);

            // Emitir eventos específicos según el estado
            switch (state) {
                case TaskState.PAUSED:
                    this.eventEmitter.emit(DownloadEventType.PAUSED, {
                        taskId,
                        progress: activeDownload.progress
                    });
                    break;

                case TaskState.DONE:
                    this.handleDownloadSuccess(taskId);
                    break;

                case TaskState.FAILED:
                    this.handleDownloadError(taskId, new Error('Download failed'));
                    break;

                case TaskState.STOPPED:
                    // Tratado como cancelado
                    break;
            }
        });

        // Callback de completado
        downloadTask.done(() => {
            this.handleDownloadSuccess(taskId);
        });

        // Callback de error
        downloadTask.error((error: Error) => {
            this.handleDownloadError(taskId, error);
        });
    }

    /*
     * Maneja descarga exitosa
     *
     */

    private async handleDownloadSuccess(taskId: string): Promise<void> {
        const download = this.activeDownloads.get(taskId);
        if (!download) return;

        try {
            // Validar archivo descargado
            const validation = await storageService.validateFile(download.task.destination);
            if (!validation.isValid) {
                throw new PlayerError('DOWNLOAD_CORRUPTED', {
                    taskId,
                    validationErrors: validation.errors
                });
            }

            // Actualizar estado
            download.state = DownloadStates.COMPLETED;
            download.progress.percent = 100;

            // Emitir evento de completado
            this.eventEmitter.emit(DownloadEventType.COMPLETED, {
                taskId,
                filePath: download.task.destination,
                fileSize: download.progress.totalBytes,
                duration: Date.now() - download.startTime
            });

            this.currentLogger.info(TAG, `Download completed: ${taskId} - ${this.formatBytes(download.progress.totalBytes)}`);

            // Remover de descargas activas después de un breve delay
            setTimeout(() => {
                this.activeDownloads.delete(taskId);
                this.processNextInQueue();
            }, 1000);

        } catch (error) {
            await this.handleDownloadError(taskId, error);
        }
    }

    /*
     * Maneja errores de descarga
     *
     */

    private async handleDownloadError(taskId: string, error: any): Promise<void> {
        const download = this.activeDownloads.get(taskId);
        if (!download) return;

        const downloadError: DownloadError = {
            code: this.mapErrorToCode(error),
            message: error.message || 'Unknown download error',
            details: error,
            timestamp: Date.now()
        };

        download.error = downloadError;
        download.retryCount++;

        // Intentar reintento si no se han agotado
        if (download.retryCount < this.config.maxRetries) {
            this.currentLogger.warn(TAG, `Download failed, retrying (${download.retryCount}/${this.config.maxRetries}): ${taskId}`);
            
            // Reintento después de un delay exponencial
            const delay = Math.pow(2, download.retryCount) * 1000;
            setTimeout(() => {
                // Cancelar tarea anterior y crear nueva
                if (download.downloadTask) {
                    download.downloadTask.stop().catch(() => {});
                }
                this.executeDownload(download.task);
            }, delay);

            return;
        }

        // Marcar como fallido
        download.state = DownloadStates.FAILED;
        this.activeDownloads.set(taskId, download);

        this.eventEmitter.emit(DownloadEventType.FAILED, {
            taskId,
            error: downloadError
        });

        this.currentLogger.error(TAG, `Download failed: ${taskId}`, downloadError);

        // Procesar siguiente en cola
        this.processNextInQueue();
    }

    /*
     * Procesa la siguiente descarga en cola
     *
     */
    
    private processNextInQueue(): void {
        if (this.downloadQueue.length === 0 || this.activeDownloads.size >= this.config.maxConcurrentDownloads) {
            return;
        }

        const nextTask = this.downloadQueue.shift();
        if (nextTask) {
            this.executeDownload(nextTask);
        }
    }

    /*
     * Inicia el procesamiento periódico de la cola
     *
     */
    
    private startQueueProcessing(): void {
        if (this.isProcessingQueue) return;

        this.isProcessingQueue = true;
        setInterval(() => {
            this.processNextInQueue();
        }, 5000); // Cada 5 segundos

        this.currentLogger.debug(TAG, 'Queue processing started');
    }

    /*
     * Maneja cambios de red
     *
     */

    private handleNetworkChange(networkStatus: any): void {
        // Si WiFi es requerido y se perdió la conexión WiFi
        if (this.config.requiresWifi && !networkStatus.isWifi && networkStatus.isCellular) {
            this.currentLogger.info(TAG, 'WiFi lost, pausing downloads that require WiFi');
            
            for (const [taskId, download] of this.activeDownloads) {
                if (download.state === DownloadStates.DOWNLOADING) {
                    this.pauseDownload(taskId).catch(error => {
                        this.currentLogger.error(TAG, `Failed to pause download on network change: ${taskId}`, error);
                    });
                }
            }
        }

        // Si se perdió toda la conectividad
        if (!networkStatus.isConnected) {
            this.currentLogger.info(TAG, 'Network lost, downloads will pause automatically');
        }

        // Si volvió la conectividad adecuada, las descargas se reanudan automáticamente
        // gracias a react-native-background-downloader
    }

    /*
     * Valida una tarea de descarga
     *
     */
    
    private validateDownloadTask(task: BinaryDownloadTask): ValidationResult {
        const errors: string[] = [];

        if (!task.id || task.id.trim().length === 0) {
            errors.push('Task ID is required');
        }

        if (!task.url || !this.isValidUrl(task.url)) {
            errors.push('Valid URL is required');
        }

        if (!task.destination || task.destination.trim().length === 0) {
            errors.push('Destination path is required');
        }

        return {
            isValid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined
        };
    }

    /*
     * Verifica si una URL es válida
     *
     */
    
    private isValidUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    /*
     * Mapea errores a códigos conocidos
     *
     */

    private mapErrorToCode(error: any): DownloadErrorCode {
        if (!error) return DownloadErrorCode.UNKNOWN;

        const message = error.message?.toLowerCase() || '';

        if (message.includes('network') || message.includes('connection')) {
            return DownloadErrorCode.NETWORK_ERROR;
        }

        if (message.includes('space') || message.includes('disk')) {
            return DownloadErrorCode.INSUFFICIENT_SPACE;
        }

        if (message.includes('permission')) {
            return DownloadErrorCode.PERMISSION_DENIED;
        }

        if (message.includes('timeout')) {
            return DownloadErrorCode.TIMEOUT;
        }

        if (message.includes('cancelled') || message.includes('stopped')) {
            return DownloadErrorCode.CANCELLED;
        }

        return DownloadErrorCode.UNKNOWN;
    }

    /*
     * Calcula velocidad promedio de descargas activas
     *
     */
    
    private calculateAverageSpeed(downloads: ActiveBinaryDownload[]): number {
        const activeDownloads = downloads.filter(d => d.state === DownloadStates.DOWNLOADING);
        if (activeDownloads.length === 0) return 0;

        const totalSpeed = activeDownloads.reduce((sum, download) => {
            const elapsedTime = (Date.now() - download.startTime) / 1000; // segundos
            const speed = elapsedTime > 0 ? download.progress.bytesWritten / elapsedTime : 0;
            return sum + speed;
        }, 0);

        return Math.round(totalSpeed / activeDownloads.length);
    }

    /*
     * Formatea bytes a string legible
     *
     */
    
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /*
     * Configura opciones de WiFi/celular
     *
     */
    
    public setNetworkPolicy(requiresWifi: boolean, allowCellular: boolean): void {
        this.config.requiresWifi = requiresWifi;
        this.config.allowCellular = allowCellular;
        
        this.currentLogger.info(TAG, `Network policy updated: WiFi required=${requiresWifi}, Cellular allowed=${allowCellular}`);
    }

    /*
     * Habilita/deshabilita notificaciones
     *
     */

    public setNotificationsEnabled(enabled: boolean): void {
        this.config.showNotifications = enabled;
        RNBackgroundDownloader.setConfig({
            showNotification: enabled
        });
        
        this.currentLogger.info(TAG, `Notifications ${enabled ? 'enabled' : 'disabled'}`);
    }

    /*
     * Suscribe a eventos del servicio
     *
     */
    
    public subscribe(event: DownloadEventType | 'all', callback: (data: any) => void): () => void {
        if (event === 'all') {
            Object.values(DownloadEventType).forEach((eventType) => {
                this.eventEmitter.on(eventType, callback);
            });

            return () => {
                Object.values(DownloadEventType).forEach((eventType) => {
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
        this.isProcessingQueue = false;

        // Cancelar todas las descargas activas
        for (const taskId of this.activeDownloads.keys()) {
            this.cancelDownload(taskId).catch(error => {
                this.currentLogger.error(TAG, `Failed to cancel download during destroy: ${taskId}`, error);
            });
        }

        this.eventEmitter.removeAllListeners();
        this.activeDownloads.clear();
        this.downloadQueue.length = 0;
        this.isInitialized = false;

        this.currentLogger.info(TAG, 'BinaryDownloadService destroyed');
    }
}

// Exportar instancia singleton
export const binaryDownloadService = BinaryDownloadService.getInstance();