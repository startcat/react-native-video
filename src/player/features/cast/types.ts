import { CastState, MediaPlayerState } from 'react-native-google-cast';
import { IDrm, IMappedYoubora, IVideoSource } from '../../types';
import * as enums from './types/enums';


/*
 *  Exportamos los enums
 *
 */

export * from './types/enums';

/*
 *  Información del contenido actual en Cast
 *
 */

export interface CastContentInfo {
    contentId: string;
    contentUrl: string;
    title?: string;
    subtitle?: string;
    description?: string;
    poster?: string;
    isLive: boolean;
    isDVR: boolean;
    contentType: enums.CastContentType;
    startPosition: number;
    duration?: number;
    currentTime?: number;
    playbackState?: MediaPlayerState;
}

/*
 *  Metadata para contenido Cast
 *
 */
export interface CastContentMetadata {
    id?: number;
    title?: string;
    subtitle?: string;
    description?: string;
    poster?: string;
    squaredPoster?: string;
    liveStartDate?: number;
    adTagUrl?: string;
    hasNext?: boolean;
    isLive?: boolean;
    isDVR?: boolean;
    startPosition?: number;
}

/*
 * Configuración para preparar mensaje Cast
 *
 */
export interface CastMessageConfig {
    source: IVideoSource;
    manifest: any;
    drm?: IDrm;
    youbora?: IMappedYoubora;
    metadata: CastContentMetadata;
}

/*
 *  Estado completo del Cast Manager
 *
 */
export interface CastManagerStatus {
    state: enums.CastManagerState;
    isConnected: boolean;
    isLoading: boolean;
    isContentLoaded: boolean;
    currentContent?: CastContentInfo;
    error?: string;
    castState?: CastState;
    hasSession: boolean;
    hasClient: boolean;
}

/*
 *  Callbacks del Cast Manager
 *
 */
export interface CastManagerCallbacks {
    onStateChange?: (state: enums.CastManagerState, previousState: enums.CastManagerState) => void;
    onContentLoaded?: (content: CastContentInfo) => void;
    onContentLoadError?: (error: string, content?: CastContentInfo) => void;
    onPlaybackStarted?: () => void;
    onPlaybackEnded?: () => void;
    onPlaybackError?: (error: string) => void;
    onBufferingChange?: (isBuffering: boolean) => void;
    onTimeUpdate?: (currentTime: number, duration: number) => void;
}

/*
 *  Configuración del Cast Manager
 *
 */
export interface CastManagerConfig {
    callbacks?: CastManagerCallbacks;
    retryAttempts?: number;
    retryDelay?: number;
    loadTimeout?: number;
    debugMode?: boolean;
}

/*
 *  Operación pendiente
 *
 */
export interface PendingCastOperation {
    type: 'load' | 'play' | 'pause' | 'seek' | 'mute';
    config?: CastMessageConfig;
    value?: any;
    timestamp: number;
}

/*
 *  Resultado de comparación de contenido
 *
 */
export interface ContentComparisonResult {
    isSameContent: boolean;
    isSameUrl: boolean;
    isSameStartPosition: boolean;
    needsReload: boolean;
    reason?: string;
}

/*
 *  Información de progreso de Cast
 *
 */
export interface CastProgressInfo {
    currentTime: number;
    duration: number;
    isBuffering: boolean;
    isPaused: boolean;
    isMuted: boolean;
    playbackRate: number;
    position: number;
}

/*
 *  Parámetros para comandos de control
 *
 */
export interface CastControlParams {
    command: enums.CastControlCommand;
    value?: number | boolean;
    seekTime?: number;
    volumeLevel?: number;
    audioTrackIndex?: number;
    subtitleTrackIndex?: number;
}

/*
 *  Datos de evento del Cast Manager
 *
 */
export interface CastManagerEventData {
    event: enums.CastManagerEvent;
    data?: any;
    timestamp: number;
}

/*
 *  Configuración para construcción de mensajes
 *
 */
export interface MessageBuilderConfig {
    enableYoubora?: boolean;
    enableAds?: boolean;
    defaultStartPosition?: number;
    contentIdPrefix?: string;
    debugMode?: boolean;
}

/*
 *  Utilidades de Cast
 *
 */
export interface CastUtils {
    isValidUrl: (url: string) => boolean;
    generateContentId: (source: IVideoSource, metadata: CastContentMetadata) => string;
    formatDuration: (seconds: number) => string;
    formatTime: (seconds: number) => string;
    compareContent: (current: CastContentInfo, newContent: CastMessageConfig) => ContentComparisonResult;
    isLiveContent: (mediaInfo: any) => boolean;
    getContentTitle: (mediaInfo: any) => string;
    getContentSubtitle: (mediaInfo: any) => string;
    validateCastConfig: (config: CastMessageConfig) => boolean;
    createDefaultMetadata: (title: string) => any;
    handleCastError: (error: Error, operation: string) => void;
}

/*
 *  Información de volumen de Cast
 *
 */
export interface CastVolumeInfo {
    level: number;
    muted: boolean;
    stepInterval: number;
    controlType: string;
}

/*
 *  Hook Types - from hooks/useCastManager.ts
 *
 */
export interface UseCastManagerConfig extends CastManagerConfig {
    enableAutoUpdate?: boolean;
    autoUpdateInterval?: number;
}

export interface CastManagerHookResult {
    // Estado
    status: CastManagerStatus;
    currentContent?: CastContentInfo;
    progressInfo?: CastProgressInfo;
    
    // Acciones principales
    loadContent: (config: CastMessageConfig) => Promise<enums.CastOperationResult>;
    clearContent: () => void;
    
    // Controles de reproducción
    play: () => Promise<enums.CastOperationResult>;
    pause: () => Promise<enums.CastOperationResult>;
    seek: (time: number) => Promise<enums.CastOperationResult>;
    skipForward: (seconds: number) => Promise<enums.CastOperationResult>;
    skipBackward: (seconds: number) => Promise<enums.CastOperationResult>;
    stop: () => Promise<enums.CastOperationResult>;
    
    // Controles de audio
    mute: () => Promise<enums.CastOperationResult>;
    unmute: () => Promise<enums.CastOperationResult>;
    setVolume: (volume: number) => Promise<enums.CastOperationResult>;

    // Controles de pistas
    setAudioTrack: (trackIndex: number) => Promise<enums.CastOperationResult>;
    setSubtitleTrack: (trackIndex: number) => Promise<enums.CastOperationResult>;
    disableSubtitles: () => Promise<enums.CastOperationResult>;
    
    // Utilidades
    isSameContent: (config: CastMessageConfig) => boolean;
    isContentLoaded: () => boolean;
    isReady: () => boolean;
    
    // Manager instance (para casos avanzados)
    manager: any; // CastManager - avoiding circular dependency
}

/*
 *  Hook Types - from hooks/useCastState.ts
 *
 */

export interface CastStateInfo {
    // Estados nativos
    castState?: any; // CastState from react-native-google-cast
    castSession?: any;
    castClient?: any;
    castMediaStatus?: any;
    castStreamPosition?: number;
    
    // Estados derivados
    managerState: enums.CastManagerState;
    isConnected: boolean;
    isConnecting: boolean;
    isDisconnected: boolean;
    hasSession: boolean;
    hasClient: boolean;
    hasMediaStatus: boolean;
    
    // Información de conectividad
    connectivityInfo: {
        isConnected: boolean;
        isConnecting: boolean;
        isDisconnected: boolean;
        statusText: string;
    };
    
    // Timestamps para debugging
    lastStateChange: number;
    lastUpdate: number;
}

export interface UseCastStateConfig {
    enableStreamPosition?: boolean;
    streamPositionInterval?: number;
    debugMode?: boolean;
    onStateChange?: (state: CastStateInfo, previousState: CastStateInfo) => void;
    onConnectionChange?: (isConnected: boolean, previouslyConnected: boolean) => void;
}

/*
 *  Utility Type
 *
 */

export type EventListener = (...args: any[]) => void;

/*
 *  Global Cast Types
 *
 */

export interface CastMessageMetadata {
    title: string;
    subtitle: string;
    images: Array<{ url: string }>;
    isLive: boolean;
    licenseAcquisitionURL: string | null;
    progress: null;
}

export interface CastMediaInfo {
    contentId: string;
    contentType: string;
    streamType: enums.CastStreamType;
    metadata: CastMessageMetadata;
    customData?: Record<string, any>;
}

export interface CastMessage {
    mediaInfo: CastMediaInfo;
    customData: {
        streamStart: number;
        isLive: boolean;
        youbora?: any; // IMappedYoubora - avoiding circular dependency
        sourceDescription: {
            metadata: CastMessageMetadata;
        };
    };
    autoplay: boolean;
    startTime: number;
}