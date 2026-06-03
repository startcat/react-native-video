/* eslint-disable @typescript-eslint/ban-types */
import type { HostComponent, ViewProps } from "react-native";
import { NativeModules, requireNativeComponent } from "react-native";
import type {
	DirectEventHandler,
	Double,
	Float,
	Int32,
	WithDefault,
} from "react-native/Libraries/Types/CodegenTypes";

// -------- There are types for native component (future codegen) --------
// if you are looking for types for react component, see src/types/video.ts

type Headers = ReadonlyArray<
	Readonly<{
		key: string;
		value: string;
	}>
>;

type VideoMetadata = Readonly<{
	title?: string;
	subtitle?: string;
	description?: string;
	imageUri?: string;
}>;

// DANI - Añadimos el ID y el TITLE
export type VideoSrc = Readonly<{
	uri?: string;
	id?: string;
	title?: string;
	isNetwork?: boolean;
	isAsset?: boolean;
	shouldCache?: boolean;
	type?: string;
	mainVer?: Int32;
	patchVer?: Int32;
	requestHeaders?: Headers;
	startPosition?: Float;
	cropStart?: Float;
	cropEnd?: Float;
	metadata?: VideoMetadata;
}>;

type DRMType = WithDefault<string, "widevine">;

type DebugConfig = Readonly<{
	enable?: boolean;
	thread?: boolean;
}>;

type Drm = Readonly<{
	type?: DRMType;
	licenseServer?: string;
	headers?: Headers;
	contentId?: string; // ios
	certificateUrl?: string; // ios
	base64Certificate?: boolean; // ios default: false
	useExternalGetLicense?: boolean; // ios
}>;

type TextTracks = ReadonlyArray<
	Readonly<{
		title: string;
		language: string;
		type: string;
		uri: string;
	}>
>;

type SelectedTextTrackType = WithDefault<string, "system">;

type SelectedAudioTrackType = WithDefault<string, "system">;

type SelectedTextTrack = Readonly<{
	type?: SelectedTextTrackType;
	value?: string;
}>;

type SelectedAudioTrack = Readonly<{
	type?: SelectedAudioTrackType;
	value?: string;
}>;

type SelectedVideoTrackType = WithDefault<string, "auto">;

type SelectedVideoTrack = Readonly<{
	type?: SelectedVideoTrackType;
	value?: string;
}>;

export type Seek = Readonly<{
	time: Float;
	tolerance?: Float;
}>;

type BufferConfigLive = Readonly<{
	maxPlaybackSpeed?: Float;
	minPlaybackSpeed?: Float;
	maxOffsetMs?: Int32;
	minOffsetMs?: Int32;
	targetOffsetMs?: Int32;
}>;

type BufferingStrategyType = WithDefault<string, "Default">;

type BufferConfig = Readonly<{
	minBufferMs?: Float;
	maxBufferMs?: Float;
	bufferForPlaybackMs?: Float;
	bufferForPlaybackAfterRebufferMs?: Float;
	maxHeapAllocationPercent?: Float;
	backBufferDurationMs?: Float; // Android
	minBackBufferMemoryReservePercent?: Float;
	minBufferMemoryReservePercent?: Float;
	cacheSizeMB?: Float;
	live?: BufferConfigLive;
}>;

type SubtitleStyle = Readonly<{
	fontSize?: Float;
	paddingTop?: WithDefault<Float, 0>;
	paddingBottom?: WithDefault<Float, 0>;
	paddingLeft?: WithDefault<Float, 0>;
	paddingRight?: WithDefault<Float, 0>;
	opacity?: WithDefault<Float, 1>;
	backgroundColor?: string;
	verticalAlignment?: string;
}>;

type OnLoadData = Readonly<{
	currentTime: Float;
	duration: Float;
	naturalSize: Readonly<{
		width: Float;
		height: Float;
		orientation: WithDefault<string, "landscape">;
	}>;
	audioTracks: {
		index: Int32;
		title?: string;
		language?: string;
		bitrate?: Float;
		type?: string;
		selected?: boolean;
	}[];
	textTracks: {
		index: Int32;
		title?: string;
		language?: string;
		/**
		 * iOS only supports VTT, Android supports all 3
		 */
		type?: WithDefault<string, "srt">;
		selected?: boolean;
	}[];
}>;

export type OnLoadStartData = Readonly<{
	isNetwork: boolean;
	type: string;
	uri: string;
}>;

export type OnVideoAspectRatioData = Readonly<{
	width: Float;
	height: Float;
}>;

export type OnBufferData = Readonly<{ isBuffering: boolean }>;

export type OnProgressData = Readonly<{
	currentTime: Float;
	playableDuration: Float;
	seekableDuration: Float;
}>;

export type OnBandwidthUpdateData = Readonly<{
	bitrate: Int32;
	width?: Float;
	height?: Float;
	trackId?: Int32;
}>;

/**
 * QoE playback telemetry forwarded per-tick to JS (PLAYER-195).
 * Byte counts are typed as `Double` (not `Int32`) to avoid 32-bit overflow on
 * long sessions / high bitrates. `trackId` is intentionally omitted: Android
 * exposes `Format.id` as a String while AVFoundation has no stable HLS
 * rendition id, so there is no codegen-safe shared type — width/height carry
 * the selected rendition instead.
 * Cadence differs by platform: Android emits per BandwidthMeter sample
 * (sub-second under load), iOS emits per AVPlayerItemAccessLog entry (~1/s).
 * Consumers (e.g. NPAW) should tolerate / decimate as needed.
 */
export type OnPlaybackMetricsData = Readonly<{
	throughput?: Double; // observed/estimated bandwidth (bps); omitted/-1 if unknown
	bitrate?: Double; // indicated/selected rendition bitrate (bps)
	framesPerSecond?: Double; // 0 if unknown
	droppedFrames?: Int32; // session-cumulative dropped video frames
	totalBytesTransferred?: Double; // session-cumulative network bytes; -1 if unknown
	width?: Float; // selected video rendition width
	height?: Float; // selected video rendition height
}>;

export type OnSeekData = Readonly<{
	currentTime: Float;
	seekTime: Float;
}>;

export type OnPlaybackStateChangedData = Readonly<{
	isPlaying: boolean;
}>;

export type OnTimedMetadataData = Readonly<{
	metadata: {
		value?: string;
		identifier: string;
	}[];
}>;

export type OnAudioTracksData = Readonly<{
	audioTracks: {
		index: Int32;
		title?: string;
		language?: string;
		bitrate?: Float;
		type?: string;
		selected?: boolean;
	}[];
}>;

type OnTextTracksData = Readonly<{
	textTracks: {
		index: Int32;
		title?: string;
		language?: string;
		/**
		 * iOS only supports VTT, Android supports all 3
		 */
		type?: WithDefault<string, "srt">;
		selected?: boolean;
	}[];
}>;

export type OnTextTrackDataChangedData = Readonly<{
	subtitleTracks: string;
}>;

export type OnVideoTracksData = Readonly<{
	videoTracks: {
		index: Int32;
		tracksId?: string;
		codecs?: string;
		width?: Float;
		height?: Float;
		bitrate?: Float;
		selected?: boolean;
	}[];
}>;

export type OnPlaybackRateChangeData = Readonly<{
	playbackRate: Float;
}>;

export type OnVolumeChangeData = Readonly<{
	volume: Float;
}>;

export type OnExternalPlaybackChangeData = Readonly<{
	isExternalPlaybackActive: boolean;
}>;

export type OnGetLicenseData = Readonly<{
	licenseUrl: string;
	loadedLicenseUrl: string;
	contentId: string;
	spcBase64: string;
}>;

export type OnPictureInPictureStatusChangedData = Readonly<{
	isActive: boolean;
}>;

type OnReceiveAdEventData = Readonly<{
	data?: {};
	event: WithDefault<string, "AD_BREAK_ENDED">;
}>;

export type OnVideoErrorData = Readonly<{
	error: Readonly<{
		errorString?: string; // android
		errorException?: string; // android
		errorStackTrace?: string; // android
		errorCode?: string; // android
		error?: string; // ios
		code?: Int32; // ios
		localizedDescription?: string; // ios
		localizedFailureReason?: string; // ios
		localizedRecoverySuggestion?: string; // ios
		domain?: string; // ios
	}>;
	target?: Int32; // ios
}>;

export type OnAudioFocusChangedData = Readonly<{
	hasAudioFocus: boolean;
}>;

type ControlsStyles = Readonly<{
	hideSeekBar?: boolean;
	seekIncrementMS?: number;
}>;

export interface VideoNativeProps extends ViewProps {
	src?: VideoSrc;
	drm?: Drm;
	playOffline?: boolean;
	multiSession?: boolean;
	adTagUrl?: string;
	adLanguage?: string;
	allowsExternalPlayback?: boolean; // ios, true
	maxBitRate?: Float;
	resizeMode?: WithDefault<string, "none">;
	repeat?: boolean;
	automaticallyWaitsToMinimizeStalling?: boolean;
	textTracks?: TextTracks;
	selectedTextTrack?: SelectedTextTrack;
	selectedAudioTrack?: SelectedAudioTrack;
	selectedVideoTrack?: SelectedVideoTrack; // android
	paused?: boolean;
	muted?: boolean;
	controls?: boolean;
	filter?: WithDefault<string, "">;
	filterEnabled?: boolean;
	volume?: Float; // default 1.0
	playInBackground?: boolean;
	preventsDisplaySleepDuringVideoPlayback?: boolean;
	preferredForwardBufferDuration?: Float; //ios, 0
	playWhenInactive?: boolean; // ios, false
	pictureInPicture?: boolean; // ios, false
	ignoreSilentSwitch?: WithDefault<string, "inherit">; // ios, 'inherit'
	mixWithOthers?: WithDefault<string, "inherit">; // ios, 'inherit'
	rate?: Float;
	fullscreen?: boolean; // ios, false
	fullscreenAutorotate?: boolean;
	fullscreenOrientation?: WithDefault<string, "all">;
	progressUpdateInterval?: Float;
	restoreUserInterfaceForPIPStopCompletionHandler?: boolean;
	localSourceEncryptionKeyScheme?: string;
	debug?: DebugConfig;
	showNotificationControls?: WithDefault<boolean, false>; // Android, iOS
	bufferConfig?: BufferConfig; // Android
	contentStartTime?: Int32; // Android
	currentPlaybackTime?: Double; // Android
	disableDisconnectError?: boolean; // Android
	focusable?: boolean; // Android
	hideShutterView?: boolean; //	Android
	minLoadRetryCount?: Int32; // Android
	reportBandwidth?: boolean; //Android
	subtitleStyle?: SubtitleStyle; // android
	useTextureView?: boolean; // Android
	useSecureView?: boolean; // Android
	bufferingStrategy?: BufferingStrategyType; // Android
	controlsStyles?: ControlsStyles; // Android
	onVideoLoad?: DirectEventHandler<OnLoadData>;
	onVideoLoadStart?: DirectEventHandler<OnLoadStartData>;
	onVideoAspectRatio?: DirectEventHandler<OnVideoAspectRatioData>;
	onVideoBuffer?: DirectEventHandler<OnBufferData>;
	onVideoError?: DirectEventHandler<OnVideoErrorData>;
	onVideoProgress?: DirectEventHandler<OnProgressData>;
	onVideoBandwidthUpdate?: DirectEventHandler<OnBandwidthUpdateData>;
	onVideoPlaybackMetrics?: DirectEventHandler<OnPlaybackMetricsData>;
	onVideoSeek?: DirectEventHandler<OnSeekData>;
	onVideoEnd?: DirectEventHandler<{}>; // all
	onVideoAudioBecomingNoisy?: DirectEventHandler<{}>;
	onVideoFullscreenPlayerWillPresent?: DirectEventHandler<{}>; // ios, android
	onVideoFullscreenPlayerDidPresent?: DirectEventHandler<{}>; // ios, android
	onVideoFullscreenPlayerWillDismiss?: DirectEventHandler<{}>; // ios, android
	onVideoFullscreenPlayerDidDismiss?: DirectEventHandler<{}>; // ios, android
	onReadyForDisplay?: DirectEventHandler<{}>;
	onPlaybackRateChange?: DirectEventHandler<OnPlaybackRateChangeData>; // all
	onVolumeChange?: DirectEventHandler<OnVolumeChangeData>; // android, ios
	onVideoExternalPlaybackChange?: DirectEventHandler<OnExternalPlaybackChangeData>;
	onGetLicense?: DirectEventHandler<OnGetLicenseData>;
	onPictureInPictureStatusChanged?: DirectEventHandler<OnPictureInPictureStatusChangedData>;
	onRestoreUserInterfaceForPictureInPictureStop?: DirectEventHandler<{}>;
	onReceiveAdEvent?: DirectEventHandler<OnReceiveAdEventData>;
	onVideoPlaybackStateChanged?: DirectEventHandler<OnPlaybackStateChangedData>; // android only
	onVideoIdle?: DirectEventHandler<{}>; // android only (nowhere in document, so do not use as props. just type declaration)
	onAudioFocusChanged?: DirectEventHandler<OnAudioFocusChangedData>; // android only (nowhere in document, so do not use as props. just type declaration)
	onTimedMetadata?: DirectEventHandler<OnTimedMetadataData>; // ios, android
	onAudioTracks?: DirectEventHandler<OnAudioTracksData>; // android
	onTextTracks?: DirectEventHandler<OnTextTracksData>; // android
	onTextTrackDataChanged?: DirectEventHandler<OnTextTrackDataChangedData>; // iOS
	onVideoTracks?: DirectEventHandler<OnVideoTracksData>; // android
}

export type VideoComponentType = HostComponent<VideoNativeProps>;

export type VideoSaveData = {
	uri: string;
};

export interface VideoManagerType {
	save: (option: object, reactTag: number) => Promise<VideoSaveData>;
	seek: (option: Seek, reactTag: number) => Promise<void>;
	setPlayerPauseState: (paused: boolean, reactTag: number) => Promise<void>;
	setLicenseResult: (result: string, licenseUrl: string, reactTag: number) => Promise<void>;
	setLicenseResultError: (error: string, licenseUrl: string, reactTag: number) => Promise<void>;
	setVolume: (volume: number, reactTag: number) => Promise<void>;
	getCurrentPosition: (reactTag: number) => Promise<number>;
}

export interface VideoDecoderPropertiesType {
	getWidevineLevel: () => Promise<number>;
	isCodecSupported: (
		mimeType: string,
		width: number,
		height: number
	) => Promise<"unsupported" | "hardware" | "software">;
	isHEVCSupported: () => Promise<"unsupported" | "hardware" | "software">;
}

export const VideoManager = NativeModules.VideoManager as VideoManagerType;
export const VideoDecoderProperties =
	NativeModules.VideoDecoderProperties as VideoDecoderPropertiesType;

export default requireNativeComponent<VideoNativeProps>("RCTVideo") as VideoComponentType;
