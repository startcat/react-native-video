import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useAirplayConnectivity } from "react-airplay";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	type OnAudioTracksData,
	type OnBufferData,
	type OnProgressData,
	type OnVideoErrorData,
	type OnVideoTracksData,
} from "../../../specs/VideoNativeComponent";

import {
	type OnLoadData,
	type OnReceiveAdEventData,
	type OnTextTracksData,
} from "../../../types/events";

import {
	type SelectedTrack,
	type SelectedVideoTrack,
	type TextTracks,
	SelectedTrackType,
	SelectedVideoTrackType,
	TextTrackType,
} from "../../../types/video";
import Video, { type VideoRef } from "../../../Video";
import { Overlay } from "../../components/overlay";
import {
	type IPlayerProgress,
	type ProgressUpdateData,
	type SliderValues,
	DVR_PLAYBACK_TYPE,
} from "../../types";
const BackgroundPoster = React.lazy(() => import("../../components/poster"));

import { type BaseError } from "@overon/react-native-overon-player-analytics-plugins";
import { PlayerError, handleErrorException, mapVideoErrorToPlayerError } from "../../core/errors";

import { useIsLandscape } from "../common/hooks";

import { useIsBuffering } from "../../core/buffering";

import { mergeMenuData, onAdStarted } from "../../utils";

import { nativeManager } from "../../features/offline/managers/NativeManager";

import { type onSourceChangedProps, SourceClass } from "../../modules/source";

import { TudumClass } from "../../modules/tudum";

import { PlaybackPhase, PlaybackPhaseManager } from "../../core/phase/PlaybackPhaseManager";
import {
	type ModeChangeData,
	type ProgramChangeData,
	DVRProgressManagerClass,
	VODProgressManagerClass,
} from "../../core/progress";

import { ComponentLogger } from "../../features/logger";

import { useVideoAnalytics } from "../../core/events/hooks/useVideoAnalytics";

import { styles } from "../styles";

import {
	type ICommonData,
	type IDrm,
	type IMappedYoubora,
	type IPlayerMenuData,
	type IVideoSource,
	type NormalFlavourProps,
	CONTROL_ACTION,
	PLAYER_MENU_DATA_TYPE,
	YOUBORA_FORMAT,
} from "../../types";

export function NormalFlavour(props: NormalFlavourProps): React.ReactElement {
	const currentLogger = useRef<ComponentLogger | null>(null);

	const [isPlayingAd, setIsPlayingAd] = useState<boolean>(false);
	const isPlayingAdRef = useRef<boolean>(false);
	const hasAdFinishedRef = useRef<boolean>(false);
	const postAdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const postAdSeekDoneRef = useRef<boolean>(false);
	const postAdRestoreSafetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastContentCurrentTimeRef = useRef<number>(0);
	const preAdContentPositionRef = useRef<number>(-1);
	const iosInitialLiveEdgeGuardDoneRef = useRef<boolean>(false);
	const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
	const isContentLoadedRef = useRef<boolean>(false);
	const pendingSourceReloadRef = useRef<boolean>(false);

	const cachedAudioTracksRef = useRef<OnLoadData["audioTracks"]>([]);
	const cachedTextTracksRef = useRef<OnLoadData["textTracks"]>([]);
	const cachedVideoTracksRef = useRef<OnLoadData["videoTracks"]>([]);

	const insets = useSafeAreaInsets();

	const youboraForVideo = useRef<IMappedYoubora>();
	const drm = useRef<IDrm>();
	const [videoSource, setVideoSource] = useState<IVideoSource | undefined>(undefined);

	const isChangingSource = useRef<boolean>(true);

	const [currentTime, setCurrentTime] = useState<number>(props.playerProgress?.currentTime || 0);
	const [paused, setPaused] = useState<boolean>(!!props.playerProgress?.isPaused);
	const [muted, setMuted] = useState<boolean>(!!props?.playerProgress?.isMuted);
	const [buffering, setBuffering] = useState<boolean>(false);
	const [menuData, setMenuData] = useState<Array<IPlayerMenuData>>();
	const menuDataRef = useRef<Array<IPlayerMenuData> | undefined>(undefined);
	const [speedRate, setSpeedRate] = useState<number>(1);
	const [selectedAudioTrack, setSelectedAudioTrack] = useState<SelectedTrack>();
	const [selectedTextTrack, setSelectedTextTrack] = useState<SelectedTrack>();
	const [selectedVideoTrack, setSelectedVideoTrack] = useState<SelectedVideoTrack>({
		type: SelectedVideoTrackType.AUTO,
	});
	const [maxBitRate, setMaxBitRate] = useState<number>(0);
	const [offlineTextTracks, setOfflineTextTracks] = useState<TextTracks | undefined>(undefined);

	const refVideoPlayer = useRef<VideoRef>(null);
	const videoQualityIndex = useRef<number>(-1);
	const [sliderValues, setSliderValues] = useState<SliderValues | undefined>(undefined);
	const [isLiveProgramRestricted, setIsLiveProgramRestricted] = useState<boolean>(false);
	const isLiveProgramRestrictedRef = useRef<boolean>(false);
	const [dvrPlaybackType, setDvrPlaybackType] = useState<DVR_PLAYBACK_TYPE | undefined>(
		undefined
	);

	// Logger
	if (!currentLogger.current && props.playerContext?.logger) {
		currentLogger.current = props.playerContext?.logger?.forComponent(
			"Video Flavour",
			props.logger?.core?.enabled,
			props.logger?.core?.level
		);
	}

	// Player Progress
	const playerProgressRef = useRef<IPlayerProgress>();

	// Source
	const sourceRef = useRef<SourceClass | null>(null);

	// Tudum
	const tudumRef = useRef<TudumClass | null>(null);

	// VOD Progress Manager
	const vodProgressManagerRef = useRef<VODProgressManagerClass | null>(null);

	// DVR Progress Manager
	const dvrProgressManagerRef = useRef<DVRProgressManagerClass | null>(null);

	// PlaybackPhaseManager — máquina de estados explícita del ciclo de reproducción
	const phaseManagerRef = useRef<PlaybackPhaseManager>(new PlaybackPhaseManager());

	// Track current audio/subtitle indices (para el menú)
	const [currentAudioIndex, setCurrentAudioIndex] = useState<number | undefined>(
		props.audioIndex
	);
	const currentAudioIndexRef = useRef<number | undefined>(props.audioIndex);
	const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState<
		number | { index?: number; language?: string } | undefined
	>(props.subtitleIndex);
	const currentSubtitleIndexRef = useRef<
		number | { index?: number; language?: string } | undefined
	>(props.subtitleIndex);

	// Control para evitar mezcla de sources
	const currentSourceType = useRef<"tudum" | "content" | null>(null);
	const pendingContentSource = useRef<onSourceChangedProps | null>(null);

	// Hook para la orientación de la pantalla
	const isLandscapePlayer = useIsLandscape();

	// Hook para el estado de Airplay
	const isAirplayConnected = useAirplayConnectivity();

	// Hook para el estado de buffering
	const isBuffering = useIsBuffering({
		buffering: buffering,
		paused: paused,
		onBufferingChange: props.events?.onBuffering,
	});

	useEffect(() => {
		currentLogger.current?.info(`useEffect videoSource ${JSON.stringify(videoSource)}`);
	}, [videoSource?.uri]);

	useEffect(() => {
		// GUARD: Skip if manifests are not available yet
		// This prevents throwing PLAYER_SOURCE_NO_MANIFESTS_PROVIDED before data is ready
		if (!props.manifests || props.manifests.length === 0) {
			return;
		}

		// Verificar si es contenido live/DVR vs VOD
		const isLiveContent = !!props.playerProgress?.isLive;

		if (isLiveContent) {
			// COMPORTAMIENTO ORIGINAL PARA LIVE/DVR - Sin tudum, sin resets complicados
			if (!tudumRef.current) {
				tudumRef.current = new TudumClass({
					enabled: false, // Nunca tudum para live
					getTudumSource: props.hooks?.getTudumSource,
					getTudumManifest: props.hooks?.getTudumManifest,
				});
			}

			if (!sourceRef.current) {
				sourceRef.current = new SourceClass({
					id: props.playerMetadata?.id,
					title: props.playerMetadata?.title,
					subtitle: props.playerMetadata?.subtitle,
					description: props.playerMetadata?.description,
					poster: props.playerMetadata?.poster,
					squaredPoster: props.playerMetadata?.squaredPoster,
					manifests: props.manifests,
					startPosition: props.playerProgress?.currentTime || 0,
					isLive: true,
					isCast: false,
					headers: props.headers,
					getBestManifest: props.hooks?.getBestManifest,
					getSourceUri: props.hooks?.getSourceUri,
					onSourceChanged: onSourceChanged,
				});
			}

			// Para live, cargar contenido directamente
			currentSourceType.current = "content";
			isChangingSource.current = true;
			cachedAudioTracksRef.current = [];
			cachedTextTracksRef.current = [];
			cachedVideoTracksRef.current = [];

			try {
				sourceRef.current.changeSource({
					id: props.playerMetadata?.id,
					title: props.playerMetadata?.title,
					subtitle: props.playerMetadata?.subtitle,
					description: props.playerMetadata?.description,
					poster: props.playerMetadata?.poster,
					squaredPoster: props.playerMetadata?.squaredPoster,
					manifests: props.manifests,
					startPosition: props.playerProgress?.currentTime || 0,
					isLive: true,
					isCast: false,
					headers: props.headers,
				});
			} catch (error: any) {
				handleOnInternalError(handleErrorException(error, "PLAYER_MEDIA_LOAD_FAILED"));
				return;
			}
		} else {
			// LÓGICA DEL TUDUM SOLO PARA VOD

			// Guard: si el contenido ya está cargado, significa que props.manifests cambió
			// de referencia (nuevo array, mismo contenido) por un re-render del padre
			// (ej: tras resolver watching-progress API). No resetear ni recargar.
			if (isContentLoadedRef.current) {
				currentLogger.current?.debug(
					"useEffect manifests - Content already loaded, skipping reset (manifests reference changed but content is the same)"
				);
				return;
			}

			// Reset completo solo para VOD
			currentSourceType.current = null;
			pendingContentSource.current = null;
			setSliderValues(undefined);
			setIsContentLoaded(false);
			cachedAudioTracksRef.current = [];
			cachedTextTracksRef.current = [];
			cachedVideoTracksRef.current = [];

			// Si no hay adTagUrl, marcar ads como finalizados para que handleOnProgress
			// pueda confiar en seekableDuration como duración del VOD sin esperar un
			// evento AD_BREAK_ENDED/AD_ERROR que nunca llegará
			hasAdFinishedRef.current = !props.playerAds?.adTagUrl;
			postAdSeekDoneRef.current = false;
			if (postAdRestoreSafetyTimeoutRef.current) {
				clearTimeout(postAdRestoreSafetyTimeoutRef.current);
				postAdRestoreSafetyTimeoutRef.current = null;
			}
			lastContentCurrentTimeRef.current = 0;
			preAdContentPositionRef.current = -1;
			iosInitialLiveEdgeGuardDoneRef.current = false;

			// Reset progress managers solo para VOD
			vodProgressManagerRef.current?.reset();
			dvrProgressManagerRef.current?.reset();

			// Determinar si debe reproducir tudum (solo para VOD)
			const shouldPlayTudum =
				!!props.showExternalTudum && !props.isAutoNext && !props.playerProgress?.isLive;
			currentLogger.current?.info(`shouldPlayTudum: ${shouldPlayTudum}`);

			if (!tudumRef.current) {
				tudumRef.current = new TudumClass({
					enabled: !!props.showExternalTudum,
					getTudumSource: props.hooks?.getTudumSource,
					getTudumManifest: props.hooks?.getTudumManifest,
					isAutoNext: props.isAutoNext,
				});
			} else {
				// Actualizar contexto si el tudum ya existe
				tudumRef.current.updateAutoNextContext(!!props.isAutoNext);
			}

			if (!sourceRef.current) {
				sourceRef.current = new SourceClass({
					id: props.playerMetadata?.id,
					title: props.playerMetadata?.title,
					subtitle: props.playerMetadata?.subtitle,
					description: props.playerMetadata?.description,
					poster: props.playerMetadata?.poster,
					squaredPoster: props.playerMetadata?.squaredPoster,
					manifests: props.manifests,
					startPosition: props.playerProgress?.currentTime || 0,
					isLive: false,
					isCast: false,
					headers: props.headers,
					getBestManifest: props.hooks?.getBestManifest,
					getSourceUri: props.hooks?.getSourceUri,
					onSourceChanged: onSourceChanged,
				});
			}

			// Establecer currentSourceType basado en si vamos a reproducir tudum
			if (shouldPlayTudum && tudumRef.current?.isReady && !sourceRef.current?.isDownloaded) {
				currentLogger.current?.debug("Will play tudum first, then content");
				currentSourceType.current = "tudum";
				loadTudumSource();
			} else {
				currentLogger.current?.debug("Skipping tudum - loading content directly");
				currentSourceType.current = "content";
				loadContentSource();
			}
		}
	}, [props.manifests, props.isAutoNext]);

	// Función para cargar source del tudum
	const loadTudumSource = () => {
		currentLogger.current?.debug("loadTudumSource");

		if (tudumRef.current?.source) {
			currentSourceType.current = "tudum";
			tudumRef.current.isPlaying = true;
			drm.current = tudumRef.current?.drm;

			currentLogger.current?.debug(
				`Setting tudum source: ${JSON.stringify(tudumRef.current.source)}`
			);
			setVideoSource(tudumRef.current.source);
		}
	};

	// Función para cargar source del contenido
	const loadContentSource = () => {
		currentLogger.current?.debug("loadContentSource");

		isChangingSource.current = true;
		currentSourceType.current = "content";

		if (sourceRef.current) {
			try {
				sourceRef.current?.changeSource({
					id: props.playerMetadata?.id,
					title: props.playerMetadata?.title,
					subtitle: props.playerMetadata?.subtitle,
					description: props.playerMetadata?.description,
					poster: props.playerMetadata?.poster,
					squaredPoster: props.playerMetadata?.squaredPoster,
					manifests: props.manifests,
					startPosition: props.playerProgress?.currentTime || 0,
					isLive: !!props.playerProgress?.isLive,
					isCast: false,
					headers: props.headers,
				});
			} catch (error: any) {
				handleOnInternalError(handleErrorException(error, "PLAYER_MEDIA_LOAD_FAILED"));
				return;
			}

			// Si el source ya está listo inmediatamente, forzar la carga
			setTimeout(() => {
				if (sourceRef.current?.isReady && currentSourceType.current === "content") {
					currentLogger.current?.debug("Forcing content load - sourceRef is ready");
					setPlayerSource();
				}
			}, 100);
		}
	};

	// Función para cambiar de tudum a contenido
	const switchFromTudumToContent = () => {
		currentLogger.current?.debug("switchFromTudumToContent");

		// Limpiar completamente el source del tudum
		currentSourceType.current = null;
		tudumRef.current!.isPlaying = false;

		// Reset completo de progress managers y sliderValues
		setSliderValues(undefined);
		vodProgressManagerRef.current?.reset();
		dvrProgressManagerRef.current?.reset();

		// Limpiar el video source actual
		setVideoSource(undefined);

		// Pequeño delay para asegurar que se limpia el source
		setTimeout(() => {
			currentLogger.current?.debug(
				`switchFromTudumToContent - pendingContentSource.current ${JSON.stringify(
					pendingContentSource.current
				)}`
			);

			// Si hay un source de contenido pendiente, usarlo directamente
			if (pendingContentSource.current && pendingContentSource.current.isReady) {
				currentLogger.current?.debug(
					"switchFromTudumToContent - Loading pending content source directly"
				);
				currentSourceType.current = "content";
				setPlayerSource(pendingContentSource.current);
				pendingContentSource.current = null;
			} else {
				// Cargar el contenido principal
				currentLogger.current?.debug(
					"switchFromTudumToContent - Loading main content source"
				);
				currentSourceType.current = "content";
				loadContentSource();
			}
		}, 100);
	};

	useEffect(() => {
		// Montamos el selector de pista de Audio
		if (typeof props.audioIndex === "number" && props.audioIndex > -1) {
			setSelectedAudioTrack({
				value: props.audioIndex,
				type: SelectedTrackType.INDEX,
			});
		}
	}, [props.audioIndex]);

	useEffect(() => {
		// Montamos el selector de pista de Subtítulo
		// Soporta tanto índices numéricos como objetos con uri/language para subtítulos sideloaded (offline)
		if (typeof props.subtitleIndex === "object" && props.subtitleIndex !== null) {
			// Subtítulo sideloaded (offline) - seleccionar por idioma
			const subtitleData = props.subtitleIndex as {
				index?: number;
				uri?: string;
				language?: string;
			};
			if (subtitleData.language) {
				setSelectedTextTrack({
					value: subtitleData.language,
					type: SelectedTrackType.LANGUAGE,
				});
			} else if (subtitleData.uri) {
				// Fallback: usar título si no hay idioma
				setSelectedTextTrack({
					value: subtitleData.uri,
					type: SelectedTrackType.TITLE,
				});
			}
		} else if (typeof props.subtitleIndex === "number" && props.subtitleIndex > -1) {
			setSelectedTextTrack({
				value: props.subtitleIndex,
				type: SelectedTrackType.INDEX,
			});
		} else if (typeof props.subtitleIndex === "number" && props.subtitleIndex === -1) {
			setSelectedTextTrack({
				type: SelectedTrackType.DISABLED,
			});
		}
	}, [props.subtitleIndex]);

	// Configure offline textTracks when sourceRef has offline subtitles available
	// This runs after SourceClass has finished processing the download state
	// On iOS, we need to resolve bookmark paths first (async) to handle sandbox UUID changes
	useEffect(() => {
		if (
			videoSource &&
			sourceRef.current?.isDownloaded &&
			sourceRef.current?.offlineSubtitles?.length > 0
		) {
			const offlineSubs = sourceRef.current.offlineSubtitles;
			const downloadId = String(videoSource.id);
			console.log(
				`[Player] (Normal Flavour) [OFFLINE DEBUG] useEffect: Converting ${offlineSubs.length} offline subtitles to textTracks`
			);

			// On iOS, resolve paths from bookmarks first (handles sandbox UUID changes)
			const processSubtitles = async () => {
				let resolvedSubs = offlineSubs;

				if (Platform.OS === "ios" && downloadId) {
					try {
						console.log(
							`[Player] (Normal Flavour) [OFFLINE DEBUG] iOS: Resolving subtitle paths from bookmarks`
						);
						const toResolve = offlineSubs.map(sub => ({
							downloadId,
							language: sub.language,
						}));
						const resolvedPaths = await nativeManager.resolveSubtitlePaths(toResolve);

						resolvedSubs = offlineSubs.map(sub => {
							const key = `${downloadId}:${sub.language}`;
							const resolvedPath = resolvedPaths.get(key);
							if (resolvedPath) {
								console.log(
									`[Player] (Normal Flavour) [OFFLINE DEBUG] iOS: Resolved ${sub.language}: ${resolvedPath}`
								);
								return { ...sub, localPath: resolvedPath };
							}
							return sub;
						});
					} catch (error) {
						console.error(
							`[Player] (Normal Flavour) [OFFLINE DEBUG] iOS: Failed to resolve bookmark paths`,
							error
						);
					}
				}

				const convertedTracks = resolvedSubs
					.filter(sub => sub.localPath && sub.state === "COMPLETED")
					.map(sub => ({
						title: sub.label,
						language: sub.language,
						type: TextTrackType.VTT,
						uri: sub.localPath!.startsWith("file://")
							? sub.localPath!
							: `file://${sub.localPath}`,
					})) as TextTracks;

				if (convertedTracks.length > 0) {
					console.log(
						`[Player] (Normal Flavour) [OFFLINE DEBUG] useEffect: Setting ${convertedTracks.length} offline textTracks`
					);
					convertedTracks.forEach(track => {
						console.log(
							`[Player] (Normal Flavour) [OFFLINE DEBUG]   - ${track.language}: ${track.uri}`
						);
					});
					setOfflineTextTracks(convertedTracks);
				}
			};

			processSubtitles();
		}
	}, [videoSource]);

	// When sideloaded textTracks change, the native player may auto-activate the first track.
	// Re-apply selectedTextTrack to enforce the current subtitle selection (e.g. DISABLED).
	// Note: treat undefined/null subtitleIndex as DISABLED (no preference = no subtitle).
	useEffect(() => {
		if (offlineTextTracks !== undefined) {
			if (
				props.subtitleIndex === undefined ||
				props.subtitleIndex === null ||
				(typeof props.subtitleIndex === "number" && props.subtitleIndex === -1)
			) {
				setSelectedTextTrack({ type: SelectedTrackType.DISABLED });
			} else if (typeof props.subtitleIndex === "number" && props.subtitleIndex > -1) {
				setSelectedTextTrack({ value: props.subtitleIndex, type: SelectedTrackType.INDEX });
			} else if (typeof props.subtitleIndex === "object" && props.subtitleIndex !== null) {
				const subtitleData = props.subtitleIndex as { index?: number; language?: string };
				if (subtitleData.language) {
					setSelectedTextTrack({
						value: subtitleData.language,
						type: SelectedTrackType.LANGUAGE,
					});
				}
			}
		}
	}, [offlineTextTracks]);

	useEffect(() => {
		if (menuData && props.events?.onChangeCommonData) {
			// Al cargar la lista de audios y subtítulos, mandamos las labels iniciales
			// Lo necesitamos para pintar el idioma por encima del player con componentes externos

			let data: ICommonData = {},
				audioDefaultIndex = 0,
				textDefaultIndex = -1;

			if (typeof selectedAudioTrack?.value === "number") {
				audioDefaultIndex = selectedAudioTrack?.value;
			}

			if (typeof selectedTextTrack?.value === "number") {
				textDefaultIndex = selectedTextTrack?.value;
			}

			data.audioIndex = audioDefaultIndex;
			data.audioLabel = menuData?.find(
				(item: IPlayerMenuData) =>
					item.type === PLAYER_MENU_DATA_TYPE.AUDIO && item.index === audioDefaultIndex
			)?.label;

			data.subtitleIndex = textDefaultIndex;
			data.subtitleLabel = menuData?.find(
				(item: IPlayerMenuData) =>
					item.type === PLAYER_MENU_DATA_TYPE.TEXT && item.index === textDefaultIndex
			)?.label;

			if (data) {
				props.events?.onChangeCommonData(data);
			}
		}
	}, [menuData]);

	// Función auxiliar para combinar eventos
	const combineEventHandlers = (originalHandler?: Function, analyticsHandler?: Function) => {
		return (...args: any[]) => {
			// Ejecutar handler original primero
			const result = originalHandler?.(...args);

			// Para eventos de error, pasar el PlayerError ya procesado en lugar del OnVideoErrorData crudo
			if (originalHandler === handleOnVideoError && result instanceof PlayerError) {
				analyticsHandler?.(result);
			} else {
				// Para otros eventos, ejecutar handler de analíticas normalmente
				analyticsHandler?.(...args);
			}

			return result;
		};
	};

	// Source Cooking
	const onSourceChanged = (data: onSourceChangedProps) => {
		// currentLogger.current?.temp(`onSourceChanged - currentSourceType: ${currentSourceType.current}`);
		// currentLogger.current?.temp(`onSourceChanged - tudumRef.current?.isPlaying ${tudumRef.current?.isPlaying}`);
		// currentLogger.current?.temp(`onSourceChanged - data isReady: ${data.isReady}`);
		// currentLogger.current?.temp(`onSourceChanged - data ${JSON.stringify(data)}`);

		if (
			!sourceRef.current?.isLive &&
			!sourceRef.current?.isDownloaded &&
			currentSourceType.current === "tudum"
		) {
			// Si estamos reproduciendo tudum, guardar el source del contenido para después
			currentLogger.current?.debug(
				"onSourceChanged - Saving content source for later (tudum is playing)"
			);
			pendingContentSource.current = data;

			currentLogger.current?.debug(
				`onSourceChanged - pendingContentSource.current ${JSON.stringify(
					pendingContentSource.current
				)}`
			);

			// También preparar el progress
			if (data.isReady) {
				playerProgressRef.current = {
					...props.playerProgress,
					currentTime: currentTime,
					duration: sliderValues?.duration || 0,
					isPaused: paused,
					isMuted: muted,
					isContentLoaded: isContentLoaded,
					isChangingSource: isChangingSource.current,
					sliderValues: sliderValues,
				};
			}
		} else if (currentSourceType.current === "content") {
			// Si ya estamos en modo contenido, procesar normalmente
			currentLogger.current?.debug("onSourceChanged - Processing content source normally");

			playerProgressRef.current = {
				...props.playerProgress,
				currentTime: currentTime,
				duration: sliderValues?.duration || 0,
				isPaused: paused,
				isMuted: muted,
				isContentLoaded: isContentLoaded,
				isChangingSource: isChangingSource.current,
				sliderValues: sliderValues,
			};

			setPlayerSource(data);
		} else {
			// Estado inicial o indefinido
			currentLogger.current?.debug("onSourceChanged - Initial state, processing source");

			// Si no tenemos tipo definido, debe ser contenido
			if (!currentSourceType.current) {
				currentSourceType.current = "content";
				currentLogger.current?.info(
					"onSourceChanged - Setting currentSourceType to content"
				);
			}

			playerProgressRef.current = {
				...props.playerProgress,
				currentTime: currentTime,
				duration: sliderValues?.duration || 0,
				isPaused: paused,
				isMuted: muted,
				isContentLoaded: isContentLoaded,
				isChangingSource: isChangingSource.current,
				sliderValues: sliderValues,
			};

			setPlayerSource(data);
		}

		// Reset DVR si es necesario
		if (sourceRef.current?.isLive && sourceRef.current?.isDVR) {
			dvrProgressManagerRef.current?.reset();
		}

		// Configure offline textTracks when source is ready and has offline subtitles
		if (sourceRef.current?.isDownloaded && sourceRef.current?.offlineSubtitles?.length > 0) {
			const offlineSubs = sourceRef.current.offlineSubtitles;
			console.log(
				`[Player] (Normal Flavour) [OFFLINE DEBUG] onSourceChanged: Converting ${offlineSubs.length} offline subtitles to textTracks`
			);

			const convertedTracks = offlineSubs
				.filter(sub => sub.localPath && sub.state === "COMPLETED")
				.map(sub => ({
					title: sub.label,
					language: sub.language,
					type: TextTrackType.VTT,
					uri: sub.localPath!.startsWith("file://")
						? sub.localPath!
						: `file://${sub.localPath}`,
				})) as TextTracks;

			if (convertedTracks.length > 0) {
				console.log(
					`[Player] (Normal Flavour) [OFFLINE DEBUG] onSourceChanged: Setting ${convertedTracks.length} offline textTracks`
				);
				convertedTracks.forEach(track => {
					console.log(
						`[Player] (Normal Flavour) [OFFLINE DEBUG]   - ${track.language}: ${track.uri}`
					);
				});
				setOfflineTextTracks(convertedTracks);
			}
		}
	};

	const setPlayerSource = (data?: onSourceChangedProps) => {
		currentLogger.current?.temp(`setPlayerSource (data isReady ${!!data?.isReady})`);
		currentLogger.current?.temp(
			`setPlayerSource (sourceRef isReady ${!!sourceRef.current?.isReady})`
		);
		currentLogger.current?.temp(
			`setPlayerSource (currentSourceType ${currentSourceType.current})`
		);
		currentLogger.current?.temp(`setPlayerSource (data ${JSON.stringify(data)})`);

		if (data && data?.isReady) {
			currentLogger.current?.debug("setPlayerSource - Using provided data");
			setBuffering(true);
			drm.current = data.drm;

			// Preparamos los datos de Youbora
			if (props.hooks?.getYouboraOptions) {
				youboraForVideo.current = props.hooks.getYouboraOptions(
					props.playerAnalytics?.youbora!,
					YOUBORA_FORMAT.MOBILE
				);
			}

			currentLogger.current?.info(
				`setPlayerSource - Setting content source: ${JSON.stringify(data.source)}`
			);

			// [OFFLINE DEBUG] Log offline playback info
			// playOffline is determined upstream (dataInterface) considering download state + connectivity
			// We do NOT OR with isDownloaded here to avoid forcing offline mode when online
			console.log(`[Player] (Normal Flavour) [OFFLINE DEBUG] setPlayerSource:`);
			console.log(
				`[Player] (Normal Flavour) [OFFLINE DEBUG]   - props.playOffline: ${props.playOffline}`
			);
			console.log(
				`[Player] (Normal Flavour) [OFFLINE DEBUG]   - sourceRef.current?.isDownloaded: ${sourceRef.current?.isDownloaded}`
			);
			console.log(
				`[Player] (Normal Flavour) [OFFLINE DEBUG]   - effectivePlayOffline (sent to Video): ${!!props.playOffline}`
			);
			console.log(
				`[Player] (Normal Flavour) [OFFLINE DEBUG]   - source.uri: "${data.source?.uri}"`
			);
			console.log(
				`[Player] (Normal Flavour) [OFFLINE DEBUG]   - source.title: "${data.source?.title}"`
			);
			console.log(
				`[Player] (Normal Flavour) [OFFLINE DEBUG]   - source.id: ${data.source?.id}`
			);
			console.log(
				`[Player] (Normal Flavour) [OFFLINE DEBUG]   - isDownloaded: ${sourceRef.current?.isDownloaded}`
			);
			console.log(
				`[Player] (Normal Flavour) [OFFLINE DEBUG]   - isBinary: ${sourceRef.current?.isBinary}`
			);

			// Configure offline subtitles if available
			if (
				sourceRef.current?.isDownloaded &&
				sourceRef.current?.offlineSubtitles?.length > 0
			) {
				const offlineSubs = sourceRef.current.offlineSubtitles;
				console.log(
					`[Player] (Normal Flavour) [OFFLINE DEBUG] Converting ${offlineSubs.length} offline subtitles to textTracks`
				);

				// Convert DownloadedSubtitleItem[] to TextTracks format
				const convertedTracks = offlineSubs
					.filter(sub => sub.localPath && sub.state === "COMPLETED")
					.map(sub => ({
						title: sub.label,
						language: sub.language,
						type: TextTrackType.VTT,
						uri: sub.localPath!.startsWith("file://")
							? sub.localPath!
							: `file://${sub.localPath}`,
					})) as TextTracks;

				if (convertedTracks.length > 0) {
					console.log(
						`[Player] (Normal Flavour) [OFFLINE DEBUG] Setting ${convertedTracks.length} offline textTracks`
					);
					setOfflineTextTracks(convertedTracks);
				}
			} else if (
				sourceRef.current?.currentManifest?.textTracks &&
				sourceRef.current.currentManifest.textTracks.length > 0
			) {
				// Fuente MP4 online con subtítulos externos (sideloaded VTT)
				const manifestTracks = sourceRef.current.currentManifest.textTracks.map(track => ({
					title: track.label,
					language: track.language,
					type: TextTrackType.VTT,
					uri: track.uri,
				})) as TextTracks;

				console.log(
					`[Player] (Normal Flavour) Setting ${manifestTracks.length} external textTracks from manifest`
				);
				setOfflineTextTracks(manifestTracks);
			} else {
				// Clear offline tracks if not in offline mode and no external tracks
				setOfflineTextTracks(undefined);
			}

			phaseManagerRef.current.transition(PlaybackPhase.LOADING, "source_assigned");
			setVideoSource(data.source!);
		} else if (sourceRef.current?.isReady) {
			currentLogger.current?.debug("setPlayerSource - Using sourceRef");
			setBuffering(true);
			drm.current = sourceRef.current.playerSourceDrm;

			// Preparamos los datos de Youbora
			if (props.hooks?.getYouboraOptions) {
				youboraForVideo.current = props.hooks.getYouboraOptions(
					props.playerAnalytics?.youbora!,
					YOUBORA_FORMAT.MOBILE
				);
			}

			// Configure sideloaded textTracks from manifest (MP4 online)
			if (
				sourceRef.current?.currentManifest?.textTracks &&
				sourceRef.current.currentManifest.textTracks.length > 0
			) {
				const manifestTracks = sourceRef.current.currentManifest.textTracks.map(track => ({
					title: track.label,
					language: track.language,
					type: TextTrackType.VTT,
					uri: track.uri,
				})) as TextTracks;

				console.log(
					`[Player] (Normal Flavour) Setting ${manifestTracks.length} external textTracks from manifest (sourceRef branch)`
				);
				setOfflineTextTracks(manifestTracks);
			}

			currentLogger.current?.info(
				`setPlayerSource - Setting sourceRef content: ${JSON.stringify(
					sourceRef.current.playerSource
				)}`
			);
			phaseManagerRef.current.transition(PlaybackPhase.LOADING, "source_assigned");
			setVideoSource(sourceRef.current.playerSource!);
		} else {
			currentLogger.current?.error("setPlayerSource - No valid source available");
		}
	};

	/*
	 *  Gestores de Progreso
	 *
	 */

	const handleOnProgressUpdate = useCallback(
		(data: ProgressUpdateData) => {
			currentLogger.current?.debug(`handleOnProgressUpdate ${JSON.stringify(data)}`);

			// Solo actualizar sliderValues si estamos reproduciendo contenido, no tudum.
			if (currentSourceType.current === "content") {
				setSliderValues({
					minimumValue: data.minimumValue,
					maximumValue: data.maximumValue,
					progress: data.progress,
					percentProgress: data.percentProgress,
					duration: data.duration || 0,
					canSeekToEnd: data.canSeekToEnd,
					liveEdge: data.liveEdge,
					percentLiveEdge: data.percentLiveEdge,
					isProgramLive: data.isProgramLive,
					progressDatum: data.progressDatum,
					liveEdgeOffset: data.liveEdgeOffset,
					isLiveEdgePosition: data.isLiveEdgePosition,
					playbackType: data.playbackType,
				});

				if (data.playbackType !== undefined) {
					setDvrPlaybackType(data.playbackType);
				}

				playerProgressRef.current = {
					...props.playerProgress,
					currentTime: currentTime,
					duration: sliderValues?.duration || 0,
					isPaused: paused,
					isMuted: muted,
					isContentLoaded: isContentLoaded,
					isChangingSource: isChangingSource.current,
					sliderValues: sliderValues,
					currentProgram: data.currentProgram,
				};
			}
		},
		[currentTime, paused, muted, isContentLoaded, props.playerProgress]
	);

	const handleOnSeekRequest = useCallback((playerTime: number) => {
		try {
			currentLogger.current?.debug(`handleOnSeekRequest: ${playerTime}`);
			phaseManagerRef.current.transition(PlaybackPhase.SEEKING, "onSeekRequest");
			refVideoPlayer.current?.seek(playerTime);
		} catch (error: any) {
			currentLogger.current?.error(`handleOnSeekRequest failed: ${error?.message}`);
			handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
		}
	}, []);

	const handleOnDVRModeChange = useCallback((data: ModeChangeData) => {
		currentLogger.current?.debug(`handleOnDVRModeChange: ${JSON.stringify(data)}`);
	}, []);

	const handleOnDVRProgramChange = useCallback((data: ProgramChangeData) => {
		currentLogger.current?.debug(`handleOnDVRProgramChange: ${JSON.stringify(data)}`);
	}, []);

	/*
	 *  Inicialización de Progress Managers
	 *
	 */

	useEffect(() => {
		// Initialize VOD Progress Manager
		if (!vodProgressManagerRef.current) {
			vodProgressManagerRef.current = new VODProgressManagerClass({
				logger: props.playerContext?.logger,
				loggerEnabled: props.logger?.progressManager?.enabled,
				loggerLevel: props.logger?.progressManager?.level,
				onProgressUpdate: handleOnProgressUpdate,
				onSeekRequest: handleOnSeekRequest,
			});
			currentLogger.current?.info("VOD Progress Manager initialized");
		}

		// Initialize DVR Progress Manager
		if (!dvrProgressManagerRef.current) {
			dvrProgressManagerRef.current = new DVRProgressManagerClass({
				logger: props.playerContext?.logger,
				loggerEnabled: props.logger?.progressManager?.enabled,
				loggerLevel: props.logger?.progressManager?.level,
				playbackType: props.playerProgress?.liveValues?.playbackType,
				getEPGProgramAt: props.hooks?.getEPGProgramAt,
				onModeChange: handleOnDVRModeChange,
				onProgramChange: handleOnDVRProgramChange,
				onProgressUpdate: handleOnProgressUpdate,
				onSeekRequest: handleOnSeekRequest,
				phaseManager: phaseManagerRef.current,
			});
			currentLogger.current?.info("DVR Progress Manager initialized");
		}

		// Conectar logger al PhaseManager (disponible aquí tras la inicialización del player)
		if (props.playerContext?.logger) {
			phaseManagerRef.current.setLogger(
				props.playerContext.logger.forComponent(
					"PlaybackPhaseManager",
					props.logger?.core?.enabled,
					props.logger?.core?.level
				)
			);
		}
	}, [
		handleOnProgressUpdate,
		handleOnSeekRequest,
		handleOnDVRModeChange,
		handleOnDVRProgramChange,
	]);

	useEffect(() => {
		isContentLoadedRef.current = isContentLoaded;
	}, [isContentLoaded]);

	useEffect(() => {
		menuDataRef.current = menuData;
	}, [menuData]);

	useEffect(() => {
		if (videoSource === undefined && pendingSourceReloadRef.current) {
			pendingSourceReloadRef.current = false;
			phaseManagerRef.current.transition(PlaybackPhase.LOADING, "new_source_assigned");
			setVideoSource(sourceRef.current?.playerSource!);
		}
	}, [videoSource]);

	useEffect(() => {
		return () => {
			phaseManagerRef.current.reset();
			if (vodProgressManagerRef.current) {
				vodProgressManagerRef.current.destroy();
			}
			if (dvrProgressManagerRef.current) {
				dvrProgressManagerRef.current.destroy();
			}
			if (postAdTimeoutRef.current) {
				clearTimeout(postAdTimeoutRef.current);
			}
			if (postAdRestoreSafetyTimeoutRef.current) {
				clearTimeout(postAdRestoreSafetyTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		const isLiveContent = !!props.playerProgress?.isLive;

		if (isLiveContent && sourceRef.current?.isDVR && dvrProgressManagerRef.current) {
			const dvrWindow = sourceRef.current.dvrWindowSeconds || 3600; // 1 hora por defecto
			currentLogger.current?.debug(`Setting DVR window: ${dvrWindow}s`);
			dvrProgressManagerRef.current.setDVRWindowSeconds(dvrWindow);
		}
	}, [
		props.playerProgress?.isLive,
		sourceRef.current?.isDVR,
		sourceRef.current?.dvrWindowSeconds,
	]);

	/*
	 *  Handlers para los eventos de interfaz
	 *
	 */

	const handleOnControlsPress = (id: CONTROL_ACTION, value?: number | boolean | object) => {
		const COMMON_DATA_FIELDS = [
			"time",
			"volume",
			"mute",
			"pause",
			"audioIndex",
			"subtitleIndex",
		];

		currentLogger.current?.info(`handleOnControlsPress: ${id} (${value})`);

		if (id === CONTROL_ACTION.PAUSE) {
			const newPausedState = !!value;
			setPaused(newPausedState);
		}

		if (id === CONTROL_ACTION.MUTE) {
			setMuted(!!value);
		}

		// Cambio de audio
		if (id === CONTROL_ACTION.AUDIO_INDEX && typeof value === "number") {
			if (value === -1) {
				setSelectedAudioTrack({
					type: SelectedTrackType.DISABLED,
				});
			} else {
				setSelectedAudioTrack({
					type: SelectedTrackType.INDEX,
					value: value,
				});
			}
		}

		// Cambio de subtítulo
		if (id === CONTROL_ACTION.SUBTITLE_INDEX) {
			if (typeof value === "object" && value !== null) {
				// Subtítulo sideloaded (offline) - usar URI directamente
				const subtitleData = value as {
					index?: number;
					uri?: string;
					language?: string;
					label?: string;
				};
				currentSubtitleIndexRef.current = subtitleData;
				setCurrentSubtitleIndex(subtitleData);

				// iOS OFFLINE HLS: Los subtítulos están embebidos en el .movpkg descargado con
				// AVAggregateAssetDownloadTask. NO usamos VTT sideloaded - usamos el índice
				// para que AVPlayer seleccione el subtítulo via AVMediaSelection.
				// Solo Android usa VTT sideloaded para offline.
				const isIOSOfflineHLS =
					Platform.OS === "ios" &&
					sourceRef.current?.isDownloaded &&
					sourceRef.current?.isHLS;

				if (isIOSOfflineHLS) {
					// Para iOS offline HLS, usar índice para seleccionar subtítulo embebido
					if (typeof subtitleData.index === "number") {
						currentLogger.current?.info(
							`handleOnControlsPress: iOS offline HLS - Using embedded subtitle index: ${subtitleData.index}, language: ${subtitleData.language}`
						);
						if (subtitleData.index === -1) {
							setSelectedTextTrack({
								type: SelectedTrackType.DISABLED,
							});
						} else {
							setSelectedTextTrack({
								type: SelectedTrackType.INDEX,
								value: subtitleData.index,
							});
						}
					}
				} else {
					// Android offline o iOS online: usar selección por idioma para VTT sideloaded
					// Android: ExoPlayer busca por format.language cuando usamos LANGUAGE type
					// Los VTT sideloaded se registran con su código de idioma (ca, es, en, fr)
					if (subtitleData.language) {
						currentLogger.current?.info(
							`handleOnControlsPress: Setting sideloaded subtitle by language: ${subtitleData.language}`
						);
						if (subtitleData.index === -1) {
							setSelectedTextTrack({
								type: SelectedTrackType.DISABLED,
							});
						} else {
							setSelectedTextTrack({
								type: SelectedTrackType.LANGUAGE,
								value: subtitleData.language,
							});
						}
					} else if (typeof subtitleData.index === "number") {
						// Fallback a índice si no hay idioma
						currentLogger.current?.info(
							`handleOnControlsPress: Setting sideloaded subtitle by index: ${subtitleData.index}`
						);
						if (subtitleData.index === -1) {
							setSelectedTextTrack({
								type: SelectedTrackType.DISABLED,
							});
						} else {
							setSelectedTextTrack({
								type: SelectedTrackType.INDEX,
								value: subtitleData.index,
							});
						}
					}
				}
			} else if (typeof value === "number") {
				currentSubtitleIndexRef.current = value;
				if (value === -1) {
					setSelectedTextTrack({
						type: SelectedTrackType.DISABLED,
					});
				} else {
					setSelectedTextTrack({
						type: SelectedTrackType.INDEX,
						value: value,
					});
				}
			}
		}

		if (id === CONTROL_ACTION.NEXT && props.events?.onNext) {
			setIsContentLoaded(false);
			props.events?.onNext();

			// Evento analíticas
			analyticsEvents.onStop({ reason: "navigation" });
		}

		if (id === CONTROL_ACTION.PREVIOUS && props.events?.onPrevious) {
			setIsContentLoaded(false);
			props.events.onPrevious();

			// Evento analíticas
			analyticsEvents.onStop({ reason: "navigation" });
		}

		if (
			sourceRef.current?.isHLS &&
			id === CONTROL_ACTION.VIDEO_INDEX &&
			typeof value === "number"
		) {
			// Cambio de calidad con HLS
			if (value === -1) {
				videoQualityIndex.current = -1;
				setMaxBitRate(0);
			} else {
				videoQualityIndex.current = value;
				setMaxBitRate(value);
			}
		}

		if (
			!sourceRef.current?.isHLS &&
			id === CONTROL_ACTION.VIDEO_INDEX &&
			typeof value === "number"
		) {
			// Cambio de calidad sin HLS
			if (value === -1) {
				videoQualityIndex.current = -1;
				setSelectedVideoTrack({
					type: SelectedVideoTrackType.AUTO,
				});
			} else {
				videoQualityIndex.current = value;
				setSelectedVideoTrack({
					type: SelectedVideoTrackType.INDEX,
					value: value,
				});
			}
		}

		if (id === CONTROL_ACTION.LIVE_START_PROGRAM && sourceRef.current?.isDVR) {
			const timestamp = props.events?.onLiveStartProgram?.();

			if (typeof timestamp === "number") {
				// Reset ad cycle refs so the new source load works correctly:
				// - postAdSeekDoneRef: allows post-ad seek logic to run for the new source
				// - hasAdFinishedRef: allows checkInitialSeek in handleOnLoad to execute with isLiveProgramRestricted=true
				postAdSeekDoneRef.current = false;
				hasAdFinishedRef.current = false;
				iosInitialLiveEdgeGuardDoneRef.current = false;
				// Reset síncronos: handleOnLoad usa isContentLoadedRef y menuDataRef (no el state)
				// para evitar stale closures cuando el source cambia rápido (iOS).
				isContentLoadedRef.current = false;
				menuDataRef.current = undefined;

				isChangingSource.current = true;
				phaseManagerRef.current.transition(
					PlaybackPhase.CHANGING_SOURCE,
					"LIVE_START_PROGRAM"
				);
				setVideoSource(undefined);
				setIsContentLoaded(false);
				setBuffering(true);
				isLiveProgramRestrictedRef.current = true;
				setIsLiveProgramRestricted(true);
				setSliderValues(undefined);
				setDvrPlaybackType(undefined);

				if (sourceRef.current) {
					sourceRef.current.changeDvrUriParameters(timestamp);
				}

				if (dvrProgressManagerRef.current) {
					dvrProgressManagerRef.current?.reset();
					dvrProgressManagerRef.current?.setPlaybackType(DVR_PLAYBACK_TYPE.PROGRAM);
				}

				pendingSourceReloadRef.current = true;
			}
		}

		if (id === CONTROL_ACTION.LIVE && sourceRef.current?.isDVR) {
			if (isLiveProgramRestricted) {
				try {
					// Reset síncronos antes del cambio de source
					isContentLoadedRef.current = false;
					menuDataRef.current = undefined;

					isChangingSource.current = true;
					phaseManagerRef.current.transition(PlaybackPhase.CHANGING_SOURCE, "LIVE");
					setVideoSource(undefined);
					setIsContentLoaded(false);
					setBuffering(true);
					isLiveProgramRestrictedRef.current = false;
					setIsLiveProgramRestricted(false);
					setSliderValues(undefined);
					setDvrPlaybackType(undefined);

					if (sourceRef.current) {
						sourceRef.current.reloadDvrStream();
					}

					dvrProgressManagerRef.current?.reset();
					pendingSourceReloadRef.current = true;
				} catch (error: any) {
					currentLogger.current?.error(`DVR reload stream failed: ${error?.message}`);
					handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
				}
			} else {
				try {
					// Volver al directo en DVR
					dvrProgressManagerRef.current?.goToLive();
				} catch (error: any) {
					currentLogger.current?.error(`goToLive failed: ${error?.message}`);
					handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
				}
			}
		}

		if (id === CONTROL_ACTION.SEEK_OVER_EPG && sourceRef.current?.isDVR) {
			try {
				// Volver al inicio del programa en DVR
				dvrProgressManagerRef.current?.goToProgramStart();
			} catch (error: any) {
				currentLogger.current?.error(`goToProgramStart failed: ${error?.message}`);
				handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
			}
		}

		if (id === CONTROL_ACTION.SEEK && sourceRef.current?.isDVR) {
			try {
				// Hacer seek en DVR
				dvrProgressManagerRef.current?.seekToTime(value as number);
			} catch (error: any) {
				currentLogger.current?.error(`DVR seekToTime failed: ${error?.message}`);
				handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
			}
		}

		if (id === CONTROL_ACTION.FORWARD && sourceRef.current?.isDVR) {
			try {
				// Hacer seek en DVR
				dvrProgressManagerRef.current?.skipForward(value as number);
			} catch (error: any) {
				currentLogger.current?.error(`DVR skipForward failed: ${error?.message}`);
				handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
			}
		}

		if (id === CONTROL_ACTION.BACKWARD && sourceRef.current?.isDVR) {
			try {
				// Hacer seek en DVR
				dvrProgressManagerRef.current?.skipBackward(value as number);
			} catch (error: any) {
				currentLogger.current?.error(`DVR skipBackward failed: ${error?.message}`);
				handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
			}
		}

		if (id === CONTROL_ACTION.SEEK && !sourceRef.current?.isLive) {
			try {
				// Hacer seek en VOD
				vodProgressManagerRef.current?.seekToTime(value as number);
			} catch (error: any) {
				currentLogger.current?.error(`VOD seekToTime failed: ${error?.message}`);
				handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
			}
		}

		if (id === CONTROL_ACTION.FORWARD && !sourceRef.current?.isLive) {
			try {
				// Hacer seek en VOD
				vodProgressManagerRef.current?.skipForward(value as number);
			} catch (error: any) {
				currentLogger.current?.error(`VOD skipForward failed: ${error?.message}`);
				handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
			}
		}

		if (id === CONTROL_ACTION.BACKWARD && !sourceRef.current?.isLive) {
			try {
				// Hacer seek en VOD
				vodProgressManagerRef.current?.skipBackward(value as number);
			} catch (error: any) {
				currentLogger.current?.error(`VOD skipBackward failed: ${error?.message}`);
				handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
			}
		}

		// Actions to be saved between flavours
		if (COMMON_DATA_FIELDS.includes(id) && props?.events?.onChangeCommonData) {
			const data: ICommonData = {};

			if (id === CONTROL_ACTION.MUTE) {
				data.muted = !!value;
			} else if (id === CONTROL_ACTION.PAUSE) {
				data.paused = !!value;
			} else if (
				id === CONTROL_ACTION.SUBTITLE_INDEX &&
				typeof value === "object" &&
				value !== null
			) {
				// Subtítulo sideloaded (offline) - pasar objeto completo con uri/language
				const subtitleData = value as {
					index?: number;
					uri?: string;
					language?: string;
					label?: string;
				};
				data.subtitleIndex = subtitleData;
				data.subtitleLabel = subtitleData.label;
				data.subtitleCode = subtitleData.language;
				if (typeof subtitleData.index === "number") {
					currentSubtitleIndexRef.current = subtitleData.index;
				}
			} else if (typeof value === "number") {
				data.volume = id === CONTROL_ACTION.VOLUME ? value : undefined;
				data.audioIndex = id === CONTROL_ACTION.AUDIO_INDEX ? value : undefined;
				data.subtitleIndex = id === CONTROL_ACTION.SUBTITLE_INDEX ? value : undefined;

				// Actualizar refs locales cuando el usuario cambia desde el menú
				if (id === CONTROL_ACTION.AUDIO_INDEX) {
					currentAudioIndexRef.current = value;
					setCurrentAudioIndex(value);
				} else if (id === CONTROL_ACTION.SUBTITLE_INDEX) {
					currentSubtitleIndexRef.current = value;
					setCurrentSubtitleIndex(value);
				}

				const audioTrack = menuData?.find(
					(item: IPlayerMenuData) =>
						item.type === PLAYER_MENU_DATA_TYPE.AUDIO && item.index === value
				);
				data.audioLabel = audioTrack?.label;
				data.audioCode = audioTrack?.code;

				const subtitleTrack = menuData?.find(
					(item: IPlayerMenuData) =>
						item.type === PLAYER_MENU_DATA_TYPE.TEXT && item.index === value
				);
				data.subtitleLabel = subtitleTrack?.label;
				data.subtitleCode = subtitleTrack?.code;
			}

			props.events?.onChangeCommonData(data);
		}
	};

	const handleOnSlidingStart = (value: number) => {
		currentLogger.current?.temp(`handleOnSlidingStart: ${value}`);

		// Activar manual seeking en el progress manager correspondiente
		if (sourceRef.current?.isDVR) {
			dvrProgressManagerRef.current?.setManualSeeking(true);
		}
	};

	const handleOnSlidingComplete = (value: number) => {
		currentLogger.current?.temp(`handleOnSlidingComplete: ${value}`);

		// Desactivar manual seeking y hacer el seek
		if (sourceRef.current?.isDVR) {
			dvrProgressManagerRef.current?.setManualSeeking(false);
		}

		handleOnControlsPress(CONTROL_ACTION.SEEK, value);
	};

	/*
	 *  Handlers para los eventos
	 *
	 */

	const generateMenuDataFromCachedTracks = () => {
		if (menuDataRef.current?.length) return;
		if (!cachedAudioTracksRef.current.length && !cachedTextTracksRef.current.length) {
			currentLogger.current?.debug(
				"generateMenuDataFromCachedTracks - No cached tracks available"
			);
			return;
		}

		currentLogger.current?.info(
			`generateMenuDataFromCachedTracks - Generating from cached tracks: ` +
				`audio=${cachedAudioTracksRef.current.length}, ` +
				`text=${cachedTextTracksRef.current.length}, ` +
				`video=${cachedVideoTracksRef.current.length}`
		);

		const syntheticLoadData: OnLoadData = {
			currentTime: 0,
			duration: 0,
			naturalSize: { width: 0, height: 0, orientation: "landscape" },
			audioTracks: cachedAudioTracksRef.current,
			textTracks: cachedTextTracksRef.current,
			videoTracks: cachedVideoTracksRef.current,
		};

		const manifestExternalTracks = sourceRef.current?.currentManifest?.textTracks;

		let generatedMenuData: any;
		if (props.hooks?.mergeMenuData && typeof props.hooks.mergeMenuData === "function") {
			generatedMenuData = props.hooks.mergeMenuData(
				syntheticLoadData,
				props.languagesMapping,
				sourceRef.current?.isDASH,
				manifestExternalTracks
			);
		} else {
			generatedMenuData = mergeMenuData(
				syntheticLoadData,
				props.languagesMapping,
				sourceRef.current?.isDASH,
				undefined,
				manifestExternalTracks
			);
		}

		if (!generatedMenuData?.length) return;

		let finalAudioIndex = props.audioIndex;
		if (
			(props.audioIndex === undefined || props.audioIndex === -1) &&
			generatedMenuData &&
			props.hooks?.getUserAudioSubtitlePreferences &&
			props.hooks?.applyPreferencesFromMenuData
		) {
			const userPreferences = props.hooks.getUserAudioSubtitlePreferences();
			const appliedPreferences = props.hooks.applyPreferencesFromMenuData(
				generatedMenuData,
				userPreferences
			);
			if (appliedPreferences?.audioIndex !== undefined) {
				currentAudioIndexRef.current = appliedPreferences.audioIndex;
				setCurrentAudioIndex(appliedPreferences.audioIndex);
				finalAudioIndex = appliedPreferences.audioIndex;
			}
			if (appliedPreferences?.subtitleIndex !== undefined) {
				currentSubtitleIndexRef.current = appliedPreferences.subtitleIndex;
				setCurrentSubtitleIndex(appliedPreferences.subtitleIndex);
			}
			if (appliedPreferences) {
				props.events?.onChangePreferences?.(appliedPreferences);
			}
		}

		if ((finalAudioIndex === undefined || finalAudioIndex === -1) && generatedMenuData) {
			const firstAudio = generatedMenuData.find(
				(item: any) => item.type === PLAYER_MENU_DATA_TYPE.AUDIO
			);
			if (firstAudio && firstAudio.index !== undefined) {
				currentAudioIndexRef.current = firstAudio.index;
				setCurrentAudioIndex(firstAudio.index);
				currentLogger.current?.info(
					`generateMenuDataFromCachedTracks - Auto-selecting first audio: index=${firstAudio.index}`
				);
			}
		}

		setMenuData(generatedMenuData);
	};

	const ensureContentLoaded = (source: string) => {
		if (isContentLoadedRef.current) return;
		if (currentSourceType.current !== "content") return;

		currentLogger.current?.info(`ensureContentLoaded [${source}] - Marking content as loaded`);
		isChangingSource.current = false;
		phaseManagerRef.current.transition(PlaybackPhase.CONTENT_PLAYING, "content_loaded");
		setIsContentLoaded(true);
		if (props.events?.onStart) {
			props.events.onStart();
		}

		if (postAdTimeoutRef.current) {
			clearTimeout(postAdTimeoutRef.current);
			postAdTimeoutRef.current = null;
		}

		generateMenuDataFromCachedTracks();
	};

	const handleOnLoad = (e: OnLoadData) => {
		currentLogger.current?.info(`handleOnLoad (${sourceRef.current?.playerSource?.uri})`);
		// currentLogger.current?.temp(`handleOnLoad currentSourceType: ${currentSourceType.current}`);
		// currentLogger.current?.temp(`handleOnLoad tudumRef.current?.isPlaying ${tudumRef.current?.isPlaying}`);
		// currentLogger.current?.temp(`handleOnLoad isContentLoaded ${isContentLoaded}`);
		// currentLogger.current?.temp(`handleOnLoad duration: ${e.duration}, currentTime: ${e.currentTime}`);

		if (isPlayingAdRef.current) {
			currentLogger.current?.info(
				`handleOnLoad - Ignoring during ad playback (duration: ${e.duration}s, tracks would be from ad)`
			);
			return;
		}

		// Solo procesar onLoad para contenido principal, no para tudum
		// Usar isContentLoadedRef.current (síncrono) en lugar de isContentLoaded (state)
		// para evitar stale closures cuando el source cambia rápido (ej: LIVE_START_PROGRAM).
		if (currentSourceType.current === "content" && !isContentLoadedRef.current) {
			currentLogger.current?.debug("handleOnLoad - Processing content load");
			phaseManagerRef.current.transition(PlaybackPhase.CONTENT_STARTING, "onLoad");

			// Para VOD, establecer la duración desde el evento onLoad
			if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR && e.duration) {
				currentLogger.current?.info(
					`handleOnLoad - Setting VOD duration from load event: ${e.duration}s`
				);
				vodProgressManagerRef.current?.updatePlayerData({
					currentTime: e.currentTime || 0,
					seekableRange: { start: 0, end: e.duration },
					duration: e.duration,
					isBuffering: false,
					isPaused: paused,
				});
				// Initialize lastContentCurrentTimeRef from onLoad data (iOS: earlier than first onProgress)
				// Prevents race condition where preroll ads start before onProgress fires with startPosition
				currentLogger.current?.info(
					`handleOnLoad - onLoad e.currentTime: ${
						e.currentTime
					}s (will init lastContentCurrentTimeRef: ${e.currentTime > 1})`
				);
				if (e.currentTime > 1) {
					lastContentCurrentTimeRef.current = e.currentTime;
					currentLogger.current?.info(
						`handleOnLoad - Initializing lastContentCurrentTimeRef: ${e.currentTime}s`
					);
				}
			}

			isChangingSource.current = false;
			setIsContentLoaded(true);

			if (postAdTimeoutRef.current) {
				currentLogger.current?.debug(
					"handleOnLoad - Cancelling post-ad safety timeout (onLoad arrived)"
				);
				clearTimeout(postAdTimeoutRef.current);
				postAdTimeoutRef.current = null;
			}

			if (props.events?.onStart) {
				props.events.onStart();
			}

			// Seek inicial al cargar un live con DVR
			// Post-ad: skip checkInitialSeek si vamos al live edge (goToLive necesita seekableRange fresco).
			// Excepción: si isLiveProgramRestricted=true, el seek es a posición 0 y no depende del seekableRange.
			// El goToLive se hará desde handleOnProgress con datos frescos.
			if (
				sourceRef.current?.isDVR &&
				dvrProgressManagerRef.current &&
				(!hasAdFinishedRef.current || isLiveProgramRestrictedRef.current)
			) {
				try {
					dvrProgressManagerRef.current.checkInitialSeek(
						"player",
						isLiveProgramRestrictedRef.current
					);
				} catch (error: any) {
					currentLogger.current?.error(`DVR checkInitialSeek failed: ${error?.message}`);
					handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
				}
			}
		} else if (currentSourceType.current === "content" && isContentLoadedRef.current) {
			// iOS: onLoad puede llegar DESPUÉS de que el contenido ya estaba marcado como cargado.
			// Dos casos:
			// 1. Ads exitosas: IMA hace seek residual a posición pre-ads (~6s) al restaurar el item.
			// 2. Ads fallidas silenciosamente: IMA hace replaceCurrentItem con su propio item y
			//    al restaurar el original el player queda en currentTime=0 (inicio del DVR).
			// En ambos casos re-lanzamos goToLive para llevar el player al live edge.
			// La guarda !isLiveProgramRestricted protege el flujo PROGRAM (no queremos goToLive ahí).
			if (
				sourceRef.current?.isDVR &&
				dvrProgressManagerRef.current &&
				!isLiveProgramRestrictedRef.current
			) {
				currentLogger.current?.info(
					`handleOnLoad - iOS late onLoad in WINDOW DVR mode, re-launching goToLive to counter IMA item restore`
				);
				dvrProgressManagerRef.current.goToLive();
			}
		} else if (currentSourceType.current === "tudum") {
			currentLogger.current?.info(`handleOnLoad - Tudum loaded, duration: ${e.duration}`);
		} else if (currentSourceType.current !== "content") {
			currentLogger.current?.debug(
				`handleOnLoad - Ignoring load event (sourceType: ${currentSourceType.current}, isContentLoaded: ${isContentLoaded})`
			);
		}

		// Generar menuData con las pistas de audio/subtítulos/video.
		// Desacoplado de la guarda !isContentLoaded para que funcione también cuando
		// onLoad llega tarde (ej: Android 33 tras preroll ads, donde el fallback en
		// handleOnProgress ya marcó isContentLoaded=true pero sin datos de tracks).
		// Usar menuDataRef.current (síncrono) en lugar del state menuData para evitar
		// que un segundo onLoad en iOS (race condition) regenere menuData y re-aplique
		// pistas de audio/subtítulos mientras hay un seek en curso.
		if (currentSourceType.current === "content" && !menuDataRef.current?.length) {
			currentLogger.current?.info(
				`handleOnLoad - Generating menuData (isContentLoaded: ${isContentLoaded}, had menuData: ${!!menuData?.length})`
			);

			const manifestExternalTracks = sourceRef.current?.currentManifest?.textTracks;

			let generatedMenuData: any;
			if (props.hooks?.mergeMenuData && typeof props.hooks.mergeMenuData === "function") {
				generatedMenuData = props.hooks.mergeMenuData(
					e,
					props.languagesMapping,
					sourceRef.current?.isDASH,
					manifestExternalTracks
				);
			} else {
				generatedMenuData = mergeMenuData(
					e,
					props.languagesMapping,
					sourceRef.current?.isDASH,
					undefined,
					manifestExternalTracks
				);
			}

			currentLogger.current?.info(
				`handleOnLoad - Checking preferences (contenido sin datos de API, como directos): audioIndex=${
					props.audioIndex
				}, subtitleIndex=${
					props.subtitleIndex
				}, generatedMenuData=${!!generatedMenuData}, hasHooks=${!!props.hooks
					?.getUserAudioSubtitlePreferences}`
			);

			// Aplicar preferencias del usuario si no hay defaultAudioIndex/defaultSubtitlesIndex
			// (contenido sin datos de API, como directos)
			// Nota: -1 es el valor por defecto cuando no hay datos de API
			let finalAudioIndex = props.audioIndex;
			let finalSubtitleIndex = props.subtitleIndex;

			if (
				(props.audioIndex === undefined ||
					props.audioIndex === -1 ||
					props.subtitleIndex === undefined ||
					props.subtitleIndex === -1) &&
				generatedMenuData
			) {
				currentLogger.current?.info(
					`handleOnLoad - Checking preferences: audioIndex=${
						props.audioIndex
					}, subtitleIndex=${props.subtitleIndex}, hasHooks=${!!props.hooks
						?.getUserAudioSubtitlePreferences}`
				);

				if (
					props.hooks?.getUserAudioSubtitlePreferences &&
					props.hooks?.applyPreferencesFromMenuData
				) {
					const userPreferences = props.hooks.getUserAudioSubtitlePreferences();
					currentLogger.current?.info(
						`handleOnLoad - User preferences: ${JSON.stringify(userPreferences)}`
					);

					const appliedPreferences = props.hooks.applyPreferencesFromMenuData(
						generatedMenuData,
						userPreferences
					);

					if (
						appliedPreferences &&
						(appliedPreferences.audioIndex !== undefined ||
							appliedPreferences.subtitleIndex !== undefined)
					) {
						currentLogger.current?.info(
							`handleOnLoad - Applying user preferences from menuData: ${JSON.stringify(
								appliedPreferences
							)}`
						);
						// Actualizar los refs locales para que el menú reciba los valores correctos
						if (appliedPreferences.audioIndex !== undefined) {
							currentAudioIndexRef.current = appliedPreferences.audioIndex;
							setCurrentAudioIndex(appliedPreferences.audioIndex);
						}
						if (appliedPreferences.subtitleIndex !== undefined) {
							currentSubtitleIndexRef.current = appliedPreferences.subtitleIndex;
							setCurrentSubtitleIndex(appliedPreferences.subtitleIndex);
						}
						// Actualizar los índices finales con las preferencias aplicadas
						if (appliedPreferences.audioIndex !== undefined) {
							finalAudioIndex = appliedPreferences.audioIndex;
						}
						if (appliedPreferences.subtitleIndex !== undefined) {
							finalSubtitleIndex = appliedPreferences.subtitleIndex;
						}
						props.events?.onChangePreferences?.(appliedPreferences);
					} else {
						currentLogger.current?.debug(
							`handleOnLoad - No preferences to apply: ${JSON.stringify(
								appliedPreferences
							)}`
						);
					}
				} else {
					currentLogger.current?.warn(
						`handleOnLoad - Missing hooks for applying preferences`
					);
				}
			}

			// Fallback: si audioIndex sigue sin definir, preseleccionar la primera pista de audio
			if ((finalAudioIndex === undefined || finalAudioIndex === -1) && generatedMenuData) {
				const firstAudio = generatedMenuData.find(
					(item: any) => item.type === PLAYER_MENU_DATA_TYPE.AUDIO
				);
				if (firstAudio && firstAudio.index !== undefined) {
					currentAudioIndexRef.current = firstAudio.index;
					setCurrentAudioIndex(firstAudio.index);
					currentLogger.current?.info(
						`handleOnLoad - Auto-selecting first audio track: index=${firstAudio.index}, label=${firstAudio.label}`
					);
				}
			}

			// Actualizar menuDataRef síncronamente antes de setMenuData para que un segundo
			// onLoad de iOS que llegue inmediatamente encuentre la guarda ya establecida
			// y no regenere menuData ni re-aplique pistas de audio/subtítulos en mitad de un seek.
			menuDataRef.current = generatedMenuData;
			// Establecer menuData DESPUÉS de aplicar preferencias para que refleje la selección correcta
			setMenuData(generatedMenuData);
		}
	};

	const handleOnBuffer = (e: OnBufferData) => {
		setBuffering(!!e?.isBuffering);
	};

	const handleOnReadyForDisplay = () => {
		setBuffering(false);
	};

	const handleOnProgress = (e: OnProgressData) => {
		currentLogger.current?.debug(
			`handleOnProgress - currentSourceType: ${currentSourceType.current}, currentTime: ${e.currentTime}, seekableDuration: ${e.seekableDuration}`
		);

		// Ignorar eventos de progreso durante anuncios para evitar contaminar
		// los datos del contenido (currentTime, duration, sliderValues) con datos del anuncio
		if (isPlayingAdRef.current) {
			// iOS VOD post-ad restore window: isPlayingAdRef was kept true after ad ended
			// to block progress events with ~0 currentTime during the seek restore window.
			// Handle the restore seek here since the rest of handleOnProgress is unreachable.
			if (
				hasAdFinishedRef.current &&
				Platform.OS === "ios" &&
				!sourceRef.current?.isLive &&
				!sourceRef.current?.isDVR
			) {
				if (!postAdSeekDoneRef.current && isContentLoadedRef.current) {
					// First progress event in post-ad restore window — execute seek
					postAdSeekDoneRef.current = true;
					const savedPosition = preAdContentPositionRef.current;
					if (savedPosition > 1 && e.currentTime < savedPosition - 5) {
						currentLogger.current?.info(
							`handleOnProgress - iOS VOD post-ad restore (guarded): ${e.currentTime}s → ${savedPosition}s`
						);
						refVideoPlayer.current?.seek(savedPosition);
						// Safety timeout: force deactivate if seek never completes
						postAdRestoreSafetyTimeoutRef.current = setTimeout(() => {
							if (isPlayingAdRef.current && hasAdFinishedRef.current) {
								isPlayingAdRef.current = false;
								preAdContentPositionRef.current = -1;
								currentLogger.current?.info(
									`[NormalFlavour] Post-ad restore safety timeout (5s). isPlayingAdRef force deactivated.`
								);
							}
						}, 5000);
						return;
					} else {
						// No seek needed (already near position or savedPosition <= 1)
						isPlayingAdRef.current = false;
						preAdContentPositionRef.current = -1;
						currentLogger.current?.info(
							`handleOnProgress - Post-ad restore: no seek needed (currentTime: ${e.currentTime}s, savedPos: ${savedPosition}s). isPlayingAdRef deactivated.`
						);
						// Fall through to normal progress handling
					}
				} else if (postAdSeekDoneRef.current) {
					// Seek was issued — check if it completed
					const savedPosition = preAdContentPositionRef.current;
					if (savedPosition > 0 && e.currentTime >= savedPosition - 5) {
						// Seek completed! Deactivate guard
						isPlayingAdRef.current = false;
						preAdContentPositionRef.current = -1;
						if (postAdRestoreSafetyTimeoutRef.current) {
							clearTimeout(postAdRestoreSafetyTimeoutRef.current);
							postAdRestoreSafetyTimeoutRef.current = null;
						}
						currentLogger.current?.info(
							`[NormalFlavour] Post-ad restore complete (${e.currentTime}s ≈ target ${savedPosition}s). isPlayingAdRef deactivated.`
						);
						// Fall through to normal progress handling
					} else {
						// Still waiting for seek — block this event with ~0 currentTime
						currentLogger.current?.debug(
							`handleOnProgress: Blocking post-ad restore - currentTime: ${e.currentTime}s, target: ${savedPosition}s`
						);
						return;
					}
				} else {
					// Waiting for isContentLoaded — keep blocking
					currentLogger.current?.debug(
						`handleOnProgress: Blocking post-ad (waiting for content load) - currentTime: ${e.currentTime}s`
					);
					return;
				}
			} else {
				// Normal ad playback — block everything
				currentLogger.current?.debug(
					`handleOnProgress: Skipping progress during ad - currentTime: ${e.currentTime}, seekableDuration: ${e.seekableDuration}`
				);
				return;
			}
		}

		if (typeof e.currentTime === "number" && currentTime !== e.currentTime) {
			// Trigger para el cambio de estado
			setCurrentTime(e.currentTime);
		}

		// Solo procesar progreso para contenido principal, no para tudum
		if (currentSourceType.current === "content") {
			if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR) {
				// Para VOD: Preferir duración de onLoad, pero usar seekableDuration como fallback.
				// ANTES de que el anuncio termine, NO confiar en seekableDuration porque puede
				// contener la duración del preroll ad (ej: 20s) en lugar del contenido real.
				// DESPUÉS del anuncio (hasAdFinishedRef) o después de onLoad (isContentLoaded),
				// podemos confiar en seekableDuration como duración del VOD.
				const currentDuration = vodProgressManagerRef.current?.duration || 0;
				let effectiveDuration = currentDuration;

				if (currentDuration === 0 && e.seekableDuration > 0) {
					if (isContentLoaded || hasAdFinishedRef.current) {
						// Podemos confiar en seekableDuration:
						// - onLoad ya se recibió, o
						// - el anuncio ya terminó (el player nativo ya reproduce contenido real)
						effectiveDuration = e.seekableDuration;
						currentLogger.current?.info(
							`handleOnProgress - Initializing VOD duration from seekableDuration: ${
								e.seekableDuration
							}s (${isContentLoaded ? "post-onLoad" : "post-ad"} fallback)`
						);
						// En Android 33, handleOnLoad puede no dispararse tras preroll ads.
						// Si el anuncio ya terminó y tenemos duración válida, marcar contenido como cargado
						// para que los controles (overlay) muestren la duración correctamente.
						if (!isContentLoaded && hasAdFinishedRef.current) {
							ensureContentLoaded("onProgress-VOD-post-ad");
						}
					} else {
						// Ni onLoad ni fin de anuncio - seekableDuration podría ser la del anuncio
						currentLogger.current?.debug(
							`handleOnProgress - Skipping seekableDuration ${e.seekableDuration}s (pre-ad/pre-onLoad, could be ad duration)`
						);
					}
				}

				if (effectiveDuration > 0) {
					vodProgressManagerRef.current?.updatePlayerData({
						currentTime: e.currentTime,
						seekableRange: {
							start: 0,
							end: effectiveDuration,
						},
						duration: effectiveDuration,
						isBuffering: isBuffering,
						isPaused: paused,
					});
				} else {
					vodProgressManagerRef.current?.updatePlayerData({
						currentTime: e.currentTime,
						seekableRange: { start: 0, end: 0 },
						duration: undefined,
						isBuffering: isBuffering,
						isPaused: paused,
					});
				}

				// Track last content position for post-ad restore (iOS)
				// Guard: don't overwrite a meaningful position (e.g. set from handleOnLoad at startPosition)
				// with a near-zero value from an early progress event before the seek completes.
				// This prevents the race condition where progress fires at ~0s between onLoad and AD_BREAK_STARTED.
				if (e.currentTime > 1 || lastContentCurrentTimeRef.current <= 1) {
					lastContentCurrentTimeRef.current = e.currentTime;
				}

				// iOS VOD post-ad position restore
				if (
					Platform.OS === "ios" &&
					hasAdFinishedRef.current &&
					!postAdSeekDoneRef.current &&
					isContentLoadedRef.current &&
					effectiveDuration > 0
				) {
					postAdSeekDoneRef.current = true;
					const savedPosition = preAdContentPositionRef.current;
					if (savedPosition > 1 && e.currentTime < savedPosition - 5) {
						currentLogger.current?.info(
							`handleOnProgress - iOS VOD post-ad position restore: ${e.currentTime}s → ${savedPosition}s`
						);
						refVideoPlayer.current?.seek(savedPosition);
						preAdContentPositionRef.current = -1;
						return;
					}
					preAdContentPositionRef.current = -1;
				}
			}

			if (sourceRef.current?.isDVR) {
				dvrProgressManagerRef.current?.updatePlayerData({
					currentTime: e.currentTime,
					duration: e.seekableDuration,
					seekableRange: { start: 0, end: e.seekableDuration },
					isBuffering: isBuffering,
					isPaused: paused,
				});

				if (!isContentLoaded && hasAdFinishedRef.current && e.seekableDuration > 0) {
					ensureContentLoaded("onProgress-DVR-post-ad");
				}

				// Post-ad: seek al live edge con datos frescos de seekableRange
				if (
					isContentLoadedRef.current &&
					hasAdFinishedRef.current &&
					!postAdSeekDoneRef.current &&
					e.seekableDuration > 0
				) {
					postAdSeekDoneRef.current = true;
					if (!isLiveProgramRestrictedRef.current) {
						currentLogger.current?.info(
							`handleOnProgress - Post-ad goToLive (seekableDuration: ${e.seekableDuration})`
						);
						dvrProgressManagerRef.current?.goToLive();
					}
				}

				// iOS safety guard: si el goToLive inicial se perdió (IMA interfirió silenciosamente
				// sin emitir ningún evento de ad), el player queda en el inicio del DVR con un offset
				// enorme. Detectamos esto en el primer onProgress post-carga y corregimos la posición.
				// Solo aplica en iOS, solo una vez por carga (iosInitialLiveEdgeGuardDoneRef), y solo
				// en modo WINDOW (no PROGRAM). El umbral de 300s evita falsos positivos con seeking manual.
				if (
					Platform.OS === "ios" &&
					isContentLoadedRef.current &&
					!iosInitialLiveEdgeGuardDoneRef.current &&
					!isLiveProgramRestrictedRef.current &&
					e.seekableDuration > 0
				) {
					iosInitialLiveEdgeGuardDoneRef.current = true;
					const sliderValues = dvrProgressManagerRef.current?.getSliderValues();
					const liveEdgeOffset = sliderValues?.liveEdgeOffset ?? 0;
					if (liveEdgeOffset > 300) {
						currentLogger.current?.info(
							`handleOnProgress - iOS initial live edge guard: player at DVR start (offset: ${liveEdgeOffset}s), re-launching goToLive`
						);
						dvrProgressManagerRef.current?.goToLive();
					}
				}
			}

			if (sourceRef.current?.isLive && !sourceRef.current?.isDVR) {
				if (!isContentLoaded && hasAdFinishedRef.current) {
					ensureContentLoaded("onProgress-LIVE-post-ad");
				}
			}

			if (!sourceRef.current?.isLive && props?.events?.onChangeCommonData) {
				const vodDuration = vodProgressManagerRef.current?.duration || 0;
				props.events.onChangeCommonData({
					time: e.currentTime,
					duration: vodDuration, // Usar la duración guardada para VOD
				});
			}
		} else {
			currentLogger.current?.debug(
				`handleOnProgress: Ignoring progress for ${currentSourceType.current} - currentTime: ${e.currentTime}, duration: ${e.seekableDuration}`
			);
		}
	};

	const restoreSubtitleAfterAd = () => {
		const subtitleIdx = currentSubtitleIndexRef.current;
		if (subtitleIdx === undefined || subtitleIdx === null) {
			setSelectedTextTrack({ type: SelectedTrackType.DISABLED });
		} else if (typeof subtitleIdx === "number") {
			if (subtitleIdx === -1) {
				setSelectedTextTrack({ type: SelectedTrackType.DISABLED });
			} else {
				setSelectedTextTrack({ type: SelectedTrackType.INDEX, value: subtitleIdx });
			}
		} else if (subtitleIdx.language) {
			setSelectedTextTrack({ type: SelectedTrackType.LANGUAGE, value: subtitleIdx.language });
		} else {
			setSelectedTextTrack({ type: SelectedTrackType.DISABLED });
		}
	};

	const handleOnReceiveAdEvent = (e: OnReceiveAdEventData) => {
		currentLogger.current?.debug(`[ADS] onReceiveAdEvent: ${e.event}`, {
			event: e.event,
			data: e.data,
		});

		// Usar AD_BREAK para manejar pods de múltiples ads correctamente
		// AD_BREAK_STARTED se emite al inicio del pod, AD_BREAK_ENDED al final
		if (e.event === "AD_BREAK_STARTED" || e.event === "STARTED") {
			currentLogger.current?.info(`[ADS] Ad break/ad started: ${e.event}`);
			isPlayingAdRef.current = true;
			phaseManagerRef.current.transition(PlaybackPhase.AD_PREROLL, "AD_BREAK_STARTED");
			setIsPlayingAd(true);
			// Deshabilitar subtítulos durante anuncios para evitar mostrarlos sobre el ad
			setSelectedTextTrack({ type: SelectedTrackType.DISABLED });
			// Notificar cambio de estado de anuncios
			props.events?.onChangeCommonData?.({ isPlayingAd: true });
			props.events?.onAdPlayingChange?.(true);
			// Save VOD content position before ad takes over (iOS only)
			if (Platform.OS === "ios" && !sourceRef.current?.isLive && !sourceRef.current?.isDVR) {
				// Use lastContentCurrentTimeRef if it has a meaningful value (updated by onProgress or onLoad).
				// Fallback: use sourceRef startPosition (immutable, set once at source creation) divided by 1000
				// because startPosition is in ms and refs are in seconds.
				// NOTE: props.playerProgress?.currentTime is NOT safe as fallback because it's dynamically
				// updated by the parent and may already reflect near-zero progress from the native player.
				const sourceStartPositionSec = sourceRef.current?.playerSource?.startPosition
					? sourceRef.current.playerSource.startPosition / 1000
					: 0;
				const capturedPosition =
					lastContentCurrentTimeRef.current > 1
						? lastContentCurrentTimeRef.current
						: sourceStartPositionSec;
				preAdContentPositionRef.current = capturedPosition;
				currentLogger.current?.info(
					`[ADS] Saved pre-ad VOD position: ${preAdContentPositionRef.current}s ` +
						`(source: ${
							lastContentCurrentTimeRef.current > 1
								? "lastContentCurrentTimeRef"
								: "sourceStartPosition"
						}, lastContentCurrentTimeRef=${
							lastContentCurrentTimeRef.current
						}, sourceStartPosition=${sourceStartPositionSec})`
				);
			}
			if (e.event === "STARTED") {
				onAdStarted(e);
			}
		} else if (
			e.event === "AD_BREAK_ENDED" ||
			e.event === "ALL_ADS_COMPLETED" ||
			e.event === "CONTENT_RESUME_REQUESTED"
		) {
			// AD_BREAK_ENDED: fin del pod de anuncios
			// ALL_ADS_COMPLETED: todos los anuncios han terminado
			// CONTENT_RESUME_REQUESTED: el SDK solicita reanudar el contenido
			currentLogger.current?.info(`[ADS] Ad break finished: ${e.event}`);
			// For iOS VOD with a saved position, keep isPlayingAdRef=true to block
			// progress events with ~0 currentTime during the post-ad seek restore window.
			// handleOnProgress will deactivate it when the seek completes or via safety timeout.
			const keepAdGuardForRestore =
				Platform.OS === "ios" &&
				!sourceRef.current?.isLive &&
				!sourceRef.current?.isDVR &&
				preAdContentPositionRef.current > 1;
			if (!keepAdGuardForRestore) {
				isPlayingAdRef.current = false;
			} else {
				currentLogger.current?.info(
					`[ADS] Keeping isPlayingAdRef=true for iOS VOD post-ad restore (savedPos: ${preAdContentPositionRef.current}s)`
				);
			}
			hasAdFinishedRef.current = true;
			phaseManagerRef.current.transition(PlaybackPhase.CONTENT_STARTING, "ad_finished");
			setIsPlayingAd(false);
			// Restaurar el estado de subtítulos que tenía el usuario antes del ad
			restoreSubtitleAfterAd();
			// Notificar cambio de estado de anuncios
			props.events?.onChangeCommonData?.({ isPlayingAd: false });
			props.events?.onAdPlayingChange?.(false);

			if (!isContentLoadedRef.current && currentSourceType.current === "content") {
				currentLogger.current?.info(
					`[ADS] Starting post-ad safety timeout (3s) for isContentLoaded`
				);
				postAdTimeoutRef.current = setTimeout(() => {
					ensureContentLoaded("post-ad-timeout");
				}, 3000);
			}
		} else if (e.event === "ERROR") {
			currentLogger.current?.error("[ADS] Ad error", { data: e.data });
			// En caso de error, asegurar que los controles vuelvan
			isPlayingAdRef.current = false;
			hasAdFinishedRef.current = true;
			phaseManagerRef.current.transition(PlaybackPhase.CONTENT_STARTING, "ad_error");
			setIsPlayingAd(false);
			// Restaurar el estado de subtítulos que tenía el usuario antes del ad
			restoreSubtitleAfterAd();
			// Notificar cambio de estado de anuncios
			props.events?.onChangeCommonData?.({ isPlayingAd: false });
			props.events?.onAdPlayingChange?.(false);

			if (!isContentLoadedRef.current && currentSourceType.current === "content") {
				currentLogger.current?.info(
					`[ADS] Starting post-ad-error safety timeout (3s) for isContentLoaded`
				);
				postAdTimeoutRef.current = setTimeout(() => {
					ensureContentLoaded("post-ad-error-timeout");
				}, 3000);
			}
		}
	};

	const handleOnAudioTracks = (e: OnAudioTracksData) => {
		if (isPlayingAdRef.current) {
			currentLogger.current?.debug(
				`handleOnAudioTracks - Ignoring during ad (${e.audioTracks?.length} tracks)`
			);
			return;
		}
		if (currentSourceType.current === "content" && e.audioTracks?.length) {
			currentLogger.current?.info(
				`handleOnAudioTracks - Caching ${e.audioTracks.length} audio tracks`
			);
			cachedAudioTracksRef.current = e.audioTracks;
		}
	};

	const handleOnTextTracks = (e: OnTextTracksData) => {
		if (isPlayingAdRef.current) {
			currentLogger.current?.debug(
				`handleOnTextTracks - Ignoring during ad (${e.textTracks?.length} tracks)`
			);
			return;
		}
		if (currentSourceType.current === "content" && e.textTracks?.length) {
			currentLogger.current?.info(
				`handleOnTextTracks - Caching ${e.textTracks.length} text tracks`
			);
			cachedTextTracksRef.current = e.textTracks as OnLoadData["textTracks"];
		}
	};

	const handleOnVideoTracks = (e: OnVideoTracksData) => {
		if (isPlayingAdRef.current) {
			currentLogger.current?.debug(
				`handleOnVideoTracks - Ignoring during ad (${e.videoTracks?.length} tracks)`
			);
			return;
		}
		if (currentSourceType.current === "content" && e.videoTracks?.length) {
			currentLogger.current?.info(
				`handleOnVideoTracks - Caching ${e.videoTracks.length} video tracks`
			);
			cachedVideoTracksRef.current = e.videoTracks;
		}
	};

	const handleOnEnd = () => {
		currentLogger.current?.debug(
			`handleOnEnd: currentSourceType ${currentSourceType.current}, isAutoNext: ${props.isAutoNext}`
		);

		if (currentSourceType.current === "tudum") {
			// Acaba la reproducción del Tudum externo
			currentLogger.current?.debug("handleOnEnd: Tudum finished, switching to main content");
			isChangingSource.current = true;
			switchFromTudumToContent();
		} else if (currentSourceType.current === "content" && props.events?.onEnd) {
			// Termina el contenido principal
			currentLogger.current?.debug(
				"handleOnEnd: Content finished, preparing for possible auto next"
			);

			// Preparar tudum para salto automático antes de notificar
			if (tudumRef.current) {
				tudumRef.current.prepareForAutoNext();
			}

			props.events.onEnd();
		} else {
			currentLogger.current?.warn(
				`handleOnEnd: Unknown state - currentSourceType: ${
					currentSourceType.current
				}, hasOnEnd: ${!!props.events?.onEnd}`
			);
		}
	};

	const handleOnVideoError = (e: OnVideoErrorData) => {
		currentLogger.current?.error(
			`handleOnVideoError: ${JSON.stringify(e)} - currentSourceType: ${
				currentSourceType.current
			}`
		);

		// [OFFLINE] Ignore network errors when playing offline content
		// Error code -1009 is NSURLErrorNotConnectedToInternet
		// These errors come from analytics/thumbnails trying to connect, not from the video itself
		const isNetworkError = e.error?.code === -1009 || e.error?.domain === "NSURLErrorDomain";
		const isOfflinePlayback = props.playOffline || sourceRef.current?.isDownloaded;

		if (isNetworkError && isOfflinePlayback) {
			currentLogger.current?.warn(
				`[OFFLINE] Ignoring network error during offline playback: ${e.error?.localizedDescription}`
			);
			return null; // Don't propagate network errors during offline playback
		}

		const playerError = mapVideoErrorToPlayerError(e);

		if (props.events?.onError && typeof props.events.onError === "function") {
			props.events.onError(playerError);
		}

		return playerError;
	};

	const handleOnInternalError = (error: BaseError | PlayerError) => {
		currentLogger.current?.error(`handleOnInternalError: ${JSON.stringify(error)}`);

		if (props.events?.onError && typeof props.events.onError === "function") {
			props.events.onError(error as unknown as PlayerError);
		}

		return false;
	};

	// Hook para los plugins de analíticas
	const { videoEvents, analyticsEvents } = useVideoAnalytics({
		plugins: props.features?.analyticsConfig || [],
		onInternalError: handleOnInternalError,
	});

	/*
	 *  Render
	 *
	 */

	return (
		<View style={styles.container}>
			{videoSource ? (
				<View
					style={{
						...styles.playerWrapper,
						paddingHorizontal: Math.max(insets.left, insets.right),
					}}
				>
					<Video
						// @ts-ignore
						ref={refVideoPlayer}
						style={[
							styles.player,
							isLandscapePlayer ? styles.playerFullHeight : styles.playerFullWidth,
						]}
						// @ts-ignore
						source={videoSource}
						// @ts-ignore
						drm={drm.current}
						// @ts-ignore
						youbora={youboraForVideo.current}
						playOffline={!!props.playOffline}
						multiSession={props.playerProgress?.liveValues?.multiSession}
						disableDisconnectError={true}
						debug={{
							enable: true,
							thread: true,
						}}
						bufferConfig={{
							minBufferMs: 15000,
							maxBufferMs: 50000,
							bufferForPlaybackMs: 2500,
							bufferForPlaybackAfterRebufferMs: 5000,
							backBufferDurationMs: 120000,
							cacheSizeMB: 50,
							live: {
								targetOffsetMs: 25000,
							},
						}}
						adTagUrl={props?.playerAds?.adTagUrl}
						allowsExternalPlayback={true}
						//volume={10}
						controls={false}
						ignoreSilentSwitch="ignore"
						showNotificationControls={true}
						resizeMode="cover"
						posterResizeMode="cover"
						minLoadRetryCount={3}
						hideShutterView={true}
						muted={muted}
						paused={paused}
						rate={speedRate}
						maxBitRate={maxBitRate}
						//pictureInPicture (ios)
						playInBackground={isAirplayConnected}
						playWhenInactive={isAirplayConnected}
						poster={props?.playerMetadata?.poster}
						preventsDisplaySleepDuringVideoPlayback={!isAirplayConnected}
						progressUpdateInterval={1000}
						selectedVideoTrack={
							tudumRef.current?.isPlaying ? undefined : selectedVideoTrack
						}
						selectedAudioTrack={
							tudumRef.current?.isPlaying ? undefined : selectedAudioTrack
						}
						selectedTextTrack={
							tudumRef.current?.isPlaying ||
							(typeof selectedTextTrack?.value === "number" &&
								selectedTextTrack?.value < 0)
								? undefined
								: selectedTextTrack
						}
						subtitleStyle={props.subtitleStyle}
						textTracks={
							// iOS OFFLINE HLS SUBTITLES:
							// For iOS offline HLS content (.movpkg), we DON'T pass sideloaded textTracks.
							// Instead, subtitles are embedded within the HLS asset during download using
							// AVAggregateAssetDownloadTask with allMediaSelections (see DownloadsModule2.swift).
							// The native player selects embedded subtitles via AVMediaSelection.
							// See: Apple WWDC 2020 Session 10655 "Discover how to download and play HLS offline"
							//
							// For Android and iOS online playback, we use sideloaded VTT files (offlineTextTracks).
							// During ads: remove textTracks entirely - selectedTextTrack=DISABLED is ignored by
							// native iOS when sideloaded tracks are present.
							isPlayingAd ||
							(Platform.OS === "ios" && sourceRef.current?.isDownloaded)
								? undefined
								: offlineTextTracks
						}
						// Eventos combinados: originales + analytics
						onLoadStart={videoEvents.onLoadStart}
						onLoad={combineEventHandlers(handleOnLoad, videoEvents.onLoad)}
						onProgress={combineEventHandlers(handleOnProgress, videoEvents.onProgress)}
						onEnd={combineEventHandlers(handleOnEnd, videoEvents.onEnd)}
						onError={combineEventHandlers(handleOnVideoError, videoEvents.onError)}
						onReadyForDisplay={combineEventHandlers(
							handleOnReadyForDisplay,
							videoEvents.onReadyForDisplay
						)}
						onReceiveAdEvent={combineEventHandlers(
							handleOnReceiveAdEvent,
							videoEvents.onReceiveAdEvent
						)}
						onBuffer={combineEventHandlers(handleOnBuffer, videoEvents.onBuffer)}
						onSeek={videoEvents.onSeek}
						onPlaybackStateChanged={videoEvents.onPlaybackStateChanged}
						onPlaybackRateChange={videoEvents.onPlaybackRateChange}
						onVolumeChange={videoEvents.onVolumeChange}
						onAudioTracks={combineEventHandlers(
							handleOnAudioTracks,
							videoEvents.onAudioTracks
						)}
						onTextTracks={combineEventHandlers(
							handleOnTextTracks,
							videoEvents.onTextTracks
						)}
						onVideoTracks={combineEventHandlers(
							handleOnVideoTracks,
							videoEvents.onVideoTracks
						)}
						onBandwidthUpdate={videoEvents.onBandwidthUpdate}
						onAspectRatio={videoEvents.onAspectRatio}
						onTimedMetadata={videoEvents.onTimedMetadata}
						onAudioBecomingNoisy={videoEvents.onAudioBecomingNoisy}
						onIdle={videoEvents.onIdle}
						onExternalPlaybackChange={videoEvents.onExternalPlaybackChange}
						onFullscreenPlayerWillPresent={videoEvents.onFullscreenPlayerWillPresent}
						onFullscreenPlayerDidPresent={videoEvents.onFullscreenPlayerDidPresent}
						onFullscreenPlayerWillDismiss={videoEvents.onFullscreenPlayerWillDismiss}
						onFullscreenPlayerDidDismiss={videoEvents.onFullscreenPlayerDidDismiss}
					/>
				</View>
			) : null}

			{isAirplayConnected ? (
				<Suspense fallback={props.components?.loader}>
					<BackgroundPoster poster={props.playerMetadata?.poster} />
				</Suspense>
			) : null}

			{!isPlayingAd && !tudumRef.current?.isPlaying ? (
				<Overlay
					preloading={isBuffering}
					thumbnailsMetadata={sourceRef.current?.currentManifest?.thumbnailMetadata}
					avoidTimelineThumbnails={props.avoidTimelineThumbnails}
					alwaysVisible={isAirplayConnected}
					isChangingSource={isChangingSource.current}
					isContentLoaded={isContentLoaded}
					menuData={menuData}
					videoIndex={videoQualityIndex.current}
					audioIndex={currentAudioIndex ?? props.audioIndex}
					subtitleIndex={currentSubtitleIndex ?? props.subtitleIndex}
					speedRate={speedRate}
					// Nuevas Props Agrupadas
					playerMetadata={props.playerMetadata}
					playerProgress={{
						...props.playerProgress,
						currentTime: currentTime,
						duration: sliderValues?.duration || 0,
						isBuffering: isBuffering,
						isContentLoaded: isContentLoaded,
						isChangingSource: isChangingSource.current,
						isDVR: sourceRef.current?.isDVR,
						isLive: sourceRef.current?.isLive,
						isPaused: paused,
						isMuted: muted,
						sliderValues: sliderValues,
						liveValues:
							dvrPlaybackType !== undefined
								? {
										...props.playerProgress?.liveValues,
										playbackType: dvrPlaybackType,
								  }
								: props.playerProgress?.liveValues,
					}}
					playerAnalytics={props.playerAnalytics}
					playerTimeMarkers={props.playerTimeMarkers}
					playerAds={props.playerAds}
					// Custom Components
					components={props.components}
					// Events
					events={{
						...props.events,
						onPress: handleOnControlsPress,
						onSlidingStart: handleOnSlidingStart,
						onSlidingComplete: handleOnSlidingComplete,
					}}
				/>
			) : null}
		</View>
	);
}

export default NormalFlavour;
