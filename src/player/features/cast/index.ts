// Imports para uso interno

// Exportar tipos principales
export * from './types/types';

// Exportar constantes
export * from './constants';

// Exportar clases principales
export { CastMessageBuilder } from './CastMessageBuilder';

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

/*
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
*/