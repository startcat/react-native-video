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

import { ANSI_COLORS } from './constants/colors';
import { CONSOLE_ICONS } from './constants/icons';
import { DefaultComponentLogger } from './DefaultComponentLogger';

type LoggerInternalConfig = Required<Omit<LoggerConfig, 'instanceId'>> & { instanceId?: number };

export class Logger implements ILogger {

    private config: LoggerInternalConfig;
    private instanceId?: number;

    // Colores para consola
    private static readonly COLORS = {
        DEBUG: ANSI_COLORS.CYAN,
        INFO: ANSI_COLORS.GREEN,
        WARN: ANSI_COLORS.YELLOW,
        ERROR: ANSI_COLORS.RED,
        TEMP: ANSI_COLORS.MAGENTA,
        RESET: ANSI_COLORS.RESET,
        PREFIX: ANSI_COLORS.BRIGHT_YELLOW,
        TIMESTAMP: ANSI_COLORS.BRIGHT_WHITE,
        INSTANCE_ID: ANSI_COLORS.YELLOW,
        LEVEL: ANSI_COLORS.CYAN,
        COMPONENT: ANSI_COLORS.BRIGHT_YELLOW,
    };

    private static readonly LEVEL_NAMES = {
        [LogLevel.DEBUG]: 'DEBUG',
        [LogLevel.INFO]: 'INFO',
        [LogLevel.WARN]: 'WARN',
        [LogLevel.ERROR]: 'ERROR',
        [LogLevel.NONE]: 'NONE',
        [LogLevel.TEMP]: 'TEMP',
    };

    private static readonly COLOR_MAP = {
        [LogLevel.DEBUG]: Logger.COLORS.DEBUG,
        [LogLevel.INFO]: Logger.COLORS.INFO,
        [LogLevel.WARN]: Logger.COLORS.WARN,
        [LogLevel.ERROR]: Logger.COLORS.ERROR,
        [LogLevel.TEMP]: Logger.COLORS.TEMP,
        [LogLevel.NONE]: '', // No color for NONE level
    };

    constructor(config: LoggerConfig = {}, instanceId?: number) {
        this.config = {
            enabled: __DEV__ ? !!config.enabled : false, // Solo funciona en desarrollo
            level: config.level ?? LogLevel.INFO,
            prefix: config.prefix ?? `${CONSOLE_ICONS.VIDEO} OTTPlayer`,
            includeLevelName: config.includeLevelName ?? true,
            includeTimestamp: config.includeTimestamp ?? true,
            includeInstanceId: config.includeInstanceId ?? true,
            useColors: config.useColors ?? true,
            useConsoleLogForAllLevels: config.useConsoleLogForAllLevels ?? false,
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

        // Hacer el log
        if (args.length > 0) {
            logMethod(logMessage, ...args);
        } else {
            logMethod(logMessage);
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

        // Nivel de log
        if (this.config.includeLevelName) {
            parts.push(this.applyPartColor('MESSAGE', level, `[${Logger.LEVEL_NAMES[level]}]`));
        }

        // Prefijo principal
        parts.push(this.applyPartColor('PREFIX', level, this.config.prefix));

        // Instance ID
        if (this.config.includeInstanceId && this.instanceId !== undefined) {
            parts.push(this.applyPartColor('INSTANCE_ID', level, `#${this.instanceId}`));
        }

        // Timestamp
        if (this.config.includeTimestamp) {
            parts.push(this.applyPartColor('TIMESTAMP', level, this.formatTimestamp()));
        }

        // Componente
        parts.push(this.applyPartColor('COMPONENT', level, `[${component}]`));

        // Mensaje
        parts.push(this.applyPartColor('MESSAGE', level, message));

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

    private applyPartColor(part: 'PREFIX' | 'TIMESTAMP' | 'INSTANCE_ID' | 'LEVEL' | 'COMPONENT' | 'MESSAGE', level: LogLevel, message: string): string {

        let color: string | undefined;

        if (part === 'MESSAGE') {
            color = Logger.COLOR_MAP[level];
        } else {
            color = Logger.COLORS[part];
        }
        
        if (!this.config.useColors || !color) {
            return message;
        }
        
        return `${color}${message}${Logger.COLORS.RESET}`;
    }

    private getLogMethod(level: LogLevel): (...args: any[]) => void {
        if (this.config.useConsoleLogForAllLevels) {
            return console.log;
        }
        
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
