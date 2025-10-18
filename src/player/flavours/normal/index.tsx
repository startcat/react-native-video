import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useAirplayConnectivity } from "react-airplay";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	type IPlayerProgress,
	type OnBufferData,
	type OnLoadData,
	type OnProgressData,
	type OnReceiveAdEventData,
	type OnVideoErrorData,
	type ProgressUpdateData,
	type SelectedTrack,
	type SelectedVideoTrack,
	type SliderValues,
	DVR_PLAYBACK_TYPE,
	SelectedVideoTrackType,
} from "../../../types";
import Video, { type VideoRef } from "../../../Video";
import { Overlay } from "../../components/overlay";
const BackgroundPoster = React.lazy(() => import("../../components/poster"));

import { handleErrorException, mapVideoErrorToPlayerError, PlayerError } from "../../core/errors";

import { useIsLandscape } from "../common/hooks";

import { useIsBuffering } from "../../core/buffering";

import { mergeMenuData, onAdStarted } from "../../utils";

import { type onSourceChangedProps, type SourceContext, SourceClass } from "../../modules/source";

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

	const [currentTime, setCurrentTime] = useState<number>(
		props.playlistItem?.initialState?.startPosition || 0
	);
	const [paused, setPaused] = useState<boolean>(!!props.initialState?.isPaused);
	const [muted, setMuted] = useState<boolean>(!!props.initialState?.isMuted);
	const [buffering, setBuffering] = useState<boolean>(false);
	const [menuData, setMenuData] = useState<Array<IPlayerMenuData>>();
	const [speedRate, setSpeedRate] = useState<number>(1);
	const [selectedAudioTrack, setSelectedAudioTrack] = useState<SelectedTrack>();
	const [selectedTextTrack, setSelectedTextTrack] = useState<SelectedTrack>();
	const [selectedVideoTrack, setSelectedVideoTrack] = useState<SelectedVideoTrack>({
		type: SelectedVideoTrackType.AUTO,
	});
	const [maxBitRate, setMaxBitRate] = useState<number>(0);

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

	// Track last processed playlist item to avoid duplicate processing
	const lastProcessedItemIdRef = useRef<string | number | undefined>(undefined);

	// VOD Progress Manager
	const vodProgressManagerRef = useRef<VODProgressManagerClass | null>(null);

	// DVR Progress Manager
	const dvrProgressManagerRef = useRef<DVRProgressManagerClass | null>(null);
	const hasCalledInitialSeekRef = useRef<boolean>(false);

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
		currentLogger.current?.info(`useEffect playlistItem - type: ${props.playlistItem?.type}`);

		currentLogger.current?.info(`useEffect playlistItem ${props.playlistItem}`);

		// Evitar procesar el mismo item dos veces (nativo + JavaScript)
		const currentItemId = props.playlistItem?.id;
		currentLogger.current?.info(
			`🔍 Playlist item changed: ${lastProcessedItemIdRef.current} → ${currentItemId}`
		);

		if (currentItemId && lastProcessedItemIdRef.current === currentItemId) {
			currentLogger.current?.info(
				`⏭️ Skipping duplicate processing of item ${currentItemId}`
			);
			return;
		}

		currentLogger.current?.info(`✅ Processing new item ${currentItemId}`);
		lastProcessedItemIdRef.current = currentItemId;

		// Reset state
		setSliderValues(undefined);
		setIsContentLoaded(false);
		hasCalledInitialSeekRef.current = false;

		// Reset progress managers
		vodProgressManagerRef.current?.reset();
		dvrProgressManagerRef.current?.reset();

		// Extraer configuración de live/DVR desde liveSettings
		const isLive = props.playlistItem?.isLive;
		const liveSettings = props.playlistItem?.liveSettings;

		currentLogger.current?.info(
			`PlaylistItem live config - isLive: ${isLive}, playbackType: ${liveSettings?.playbackType}, currentProgram: ${liveSettings?.currentProgram ? JSON.stringify({ id: liveSettings.currentProgram.id, startDate: liveSettings.currentProgram.startDate, endDate: liveSettings.currentProgram.endDate }) : "null"}`
		);

		// Crear PlaylistItemSimplified para hooks
		const playlistItemSimplified = props.playlistItem
			? {
					id: props.playlistItem.id,
					type: props.playlistItem.type,
					status: props.playlistItem.status,
					resolvedSources: props.playlistItem.resolvedSources,
					metadata: props.playlistItem.metadata,
					timeMarkers: props.playlistItem.timeMarkers,
					duration: props.playlistItem.duration,
					isLive: props.playlistItem.isLive,
					liveSettings: props.playlistItem.liveSettings,
					playOffline: props.playlistItem.playOffline,
					addedAt: props.playlistItem.addedAt,
					extraData: props.playlistItem.extraData,
				}
			: null;

		// Actualizar playlist item en DVR Progress Manager si existe
		if (dvrProgressManagerRef.current && playlistItemSimplified) {
			dvrProgressManagerRef.current.setPlaylistItem(playlistItemSimplified);
		}

		// Calcular startPosition
		// Para live DVR, checkInitialSeek se encargará del seek inicial al live edge
		// Solo usamos startPosition si viene explícitamente del backend
		const rawStartPosition = props.playlistItem?.initialState?.startPosition;
		const calculatedStartPosition =
			rawStartPosition !== undefined && rawStartPosition !== null && rawStartPosition >= 0
				? rawStartPosition
				: 0;

		currentLogger.current?.info(
			`PlaylistItem startPosition - original: ${rawStartPosition}, calculated: ${calculatedStartPosition.toFixed(1)}s`
		);

		// Crear playerProgress desde el playlistItem
		playerProgressRef.current = {
			currentTime: calculatedStartPosition,
			duration: props.playlistItem?.initialState?.duration || 0,
			isLive: isLive,
			isPaused: props.initialState?.isPaused,
			isMuted: props.initialState?.isMuted,
			volume: props.initialState?.volume,
			liveValues: liveSettings
				? {
						playbackType: liveSettings.playbackType,
						multiSession: liveSettings.multiSession,
						currentProgram: liveSettings.currentProgram,
					}
				: undefined,
		};

		// Determinar el contexto del source (local para NormalFlavour)
		const sourceContext: SourceContext = "local";

		// Si no hay resolvedSources, lanzar error claro
		if (!props.playlistItem?.resolvedSources) {
			const errorMsg =
				"PlaylistItem must have resolvedSources. Please use resolveSourcesFromManifests() to convert manifests to resolvedSources before creating playlist items.";
			currentLogger.current?.error(errorMsg);
			return handleOnInternalError(
				new PlayerError("PLAYER_SOURCE_NO_MANIFESTS_PROVIDED", {
					message: errorMsg,
					playlistItem: props.playlistItem,
				})
			);
		}

		// Recrear sourceRef con el callback actualizado
		sourceRef.current = new SourceClass({
			logger: props.playerContext?.logger,
			playerLogger: props.logger,
			id: props.playlistItem?.metadata?.id,
			title: props.playlistItem?.metadata?.title,
			artist: props.playlistItem?.metadata?.artist,
			subtitle: props.playlistItem?.metadata?.subtitle,
			description: props.playlistItem?.metadata?.description,
			poster: props.playlistItem?.metadata?.poster,
			squaredPoster: props.playlistItem?.metadata?.squaredPoster,
			resolvedSources: props.playlistItem.resolvedSources,
			sourceContext: sourceContext,
			startPosition: calculatedStartPosition,
			isLive: isLive,
			isCast: false,
			headers: props.playlistItem.resolvedSources.local?.headers as
				| Record<string, string>
				| undefined,
			onSourceChanged: onSourceChanged,
			// Parámetros DVR si es contenido live
			...(liveSettings && {
				liveStartDate: liveSettings.liveStartDate,
				resolvedEPG: liveSettings.resolvedEPG,
			}),
		});

		// El constructor ya llama a changeSource internamente
		// que a su vez llama a onSourceChanged con el callback actualizado
		isChangingSource.current = false;
	}, [props.playlistItem]);

	// useEffect(() => {
	// 	// Montamos el selector de pista de Audio
	// 	if (typeof props.audioIndex === "number" && props.audioIndex > -1) {
	// 		setSelectedAudioTrack({
	// 			value: props.audioIndex,
	// 			type: SelectedTrackType.INDEX,
	// 		});
	// 	}
	// }, [props.audioIndex]);

	// useEffect(() => {
	// 	// Montamos el selector de pista de Subtítulo
	// 	if (typeof props.subtitleIndex === "number" && props.subtitleIndex > -1) {
	// 		setSelectedTextTrack({
	// 			value: props.subtitleIndex,
	// 			type: SelectedTrackType.INDEX,
	// 		});
	// 	} else if (typeof props.subtitleIndex === "number" && props.subtitleIndex === -1) {
	// 		setSelectedTextTrack({
	// 			type: SelectedTrackType.DISABLED,
	// 		});
	// 	}
	// }, [props.subtitleIndex]);

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
		currentLogger.current?.debug(
			`onSourceChanged - Processing source (isReady: ${data.isReady})`
		);

		// Actualizar playerProgressRef con estado actual
		playerProgressRef.current = {
			currentTime: currentTime,
			duration: sliderValues?.duration || 0,
			isLive: sourceRef.current?.isLive,
			isPaused: paused,
			isMuted: muted,
			isContentLoaded: isContentLoaded,
			isChangingSource: isChangingSource.current,
			sliderValues: sliderValues,
		};

		// Cargar el source si está listo
		if (data.isReady) {
			setPlayerSource(data);
		}
	};

	const setPlayerSource = useCallback(
		(data?: onSourceChangedProps) => {
			currentLogger.current?.temp(`setPlayerSource (data isReady ${!!data?.isReady})`);
			currentLogger.current?.temp(
				`setPlayerSource (sourceRef isReady ${!!sourceRef.current?.isReady})`
			);
			currentLogger.current?.temp(`setPlayerSource (data ${JSON.stringify(data)})`);

			if (data && data?.isReady) {
				currentLogger.current?.debug(`setPlayerSource - Using provided data`);
				setBuffering(true);
				drm.current = data.drm;

				// Preparamos los datos de Youbora
				if (props.hooks?.getYouboraOptions) {
					youboraForVideo.current = props.hooks.getYouboraOptions(
						props.playlistItem?.analytics?.youbora!,
						YOUBORA_FORMAT.MOBILE
					);
				}

				currentLogger.current?.info(
					`setPlayerSource - Setting content source: ${JSON.stringify(data.source)}`
				);
				setVideoSource(data.source!);
			} else if (sourceRef.current?.isReady) {
				currentLogger.current?.debug(`setPlayerSource - Using sourceRef`);
				setBuffering(true);
				drm.current = sourceRef.current.playerSourceDrm;

				// Preparamos los datos de Youbora
				if (props.hooks?.getYouboraOptions) {
					youboraForVideo.current = props.hooks.getYouboraOptions(
						props.playlistItem?.analytics?.youbora!,
						YOUBORA_FORMAT.MOBILE
					);
				}

				currentLogger.current?.info(
					`setPlayerSource - Setting sourceRef content: ${JSON.stringify(sourceRef.current.playerSource)}`
				);
				setVideoSource(sourceRef.current.playerSource!);
			} else {
				currentLogger.current?.error(`setPlayerSource - No valid source available`);
			}
		},
		[props.hooks, props.playlistItem]
	);

	/*
	 *  Gestores de Progreso
	 *
	 */

	const handleOnProgressUpdate = useCallback(
		(data: ProgressUpdateData) => {
			currentLogger.current?.debug(`handleOnProgressUpdate ${JSON.stringify(data)}`);

			// Actualizar sliderValues siempre (no solo cuando isContentLoaded)
			const newSliderValues = {
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
			};

			setSliderValues(newSliderValues);

			// Actualizar playerProgressRef con los nuevos valores
			playerProgressRef.current = {
				...props.playerProgress,
				currentTime: currentTime,
				duration: data.duration || 0,
				isPaused: paused,
				isMuted: muted,
				isContentLoaded: isContentLoaded,
				isChangingSource: isChangingSource.current,
				sliderValues: newSliderValues,
				currentProgram: data.currentProgram,
			};
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

	const handleOnControlsPress = (id: CONTROL_ACTION, value?: number | boolean) => {
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

				// if (sourceRef.current) {
				// 	sourceRef.current.changeDvrUriParameters(timestamp);
				// }

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

					// if (sourceRef.current) {
					// 	sourceRef.current.reloadDvrStream();
					// }

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
				dvrProgressManagerRef.current?.seekToTime(value);
			} catch (error: any) {
				currentLogger.current?.error(`DVR seekToTime failed: ${error?.message}`);
				handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
			}
		}

		if (id === CONTROL_ACTION.FORWARD && sourceRef.current?.isDVR) {
			try {
				// Hacer seek en DVR
				dvrProgressManagerRef.current?.skipForward(value);
			} catch (error: any) {
				currentLogger.current?.error(`DVR skipForward failed: ${error?.message}`);
				handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
			}
		}

		if (id === CONTROL_ACTION.BACKWARD && sourceRef.current?.isDVR) {
			try {
				// Hacer seek en DVR
				dvrProgressManagerRef.current?.skipBackward(value);
			} catch (error: any) {
				currentLogger.current?.error(`DVR skipBackward failed: ${error?.message}`);
				handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
			}
		}

		if (id === CONTROL_ACTION.SEEK && !sourceRef.current?.isLive) {
			try {
				// Hacer seek en VOD
				vodProgressManagerRef.current?.seekToTime(value);
			} catch (error: any) {
				currentLogger.current?.error(`VOD seekToTime failed: ${error?.message}`);
				handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
			}
		}

		if (id === CONTROL_ACTION.FORWARD && !sourceRef.current?.isLive) {
			try {
				// Hacer seek en VOD
				vodProgressManagerRef.current?.skipForward(value);
			} catch (error: any) {
				currentLogger.current?.error(`VOD skipForward failed: ${error?.message}`);
				handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
			}
		}

		if (id === CONTROL_ACTION.BACKWARD && !sourceRef.current?.isLive) {
			try {
				// Hacer seek en VOD
				vodProgressManagerRef.current?.skipBackward(value);
			} catch (error: any) {
				currentLogger.current?.error(`VOD skipBackward failed: ${error?.message}`);
				handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
			}
		}

		// Actions to be saved between flavours
		if (COMMON_DATA_FIELDS.includes(id) && props?.events?.onChangeCommonData) {
			let data: ICommonData = {};

			if (id === CONTROL_ACTION.MUTE) {
				data.muted = !!value;
			} else if (id === CONTROL_ACTION.PAUSE) {
				data.paused = !!value;
			} else if (typeof value === "number") {
				data.volume = id === CONTROL_ACTION.VOLUME ? value : undefined;
				data.audioIndex = id === CONTROL_ACTION.AUDIO_INDEX ? value : undefined;
				data.subtitleIndex = id === CONTROL_ACTION.SUBTITLE_INDEX ? value : undefined;
				data.audioLabel = menuData?.find(
					(item: IPlayerMenuData) =>
						item.type === PLAYER_MENU_DATA_TYPE.AUDIO && item.index === value
				)?.label;
				data.subtitleLabel = menuData?.find(
					(item: IPlayerMenuData) =>
						item.type === PLAYER_MENU_DATA_TYPE.TEXT && item.index === value
				)?.label;
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

		// Procesar onLoad para contenido
		if (!isContentLoaded) {
			currentLogger.current?.debug(`handleOnLoad - Processing content load`);

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

			if (props.hooks?.mergeMenuData && typeof props.hooks.mergeMenuData === "function") {
				setMenuData(
					props.hooks.mergeMenuData(e, props.languagesMapping, sourceRef.current?.isDASH)
				);
			} else {
				setMenuData(mergeMenuData(e, props.languagesMapping, sourceRef.current?.isDASH));
			}

			if (props.events?.onStart) {
				props.events.onStart();
			}

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
			`handleOnProgress - isContentLoaded: ${isContentLoaded}, currentTime: ${e.currentTime}, seekableDuration: ${e.seekableDuration}`
		);

		if (typeof e.currentTime === "number" && currentTime !== e.currentTime) {
			// Trigger para el cambio de estado
			setCurrentTime(e.currentTime);
		}

		// Solo procesar progreso cuando el contenido esté cargado
		if (isContentLoaded) {
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
		}
	};

	const handleOnReceiveAdEvent = (e: OnReceiveAdEventData) => {
		if (e.event === "STARTED") {
			setIsPlayingAd(true);
			onAdStarted(e);
		} else if (
			e.event === "COMPLETED" ||
			e.event === "ALL_ADS_COMPLETED" ||
			e.event === "SKIPPED" ||
			e.event === "USER_CLOSE"
		) {
			setIsPlayingAd(false);
		} else if (e.event === "ERROR") {
		}
	};

	const handleOnEnd = () => {
		currentLogger.current?.info(
			`handleOnEnd: playlistItem type ${props.playlistItem?.type}, id: ${props.playlistItem?.id}, isContentLoaded: ${isContentLoaded}`
		);

		// Ignore onEnd if content hasn't been loaded yet
		// This prevents spurious onEnd events when changing sources
		if (!isContentLoaded) {
			currentLogger.current?.warn(
				`handleOnEnd: Ignoring onEnd event - content not loaded yet (type: ${props.playlistItem?.type})`
			);
			return;
		}

		// NOTE: We don't notify the native PlaylistControlModule here because:
		// 1. In coordinated mode, the PlaylistsManager (TypeScript) controls which item plays
		// 2. The native module is only used for standalone mode (audio-only apps)
		// 3. Auto-advance is handled by the parent component (AudioPlayerBar) which uses PlaylistsManager

		// Always notify parent that item has ended
		// Parent component (audioPlayerBar) will decide whether to auto-advance based on:
		// - Item type (TUDUM always auto-advances)
		// - autoNext configuration (for regular content)
		if (props.events?.onEnd) {
			props.events.onEnd();
		}
	};

	const handleOnVideoError = (e: OnVideoErrorData) => {
		currentLogger.current?.error(`handleOnVideoError: ${JSON.stringify(e)}`);

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
							isLandscapePlayer ? { height: "100%" } : { width: "100%" },
						]}
						// @ts-ignore
						source={videoSource}
						// @ts-ignore
						drm={drm.current}
						// @ts-ignore
						youbora={youboraForVideo.current}
						playOffline={props.playlistItem?.playOffline}
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
						adTagUrl={props.playlistItem?.ads?.adTagUrl}
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
						selectedVideoTrack={selectedVideoTrack}
						selectedAudioTrack={selectedAudioTrack}
						selectedTextTrack={
							typeof selectedTextTrack?.value === "number" &&
							selectedTextTrack?.value < 0
								? undefined
								: selectedTextTrack
						}
						subtitleStyle={props.initialState?.subtitleStyle}
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

			{!isPlayingAd ? (
				<Overlay
					preloading={isBuffering}
					thumbnailsMetadata={sourceRef.current?.currentManifest?.thumbnailMetadata}
					avoidTimelineThumbnails={props.avoidTimelineThumbnails}
					alwaysVisible={isAirplayConnected}
					isChangingSource={isChangingSource.current}
					isContentLoaded={isContentLoaded}
					menuData={menuData}
					videoIndex={videoQualityIndex.current}
					audioIndex={props.initialState?.audioIndex}
					subtitleIndex={props.initialState?.subtitleIndex}
					speedRate={speedRate}
					// Nuevas Props Agrupadas
					playerMetadata={props.playerMetadata}
					playerProgress={{
						...props.playerProgress,
						currentTime: currentTime,
						duration: sliderValues?.duration ?? sliderValues?.maximumValue ?? 0,
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
