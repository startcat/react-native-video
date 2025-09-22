import { LogLevel } from '../logger';
import { DEFAULT_CONFIG, DIRECTORIES, LOG_TAGS } from './constants';
import {
    BinaryDownloadServiceConfig,
    ConfigManagerConfig,
    DownloadServiceConfig,
    DownloadsManagerConfig,
    NativeManagerConfig,
    NetworkPolicy,
    NetworkServiceConfig,
    PersistenceConfig,
    ProfileManagerConfig,
    QueueManagerConfig,
    StorageServiceConfig,
    StreamDownloadServiceConfig
} from './types';

export const LOGGER_DEFAULTS = {
    enabled: true,
    level: LogLevel.DEBUG,
    prefix: LOG_TAGS.MAIN,
    useColors: true,
    includeLevelName: false,
    includeTimestamp: true,
    includeInstanceId: true,
};

export const DEFAULT_CONFIG_MANAGER: ConfigManagerConfig = {
    logEnabled: true,
    logLevel: LogLevel.DEBUG,
    autoSaveInterval: 2000, // 2 segundos
    validateOnUpdate: true,
};

export const DEFAULT_CONFIG_NATIVE: NativeManagerConfig = {
    logEnabled: true,
    logLevel: LogLevel.DEBUG,
    autoInitialize: true,
    eventBufferSize: 100,
};

export const DEFAULT_CONFIG_PROFILE: ProfileManagerConfig = {
    logEnabled: true,
    logLevel: LogLevel.DEBUG,
    enableProfileFiltering: true,
    activeProfileRequired: true,
};

export const DEFAULT_CONFIG_QUEUE: QueueManagerConfig = {
    logEnabled: true,
    logLevel: LogLevel.DEBUG,
    autoProcess: true,
    processIntervalMs: 2000,
    maxConcurrentDownloads: 3,
    maxRetries: 3,
};

export const DEFAULT_CONFIG_NETWORK: NetworkServiceConfig = {
    logEnabled: true,
    logLevel: LogLevel.DEBUG,
    disableAutoStart: false,
};

export const DEFAULT_CONFIG_NETWORK_POLICY: NetworkPolicy = {
    allowCellular: true,
    requiresWifi: false,
    pauseOnCellular: false,
    resumeOnWifi: true,
};

export const DEFAULT_CONFIG_PERSISTENCE: PersistenceConfig = {
    logEnabled: true,
    logLevel: LogLevel.DEBUG,
    storageKey: DEFAULT_CONFIG.STORAGE_KEY,
    encryptionEnabled: false,
    compressionEnabled: true,
    autoSave: true,
    autoSaveInterval: DEFAULT_CONFIG.AUTO_SAVE_INTERVAL_MS,
};

export const DEFAULT_CONFIG_STORAGE: StorageServiceConfig = {
    logEnabled: true,
    logLevel: LogLevel.DEBUG,
    downloadDirectory: DIRECTORIES.ROOT,
    tempDirectory: DIRECTORIES.TEMP,
    cleanupEnabled: true,
    cleanupIntervalHours: DEFAULT_CONFIG.CLEANUP_INTERVAL_HOURS,
};

export const DEFAULT_CONFIG_BINARY_DOWNLOAD: BinaryDownloadServiceConfig = {
    logEnabled: true,
    logLevel: LogLevel.DEBUG,
    maxConcurrentDownloads: 3,
    progressUpdateInterval: 1500, // 1.5 segundos
    timeoutMs: 30000, // 30 seconds
    maxRetries: 3,
    showNotifications: true,
    allowCellular: false, // Solo WiFi por defecto
    requiresWifi: true,
};

export const DEFAULT_CONFIG_STREAM_DOWNLOAD: StreamDownloadServiceConfig = {
    logEnabled: true,
    logLevel: LogLevel.DEBUG,
    maxConcurrentDownloads: 3,
    progressUpdateInterval: 1500, // 1.5 segundos
    timeoutMs: 30000, // 30 seconds
    maxRetries: 3,
    allowCellular: false,
    requiresWifi: true,
    enableNotifications: true,
    defaultQuality: 'auto',
};

export const DEFAULT_CONFIG_DOWNLOAD_SERVICE: DownloadServiceConfig = {
    logEnabled: true,
    logLevel: LogLevel.DEBUG,
    enableBinaryDownloads: true,
    enableStreamDownloads: true,
    eventBridgeEnabled: true,
    autoInitializeStrategies: true,
};

export const DEFAULT_CONFIG_DOWNLOADS_MANAGER: DownloadsManagerConfig = {
    logEnabled: true,
    logLevel: LogLevel.DEBUG,
    autoStart: true,
    persistenceEnabled: true,
    networkMonitoringEnabled: true,
    storageMonitoringEnabled: true,
    profileManagementEnabled: true,
    enableBinaryDownloads: true,
    enableStreamDownloads: true,
    maxConcurrentDownloads: 3,
    autoRetryEnabled: true,
    maxRetryAttempts: 3,
};