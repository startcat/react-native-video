import React, { createElement, useCallback, useEffect, useRef, useState } from "react";
import BackgroundTimer from "react-native-background-timer";
import { EventRegister } from "react-native-event-listeners";
import Animated, { useSharedValue } from "react-native-reanimated";
import {
	type OnBufferData,
	type OnLoadData,
	type OnProgressData,
	type OnReceiveAdEventData,
	type OnVideoErrorData,
} from "../../../types";

import Video, { type VideoRef } from "../../../Video";
import {
	type AudioControlsProps,
	type IPlayerProgress,
	type ProgressUpdateData,
	type SliderValues,
} from "../../types";

import { PlayerError, handleErrorException, mapVideoErrorToPlayerError } from "../../core/errors";

import { useIsBuffering } from "../../core/buffering";

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

	const [currentTime, setCurrentTime] = useState<number>(props.playerProgress?.currentTime || 0);
	const [paused, setPaused] = useState<boolean>(!!props.playerProgress?.isPaused);
	const [muted, setMuted] = useState<boolean>(!!props?.playerProgress?.isMuted);
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

	// Tudum
	const tudumRef = useRef<TudumClass | null>(null);

	// VOD Progress Manager
	const vodProgressManagerRef = useRef<VODProgressManagerClass | null>(null);

	// DVR Progress Manager
	const dvrProgressManagerRef = useRef<DVRProgressManagerClass | null>(null);

	// Control para evitar mezcla de sources
	const currentSourceType = useRef<"tudum" | "content" | null>(null);
	const pendingContentSource = useRef<onSourceChangedProps | null>(null);

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

			// Crear sourceRef si no existe
			if (!sourceRef.current) {
				sourceRef.current = new SourceClass({
					id: props.playerMetadata?.id,
					title: props.playerMetadata?.title,
					artist: props.playerMetadata?.artist,
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
					artist: props.playerMetadata?.artist,
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
				return handleOnInternalError(
					handleErrorException(error, "PLAYER_MEDIA_LOAD_FAILED")
				);
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
					artist: props.playerMetadata?.artist,
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
					artist: props.playerMetadata?.artist,
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
	 *  Sleep Timer
	 *
	 */

	const cancelSleepTimer = () => {
		currentLogger.current?.info("Cancel sleep timer");

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
				currentLogger.current?.debug("onSleepTimer Done...");

				if (refVideoPlayer.current) {
					currentLogger.current?.debug("onSleepTimer Done... calling pause");
					refVideoPlayer.current?.pause();
					cancelSleepTimer();
					setPaused(true);
				} else {
					currentLogger.current?.debug("onSleepTimer Done... cant acces refVideoPlayer");
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
				const data: ICommonData = {};

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
			extraData: props.extraData,
			// Nuevas Props Agrupadas
			playerMetadata: props.playerMetadata,
			playerProgress: {
				...props.playerProgress,
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
			playerAnalytics: props.playerAnalytics,
			playerTimeMarkers: props.playerTimeMarkers,
			//Events
			events: props.events,
		} as AudioControlsProps);
	}, [
		currentTime,
		sliderValues,
		props.playerProgress,
		props.playerMetadata,
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
		// currentLogger.current?.temp(`handleOnLoad - currentSourceType: ${currentSourceType.current}`);
		// currentLogger.current?.temp(`handleOnLoad - isContentLoaded: ${isContentLoaded}`);
		// currentLogger.current?.temp(`handleOnLoad - isChangingSource: ${isChangingSource.current}`);
		// currentLogger.current?.temp(`handleOnLoad - duration: ${e.duration}, currentTime: ${e.currentTime}`);
		// currentLogger.current?.temp(`handleOnLoad - isDVR: ${sourceRef.current?.isDVR}, dvrWindowSeconds: ${sourceRef.current?.dvrWindowSeconds}`);

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

			// Seek inicial al cargar un live con DVR
			if (sourceRef.current?.isDVR && dvrProgressManagerRef.current) {
				try {
					dvrProgressManagerRef.current.checkInitialSeek("player");
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

	const handleOnReceiveAdEvent = (e: OnReceiveAdEventData) => {
		currentLogger.current?.debug(`[ADS] onReceiveAdEvent: ${e.event}`, {
			event: e.event,
			data: e.data,
		});

		if (e.event === "STARTED") {
			currentLogger.current?.info("[ADS] Ad started");
		} else if (
			e.event === "COMPLETED" ||
			e.event === "ALL_ADS_COMPLETED" ||
			e.event === "SKIPPED" ||
			e.event === "USER_CLOSE"
		) {
			currentLogger.current?.info(`[ADS] Ad finished: ${e.event}`);
		} else if (e.event === "ERROR") {
			currentLogger.current?.error("[ADS] Ad error", { data: e.data });
		}
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
				`handleOnProgress: Ignoring progress for ${currentSourceType.current} - currentTime: ${e.currentTime}, duration: ${e.seekableDuration}`
			);
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
				playerMetadata: props.playerMetadata,
				playerProgress: playerProgressRef.current,
				playerAnalytics: props.playerAnalytics,
				playerTimeMarkers: props.playerTimeMarkers,
				playerAds: props.playerAds,

				//Events
				events: {
					onPress: handleOnControlsPress,
					onSlidingStart: handleOnSlidingStart,
					onSlidingComplete: handleOnSlidingComplete,
				},
			})
		: null;

	// Estilos dinámicos para el contenedor
	const containerDynamicStyle = {
		height: audioPlayerHeight,
		backgroundColor: props.backgroundColor || styles.container.backgroundColor,
		borderColor: props.topDividerColor,
		borderTopWidth: props.topDividerColor ? 1 : 0,
	};

	return (
		<Animated.View style={[styles.audioContainer, containerDynamicStyle]}>
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
					playOffline={props.playOffline}
					multiSession={props.playerProgress?.liveValues?.multiSession}
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
					adTagUrl={props?.playerAds?.adTagUrl}
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
			) : null}

			{Controls}
		</Animated.View>
	);
}

export default AudioFlavour;
