import React, {
	forwardRef,
	useCallback,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
	type ComponentRef,
} from "react";
import {
	Image,
	Platform,
	StyleSheet,
	View,
	type ImageStyle,
	type NativeSyntheticEvent,
	type StyleProp,
} from "react-native";

import NativeVideoComponent, {
	VideoManager,
	type OnAudioFocusChangedData,
	type OnAudioTracksData,
	type OnBandwidthUpdateData,
	type OnBufferData,
	type OnExternalPlaybackChangeData,
	type OnLoadStartData,
	type OnPictureInPictureStatusChangedData,
	type OnPlaybackMetricsData,
	type OnPlaybackStateChangedData,
	type OnProgressData,
	type OnSeekData,
	type OnTextTrackDataChangedData,
	type OnTimedMetadataData,
	type OnVideoAspectRatioData,
	type OnVideoErrorData,
	type OnVideoTracksData,
	type VideoComponentType,
	type VideoSrc,
} from "./specs/VideoNativeComponent";
import type { OnLoadData, OnReceiveAdEventData, OnTextTracksData, ReactVideoProps } from "./types";
import { generateHeaderForNative, getReactTag, resolveAssetSourceForVideo } from "./utils";

export type VideoSaveData = {
	uri: string;
};

export interface VideoRef {
	seek: (time: number, tolerance?: number) => void;
	resume: () => void;
	pause: () => void;
	presentFullscreenPlayer: () => void;
	dismissFullscreenPlayer: () => void;
	restoreUserInterfaceForPictureInPictureStopCompleted: (restore: boolean) => void;
	save: (options: object) => Promise<VideoSaveData>;
	setVolume: (volume: number) => void;
	getCurrentPosition: () => Promise<number>;
}

const Video = forwardRef<VideoRef, ReactVideoProps>(
	(
		{
			source,
			style,
			resizeMode,
			posterResizeMode,
			poster,
			fullscreen,
			drm,
			playOffline,
			multiSession,
			textTracks,
			selectedVideoTrack,
			selectedAudioTrack,
			selectedTextTrack,
			onLoadStart,
			onLoad,
			onError,
			onProgress,
			onSeek,
			onEnd,
			onBuffer,
			onBandwidthUpdate,
			onPlaybackMetrics,
			onExternalPlaybackChange,
			onFullscreenPlayerWillPresent,
			onFullscreenPlayerDidPresent,
			onFullscreenPlayerWillDismiss,
			onFullscreenPlayerDidDismiss,
			onReadyForDisplay,
			onPlaybackRateChange,
			onVolumeChange,
			onAudioBecomingNoisy,
			onPictureInPictureStatusChanged,
			onRestoreUserInterfaceForPictureInPictureStop,
			onReceiveAdEvent,
			onPlaybackStateChanged,
			onAudioFocusChanged,
			onIdle,
			onTimedMetadata,
			onAudioTracks,
			onTextTracks,
			onTextTrackDataChanged,
			onVideoTracks,
			onAspectRatio,
			...rest
		},
		ref
	) => {
		const nativeRef = useRef<ComponentRef<VideoComponentType>>(null);
		const [showPoster, setShowPoster] = useState(!!poster);
		const [isFullscreen, setIsFullscreen] = useState(fullscreen);
		const [
			_restoreUserInterfaceForPIPStopCompletionHandler,
			setRestoreUserInterfaceForPIPStopCompletionHandler,
		] = useState<boolean | undefined>();

		const hasPoster = !!poster;

		const posterStyle = useMemo<StyleProp<ImageStyle>>(
			() => ({
				...StyleSheet.absoluteFillObject,
				resizeMode:
					posterResizeMode && posterResizeMode !== "none" ? posterResizeMode : "contain",
			}),
			[posterResizeMode]
		);

		const src = useMemo<VideoSrc | undefined>(() => {
			if (!source) {
				return undefined;
			}
			const resolvedSource = resolveAssetSourceForVideo(source);
			let uri = resolvedSource.uri || "";
			if (uri && uri.match(/^\//)) {
				uri = `file://${uri}`;
			}
			if (!uri) {
				console.log("Trying to load empty source");
			}
			const isNetwork = !!(uri && uri.match(/^(rtp|rtsp|http|https):/));
			const isAsset = !!(
				uri && uri.match(/^(assets-library|ipod-library|file|content|ms-appx|ms-appdata):/)
			);

			// DANI - Añadimos el ID y el TITLE
			const id = resolvedSource?.id?.toString() || "";
			const title = resolvedSource?.title || "";

			return {
				uri,
				id,
				title,
				isNetwork,
				isAsset,
				shouldCache: resolvedSource.shouldCache || false,
				type: resolvedSource.type || "",
				mainVer: resolvedSource.mainVer || 0,
				patchVer: resolvedSource.patchVer || 0,
				requestHeaders: generateHeaderForNative(resolvedSource.headers),
				startPosition: resolvedSource.startPosition ?? -1,
				cropStart: resolvedSource.cropStart || 0,
				cropEnd: resolvedSource.cropEnd,
				metadata: resolvedSource.metadata,
			};
		}, [source]);

		const _drm = useMemo(() => {
			if (!drm) {
				return;
			}

			return {
				type: drm.type,
				licenseServer: drm.licenseServer,
				headers: generateHeaderForNative(drm.headers),
				contentId: drm.contentId,
				certificateUrl: drm.certificateUrl,
				base64Certificate: drm.base64Certificate,
			};
		}, [drm]);

		const _playOffline = useMemo(() => {
			if (!playOffline) {
				return false;
			}
			return !!playOffline;
		}, [playOffline]);

		const _multiSession = useMemo(() => {
			if (!multiSession) {
				return false;
			}
			return !!multiSession;
		}, [multiSession]);

		const _selectedTextTrack = useMemo(() => {
			if (!selectedTextTrack) {
				return;
			}
			const type = typeof selectedTextTrack.value;
			if (type !== "number" && type !== "string") {
				console.log("invalid type provided to selectedTextTrack");
				return;
			}
			return {
				type: selectedTextTrack?.type,
				value: `${selectedTextTrack.value}`,
			};
		}, [selectedTextTrack]);

		const _selectedAudioTrack = useMemo(() => {
			if (!selectedAudioTrack) {
				return;
			}
			const type = typeof selectedAudioTrack.value;
			if (type !== "number" && type !== "string") {
				console.log("invalid type provided to selectedAudioTrack");
				return;
			}

			return {
				type: selectedAudioTrack?.type,
				value: `${selectedAudioTrack.value}`,
			};
		}, [selectedAudioTrack]);

		const _selectedVideoTrack = useMemo(() => {
			if (!selectedVideoTrack) {
				return;
			}
			const type = typeof selectedVideoTrack.value;
			if (type !== "number" && type !== "string") {
				console.log("invalid type provided to selectedVideoTrack");
				return;
			}
			return {
				type: selectedVideoTrack?.type,
				value: `${selectedVideoTrack.value}`,
			};
		}, [selectedVideoTrack]);

		const seek = useCallback(async (time: number, tolerance?: number) => {
			if (isNaN(time) || time === null) {
				throw new Error("Specified time is not a number: '" + time + "'");
			}

			if (!nativeRef.current) {
				console.warn("Video Component is not mounted");
				return;
			}

			const callSeekFunction = () => {
				VideoManager.seek(
					{
						time,
						tolerance: tolerance || 0,
					},
					getReactTag(nativeRef)
				);
			};

			Platform.select({
				ios: callSeekFunction,
				android: callSeekFunction,
				default: () => {
					// TODO: Implement VideoManager.seek for windows
					nativeRef.current?.setNativeProps({ seek: time });
				},
			})();
		}, []);

		const presentFullscreenPlayer = useCallback(() => {
			setIsFullscreen(true);
		}, [setIsFullscreen]);

		const dismissFullscreenPlayer = useCallback(() => {
			setIsFullscreen(false);
		}, [setIsFullscreen]);

		const save = useCallback((options: object) => {
			// VideoManager.save can be null on android & windows
			return VideoManager.save?.(options, getReactTag(nativeRef));
		}, []);

		const pause = useCallback(() => {
			return VideoManager.setPlayerPauseState(true, getReactTag(nativeRef));
		}, []);

		const resume = useCallback(() => {
			return VideoManager.setPlayerPauseState(false, getReactTag(nativeRef));
		}, []);

		const restoreUserInterfaceForPictureInPictureStopCompleted = useCallback(
			(restored: boolean) => {
				setRestoreUserInterfaceForPIPStopCompletionHandler(restored);
			},
			[setRestoreUserInterfaceForPIPStopCompletionHandler]
		);

		const setVolume = useCallback((volume: number) => {
			return VideoManager.setVolume(volume, getReactTag(nativeRef));
		}, []);

		const getCurrentPosition = useCallback(() => {
			return VideoManager.getCurrentPosition(getReactTag(nativeRef));
		}, []);

		const onVideoLoadStart = useCallback(
			(e: NativeSyntheticEvent<OnLoadStartData>) => {
				hasPoster && setShowPoster(true);
				onLoadStart?.(e.nativeEvent);
			},
			[hasPoster, onLoadStart]
		);

		const onVideoLoad = useCallback(
			(e: NativeSyntheticEvent<OnLoadData>) => {
				// Ocultar el poster en cuanto el player nativo confirma `onLoad` del
				// contenido. Antes esto sólo se hacía en Windows: Android e iOS dependían
				// exclusivamente de `_onReadyForDisplay` (línea ~447) para apagarlo. Tras
				// un pre-roll de IMA, `onReadyForDisplay` no siempre vuelve a emitirse
				// cuando el item se restaura, dejando `showPoster=true` durante toda la
				// reproducción real → el usuario ve la imagen de fondo aunque el vídeo
				// esté reproduciéndose por debajo. `onLoad` sí llega en ese escenario,
				// así que lo usamos como señal universal para apagar el poster.
				hasPoster && setShowPoster(false);
				onLoad?.(e.nativeEvent);
			},
			[onLoad, hasPoster, setShowPoster]
		);

		const onVideoError = useCallback(
			(e: NativeSyntheticEvent<OnVideoErrorData>) => {
				onError?.(e.nativeEvent);
			},
			[onError]
		);

		const onVideoProgress = useCallback(
			(e: NativeSyntheticEvent<OnProgressData>) => {
				onProgress?.(e.nativeEvent);
			},
			[onProgress]
		);

		const onVideoSeek = useCallback(
			(e: NativeSyntheticEvent<OnSeekData>) => {
				onSeek?.(e.nativeEvent);
			},
			[onSeek]
		);

		const onVideoPlaybackStateChanged = useCallback(
			(e: NativeSyntheticEvent<OnPlaybackStateChangedData>) => {
				onPlaybackStateChanged?.(e.nativeEvent);
			},
			[onPlaybackStateChanged]
		);

		// android only
		const _onTimedMetadata = useCallback(
			(e: NativeSyntheticEvent<OnTimedMetadataData>) => {
				onTimedMetadata?.(e.nativeEvent);
			},
			[onTimedMetadata]
		);

		const _onAudioTracks = useCallback(
			(e: NativeSyntheticEvent<OnAudioTracksData>) => {
				onAudioTracks?.(e.nativeEvent);
			},
			[onAudioTracks]
		);

		const _onTextTracks = useCallback(
			(e: NativeSyntheticEvent<OnTextTracksData>) => {
				onTextTracks?.(e.nativeEvent);
			},
			[onTextTracks]
		);

		const _onTextTrackDataChanged = useCallback(
			(e: NativeSyntheticEvent<OnTextTrackDataChangedData & { target?: number }>) => {
				const { ...eventData } = e.nativeEvent;
				delete eventData.target;
				onTextTrackDataChanged?.(eventData as OnTextTrackDataChangedData);
			},
			[onTextTrackDataChanged]
		);

		const _onVideoTracks = useCallback(
			(e: NativeSyntheticEvent<OnVideoTracksData>) => {
				onVideoTracks?.(e.nativeEvent);
			},
			[onVideoTracks]
		);

		const _onPlaybackRateChange = useCallback(
			(e: NativeSyntheticEvent<Readonly<{ playbackRate: number }>>) => {
				onPlaybackRateChange?.(e.nativeEvent);
			},
			[onPlaybackRateChange]
		);

		const _onVolumeChange = useCallback(
			(e: NativeSyntheticEvent<Readonly<{ volume: number }>>) => {
				onVolumeChange?.(e.nativeEvent);
			},
			[onVolumeChange]
		);

		const _onReadyForDisplay = useCallback(() => {
			hasPoster && setShowPoster(false);
			onReadyForDisplay?.();
		}, [setShowPoster, hasPoster, onReadyForDisplay]);

		const _onPictureInPictureStatusChanged = useCallback(
			(e: NativeSyntheticEvent<OnPictureInPictureStatusChangedData>) => {
				onPictureInPictureStatusChanged?.(e.nativeEvent);
			},
			[onPictureInPictureStatusChanged]
		);

		const _onAudioFocusChanged = useCallback(
			(e: NativeSyntheticEvent<OnAudioFocusChangedData>) => {
				onAudioFocusChanged?.(e.nativeEvent);
			},
			[onAudioFocusChanged]
		);

		const onVideoBuffer = useCallback(
			(e: NativeSyntheticEvent<OnBufferData>) => {
				onBuffer?.(e.nativeEvent);
			},
			[onBuffer]
		);

		const onVideoExternalPlaybackChange = useCallback(
			(e: NativeSyntheticEvent<OnExternalPlaybackChangeData>) => {
				onExternalPlaybackChange?.(e.nativeEvent);
			},
			[onExternalPlaybackChange]
		);

		const _onBandwidthUpdate = useCallback(
			(e: NativeSyntheticEvent<OnBandwidthUpdateData>) => {
				onBandwidthUpdate?.(e.nativeEvent);
			},
			[onBandwidthUpdate]
		);

		const _onPlaybackMetrics = useCallback(
			(e: NativeSyntheticEvent<OnPlaybackMetricsData>) => {
				onPlaybackMetrics?.(e.nativeEvent);
			},
			[onPlaybackMetrics]
		);

		const _onReceiveAdEvent = useCallback(
			(e: NativeSyntheticEvent<OnReceiveAdEventData>) => {
				onReceiveAdEvent?.(e.nativeEvent);
			},
			[onReceiveAdEvent]
		);

		const _onVideoAspectRatio = useCallback(
			(e: NativeSyntheticEvent<OnVideoAspectRatioData>) => {
				onAspectRatio?.(e.nativeEvent);
			},
			[onAspectRatio]
		);

		useImperativeHandle(
			ref,
			() => ({
				seek,
				presentFullscreenPlayer,
				dismissFullscreenPlayer,
				save,
				pause,
				resume,
				restoreUserInterfaceForPictureInPictureStopCompleted,
				setVolume,
				getCurrentPosition,
			}),
			[
				seek,
				presentFullscreenPlayer,
				dismissFullscreenPlayer,
				save,
				pause,
				resume,
				restoreUserInterfaceForPictureInPictureStopCompleted,
				setVolume,
				getCurrentPosition,
			]
		);

		return (
			<View style={style}>
				<NativeVideoComponent
					ref={nativeRef}
					{...rest}
					src={src}
					drm={_drm}
					playOffline={_playOffline}
					multiSession={_multiSession}
					style={StyleSheet.absoluteFill}
					resizeMode={resizeMode}
					fullscreen={isFullscreen}
					restoreUserInterfaceForPIPStopCompletionHandler={
						_restoreUserInterfaceForPIPStopCompletionHandler
					}
					textTracks={textTracks}
					selectedTextTrack={_selectedTextTrack}
					selectedAudioTrack={_selectedAudioTrack}
					selectedVideoTrack={_selectedVideoTrack}
					onVideoLoad={
						onLoad || hasPoster
							? (onVideoLoad as (e: NativeSyntheticEvent<object>) => void)
							: undefined
					}
					onVideoLoadStart={onLoadStart || hasPoster ? onVideoLoadStart : undefined}
					onVideoError={onError ? onVideoError : undefined}
					onVideoProgress={onProgress ? onVideoProgress : undefined}
					onVideoSeek={onSeek ? onVideoSeek : undefined}
					onVideoEnd={onEnd}
					onVideoBuffer={onBuffer ? onVideoBuffer : undefined}
					onVideoPlaybackStateChanged={
						onPlaybackStateChanged ? onVideoPlaybackStateChanged : undefined
					}
					onVideoBandwidthUpdate={onBandwidthUpdate ? _onBandwidthUpdate : undefined}
					onVideoPlaybackMetrics={onPlaybackMetrics ? _onPlaybackMetrics : undefined}
					onTimedMetadata={onTimedMetadata ? _onTimedMetadata : undefined}
					onAudioTracks={onAudioTracks ? _onAudioTracks : undefined}
					onTextTracks={onTextTracks ? _onTextTracks : undefined}
					onTextTrackDataChanged={
						onTextTrackDataChanged ? _onTextTrackDataChanged : undefined
					}
					onVideoTracks={onVideoTracks ? _onVideoTracks : undefined}
					onVideoFullscreenPlayerDidDismiss={onFullscreenPlayerDidDismiss}
					onVideoFullscreenPlayerDidPresent={onFullscreenPlayerDidPresent}
					onVideoFullscreenPlayerWillDismiss={onFullscreenPlayerWillDismiss}
					onVideoFullscreenPlayerWillPresent={onFullscreenPlayerWillPresent}
					onVideoExternalPlaybackChange={
						onExternalPlaybackChange ? onVideoExternalPlaybackChange : undefined
					}
					onVideoIdle={onIdle}
					onAudioFocusChanged={onAudioFocusChanged ? _onAudioFocusChanged : undefined}
					onReadyForDisplay={
						onReadyForDisplay || hasPoster ? _onReadyForDisplay : undefined
					}
					onPlaybackRateChange={onPlaybackRateChange ? _onPlaybackRateChange : undefined}
					onVolumeChange={onVolumeChange ? _onVolumeChange : undefined}
					onVideoAudioBecomingNoisy={onAudioBecomingNoisy}
					onPictureInPictureStatusChanged={
						onPictureInPictureStatusChanged
							? _onPictureInPictureStatusChanged
							: undefined
					}
					onRestoreUserInterfaceForPictureInPictureStop={
						onRestoreUserInterfaceForPictureInPictureStop
					}
					onVideoAspectRatio={onAspectRatio ? _onVideoAspectRatio : undefined}
					onReceiveAdEvent={
						onReceiveAdEvent
							? (_onReceiveAdEvent as (e: NativeSyntheticEvent<object>) => void)
							: undefined
					}
				/>
				{hasPoster && showPoster ? (
					<Image
						style={posterStyle}
						source={{ uri: poster }}
						// Sin esta prop, Android decodifica el JPEG a su tamaño intrínseco y
						// luego lo escala en GPU: para un poster grande con density alta el
						// bitmap RGBA8888 resultante puede llegar a varios cientos de MB y
						// Canvas tira `trying to draw too large bitmap` al redibujar (ej. al
						// mostrar los controles). `resize` baja la resolución en el decode al
						// tamaño del layout (no-op en iOS).
						resizeMethod="resize"
					/>
				) : null}
			</View>
		);
	}
);

Video.displayName = "Video";
export default Video;
