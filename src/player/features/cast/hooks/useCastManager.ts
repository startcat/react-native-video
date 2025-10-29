import { useCallback, useEffect, useRef, useState } from "react";

import {
	CastSession,
	RemoteMediaClient,
	useCastSession,
	useRemoteMediaClient,
} from "react-native-google-cast";

import { PlayerError } from "../../../core/errors";
import { ComponentLogger, Logger, LoggerConfigBasic, LogLevel } from "../../logger";
import { CastMessageBuilder } from "../CastMessageBuilder";
import { LOGGER_CONFIG } from "../constants";
import {
	type CastContentInfo,
	type CastErrorContext,
	type CastManager,
	type CastManagerCallbacks,
	type CastManagerState,
	type MessageBuilderConfig,
} from "../types/types";
import { useCastState } from "./useCastState";

// Hook principal del Cast Manager
export function useCastManager(
	config: LoggerConfigBasic & MessageBuilderConfig = {},
	callbacks: CastManagerCallbacks = {}
): CastManager {
	const playerLogger = useRef<Logger | null>(null);
	const currentLogger = useRef<ComponentLogger | null>(null);

	const castLoggerConfig: LoggerConfigBasic = {
		enabled: config?.enabled ?? true,
		level: config?.level ?? LogLevel.INFO,
		instanceId: config?.instanceId || undefined,
	};

	if (!playerLogger.current) {
		playerLogger.current = new Logger(
			{
				enabled: castLoggerConfig.enabled,
				prefix: LOGGER_CONFIG.prefix,
				level: castLoggerConfig.level,
				useColors: true,
				includeLevelName: false,
				includeTimestamp: true,
				includeInstanceId: true,
			},
			castLoggerConfig.instanceId
		);

		currentLogger.current = playerLogger.current?.forComponent(
			"Cast Manager",
			castLoggerConfig.enabled,
			castLoggerConfig.level
		);
	}

	// this.currentLogger.info(`Initialized: ${JSON.stringify(this.config)}`);

	// Usar hooks existentes
	const castState = useCastState(castLoggerConfig);
	const nativeSession: CastSession = useCastSession();
	const nativeClient: RemoteMediaClient = useRemoteMediaClient();

	// Estado interno del manager
	const [managerState, setManagerState] = useState<CastManagerState>({
		isLoading: false,
		lastError: null,
		lastAction: null,
		canControl: false,
	});

	// Referencias para callbacks, contenido y message builder
	const callbacksRef = useRef(callbacks);
	const lastLoadedContentRef = useRef<string | null>(null);
	const messageBuilderRef = useRef<CastMessageBuilder>();
	const playbackStartedForUrlRef = useRef<string | null>(null);

	if (!messageBuilderRef.current) {
		messageBuilderRef.current = new CastMessageBuilder(config);
	}

	// Actualizar callbacks
	useEffect(() => {
		callbacksRef.current = callbacks;
	}, [callbacks]);

	// Función helper para validar si se puede controlar
	const canPerformAction = useCallback((): boolean => {
		const connectionOk = castState.connection.status === "connected";
		const sessionOk = !!nativeSession;
		const clientOk = !!nativeClient;
		const canPerform = connectionOk && sessionOk && clientOk;

		if (!canPerform) {
			currentLogger.current?.debug(
				`canPerformAction - connectionStatus: '${castState.connection.status}' (${connectionOk}), hasSession: ${sessionOk}, hasClient: ${clientOk} => ${canPerform}`
			);
		}

		return canPerform;
	}, [castState.connection.status, nativeSession, nativeClient]);

	// Función helper para manejar errores
	const handleActionError = useCallback(
		(action: string, error: any, context?: Partial<CastErrorContext>): boolean => {
			const playerError =
				error instanceof PlayerError
					? error
					: new PlayerError("PLAYER_CAST_CONNECTION_FAILED", {
							action,
							originalError: error,
						});

			// Log del error
			currentLogger.current?.error(`Action ${action} - Error: ${JSON.stringify(error)}`);

			setManagerState((prev: CastManagerState) => ({
				...prev,
				isLoading: false,
				lastError: playerError,
				lastAction: action,
			}));

			// Invocar callback genérico con contexto
			callbacksRef.current.onError?.(playerError, {
				action,
				...context,
			});

			return false;
		},
		[]
	);

	// Función helper para iniciar acción
	const startAction = useCallback((action: string) => {
		setManagerState((prev: CastManagerState) => ({
			...prev,
			isLoading: true,
			lastError: null,
			lastAction: action,
		}));
	}, []);

	// Función helper para completar acción
	const completeAction = useCallback((action: string) => {
		setManagerState((prev: CastManagerState) => ({
			...prev,
			isLoading: false,
			lastAction: action,
		}));
	}, []);

	// Método para actualizar configuración del MessageBuilder
	const updateMessageBuilderConfig = useCallback((newConfig: any) => {
		messageBuilderRef.current.updateConfig(newConfig);
	}, []);

	// Acción: Cargar contenido (usando CastMessageBuilder)
	const loadContent = useCallback(
		async (content: CastContentInfo): Promise<boolean> => {
			if (!canPerformAction()) {
				return handleActionError("action", new PlayerError("PLAYER_CAST_NOT_READY"), {
					action: "loadContent",
				});
			}

			const currentMedia = await nativeClient.getMediaStatus();

			if (
				currentMedia &&
				currentMedia.mediaInfo &&
				currentMedia.mediaInfo.contentId !== lastLoadedContentRef.current
			) {
				currentLogger.current?.debug(
					`loadContent - Guardamos el contentId del media que esta reproduciendose en cast: ${JSON.stringify(currentMedia.mediaInfo.contentId)}`
				);
				lastLoadedContentRef.current = currentMedia.mediaInfo.contentId;
			}

			// currentLogger.current?.temp(`loadContent - lastLoadedContentRef: ${JSON.stringify(lastLoadedContentRef.current)}`);
			// currentLogger.current?.temp(`loadContent - content.source.uri: ${JSON.stringify(content.source.uri)}`);
			// currentLogger.current?.temp(`loadContent - isIdle: ${JSON.stringify(currentMedia?.playerState)}`);

			// Evitar recargar el mismo contenido
			if (
				lastLoadedContentRef.current === content.source.uri &&
				currentMedia?.playerState !== "idle"
			) {
				currentLogger.current?.debug(
					`Content already loaded, skipping: ${content.source.uri}`
				);
				callbacksRef.current.onContentLoaded?.(content);
				return true;
			}

			startAction("loadContent");

			try {
				// Usar CastMessageBuilder para construir el mensaje
				const castMessage = messageBuilderRef.current?.buildCastMessage({
					source: content.source,
					manifest: content.manifest,
					drm: content.drm,
					youbora: content.youbora,
					metadata: content.metadata,
				});

				if (!castMessage || !castMessage.mediaInfo) {
					throw new PlayerError("PLAYER_CAST_MESSAGE_BUILD_FAILED");
				}

				currentLogger.current?.debug(
					`loadContent - castMessage: ${JSON.stringify(castMessage)}`
				);

				await nativeClient.loadMedia(castMessage);

				lastLoadedContentRef.current = content.source.uri;
				completeAction("loadContent");

				// Callback de éxito (se ejecutará cuando cambie el estado)
				setTimeout(() => {
					callbacksRef.current.onContentLoaded?.(content);
				}, 100);

				return true;
			} catch (error: any) {
				lastLoadedContentRef.current = null;
				playbackStartedForUrlRef.current = null;
				return handleActionError(
					"loadContent",
					error instanceof PlayerError
						? error
						: new PlayerError("PLAYER_CAST_OPERATION_FAILED"),
					{ action: "loadContent", content }
				);
			}
		},
		[canPerformAction, handleActionError, startAction, completeAction, nativeClient]
	);

	// Acción: Limpiar contenido
	const clearContent = useCallback(async (): Promise<boolean> => {
		if (!canPerformAction()) {
			return handleActionError("action", new PlayerError("PLAYER_CAST_NOT_READY"), {
				action: "clearContent",
			});
		}

		startAction("clearContent");

		try {
			await nativeClient.stop();
			lastLoadedContentRef.current = null;
			completeAction("clearContent");
			return true;
		} catch (error) {
			return handleActionError(
				"clearContent",
				error instanceof PlayerError
					? error
					: new PlayerError("PLAYER_CAST_OPERATION_FAILED"),
				{ action: "clearContent" }
			);
		}
	}, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);

	// Acción: Play
	const play = useCallback(async (): Promise<boolean> => {
		if (!canPerformAction()) {
			return handleActionError("action", new PlayerError("PLAYER_CAST_NOT_READY"), {
				action: "play",
			});
		}

		startAction("play");

		try {
			await nativeClient.play();
			completeAction("play");
			return true;
		} catch (error) {
			return handleActionError(
				"play",
				error instanceof PlayerError
					? error
					: new PlayerError("PLAYER_CAST_OPERATION_FAILED"),
				{ action: "play" }
			);
		}
	}, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);

	// Acción: Pause
	const pause = useCallback(async (): Promise<boolean> => {
		if (!canPerformAction()) {
			return handleActionError("action", new PlayerError("PLAYER_CAST_NOT_READY"), {
				action: "pause",
			});
		}

		startAction("pause");

		try {
			await nativeClient.pause();
			completeAction("pause");
			return true;
		} catch (error) {
			return handleActionError(
				"pause",
				error instanceof PlayerError
					? error
					: new PlayerError("PLAYER_CAST_OPERATION_FAILED"),
				{ action: "pause" }
			);
		}
	}, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);

	// Acción: Seek
	const seek = useCallback(
		async (position: number): Promise<boolean> => {
			if (!canPerformAction()) {
				return handleActionError("action", new PlayerError("PLAYER_CAST_NOT_READY"), {
					action: "seek",
					position,
				});
			}

			startAction("seek");

			try {
				await nativeClient.seek({ position });
				completeAction("seek");

				// Callback de seek completado
				setTimeout(() => {
					callbacksRef.current.onSeekCompleted?.(position);
				}, 100);

				return true;
			} catch (error) {
				return handleActionError(
					"seek",
					error instanceof PlayerError
						? error
						: new PlayerError("PLAYER_CAST_OPERATION_FAILED"),
					{ action: "seek", position }
				);
			}
		},
		[canPerformAction, handleActionError, startAction, completeAction, nativeClient]
	);

	// Acción: Skip Forward
	const skipForward = useCallback(
		async (seconds: number = 15): Promise<boolean> => {
			const newPosition = castState.media.currentTime + seconds;
			return seek(newPosition);
		},
		[seek, castState.media.currentTime]
	);

	// Acción: Skip Backward
	const skipBackward = useCallback(
		async (seconds: number = 15): Promise<boolean> => {
			const newPosition = Math.max(0, castState.media.currentTime - seconds);
			return seek(newPosition);
		},
		[seek, castState.media.currentTime]
	);

	// Acción: Stop
	const stop = useCallback(async (): Promise<boolean> => {
		if (!canPerformAction()) {
			return handleActionError("action", new PlayerError("PLAYER_CAST_NOT_READY"), {
				action: "stop",
			});
		}

		startAction("stop");

		try {
			await nativeClient.stop();
			lastLoadedContentRef.current = null;
			completeAction("stop");
			return true;
		} catch (error) {
			return handleActionError(
				"stop",
				error instanceof PlayerError
					? error
					: new PlayerError("PLAYER_CAST_OPERATION_FAILED"),
				{ action: "stop" }
			);
		}
	}, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);

	// Acción: Mute
	const mute = useCallback(async (): Promise<boolean> => {
		if (!canPerformAction()) {
			return handleActionError("action", new PlayerError("PLAYER_CAST_NOT_READY"), {
				action: "mute",
			});
		}

		startAction("mute");

		try {
			await nativeSession.setMute(true);
			completeAction("mute");

			// Callback de mute completado
			setTimeout(() => {
				callbacksRef.current.onVolumeChanged?.(0, true);
			}, 100);

			return true;
		} catch (error) {
			return handleActionError(
				"mute",
				error instanceof PlayerError
					? error
					: new PlayerError("PLAYER_CAST_OPERATION_FAILED"),
				{ action: "mute" }
			);
		}
	}, [canPerformAction, handleActionError, startAction, completeAction, nativeSession]);

	// Acción: Unmute
	const unmute = useCallback(async (): Promise<boolean> => {
		if (!canPerformAction()) {
			return handleActionError("action", new PlayerError("PLAYER_CAST_NOT_READY"), {
				action: "unmute",
			});
		}

		startAction("unmute");

		try {
			await nativeSession.setMute(false);
			completeAction("unmute");

			// Callback de unmute completado
			setTimeout(async () => {
				try {
					const currentVolume = await nativeSession.getVolume();
					callbacksRef.current.onVolumeChanged?.(currentVolume, false);
				} catch (error) {
					currentLogger.current?.error(`Action Unmute - Error: ${JSON.stringify(error)}`);
					callbacksRef.current.onVolumeChanged?.(0.5, false); // Fallback volume
				}
			}, 100);

			return true;
		} catch (error) {
			return handleActionError(
				"unmute",
				error instanceof PlayerError
					? error
					: new PlayerError("PLAYER_CAST_OPERATION_FAILED"),
				{ action: "unmute" }
			);
		}
	}, [canPerformAction, handleActionError, startAction, completeAction, nativeSession]);

	// Acción: Set Volume
	const setVolume = useCallback(
		async (level: number): Promise<boolean> => {
			if (!canPerformAction()) {
				return handleActionError("action", new PlayerError("PLAYER_CAST_NOT_READY"), {
					action: "setVolume",
					level,
				});
			}

			const clampedLevel = Math.max(0, Math.min(1, level));
			startAction("setVolume");

			try {
				await nativeSession.setVolume(clampedLevel);
				completeAction("setVolume");

				// Callback de cambio de volumen
				setTimeout(() => {
					callbacksRef.current.onVolumeChanged?.(clampedLevel, castState.volume.isMuted);
				}, 100);

				return true;
			} catch (error) {
				return handleActionError(
					"setVolume",
					error instanceof PlayerError
						? error
						: new PlayerError("PLAYER_CAST_OPERATION_FAILED"),
					{ action: "setVolume", level }
				);
			}
		},
		[
			canPerformAction,
			handleActionError,
			startAction,
			completeAction,
			nativeSession,
			castState.volume.isMuted,
		]
	);

	// Acción: Set Audio Track
	const setAudioTrack = useCallback(
		async (trackId: number): Promise<boolean> => {
			if (!canPerformAction()) {
				return handleActionError("action", new PlayerError("PLAYER_CAST_NOT_READY"), {
					action: "setAudioTrack",
					trackId,
				});
			}

			startAction("setAudioTrack");

			try {
				await nativeClient.setActiveTrackIds([trackId]);
				completeAction("setAudioTrack");
				return true;
			} catch (error) {
				return handleActionError(
					"setAudioTrack",
					error instanceof PlayerError
						? error
						: new PlayerError("PLAYER_CAST_OPERATION_FAILED"),
					{ action: "setAudioTrack", trackId }
				);
			}
		},
		[canPerformAction, handleActionError, startAction, completeAction, nativeClient]
	);

	// Acción: Set Subtitle Track
	const setSubtitleTrack = useCallback(
		async (trackId: number): Promise<boolean> => {
			if (!canPerformAction()) {
				return handleActionError("action", new PlayerError("PLAYER_CAST_NOT_READY"), {
					action: "setSubtitleTrack",
					trackId,
				});
			}

			startAction("setSubtitleTrack");

			try {
				// Mantener track de audio actual y añadir track de subtítulos
				const currentAudioId = castState.media.audioTrack?.id;
				const activeIds = currentAudioId ? [currentAudioId, trackId] : [trackId];

				await nativeClient.setActiveTrackIds(activeIds);
				completeAction("setSubtitleTrack");
				return true;
			} catch (error) {
				return handleActionError(
					"setSubtitleTrack",
					error instanceof PlayerError
						? error
						: new PlayerError("PLAYER_CAST_OPERATION_FAILED"),
					{ action: "setSubtitleTrack", trackId }
				);
			}
		},
		[
			canPerformAction,
			handleActionError,
			startAction,
			completeAction,
			nativeClient,
			castState.media.audioTrack,
		]
	);

	const setActiveTrackIds = useCallback(
		async (trackIds: number[]): Promise<boolean> => {
			if (!canPerformAction()) {
				return handleActionError("action", new PlayerError("PLAYER_CAST_NOT_READY"), {
					action: "setActiveTrackIds",
					trackIds,
				});
			}

			startAction("setActiveTrackIds");

			try {
				await nativeClient.setActiveTrackIds(trackIds);
				completeAction("setActiveTrackIds");
				return true;
			} catch (error) {
				return handleActionError(
					"setActiveTrackIds",
					error instanceof PlayerError
						? error
						: new PlayerError("PLAYER_CAST_OPERATION_FAILED"),
					{ action: "setActiveTrackIds", trackIds }
				);
			}
		},
		[canPerformAction, handleActionError, startAction, completeAction, nativeClient]
	);

	// Acción: Disable Subtitles
	const disableSubtitles = useCallback(async (): Promise<boolean> => {
		if (!canPerformAction()) {
			return handleActionError("action", new PlayerError("PLAYER_CAST_NOT_READY"), {
				action: "disableSubtitles",
			});
		}

		startAction("disableSubtitles");

		try {
			// Solo mantener track de audio
			const currentAudioId = castState.media.audioTrack?.id;
			const activeIds = currentAudioId ? [currentAudioId] : [];

			await nativeClient.setActiveTrackIds(activeIds);
			completeAction("disableSubtitles");
			return true;
		} catch (error) {
			return handleActionError(
				"disableSubtitles",
				error instanceof PlayerError
					? error
					: new PlayerError("PLAYER_CAST_OPERATION_FAILED"),
				{ action: "disableSubtitles" }
			);
		}
	}, [
		canPerformAction,
		handleActionError,
		startAction,
		completeAction,
		nativeClient,
		castState.media.audioTrack,
	]);

	// Actualizar estado de control
	useEffect(() => {
		setManagerState((prev: CastManagerState) => ({
			...prev,
			canControl: canPerformAction(),
		}));
	}, [canPerformAction]);

	// Callbacks de eventos basados en cambios de estado: onPlaybackStarted, onPlaybackEnded
	useEffect(() => {
		const { media } = castState;
		const currentCallbacks = callbacksRef.current;

		// currentLogger.current?.temp(`(useEffect) Cast State Media - isPlaying: ${media.isPlaying}, isIdle: ${media.isIdle}, url: ${media.url}, ref: ${lastLoadedContentRef.current}`);

		// Detectar inicio de reproducción -> Primera reproducción de un nuevo contenido
		if (
			media.isPlaying &&
			!media.isIdle &&
			currentCallbacks.onPlaybackStarted &&
			(!lastLoadedContentRef.current || lastLoadedContentRef.current !== media.url)
		) {
			currentLogger.current?.info(
				`Firing onPlaybackStarted callback - media.isPlaying: ${media.isPlaying}, media.isIdle: ${media.isIdle}`
			);
			lastLoadedContentRef.current = media.url;
			currentCallbacks.onPlaybackStarted();
		}

		// Detectar fin de reproducción
		if (media.isIdle && lastLoadedContentRef.current && currentCallbacks.onPlaybackEnded) {
			lastLoadedContentRef.current = null;
			currentCallbacks.onPlaybackEnded();
		}
	}, [castState.media.isPlaying, castState.media.isIdle, castState.media.url]);

	// Callback de cambio de volumen: onVolumeChanged
	useEffect(() => {
		const currentCallbacks = callbacksRef.current;
		if (currentCallbacks.onVolumeChanged) {
			currentCallbacks.onVolumeChanged(castState.volume.level, castState.volume.isMuted);
		}
	}, [castState.volume.level, castState.volume.isMuted]);

	return {
		// Acciones
		loadContent,
		clearContent,
		play,
		pause,
		seek,
		skipForward,
		skipBackward,
		stop,
		mute,
		unmute,
		setVolume,
		setAudioTrack,
		setSubtitleTrack,
		setActiveTrackIds,
		disableSubtitles,
		updateMessageBuilderConfig,

		// Estado
		state: managerState,
	};
}
