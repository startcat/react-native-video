import { type PlayerAdapter, type PlayerErrorData, type PlayerLoadData, type PlayerProgressData, type TrackInfo } from '../types';

export interface CastAdapterProps {
    // Event callbacks
    onLoad?: (data: PlayerLoadData) => void;
    onProgress?: (data: PlayerProgressData) => void;
    onEnd?: () => void;
    onError?: (error: PlayerErrorData) => void;
    onReady?: () => void;
    onBuffer?: (isBuffering: boolean) => void;
    onAudioTrackChanged?: (track: TrackInfo | null) => void;
    onVideoTrackChanged?: (track: TrackInfo | null) => void;
    onTextTrackChanged?: (track: TrackInfo | null) => void;
    onBitrateChanged?: (bitrate: number) => void;
    onFullscreenChanged?: (isFullscreen: boolean) => void;
    onSpeedRateChanged?: (rate: number) => void;
}

export interface CastAdapterRef extends PlayerAdapter {}