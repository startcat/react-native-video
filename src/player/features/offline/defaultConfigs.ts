import { LogLevel } from '../logger';
import {
    ConfigManagerConfig,
    NativeManagerConfig,
    ProfileManagerConfig,
    QueueManagerConfig
} from './types';

export const LOGGER_DEFAULTS = {
    enabled: true,
    level: LogLevel.INFO,
    useColors: true,
    includeLevelName: false,
    includeTimestamp: true,
    includeInstanceId: true,
};

export const DEFAULT_CONFIG_MANAGER: ConfigManagerConfig = {
    logEnabled: true,
    logLevel: LogLevel.INFO,
    autoSaveInterval: 2000, // 2 segundos
    validateOnUpdate: true,
};

export const DEFAULT_CONFIG_NATIVE: NativeManagerConfig = {
    logEnabled: true,
    logLevel: LogLevel.INFO,
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