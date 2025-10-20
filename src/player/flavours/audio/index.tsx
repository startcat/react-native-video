import React, { createElement, useCallback, useEffect, useRef, useState } from "react";
import { EventRegister } from "react-native-event-listeners";
import Animated, { useSharedValue } from "react-native-reanimated";
import {
	type AudioControlsProps,
	type IPlayerProgress,
	type OnBufferData,
	type OnLoadData,
	type OnProgressData,
	type OnVideoErrorData,
	type ProgressUpdateData,
	type SliderValues,
} from "../../../types";
import Video, { type VideoRef } from "../../../Video";

import { handleErrorException, mapVideoErrorToPlayerError, PlayerError } from "../../core/errors";

import { useIsBuffering } from "../../core/buffering";
import { useVideoAnalytics } from "../../core/events/hooks/useVideoAnalytics";
import { useAppIsInBackground } from "../../hooks/isInBackground";

import { type onSourceChangedProps, type SourceContext, SourceClass } from "../../modules/source";

import {
	type ModeChangeData,
	type ProgramChangeData,
	DVRProgressManagerClass,
	VODProgressManagerClass,
} from "../../core/progress";

import { ComponentLogger } from "../../features/logger";
import { SleepTimerControl } from "../../features/sleepTimer";

import { styles } from "../styles";

import { DeviceEventEmitter, NativeModules, Platform } from "react-native";
import {
	type AudioFlavourProps,
	type AudioPlayerActionEventProps,
	type ICommonData,
	type IDrm,
	type IMappedYoubora,
	type IVideoSource,
	CONTROL_ACTION,
	YOUBORA_FORMAT,
} from "../../types";

export function AudioFlavour(props: AudioFlavourProps): React.ReactElement {
	const currentLogger = useRef<ComponentLogger | null>(null);

	const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
	const audioPlayerHeight = useSharedValue(0);

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
	const [speedRate, setSpeedRate] = useState<number>(1);

	const refVideoPlayer = useRef<VideoRef>(null);
	const [sliderValues, setSliderValues] = useState<SliderValues | undefined>(undefined);

	// Logger
	if (!currentLogger.current && props.playerContext?.logger) {
		currentLogger.current = props.playerContext?.logger?.forComponent(
			"Audio Flavour",
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

	// Hook para el estado de buffering
	const isBuffering = useIsBuffering({
		buffering: buffering,
		paused: paused,
		onBufferingChange: props.events?.onBuffering,
	});

	// Hook para el estado de background
	const isInBackground = useAppIsInBackground();

	useEffect(() => {
		currentLogger.current?.info(`useEffect videoSource ${JSON.stringify(videoSource)}`);
	}, [videoSource?.uri]);

	useEffect(() => {
		const actionsAudioPlayerListener = EventRegister.addEventListener(
			"audioPlayerAction",
			(data: AudioPlayerActionEventProps) => {
				handleOnControlsPress(data.action, data.value);
			}
		);

		return () => {
			if (typeof actionsAudioPlayerListener === "string") {
				EventRegister.removeEventListener(actionsAudioPlayerListener);
			}
		};
	}, []);

	useEffect(() => {
		// HACK para reanudar la reproducción si se pausa al pasar a background
		if (isInBackground && !paused && refVideoPlayer.current && Platform.OS === "ios") {
			refVideoPlayer.current?.resume();
			setTimeout(() => {
				refVideoPlayer.current?.resume();
			}, 100);

			setTimeout(() => {
				refVideoPlayer.current?.resume();
			}, 200);

			setTimeout(() => {
				refVideoPlayer.current?.resume();
			}, 300);
		}
	}, [isInBackground, paused, refVideoPlayer.current]);

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

		// Determinar el contexto del source (local para AudioFlavour)
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
		[props.hooks, props.playlistItem?.analytics?.youbora]
	);

	// Source Cooking
	const onSourceChanged = useCallback(
		(data: onSourceChangedProps) => {
			currentLogger.current?.info(
				`📡 onSourceChanged called - itemId: ${data.id}, isReady: ${data.isReady}`
			);

			// Don't recreate playerProgressRef here - it was already created in playlistItem useEffect
			// with the correct values from the new item. Recreating it here with old values causes
			// the media widget to flicker during transitions.

			setPlayerSource(data);

			// Reset DVR si es necesario
			if (sourceRef.current?.isLive && sourceRef.current?.isDVR) {
				dvrProgressManagerRef.current?.reset();
			}
		},
		[setPlayerSource]
	);

	/*
	 *  Gestores de Progreso
	 *
	 */

	const handleOnProgressUpdate = useCallback(
		(data: ProgressUpdateData) => {
			currentLogger.current?.debug(`handleOnProgressUpdate ${JSON.stringify(data)}`);

			// Actualizar sliderValues para todos los tipos de items (incluido TUDUM)
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
				...playerProgressRef.current,
				currentTime: currentTime,
				duration: sliderValues?.duration || 0,
				isPaused: paused,
				isMuted: muted,
				isContentLoaded: isContentLoaded,
				isChangingSource: isChangingSource.current,
				sliderValues: sliderValues,
				currentProgram: data.currentProgram,
			};
		},
		[currentTime, paused, muted, isContentLoaded, props.playlistItem?.type]
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
			// Crear PlaylistItemSimplified para inicialización
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

			currentLogger.current?.temp(
				`Creating DVR Progress Manager with playbackType: ${JSON.stringify(
					playerProgressRef.current?.liveValues
				)}`
			);

			currentLogger.current?.temp(
				`Creating DVR Progress Manager with playlistItem: ${JSON.stringify(
					playlistItemSimplified
				)}`
			);

			dvrProgressManagerRef.current = new DVRProgressManagerClass({
				logger: props.playerContext?.logger,
				loggerEnabled: props.logger?.progressManager?.enabled,
				loggerLevel: props.logger?.progressManager?.level,
				playbackType: props.playlistItem?.liveSettings?.playbackType,
				currentProgram: props.playlistItem?.liveSettings?.currentProgram,
				playlistItem: playlistItemSimplified,
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
		const isLiveContent = !!props.playlistItem?.isLive;

		if (isLiveContent && sourceRef.current?.isDVR && dvrProgressManagerRef.current) {
			const dvrWindow = sourceRef.current.dvrWindowSeconds || 3600; // 1 hora por defecto
			currentLogger.current?.debug(`Setting DVR window: ${dvrWindow}s`);
			dvrProgressManagerRef.current.setDVRWindowSeconds(dvrWindow);
		}
	}, [props.playlistItem?.isLive, sourceRef.current?.isDVR, sourceRef.current?.dvrWindowSeconds]);

	/*
	 *  Sleep Timer - Usa el timer nativo del player
	 *
	 */

	const cancelSleepTimer = () => {
		currentLogger.current?.info(`Cancel sleep timer`);
		SleepTimerControl.cancelSleepTimer();
	};

	const refreshSleepTimerFinishCurrent = () => {
		currentLogger.current?.info(`Cancel sleep timer`);
		SleepTimerControl.activateFinishCurrentTimer();
	};

	const refreshSleepTimer = (value: number) => {
		currentLogger.current?.info(`Creating sleep timer for ${value} seconds`);
		SleepTimerControl.activateSleepTimer(value);
	};

	/*
	 *  Handlers para los eventos de interfaz
	 *
	 */

	const handleOnControlsPress = useCallback(
		async (id: CONTROL_ACTION, value?: number | boolean) => {
			const COMMON_DATA_FIELDS = ["time", "volume", "mute", "pause", "speedRate"];

			currentLogger.current?.info(`handleOnControlsPress: ${id} (${value})`);

			if (id === CONTROL_ACTION.PAUSE) {
				const newPausedState = !!value;
				setPaused(newPausedState);
			}

			if (id === CONTROL_ACTION.CLOSE_AUDIO_PLAYER) {
				// Clear workarround
				setVideoSource({
					// @ts-ignore
					id: null,
					// @ts-ignore
					title: null,
					// @ts-ignore
					uri: null,
					// @ts-ignore
					type: null,
				});

				if (props.events?.onClose) {
					props.events.onClose();
				}
			}

			if (id === CONTROL_ACTION.MUTE) {
				setMuted(!!value);
			}

			if (id === CONTROL_ACTION.NEXT && props.events?.onNext) {
				setIsContentLoaded(false);
				props.events.onNext();

				// Evento analíticas
				analyticsEvents.onStop({ reason: "navigation" });
			}

			if (id === CONTROL_ACTION.PREVIOUS && props.events?.onPrevious) {
				setIsContentLoaded(false);
				props.events.onPrevious();

				// Evento analíticas
				analyticsEvents.onStop({ reason: "navigation" });
			}

			if (id === CONTROL_ACTION.SPEED_RATE && typeof value === "number") {
				setSpeedRate(value);
			}

			if (id === CONTROL_ACTION.LIVE && sourceRef.current?.isDVR) {
				try {
					// Volver al directo en DVR
					dvrProgressManagerRef.current?.goToLive();
				} catch (error: any) {
					currentLogger.current?.error(`goToLive failed: ${error?.message}`);
					handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
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

			if (id === CONTROL_ACTION.SLEEP && !value) {
				// Desactivamos el sleeper
				cancelSleepTimer();
			}

			if (id === CONTROL_ACTION.SLEEP && value === -1) {
				// Activamos el sleeper hasta terminar el contenido actual
				refreshSleepTimerFinishCurrent();
			}

			if (id === CONTROL_ACTION.SLEEP && typeof value === "number" && value > 0) {
				// Activamos el sleeper
				refreshSleepTimer(value);
			}

			// Actions to be saved between flavours
			if (COMMON_DATA_FIELDS.includes(id) && props?.events?.onChangeCommonData) {
				let data: ICommonData = {};

				if (id === CONTROL_ACTION.MUTE) {
					data.muted = !!value;
				} else if (id === CONTROL_ACTION.PAUSE) {
					data.paused = !!value;
				} else if (id === CONTROL_ACTION.SPEED_RATE) {
					// data.playbackRate = value;
				} else if (typeof value === "number") {
					data.volume = id === CONTROL_ACTION.VOLUME ? value : undefined;
				}

				props.events.onChangeCommonData(data);
			}
		},
		[currentTime, isBuffering]
	);

	const handleOnSlidingStart = (value: number) => {
		currentLogger.current?.debug(`handleOnSlidingStart: ${value}`);

		// Activar manual seeking en el progress manager correspondiente
		if (sourceRef.current?.isDVR) {
			dvrProgressManagerRef.current?.setManualSeeking(true);
		}
	};

	const handleOnSlidingComplete = (value: number) => {
		currentLogger.current?.debug(`handleOnSlidingComplete: ${value}`);

		// Desactivar manual seeking y hacer el seek
		if (sourceRef.current?.isDVR) {
			dvrProgressManagerRef.current?.setManualSeeking(false);
		}

		handleOnControlsPress(CONTROL_ACTION.SEEK, value);
	};

	/*
	 *  Evento del progreso del audio player
	 *
	 */

	useEffect(() => {
		const updateProgress = async () => {
			// Obtener estado del sleep timer
			let sleepTimerStatus = { isActive: false, remainingSeconds: 0 };
			try {
				sleepTimerStatus = await SleepTimerControl.getSleepTimerStatus();
			} catch (error) {
				// Ignorar errores silenciosamente
			}

			EventRegister.emit("audioPlayerProgress", {
				preloading: isBuffering,
				isContentLoaded: isContentLoaded,
				speedRate: speedRate,
				extraData: props.playlistItem?.extraData,
				sleepTimer: sleepTimerStatus,
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
					sliderValues: sliderValues,
					currentProgram: playerProgressRef.current?.currentProgram,
				},
				playerAnalytics: props.playlistItem?.analytics,
				playerTimeMarkers: props.playlistItem?.timeMarkers,
				//Events
				events: props.events,
			} as AudioControlsProps);
		};

		updateProgress();
	}, [
		currentTime,
		sliderValues,
		props.playlistItem?.metadata,
		props.playlistItem?.analytics,
		props.playlistItem?.timeMarkers,
		paused,
		muted,
		isBuffering,
		sourceRef.current?.isDVR,
		isContentLoaded,
		speedRate,
		handleOnControlsPress,
	]);

	/*
	 *  Handlers para los eventos
	 *
	 */

	const handleOnLoad = async (e: OnLoadData) => {
		currentLogger.current?.info(`handleOnLoad (${sourceRef.current?.playerSource?.uri})`);

		// Procesar onLoad para todos los tipos de items (incluido TUDUM)
		if (!isContentLoaded) {
			currentLogger.current?.debug(
				`handleOnLoad - Processing content load (type: ${props.playlistItem?.type})`
			);

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

			// NOTA: checkInitialSeek se llama en handleOnProgress después de recibir datos válidos
		} else {
			currentLogger.current?.debug(
				`handleOnLoad - Ignoring load event (playlistItem type: ${props.playlistItem?.type}, isContentLoaded: ${isContentLoaded})`
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
		currentLogger.current?.temp(
			`handleOnProgress - playlistItem type: ${props.playlistItem?.type}, isContentLoaded: ${isContentLoaded}, currentTime: ${e.currentTime}, seekableDuration: ${e.seekableDuration}`
		);

		if (typeof e.currentTime === "number" && currentTime !== e.currentTime) {
			// Trigger para el cambio de estado
			setCurrentTime(e.currentTime);
		}

		// Procesar progreso para todos los tipos de items (incluido TUDUM) si el contenido está cargado
		if (isContentLoaded) {
			if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR) {
				// Para VOD: NO actualizar duration en onProgress, mantener la que se estableció en onLoad
				const currentDuration = vodProgressManagerRef.current?.duration || 0;

				if (currentDuration > 0) {
					vodProgressManagerRef.current?.updatePlayerData({
						currentTime: e.currentTime,
						seekableRange: {
							start: 0,
							end: currentDuration,
						},
						duration: currentDuration, // Mantener duración existente
						isBuffering: isBuffering,
						isPaused: paused,
					});
				}
			}

			if (sourceRef.current?.isDVR) {
				// Para DVR, usar la duración del evento onProgress
				dvrProgressManagerRef.current?.updatePlayerData({
					currentTime: e.currentTime,
					duration: e.seekableDuration,
					seekableRange: { start: 0, end: e.seekableDuration },
					isBuffering: isBuffering,
					isPaused: paused,
				});

				// Ejecutar checkInitialSeek DESPUÉS de que el DVR Manager tenga datos válidos
				if (!hasCalledInitialSeekRef.current && dvrProgressManagerRef.current) {
					// Verificar que el DVR Manager esté listo para operaciones de seek
					if (dvrProgressManagerRef.current.isReadyForSeek) {
						try {
							// Determinar si estamos restringidos al programa actual
							const isLiveProgramRestricted =
								props.playlistItem?.liveSettings?.playbackType === "playlist" &&
								!!props.playlistItem?.liveSettings?.currentProgram;

							currentLogger.current?.info(
								`✅ DVR Manager ready - Calling checkInitialSeek with isLiveProgramRestricted: ${isLiveProgramRestricted}, playbackType: ${props.playlistItem?.liveSettings?.playbackType}`
							);

							dvrProgressManagerRef.current.checkInitialSeek(
								"player",
								isLiveProgramRestricted
							);
							hasCalledInitialSeekRef.current = true;
						} catch (error: any) {
							currentLogger.current?.error(
								`DVR checkInitialSeek failed: ${error?.message}`
							);
							handleOnInternalError(
								handleErrorException(error, "PLAYER_SEEK_FAILED")
							);
						}
					} else {
						currentLogger.current?.debug(
							`⏳ DVR Manager not ready yet for checkInitialSeek - will retry on next progress update`
						);
					}
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
			currentLogger.current?.temp(
				`handleOnProgress: Ignoring progress (type: ${props.playlistItem?.type}, isContentLoaded: ${isContentLoaded}) - currentTime: ${e.currentTime}, duration: ${e.seekableDuration}`
			);
		}
	};

	const handleOnEnd = async () => {
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

		// Notificar al Sleep Timer que el media ha terminado
		// Si está en modo "finish-current", pausará aquí
		const { VideoSleepTimerModule } = NativeModules;
		if (VideoSleepTimerModule) {
			try {
				VideoSleepTimerModule.notifyMediaEnded();
				currentLogger.current?.info(
					"[Sleep Timer] Notified media ended to sleep timer module"
				);
			} catch (error) {
				currentLogger.current?.warn("[Sleep Timer] Failed to notify media ended:", error);
			}
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
		currentLogger.current?.error(
			`handleOnVideoError: ${JSON.stringify(e)} - playlistItem type: ${props.playlistItem?.type}`
		);
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

	// Estado del sleep timer para los controles
	const [sleepTimerForControls, setSleepTimerForControls] = useState({
		isActive: false,
		remainingSeconds: 0,
	});

	// Actualizar el estado del sleep timer para los controles cada segundo
	useEffect(() => {
		const updateSleepTimerForControls = async () => {
			try {
				const status = await SleepTimerControl.getSleepTimerStatus();
				setSleepTimerForControls(status);
			} catch (error) {
				// Ignorar errores silenciosamente
			}
		};

		updateSleepTimerForControls();
		const interval = setInterval(updateSleepTimerForControls, 1000);

		return () => clearInterval(interval);
	}, []);

	// Escuchar el evento de sleep timer finalizado
	useEffect(() => {
		const subscription = DeviceEventEmitter.addListener("sleepTimerFinished", () => {
			currentLogger.current?.info("[Sleep Timer] Timer finished - pausing playback");
			setPaused(true);
		});

		return () => {
			subscription.remove();
		};
	}, []);

	const Controls = props.controls
		? createElement(props.controls, {
				preloading: isBuffering,
				isContentLoaded: isContentLoaded,
				speedRate: speedRate,
				extraData: props.extraData,
				sleepTimer: sleepTimerForControls,

				// Nuevas Props Agrupadas
				playerMetadata: props.playlistItem?.metadata,
				playerProgress: playerProgressRef.current,
				playerAnalytics: props.playlistItem?.analytics,
				playerTimeMarkers: props.playlistItem?.timeMarkers,
				playerAds: props.playlistItem?.ads,

				//Events
				events: {
					onPress: handleOnControlsPress,
					onSlidingStart: handleOnSlidingStart,
					onSlidingComplete: handleOnSlidingComplete,
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
			{videoSource ? (
				<Video
					// @ts-ignore
					ref={refVideoPlayer}
					style={styles.audioPlayer}
					// @ts-ignore
					source={videoSource}
					// @ts-ignore
					drm={drm.current}
					// @ts-ignore
					youbora={youboraForVideo.current}
					playOffline={props.playlistItem?.playOffline}
					multiSession={playerProgressRef.current?.liveValues?.multiSession}
					focusable={false}
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
					allowsExternalPlayback={true}
					//volume={10}
					controls={false}
					ignoreSilentSwitch="ignore"
					showNotificationControls={true}
					resizeMode="contain"
					minLoadRetryCount={3}
					hideShutterView={true}
					muted={muted}
					paused={paused}
					rate={speedRate}
					//pictureInPicture (ios)
					playInBackground={true}
					playWhenInactive={true}
					poster={props?.playerMetadata?.poster}
					preventsDisplaySleepDuringVideoPlayback={false}
					progressUpdateInterval={1000}
					// Playlist integration for background auto-next
					enablePlaylistIntegration={true}
					playlistItemId={props.playlistItem?.id}
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
					onReceiveAdEvent={videoEvents.onReceiveAdEvent}
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
			) : null}

			{Controls}
		</Animated.View>
	);
}

export default AudioFlavour;
