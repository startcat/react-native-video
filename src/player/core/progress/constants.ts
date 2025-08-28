import { LogLevel } from "../../types";

// Constantes
export const LOG_KEY = '[ProgressManager]';
export const LOG_ENABLED = true;
export const LOG_LEVEL = 'debug';
export const LOG_TYPE_LEVELS = {
    debug: 1,
    info: 2,
    warn: 3,
    error: 4
};
export const PROGRESS_SIGNIFICANT_CHANGE = 5; // segundos
export const EPG_RETRY_DELAYS = [2000, 5000]; // ms para reintentos
export const LIVE_EDGE_TOLERANCE = 15; // segundos para considerar "en vivo"

/*
 *  Prefijos para logs
 *
 */

export const LOGGER_CONFIG = {
    prefix: 'Progress Manager',
    enabled: true,
    level: LogLevel.INFO,
};