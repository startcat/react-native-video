import {
    CastSession,
    CastState,
    MediaStatus,
    RemoteMediaClient
} from 'react-native-google-cast';

import { IDrm, IMappedYoubora, IVideoSource } from '../../types';

export interface CastConnectionInfo {
    status: 'connected' | 'connecting' | 'disconnected';
    deviceName: string | null;
    statusText: string;
}

export interface CastTrackInfo {
    id: number;
    name: string | null;
    language: string | null;
    type: 'AUDIO' | 'TEXT' | 'VIDEO';
}

export interface CastMediaInfo {
    url: string | null;
    title: string | null;
    subtitle: string | null;
    imageUrl: string | null;
    isPlaying: boolean;
    isPaused: boolean;
    isBuffering: boolean;
    isIdle: boolean;
    currentTime: number;
    duration: number | null;
    progress: number; // ✅ Valor original sin clamp - puede ser cualquier valor para DVR
    playbackRate: number;
    audioTrack: CastTrackInfo | null;
    textTrack: CastTrackInfo | null;
    availableAudioTracks: CastTrackInfo[];
    availableTextTracks: CastTrackInfo[];
}

export interface CastVolumeInfo {
    level: number; // 0-1
    isMuted: boolean;
    canControl: boolean;
    stepInterval: number;
}

export interface CastErrorInfo {
    hasError: boolean;
    errorCode: string | null;
    errorMessage: string | null;
    lastErrorTime: number | null;
}

export interface CastState {
    connection: CastConnectionInfo;
    media: CastMediaInfo;
    volume: CastVolumeInfo;
    error: CastErrorInfo;
    lastUpdate: number;
}

// ✅ Tipos para el reducer
export interface InternalCastState {
    castState: CastState;
    lastValidPosition: number;
    updateSequence: number;
    volumeUpdatePromise: Promise<void> | null;
}

export type CastAction = 
    | {
        type: 'SYNC_UPDATE';
        payload: {
            nativeCastState?: CastState;
            nativeSession?: CastSession;
            nativeClient?: RemoteMediaClient;
            nativeMediaStatus?: MediaStatus;
            nativeStreamPosition?: number | null;
        };
    }
    | {
        type: 'UPDATE_VOLUME';
        payload: {
            level: number;
            isMuted: boolean;
            canControl: boolean;
        };
    }
    | {
        type: 'SET_ERROR';
        payload: {
            errorCode: string;
            errorMessage: string;
        };
    }
    | {
        type: 'CLEAR_ERROR';
    };

// ✅ Interfaces para el manager (compatibles con CastMessageBuilder)
export interface CastContentInfo {
    // Información de la fuente
    source: {
        uri: string;
    };
    manifest: any; // Manifest data requerido por CastMessageBuilder
    drm?: any; // DRM config opcional
    youbora?: any; // Youbora config opcional
    
    // Metadata del contenido
    metadata: {
        id: string;
        title?: string;
        subtitle?: string;
        description?: string;
        poster?: string;
        squaredPoster?: string;
        liveStartDate?: string;
        adTagUrl?: string;
        hasNext?: boolean;
        isLive?: boolean;
        isDVR?: boolean;
        startPosition?: number; // Posición inicial en segundos
    };
}

export interface CastManagerCallbacks {
    onContentLoaded?: (contentInfo: CastContentInfo) => void;
    onContentLoadError?: (error: string, contentInfo: CastContentInfo) => void;
    onPlaybackStarted?: () => void;
    onPlaybackEnded?: () => void;
    onSeekCompleted?: (newPosition: number) => void;
    onVolumeChanged?: (level: number, isMuted: boolean) => void;
}

export interface CastManagerActions {
    loadContent: (content: CastContentInfo) => Promise<boolean>;
    clearContent: () => Promise<boolean>;
    play: () => Promise<boolean>;
    pause: () => Promise<boolean>;
    seek: (position: number) => Promise<boolean>;
    skipForward: (seconds?: number) => Promise<boolean>;
    skipBackward: (seconds?: number) => Promise<boolean>;
    stop: () => Promise<boolean>;
    mute: () => Promise<boolean>;
    unmute: () => Promise<boolean>;
    setVolume: (level: number) => Promise<boolean>;
    setAudioTrack: (trackId: number) => Promise<boolean>;
    setSubtitleTrack: (trackId: number) => Promise<boolean>;
    disableSubtitles: () => Promise<boolean>;
    updateMessageBuilderConfig: (newConfig: any) => void;
}

export interface CastManagerState {
    isLoading: boolean;
    lastError: string | null;
    lastAction: string | null;
    canControl: boolean;
}

export interface CastManager extends CastManagerActions {
    state: CastManagerState;
}

export interface MessageBuilderConfig {
    enableYoubora?: boolean;
    enableAds?: boolean;
    defaultStartPosition?: number;
    debugMode?: boolean;
}

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

export interface CastMessageConfig {
    source: IVideoSource;
    manifest: any;
    drm?: IDrm;
    youbora?: IMappedYoubora;
    metadata: CastContentMetadata;
}