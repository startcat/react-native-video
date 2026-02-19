/*
 *  Hook personalizado para integrar los eventos del Video con PlayerAnalyticsEvents
 *
 */

import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

import type { ReactVideoEvents } from "../../../../types";
import { PlayerError } from "../../errors";

import {
	PlayerAnalyticsEvents,
	type PlayerAnalyticsPlugin,
} from "@overon/react-native-overon-player-analytics-plugins";

import { VideoEventsAdapter } from "../VideoEventsAdapter";

import type {
	OnAudioTracksData,
	OnBandwidthUpdateData,
	OnBufferData,
	OnExternalPlaybackChangeData,
	OnLoadStartData,
	OnPlaybackRateChangeData,
	OnPlaybackStateChangedData,
	OnProgressData,
	OnSeekData,
	OnTimedMetadataData,
	OnVideoAspectRatioData,
	OnVideoErrorData,
	OnVideoTracksData,
	OnVolumeChangeData,
} from "../../../../specs/VideoNativeComponent";

import type { OnLoadData, OnReceiveAdEventData, OnTextTracksData } from "../../../../types/events";

import { type UseVideoAnalyticsProps, type UseVideoAnalyticsReturn } from "../types";

export const useVideoAnalytics = ({
	plugins = [],
	onInternalError,
}: UseVideoAnalyticsProps = {}): UseVideoAnalyticsReturn => {
	const analyticsEventsRef = useRef<PlayerAnalyticsEvents>();
	const adapterRef = useRef<VideoEventsAdapter>();
	const appStateRef = useRef<string>(AppState.currentState);

	// Inicializar PlayerAnalyticsEvents
	if (!analyticsEventsRef.current) {
		analyticsEventsRef.current = new PlayerAnalyticsEvents();
	}

	// Inicializar VideoEventsAdapter
	if (!adapterRef.current && analyticsEventsRef.current) {
		try {
			adapterRef.current = new VideoEventsAdapter(analyticsEventsRef.current);
		} catch (error) {
			onInternalError?.(
				new PlayerError("PLAYER_EVENT_HANDLER_INITIALIZATION_FAILED", {
					originalError: error,
				})
			);
		}
	}

	// Configurar plugins
	useEffect(() => {
		if (!analyticsEventsRef.current) {
			return;
		}

		// Limpiar plugins existentes
		const existingPlugins = analyticsEventsRef.current.getPlugins();
		existingPlugins.forEach((plugin: PlayerAnalyticsPlugin) => {
			analyticsEventsRef.current!.removePlugin(plugin.name);
		});

		// Agregar nuevos plugins
		plugins.forEach((plugin: PlayerAnalyticsPlugin) => {
			analyticsEventsRef.current!.addPlugin(plugin);
		});

		return () => {
			// Cleanup al desmontar
			if (analyticsEventsRef.current) {
				analyticsEventsRef.current.destroy();
			}
		};
	}, [plugins]);

	// Manejar cambios de estado de la aplicación
	useEffect(() => {
		if (!adapterRef.current) {
			return;
		}

		const handleAppStateChange = (nextAppState: string) => {
			if (appStateRef.current.match(/inactive|background/) && nextAppState === "active") {
				adapterRef.current!.onApplicationForeground();
				adapterRef.current!.onApplicationActive();
			} else if (
				appStateRef.current === "active" &&
				nextAppState.match(/inactive|background/)
			) {
				adapterRef.current!.onApplicationInactive();
				adapterRef.current!.onApplicationBackground();
			}
			appStateRef.current = nextAppState;
		};

		const subscription = AppState.addEventListener("change", handleAppStateChange);

		return () => {
			subscription?.remove();
		};
	}, []);

	// Crear los eventos del video usando useCallback para evitar re-renders
	const videoEvents: ReactVideoEvents = {
		onLoadStart: useCallback((e: OnLoadStartData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onLoadStart(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_LOAD_START_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onLoad: useCallback((e: OnLoadData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onLoad(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_LOAD_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onProgress: useCallback((e: OnProgressData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onProgress(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_PROGRESS_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onPlaybackStateChanged: useCallback((e: OnPlaybackStateChangedData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onPlaybackStateChanged(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_PLAYBACK_STATE_CHANGED_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onBuffer: useCallback((e: OnBufferData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onBuffer(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_BUFFER_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onSeek: useCallback((e: OnSeekData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onSeek(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_SEEK_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onPlaybackRateChange: useCallback((e: OnPlaybackRateChangeData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onPlaybackRateChange(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_PLAYBACK_RATE_CHANGE_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onVolumeChange: useCallback((e: OnVolumeChangeData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onVolumeChange(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_VOLUME_CHANGE_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onEnd: useCallback(() => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onEnd();
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_END_FAILED", { originalError: error })
					);
				}
			}
		}, []),

		onError: useCallback((e: OnVideoErrorData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onError(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_ERROR_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onReceiveAdEvent: useCallback((e: OnReceiveAdEventData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onReceiveAdEvent(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_RECEIVE_AD_EVENT_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onAudioTracks: useCallback((e: OnAudioTracksData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onAudioTracks(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_AUDIO_TRACKS_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onTextTracks: useCallback((e: OnTextTracksData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onTextTracks(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_TEXT_TRACKS_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onVideoTracks: useCallback((e: OnVideoTracksData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onVideoTracks(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_VIDEO_TRACKS_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onBandwidthUpdate: useCallback((e: OnBandwidthUpdateData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onBandwidthUpdate(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_BANDWIDTH_UPDATE_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onAspectRatio: useCallback((e: OnVideoAspectRatioData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onAspectRatio(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_ASPECT_RATIO_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onTimedMetadata: useCallback((e: OnTimedMetadataData) => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onTimedMetadata(e);
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_TIMED_METADATA_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onReadyForDisplay: useCallback(() => {
			if (adapterRef.current) {
				try {
					adapterRef.current.onReadyForDisplay();
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_READY_FOR_DISPLAY_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		// Eventos adicionales que pueden ser útiles
		onAudioBecomingNoisy: useCallback(() => {
			if (analyticsEventsRef.current) {
				try {
					analyticsEventsRef.current.onPause();
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_AUDIO_BECOMING_NOISY_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onIdle: useCallback(() => {
			if (analyticsEventsRef.current) {
				try {
					analyticsEventsRef.current.onPause();
				} catch (error) {
					onInternalError?.(
						new PlayerError("PLAYER_EVENT_HANDLER_IDLE_FAILED", {
							originalError: error,
						})
					);
				}
			}
		}, []),

		onExternalPlaybackChange: useCallback((e: OnExternalPlaybackChangeData) => {
			// Manejar cambios en la reproducción externa (AirPlay, Chromecast, etc.)
			console.log("[useVideoAnalytics] External playback change:", e);
		}, []),

		onFullscreenPlayerWillPresent: useCallback(() => {
			console.log("[useVideoAnalytics] Fullscreen will present");
		}, []),

		onFullscreenPlayerDidPresent: useCallback(() => {
			console.log("[useVideoAnalytics] Fullscreen did present");
		}, []),

		onFullscreenPlayerWillDismiss: useCallback(() => {
			console.log("[useVideoAnalytics] Fullscreen will dismiss");
		}, []),

		onFullscreenPlayerDidDismiss: useCallback(() => {
			console.log("[useVideoAnalytics] Fullscreen did dismiss");
		}, []),
	};

	// Métodos de utilidad
	const getCurrentPosition = useCallback(() => {
		return adapterRef.current?.getCurrentPosition() || 0;
	}, []);

	const getDuration = useCallback(() => {
		return adapterRef.current?.getDuration() || 0;
	}, []);

	const isPlaying = useCallback(() => {
		return adapterRef.current?.getIsPlaying() || false;
	}, []);

	const isBuffering = useCallback(() => {
		return adapterRef.current?.getIsBuffering() || false;
	}, []);

	const isSeekInProgress = useCallback(() => {
		return adapterRef.current?.getIsSeekInProgress() || false;
	}, []);

	const getSeekFromPosition = useCallback(() => {
		return adapterRef.current?.getSeekFromPosition();
	}, []);

	const getSeekToPosition = useCallback(() => {
		return adapterRef.current?.getSeekToPosition();
	}, []);

	return {
		videoEvents,
		analyticsEvents: analyticsEventsRef.current!,
		adapter: adapterRef.current!,
		getCurrentPosition,
		getDuration,
		isPlaying,
		isBuffering,
		isSeekInProgress,
		getSeekFromPosition,
		getSeekToPosition,
	};
};
