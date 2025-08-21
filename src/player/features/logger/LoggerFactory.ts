/*
 *  Factory para crear loggers
 *
 */

import { Logger } from './Logger';
import { LogLevel } from './types';

export class LoggerFactory {

    /*
     * Crea un logger básico para desarrollo
     *
     */

    static createDevelopmentLogger(instanceId?: number): Logger {
        return new Logger({
            enabled: true,
            level: LogLevel.DEBUG,
            useColors: true,
            includeTimestamp: true,
            includeInstanceId: true,
        }, instanceId);
    }

    /*
     * Crea un logger básico para producción
     *
     */

    static createProductionLogger(instanceId?: number): Logger {
        return new Logger({
            enabled: false, // Deshabilitado por defecto en producción
            level: LogLevel.ERROR,
            useColors: false,
            includeTimestamp: false,
            includeInstanceId: true,
        }, instanceId);
    }

    /*
     * Crea un logger para la configuración del Player
     *
     */

    static createFromConfig(debugEnabled: boolean, instanceId?: number): Logger {
        return debugEnabled
            ? LoggerFactory.createDevelopmentLogger(instanceId)
            : LoggerFactory.createProductionLogger(instanceId);
    }

    /*
     * Crea un logger para cada configuración del Player
     *
     */

    static createFeatureLogger(prefix: string, instanceId?: number): Logger {
        return new Logger({
            enabled: true,
            prefix,
            level: LogLevel.ERROR,
            useColors: true,
            includeTimestamp: true,
            includeInstanceId: true,
        }, instanceId);
    }

}
