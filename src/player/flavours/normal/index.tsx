import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useAirplayConnectivity } from "react-airplay";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	type OnBufferData,
	type OnProgressData,
	type OnVideoErrorData,
} from "../../../specs/VideoNativeComponent";

import { type OnLoadData, type OnReceiveAdEventData } from "../../../types/events";

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

import { PlayerError, handleErrorException, mapVideoErrorToPlayerError } from "../../core/errors";

import { useIsLandscape } from "../common/hooks";

import { useIsBuffering } from "../../core/buffering";

import { mergeMenuData, onAdStarted } from "../../utils";

import { nativeManager } from "../../features/offline/managers/NativeManager";

import { type onSourceChangedProps, SourceClass } from "../../modules/source";

import { TudumClass } from "../../modules/tudum";

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
	const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);

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

	// Track current audio/subtitle indices (para el menú)
	const currentAudioIndexRef = useRef<number | undefined>(props.audioIndex);
	const currentSubtitleIndexRef = useRef<number | undefined>(props.subtitleIndex);

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
		// currentLogger.current?.temp(`useEffect manifests - isAutoNext: ${props.isAutoNext}`);
		// currentLogger.current?.temp(`useEffect manifests - tudumRef.current ${tudumRef.current} - isReady ${tudumRef.current?.isReady}`);
		// currentLogger.current?.temp(`useEffect manifests - sourceRef.current ${sourceRef.current} - isReady ${sourceRef.current?.isReady}`);

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

			// Reset completo solo para VOD
			currentSourceType.current = null;
			pendingContentSource.current = null;
			setSliderValues(undefined);
			setIsContentLoaded(false);

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
				`switchFromTudumToContent - pendingContentSource.current ${JSON.stringify(pendingContentSource.current)}`
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
				`onSourceChanged - pendingContentSource.current ${JSON.stringify(pendingContentSource.current)}`
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
			const effectivePlayOffline = props.playOffline || sourceRef.current?.isDownloaded;
			console.log(`[Player] (Normal Flavour) [OFFLINE DEBUG] setPlayerSource:`);
			console.log(
				`[Player] (Normal Flavour) [OFFLINE DEBUG]   - props.playOffline: ${props.playOffline}`
			);
			console.log(
				`[Player] (Normal Flavour) [OFFLINE DEBUG]   - sourceRef.current?.isDownloaded: ${sourceRef.current?.isDownloaded}`
			);
			console.log(
				`[Player] (Normal Flavour) [OFFLINE DEBUG]   - effectivePlayOffline (sent to Video): ${effectivePlayOffline}`
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
			} else {
				// Clear offline tracks if not in offline mode
				setOfflineTextTracks(undefined);
			}

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

			currentLogger.current?.info(
				`setPlayerSource - Setting sourceRef content: ${JSON.stringify(sourceRef.current.playerSource)}`
			);
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

			// Solo actualizar sliderValues si estamos reproduciendo contenido, no tudum
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
				});

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
			});
			currentLogger.current?.info("DVR Progress Manager initialized");
		}
	}, [
		handleOnProgressUpdate,
		handleOnSeekRequest,
		handleOnDVRModeChange,
		handleOnDVRProgramChange,
	]);

	useEffect(() => {
		return () => {
			if (vodProgressManagerRef.current) {
				vodProgressManagerRef.current.destroy();
			}
			if (dvrProgressManagerRef.current) {
				dvrProgressManagerRef.current.destroy();
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
					// Android o iOS online: usar VTT sideloaded con URI
					// On iOS offline playback (non-HLS), use the resolved path from offlineTextTracks
					// instead of the menuData path (which may have stale UUID)
					let resolvedUri = subtitleData.uri;
					if (
						Platform.OS === "ios" &&
						offlineTextTracks &&
						offlineTextTracks.length > 0 &&
						subtitleData.language
					) {
						const resolvedTrack = offlineTextTracks.find(
							track => track.language === subtitleData.language
						);
						if (resolvedTrack?.uri) {
							console.log(
								`[Player] (Normal Flavour) [OFFLINE DEBUG] Using resolved iOS path for ${subtitleData.language}: ${resolvedTrack.uri}`
							);
							resolvedUri = resolvedTrack.uri;
						}
					}

					currentLogger.current?.info(
						`handleOnControlsPress: Setting sideloaded subtitle - uri: ${resolvedUri}, language: ${subtitleData.language}`
					);
					if (resolvedUri) {
						setSelectedTextTrack({
							type: SelectedTrackType.TITLE,
							value: resolvedUri,
						});
					} else if (typeof subtitleData.index === "number") {
						setSelectedTextTrack({
							type: SelectedTrackType.INDEX,
							value: subtitleData.index,
						});
					}
				}
			} else if (typeof value === "number") {
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

		if (id === CONTROL_ACTION.SPEED_RATE && typeof value === "number") {
			setSpeedRate(value);
		}

		if (id === CONTROL_ACTION.LIVE_START_PROGRAM && sourceRef.current?.isDVR) {
			const timestamp = props.events?.onLiveStartProgram?.();
			currentLogger.current?.temp(
				`handleOnControlsPress: ${id} (${value}) - timestamp: ${timestamp}`
			);

			if (typeof timestamp === "number") {
				isChangingSource.current = true;
				setVideoSource(undefined);
				setIsContentLoaded(false);
				setBuffering(true);
				setIsLiveProgramRestricted(true);

				if (sourceRef.current) {
					sourceRef.current.changeDvrUriParameters(timestamp);
				}

				if (dvrProgressManagerRef.current) {
					dvrProgressManagerRef.current?.reset();
					dvrProgressManagerRef.current?.setPlaybackType(DVR_PLAYBACK_TYPE.PROGRAM);
				}

				setTimeout(() => {
					setVideoSource(sourceRef.current?.playerSource!);
				}, 100);
			}
		}

		if (id === CONTROL_ACTION.LIVE && sourceRef.current?.isDVR) {
			if (isLiveProgramRestricted) {
				try {
					isChangingSource.current = true;
					setVideoSource(undefined);
					setIsContentLoaded(false);
					setBuffering(true);
					setIsLiveProgramRestricted(false);

					if (sourceRef.current) {
						sourceRef.current.reloadDvrStream();
					}

					setTimeout(() => {
						setVideoSource(sourceRef.current?.playerSource!);
						dvrProgressManagerRef.current?.reset();
					}, 100);
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
				} else if (id === CONTROL_ACTION.SUBTITLE_INDEX) {
					currentSubtitleIndexRef.current = value;
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

	const handleOnLoad = (e: OnLoadData) => {
		currentLogger.current?.info(`handleOnLoad (${sourceRef.current?.playerSource?.uri})`);
		// currentLogger.current?.temp(`handleOnLoad currentSourceType: ${currentSourceType.current}`);
		// currentLogger.current?.temp(`handleOnLoad tudumRef.current?.isPlaying ${tudumRef.current?.isPlaying}`);
		// currentLogger.current?.temp(`handleOnLoad isContentLoaded ${isContentLoaded}`);
		// currentLogger.current?.temp(`handleOnLoad duration: ${e.duration}, currentTime: ${e.currentTime}`);

		// Solo procesar onLoad para contenido principal, no para tudum
		if (currentSourceType.current === "content" && !isContentLoaded) {
			currentLogger.current?.debug("handleOnLoad - Processing content load");

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
			}

			isChangingSource.current = false;
			setIsContentLoaded(true);

			if (props.events?.onStart) {
				props.events.onStart();
			}

			let generatedMenuData: any;
			if (props.hooks?.mergeMenuData && typeof props.hooks.mergeMenuData === "function") {
				generatedMenuData = props.hooks.mergeMenuData(
					e,
					props.languagesMapping,
					sourceRef.current?.isDASH
				);
			} else {
				generatedMenuData = mergeMenuData(
					e,
					props.languagesMapping,
					sourceRef.current?.isDASH
				);
			}

			currentLogger.current?.info(
				`handleOnLoad - Checking preferences (contenido sin datos de API, como directos): audioIndex=${props.audioIndex}, subtitleIndex=${props.subtitleIndex}, generatedMenuData=${!!generatedMenuData}, hasHooks=${!!props.hooks?.getUserAudioSubtitlePreferences}`
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
					`handleOnLoad - Checking preferences: audioIndex=${props.audioIndex}, subtitleIndex=${props.subtitleIndex}, hasHooks=${!!props.hooks?.getUserAudioSubtitlePreferences}`
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
							`handleOnLoad - Applying user preferences from menuData: ${JSON.stringify(appliedPreferences)}`
						);
						// Actualizar los refs locales para que el menú reciba los valores correctos
						if (appliedPreferences.audioIndex !== undefined) {
							currentAudioIndexRef.current = appliedPreferences.audioIndex;
						}
						if (appliedPreferences.subtitleIndex !== undefined) {
							currentSubtitleIndexRef.current = appliedPreferences.subtitleIndex;
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
							`handleOnLoad - No preferences to apply: ${JSON.stringify(appliedPreferences)}`
						);
					}
				} else {
					currentLogger.current?.warn(
						`handleOnLoad - Missing hooks for applying preferences`
					);
				}
			}

			// Establecer menuData DESPUÉS de aplicar preferencias para que refleje la selección correcta
			setMenuData(generatedMenuData);
			// Seek inicial al cargar un live con DVR
			if (sourceRef.current?.isDVR && dvrProgressManagerRef.current) {
				try {
					dvrProgressManagerRef.current.checkInitialSeek(
						"player",
						isLiveProgramRestricted
					);
				} catch (error: any) {
					currentLogger.current?.error(`DVR checkInitialSeek failed: ${error?.message}`);
					handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
				}
			}
		} else if (currentSourceType.current === "tudum") {
			currentLogger.current?.info(`handleOnLoad - Tudum loaded, duration: ${e.duration}`);
		} else {
			currentLogger.current?.debug(
				`handleOnLoad - Ignoring load event (sourceType: ${currentSourceType.current}, isContentLoaded: ${isContentLoaded})`
			);
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

		if (typeof e.currentTime === "number" && currentTime !== e.currentTime) {
			// Trigger para el cambio de estado
			setCurrentTime(e.currentTime);
		}

		// Solo procesar progreso para contenido principal, no para tudum
		if (currentSourceType.current === "content") {
			if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR) {
				// Para VOD: NO actualizar duration en onProgress, mantener la que se estableció en onLoad
				const currentDuration = vodProgressManagerRef.current?.duration || 0;
				vodProgressManagerRef.current?.updatePlayerData({
					currentTime: e.currentTime,
					seekableRange: {
						start: 0,
						end: currentDuration > 0 ? currentDuration : e.seekableDuration,
					},
					duration: currentDuration, // Mantener duración existente
					isBuffering: isBuffering,
					isPaused: paused,
				});
			}

			if (sourceRef.current?.isDVR) {
				dvrProgressManagerRef.current?.updatePlayerData({
					currentTime: e.currentTime,
					duration: e.seekableDuration,
					seekableRange: { start: 0, end: e.seekableDuration },
					isBuffering: isBuffering,
					isPaused: paused,
				});
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

	const handleOnReceiveAdEvent = (e: OnReceiveAdEventData) => {
		currentLogger.current?.debug(`[ADS] onReceiveAdEvent: ${e.event}`, {
			event: e.event,
			data: e.data,
		});

		if (e.event === "STARTED") {
			currentLogger.current?.info("[ADS] Ad started");
			setIsPlayingAd(true);
			onAdStarted(e);
		} else if (
			e.event === "COMPLETED" ||
			e.event === "ALL_ADS_COMPLETED" ||
			e.event === "SKIPPED" ||
			e.event === "USER_CLOSE"
		) {
			currentLogger.current?.info(`[ADS] Ad finished: ${e.event}`);
			setIsPlayingAd(false);
		} else if (e.event === "ERROR") {
			currentLogger.current?.error("[ADS] Ad error", { data: e.data });
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
				`handleOnEnd: Unknown state - currentSourceType: ${currentSourceType.current}, hasOnEnd: ${!!props.events?.onEnd}`
			);
		}
	};

	const handleOnVideoError = (e: OnVideoErrorData) => {
		currentLogger.current?.error(
			`handleOnVideoError: ${JSON.stringify(e)} - currentSourceType: ${currentSourceType.current}`
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

	const handleOnInternalError = (error: PlayerError) => {
		currentLogger.current?.error(`handleOnInternalError: ${JSON.stringify(error)}`);

		if (props.events?.onError && typeof props.events.onError === "function") {
			props.events.onError(error);
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
						playOffline={props.playOffline || sourceRef.current?.isDownloaded}
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
							Platform.OS === "ios" && sourceRef.current?.isDownloaded
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
						onAudioTracks={videoEvents.onAudioTracks}
						onTextTracks={videoEvents.onTextTracks}
						onVideoTracks={videoEvents.onVideoTracks}
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
					audioIndex={currentAudioIndexRef.current ?? props.audioIndex}
					subtitleIndex={currentSubtitleIndexRef.current ?? props.subtitleIndex}
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
