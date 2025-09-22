import { DownloadTask } from '@kesha-antonov/react-native-background-downloader';
import { PlayerError } from "../../../types";
import { LogLevel } from '../../logger';
import { Drm } from './drm';

export enum DownloadStates {
    RESTART = 'RESTART',
    RESTARTING = 'RESTARTING',
    FAILED = 'FAILED',
    REMOVING = 'REMOVING',
    STOPPED = 'STOPPED',
    DOWNLOADING = 'DOWNLOADING',
    NOT_DOWNLOADED = 'NOT_DOWNLOADED',
    COMPLETED = 'COMPLETED',
    QUEUED = 'QUEUED',
    PAUSED = 'PAUSED',
    WAITING_FOR_NETWORK = 'WAITING_FOR_NETWORK',
    PREPARING = 'PREPARING'
}

export enum DownloadEventType {
    STARTED = 'download:started',
    PROGRESS = 'download:progress',
    COMPLETED = 'download:completed',
    FAILED = 'download:failed',
    PAUSED = 'download:paused',
    RESUMED = 'download:resumed',
    CANCELLED = 'download:cancelled',
    QUEUED = 'download:queued',
    REMOVED = 'download:removed',
    
    // Eventos de gestión de cola
    QUEUE_CLEARED = 'queue:cleared',
    QUEUE_REORDERED = 'queue:reordered',
}

export enum DownloadErrorCode {
    NETWORK_ERROR = 'NETWORK_ERROR',
    INSUFFICIENT_SPACE = 'INSUFFICIENT_SPACE',
    FILE_SYSTEM_ERROR = 'FILE_SYSTEM_ERROR',
    DRM_ERROR = 'DRM_ERROR',
    INVALID_URL = 'INVALID_URL',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    CANCELLED = 'CANCELLED',
    TIMEOUT = 'TIMEOUT',
    UNKNOWN = 'UNKNOWN',
}

export enum DownloadType {
    BINARY = 'BINARY',
    STREAM = 'STREAM',
}

export interface BinaryDownloadServiceConfig {
    logEnabled: boolean;
    logLevel: LogLevel;
    maxConcurrentDownloads: number;
    progressUpdateInterval: number;
    timeoutMs: number;
    maxRetries: number;
    showNotifications: boolean;
    allowCellular: boolean;
    requiresWifi: boolean;
}

export interface StreamDownloadServiceConfig {
    logEnabled: boolean;
    logLevel: LogLevel;
    maxConcurrentDownloads: number;
    progressUpdateInterval: number;
    timeoutMs: number;
    maxRetries: number;
    allowCellular: boolean;
    requiresWifi: boolean;
    enableNotifications: boolean;
    defaultQuality: 'auto' | 'low' | 'medium' | 'high' | 'max';
}

export interface StreamDownloadConfig {
    type: 'DASH' | 'HLS';
    quality?: 'auto' | 'low' | 'medium' | 'high' | 'max';
    audioLanguages?: string[];
    subtitleLanguages?: string[];
    drm?: Drm;
}

export interface ActiveBinaryDownload {
    task: BinaryDownloadTask;
    downloadTask?: DownloadTask;
    startTime: number;
    retryCount: number;
    state: DownloadStates;
    progress: BinaryDownloadProgress;
    error?: DownloadError;
}

export interface DownloadError {
    code: DownloadErrorCode;
    message: string;
    details?: any;
    timestamp: number;
}

export interface StreamDownloadTask {
    id: string;
    manifestUrl: string;
    title: string;
    config: StreamDownloadConfig;
    estimatedSize?: number;
}

export interface ActiveStreamDownload {
    task: StreamDownloadTask;
    startTime: number;
    retryCount: number;
    state: DownloadStates;
    progress: StreamDownloadProgress;
    error?: DownloadError;
}

export interface StreamDownloadProgress {
    downloadId: string;
    percent: number;
    bytesDownloaded: number;
    totalBytes: number;
    segmentsCompleted?: number;
    segmentsTotal?: number;
    speed?: number;
    remainingTime?: number;
}

export interface BinaryDownloadTask {
    id: string;
    url: string;
    destination: string;
    headers?: Record<string, string>;
    progressInterval?: number;
    resumable?: boolean;
}

export interface BinaryDownloadProgress {
    taskId: string;
    bytesWritten: number;
    totalBytes: number;
    percent: number;
}

export interface ValidationResult {
    isValid: boolean;
    errors?: string[];
    warnings?: string[];
}

export enum SubtitleDownloadState {
    NOT_DOWNLOADED = 'NOT_DOWNLOADED',
    DOWNLOADING = 'DOWNLOADING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    VALIDATING = 'VALIDATING',
    CORRUPTED = 'CORRUPTED'
}

export enum SubtitleFormat {
    VTT = 'vtt',        // WebVTT (HLS)
    SRT = 'srt',        // SubRip
    TTML = 'ttml',      // TTML/DFXP (DASH)
    ASS = 'ass',        // Advanced SubStation Alpha
    SSA = 'ssa',        // SubStation Alpha
    SUB = 'sub'         // MicroDVD
}

export interface DownloadedSubtitleItem {
    // Identificación
    id: string; // Identificador único del subtítulo
    language: string; // Código de idioma (es, en, fr, etc.)
    label: string; // Nombre descriptivo ("Español", "English", "Français")
    
    // Estado
    state: SubtitleDownloadState;
    isDefault: boolean; // Si es el subtítulo por defecto
    
    // Archivo
    uri: string; // URI original del subtítulo
    localPath?: string; // Path local del archivo descargado
    format: SubtitleFormat; // Formato del subtítulo
    
    // Metadata
    encoding?: string; // Codificación del archivo (utf-8, etc.)
    fileSize?: number; // Tamaño del archivo en bytes
    
    // Timestamps
    downloadedAt?: number;
    lastValidated?: number;
    
    // Error handling
    error?: PlayerError;
    retryCount: number;
}

export interface DownloadItem {
    // Identificación
    id: string;
    type: DownloadType;
    title: string;
    uri: string;
  
    // Metadata
    media?: any; // Metadatos del video, que dependen de proyecto
    licenseExpirationDate?: number; // Fecha de expiración de licencia
  
    // Perfiles asociados
    profileIds: string[]; // Array de IDs de perfiles que tienen acceso
  
    // Configuración DRM
    drm?: Drm; // Configuración DRM completa
    drmScheme?: string; // Esquema DRM específico
  
    // Estado y archivos
    state: DownloadStates;
    fileUri?: string; // URI del archivo descargado (binarios)
  
    // Estadísticas consolidadas
    stats: {
        // Progreso
        progressPercent: number; // 0-100
        bytesDownloaded: number;
        totalBytes: number;
    
        // Performance
        downloadSpeed?: number; // bytes/second
        remainingTime?: number; // seconds
    
        // Red y calidad
        networkType?: 'wifi' | 'cellular';
        streamQuality?: 'auto' | 'low' | 'medium' | 'high' | 'max'; // Solo streams
    
        // Streams específico
        segmentsTotal?: number;
        segmentsCompleted?: number;
    
        // DRM
        drmLicenseStatus?: 'pending' | 'acquired' | 'expired' | 'none';
    
        // Timestamps
        startedAt?: number;
        downloadedAt?: number;
    
        // Errores y reintentos
        error?: PlayerError;
        retryCount: number;
    };
  
    // Subtítulos
    subtitles?: DownloadedSubtitleItem[];
}

export interface DownloadMetrics {
    totalDownloaded: number;
    totalFailed: number;
    totalCancelled: number;
    averageSpeed: number;
    averageDuration: number;
    successRate: number;
    dataUsage: {
        wifi: number;
        cellular: number;
        total: number;
    };
}

export interface DownloadProgressEvent {
    downloadId: string;
    percent: number;
    bytesDownloaded: number;
    totalBytes: number;
    speed?: number; // bytes per second
    remainingTime?: number; // seconds
}

export interface DownloadCompleteEvent {
    downloadId: string;
    fileUri: string;
    totalBytes: number;
    duration: number; // milliseconds
}

export interface DownloadFailedEvent {
    downloadId: string;
    error: DownloadError;
}

// Estrategias de descarga - Strategy Pattern
export interface DownloadStrategy {
    initialize(config?: any): Promise<void>;
    startDownload(task: any): Promise<void>;
    pauseDownload(downloadId: string): Promise<void>;
    resumeDownload(downloadId: string): Promise<void>;
    cancelDownload(downloadId: string): Promise<void>;
    getDownloadState(downloadId: string): any;
    getAllActiveDownloads(): any[];
    getStats(): any;
    subscribe(event: DownloadEventType | 'all', callback: (data: any) => void): () => void;
    destroy(): void;
}

// Factory para crear estrategias
export interface DownloadStrategyFactory {
    createStrategy(type: DownloadType): DownloadStrategy;
}

// Configuración del DownloadService principal
export interface DownloadServiceConfig {
    logEnabled: boolean;
    logLevel: LogLevel;
    enableBinaryDownloads: boolean;
    enableStreamDownloads: boolean;
    eventBridgeEnabled: boolean;
    autoInitializeStrategies: boolean;
}

// Configuración del DownloadsManager principal
export interface DownloadsManagerConfig {
    logEnabled: boolean;
    logLevel: LogLevel;
    autoStart: boolean;
    persistenceEnabled: boolean;
    networkMonitoringEnabled: boolean;
    storageMonitoringEnabled: boolean;
    profileManagementEnabled: boolean;
    enableBinaryDownloads: boolean;
    enableStreamDownloads: boolean;
    maxConcurrentDownloads: number;
    autoRetryEnabled: boolean;
    maxRetryAttempts: number;
}

// Nota: QueueStats se define en types/queue.ts para evitar duplicación

// Estado del DownloadsManager
export interface DownloadsManagerState {
    isInitialized: boolean;
    isProcessing: boolean;
    isPaused: boolean;
    error: PlayerError | null;
    lastUpdated: number;
}
