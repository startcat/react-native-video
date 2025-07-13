// Constantes
export const LOG_KEY = '[DVRProgressManager]';
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
export const LIVE_EDGE_TOLERANCE = 30; // segundos para considerar "en vivo"