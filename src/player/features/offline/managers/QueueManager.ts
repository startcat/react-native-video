/*
 * Servicio singleton para gestión de cola de descargas
 * Usa PersistenceService y StorageService existentes
 * 
 */

import { EventEmitter } from 'eventemitter3';
import { PlayerError } from '../../../core/errors';
import { Logger, LogLevel } from '../../logger';
import { persistenceService } from '../services/storage/PersistenceService';
import { storageService } from '../services/storage/StorageService';

import {
    DownloadEventType,
    DownloadItem,
    DownloadStates,
    QueueServiceConfig,
    QueueStatusCallback,
} from '../types';

import { LOG_TAGS } from "../constants";

const TAG = LOG_TAGS.QUEUE_MANAGER;

export class QueueManager {

    private static instance: QueueManager;
    private eventEmitter: EventEmitter;
    private downloadQueue: Map<string, DownloadItem> = new Map();
    private isProcessing: boolean = false;
    private isPaused: boolean = false;
    private isInitialized: boolean = false;
    private config: QueueServiceConfig;
    private processingInterval: ReturnType<typeof setTimeout> | null = null;
    private currentlyDownloading: Set<string> = new Set();
    private currentLogger: Logger;

    private constructor() {
        this.eventEmitter = new EventEmitter();

        this.config = {
            logEnabled: true,
            logLevel: LogLevel.DEBUG,
            autoProcess: true,
            processIntervalMs: 2000,
            maxConcurrentDownloads: 3,
            maxRetries: 3,
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

    public static getInstance(): QueueManager {
        if (!QueueManager.instance) {
            QueueManager.instance = new QueueManager();
        }
        return QueueManager.instance;
    }

    /*
     * Inicializa el servicio de cola de descargas
     *
     */

    public async initialize(config?: Partial<QueueServiceConfig>): Promise<void> {
        
        if (this.isInitialized) {
            this.currentLogger.info(TAG, 'QueueManager already initialized');
            return;
        }

        // Actualizar configuración
        this.config = { ...this.config, ...config };

        this.currentLogger.updateConfig({
            enabled: this.config.logEnabled,
            level: this.config.logLevel,
        });

        try {
            // Cargar cola persistida usando PersistenceService
            await this.loadPersistedQueue();

            // Inicializar procesamiento automático
            if (this.config.autoProcess) {
                this.startProcessing();
            }

            this.isInitialized = true;
            this.currentLogger.info(TAG, `QueueManager initialized with ${this.downloadQueue.size} downloads`);

        } catch (error) {
            throw new PlayerError('DOWNLOAD_QUEUE_MANAGER_INITIALIZATION_FAILED', { 
                originalError: error
            });
        }
    }

    /*
     * Añade una descarga a la cola
     *
     */

    public async addDownload(downloadData: {
        contentId: string;
        title: string;
        uri: string;
        profileId?: string | null;
        type?: string;
        drmScheme?: string;
    }): Promise<string> {
        if (!this.isInitialized) {
            throw new PlayerError('DOWNLOAD_QUEUE_MANAGER_NOT_INITIALIZED');
        }

        // Verificar si ya existe
        const existing = Array.from(this.downloadQueue.values()).find(item => 
            item.offlineData.source.id === downloadData.contentId &&
            item.profileId === downloadData.profileId
        );

        if (existing) {
            this.currentLogger.info(TAG, `Download already exists: ${downloadData.title}`);
            return existing.offlineData.source.id;
        }

        try {
            const downloadId = this.generateDownloadId();
            const downloadItem: DownloadItem = {
                profileId: downloadData.profileId || null,
                offlineData: {
                    session_ids: [downloadId],
                    source: {
                        id: downloadData.contentId,
                        title: downloadData.title,
                        uri: downloadData.uri,
                        type: downloadData.type,
                        drmScheme: downloadData.drmScheme,
                    },
                    state: DownloadStates.QUEUED,
                    percent: 0,
                    startedAt: Date.now(),
                }
            };

            // Añadir a la cola
            this.downloadQueue.set(downloadId, downloadItem);

            // Persistir usando PersistenceService
            await persistenceService.saveDownloadState(this.downloadQueue);

            // Emitir evento
            this.eventEmitter.emit(DownloadEventType.QUEUED, {
                downloadId,
                item: downloadItem,
                queueSize: this.downloadQueue.size
            });

            this.currentLogger.info(TAG, `Download queued: ${downloadItem.offlineData.source.title} (${downloadId})`);
            return downloadId;

        } catch (error) {
            throw new PlayerError('DOWNLOAD_QUEUE_ADD_ITEM_FAILED', {
                originalError: error,
                contentId: downloadData.contentId
            });
        }
    }

    /*
     * Elimina una descarga de la cola
     *
     */

    public async removeDownload(downloadId: string): Promise<void> {
        if (!this.isInitialized) {
            throw new PlayerError('DOWNLOAD_QUEUE_MANAGER_NOT_INITIALIZED');
        }

        try {
            const item = this.downloadQueue.get(downloadId);
            if (!item) {
                throw new PlayerError('DOWNLOAD_QUEUE_ITEM_NOT_FOUND', { downloadId });
            }

            // Cambiar estado a removing
            item.offlineData.state = DownloadStates.REMOVING;
            this.downloadQueue.set(downloadId, item);

            // Si se está descargando, detenerla
            if (this.currentlyDownloading.has(downloadId)) {
                this.currentlyDownloading.delete(downloadId);
            }

            // Eliminar archivos del disco usando StorageService
            if (item.offlineData.fileUri) {
                try {
                    await storageService.deleteFile(item.offlineData.fileUri);
                } catch (error) {
                    this.currentLogger.warn(TAG, `Failed to delete file: ${item.offlineData.fileUri}`);
                }
            }

            // Remover de la cola
            this.downloadQueue.delete(downloadId);

            // Persistir cambios
            await persistenceService.saveDownloadState(this.downloadQueue);

            // Emitir evento
            this.eventEmitter.emit(DownloadEventType.REMOVED, {
                downloadId,
                item,
                queueSize: this.downloadQueue.size
            });

            this.currentLogger.info(TAG, `Download removed: ${item.offlineData.source.title} (${downloadId})`);

        } catch (error) {
            throw new PlayerError('DOWNLOAD_QUEUE_REMOVE_FAILED', {
                originalError: error,
                downloadId
            });
        }
    }

    /*
     * Pausa una descarga específica
     *
     */

    public async pauseDownload(downloadId: string): Promise<void> {
        const item = this.downloadQueue.get(downloadId);
        if (item && item.offlineData.state === DownloadStates.DOWNLOADING) {
            await this.updateDownloadState(downloadId, DownloadStates.PAUSED);
            this.currentlyDownloading.delete(downloadId);
            
            this.eventEmitter.emit(DownloadEventType.PAUSED, { downloadId, item });
        }
    }

    /*
     * Reanuda una descarga específica
     *
     */

    public async resumeDownload(downloadId: string): Promise<void> {
        const item = this.downloadQueue.get(downloadId);
        if (item && item.offlineData.state === DownloadStates.PAUSED) {
            await this.updateDownloadState(downloadId, DownloadStates.QUEUED);
            
            this.eventEmitter.emit(DownloadEventType.RESUMED, { downloadId, item });
        }
    }

    /*
     * Pausa todas las descargas
     *
     */

    public pauseAll(): void {
        this.isPaused = true;
        this.currentLogger.info(TAG, 'All downloads paused');
    }

    /*
     * Reanuda todas las descargas
     *
     */

    public resumeAll(): void {
        this.isPaused = false;
        this.currentLogger.info(TAG, 'All downloads resumed');
    }

    /*
     * Obtiene el estado actual de la cola
     *
     */

    public getQueueState() {
        const items = Array.from(this.downloadQueue.values());
        const pending = items.filter(item => item.offlineData.state === DownloadStates.QUEUED).length;
        const downloading = items.filter(item => item.offlineData.state === DownloadStates.DOWNLOADING).length;
        const paused = items.filter(item => item.offlineData.state === DownloadStates.PAUSED).length;
        const completed = items.filter(item => item.offlineData.state === DownloadStates.COMPLETED).length;
        const failed = items.filter(item => item.offlineData.state === DownloadStates.FAILED).length;

        return {
            total: this.downloadQueue.size,
            pending,
            downloading,
            paused,
            completed,
            failed,
            isPaused: this.isPaused,
            isProcessing: this.isProcessing,
        };
    }

    /*
     * Obtiene todas las descargas
     *
     */

    public getAllDownloads(): DownloadItem[] {
        return Array.from(this.downloadQueue.values()).map(item => ({ ...item }));
    }

    /*
     * Obtiene descargas filtradas por perfil
     *
     */

    public getDownloadsByProfile(profileId: string | null): DownloadItem[] {
        return Array.from(this.downloadQueue.values())
            .filter(item => item.profileId === profileId)
            .map(item => ({ ...item }));
    }

    /*
     * Obtiene una descarga específica
     *
     */

    public getDownload(downloadId: string): DownloadItem | null {
        const item = this.downloadQueue.get(downloadId);
        return item ? { ...item } : null;
    }

    /*
     * Limpia descargas completadas
     *
     */

    public async cleanupCompleted(): Promise<void> {
        try {
            const beforeCount = this.downloadQueue.size;
            const completedIds: string[] = [];

            for (const [id, item] of this.downloadQueue) {
                if (item.offlineData.state === DownloadStates.COMPLETED) {
                    completedIds.push(id);
                }
            }

            completedIds.forEach(id => this.downloadQueue.delete(id));

            const removed = beforeCount - this.downloadQueue.size;

            if (removed > 0) {
                await persistenceService.saveDownloadState(this.downloadQueue);
                this.currentLogger.info(TAG, `Cleaned up ${removed} completed downloads`);
            }

        } catch (error) {
            throw new PlayerError('DOWNLOAD_QUEUE_CLEANUP_FAILED', {
                originalError: error
            });
        }
    }

    /*
     * Suscribe a eventos de cola
     *
     */

    public subscribe(event: DownloadEventType | 'all', callback: QueueStatusCallback): () => void {
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
     * Inicia el procesamiento de descargas
     *
     */

    private startProcessing(): void {
        if (this.processingInterval) {
            return;
        }

        this.isProcessing = true;
        this.processingInterval = setInterval(() => {
            if (!this.isPaused) {
                this.processQueue();
            }
        }, this.config.processIntervalMs);

        this.currentLogger.debug(TAG, 'Download processing started');
    }

    /*
     * Detiene el procesamiento de descargas
     *
     */

    private stopProcessing(): void {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        this.isProcessing = false;
        this.currentLogger.debug(TAG, 'Download processing stopped');
    }

    /*
     * Procesa la cola de descargas
     *
     */

    private async processQueue(): Promise<void> {
        // Verificar límite de descargas concurrentes
        if (this.currentlyDownloading.size >= this.config.maxConcurrentDownloads) {
            return;
        }

        // Buscar siguiente descarga en cola
        let nextDownload: DownloadItem | null = null;
        let nextDownloadId: string | null = null;

        for (const [id, item] of this.downloadQueue) {
            if (item.offlineData.state === DownloadStates.QUEUED && 
                !this.currentlyDownloading.has(id)) {
                nextDownload = item;
                nextDownloadId = id;
                break;
            }
        }

        if (!nextDownload || !nextDownloadId) {
            return; // No hay descargas pendientes
        }

        try {
            // Verificar espacio disponible usando StorageService
            const hasSpace = await storageService.hasEnoughSpace(100 * 1024 * 1024); // 100MB por defecto
            if (!hasSpace) {
                this.currentLogger.warn(TAG, 'Insufficient storage space for download');
                await this.updateDownloadState(nextDownloadId, DownloadStates.FAILED);
                return;
            }

            // Marcar como descargando
            this.currentlyDownloading.add(nextDownloadId);
            await this.updateDownloadState(nextDownloadId, DownloadStates.DOWNLOADING);

            // Emitir evento de inicio
            this.eventEmitter.emit(DownloadEventType.STARTED, {
                downloadId: nextDownloadId,
                item: nextDownload
            });

            // Simular descarga (aquí iría la lógica real de descarga)
            this.simulateDownload(nextDownloadId, nextDownload);

        } catch (error) {
            this.currentLogger.error(TAG, `Failed to start download: ${error}`);
            this.currentlyDownloading.delete(nextDownloadId);
        }
    }

    /*
     * Simula el proceso de descarga (reemplazar por implementación real)
     *
     */

    private simulateDownload(downloadId: string, item: DownloadItem): void {
        const totalTime = Math.random() * 10000 + 2000; // 2-12 segundos
        const updateInterval = 200;
        const incrementPerUpdate = (100 / (totalTime / updateInterval));
        
        let currentProgress = item.offlineData.percent || 0;
        
        const progressInterval = setInterval(async () => {
            currentProgress += incrementPerUpdate;
            
            if (currentProgress >= 100) {
                currentProgress = 100;
                clearInterval(progressInterval);
                
                // Simular éxito/fallo (90% éxito)
                const success = Math.random() > 0.1;
                
                if (success) {
                    // Generar ruta de archivo usando StorageService
                    const fileName = `${item.offlineData.source.id}.mp4`;
                    const filePath = storageService.generateUniquePath(
                        '/downloads',
                        item.offlineData.source.title,
                        '.mp4'
                    );

                    await this.updateDownloadProgress(downloadId, 100);
                    await this.updateDownloadState(downloadId, DownloadStates.COMPLETED, filePath);
                    
                    this.eventEmitter.emit(DownloadEventType.COMPLETED, {
                        downloadId,
                        item: { ...item, offlineData: { ...item.offlineData, fileUri: filePath } }
                    });
                    
                    this.currentLogger.info(TAG, `Download completed: ${item.offlineData.source.title}`);
                } else {
                    await this.handleDownloadFailure(downloadId, item, new Error('Simulated download error'));
                }
                
                this.currentlyDownloading.delete(downloadId);
            } else {
                await this.updateDownloadProgress(downloadId, Math.floor(currentProgress));
                
                this.eventEmitter.emit(DownloadEventType.PROGRESS, {
                    downloadId,
                    percent: Math.floor(currentProgress),
                    item
                });
            }
        }, updateInterval);
    }

    /*
     * Maneja fallos de descarga
     *
     */

    private async handleDownloadFailure(downloadId: string, item: DownloadItem, error: any): Promise<void> {
        const retryCount = (item.retryCount || 0) + 1;

        if (retryCount >= this.config.maxRetries) {
            await this.updateDownloadState(downloadId, DownloadStates.FAILED);
            this.eventEmitter.emit(DownloadEventType.FAILED, {
                downloadId,
                item,
                error
            });
            this.currentLogger.error(TAG, `Download failed after ${retryCount} retries: ${item.offlineData.source.title}`);
        } else {
            // Actualizar retry count
            item.retryCount = retryCount;
            this.downloadQueue.set(downloadId, item);

            // Programar reintento
            setTimeout(async () => {
                await this.updateDownloadState(downloadId, DownloadStates.QUEUED);
                this.currentLogger.info(TAG, `Retrying download (${retryCount}/${this.config.maxRetries}): ${item.offlineData.source.title}`);
            }, 5000);
        }
    }

    /*
     * Actualiza el estado de una descarga
     *
     */

    private async updateDownloadState(downloadId: string, state: DownloadStates, fileUri?: string): Promise<void> {
        const item = this.downloadQueue.get(downloadId);
        if (item) {
            item.offlineData.state = state;
            if (fileUri) {
                item.offlineData.fileUri = fileUri;
            }
            if (state === DownloadStates.COMPLETED) {
                item.offlineData.downloadedAt = Date.now();
            }

            this.downloadQueue.set(downloadId, item);

            // Persistir cambios usando PersistenceService
            await persistenceService.saveDownloadState(this.downloadQueue);
        }
    }

    /*
     * Actualiza el progreso de una descarga
     *
     */
    
    private async updateDownloadProgress(downloadId: string, progress: number): Promise<void> {
        const item = this.downloadQueue.get(downloadId);
        if (item) {
            item.offlineData.percent = Math.max(0, Math.min(100, progress));
            this.downloadQueue.set(downloadId, item);
            
            // Solo persistir en cambios importantes de progreso (cada 10%)
            if (progress % 10 === 0) {
                await persistenceService.saveDownloadState(this.downloadQueue);
            }
        }
    }

    /*
     * Carga la cola persistida usando PersistenceService
     *
     */

    private async loadPersistedQueue(): Promise<void> {
        try {
            this.currentLogger.debug(TAG, 'Loading persisted download queue');
            
            // Cargar usando PersistenceService
            const persistedDownloads = await persistenceService.loadDownloadState();
            this.downloadQueue = persistedDownloads;

            // Resetear descargas que estaban en progreso
            for (const [id, item] of this.downloadQueue) {
                if (item.offlineData.state === DownloadStates.DOWNLOADING) {
                    item.offlineData.state = DownloadStates.QUEUED;
                    this.downloadQueue.set(id, item);
                }
            }
            
            if (this.downloadQueue.size > 0) {
                await persistenceService.saveDownloadState(this.downloadQueue);
            }
            
        } catch (error) {
            this.currentLogger.error(TAG, `Failed to load persisted queue: ${error}`);
        }
    }

    /*
     * Genera un ID único para descarga
     *
     */

    private generateDownloadId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `download_${timestamp}_${random}`;
    }

    /*
     * Limpia recursos al destruir
     *
     */

    public destroy(): void {
        this.stopProcessing();
        this.eventEmitter.removeAllListeners();
        this.downloadQueue.clear();
        this.currentlyDownloading.clear();
        this.isInitialized = false;
        this.currentLogger.info(TAG, 'QueueManager destroyed');
    }
}

// Exportar instancia singleton
export const queueManager = QueueManager.getInstance();