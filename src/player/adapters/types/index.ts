/*
 *  PlayerAdapter Interface
 *
 */

import type { PlayerError } from "../../core/errors";

export interface TrackInfo {
	id: number;
	name: string | null;
	language: string | null;
	type: "AUDIO" | "TEXT" | "VIDEO";
	bitrate?: number;
	width?: number;
	height?: number;
	frameRate?: number;
	codecs?: string;
}

export interface PlayerAdapter {
	// ========================
	// Estado básico del reproductor
	// ========================
	isConnected: boolean;
	isPlaying: boolean;
	isPaused: boolean;
	isMuted: boolean;
	currentTime: number;
	duration: number | null;
	isBuffering: boolean;
	volume: number;
	speedRate: number;

	// ========================
	// Estado de tracks
	// ========================
	currentAudioTrack: TrackInfo | null;
	currentVideoTrack: TrackInfo | null;
	currentTextTrack: TrackInfo | null;
	availableAudioTracks: TrackInfo[];
	availableVideoTracks: TrackInfo[];
	availableTextTracks: TrackInfo[];

	// ========================
	// Estado de calidad y configuración
	// ========================
	maxBitrate: number | null;
	currentBitrate: number | null;
	isFullscreen: boolean;
	resizeMode: "contain" | "cover" | "stretch" | "center";

	// ========================
	// Métodos de control básico
	// ========================
	loadContent(contentInfo: PlayerContentInfo): Promise<boolean>;
	play(): Promise<boolean>;
	pause(): Promise<boolean>;
	seek(position: number): Promise<boolean>;
	stop(): Promise<boolean>;
	mute(): Promise<boolean>;
	unmute(): Promise<boolean>;
	setVolume(level: number): Promise<boolean>;

	// ========================
	// Métodos de tracks
	// ========================
	setAudioTrack(trackId: number): Promise<boolean>;
	setVideoTrack(trackId: number): Promise<boolean>;
	setTextTrack(trackId: number): Promise<boolean>;
	disableTextTrack(): Promise<boolean>;

	// ========================
	// Métodos de reproducción avanzada
	// ========================
	setSpeedRate(rate: number): Promise<boolean>;
	setMaxBitrate(bitrate: number | null): Promise<boolean>;
	setResizeMode(mode: "contain" | "cover" | "stretch" | "center"): Promise<boolean>;
	toggleFullscreen(): Promise<boolean>;

	// ========================
	// Métodos de calidad y configuración
	// ========================
	enableAutoBitrate(): Promise<boolean>;
	disableAutoBitrate(): Promise<boolean>;
	setPreferredAudioLanguage(language: string): Promise<boolean>;
	setPreferredTextLanguage(language: string): Promise<boolean>;

	// ========================
	// Eventos (usando callbacks)
	// ========================
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

	// ========================
	// Métodos de ciclo de vida
	// ========================
	initialize(): void;
	destroy(): void;
	reset(): void;
}

// ========================================
// Tipos compartidos extendidos
// ========================================

export interface PlayerContentInfo {
	source: {
		uri: string;
		id?: string | number;
		title?: string;
		type?: string;
		headers?: any;
		metadata?: any;
	};
	manifest?: any;
	drm?: any;
	youbora?: any;
	metadata: {
		id: string;
		title?: string;
		subtitle?: string;
		description?: string;
		poster?: string;
		squaredPoster?: string;
		isLive?: boolean;
		isDVR?: boolean;
		startPosition?: number;
		preferredAudioLanguage?: string;
		preferredTextLanguage?: string;
		maxBitrate?: number;
		autoplay?: boolean;
	};
	config?: {
		enableAutoBitrate?: boolean;
		maxBitrate?: number;
		preferredVideoQuality?: "auto" | "low" | "medium" | "high" | "ultra";
		bufferConfig?: any;
		allowBackground?: boolean;
		allowPictureInPicture?: boolean;
	};
}

export interface PlayerLoadData {
	currentTime: number;
	duration: number;
	availableAudioTracks: TrackInfo[];
	availableVideoTracks: TrackInfo[];
	availableTextTracks: TrackInfo[];
}

export interface PlayerProgressData {
	currentTime: number;
	seekableDuration: number;
	bufferedDuration?: number;
	currentBitrate?: number;
}
