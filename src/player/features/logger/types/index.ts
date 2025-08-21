/*
 *  Niveles de log disponibles
 *
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4, // Desactiva todos los logs
    TEMP = 100, // Log temporal -> Se salta el filtro de nivel
}

export interface LoggerConfigBasic {
    enabled?: boolean;
    level?: LogLevel;
}

export interface LoggerConfig extends LoggerConfigBasic {
    prefix?: string;
    includeTimestamp?: boolean;
    includeInstanceId?: boolean;
    useColors?: boolean;
}

export interface ILogger {
    debug(component: string, message: string, ...args: any[]): void;
    info(component: string, message: string, ...args: any[]): void;
    warn(component: string, message: string, ...args: any[]): void;
    error(component: string, message: string, ...args: any[]): void;
    temp(component: string, message: string, ...args: any[]): void;
    log(
        level: LogLevel,
        component: string,
        message: string,
        ...args: any[]
    ): void;
    forComponent(componentName: string): ComponentLogger;
    updateConfig(config: Partial<LoggerConfig>): void;
    setEnabled(enabled: boolean): void;
    setLevel(level: LogLevel): void;
}

/*
 *  Logger específico para un componente
 *
 */

export interface ComponentLogger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    temp(message: string, ...args: any[]): void;
    log(level: LogLevel, message: string, ...args: any[]): void;
}
