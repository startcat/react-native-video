import React, { createElement, useCallback, useEffect, useRef, useState } from "react";
import BackgroundTimer from "react-native-background-timer";
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
	const sleepTimerObj = useRef<ReturnType<typeof setTimeout> | null>(null);
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

		// Reset progress managers
		vodProgressManagerRef.current?.reset();
		dvrProgressManagerRef.current?.reset();

		// Crear playerProgress desde el playlistItem
		playerProgressRef.current = {
			currentTime: props.playlistItem?.initialState?.startPosition || 0,
			duration: props.playlistItem?.initialState?.duration || 0,
			isLive: props.playlistItem?.isLive,
			isPaused: props.initialState?.isPaused,
			isMuted: props.initialState?.isMuted,
			volume: props.initialState?.volume,
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
			startPosition: props.playlistItem?.initialState?.startPosition || 0,
			isLive: !!props.playlistItem?.isLive,
			isCast: false,
			headers: props.playlistItem.resolvedSources.local?.headers as
				| Record<string, string>
				| undefined,
			onSourceChanged: onSourceChanged,
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

			// Solo actualizar sliderValues si NO es TUDUM
			if (props.playlistItem?.type !== "TUDUM") {
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
			}
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
			dvrProgressManagerRef.current = new DVRProgressManagerClass({
				logger: props.playerContext?.logger,
				loggerEnabled: props.logger?.progressManager?.enabled,
				loggerLevel: props.logger?.progressManager?.level,
				playbackType: playerProgressRef.current?.liveValues?.playbackType,
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
	 *  Sleep Timer
	 *
	 */

	const cancelSleepTimer = () => {
		currentLogger.current?.info(`Cancel sleep timer`);

		if (sleepTimerObj.current) {
			BackgroundTimer.clearTimeout(sleepTimerObj.current);
		}
	};

	const refreshSleepTimer = (value: number) => {
		currentLogger.current?.info(`Creating sleep timer for ${value} seconds`);

		if (sleepTimerObj.current) {
			BackgroundTimer.clearTimeout(sleepTimerObj.current);
		}

		sleepTimerObj.current = BackgroundTimer.setTimeout(() => {
			try {
				currentLogger.current?.debug(`onSleepTimer Done...`);

				if (refVideoPlayer.current) {
					currentLogger.current?.debug(`onSleepTimer Done... calling pause`);
					refVideoPlayer.current?.pause();
					cancelSleepTimer();
					setPaused(true);
				} else {
					currentLogger.current?.debug(`onSleepTimer Done... cant acces refVideoPlayer`);
					refreshSleepTimer(2000);
				}
			} catch (error: any) {
				currentLogger.current?.error(`Sleep timer execution failed: ${error?.message}`);
				cancelSleepTimer();
			}
		}, value * 1000);
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

			if (id === CONTROL_ACTION.SLEEP && (value === 0 || !value)) {
				// Desactivamos el sleeper
				cancelSleepTimer();
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
		EventRegister.emit("audioPlayerProgress", {
			preloading: isBuffering,
			isContentLoaded: isContentLoaded,
			speedRate: speedRate,
			extraData: props.playlistItem?.extraData,
			// Nuevas Props Agrupadas
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

		// Solo procesar onLoad si NO es TUDUM
		if (props.playlistItem?.type !== "TUDUM" && !isContentLoaded) {
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

			if (props.events?.onStart) {
				props.events.onStart();
			}

			// Seek inicial al cargar un live con DVR
			if (sourceRef.current?.isDVR && dvrProgressManagerRef.current) {
				try {
					dvrProgressManagerRef.current.checkInitialSeek("player", false);
				} catch (error: any) {
					currentLogger.current?.error(`DVR checkInitialSeek failed: ${error?.message}`);
					handleOnInternalError(handleErrorException(error, "PLAYER_SEEK_FAILED"));
				}
			}
		} else if (props.playlistItem?.type === "TUDUM") {
			currentLogger.current?.info(`handleOnLoad - Tudum loaded, duration: ${e.duration}`);
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
		currentLogger.current?.debug(
			`handleOnProgress - playlistItem type: ${props.playlistItem?.type}, currentTime: ${e.currentTime}, seekableDuration: ${e.seekableDuration}`
		);

		if (typeof e.currentTime === "number" && currentTime !== e.currentTime) {
			// Trigger para el cambio de estado
			setCurrentTime(e.currentTime);
		}

		// Solo procesar progreso si NO es TUDUM
		if (props.playlistItem?.type !== "TUDUM") {
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
				`handleOnProgress: Ignoring progress for TUDUM - currentTime: ${e.currentTime}, duration: ${e.seekableDuration}`
			);
		}
	};

	const handleOnEnd = () => {
		currentLogger.current?.info(
			`handleOnEnd: playlistItem type ${props.playlistItem?.type}, id: ${props.playlistItem?.id}`
		);
		
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

	const Controls = props.controls
		? createElement(props.controls, {
				preloading: isBuffering,
				isContentLoaded: isContentLoaded,
				speedRate: speedRate,
				extraData: props.extraData,

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
