import type { IBasicProgram, IDrm, IManifest, IVideoSource, SliderValues } from "../../types";

// Estados posibles del flujo de reproducción
export enum MediaFlowStateType {
    IDLE = "IDLE",
    PREPARING_TUDUM = "PREPARING_TUDUM",
    PLAYING_TUDUM = "PLAYING_TUDUM",
    TRANSITIONING = "TRANSITIONING",
    PREPARING_CONTENT = "PREPARING_CONTENT",
    PLAYING_CONTENT = "PLAYING_CONTENT",
    ERROR = "ERROR",
    ENDED = "ENDED",
}

// Razones para cambios de estado
export enum StateChangeReason {
    USER_ACTION = "user_action",
    MEDIA_END = "media_end",
    ERROR = "error",
    AUTO_NEXT = "auto_next",
    SKIP_TUDUM = "skip_tudum",
    INITIALIZATION = "initialization",
}

// Tipo de media actual
export enum MediaType {
    TUDUM = "tudum",
    CONTENT = "content",
}

// Estado del flujo
export interface MediaFlowState {
    type: MediaFlowStateType;
    mediaType: MediaType | null;
    source: IVideoSource | null;
    drm?: IDrm;
    metadata: {
        isAutoNext: boolean;
        hasPlayedTudum: boolean;
        startPosition?: number;
        error?: Error;
    };
    timestamp: number;
}

// Configuración inicial del flujo
export interface MediaFlowConfig {
    // Datos del contenido
    manifests: IManifest[];
    id?: number;
    title?: string;
    subtitle?: string;
    description?: string;
    poster?: string;
    squaredPoster?: string;

    // Configuración de reproducción
    showExternalTudum: boolean;
    isAutoNext: boolean;
    isLive?: boolean;
    startPosition?: number;
    headers?: Record<string, string>;

    // Features habilitadas
    features?: {
        tudum?: boolean;
        ads?: boolean;
        analytics?: boolean;
        cast?: boolean;
    };

    // Callbacks de hooks
    hooks?: {
        getSourceUri?: (manifest: IManifest, dvrWindowMinutes?: number) => string;
        getTudumSource?: () => IVideoSource | null | undefined;
        getYouboraOptions?: (data: any, format: string) => any;
        getEPGProgramAt?: (timestamp: number) => Promise<IBasicProgram | null>;
        getEPGNextProgram?: (program: IBasicProgram) => Promise<IBasicProgram | null>;
    };
}

// Eventos del sistema
export interface MediaFlowEvents {
    // Eventos de cambio de fuente
    "source:ready": {
        source: IVideoSource;
        drm?: IDrm;
        type: MediaType;
        isReady: boolean;
    };

    "source:error": {
        error: Error;
        type: MediaType;
        fallbackAvailable: boolean;
    };

    // Eventos de transición
    "transition:start": {
        from: MediaFlowStateType;
        to: MediaFlowStateType;
        reason: StateChangeReason;
    };

    "transition:complete": {
        state: MediaFlowStateType;
        mediaType: MediaType | null;
    };

    // Eventos de progreso
    "progress:update": {
        type: MediaType;
        currentTime: number;
        duration: number;
        sliderValues?: SliderValues;
        isBuffering: boolean;
        isPaused: boolean;
    };

    // Eventos de estado
    "state:change": {
        previous: MediaFlowState;
        current: MediaFlowState;
        reason: StateChangeReason;
    };

    // Eventos de reproducción
    "playback:start": {
        type: MediaType;
        startPosition: number;
    };

    "playback:end": {
        type: MediaType;
        triggeredAutoNext: boolean;
        nextContentAvailable: boolean;
    };

    "playback:pause": {
        type: MediaType;
        currentTime: number;
    };

    "playback:resume": {
        type: MediaType;
        currentTime: number;
    };

    // Eventos de decisión
    "decision:skipTudum": {
        reason: string;
        conditions: {
            isAutoNext: boolean;
            hasStartPosition: boolean;
            tudumAvailable: boolean;
        };
    };

    "decision:playTudum": {
        duration?: number;
        source: IVideoSource;
    };

    // Eventos de buffer
    "buffer:start": {
        type: MediaType;
        currentTime: number;
    };

    "buffer:end": {
        type: MediaType;
        currentTime: number;
        bufferDuration: number;
    };

    // Eventos de inicialización
    "flow:initialized": {
        config: MediaFlowConfig;
        initialState: MediaFlowStateType;
    };

    "flow:disposed": {
        finalState: MediaFlowStateType;
        playbackTime: number;
    };
}

export interface ExtendedVideoSource extends IVideoSource {
    duration?: number;
}