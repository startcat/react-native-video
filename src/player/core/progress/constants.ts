import { LogLevel } from "../../types";

// Constantes
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