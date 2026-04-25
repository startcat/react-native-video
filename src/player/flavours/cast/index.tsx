import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import { Overlay } from "../../components/overlay";
import { BackgroundPoster } from "../../components/poster";

import { styles } from "../styles";

import {
	CONTROL_ACTION,
	DVR_PLAYBACK_TYPE,
	LogLevel,
	PLAYER_MENU_DATA_TYPE,
	YOUBORA_FORMAT,
	type CastFlavourProps,
	type ICommonData,
	type IDrm,
	type IMappedYoubora,
	type IPlayerMenuData,
	type IPlayerProgress,
	type LoggerConfigBasic,
	type ProgressUpdateData,
	type SliderValues,
} from "../../types";

import {
	DVRProgressManagerClass,
	VODProgressManagerClass,
	type ModeChangeData,
	type ProgramChangeData,
} from "../../core/progress";

import { ComponentLogger } from "../../features/logger";

import { getTrackId, getTrackIndex, mergeCastMenuData } from "../../utils";

import { useIsBuffering } from "../../core/buffering";
import { SourceClass, type onSourceChangedProps } from "../../modules/source";
import { TudumClass } from "../../modules/tudum";

// Importar hooks individuales de Cast como en AudioCastFlavour
import {
	useCastConnected,
	useCastManager,
	useCastMedia,
	useCastMonitor,
	useCastPlaying,
	useCastProgress,
	useCastVolume,
} from "../../features/cast/hooks";

import { handleErrorException, PlayerError } from "../../core/errors";
import { type CastContentInfo, type CastTrackInfo } from "../../features/cast/types/types";

/**
 * Strip `start` and `end` query parameters from a live DVR manifest URL before
 * handing it to the Cast receiver. The consumer adds those params to anchor
 * the DVR window at a specific program; the receiver reapplies them on every
 * manifest refresh, teleporting playback back to the anchor after each brief
 * buffer. For Cast live playback the intent is always live edge (the flavour
 * passes startTime: -1), so the anchor is redundant and only causes drift.
 *
 * Uses pure string manipulation rather than the URL/URLSearchParams APIs,
 * because the React Native polyfill implements those only partially —
 * `searchParams.delete` turned out to be a no-op on some RN runtimes,
 * leaving the param in place and appending a stray `&` to the output.
 */
function stripLiveStartAnchorForCast(uri: string): string {
	if (!uri || typeof uri !== "string") return uri;
	const qIdx = uri.indexOf("?");
	if (qIdx === -1) return uri;

	const base = uri.substring(0, qIdx);
	const query = uri.substring(qIdx + 1);
	if (!query) return base;

	const kept = query
		.split("&")
		.filter((pair) => {
			if (!pair) return false;
			const key = pair.split("=", 1)[0];
			return key !== "start" && key !== "end";
		});

	return kept.length > 0 ? `${base}?${kept.join("&")}` : base;
}

export function CastFlavour(props: CastFlavourProps): React.ReactElement {
	const currentLogger = useRef<ComponentLogger | null>(null);

	const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
	const [isLoadingContent, setIsLoadingContent] = useState<boolean>(false);
	const [hasTriedLoading, setHasTriedLoading] = useState<boolean>(false);
	const [currentTime, setCurrentTime] = useState<number>(props.playerProgress?.currentTime || 0);
	const [paused, setPaused] = useState<boolean>(!!props.playerProgress?.isPaused);
	const [muted, setMuted] = useState<boolean>(!!props?.playerProgress?.isMuted);
	const [buffering, setBuffering] = useState<boolean>(false);
	const [menuData, setMenuData] = useState<Array<IPlayerMenuData>>();
	const [audioIndex, setAudioIndex] = useState<number>(props.audioIndex!);
	const [subtitleIndex, setSubtitleIndex] = useState<number>(props.subtitleIndex!);
	const [sliderValuesUpdate, setSliderValuesUpdate] = useState<number>(0);
	const [isLiveProgramRestricted, setIsLiveProgramRestricted] = useState<boolean>(false);

	// Ad break guard — equivalent to isPlayingAdRef in normal flavour
	const [isPlayingAd, setIsPlayingAd] = useState<boolean>(false);
	const isPlayingAdRef = useRef<boolean>(false);

	// Estado para metadatos sincronizados desde Cast (para contenido cargado desde otro dispositivo)
	const [syncedMetadata, setSyncedMetadata] = useState(props.playerMetadata);
	// Referencia para trackear la URL que nosotros cargamos localmente
	const localLoadedUrlRef = useRef<string | null>(null);
	// Referencia para indicar si estamos mostrando contenido remoto (cargado desde otro dispositivo)
	const isRemoteContentRef = useRef<boolean>(false);

	const isChangingSource = useRef<boolean>(true);
	const sliderValues = useRef<SliderValues>();
	const playerProgressRef = useRef<IPlayerProgress>();
	const youboraForVideo = useRef<IMappedYoubora>();
	const drm = useRef<IDrm>();

	// Track current audio/subtitle indices (para el menú)
	const currentAudioIndexRef = useRef<number>(props.audioIndex!);
	const currentSubtitleIndexRef = useRef<number>(props.subtitleIndex!);

	// Ref para evitar bucle infinito en sincronización de tracks remotos
	const isLocalTrackChangeRef = useRef<boolean>(false);

	// Ref para indicar que nos hemos unido a una sesión Cast existente (no hemos cargado nosotros el contenido)
	// En este caso, no debemos sobrescribir los tracks activos del Cast con nuestras preferencias locales
	const isJoiningExistingSessionRef = useRef<boolean>(false);

	// Sanity check: last known valid DVR duration to detect ad garbage data
	// without native rebuild (isPlayingAdRef always false in that scenario)
	const lastValidDVRDurationRef = useRef<number>(0);

	const castLoggerConfig: LoggerConfigBasic = {
		enabled: props.logger?.cast?.enabled ?? true,
		level: props.logger?.cast?.level ?? LogLevel.INFO,
		instanceId: props.playerContext?.getInstanceId() || undefined,
	};

	// Logger
	if (!currentLogger.current && props.playerContext?.logger) {
		currentLogger.current = props.playerContext?.logger?.forComponent(
			"Cast Flavour",
			castLoggerConfig.enabled,
			castLoggerConfig.level
		);
	}

	// Source
	const sourceRef = useRef<SourceClass | null>(null);

	// Tudum
	const tudumRef = useRef<TudumClass | null>(null);

	// VOD Progress Manager
	const vodProgressManagerRef = useRef<VODProgressManagerClass | null>(null);

	// DVR Progress Manager
	const dvrProgressManagerRef = useRef<DVRProgressManagerClass | null>(null);

	// After an ad break ends on live/DVR content, the receiver starts at position 0
	// of the DVR window (because we don't send startTime for live to avoid iOS bridge
	// issues with negative values). This flag triggers a goToLive() after the first
	// post-ad progress update so the DVR manager has fresh seekableRange data.
	const needsPostAdGoToLiveRef = useRef(false);

	// Post-live-edge-seek watchdog. Some Cast receivers (observed on Chromecast
	// with CAF live/DVR + VMAP prerolls) accept the seek and report progress
	// at the live edge for a brief window (~100-500 ms), then *internally reset*
	// position to the start of the DVR window — producing a sudden jump of
	// several minutes with no client-side trigger. When the DVR manager detects
	// this drift (`_isLiveEdgePosition: true → false`) inside the watch window
	// and no user-initiated seek happened in between, re-fire the seek. Capped
	// at 2 retries to avoid fighting a receiver that genuinely can't hold the
	// edge (or a user who just moved the slider off). Disarmed on a real user
	// seek or when the window expires.
	const postSeekWatchdogRef = useRef<{ until: number; retriesLeft: number } | null>(null);
	const lastUserSeekAtRef = useRef<number>(0);

	// Control para evitar mezcla de sources
	const currentSourceType = useRef<"tudum" | "content" | null>(null);
	const pendingContentSource = useRef<onSourceChangedProps | null>(null);

	// USAR HOOKS INDIVIDUALES DE CAST como en AudioCastFlavour
	const castConnected = useCastConnected(castLoggerConfig);
	const castMedia = useCastMedia(castLoggerConfig);
	const castPlaying = useCastPlaying(castLoggerConfig);
	const castProgress = useCastProgress(castLoggerConfig);
	const castVolume = useCastVolume(castLoggerConfig);

	// Sync ad playing state from cast media status.
	//
	// The receiver can briefly emit `isPlayingAd=true` with `adBreakId=null`
	// during a LOAD (seen on stream-to-stream switch: the VMAP metadata arrives
	// before the ad break has a stable id). Trusting that phantom flag triggered
	// a loop: ad-sync → needsPostAdGoToLiveRef=true → progress simulation clears
	// ad state + fires seekToLiveEdge → seek fails (receiver still loading) →
	// handleOnError modal → and because upstream `castMedia.isPlayingAd` stays
	// true, the useEffect re-fires and the cycle repeats (~40 times in 2 s).
	// Gate on `adBreakId !== null` so the flag only flips when an actual ad
	// break is reported.
	useEffect(() => {
		const adBreakId = castMedia.adBreakStatus?.adBreakId ?? null;
		const castIsPlayingAd = castMedia.isPlayingAd && adBreakId !== null;
		if (castIsPlayingAd !== isPlayingAdRef.current) {
			const wasPlayingAd = isPlayingAdRef.current;
			currentLogger.current?.info(
				`Ad playing state changed: ${wasPlayingAd} → ${castIsPlayingAd}`
			);
			isPlayingAdRef.current = castIsPlayingAd;
			setIsPlayingAd(castIsPlayingAd);

			// Notify host — same contract as normal flavour
			props.events?.onAdPlayingChange?.(castIsPlayingAd);
			props.events?.onChangeCommonData?.({ isPlayingAd: castIsPlayingAd });

			// After an ad break ends for live/DVR content, schedule a seek to live edge.
			// The receiver starts at position 0 of the DVR window when no startTime is set,
			// so we need to explicitly seek to the live edge once post-ad progress data
			// flows into the DVR manager (handled in the progress simulation useEffect).
			if (wasPlayingAd && !castIsPlayingAd && sourceRef.current?.isDVR) {
				currentLogger.current?.info(
					"Ad break ended for live/DVR content — will goToLive after next progress update"
				);
				needsPostAdGoToLiveRef.current = true;
			}
		}
		// `props.events` omitted on purpose. Parent consumers typically
		// rebuild the `events` object inline on every render, so including
		// it here re-fires this effect on every parent render — compounded
		// with the Cast SDK's 1 Hz stream-position setState, that eventually
		// tripped React's "Maximum update depth exceeded" safeguard. The
		// closure still reads the latest callback because castMedia changes
		// trigger re-creation of the effect function.
	}, [castMedia.isPlayingAd, castMedia.adBreakStatus?.adBreakId]);

	// CREATE REFS FOR MAIN CALLBACKS to avoid circular dependencies
	const onLoadRef = useRef<(e: { currentTime: number; duration: number }) => void>();
	const onEndRef = useRef<() => void>();
	const onErrorRef = useRef<(error: PlayerError) => void>();

	// CALLBACKS DEL CAST MANAGER
	const onContentLoadedCallback = useCallback(
		(content: CastContentInfo) => {
			currentLogger.current?.info("Cast Manager - Content loaded:", content.source.uri);
			setIsLoadingContent(false);
			isChangingSource.current = false;
			setIsContentLoaded(true);
			setHasTriedLoading(true);

			// Simular onLoad con duración si está disponible
			setTimeout(() => {
				if (castProgress.duration && castProgress.duration > 0) {
					const duration = castProgress.duration;
					currentLogger.current?.debug(
						`onContentLoadedCallback - calling onLoad with duration: ${duration}`
					);
					onLoadRef.current?.({
						currentTime: content.metadata.startPosition || 0,
						duration: duration,
					});
				}
			}, 100);
		},
		[castProgress.duration]
	);

	const onErrorCallback = useCallback((error: PlayerError, content: CastContentInfo) => {
		currentLogger.current?.error(`Cast Manager - Content load error: ${error}`);
		setIsLoadingContent(false);
		onErrorRef.current?.(error);
	}, []);

	const onPlaybackStartedCallback = useCallback(() => {
		currentLogger.current?.debug(
			`Cast Manager - Playback started (isContentLoaded: ${isContentLoaded})`
		);
		setPaused(false);
		setBuffering(false);

		// setIsContentLoaded(true) fallback removed on purpose.
		// onContentLoadedCallback is the authoritative signal that the Cast
		// receiver accepted our loadContent call. onPlaybackStartedCallback
		// also fires when the receiver is playing the *previous* stream
		// during a fresh mount — accepting that as "content loaded" caused
		// stale castProgress to feed into DVR manager and consume the
		// pending live-edge seek on old-stream coordinates. If there is a
		// race where onContentLoadedCallback genuinely does not fire, that
		// is a bug in the Cast Manager layer and should be surfaced, not
		// masked here.
	}, [isContentLoaded]);

	const onPlaybackEndedCallback = useCallback((): boolean => {
		// Guard: for live/DVR content, the receiver going IDLE during ad breaks
		// is NOT a real end-of-content event. Suppress early before reaching handleOnEnd.
		if (sourceRef.current?.isLive || sourceRef.current?.isDVR) {
			currentLogger.current?.info(
				"Cast Manager - Playback ended suppressed: live/DVR content does not end via IDLE"
			);
			return false; // Suppressed — handleOnEnd not called
		}
		currentLogger.current?.info("Cast Manager - Playback ended");
		onEndRef.current?.();
		return true;
	}, []);

	const onSeekCompletedCallback = useCallback((position: number) => {
		currentLogger.current?.debug(`Cast Manager - Seek completed: ${position}`);
		setCurrentTime(position);
	}, []);

	const onVolumeChangedCallback = useCallback((level: number, isMuted: boolean) => {
		currentLogger.current?.debug(`Cast Manager - Volume changed: ${level}, isMuted ${isMuted}`);
		setMuted(isMuted);
	}, []);

	// MEMORIZAR CONFIG
	const castManagerConfig = useMemo(
		() => ({
			enableYoubora: true,
			enableAds: true,
			defaultStartPosition: 0,
		}),
		[]
	);

	// MEMORIZAR CALLBACKS OBJECT
	const castManagerCallbacks = useMemo(
		() => ({
			onContentLoaded: onContentLoadedCallback,
			onError: onErrorCallback,
			onPlaybackStarted: onPlaybackStartedCallback,
			onPlaybackEnded: onPlaybackEndedCallback,
			onSeekCompleted: onSeekCompletedCallback,
			onVolumeChanged: onVolumeChangedCallback,
		}),
		[
			onContentLoadedCallback,
			onErrorCallback,
			onPlaybackStartedCallback,
			onPlaybackEndedCallback,
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

	// Hook para el estado de buffering
	const isBuffering = useIsBuffering({
		buffering: buffering || isLoadingContent,
		paused: paused,
		onBufferingChange: props.events?.onBuffering,
	});

	// MONITOR DE CAST como en AudioCastFlavour
	useCastMonitor(castLoggerConfig, {
		onConnect: () => {
			currentLogger.current?.info("Cast Monitor onConnect");
		},
		onDisconnect: () => {
			currentLogger.current?.info("Cast Monitor onDisconnect");
			setIsContentLoaded(false);
			setIsLoadingContent(false);
			setHasTriedLoading(false);
		},
		onPlay: () => {
			currentLogger.current?.info("Cast Monitor onPlay");
			setPaused(false);
			setBuffering(false);
		},
		onPause: () => {
			currentLogger.current?.info("Cast Monitor onPause");
			setPaused(true);
		},
		onError: (error: PlayerError) => {
			currentLogger.current?.info(`Cast Monitor onError ${JSON.stringify(error)}`);
			setIsLoadingContent(false);
			handleOnError(error);
		},
		onAudioTrackChange: (track: CastTrackInfo | null) => {
			if (track !== null && menuData) {
				currentLogger.current?.info(
					`Cast Monitor onAudioTrackChange ${JSON.stringify(track)}`
				);
				// Sincronizar índice de audio cuando cambia desde el Chromecast
				const newIndex = getTrackIndex(PLAYER_MENU_DATA_TYPE.AUDIO, track.id, menuData);
				if (newIndex !== undefined && newIndex !== audioIndex) {
					currentLogger.current?.debug(
						`Syncing audio index from Chromecast: ${audioIndex} -> ${newIndex}`
					);
					setAudioIndex(newIndex);
					currentAudioIndexRef.current = newIndex;
					// Notificar al componente padre
					if (props.events?.onChangeCommonData) {
						props.events.onChangeCommonData({
							audioIndex: newIndex,
							audioLabel: track.name,
							audioCode: track.language ?? undefined,
						});
					}
				}
			}
		},
		onTextTrackChange: (track: CastTrackInfo | null) => {
			currentLogger.current?.info(
				`Cast Monitor onTextTrackChange - track: ${JSON.stringify(track)}, menuData available: ${!!menuData}`
			);
			if (menuData) {
				// Si track es null, significa que se desactivaron los subtítulos
				const newIndex =
					track !== null
						? (getTrackIndex(PLAYER_MENU_DATA_TYPE.TEXT, track.id, menuData) ?? -1)
						: -1;

				currentLogger.current?.info(
					`Cast Monitor onTextTrackChange - newIndex: ${newIndex}, current subtitleIndex: ${subtitleIndex}`
				);

				// Sincronizar índice de subtítulos cuando cambia desde el Chromecast
				if (newIndex !== subtitleIndex) {
					currentLogger.current?.debug(
						`Syncing subtitle index from Chromecast: ${subtitleIndex} -> ${newIndex}`
					);
					setSubtitleIndex(newIndex);
					currentSubtitleIndexRef.current = newIndex;
					// Notificar al componente padre
					if (props.events?.onChangeCommonData) {
						props.events.onChangeCommonData({
							subtitleIndex: newIndex,
							subtitleLabel: track?.name,
							subtitleCode: track?.language ?? undefined,
						});
					}
				}
			}
		},
	});

	// INICIALIZAR PROGRESS MANAGERS
	useEffect(() => {
		// Initialize VOD Progress Manager only once
		if (!vodProgressManagerRef.current) {
			currentLogger.current?.debug("Initializing VOD Progress Manager");
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
			currentLogger.current?.debug("Initializing DVR Progress Manager");
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

	// Effect para manejar cambios en índices de audio/subtítulos
	useEffect(() => {
		setAudioIndex(props.audioIndex!);
	}, [props.audioIndex]);

	useEffect(() => {
		setSubtitleIndex(props.subtitleIndex!);
	}, [props.subtitleIndex]);

	// Effect para manejar cambios en tracks
	// IMPORTANTE: No enviar cambios al Chromecast si el cambio viene de sincronización remota
	useEffect(() => {
		if (isLocalTrackChangeRef.current) {
			currentLogger.current?.debug(
				`[CAST_SYNC] Skipping handleTrackChanges - change from remote sync`
			);
			return;
		}
		handleTrackChanges();
	}, [audioIndex, subtitleIndex, menuData]);

	useEffect(() => {
		if (menuData) {
			currentLogger.current?.debug(`useEffect menuData ready: ${JSON.stringify(menuData)}`);
			handleMenuDataReady();
		}
	}, [menuData]);

	useEffect(() => {
		if (
			castConnected &&
			castProgress?.duration &&
			castProgress?.duration > 0 &&
			currentSourceType.current === "content" &&
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

	// Detectar cuando el contenido termina (solo VOD — live/DVR no termina via IDLE)
	// Guard 1: live/DVR content never "ends" naturally via IDLE state
	// Guard 2: durante ad breaks el receiver transiciona el contenido principal a IDLE
	useEffect(() => {
		if (castMedia.isIdle && isContentLoaded && currentSourceType.current) {
			// Guard 1: Live/DVR content — IDLE does not mean stream ended
			if (sourceRef.current?.isLive || sourceRef.current?.isDVR) {
				currentLogger.current?.info(
					"Cast content went IDLE but source is live/DVR — suppressing handleOnEnd"
				);
				return;
			}
			// Guard 2: Ad break detection (requires native rebuild for adBreakStatus)
			if (isPlayingAdRef.current) {
				currentLogger.current?.info(
					"Cast content went IDLE but ad break is active — suppressing handleOnEnd"
				);
				return;
			}
			currentLogger.current?.info("Cast content ended from idle state");
			handleOnEnd();
		}
	}, [castMedia.isIdle, isContentLoaded]);

	// Sincronizar metadatos cuando el contenido cambia desde otro dispositivo
	useEffect(() => {
		// Si tenemos una URL en el Cast y es diferente a la que nosotros cargamos localmente
		if (
			castConnected &&
			castMedia.url &&
			localLoadedUrlRef.current &&
			castMedia.url !== localLoadedUrlRef.current
		) {
			currentLogger.current?.info(
				`[CAST_SYNC] Content changed from another device! Local URL: ${localLoadedUrlRef.current}, Cast URL: ${castMedia.url}`
			);

			// Extraer el ID del contenido del customData o de la URL
			let remoteContentId = castMedia.customData?.sourceDescription?.metadata?.id;

			// Fallback: extraer el ID de la URL del manifest (formato: /v1/{id}/)
			if (!remoteContentId && castMedia.url) {
				const urlMatch = castMedia.url.match(/\/v1\/(\d+)\//);
				if (urlMatch && urlMatch[1]) {
					remoteContentId = urlMatch[1];
					currentLogger.current?.info(
						`[CAST_SYNC] Extracted content ID from URL: ${remoteContentId}`
					);
				}
			}

			currentLogger.current?.info(
				`[CAST_SYNC] Remote content ID: ${remoteContentId}, customData: ${JSON.stringify(castMedia.customData?.sourceDescription?.metadata)}`
			);

			// Si tenemos un ID válido del contenido remoto, notificar al PlayerScreen para que recargue
			if (remoteContentId && props.events?.onRemoteContentChange) {
				currentLogger.current?.info(
					`[CAST_SYNC] Calling onRemoteContentChange with contentId: ${remoteContentId}`
				);
				props.events.onRemoteContentChange({
					contentId: remoteContentId,
					title: castMedia.title,
					subtitle: castMedia.subtitle,
					poster: castMedia.imageUrl,
					customData: castMedia.customData,
				});

				// Actualizar la URL local para evitar llamadas repetidas
				localLoadedUrlRef.current = castMedia.url;
				return;
			}

			// Fallback: Si no hay onRemoteContentChange, actualizar metadatos localmente
			isRemoteContentRef.current = true;

			// Actualizar la URL local para evitar bucle infinito
			localLoadedUrlRef.current = castMedia.url;

			const fallbackId = Date.now();

			currentLogger.current?.info(
				`[CAST_SYNC] Fallback: Updating syncedMetadata with fallbackId: ${fallbackId}, title: ${castMedia.title}, subtitle: ${castMedia.subtitle}, poster: ${castMedia.imageUrl}`
			);

			setSyncedMetadata(prev => {
				if (!prev) return prev;
				const newMetadata = {
					...prev,
					id: fallbackId,
					title: castMedia.title || prev.title,
					subtitle: castMedia.subtitle || prev.subtitle,
					poster: castMedia.imageUrl || prev.poster,
					raw: {
						...prev.raw,
						id: fallbackId,
						isRemoteContent: true,
						title: castMedia.title,
						description: castMedia.subtitle,
					},
				};
				currentLogger.current?.info(
					`[CAST_SYNC] New syncedMetadata: id=${newMetadata.id}, title=${newMetadata.title}, raw.id=${newMetadata.raw?.id}, raw.title=${newMetadata.raw?.title}`
				);
				return newMetadata;
			});

			// Resetear estados para el nuevo contenido remoto
			setMenuData(undefined);
			setIsContentLoaded(true);
			isChangingSource.current = false;
		}
		// `props.events` omitted to avoid re-firing on every parent render —
		// see ad-sync useEffect comment. Latest callback read via closure.
	}, [
		castConnected,
		castMedia.url,
		castMedia.title,
		castMedia.subtitle,
		castMedia.imageUrl,
		castMedia.customData,
	]);

	// Sincronizar metadatos cuando cambian las props (contenido local)
	// Solo sincronizar si NO estamos mostrando contenido remoto
	useEffect(() => {
		if (!isRemoteContentRef.current) {
			setSyncedMetadata(props.playerMetadata);
		}
	}, [props.playerMetadata]);

	// Sincronizar audio y subtítulos cuando activeTrackIds cambia desde otro dispositivo
	// Usamos menuData para mapear los IDs de tracks a índices
	// IMPORTANTE: Solo sincronizar si el cambio NO fue iniciado por este dispositivo
	const prevActiveTrackIdsRef = useRef<number[]>([]);

	useEffect(() => {
		if (!menuData || !castMedia.activeTrackIds) return;

		// Ignorar si el cambio fue iniciado localmente (pero NO si estamos uniéndonos a sesión existente)
		if (isLocalTrackChangeRef.current && !isJoiningExistingSessionRef.current) {
			currentLogger.current?.debug(
				`[CAST_SYNC] Ignoring activeTrackIds change - local change in progress`
			);
			prevActiveTrackIdsRef.current = [...castMedia.activeTrackIds];
			return;
		}

		const currentIds = castMedia.activeTrackIds;
		const prevIds = prevActiveTrackIdsRef.current;

		// Verificar si activeTrackIds ha cambiado (o si estamos uniéndonos a sesión existente)
		const hasChanged =
			isJoiningExistingSessionRef.current ||
			currentIds.length !== prevIds.length ||
			currentIds.some((id, i) => id !== prevIds[i]);

		if (!hasChanged) return;

		prevActiveTrackIdsRef.current = [...currentIds];

		const joining = isJoiningExistingSessionRef.current;
		if (joining) {
			currentLogger.current?.info(
				`[CAST_SYNC] Joining existing session - reading active tracks from Cast: ${JSON.stringify(currentIds)}`
			);
		}

		// --- Sincronizar track de AUDIO ---
		const audioMenuItems = menuData.filter(
			item => item.type === "audio" && item.id !== undefined
		);
		const activeAudioTrack = audioMenuItems.find(item => currentIds.includes(item.id!));

		if (activeAudioTrack && (activeAudioTrack.index !== audioIndex || joining)) {
			currentLogger.current?.info(
				`[CAST_SYNC] Syncing audio from activeTrackIds: ${audioIndex} -> ${activeAudioTrack.index} (trackId: ${activeAudioTrack.id})`
			);
			isLocalTrackChangeRef.current = true;
			setAudioIndex(activeAudioTrack.index);
			currentAudioIndexRef.current = activeAudioTrack.index;
			if (props.events?.onChangeCommonData) {
				props.events.onChangeCommonData({
					audioIndex: activeAudioTrack.index,
					audioLabel: activeAudioTrack.label,
					audioCode: activeAudioTrack.code,
				});
			}
		}

		// --- Sincronizar track de SUBTÍTULOS ---
		const textMenuItems = menuData.filter(
			item => item.type === "text" && item.id !== undefined
		);
		const activeTextTrack = textMenuItems.find(item => currentIds.includes(item.id!));

		if (activeTextTrack) {
			// Hay un subtítulo activo
			if (activeTextTrack.index !== subtitleIndex || joining) {
				currentLogger.current?.info(
					`[CAST_SYNC] Syncing subtitle from activeTrackIds: ${subtitleIndex} -> ${activeTextTrack.index} (trackId: ${activeTextTrack.id})`
				);
				isLocalTrackChangeRef.current = true;
				setSubtitleIndex(activeTextTrack.index);
				currentSubtitleIndexRef.current = activeTextTrack.index;
				if (props.events?.onChangeCommonData) {
					props.events.onChangeCommonData({
						subtitleIndex: activeTextTrack.index,
						subtitleLabel: activeTextTrack.label,
						subtitleCode: activeTextTrack.code,
					});
				}
			}
		} else {
			// No hay subtítulo activo
			const hasNoTextTrack = !textMenuItems.some(item => currentIds.includes(item.id!));
			if (hasNoTextTrack && (subtitleIndex !== -1 || joining)) {
				currentLogger.current?.info(
					`[CAST_SYNC] Syncing subtitle OFF from activeTrackIds: ${subtitleIndex} -> -1`
				);
				isLocalTrackChangeRef.current = true;
				setSubtitleIndex(-1);
				currentSubtitleIndexRef.current = -1;
				if (props.events?.onChangeCommonData) {
					props.events.onChangeCommonData({
						subtitleIndex: -1,
						subtitleLabel: undefined,
						subtitleCode: "none",
					});
				}
			}
		}

		// Limpiar el flag de sesión existente y el flag de cambio local
		if (joining) {
			isJoiningExistingSessionRef.current = false;
		}
		setTimeout(() => {
			isLocalTrackChangeRef.current = false;
		}, 2000);
		// `props.events` omitted — see ad-sync useEffect comment.
	}, [castMedia.activeTrackIds, menuData, audioIndex, subtitleIndex]);

	// Procesar media tracks cuando estén disponibles (independiente de onLoad)
	useEffect(() => {
		if (
			castMedia.mediaTracks &&
			castMedia.mediaTracks.length > 0 &&
			isContentLoaded &&
			!menuData
		) {
			currentLogger.current?.debug(
				`Processing media tracks from Cast: ${JSON.stringify(castMedia.mediaTracks)}`
			);

			if (
				props.hooks?.mergeCastMenuData &&
				typeof props.hooks.mergeCastMenuData === "function"
			) {
				setMenuData(
					props.hooks.mergeCastMenuData(castMedia.mediaTracks, props.languagesMapping)
				);
			} else {
				setMenuData(mergeCastMenuData(castMedia.mediaTracks, props.languagesMapping));
			}
		}
	}, [
		castMedia.mediaTracks,
		isContentLoaded,
		menuData,
		props.hooks?.mergeCastMenuData,
		props.languagesMapping,
	]);

	// Cargar contenido cuando Cast esté listo
	useEffect(() => {
		if (
			castConnected &&
			sourceRef.current?.isReady &&
			currentSourceType.current === "content" &&
			!isContentLoaded &&
			!isLoadingContent &&
			!hasTriedLoading &&
			castManager?.state?.canControl
		) {
			currentLogger.current?.debug("Cast ready - Loading content automatically");
			setHasTriedLoading(true);

			const sourceData: onSourceChangedProps = {
				id: props.playerMetadata?.id,
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

	// Sync con Cast states
	useEffect(() => {
		if (castConnected && castProgress.currentTime !== currentTime) {
			setCurrentTime(castProgress.currentTime);
		}
	}, [castProgress.currentTime, castConnected, currentTime]);

	useEffect(() => {
		const isPlaying = castPlaying;
		const shouldBePaused = !isPlaying;

		if (paused !== shouldBePaused) {
			setPaused(shouldBePaused);
		}
	}, [castPlaying, paused]);

	useEffect(() => {
		currentLogger.current?.debug(`useEffect muted - muted: ${!!muted}`);
		if (castVolume.isMuted !== muted) {
			setMuted(castVolume.isMuted);
		}
	}, [castVolume.isMuted, muted]);

	// Track which content the flavour has actually processed. Parent consumers
	// often regenerate `props.manifests` as a fresh array reference on every
	// render, which makes the useEffect below re-fire without any real content
	// change. Before this guard, each re-fire ran handleLiveContent → helper →
	// setIsContentLoaded(false) + setHasTriedLoading(false) + setIsPlayingAd
	// (false), churning React state; combined with the Cast SDK's stream-
	// position setState firing on every 1 s tick, the component eventually
	// tripped React's "Maximum update depth exceeded" safeguard. Gating on
	// content id + isLive keeps the effect idempotent for normal renders and
	// only lets the full reset run on a real content switch.
	const lastProcessedContentRef = useRef<{ id: unknown; isLive: boolean } | null>(null);

	useEffect(() => {
		const currentId = props.playerMetadata?.id;
		const isLiveContent = !!props.playerProgress?.isLive;

		const prev = lastProcessedContentRef.current;
		if (prev && prev.id === currentId && prev.isLive === isLiveContent) {
			return;
		}
		lastProcessedContentRef.current = { id: currentId, isLive: isLiveContent };

		if (isLiveContent) {
			handleLiveContent();
		} else {
			handleVODContent();
		}
	}, [props.manifests, props.isAutoNext, props.playerMetadata?.id]);

	// Clears per-content state that would otherwise leak between streams on a
	// live→live or live→VOD switch. Before this existed, handleLiveContent did
	// no cleanup: the DVR progress manager kept the old stream's seekable range,
	// the ad flags stayed armed from the previous break, and the receiver —
	// which keeps reporting old-stream progress for ~500 ms during the switch —
	// fed garbage tuples (new duration + old currentTime) into the DVR manager,
	// producing bogus "live edge lost" transitions and surprise goToLive seeks.
	//
	// Must run BEFORE changeSource, synchronously, so progress simulation is
	// already gated (isChangingSource=true) by the time the receiver delivers
	// the next tick. Cleared in onContentLoadedCallback.
	const resetStateForContentSwitch = useCallback(() => {
		currentSourceType.current = null;
		pendingContentSource.current = null;
		sliderValues.current = undefined;
		setIsContentLoaded(false);
		setHasTriedLoading(false);
		isChangingSource.current = true;

		isPlayingAdRef.current = false;
		setIsPlayingAd(false);
		needsPostAdGoToLiveRef.current = false;
		lastValidDVRDurationRef.current = 0;
		localLoadedUrlRef.current = null;
		postSeekWatchdogRef.current = null;
		lastUserSeekAtRef.current = 0;

		// reset() re-arms `_needsInitialGoToLive=true`. Leave it armed so the
		// DVR manager fires its own deferred goToLive the moment the first
		// valid progress tuple arrives — that covers both the no-ads case
		// (receiver reports position 0 of the DVR window, not live edge, once
		// the `?start=` anchor is stripped) and the preroll case (progress is
		// gated during ads, so the deferred seek still fires at post-ad). The
		// cast flavour's own needsPostAdGoToLive path then only needs to handle
		// the mid-roll case; a duplicate-seek guard below uses
		// isPendingLiveEdgeSeek to detect when the DVR manager already fired.
		dvrProgressManagerRef.current?.reset();
		vodProgressManagerRef.current?.reset();
	}, []);

	const handleLiveContent = () => {
		currentLogger.current?.debug("handleLiveContent");

		resetStateForContentSwitch();

		if (!tudumRef.current) {
			tudumRef.current = new TudumClass({
				enabled: false,
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
				isCast: true,
				headers: props.headers,
				getBestManifest: props.hooks?.getBestManifest,
				getSourceUri: props.hooks?.getSourceUri,
				onSourceChanged: onSourceChanged,
			});
		}

		currentSourceType.current = "content";

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
				isCast: true,
				headers: props.headers,
			});
		} catch (error: any) {
			handleOnError(handleErrorException(error, "PLAYER_MEDIA_LOAD_FAILED"));
			return;
		}
	};

	const handleVODContent = () => {
		currentLogger.current?.debug("handleVODContent");

		resetStateForContentSwitch();

		const shouldPlayTudum =
			!!props.showExternalTudum && !props.isAutoNext && !props.playerProgress?.isLive;
		currentLogger.current?.debug(`shouldPlayTudum: ${shouldPlayTudum}`);

		if (!tudumRef.current) {
			tudumRef.current = new TudumClass({
				enabled: !!props.showExternalTudum,
				getTudumSource: props.hooks?.getTudumSource,
				getTudumManifest: props.hooks?.getTudumManifest,
				isAutoNext: props.isAutoNext,
			});
		} else {
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
				isCast: true,
				headers: props.headers,
				getBestManifest: props.hooks?.getBestManifest,
				getSourceUri: props.hooks?.getSourceUri,
				onSourceChanged: onSourceChanged,
			});
		}

		if (shouldPlayTudum && tudumRef.current?.isReady && !sourceRef.current?.isDownloaded) {
			currentLogger.current?.debug("Will play tudum first, then content");
			currentSourceType.current = "tudum";
			loadTudumSource();
		} else {
			currentLogger.current?.debug("Skipping tudum - loading content directly");
			currentSourceType.current = "content";
			loadContentSource();
		}
	};

	// LOAD TUDUM SOURCE
	const loadTudumSource = useCallback(async () => {
		currentLogger.current?.debug("loadTudumSource");

		if (!tudumRef.current?.source || !castConnected) {
			currentLogger.current?.debug("loadTudumSource - Not ready:", {
				hasSource: !!tudumRef.current?.source,
				castConnected,
			});
			return;
		}

		try {
			currentSourceType.current = "tudum";
			tudumRef.current.isPlaying = true;
			drm.current = tudumRef.current?.drm;
			setIsLoadingContent(true);

			currentLogger.current?.info("Loading tudum to Cast:", tudumRef.current.source);

			const success = await castManagerRef.current?.loadContent({
				source: tudumRef.current.source,
				manifest: {},
				drm: tudumRef.current.drm,
				youbora: undefined,
				metadata: {
					id: "tudum",
					title: tudumRef.current.source.title || "Tudum",
					subtitle: tudumRef.current.source.subtitle || "",
					description: tudumRef.current.source.description || "",
					poster: tudumRef.current.source.metadata?.imageUri,
					isLive: false,
					isDVR: false,
					startPosition: 0,
					mediaType: "video", // Cast flavour siempre reproduce video
				},
			});

			if (!success) {
				throw new PlayerError("PLAYER_CAST_CONNECTION_FAILED");
			}
		} catch (error: any) {
			setIsLoadingContent(false);
			currentSourceType.current = null;
			if (tudumRef.current) {
				tudumRef.current.isPlaying = false;
			}

			currentLogger.current?.error(`Failed to load tudum to Cast: ${JSON.stringify(error)}`);
			handleOnError(handleErrorException(error, "PLAYER_CAST_OPERATION_FAILED"));

			currentLogger.current?.debug("Tudum failed, loading content directly");
			currentSourceType.current = "content";
			loadContentSource();
		}
	}, [castConnected]);

	// LOAD CONTENT SOURCE
	const loadContentSource = useCallback(() => {
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
					isCast: true,
					headers: props.headers,
				});
			} catch (error: any) {
				handleOnError(handleErrorException(error, "PLAYER_MEDIA_LOAD_FAILED"));
				return;
			}
		}
	}, [props.playerMetadata, props.manifests, props.playerProgress, props.headers]);

	// SWITCH FROM TUDUM TO CONTENT
	const switchFromTudumToContent = useCallback(async () => {
		currentLogger.current?.debug("switchFromTudumToContent");

		currentSourceType.current = null;
		if (tudumRef.current) {
			tudumRef.current.isPlaying = false;
		}

		// Reset completo de progress managers y sliderValues
		sliderValues.current = undefined;
		vodProgressManagerRef.current?.reset();
		dvrProgressManagerRef.current?.reset();
		// In Cast, the receiver handles live edge positioning — cancel any deferred goToLive
		// that reset() just armed, to prevent a fatal seek during VMAP/ad processing.
		dvrProgressManagerRef.current?.cancelDeferredGoToLive();

		// Pequeño delay para asegurar que se limpia el source
		setTimeout(async () => {
			// Si hay un source de contenido pendiente, usarlo directamente
			if (pendingContentSource.current && pendingContentSource.current.isReady) {
				currentLogger.current?.debug("Loading pending content source directly");
				currentSourceType.current = "content";
				await loadContentWithCastManager(pendingContentSource.current);
				pendingContentSource.current = null;
			} else {
				// Cargar el contenido principal
				currentLogger.current?.debug("Loading main content source");
				currentSourceType.current = "content";
				loadContentSource();
			}
		}, 100);
	}, [loadContentSource]);

	// LOAD CONTENT WITH CAST MANAGER
	const loadContentWithCastManager = useCallback(
		async (data: onSourceChangedProps) => {
			if (data && data.isReady && data.source && castManager?.state?.canControl) {
				currentLogger.current?.debug("loadContentWithCastManager");
				setIsLoadingContent(true);
				drm.current = data.drm;

				// For live DVR content on Cast, strip the `start` / `end` query
				// parameters that the consumer adds to anchor the DVR window at a
				// specific program. The receiver keeps reapplying that anchor every
				// time it refreshes the manifest — observed in practice: every brief
				// buffer (1-2 s) causes the receiver to teleport back to the program
				// start, breaking live-edge playback after ~30 s of watching.
				//
				// For Cast live playback the intent is always live edge (the flavour
				// sends startTime: -1 / startingPoint: 0 regardless of program
				// selection), so the anchor is redundant and only causes drift.
				// The native (non-cast) player keeps receiving the original URL with
				// the anchor intact, since it handles the start position correctly.
				const castSource =
					sourceRef.current?.isLive && sourceRef.current?.isDVR
						? {
								...data.source,
								uri: stripLiveStartAnchorForCast(data.source.uri),
							}
						: data.source;
				if (castSource.uri !== data.source.uri) {
					currentLogger.current?.info(
						`loadContentWithCastManager - stripped live-start anchor for Cast: ${data.source.uri} → ${castSource.uri}`
					);
				}

				// Verificar si ya estamos reproduciendo el mismo contenido
				if (castMedia.url === castSource.uri && !castMedia.isIdle) {
					currentLogger.current?.info(
						"Content already loaded in Cast, joining existing session - will sync tracks from Cast"
					);
					// Marcar que nos unimos a una sesión existente para NO sobrescribir
					// los tracks activos con nuestras preferencias locales
					isJoiningExistingSessionRef.current = true;
					prevActiveTrackIdsRef.current = [];
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
							props.playerAnalytics?.youbora!,
							YOUBORA_FORMAT.CAST
						);
					}

					// Calcular startingPoint según el tipo de contenido
					let startingPoint: number;

					if (sourceRef.current?.isLive) {
						// Para Live/DVR: usar 0 para que Cast empiece en el live edge
						// Cast maneja automáticamente el posicionamiento en el live edge cuando startTime es 0
						startingPoint = 0;
					} else {
						// Para VOD: usar startPosition del source (viene en milisegundos, convertir a segundos)
						startingPoint = data.source.startPosition
							? data.source.startPosition / 1000
							: 0;
					}

					currentLogger.current?.debug(
						`loadContentWithCastManager - startingPoint: ${startingPoint}s, isLive: ${sourceRef.current?.isLive}, isDVR: ${sourceRef.current?.isDVR}, sourceStartPosition: ${data.source.startPosition}ms`
					);

					// Guardar la URL que estamos cargando localmente para detectar cambios remotos
					localLoadedUrlRef.current = castSource.uri;
					// Resetear el flag de contenido remoto ya que estamos cargando contenido local
					isRemoteContentRef.current = false;

					const success = await castManagerRef.current?.loadContent({
						source: castSource,
						manifest: sourceRef.current?.currentManifest || {},
						drm: data.drm,
						youbora: youboraForVideo.current,
						metadata: {
							id: props.playerMetadata?.id?.toString() || "",
							title: props.playerMetadata?.title,
							subtitle: props.playerMetadata?.subtitle,
							description: props.playerMetadata?.description,
							poster:
								props.playerMetadata?.squaredPoster || props.playerMetadata?.poster,
							liveStartDate: props.liveStartDate,
							adTagUrl: props.playerAds?.adTagUrl,
							hasNext: !!props.events?.onNext,
							isLive: !!props.playerProgress?.isLive,
							isDVR: sourceRef.current?.isDVR,
							startPosition: startingPoint,
							mediaType: "video",
						},
						customDataForCast: props.customDataForCast,
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
			props.playerAnalytics,
			props.playerProgress,
			props.playerMetadata,
			props.liveStartDate,
			props.playerAds,
			props.events,
		]
	);

	// SOURCE CHANGED HANDLER
	const onSourceChanged = useCallback(
		(data: onSourceChangedProps) => {
			currentLogger.current?.debug(
				`onSourceChanged - currentSourceType: ${currentSourceType.current}`
			);
			currentLogger.current?.debug(`onSourceChanged - data: ${JSON.stringify(data)}`);

			if (
				!sourceRef.current?.isLive &&
				!sourceRef.current?.isDownloaded &&
				currentSourceType.current === "tudum"
			) {
				// Si estamos reproduciendo tudum, guardar el source del contenido para después
				currentLogger.current?.debug("Saving content source for later (tudum is playing)");
				pendingContentSource.current = data;
			} else if (currentSourceType.current === "content") {
				currentLogger.current?.debug("Processing content source normally");

				if (data.isDVR && dvrProgressManagerRef.current) {
					dvrProgressManagerRef.current.setDVRWindowSeconds(
						data.dvrWindowSeconds || 3600
					);
				}

				updatePlayerProgressRef();
				loadContentWithCastManager(data);
			} else {
				currentLogger.current?.debug("Initial state, processing source");

				if (!currentSourceType.current) {
					currentSourceType.current = "content";
				}

				updatePlayerProgressRef();
				loadContentWithCastManager(data);
			}

			if (sourceRef.current?.isLive && sourceRef.current?.isDVR) {
				// Keep `_needsInitialGoToLive` armed after reset (do NOT cancel).
				// The old assumption — "for Cast the receiver already starts at
				// the live edge" — is false once we strip the `?start=` anchor:
				// the receiver now starts at position 0 of the DVR window (5+ min
				// behind live). The progress simulation gate blocks
				// updatePlayerData while ads are playing, so the deferred goToLive
				// cannot fire during VMAP processing — it only fires once real
				// content progress arrives.
				dvrProgressManagerRef.current?.reset();
			}
		},
		[loadContentWithCastManager]
	);

	// HANDLE TRACK CHANGES
	const handleTrackChanges = () => {
		currentLogger.current?.debug("handleTrackChanges...");

		// Si nos hemos unido a una sesión Cast existente, no sobrescribimos los tracks activos.
		// La sincronización de activeTrackIds se encargará de leer el estado actual del Cast.
		if (isJoiningExistingSessionRef.current) {
			currentLogger.current?.debug(
				"[CAST_SYNC] Skipping handleTrackChanges - joining existing session, waiting for activeTrackIds sync"
			);
			return;
		}

		const activeTracks: Array<number> = [];
		if (castConnected && menuData) {
			currentLogger.current?.debug(
				`handleTrackChanges - audio: ${audioIndex}, subtitle: ${subtitleIndex}`
			);
			// Usar la función existente de Cast para cambiar tracks
			if (castManager && menuData) {
				// Validar y añadir track de audio solo si existe en menuData
				if (typeof audioIndex === "number" && audioIndex >= 0) {
					const audioTrackId = getTrackId("audio", audioIndex, menuData);
					if (audioTrackId !== undefined && audioTrackId !== null) {
						activeTracks.push(audioTrackId);
					} else {
						currentLogger.current?.warn(
							`handleTrackChanges - Audio track not found for index ${audioIndex}`
						);
					}
				}

				// Validar y añadir track de subtítulos solo si existe en menuData
				if (typeof subtitleIndex === "number" && subtitleIndex !== -1) {
					const textTrackId = getTrackId("text", subtitleIndex, menuData);
					if (textTrackId !== undefined && textTrackId !== null) {
						activeTracks.push(textTrackId);
					} else {
						currentLogger.current?.warn(
							`handleTrackChanges - Text track not found for index ${subtitleIndex}`
						);
					}
				}

				// Solo establecer tracks si hay IDs válidos
				if (activeTracks.length > 0) {
					currentLogger.current?.debug(
						`handleTrackChanges - Setting active tracks: ${JSON.stringify(activeTracks)}`
					);
					castManager.setActiveTrackIds(activeTracks);
				} else {
					currentLogger.current?.warn(
						`handleTrackChanges - No valid track IDs to set (audio: ${audioIndex}, subtitle: ${subtitleIndex})`
					);
				}
			} else {
				currentLogger.current?.warn(
					`handleTrackChanges without objects: castManager ${!!castManager} / menuData ${!!menuData}`
				);
			}
		}
	};

	// HANDLE MENU DATA READY
	const handleMenuDataReady = () => {
		currentLogger.current?.debug("handleMenuDataReady...");

		if (menuData && props.events?.onChangeCommonData) {
			const data: ICommonData = {};
			let audioDefaultIndex = 0;
			let textDefaultIndex = -1;

			if (typeof audioIndex === "number") {
				audioDefaultIndex = audioIndex;
			}

			if (typeof subtitleIndex === "number") {
				textDefaultIndex = subtitleIndex;
			}

			data.audioIndex = audioDefaultIndex;
			const audioTrack = menuData?.find(
				(item: IPlayerMenuData) =>
					item.type === PLAYER_MENU_DATA_TYPE.AUDIO && item.index === audioDefaultIndex
			);
			data.audioLabel = audioTrack?.label;
			data.audioCode = audioTrack?.code;

			data.subtitleIndex = textDefaultIndex;
			const subtitleTrack = menuData?.find(
				(item: IPlayerMenuData) =>
					item.type === PLAYER_MENU_DATA_TYPE.TEXT && item.index === textDefaultIndex
			);
			data.subtitleLabel = subtitleTrack?.label;
			data.subtitleCode = subtitleTrack?.code;

			currentLogger.current?.debug(`handleMenuDataReady ${JSON.stringify(data)}`);

			if (data) {
				props.events.onChangeCommonData(data);
			}
		}
	};

	const updatePlayerProgressRef = useCallback(() => {
		try {
			playerProgressRef.current = {
				...props.playerProgress,
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
			handleOnError(handleErrorException(ex, "PLAYER_MEDIA_LOAD_FAILED"));
		}
	}, [paused, muted, isContentLoaded, currentTime, props.playerProgress]);

	const onDVRModeChange = useCallback((data: ModeChangeData) => {
		currentLogger.current?.debug(`onDVRModeChange: ${JSON.stringify(data)}`);
	}, []);

	const onDVRProgramChange = useCallback((data: ProgramChangeData) => {
		currentLogger.current?.debug(`onDVRProgramChange: ${JSON.stringify(data)}`);
	}, []);

	const onProgressUpdate = useCallback((data: ProgressUpdateData) => {
		// Solo actualizar sliderValues si estamos reproduciendo contenido, no tudum
		if (currentSourceType.current === "content") {
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

			// Post-seek watchdog: the Chromecast CAF receiver has been seen to
			// accept a live-edge seek, report progress there for a few hundred
			// ms, then internally reset position to the start of the DVR window
			// (no user action, no log entry — just a sudden offset jump of
			// several minutes). Catch that transition here and re-seek, bounded
			// by retries + time window. Ignore drift that coincides with a
			// recent user-initiated seek (the user moved off live edge on
			// purpose).
			const guard = postSeekWatchdogRef.current;
			if (guard && sourceRef.current?.isDVR) {
				if (Date.now() >= guard.until) {
					postSeekWatchdogRef.current = null;
				} else if (
					data.isLiveEdgePosition === false &&
					guard.retriesLeft > 0 &&
					Date.now() - lastUserSeekAtRef.current > 2000
				) {
					// Use `windowCurrentSizeInSeconds` (seekable range size in seconds)
					// — NOT `maximumValue` / `duration` from ProgressUpdateData: for
					// live DVR those are absolute epoch-ms timestamps that the slider
					// uses, and passing them to seekToLiveEdge produced a seek target
					// of ~1.77 × 10¹² s, corrupting the DVR manager into offset
					// -29617545667:32. The manager exposes the correct value
					// directly via currentTimeWindowSeconds.
					const seekableDuration = data.windowCurrentSizeInSeconds ?? 0;
					if (seekableDuration > 0 && castManagerRef.current) {
						currentLogger.current?.info(
							`Post-seek watchdog: live-edge drift detected (offset ${typeof data.liveEdgeOffset === "number" ? data.liveEdgeOffset.toFixed(1) : "?"}s), re-seeking to ${seekableDuration.toFixed(1)}s — retries left: ${guard.retriesLeft - 1}`
						);
						guard.retriesLeft -= 1;
						castManagerRef.current
							.seekToLiveEdge(seekableDuration)
							.then((ok) => {
								if (ok) {
									dvrProgressManagerRef.current?.markAsLiveEdge();
								}
							})
							.catch(() => {
								// seekToLiveEdge logs non-fatal failures itself.
							});
					}
				}
			}

			// Trigger re-render del useEffect para emitir eventos con nuevos sliderValues
			setSliderValuesUpdate((prev: number) => prev + 1);
		}
	}, []);

	const onSeekRequest = useCallback((playerTime: number) => {
		if (!castManagerRef.current) {
			currentLogger.current?.warn("onSeekRequest - castManager is not initialized");
			handleOnError(new PlayerError("PLAYER_CAST_NOT_READY"));
			return;
		}

		try {
			// For DVR live-edge seeks, pass playerTime to seekToLiveEdge so the
			// native call uses a position-based seek (Math.max(0, playerTime - 2))
			// rather than the { infinite: true } fallback. The infinite marker is
			// unreliable with short DVR windows: some receivers accept it but
			// don't actually move to live edge (observed landing at position 0).
			// playerTime here is the DVR manager's computed live edge expressed
			// in player seconds, which maps 1:1 to the receiver's seekable range
			// end for a fresh load.
			const isLiveEdgeSeek =
				sourceRef.current?.isDVR && dvrProgressManagerRef.current?.isPendingLiveEdgeSeek;

			if (isLiveEdgeSeek) {
				currentLogger.current?.info(
					`onSeekRequest: live-edge seek detected (playerTime=${playerTime.toFixed(1)}s) — using absolute seek`
				);
				postSeekWatchdogRef.current = {
					until: Date.now() + 8000,
					retriesLeft: 2,
				};
				castManagerRef.current.seekToLiveEdge(playerTime);
			} else {
				currentLogger.current?.info(
					`onSeekRequest: seeking to position ${playerTime.toFixed(1)}s`
				);
				lastUserSeekAtRef.current = Date.now();
				postSeekWatchdogRef.current = null;
				castManagerRef.current.seek(playerTime);
			}
		} catch (error: any) {
			currentLogger.current?.error(`onSeekRequest failed: ${error?.message}`);
			handleOnError(handleErrorException(error, "PLAYER_CAST_OPERATION_FAILED"));
		}
	}, []);

	// Actualizar callbacks del DVRProgressManagerClass cuando cambien
	useEffect(() => {
		if (vodProgressManagerRef.current && !sourceRef.current?.isLive) {
			vodProgressManagerRef.current?.updateCallbacks({
				onProgressUpdate: onProgressUpdate,
				onSeekRequest: onSeekRequest,
			});
		}

		if (dvrProgressManagerRef.current && sourceRef.current?.isDVR) {
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

	// SIMULAR EVENTOS DEL PLAYER
	const onLoad = useCallback(
		async (e: { currentTime: number; duration: number }) => {
			currentLogger.current?.info(
				`onLoad - duration: ${e.duration}, currentTime: ${e.currentTime}`
			);

			if (currentSourceType.current === "content" && e.duration > 0) {
				currentLogger.current?.debug("onLoad - Processing content load");

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

				currentLogger.current?.debug(
					`onLoad - mediaTracks: ${JSON.stringify(castMedia.mediaTracks)}`
				);

				if (castMedia.mediaTracks && castMedia.mediaTracks.length > 0) {
					if (
						props.hooks?.mergeCastMenuData &&
						typeof props.hooks.mergeCastMenuData === "function"
					) {
						setMenuData(
							props.hooks.mergeCastMenuData(
								castMedia.mediaTracks,
								props.languagesMapping
							)
						);
					} else {
						setMenuData(
							mergeCastMenuData(castMedia.mediaTracks, props.languagesMapping)
						);
					}
				}

				if (props.events?.onStart) {
					props.events.onStart();
				}

				if (sourceRef.current?.isDVR && dvrProgressManagerRef.current) {
					// Cancel deferred goToLive: the Cast receiver already starts at the live edge.
					// The _needsInitialGoToLive flag was designed for native iOS (race condition
					// onProgress/onLoad). For Cast, the automatic seek conflicts with VMAP/ad
					// processing and kills the receiver session (PLAYER_CAST_OPERATION_FAILED).
					dvrProgressManagerRef.current.cancelDeferredGoToLive();

					if (isPlayingAdRef.current) {
						currentLogger.current?.info(
							`onLoad - Deferring checkInitialSeek: ad is playing`
						);
						// No pending callback needed: when the ad ends, isPlayingAd
						// becomes false and checkInitialSeek can be called on next content load.
						// cancelDeferredGoToLive above already prevents the fatal seek.
					} else {
						dvrProgressManagerRef.current?.checkInitialSeek(
							"cast",
							isLiveProgramRestricted
						);
					}
				}
			} else if (currentSourceType.current === "tudum") {
				currentLogger.current?.debug(`onLoad - Tudum loaded, duration: ${e.duration}`);
				setIsLoadingContent(false);
			}
		},
		[paused, props.events, castMedia.mediaTracks]
	);

	const handleOnEnd = useCallback(() => {
		currentLogger.current?.info(
			`handleOnEnd: currentSourceType ${currentSourceType.current}, isAutoNext: ${props.isAutoNext}, isLive: ${sourceRef.current?.isLive}, isDVR: ${sourceRef.current?.isDVR}`
		);

		// Guard: live/DVR streams do NOT end naturally via IDLE state.
		// During Chromecast ad breaks, the receiver transitions the main content to IDLE,
		// which triggers false end detection. For live content, IDLE never means "content ended":
		// - Normal viewing: user disconnects manually
		// - Broadcast failure: arrives as error, not IDLE
		// This guard works at JS level regardless of whether native adBreakStatus patch is compiled.
		if (
			currentSourceType.current === "content" &&
			(sourceRef.current?.isLive || sourceRef.current?.isDVR)
		) {
			currentLogger.current?.info(
				"handleOnEnd: Suppressed for live/DVR content — IDLE does not mean stream ended"
			);
			return;
		}

		if (currentSourceType.current === "tudum") {
			currentLogger.current?.debug("handleOnEnd: Tudum finished, switching to main content");
			isChangingSource.current = true;
			switchFromTudumToContent();
		} else if (currentSourceType.current === "content" && props.events?.onEnd) {
			currentLogger.current?.debug(
				"handleOnEnd: Content finished, preparing for possible auto next"
			);

			if (tudumRef.current) {
				tudumRef.current.prepareForAutoNext();
			}

			props.events.onEnd();
		}
	}, [props.isAutoNext, props.events, switchFromTudumToContent]);

	const handleOnError = useCallback(
		(error: PlayerError) => {
			currentLogger.current?.error(
				`handleOnError: ${JSON.stringify(error?.message)} (${error?.code}) - currentSourceType: ${currentSourceType.current}`
			);
			setIsLoadingContent(false);

			if (props.events?.onError && typeof props.events.onError === "function") {
				props.events.onError(error);
			}
		},
		[props.events?.onError]
	);

	// PROGRESS SIMULATION usando castProgress
	useEffect(() => {
		if (!castConnected) {
			return;
		}

		// Guard against stale receiver progress during a content switch. When
		// the consumer swaps streams, the receiver keeps reporting the OLD
		// stream's currentTime for roughly half a second until its own
		// loadContent completes. If we feed that into the DVR manager while
		// seekableDuration has already flipped to the new stream, we get
		// nonsense offsets (previously seen: old-stream currentTime=295 on a
		// new-stream duration=297 → offset of ~2 s from live edge, then a
		// jump of 5 minutes the moment the receiver finally updates to the
		// new content's position 0). isChangingSource is re-armed in
		// resetStateForContentSwitch and cleared in onContentLoadedCallback.
		if (isChangingSource.current) {
			return;
		}

		// Gate against stale receiver progress across fresh mounts. When this
		// flavour mounts while the Cast receiver is still playing the previous
		// stream, castProgress/castMedia report OLD content until the receiver
		// finishes loading ours (typically ~2 s after loadContent is issued).
		// Feeding those values into DVR manager initialises seekableRange from
		// the previous stream and consumes the deferred live-edge seek on
		// bogus coordinates — when the new content finally lands at
		// currentTime=0 there is no pending seek left to recover the live
		// edge. castMedia.url reports the receiver's current contentId; only
		// accept progress once it matches what we actually asked to load.
		if (castMedia.url && castMedia.url !== localLoadedUrlRef.current) {
			return;
		}

		// iOS Cast SDK fallback: adBreakStatus may remain non-null after VMAP ad
		// breaks end, leaving isPlayingAdRef permanently true. Detect when
		// castProgress.duration indicates real content (>120s — no ad is that long)
		// AND content has actually been progressing (currentTime > 5s) — without
		// the currentTime gate this recovery fires during preroll ad breaks: the
		// receiver reports the content's duration as soon as loadContent
		// completes, even though the IMA ad is still playing and the content
		// stream has not started (currentTime=0). A premature recovery there
		// cleared isPlayingAd mid-preroll, let the DVR manager fire goToLive,
		// and the receiver rejected the seek (PLAYER_CAST_OPERATION_FAILED)
		// because it was still playing the ad — leaving the user stuck at the
		// start of the DVR window when the content eventually resumed.
		const cpDuration = castProgress.duration ?? 0;
		const cpCurrentTime = castProgress.currentTime ?? 0;
		if (isPlayingAdRef.current && cpDuration > 120 && cpCurrentTime > 5) {
			currentLogger.current?.info(
				`Ad state recovery: duration=${cpDuration.toFixed(1)}s currentTime=${cpCurrentTime.toFixed(1)}s indicates content, not ad — clearing isPlayingAd`
			);
			isPlayingAdRef.current = false;
			setIsPlayingAd(false);
			props.events?.onAdPlayingChange?.(false);
			props.events?.onChangeCommonData?.({ isPlayingAd: false });
			// Schedule goToLive for live/DVR content (consumed below after updatePlayerData)
			if (sourceRef.current?.isDVR) {
				needsPostAdGoToLiveRef.current = true;
			}
			// Fall through — don't return, process this progress update normally
		}

		// Guard: block progress events during ad breaks to prevent
		// DVR manager from receiving ad currentTime (typically 0)
		// which triggers goToLive() → PLAYER_CAST_OPERATION_FAILED
		if (isPlayingAdRef.current) {
			currentLogger.current?.info(
				`Simulating onProgress - BLOCKED (ad playing), castProgress: currentTime=${castProgress.currentTime}, duration=${castProgress.duration}`
			);
			return;
		}

		const e = {
			currentTime: castProgress.currentTime,
			seekableDuration: castProgress.duration || 0,
		};

		currentLogger.current?.debug(
			`Simulating onProgress - castProgress: ${JSON.stringify(castProgress)}`
		);
		currentLogger.current?.debug(`Simulating onProgress: ${JSON.stringify(e)}`);

		// Solo procesar progreso para contenido principal, no para tudum
		if (currentSourceType.current === "content") {
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
				// Sanity check: if duration drops >90% from last known valid value,
				// this is likely ad garbage data (currentTime: 0, duration: 0) that
				// slipped through without native rebuild (isPlayingAdRef always false).
				if (lastValidDVRDurationRef.current > 0 && e.seekableDuration > 0) {
					const dropRatio = e.seekableDuration / lastValidDVRDurationRef.current;
					if (dropRatio < 0.1) {
						currentLogger.current?.info(
							`DVR progress sanity check: BLOCKED duration drop ${lastValidDVRDurationRef.current.toFixed(1)}→${e.seekableDuration.toFixed(1)} (ratio: ${dropRatio.toFixed(3)})`
						);
						return;
					}
				}
				if (e.seekableDuration > 0) {
					lastValidDVRDurationRef.current = e.seekableDuration;
				}

				dvrProgressManagerRef.current?.updatePlayerData({
					currentTime: e.currentTime,
					duration: e.seekableDuration,
					seekableRange: { start: 0, end: e.seekableDuration },
					isBuffering: isBuffering || isLoadingContent,
					isPaused: paused,
				});

				// After an ad break ends, seek to live edge once DVR manager has fresh data.
				// This must happen AFTER updatePlayerData so the seekable range is current.
				//
				// Pass seekableDuration so seekToLiveEdge uses a position-based seek
				// (seekableEnd - 2) rather than seek({ infinite: true }) — the infinite
				// marker is unreliable with short DVR windows (observed landing at
				// position 0 of a ~400 s window instead of the live edge).
				//
				// markAsLiveEdge is deferred until the native seek actually resolves
				// successfully: otherwise the DVR manager reports "at live edge" while
				// the receiver is still elsewhere (e.g. when the seek fails during a
				// stream switch), and the UI lies about the user's position.
				if (needsPostAdGoToLiveRef.current && e.seekableDuration > 0) {
					needsPostAdGoToLiveRef.current = false;

					// Dedupe with DVR manager's deferred goToLive. When a preroll
					// ends and this is the first valid progress the manager has
					// ever seen, updatePlayerData above fired the manager's own
					// goToLive (which sets isPendingLiveEdgeSeek=true). Running
					// another seek here produces concurrent requests that the
					// receiver rejects with PLAYER_CAST_OPERATION_FAILED. The
					// DVR-manager path already covers this case — bail out.
					if (dvrProgressManagerRef.current?.isPendingLiveEdgeSeek) {
						currentLogger.current?.info(
							"Post-ad goToLive: skipped — DVR manager already dispatched initial live-edge seek"
						);
						return;
					}

					// Pre-check: if the receiver is already within LIVE_EDGE_TOLERANCE
					// of the live edge, skip the native seek entirely. Some Cast
					// receivers auto-position near the live edge on a fresh live load
					// (observed post-preroll: offset already at ~11 s when the post-ad
					// consumer fires). Issuing a seek to seekableEnd - 2 in that case
					// targets a position essentially at the edge of the seekable range;
					// the SDK rejects it with PLAYER_CAST_OPERATION_FAILED and — while
					// Fix D now keeps markAsLiveEdge from firing — the DVR manager
					// ends up reporting "not at live edge" briefly even though the
					// receiver was already there. Skipping the seek and marking
					// directly matches the actual state the user sees.
					const currentOffset =
						e.seekableDuration - (e.currentTime ?? 0);
					if (currentOffset >= 0 && currentOffset < 15) {
						currentLogger.current?.info(
							`Post-ad goToLive: already within live-edge tolerance (offset ${currentOffset.toFixed(1)}s) — skipping native seek and marking live edge directly`
						);
						dvrProgressManagerRef.current?.markAsLiveEdge();
						postSeekWatchdogRef.current = {
							until: Date.now() + 8000,
							retriesLeft: 2,
						};
					} else {
						currentLogger.current?.info(
							`Post-ad goToLive: seeking to live edge (offset ${currentOffset.toFixed(1)}s, seekableDuration ${e.seekableDuration.toFixed(1)}s)`
						);
						postSeekWatchdogRef.current = {
							until: Date.now() + 8000,
							retriesLeft: 2,
						};
						castManagerRef.current
							?.seekToLiveEdge(e.seekableDuration)
							.then((ok) => {
								if (ok) {
									dvrProgressManagerRef.current?.markAsLiveEdge();
								} else {
									currentLogger.current?.warn(
										"Post-ad goToLive: seek did not succeed — leaving DVR manager state unchanged"
									);
								}
							})
							.catch(() => {
								// seekToLiveEdge already logs non-fatal failures; don't double-handle.
							});
					}
				}
			}

			if (!sourceRef.current?.isLive && props?.events?.onChangeCommonData) {
				props.events.onChangeCommonData({
					time: e.currentTime,
					duration: e.seekableDuration,
				});
			}
		}
		// `props?.events?.onChangeCommonData` omitted on purpose: parent
		// consumers typically rebuild the events object inline each render,
		// so a new function reference arrives every parent render. Keeping
		// it in the deps re-fired progress-simulation on every render,
		// compounding with the Cast SDK's 1 Hz stream-position setState and
		// eventually tripping React's "Maximum update depth exceeded"
		// safeguard. The closure still reads the latest callback because
		// castProgress.currentTime changes several times per second in live
		// content, re-creating the effect function.
	}, [
		castProgress.currentTime,
		castProgress.duration,
		castConnected,
		paused,
		isBuffering,
		isLoadingContent,
		castMedia.url,
	]);

	// ASSIGN CALLBACKS TO REFS
	useEffect(() => {
		onLoadRef.current = onLoad;
		onEndRef.current = handleOnEnd;
		onErrorRef.current = handleOnError;
	}, [onLoad, handleOnEnd, handleOnError]);

	// CONTROLS PRESS HANDLER
	const onControlsPress = useCallback(
		(id: CONTROL_ACTION, value?: number | boolean) => {
			const COMMON_DATA_FIELDS = [
				"time",
				"volume",
				"mute",
				"pause",
				"audioIndex",
				"subtitleIndex",
			];

			currentLogger.current?.info(`onControlsPress: ${id} (${value})`);

			if (id === CONTROL_ACTION.PAUSE) {
				setPaused(!!value);
				try {
					if (value) {
						castManagerRef.current?.pause();
					} else {
						castManagerRef.current?.play();
					}
				} catch (error: any) {
					currentLogger.current?.error(`Pause/Play operation failed: ${error?.message}`);
					handleOnError(handleErrorException(error, "PLAYER_CAST_OPERATION_FAILED"));
				}
			}

			if (id === CONTROL_ACTION.MUTE) {
				setMuted(!!value);
				try {
					if (value) {
						castManagerRef.current?.mute();
					} else {
						castManagerRef.current?.unmute();
					}
				} catch (error: any) {
					currentLogger.current?.error(`Mute/Unmute operation failed: ${error?.message}`);
					handleOnError(handleErrorException(error, "PLAYER_CAST_OPERATION_FAILED"));
				}
			}

			if (id === CONTROL_ACTION.VOLUME && typeof value === "number") {
				try {
					castManagerRef.current?.setVolume(value);
				} catch (error: any) {
					currentLogger.current?.error(`Volume operation failed: ${error?.message}`);
					handleOnError(handleErrorException(error, "PLAYER_CAST_OPERATION_FAILED"));
				}
			}

			if (id === CONTROL_ACTION.NEXT && props.events?.onNext) {
				setIsContentLoaded(false);
				props.events?.onNext();
			}

			if (id === CONTROL_ACTION.PREVIOUS && props.events?.onPrevious) {
				setIsContentLoaded(false);
				props.events.onPrevious();
			}

			if (id === CONTROL_ACTION.LIVE_START_PROGRAM && sourceRef.current?.isDVR) {
				const timestamp = props.events?.onLiveStartProgram?.();
				currentLogger.current?.debug(
					`onControlsPress: ${id} (${value}) - timestamp: ${timestamp}`
				);

				if (typeof timestamp === "number") {
					isChangingSource.current = true;
					setIsContentLoaded(false);
					setBuffering(true);
					setIsLiveProgramRestricted(true);

					if (sourceRef.current) {
						sourceRef.current.changeDvrUriParameters(timestamp);
					}

					if (dvrProgressManagerRef.current) {
						dvrProgressManagerRef.current?.reset();
						dvrProgressManagerRef.current?.cancelDeferredGoToLive();
						dvrProgressManagerRef.current?.setPlaybackType(DVR_PLAYBACK_TYPE.PROGRAM);
					}

					const sourceData: onSourceChangedProps = {
						id: sourceRef.current?.id,
						source: sourceRef.current?.playerSource,
						drm: sourceRef.current?.playerSourceDrm,
						dvrWindowSeconds: sourceRef.current?.dvrWindowSeconds,
						isLive: sourceRef.current?.isLive,
						isDVR: sourceRef.current?.isDVR,
						isFakeVOD: sourceRef.current?.isFakeVOD,
						isReady: true,
					};

					setTimeout(() => {
						loadContentWithCastManager(sourceData);
					}, 100);
				}
			}

			if (id === CONTROL_ACTION.LIVE && sourceRef.current?.isDVR) {
				if (isLiveProgramRestricted) {
					isChangingSource.current = true;
					setIsContentLoaded(false);
					setBuffering(true);
					setIsLiveProgramRestricted(false);

					if (sourceRef.current) {
						sourceRef.current.reloadDvrStream();
					}

					const sourceData: onSourceChangedProps = {
						id: sourceRef.current?.id,
						source: sourceRef.current?.playerSource,
						drm: sourceRef.current?.playerSourceDrm,
						dvrWindowSeconds: sourceRef.current?.dvrWindowSeconds,
						isLive: sourceRef.current?.isLive,
						isDVR: sourceRef.current?.isDVR,
						isFakeVOD: sourceRef.current?.isFakeVOD,
						isReady: true,
					};

					dvrProgressManagerRef.current?.reset();
					dvrProgressManagerRef.current?.cancelDeferredGoToLive();

					setTimeout(() => {
						loadContentWithCastManager(sourceData);
					}, 100);
				} else {
					// Volver al directo en DVR
					dvrProgressManagerRef.current?.goToLive();
				}
			}

			if (id === CONTROL_ACTION.SEEK_OVER_EPG && sourceRef.current?.isDVR) {
				dvrProgressManagerRef.current?.goToProgramStart();
			}

			if (id === CONTROL_ACTION.SEEK && sourceRef.current?.isDVR) {
				dvrProgressManagerRef.current?.seekToTime(value as number);
			} else if (id === CONTROL_ACTION.SEEK && !sourceRef.current?.isLive) {
				vodProgressManagerRef.current?.seekToTime(value as number);
			}

			if (id === CONTROL_ACTION.FORWARD && sourceRef.current?.isDVR) {
				dvrProgressManagerRef.current?.skipForward(value as number);
			} else if (id === CONTROL_ACTION.FORWARD && !sourceRef.current?.isLive) {
				vodProgressManagerRef.current?.skipForward(value as number);
			}

			if (id === CONTROL_ACTION.BACKWARD && sourceRef.current?.isDVR) {
				dvrProgressManagerRef.current?.skipBackward(value as number);
			} else if (id === CONTROL_ACTION.BACKWARD && !sourceRef.current?.isLive) {
				vodProgressManagerRef.current?.skipBackward(value as number);
			}

			// Actions to be saved between flavours
			if (COMMON_DATA_FIELDS.includes(id) && props?.events?.onChangeCommonData) {
				const data: ICommonData = {};

				if (id === CONTROL_ACTION.MUTE) {
					data.muted = !!value;
				} else if (id === CONTROL_ACTION.PAUSE) {
					data.paused = !!value;
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
		},
		[props.events, menuData]
	);

	const onSlidingComplete = useCallback(
		(value: number) => {
			currentLogger.current?.debug(`onSlidingComplete: ${value}`);
			onControlsPress(CONTROL_ACTION.SEEK, value);
		},
		[onControlsPress]
	);

	return (
		<View style={styles.container}>
			<BackgroundPoster poster={syncedMetadata?.poster} />

			{!tudumRef.current?.isPlaying ? (
				<Overlay
					preloading={isBuffering}
					thumbnailsMetadata={sourceRef.current?.currentManifest?.thumbnailMetadata}
					avoidTimelineThumbnails={props.avoidTimelineThumbnails}
					alwaysVisible={true}
					isChangingSource={isChangingSource.current}
					isContentLoaded={isContentLoaded}
					menuData={menuData}
					audioIndex={currentAudioIndexRef.current ?? audioIndex}
					subtitleIndex={currentSubtitleIndexRef.current ?? subtitleIndex}
					// Nuevas Props Agrupadas
					playerMetadata={syncedMetadata}
					playerProgress={{
						...props.playerProgress,
						currentTime: currentTime,
						duration: sliderValues.current?.duration || 0,
						isBuffering: isBuffering,
						isContentLoaded: isContentLoaded,
						isChangingSource: isChangingSource.current,
						isDVR: sourceRef.current?.isDVR,
						isLive: sourceRef.current?.isLive,
						isPaused: paused,
						isMuted: muted,
						sliderValues: sliderValues.current,
					}}
					playerAnalytics={props.playerAnalytics}
					playerTimeMarkers={props.playerTimeMarkers}
					playerAds={{
						...props.playerAds,
						isPlayingAd: castMedia.isPlayingAd,
						canSkipAd: castMedia.canSkipAd,
						secondsUntilSkippable: castMedia.secondsUntilSkippable,
						currentAdBreakClip: castMedia.currentAdBreakClip,
						onSkipAd: castManager.skipAd,
					}}
					// Custom Components
					components={props.components}
					// Events
					events={{
						...props.events,
						onPress: onControlsPress,
						onSlidingComplete: onSlidingComplete,
					}}
				/>
			) : null}
		</View>
	);
}

export default CastFlavour;
