import {
	CastSession,
	MediaStatus,
	CastState as NativeCastState,
	RemoteMediaClient,
	type MediaInfo,
	type MediaQueueData,
	type MediaTrack,
} from "react-native-google-cast";

import { PlayerError } from "../../../core/errors";
import { ComponentLogger, IDrm, IMappedYoubora, IVideoSource } from "../../../types";

export interface CastConnectionInfo {
	status: "connected" | "connecting" | "notConnected";
	deviceName: string | null;
	statusText: string;
}

export interface CastTrackInfo {
	id: number;
	name: string | null;
	language: string | null;
	type: "AUDIO" | "TEXT" | "VIDEO";
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
	progress: number; // Valor original sin clamp - puede ser cualquier valor para DVR
	seekableRange: { start: number; end: number } | null;
	playbackRate: number;
	audioTrack: CastTrackInfo | null;
	textTrack: CastTrackInfo | null;
	availableAudioTracks: CastTrackInfo[];
	availableTextTracks: CastTrackInfo[];
	mediaTracks: MediaTrack[];
	customData: any | null; // Custom data from Cast message (includes sourceDescription.metadata.id)
	activeTrackIds: number[]; // IDs of currently active tracks from Chromecast
}

export interface CastVolumeInfo {
	level: number; // 0-1
	isMuted: boolean;
}

export interface CastStateCustom {
	connection: CastConnectionInfo;
	media: CastMediaInfo;
	volume: CastVolumeInfo;
	error: PlayerError | null;
	lastUpdate: number;
}

// Tipos para el reducer
export interface InternalCastState {
	castState: CastStateCustom;
	lastValidPosition: number;
	updateSequence: number;
	logger?: ComponentLogger | null;
}

export type CastAction =
	| {
			type: "SYNC_UPDATE";
			payload: {
				nativeCastState?: NativeCastState;
				nativeSession?: CastSession;
				nativeClient?: RemoteMediaClient;
				nativeMediaStatus?: MediaStatus;
				nativeStreamPosition?: number | null;
			};
	  }
	| {
			type: "UPDATE_VOLUME";
			payload: {
				level: number;
				isMuted: boolean;
			};
	  }
	| {
			type: "SET_ERROR";
			payload: PlayerError;
	  }
	| {
			type: "CLEAR_ERROR";
	  }
	| {
			type: "UPDATE_LOGGER";
			payload: {
				logger: ComponentLogger;
			};
	  };

// Interfaces para el manager (compatibles con CastMessageBuilder)
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
		mediaType?: "video" | "audio"; // Tipo de contenido multimedia
	};

	// Custom data adicional para el receptor de Cast
	customDataForCast?: Record<string, unknown>;
}

export interface CastManagerCallbacks {
	onContentLoaded?: (contentInfo: CastContentInfo) => void;
	onError?: (error: PlayerError, contentInfo: CastContentInfo) => void;
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
	setActiveTrackIds: (trackIds: number[]) => Promise<boolean>;
	disableSubtitles: () => Promise<boolean>;
	updateMessageBuilderConfig: (newConfig: any) => void;
}

export interface CastManagerState {
	isLoading: boolean;
	lastError: PlayerError | null;
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
	mediaType?: "video" | "audio"; // Tipo de contenido multimedia
}

export interface CastMessageConfig {
	source: IVideoSource;
	manifest: any;
	drm?: IDrm;
	youbora?: IMappedYoubora;
	metadata: CastContentMetadata;
	customDataForCast?: Record<string, unknown>;
}

export interface CastMessage {
	mediaInfo?: MediaInfo;
	customData?: object;
	autoplay?: boolean | null;
	startTime?: number;
	credentials?: string;
	credentialsType?: string;
	playbackRate?: number;
	queueData?: MediaQueueData;
}

export interface CastErrorContext {
	action: string;
	content?: CastContentInfo;
	position?: number;
	volume?: number;
	trackId?: number;
}
