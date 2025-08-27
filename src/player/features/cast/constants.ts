import { LogLevel } from "../../features/logger";

/*
 *  Configuración por defecto del Cast Manager
 *
 */

export const DEFAULT_CAST_CONFIG = {
    retryAttempts: 3,
    retryDelay: 2000,
    loadTimeout: 10000,
    debugMode: true,
    streamPositionInterval: 1,
    initializationDelay: 200
} as const;

/*
 *  Mensajes de error estándar
 *
 */

export const CAST_ERROR_MESSAGES = {
    NO_CONNECTION: 'No hay conexión Cast disponible',
    LOAD_FAILED: 'Error al cargar el contenido en Cast',
    INVALID_SOURCE: 'Fuente de contenido no válida',
    TIMEOUT: 'Tiempo de espera agotado',
    DEVICE_NOT_READY: 'Dispositivo Cast no está listo',
    UNSUPPORTED_CONTENT: 'Tipo de contenido no soportado',
    NETWORK_ERROR: 'Error de red',
    UNKNOWN_ERROR: 'Error desconocido',
} as const;

/*
 *  Eventos de logging
 *
 */

export const CAST_LOG_EVENTS = {
    STATE_CHANGE: 'Cast state changed',
    CONTENT_LOAD_START: 'Content load started',
    CONTENT_LOAD_SUCCESS: 'Content loaded successfully',
    CONTENT_LOAD_ERROR: 'Content load failed',
    PLAYBACK_START: 'Playback started',
    PLAYBACK_END: 'Playback ended',
    CONTROL_ACTION: 'Control action executed',
    CONNECTION_CHANGE: 'Connection changed',
    ERROR: 'Cast error occurred',
} as const;

/*
 *  Prefijos para logs
 *
 */

export const LOGGER_CONFIG = {
    prefix: '📡 Cast Feature',
    enabled: true,
    level: LogLevel.DEBUG,
};

/*
 *  Configuración de mensaje Cast por defecto
 *
 */

export const DEFAULT_MESSAGE_CONFIG = {
    enableYoubora: true,
    enableAds: true,
    defaultStartPosition: 0,
    debugMode: true,
} as const;

/*
 *  Tipos MIME soportados
 *
 */

export const SUPPORTED_MIME_TYPES = {
    HLS: 'application/x-mpegurl',
    DASH: 'application/dash+xml',
    MP3: 'audio/mp3',
    MP4: 'video/mp4',
    WEBM: 'video/webm',
} as const;

/*
 *  Configuración de metadata
 *
 */

export const METADATA_CONFIG = {
    MAX_TITLE_LENGTH: 200,
    MAX_DESCRIPTION_LENGTH: 500,
    DEFAULT_POSTER: '',
} as const;
