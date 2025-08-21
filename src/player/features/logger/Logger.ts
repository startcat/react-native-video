/*
 *  Logger - Sistema de logging centralizado
 *  Proporciona logging consistente y configurable para todos los componentes
 *
 */

declare const __DEV__: boolean;

import {
    type ComponentLogger,
    type ILogger,
    type LoggerConfig,
    LogLevel
} from './types';

import { DefaultComponentLogger } from './DefaultComponentLogger';

export class Logger implements ILogger {

    private config: Required<LoggerConfig>;
    private instanceId?: number;

    // Colores para consola (solo en desarrollo)
    private static readonly COLORS = {
        DEBUG: '\x1b[36m', // Cyan
        INFO: '\x1b[32m', // Green
        WARN: '\x1b[33m', // Yellow
        ERROR: '\x1b[31m', // Red
        RESET: '\x1b[0m', // Reset
        TEMP: '\x1b[35m', // Magenta
    };

    private static readonly LEVEL_NAMES = {
        [LogLevel.DEBUG]: 'DEBUG',
        [LogLevel.INFO]: 'INFO',
        [LogLevel.WARN]: 'WARN',
        [LogLevel.ERROR]: 'ERROR',
        [LogLevel.NONE]: 'NONE',
        [LogLevel.TEMP]: 'TEMP',
    };

    constructor(config: LoggerConfig = {}, instanceId?: number) {
        this.config = {
            enabled: __DEV__ ? !!config.enabled : false, // Solo funciona en desarrollo
            level: config.level ?? LogLevel.INFO,
            prefix: config.prefix ?? '[OTTPlayer]',
            includeTimestamp: config.includeTimestamp ?? true,
            includeInstanceId: config.includeInstanceId ?? true,
            useColors: config.useColors ?? true,
        };

        this.instanceId = instanceId;
    }

    debug(component: string, message: string, ...args: any[]): void {
        this.log(LogLevel.DEBUG, component, message, ...args);
    }

    info(component: string, message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, component, message, ...args);
    }

    warn(component: string, message: string, ...args: any[]): void {
        this.log(LogLevel.WARN, component, message, ...args);
    }

    error(component: string, message: string, ...args: any[]): void {
        this.log(LogLevel.ERROR, component, message, ...args);
    }

    temp(component: string, message: string, ...args: any[]): void {
        this.log(LogLevel.TEMP, component, message, ...args);
    }

    log(
        level: LogLevel,
        component: string,
        message: string,
        ...args: any[]
    ): void {
        // Verificar si el logging está habilitado
        if (!this.config.enabled || (level < this.config.level && level !== LogLevel.TEMP)) {
            return;
        }

        // Construir el mensaje
        const logMessage = this.buildLogMessage(level, component, message);
        const logMethod = this.getLogMethod(level);

        // Aplicar colores si está habilitado
        const finalMessage = this.config.useColors
            ? this.applyColors(level, logMessage)
            : logMessage;

        // Hacer el log
        if (args.length > 0) {
            logMethod(finalMessage, ...args);
        } else {
            logMethod(finalMessage);
        }
    }

    forComponent(componentName: string, enabled?: boolean, level?: LogLevel): ComponentLogger {
        return new DefaultComponentLogger(this, componentName, enabled, level);
    }

    updateConfig(config: Partial<LoggerConfig>): void {
        this.config = { ...this.config, ...config };
    }

    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
    }

    setLevel(level: LogLevel): void {
        this.config.level = level;
    }

    setInstanceId(instanceId: number): void {
        this.instanceId = instanceId;
    }

    private buildLogMessage(
        level: LogLevel,
        component: string,
        message: string
    ): string {
        const parts: string[] = [];

        // Prefijo principal
        parts.push(this.config.prefix);

        // Timestamp
        if (this.config.includeTimestamp) {
            parts.push(this.formatTimestamp());
        }

        // Instance ID
        if (this.config.includeInstanceId && this.instanceId !== undefined) {
            parts.push(`#${this.instanceId}`);
        }

        // Nivel de log
        parts.push(`[${Logger.LEVEL_NAMES[level]}]`);

        // Componente
        parts.push(`[${component}]`);

        // Mensaje
        parts.push(message);

        return parts.join(' ');
    }

    private formatTimestamp(): string {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const ms = now.getMilliseconds().toString().padStart(3, '0');
        return `${hours}:${minutes}:${seconds}.${ms}`;
    }

    private applyColors(level: LogLevel, message: string): string {
        const colorMap = {
            [LogLevel.DEBUG]: Logger.COLORS.DEBUG,
            [LogLevel.INFO]: Logger.COLORS.INFO,
            [LogLevel.WARN]: Logger.COLORS.WARN,
            [LogLevel.ERROR]: Logger.COLORS.ERROR,
            [LogLevel.TEMP]: Logger.COLORS.TEMP,
            [LogLevel.NONE]: '', // No color for NONE level
        };

        const color = colorMap[level];
        return color ? `${color}${message}${Logger.COLORS.RESET}` : message;
    }

    private getLogMethod(level: LogLevel): (...args: any[]) => void {
        switch (level) {
            case LogLevel.DEBUG:
            case LogLevel.INFO:
                return console.log;
            case LogLevel.WARN:
                return console.warn;
            case LogLevel.ERROR:
                return console.error;
            case LogLevel.TEMP:
                return console.log;
            default:
                return console.log;
        }
    }
}
