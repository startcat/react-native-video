import { CastContentType, CastManagerState } from './types/enums';

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
 *  Timeouts para operaciones Cast
 *
 */

export const CAST_TIMEOUTS = {
    LOAD_MEDIA: 10000,
    CONNECT: 5000,
    CONTROL_ACTION: 3000,
    STATE_CHANGE: 2000,
    RETRY_DELAY: 2000,
} as const;

/*
 *  Tolerancias para comparación de contenido
 *
 */

export const CONTENT_COMPARISON_TOLERANCE = {
    TIME_DIFFERENCE: 5, // segundos
    POSITION_DIFFERENCE: 0.1, // porcentaje
} as const;

/*
 *  Mapeo de estados de Cast nativo a estados del manager
 *
 */

export const CAST_STATE_MAPPING: Record<string, CastManagerState> = {
    'NOT_CONNECTED': CastManagerState.NOT_CONNECTED,
    'NO_DEVICES_AVAILABLE': CastManagerState.NOT_CONNECTED,
    'CONNECTING': CastManagerState.CONNECTING,
    'CONNECTED': CastManagerState.CONNECTED,
};

/*
 *  Mapeo de tipos de contenido
 *
 */

export const CONTENT_TYPE_MAPPING = {
    vod: CastContentType.VOD,
    live: CastContentType.LIVE,
    dvr: CastContentType.DVR,
    tudum: CastContentType.TUDUM,
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

export const LOG_PREFIX = '[Cast Manager]' as const;

/*
 *  Configuración de mensaje Cast por defecto
 *
 */

export const DEFAULT_MESSAGE_CONFIG = {
    enableYoubora: true,
    enableAds: true,
    defaultStartPosition: 0,
    debugMode: false,
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
 *  Configuración de reintentos
 *
 */

export const RETRY_CONFIG = {
    MAX_ATTEMPTS: 3,
    INITIAL_DELAY: 1000,
    EXPONENTIAL_BASE: 2,
    MAX_DELAY: 10000,
} as const;

/*
 *  Configuración de buffer
 *
 */

export const BUFFER_CONFIG = {
    MIN_BUFFER_TIME: 2,
    MAX_BUFFER_TIME: 10,
    BUFFER_TOLERANCE: 0.5,
} as const;

/*
 *  Configuración de posición y seek
 *
 */

export const POSITION_CONFIG = {
    SEEK_TOLERANCE: 1, // segundos
    LIVE_EDGE_TOLERANCE: 30, // segundos
    DVR_WINDOW_DEFAULT: 3600, // segundos
} as const;

/*
 *  Configuración de eventos
 *
 */

export const EVENT_CONFIG = {
    DEBOUNCE_TIME: 100, // ms
    THROTTLE_TIME: 500, // ms
    MAX_EVENT_QUEUE: 100,
} as const;

/*
 *  Configuración de metadata
 *
 */

export const METADATA_CONFIG = {
    MAX_TITLE_LENGTH: 200,
    MAX_DESCRIPTION_LENGTH: 500,
    DEFAULT_POSTER: '',
    IMAGE_TIMEOUT: 5000,
} as const;

/*
 *  Configuración de desarrollo
 *
 */

export const DEBUG_CONFIG = {
    VERBOSE_LOGGING: false,
    LOG_EVENTS: false,
    LOG_STATE_CHANGES: false,
    LOG_CONTENT_CHANGES: false,
    LOG_ERRORS: false,
} as const;