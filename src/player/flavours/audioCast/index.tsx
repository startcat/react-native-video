import React, { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EventRegister } from "react-native-event-listeners";
import Animated, { useSharedValue } from "react-native-reanimated";
import { type AudioControlsProps, type IPlayerProgress, type SliderValues } from "../../../types";

import {
	useCastConnected,
	useCastManager,
	useCastMedia,
	useCastMonitor,
	useCastPlaying,
	useCastProgress,
	useCastVolume,
} from "../../features/cast/hooks";

import { PlayerError, handleErrorException } from "../../core/errors";
import { type CastContentInfo } from "../../features/cast/types/types";

import { useIsBuffering } from "../../core/buffering";

import { playlistsManager } from "../../features/playlists";
import { type onSourceChangedProps, SourceClass } from "../../modules/source";

import {
	type ModeChangeData,
	type ProgramChangeData,
	DVRProgressManagerClass,
	VODProgressManagerClass,
} from "../../core/progress";

import { ComponentLogger } from "../../features/logger";

import { styles } from "../styles";

import {
	type AudioFlavourProps,
	type AudioPlayerActionEventProps,
	type ICommonData,
	type IDrm,
	type IMappedYoubora,
	type LoggerConfigBasic,
	CONTROL_ACTION,
	LogLevel,
	ProgressUpdateData,
	YOUBORA_FORMAT,
} from "../../types";

export function AudioCastFlavour(props: AudioFlavourProps): React.ReactElement {
	const currentLogger = useRef<ComponentLogger | null>(null);

	const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
	const [isLoadingContent, setIsLoadingContent] = useState<boolean>(false);
	const [hasTriedLoading, setHasTriedLoading] = useState<boolean>(false);
	const audioPlayerHeight = useSharedValue(0);

	const youboraForVideo = useRef<IMappedYoubora>();
	const drm = useRef<IDrm>();
	const isChangingSource = useRef<boolean>(true);
	const currentContentUri = useRef<string | null>(null);

	const [currentTime, setCurrentTime] = useState<number>(
		props.playlistItem?.initialState?.startPosition || 0
	);
	const [paused, setPaused] = useState<boolean>(!!props.initialState?.isPaused);
	const [muted, setMuted] = useState<boolean>(!!props.initialState?.isMuted);
	const [buffering, setBuffering] = useState<boolean>(false);
	const [speedRate] = useState<number>(1);
	const sliderValues = useRef<SliderValues>();
	const [sliderValuesUpdate, setSliderValuesUpdate] = useState<number>(0);

	const castLoggerConfig: LoggerConfigBasic = {
		enabled: props.logger?.cast?.enabled ?? true,
		level: props.logger?.cast?.level ?? LogLevel.INFO,
		instanceId: props.playerContext?.getInstanceId() || undefined,
	};

	// USAR HOOKS PERSONALIZADOS en lugar de los nativos
	const castConnected = useCastConnected(castLoggerConfig);
	const castMedia = useCastMedia(castLoggerConfig);
	const castPlaying = useCastPlaying(castLoggerConfig);
	const castProgress = useCastProgress(castLoggerConfig);
	const castVolume = useCastVolume(castLoggerConfig);

	// Logger
	if (!currentLogger.current && props.playerContext?.logger) {
		currentLogger.current = props.playerContext?.logger?.forComponent(
			"Audio Cast Flavour",
			castLoggerConfig.enabled,
			castLoggerConfig.level
		);
	}

	const onContentLoadedCallback = useCallback(
		(content: CastContentInfo) => {
			currentLogger.current?.info(`Cast Manager - Content loaded: ${content.source.uri}`);
			setIsLoadingContent(false);
			isChangingSource.current = false;
			setHasTriedLoading(true);
			currentContentUri.current = content.source.uri;

			// No marcar como loaded aún, esperar a que tengamos la duración
			currentLogger.current?.debug(
				`onContentLoadedCallback - waiting for duration, current: ${castProgress.duration}`
			);
		},
		[castProgress.duration]
	);

	const onErrorCallback = useCallback((error: PlayerError) => {
		currentLogger.current?.error(`Cast Manager - Content load error: ${error}`);
		setIsLoadingContent(false);
		onErrorRef.current?.(error);
	}, []);

	const onPlaybackStartedCallback = useCallback(() => {
		currentLogger.current?.info(`🎯 Cast Manager - Playback started`);
		setPaused(false);
		setBuffering(false);

		// Si no estaba cargado, marcarlo como cargado
		if (!isContentLoaded) {
			setIsContentLoaded(true);
			isChangingSource.current = false;
		}
	}, [isContentLoaded]);

	// onPlaybackEndedCallback eliminado - el useEffect de castMedia.isIdle ya maneja el fin de reproducción

	const onSeekCompletedCallback = useCallback((position: number) => {
		currentLogger.current?.debug(`Cast Manager - Seek completed: ${position}`);
		setCurrentTime(position);
	}, []);

	const onVolumeChangedCallback = useCallback((level: number, isMuted: boolean) => {
		currentLogger.current?.debug(`Cast Manager - Volume changed: ${level}, isMuted ${isMuted}`);
		setMuted(isMuted);
	}, []);

	// MEMORIZAR CONFIG también
	const castManagerConfig = useMemo(
		() => ({
			enableYoubora: true,
			enableAds: true,
			defaultStartPosition: 0,
			debugMode: true,
			level: LogLevel.DEBUG,
		}),
		[]
	);

	// MEMORIZAR CALLBACKS OBJECT
	const castManagerCallbacks = useMemo(
		() => ({
			onContentLoaded: onContentLoadedCallback,
			onError: onErrorCallback,
			onPlaybackStarted: onPlaybackStartedCallback,
			// onPlaybackEnded: eliminado para evitar duplicados con useEffect de isIdle
			onSeekCompleted: onSeekCompletedCallback,
			onVolumeChanged: onVolumeChangedCallback,
		}),
		[
			onContentLoadedCallback,
			onErrorCallback,
			onPlaybackStartedCallback,
			// onPlaybackEndedCallback eliminado
			onSeekCompletedCallback,
			onVolumeChangedCallback,
		]
	);

	// USAR CAST MANAGER para todas las acciones
	const castManager = useCastManager(
		{
			...castLoggerConfig,
			...castManagerConfig,
		},
		castManagerCallbacks
	);

	// Refs para evitar dependencias en useCallbacks
	const castManagerRef = useRef(castManager);

	useEffect(() => {
		castManagerRef.current = castManager;
	}, [castManager]);

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

	// CREATE REFS FOR MAIN CALLBACKS to avoid circular dependencies
	const onLoadRef = useRef<(e: { currentTime: number; duration: number }) => void>();
	const onEndRef = useRef<() => void>();
	const onErrorRef = useRef<(error: PlayerError) => void>();

	// Hook para el estado de buffering
	const isBuffering = useIsBuffering({
		buffering: buffering || isLoadingContent,
		paused: paused,
		onBufferingChange: props.events?.onBuffering,
	});

	useCastMonitor(castLoggerConfig, {
		onConnect: () => {
			currentLogger.current?.info(`Cast Monitor onConnect`);
		},
		onDisconnect: () => {
			currentLogger.current?.info(`Cast Monitor onDisconnect`);
			setIsContentLoaded(false);
			setIsLoadingContent(false);
			setHasTriedLoading(false);
		},
		onPlay: () => {
			currentLogger.current?.info(`Cast Monitor onPlay`);
			setPaused(false);
			setBuffering(false);
		},
		onPause: () => {
			currentLogger.current?.info(`Cast Monitor onPause`);
			setPaused(true);
		},
		onError: (error: PlayerError) => {
			currentLogger.current?.info(`Cast Monitor onError ${JSON.stringify(error)}`);
			setIsLoadingContent(false);
			// No resetear hasTriedLoading para evitar loops infinitos
			handleOnError(error);
		},
	});

	useEffect(() => {
		if (
			castConnected &&
			castProgress?.duration &&
			castProgress?.duration > 0 &&
			!sourceRef.current?.isLive &&
			!sourceRef.current?.isDVR
		) {
			if (sliderValues.current && sliderValues.current.duration !== castProgress?.duration) {
				currentLogger.current?.debug(
					`Updating sliderValues duration from Cast: ${castProgress.duration}s`
				);

				sliderValues.current = {
					...sliderValues.current,
					duration: castProgress.duration,
				};
				setSliderValuesUpdate((prev: number) => prev + 1);
			}
		}
	}, [castProgress.duration, castConnected]);

	// useEffect para cargar contenido cuando Cast esté listo
	useEffect(() => {
		if (
			castConnected &&
			sourceRef.current?.isReady &&
			!isContentLoaded &&
			!isLoadingContent &&
			!hasTriedLoading &&
			castManager?.state?.canControl
		) {
			currentLogger.current?.debug(`Cast ready - Loading content automatically`);
			setHasTriedLoading(true);

			const sourceData: onSourceChangedProps = {
				id: props.playlistItem?.metadata?.id,
				source: sourceRef.current.playerSource,
				drm: sourceRef.current.playerSourceDrm,
				dvrWindowSeconds: sourceRef.current.dvrWindowSeconds,
				isLive: sourceRef.current.isLive,
				isDVR: sourceRef.current.isDVR,
				isFakeVOD: sourceRef.current.isFakeVOD,
				isReady: true,
			};

			setTimeout(() => {
				loadContentWithCastManager(sourceData);
			}, 100);
		}
	}, [castConnected, isContentLoaded, isLoadingContent, hasTriedLoading, castManager]);

	// Sync with Cast progress with debounce to prevent immediate override of seeks
	useEffect(() => {
		if (castConnected && castProgress.currentTime !== currentTime) {
			setCurrentTime(castProgress.currentTime);
		}
		return undefined;
	}, [castProgress.currentTime, castConnected, currentTime]);

	// Sync with Cast playing state with debounce to prevent immediate override
	useEffect(() => {
		const isPlaying = castPlaying;
		const shouldBePaused = !isPlaying;

		if (paused !== shouldBePaused) {
			setPaused(shouldBePaused);
		}
	}, [castPlaying, paused]);

	// Sync with Cast volume with debounce to prevent immediate override
	useEffect(() => {
		currentLogger.current?.debug(`useEffect muted - muted: ${!!muted}`);
		if (castVolume.isMuted !== muted) {
			setMuted(castVolume.isMuted);
		}
	}, [castVolume.isMuted, muted]);

	// Detectar cuando la duración está disponible y llamar a onLoad
	useEffect(() => {
		if (
			!isContentLoaded &&
			hasTriedLoading &&
			castProgress.duration &&
			castProgress.duration > 0
		) {
			currentLogger.current?.debug(
				`Duration available, calling onLoad with duration: ${castProgress.duration}`
			);
			onLoadRef.current?.({
				currentTime: props.playlistItem?.initialState?.startPosition || 0,
				duration: castProgress.duration,
			});
		}
	}, [
		castProgress.duration,
		isContentLoaded,
		hasTriedLoading,
		props.playlistItem?.initialState?.startPosition,
	]);

	useEffect(() => {
		currentLogger.current?.info(`useEffect playlistItem - type: ${props.playlistItem?.type}`);

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
		sliderValues.current = undefined;
		setIsContentLoaded(false);
		hasCalledInitialSeekRef.current = false;

		// Reset progress managers
		vodProgressManagerRef.current?.reset();
		dvrProgressManagerRef.current?.reset();

		// Verificar si es contenido live/DVR vs VOD
		const isLiveContent = !!props.playlistItem?.isLive;

		if (isLiveContent) {
			handleLiveContent();
		} else {
			handleVODContent();
		}
	}, [props.playlistItem]);

	const handleLiveContent = () => {
		currentLogger.current?.debug(`handleLiveContent`);

		const liveSettings = props.playlistItem?.liveSettings;
		const calculatedStartPosition = props.playlistItem?.initialState?.startPosition || 0;

		if (!props.playlistItem?.resolvedSources) {
			currentLogger.current?.error("Cannot create SourceClass: resolvedSources is undefined");
			return;
		}

		// Siempre recrear el source cuando cambia el playlistItem
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
			sourceContext: "cast",
			startPosition: calculatedStartPosition,
			isLive: true,
			isCast: true,
			headers: props.playlistItem.resolvedSources.cast?.headers as
				| Record<string, string>
				| undefined,
			onSourceChanged: onSourceChanged,
			...(liveSettings && {
				liveStartDate: liveSettings.liveStartDate,
				resolvedEPG: liveSettings.resolvedEPG,
			}),
		});

		isChangingSource.current = false;
	};

	const handleVODContent = () => {
		currentLogger.current?.debug(`handleVODContent`);

		// Reset completo solo para VOD
		sliderValues.current = undefined;
		setIsContentLoaded(false);
		// NO resetear hasTriedLoading aquí - solo debe resetearse en onDisconnect
		// para evitar cargas duplicadas cuando cambia el contenido

		// Reset progress managers solo para VOD
		vodProgressManagerRef.current?.reset();
		dvrProgressManagerRef.current?.reset();

		const liveSettings = props.playlistItem?.liveSettings;
		const calculatedStartPosition = props.playlistItem?.initialState?.startPosition || 0;

		if (!props.playlistItem?.resolvedSources) {
			currentLogger.current?.error("Cannot create SourceClass: resolvedSources is undefined");
			return;
		}

		// Siempre recrear el source cuando cambia el playlistItem
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
			sourceContext: "cast",
			startPosition: calculatedStartPosition,
			isLive: false,
			isCast: true,
			headers: props.playlistItem.resolvedSources.cast?.headers as
				| Record<string, string>
				| undefined,
			onSourceChanged: onSourceChanged,
			...(liveSettings && {
				liveStartDate: liveSettings.liveStartDate,
				resolvedEPG: liveSettings.resolvedEPG,
			}),
		});

		currentLogger.current?.debug(`Loading content directly`);
		loadContentSource();
	};

	useEffect(() => {
		EventRegister.emit("audioPlayerProgress", {
			preloading: isBuffering || isLoadingContent,
			isContentLoaded: isContentLoaded,
			speedRate: speedRate,
			extraData: props.playlistItem?.extraData,
			// Nuevas Props Agrupadas
			playlistItemType: props.playlistItem?.type,
			playerMetadata: props.playlistItem?.metadata,
			playerProgress: {
				...playerProgressRef.current,
				currentTime: currentTime,
				isPaused: paused,
				isMuted: muted,
				isLive: sourceRef.current?.isLive,
				isDVR: sourceRef.current?.isDVR,
				isBinary: sourceRef.current?.isBinary,
				isChangingSource: isChangingSource.current,
				sliderValues: sliderValues.current,
				currentProgram: playerProgressRef.current?.currentProgram,
			},
			playerAnalytics: props.playlistItem?.analytics,
			playerTimeMarkers: props.playlistItem?.timeMarkers,
			//Events
			events: props.events,
		} as AudioControlsProps);
	}, [
		currentTime,
		sliderValuesUpdate,
		props.playlistItem?.metadata,
		props.playlistItem?.analytics,
		props.playlistItem?.timeMarkers,
		paused,
		muted,
		isBuffering,
		isLoadingContent,
		sourceRef.current?.isDVR,
		isContentLoaded,
		speedRate,
	]);

	const loadContentWithCastManager = useCallback(
		async (data: onSourceChangedProps) => {
			if (data && data.isReady && data.source && castManager?.state?.canControl) {
				currentLogger.current?.debug(`loadContentWithCastManager`);
				setIsLoadingContent(true);
				drm.current = data.drm;

				// Verificar si ya estamos reproduciendo el mismo contenido
				if (castMedia.url === data.source.uri && !castMedia.isIdle) {
					currentLogger.current?.info(`Content already loaded in Cast, skipping`);
					setIsLoadingContent(false);
					isChangingSource.current = false;
					setIsContentLoaded(true);
					setHasTriedLoading(true);
					return;
				}

				try {
					// Preparar Youbora si es necesario
					if (props.hooks?.getYouboraOptions) {
						youboraForVideo.current = props.hooks.getYouboraOptions(
							props.playlistItem?.analytics?.youbora!,
							YOUBORA_FORMAT.CAST
						);
					}

					let startingPoint = props.playlistItem?.initialState?.startPosition || 0;

					// Para DVR, ajustar el punto de inicio
					if (
						sourceRef.current?.isLive &&
						sourceRef.current?.isDVR &&
						sourceRef.current?.dvrWindowSeconds
					) {
						startingPoint = sourceRef.current.dvrWindowSeconds;
					}

					const success = await castManagerRef.current?.loadContent({
						source: data.source,
						manifest: sourceRef.current?.currentManifest || {},
						drm: data.drm,
						youbora: youboraForVideo.current,
						metadata: {
							id: props.playlistItem?.metadata?.id?.toString() || "",
							title: props.playlistItem?.metadata?.title,
							subtitle: props.playlistItem?.metadata?.subtitle,
							description: props.playlistItem?.metadata?.description,
							poster:
								props.playlistItem?.metadata?.squaredPoster ||
								props.playlistItem?.metadata?.poster,
							liveStartDate: props.playlistItem?.liveSettings?.liveStartDate,
							adTagUrl: props.playlistItem?.ads?.adTagUrl,
							hasNext: !!props.events?.onNext,
							isLive: !!props.playlistItem?.isLive,
							isDVR: sourceRef.current?.isDVR,
							startPosition: startingPoint,
						},
					});

					if (!success) {
						throw new PlayerError("PLAYER_CAST_CONNECTION_FAILED");
					}
				} catch (error: any) {
					setIsLoadingContent(false);
					currentLogger.current?.error(
						`loadContentWithCastManager - Failed: ${JSON.stringify(error)}`
					);
					handleOnError(handleErrorException(error, "PLAYER_CAST_OPERATION_FAILED"));
				}
			}
		},
		[
			castMedia,
			castManager,
			props.hooks,
			props.playlistItem?.analytics,
			props.playlistItem?.initialState,
			props.playlistItem?.metadata,
			props.playlistItem?.liveSettings?.liveStartDate,
			props.playlistItem?.ads,
			props.events,
		]
	);

	// LOAD CONTENT SOURCE
	const loadContentSource = useCallback(() => {
		currentLogger.current?.debug(`loadContentSource`);

		// Ya no es necesario porque el constructor de SourceClass llama a changeSource
		// El sourceRef ya está creado en handleVODContent o handleLiveContent
		currentLogger.current?.debug(`Content source already loaded via SourceClass constructor`);
	}, []);

	// SOURCE CHANGED HANDLER
	const onSourceChanged = useCallback(
		(data: onSourceChangedProps) => {
			currentLogger.current?.debug(`onSourceChanged - data: ${JSON.stringify(data)}`);

			if (data.isDVR && dvrProgressManagerRef.current) {
				dvrProgressManagerRef.current.setDVRWindowSeconds(data.dvrWindowSeconds || 3600);
			}

			// Actualizar playerProgressRef
			playerProgressRef.current = {
				...playerProgressRef.current,
				currentTime: currentTime,
				duration: sliderValues?.duration || 0,
				isPaused: paused,
				isMuted: muted,
				isContentLoaded: isContentLoaded,
				isChangingSource: isChangingSource.current,
				sliderValues: sliderValues,
			};

			loadContentWithCastManager(data);

			if (sourceRef.current?.isLive && sourceRef.current?.isDVR) {
				dvrProgressManagerRef.current?.reset();
			}
		},
		[loadContentWithCastManager, currentTime, sliderValues, paused, muted, isContentLoaded]
	);

	const onDVRModeChange = useCallback((data: ModeChangeData) => {
		currentLogger.current?.debug(`onDVRModeChange: ${JSON.stringify(data)}`);
	}, []);

	const onDVRProgramChange = useCallback((data: ProgramChangeData) => {
		currentLogger.current?.debug(`onDVRProgramChange: ${JSON.stringify(data)}`);
	}, []);

	const updatePlayerProgressRef = () => {
		try {
			playerProgressRef.current = {
				...playerProgressRef.current,
				currentTime: currentTime,
				duration: sliderValues.current?.duration || 0,
				isPaused: paused,
				isMuted: muted,
				isContentLoaded: isContentLoaded,
				isChangingSource: isChangingSource.current,
				sliderValues: sliderValues.current,
			};
		} catch (ex: any) {
			currentLogger.current?.error(`updatePlayerProgressRef - error ${ex?.message}`);
		}
	};

	const onProgressUpdate = useCallback((data: ProgressUpdateData) => {
		currentLogger.current?.debug(`onProgressUpdate: ${JSON.stringify(data)}`);

		sliderValues.current = {
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

		updatePlayerProgressRef();

		// Trigger re-render para emitir eventos con nuevos sliderValues
		setSliderValuesUpdate((prev: number) => prev + 1);
	}, []);

	const onSeekRequest = useCallback((playerTime: number) => {
		if (!!castManagerRef.current) {
			try {
				currentLogger.current?.debug(`onSeekRequest: ${playerTime}`);
				castManagerRef.current.seek(playerTime);
			} catch (error: any) {
				currentLogger.current?.error(`onSeekRequest failed: ${error?.message}`);
				handleOnError(handleErrorException(error, "PLAYER_CAST_OPERATION_FAILED"));
			}
		} else {
			currentLogger.current?.warn(`onSeekRequest - castManager is not initialized`);
			handleOnError(new PlayerError("PLAYER_CAST_NOT_READY"));
		}
	}, []);

	useEffect(() => {
		// Initialize VOD Progress Manager only once
		if (!vodProgressManagerRef.current) {
			currentLogger.current?.debug(`Initializing VOD Progress Manager`);
			vodProgressManagerRef.current = new VODProgressManagerClass({
				logger: props.playerContext?.logger,
				loggerEnabled: props.logger?.progressManager?.enabled,
				loggerLevel: props.logger?.progressManager?.level,
				onProgressUpdate: onProgressUpdate,
				onSeekRequest: onSeekRequest,
			});
		}

		// Initialize DVR Progress Manager only once
		if (!dvrProgressManagerRef.current) {
			currentLogger.current?.debug(`Initializing DVR Progress Manager`);
			dvrProgressManagerRef.current = new DVRProgressManagerClass({
				logger: props.playerContext?.logger,
				loggerEnabled: props.logger?.progressManager?.enabled,
				loggerLevel: props.logger?.progressManager?.level,
				playbackType: props.playerProgress?.liveValues?.playbackType,
				getEPGProgramAt: props.hooks?.getEPGProgramAt,
				onModeChange: onDVRModeChange,
				onProgramChange: onDVRProgramChange,
				onProgressUpdate: onProgressUpdate,
				onSeekRequest: onSeekRequest,
			});
		}
	}, []);

	// Actualizar callbacks del DVRProgressManagerClass cuando cambien
	useEffect(() => {
		if (vodProgressManagerRef.current) {
			vodProgressManagerRef.current?.updateCallbacks({
				onProgressUpdate: onProgressUpdate,
				onSeekRequest: onSeekRequest,
			});
		}

		if (dvrProgressManagerRef.current) {
			dvrProgressManagerRef.current?.updateCallbacks({
				getEPGProgramAt: props.hooks?.getEPGProgramAt,
				onModeChange: onDVRModeChange,
				onProgramChange: onDVRProgramChange,
				onProgressUpdate: onProgressUpdate,
				onSeekRequest: onSeekRequest,
			});
		}
	}, [
		props.hooks?.getEPGProgramAt,
		onDVRModeChange,
		onDVRProgramChange,
		onProgressUpdate,
		onSeekRequest,
	]);

	const onControlsPress = useCallback(
		async (id: CONTROL_ACTION, value?: number | boolean) => {
			const COMMON_DATA_FIELDS = ["time", "volume", "mute", "pause"];

			currentLogger.current?.info(`onControlsPress: ${id} (${value})`);

			if (id === CONTROL_ACTION.PAUSE) {
				try {
					if (value) {
						await castManagerRef.current?.pause();
					} else {
						await castManagerRef.current?.play();
					}
				} catch (error: any) {
					currentLogger.current?.error(`Pause/Play operation failed: ${error?.message}`);
					handleOnError(handleErrorException(error, "PLAYER_CAST_OPERATION_FAILED"));
				}
			}

			if (id === CONTROL_ACTION.CLOSE_AUDIO_PLAYER) {
				try {
					await castManagerRef.current?.stop();
					if (props.events?.onClose) {
						props.events.onClose();
					}
				} catch (error: any) {
					currentLogger.current?.error(`Stop operation failed: ${error?.message}`);
					handleOnError(handleErrorException(error, "PLAYER_CAST_OPERATION_FAILED"));
				}
			}

			if (id === CONTROL_ACTION.MUTE) {
				try {
					if (value) {
						await castManagerRef.current?.mute();
					} else {
						await castManagerRef.current?.unmute();
					}
				} catch (error: any) {
					currentLogger.current?.error(`Mute/Unmute operation failed: ${error?.message}`);
					handleOnError(handleErrorException(error, "PLAYER_CAST_OPERATION_FAILED"));
				}
			}

			if (id === CONTROL_ACTION.VOLUME && typeof value === "number") {
				try {
					await castManagerRef.current?.setVolume(value);
				} catch (error: any) {
					currentLogger.current?.error(`Volume operation failed: ${error?.message}`);
					handleOnError(handleErrorException(error, "PLAYER_CAST_OPERATION_FAILED"));
				}
			}

			if (id === CONTROL_ACTION.NEXT) {
				setIsContentLoaded(false);
				await playlistsManager.goToNext();
				if (props.events?.onNext) {
					props.events.onNext();
				}
			}

			if (id === CONTROL_ACTION.PREVIOUS) {
				setIsContentLoaded(false);
				await playlistsManager.goToPrevious();
				if (props.events?.onPrevious) {
					props.events.onPrevious();
				}
			}

			if (id === CONTROL_ACTION.LIVE && sourceRef.current?.isDVR) {
				dvrProgressManagerRef.current?.goToLive();
			}

			if (id === CONTROL_ACTION.SEEK_OVER_EPG && sourceRef.current?.isDVR) {
				dvrProgressManagerRef.current?.goToProgramStart();
			}

			if (id === CONTROL_ACTION.SEEK && sourceRef.current?.isDVR) {
				dvrProgressManagerRef.current?.seekToTime(value);
			}

			if (id === CONTROL_ACTION.FORWARD && sourceRef.current?.isDVR) {
				dvrProgressManagerRef.current?.skipForward(value);
			}

			if (id === CONTROL_ACTION.BACKWARD && sourceRef.current?.isDVR) {
				dvrProgressManagerRef.current?.skipBackward(value);
			}

			if (id === CONTROL_ACTION.SEEK && !sourceRef.current?.isLive) {
				vodProgressManagerRef.current?.seekToTime(value);
			}

			if (id === CONTROL_ACTION.FORWARD && !sourceRef.current?.isLive) {
				vodProgressManagerRef.current?.skipForward(value);
			}

			if (id === CONTROL_ACTION.BACKWARD && !sourceRef.current?.isLive) {
				vodProgressManagerRef.current?.skipBackward(value);
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
				}

				props.events.onChangeCommonData(data);
			}
		},
		[props.events]
	);

	useEffect(() => {
		const actionsAudioPlayerListener = EventRegister.addEventListener(
			"audioPlayerAction",
			(data: AudioPlayerActionEventProps) => {
				currentLogger.current?.info(
					`[Player] (Audio Cast Flavour) audioPlayerAction received: ${JSON.stringify(data)}`
				);
				onControlsPress(data.action, data.value);
			}
		);

		return () => {
			if (typeof actionsAudioPlayerListener === "string") {
				EventRegister.removeEventListener(actionsAudioPlayerListener);
			}
		};
	}, [onControlsPress]);

	// Simular eventos del reproductor usando Cast hooks
	const onLoad = useCallback(
		async (e: { currentTime: number; duration: number }) => {
			currentLogger.current?.info(
				`onLoad - duration: ${e.duration}, currentTime: ${e.currentTime}`
			);

			// Procesar onLoad para contenido
			if (e.duration > 0) {
				currentLogger.current?.debug(`onLoad - Processing content load`);

				// Para VOD, establecer la duración desde el evento onLoad
				if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR && e.duration) {
					currentLogger.current?.debug(
						`onLoad - Setting VOD duration from load event: ${e.duration}s`
					);
					vodProgressManagerRef.current?.updatePlayerData({
						currentTime: e.currentTime || 0,
						seekableRange: { start: 0, end: e.duration },
						duration: e.duration,
						isBuffering: false,
						isPaused: paused,
					});
				}

				if (sourceRef.current?.isDVR && sourceRef.current?.dvrWindowSeconds) {
					currentLogger.current?.debug(
						`onLoad - Configuring DVR window: ${sourceRef.current.dvrWindowSeconds}s`
					);
					dvrProgressManagerRef.current?.setDVRWindowSeconds(
						sourceRef.current.dvrWindowSeconds
					);
				}

				isChangingSource.current = false;
				setIsContentLoaded(true);
				setIsLoadingContent(false);

				if (props.events?.onStart) {
					props.events.onStart();
				}

				if (sourceRef.current?.isDVR && dvrProgressManagerRef.current) {
					dvrProgressManagerRef.current?.checkInitialSeek("cast");
				}
			}
		},
		[isContentLoaded, paused, props.events]
	);

	const handleOnEnd = useCallback(() => {
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

		if (props.events?.onEnd) {
			currentLogger.current?.debug(
				`handleOnEnd: Content finished, preparing for possible auto next`
			);

			props.events.onEnd();
		}
	}, [props.playlistItem?.type, props.playlistItem?.id, isContentLoaded, props.events]);

	// Detectar cuando el contenido termina
	useEffect(() => {
		if (castMedia.isIdle && isContentLoaded && !isLoadingContent) {
			// Verificar que la URL del contenido en Cast coincide con la URL actual
			// Normalizar ambas URLs para comparación (decodificar URL encoding)
			const currentUri = currentContentUri.current;
			const castUri = castMedia.url;

			if (currentUri && castUri) {
				const normalizedCurrent = decodeURIComponent(currentUri);
				const normalizedCast = decodeURIComponent(castUri);

				if (normalizedCurrent !== normalizedCast) {
					currentLogger.current?.debug(
						`Cast idle but URL mismatch - current: ${normalizedCurrent}, cast: ${normalizedCast}`
					);
					return;
				}
			}

			currentLogger.current?.debug(`Cast content ended from idle state`);
			onEndRef.current?.();
		}
	}, [castMedia.isIdle, isContentLoaded, isLoadingContent, castMedia.url]);

	// Simular onProgress usando castProgress
	useEffect(() => {
		if (!castConnected) return;

		const e = {
			currentTime: castProgress.currentTime,
			seekableDuration: castProgress.duration || 0,
		};

		currentLogger.current?.debug(
			`Simulating onProgress - castProgress: ${JSON.stringify(castProgress)}, isContentLoaded: ${isContentLoaded}`
		);
		currentLogger.current?.debug(`Simulating onProgress: ${JSON.stringify(e)}`);

		// Solo procesar progreso cuando el contenido esté cargado
		if (isContentLoaded) {
			if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR) {
				vodProgressManagerRef.current?.updatePlayerData({
					currentTime: e.currentTime,
					seekableRange: { start: 0, end: e.seekableDuration },
					duration: e.seekableDuration,
					isBuffering: isBuffering || isLoadingContent,
					isPaused: paused,
				});
			}

			if (sourceRef.current?.isDVR) {
				dvrProgressManagerRef.current?.updatePlayerData({
					currentTime: e.currentTime,
					duration: e.seekableDuration,
					seekableRange: { start: 0, end: e.seekableDuration },
					isBuffering: isBuffering || isLoadingContent,
					isPaused: paused,
				});
			}

			if (!sourceRef.current?.isLive && props?.events?.onChangeCommonData) {
				props.events.onChangeCommonData({
					time: e.currentTime,
					duration: e.seekableDuration,
				});
			}
		}
	}, [
		castProgress.currentTime,
		castProgress.duration,
		castConnected,
		paused,
		isBuffering,
		isLoadingContent,
		// NO incluir isContentLoaded, handleOnEnd ni props?.events?.onChangeCommonData para evitar recreaciones constantes
	]);

	const handleOnError = useCallback(
		(error: PlayerError) => {
			currentLogger.current?.error(`handleOnError: ${JSON.stringify(error?.message)}`);
			setIsLoadingContent(false);

			if (props.events?.onError && typeof props.events.onError === "function") {
				props.events.onError(error);
			}
		},
		[props.events?.onError]
	);

	useEffect(() => {
		onLoadRef.current = onLoad;
		onEndRef.current = handleOnEnd;
		onErrorRef.current = handleOnError;
	}, [onLoad, handleOnEnd, handleOnError]);

	const onSlidingComplete = (value: number) => {
		onControlsPress(CONTROL_ACTION.SEEK, value);
	};

	const Controls = props.controls
		? createElement(props.controls, {
				preloading: isBuffering || isLoadingContent,
				isContentLoaded: isContentLoaded,
				speedRate: speedRate,
				extraData: props.playlistItem?.extraData,
				playlistItemType: props.playlistItem?.type,
				playerMetadata: props.playlistItem?.metadata,
				playerProgress: playerProgressRef.current,
				playerAnalytics: props.playlistItem?.analytics,
				playerTimeMarkers: props.playlistItem?.timeMarkers,
				events: {
					onPress: onControlsPress,
					onSlidingComplete: onSlidingComplete,
				},
			})
		: null;

	return (
		<Animated.View
			style={{
				...styles.audioContainer,
				height: audioPlayerHeight,
				backgroundColor: props.backgroundColor || styles.container.backgroundColor,
				borderColor: props.topDividerColor,
				borderTopWidth: props.topDividerColor ? 1 : 0,
			}}
		>
			{Controls}
		</Animated.View>
	);
}

export default AudioCastFlavour;
