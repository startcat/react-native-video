// Imports para uso interno
import { CastManager } from './CastManager';
import { CastMessageBuilder } from './CastMessageBuilder';
import type { CastManagerConfig } from './types';

// Exportar tipos principales
export * from './types';

// Exportar constantes
export * from './constants';

// Exportar clases principales
export { CastManager } from './CastManager';
export { CastMessageBuilder } from './CastMessageBuilder';

// Exportar EventEmitter para React Native
export { EventEmitter, SimpleEventEmitter } from './utils/SimpleEventEmitter';

// Exportar hooks
export {
    useCastConnectivity, useCastProgress, useCastReady, useCastState, useCastVolume
} from './hooks/useCastState';

export {
    useCastManager, useCastManagerProgress, useCastManagerStatus, useSimpleCastManager
} from './hooks/useCastManager';

// Exportar utilidades
export * from './utils/castUtils';

// Exportar configuración por defecto
export const defaultCastConfig = {
    retryAttempts: 3,
    retryDelay: 2000,
    loadTimeout: 10000,
    debugMode: false,
    streamPositionInterval: 1
};

// Función helper para crear configuración personalizada
export function createCastConfig(overrides: Partial<CastManagerConfig> = {}) {
    return {
        ...defaultCastConfig,
        ...overrides
    };
}

// Función helper para crear instancia de CastManager
export function createCastManager(config: Partial<CastManagerConfig> = {}) {
    return new CastManager(createCastConfig(config));
}

// Función helper para crear instancia de CastMessageBuilder
export function createCastMessageBuilder(config: Partial<CastManagerConfig> = {}) {
    return new CastMessageBuilder(config);
}