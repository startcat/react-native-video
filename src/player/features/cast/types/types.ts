import {
    CastSession,
    CastState,
    MediaStatus,
    RemoteMediaClient
} from 'react-native-google-cast';

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