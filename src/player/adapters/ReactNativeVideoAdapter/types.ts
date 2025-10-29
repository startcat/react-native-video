import { PlayerError } from "../../core/errors";
import {
	type PlayerAdapter,
	type PlayerContentInfo,
	type PlayerLoadData,
	type PlayerProgressData,
	type TrackInfo,
} from "../types";

export interface ReactNativeVideoAdapterProps {
	contentInfo?: PlayerContentInfo;
	paused?: boolean;
	muted?: boolean;
	volume?: number;
	rate?: number;
	maxBitrate?: number;
	resizeMode?: "contain" | "cover" | "stretch" | "center";
	playOffline?: boolean;
	multiSession?: boolean;
	allowsExternalPlayback?: boolean;
	playInBackground?: boolean;
	playWhenInactive?: boolean;
	allowsPictureInPicture?: boolean;

	// Event callbacks
	onLoad?: (data: PlayerLoadData) => void;
	onProgress?: (data: PlayerProgressData) => void;
	onEnd?: () => void;
	onError?: (error: PlayerError) => void;
	onReady?: () => void;
	onBuffer?: (isBuffering: boolean) => void;
	onAudioTrackChanged?: (track: TrackInfo | null) => void;
	onVideoTrackChanged?: (track: TrackInfo | null) => void;
	onTextTrackChanged?: (track: TrackInfo | null) => void;
	onBitrateChanged?: (bitrate: number) => void;
	onFullscreenChanged?: (isFullscreen: boolean) => void;
	onSpeedRateChanged?: (rate: number) => void;
}

export interface ReactNativeVideoAdapterRef extends PlayerAdapter {}
