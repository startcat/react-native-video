import { activateKeepAwake, deactivateKeepAwake } from "@sayem314/react-native-keep-awake";
import React, { Suspense, lazy, useRef, useState } from "react";
import { Platform } from "react-native";
import BackgroundTimer from "react-native-background-timer";
import DeviceInfo from "react-native-device-info";
import {
	CastState as NativeCastState,
	useCastState as useNativeCastState,
} from "react-native-google-cast";
import Orientation, { useOrientationChange } from "react-native-orientation-locker";
import SystemNavigationBar from "react-native-system-navigation-bar";
import { default as Downloads } from "./Downloads";
import { PlayerContext } from "./player/core/context";
import { DEFAULT_CAST_CONFIG } from "./player/features/cast/constants";
import { ComponentLogger, Logger, LoggerFactory } from "./player/features/logger";
import {
	type ICommonData,
	type IPlayerProgress,
	type IPreferencesCommonData,
} from "./player/types";

import {
	PlaylistEventType,
	PlaylistItem,
	PlaylistItemSimplified,
	PlaylistItemType,
	PlaylistRepeatMode,
	playlistsManager,
} from "./player/features/playlists";

// Declaraciones globales para TypeScript
declare var __DEV__: boolean;
declare var require: any;

// Imports condicionales: lazy loading solo en producción
let NormalFlavour: React.ComponentType<any>;
let CastFlavour: React.ComponentType<any>;

if (__DEV__) {
	// En desarrollo: import estático para mejor debugging y hot reload
	const { NormalFlavour: NormalDev } = require("./player/flavours/normal");
	const { CastFlavour: CastDev } = require("./player/flavours/cast");
	NormalFlavour = NormalDev;
	CastFlavour = CastDev;
} else {
	// En producción: lazy loading para mejor performance
	NormalFlavour = lazy(() =>
		import("./player/flavours/normal").then(module => ({
			default: module.NormalFlavour,
		}))
	);
	CastFlavour = lazy(() =>
		import("./player/flavours/cast").then(module => ({
			default: module.CastFlavour,
		}))
	);
}

import { type PlayerProps } from "./player/types";

/*
 *  Esta primera capa del Player nos permite alternar entre los dos principales flavors:
 *  - Normal: Visionado en dispositivo o Airplay
 *  - Chromecast: Usando el móvil como mando
 *
 *  Mantendremos el punto de reproducción, pista de audio, pista de subs, etc...
 *
 */

export function Player(props: PlayerProps): React.ReactElement | null {
	const playerContext = useRef<PlayerContext | null>(null);
	const playerLogger = useRef<Logger | null>(null);
	const currentLogger = useRef<ComponentLogger | null>(null);
	const playerProgress = useRef<IPlayerProgress | null>(null);
	const [currentPlaylistItem, setCurrentPlaylistItem] = useState<PlaylistItem | null>(null);

	// Estado de sincronización entre flavours (móvil ↔ Chromecast)
	const [syncState, setSyncState] = useState<ICommonData>({});

	const isCasting = useRef<boolean>(false);
	const watchingProgressIntervalObj = useRef<number>();
	const hasBeenLoaded = useRef<boolean>(false);
	const hasBeenLoadedAudio = useRef<boolean>(false);

	const [currentAudioIndex, setCurrentAudioIndex] = useState<number>(
		typeof props.audioIndex === "number" ? props.audioIndex : -1
	);
	const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState<number>(
		typeof props.subtitleIndex === "number" ? props.subtitleIndex : -1
	);

	const [hasRotated, setHasRotated] = useState<boolean>(
		!!props.avoidRotation || DeviceInfo.isTablet()
	);
	const [hasCorrectCastState, setCorrectCastState] = useState<boolean>(false);

	const nativeCastState = useNativeCastState();

	if (!playerLogger.current) {
		playerLogger.current = LoggerFactory.createFromConfig(__DEV__);
		currentLogger.current = playerLogger.current?.forComponent(
			"Video Player Component",
			props.logger?.core?.enabled,
			props.logger?.core?.level
		);
	}

	if (!playerContext.current) {
		playerContext.current = new PlayerContext(playerLogger.current!);
	}

	// playerProgress se inicializa desde el playlistItem actual

	useOrientationChange((o: OrientationType) => {
		// Pequeño apaño para el lock de rotación (fallback para dispositivos viejos)
		if (!hasRotated) {
			setTimeout(() => {
				setHasRotated(true);
			}, 500);
		}
	});

	React.useEffect(() => {
		// Al montar el Player, preparamos la sesión de Audio, el apagado de pantalla y la orientación
		if (Platform.OS === "android") {
			SystemNavigationBar.fullScreen(true);
		}

		if (!props.avoidRotation && !DeviceInfo.isTablet()) {
			// Bloqueamos a Landscape los móviles
			Orientation.lockToLandscape();
		}

		activateKeepAwake();

		async function stopDownloads() {
			await Downloads.pause();
		}

		// También detenemos las posibles descargas para mejorar la calidad de reproducción
		if (!props.avoidDownloadsManagement) {
			stopDownloads();
		}

		// Inicializar playlistsManager
		async function initPlaylistsManager() {
			await playlistsManager.initialize({
				enablePersistence: false,
			});

			setupPlaylistsManagerEventListeners();

			// Configurar playlist
			await playlistsManager.setPlaylist(
				props.playlist || [],
				props.playlistConfig || {
					autoNext: false,
					repeatMode: PlaylistRepeatMode.OFF,
					startIndex: 0,
					skipOnError: true,
				}
			);

			setCurrentPlaylistItem(playlistsManager.getCurrentItem());
		}

		initPlaylistsManager();

		// Activamos un intervalo que envia los datos del continue watching según especificaciones de servidor
		if (
			typeof props.hooks?.watchingProgressInterval === "number" &&
			props.hooks?.watchingProgressInterval > 0 &&
			props.hooks?.addContentProgress
		) {
			watchingProgressIntervalObj.current = BackgroundTimer.setInterval(() => {
				// Evitamos mandar el watching progress en directos y en Chromecast
				if (
					hasBeenLoaded.current &&
					!currentPlaylistItem?.isLive &&
					!isCasting.current &&
					currentPlaylistItem &&
					currentPlaylistItem.type !== PlaylistItemType.TUDUM &&
					props.hooks?.addContentProgress
				) {
					const currentTime = playerProgress.current?.currentTime ?? 0;
					const duration = playerProgress.current?.duration ?? 0;

					// Crear objeto simplificado del playlist item
					const itemSimplified: PlaylistItemSimplified = {
						id: currentPlaylistItem.id,
						type: currentPlaylistItem.type,
						status: currentPlaylistItem.status,
						resolvedSources: currentPlaylistItem.resolvedSources,
						metadata: currentPlaylistItem.metadata,
						timeMarkers: currentPlaylistItem.timeMarkers,
						duration: currentPlaylistItem.duration,
						isLive: currentPlaylistItem.isLive,
						liveSettings: currentPlaylistItem.liveSettings,
						playOffline: currentPlaylistItem.playOffline,
						addedAt: currentPlaylistItem.addedAt,
						extraData: currentPlaylistItem.extraData,
					};

					props.hooks.addContentProgress(itemSimplified, currentTime, duration);
				}
			}, props.hooks?.watchingProgressInterval);
		}

		const baseTimer = setTimeout(() => {
			setCorrectCastState(true);
		}, DEFAULT_CAST_CONFIG.initializationDelay);

		currentLogger.current?.debug(`Received playlist with ${props.playlist?.length || 0} items`);

		return () => {
			if (watchingProgressIntervalObj.current) {
				BackgroundTimer.clearInterval(watchingProgressIntervalObj.current);
			}

			deactivateKeepAwake();

			if (!props.avoidRotation && !DeviceInfo.isTablet()) {
				Orientation.lockToPortrait();
			}

			async function resumeDownloads() {
				await Downloads.resume();
			}

			// Reanudamos las descargas
			if (!props.avoidDownloadsManagement) {
				resumeDownloads();
			}

			if (Platform.OS === "android") {
				SystemNavigationBar.fullScreen(false);
			}

			clearTimeout(baseTimer);
		};
	}, []);

	/*
	 *  Función para guardar los cambios en el estado entre flavours
	 *  Gestiona la sincronización de estado cuando se cambia entre móvil ↔ Chromecast
	 *
	 */

	const handleChangeCommonData = React.useCallback(
		(data: ICommonData) => {
			const preferencesData: IPreferencesCommonData = {};

			currentLogger.current?.debug(`handleChangeCommonData ${JSON.stringify(data)}`);

			// 1. Actualizar estado de sincronización (inmutable)
			setSyncState(prev => ({ ...prev, ...data }));

			// 2. Actualizar playerProgress ref con valores actuales
			if (data?.time !== undefined && playerProgress.current) {
				playerProgress.current.currentTime = data.time;
			}

			if (data?.duration !== undefined && playerProgress.current) {
				playerProgress.current.duration = data.duration;
			}

			if (data?.paused !== undefined && playerProgress.current) {
				playerProgress.current.isPaused = !!data.paused;
			}

			if (data?.muted !== undefined && playerProgress.current) {
				playerProgress.current.isMuted = !!data.muted;
			}

			if (typeof data?.volume === "number" && playerProgress.current) {
				playerProgress.current.volume = data.volume;
			}

			// 3. Marcar como cargado si recibimos duration
			if (data?.duration && !hasBeenLoaded.current) {
				hasBeenLoaded.current = true;
			}

			// 4. Notificar cambios de progreso
			if (
				(data?.time !== undefined || data?.duration !== undefined) &&
				props.events?.onProgress
			) {
				const currentTime = data.time ?? syncState.time ?? 0;
				const duration = data.duration ?? syncState.duration ?? 0;
				props.events.onProgress(currentTime, duration);
			}

			// 5. Notificar cambios de estado de reproducción
			if (data?.paused !== undefined) {
				if (data.paused && props.events?.onPause) {
					props.events.onPause();
				} else if (!data.paused && props.events?.onPlay) {
					props.events.onPlay();
				}
			}

			// 6. Recopilar cambios de preferencias
			if (data?.muted !== undefined) {
				preferencesData.muted = !!data.muted;
			}

			if (typeof data?.volume === "number") {
				preferencesData.volume = data.volume;
			}

			if (data?.audioIndex !== undefined) {
				setCurrentAudioIndex(data.audioIndex);
				preferencesData.audioIndex = data.audioIndex;
				if (data?.audioLabel !== undefined) {
					preferencesData.audioLabel = data.audioLabel;
				}

				if (props.events?.onChangeAudioIndex) {
					props.events.onChangeAudioIndex(data.audioIndex, data.audioLabel);
				}
			}

			if (data?.subtitleIndex !== undefined) {
				setCurrentSubtitleIndex(data.subtitleIndex);
				preferencesData.subtitleIndex = data.subtitleIndex;
				if (data?.subtitleLabel !== undefined) {
					preferencesData.subtitleLabel = data.subtitleLabel;
				}

				if (props.events?.onChangeSubtitleIndex) {
					props.events.onChangeSubtitleIndex(data.subtitleIndex, data.subtitleLabel);
				}
			}

			if (data?.playbackRate !== undefined) {
				preferencesData.playbackRate = data.playbackRate;
			}

			// 7. Notificar cambios de preferencias
			if (
				Object.keys(preferencesData).length > 0 &&
				props.events?.onChangePreferences &&
				typeof props.events.onChangePreferences === "function"
			) {
				currentLogger.current?.info(
					`Calling onChangePreferences with ${JSON.stringify(preferencesData)}`
				);
				props.events.onChangePreferences(preferencesData);
			}

			// 8. Marcar audio como cargado si recibimos índices
			if (
				!hasBeenLoadedAudio.current &&
				(data?.audioIndex !== undefined || data?.subtitleIndex !== undefined)
			) {
				hasBeenLoadedAudio.current = true;
			}
		},
		[syncState, props.events]
	);

	/*
	 *  Función al terminar el contenido
	 *
	 */

	const onEnd = () => {
		const currentItem = playlistsManager.getCurrentItem();
		const isTudum = currentItem?.type === "TUDUM";
		const config = playlistsManager.getConfig();
		const shouldAutoNext = isTudum || config?.autoNext;

		currentLogger.current?.info(
			`onEnd: item ${currentItem?.id}, type: ${currentItem?.type}, autoNext: ${config?.autoNext}, shouldAutoNext: ${shouldAutoNext}`
		);

		// For TUDUM items, always auto-advance regardless of autoNext setting
		// For regular content, respect autoNext configuration
		if (shouldAutoNext) {
			currentLogger.current?.info(`onEnd: Auto-advancing to next item (TUDUM: ${isTudum})`);
			playlistsManager.goToNext();
		} else {
			currentLogger.current?.info(`onEnd: Not auto-advancing (autoNext disabled)`);
		}

		// Always notify parent that item ended
		if (props.events?.onEnd) {
			props.events.onEnd();
		}
	};

	/*
	 *  Handlers para los eventos de playlistsManager
	 *
	 */

	const setupPlaylistsManagerEventListeners = () => {
		// Item changed
		playlistsManager.on(PlaylistEventType.ITEM_CHANGED, (data: any) => {
			currentLogger.current?.info(
				`🔔 Playlist ITEM_CHANGED received: ${data.currentItem?.id || data.item?.id}`
			);

			// Usar currentItem si está disponible, sino usar item
			const itemToUse = data.currentItem || data.item;

			if (itemToUse) {
				// Asegurar que initialState.startPosition esté correctamente inicializado
				// Si no existe, usar 0 como valor por defecto
				if (!itemToUse.initialState) {
					itemToUse.initialState = {};
				}
				if (itemToUse.initialState.startPosition === undefined) {
					itemToUse.initialState.startPosition = 0;
				}

				currentLogger.current?.info(
					`📝 Setting currentPlaylistItem: ${itemToUse.id}, startPosition: ${itemToUse.initialState.startPosition}`
				);
				setCurrentPlaylistItem(itemToUse);
			}
		});

		// Item started
		playlistsManager.on(PlaylistEventType.ITEM_STARTED, (data: any) => {
			currentLogger.current?.debug(`Playlist ITEM_STARTED: ${data.itemId}`);
		});

		// Item completed
		playlistsManager.on(PlaylistEventType.ITEM_COMPLETED, (data: any) => {
			currentLogger.current?.debug(`Playlist ITEM_COMPLETED: ${data.itemId}`);
		});

		// Item error
		playlistsManager.on(PlaylistEventType.ITEM_ERROR, (data: any) => {
			currentLogger.current?.error(`Playlist ITEM_ERROR: ${data.errorMessage}`);
		});

		// Playlist ended
		playlistsManager.on(PlaylistEventType.PLAYLIST_ENDED, () => {
			currentLogger.current?.debug("Playlist ended");
		});
	};

	if (
		hasRotated &&
		hasCorrectCastState &&
		currentPlaylistItem &&
		(nativeCastState === NativeCastState.CONNECTING ||
			nativeCastState === NativeCastState.CONNECTED)
	) {
		currentLogger.current?.debug(`Mounting CastFlavour...`);
		isCasting.current = true;
		return (
			<Suspense fallback={props.components?.suspenseLoader}>
				<CastFlavour
					playerContext={playerContext.current}
					playlistItem={currentPlaylistItem}
					languagesMapping={props.languagesMapping}
					avoidTimelineThumbnails={props.avoidTimelineThumbnails}
					// Initial State
					initialState={{
						...props.initialState,
						audioIndex: currentAudioIndex,
						subtitleIndex: currentSubtitleIndex,
					}}
					// Custom Components
					components={props.components}
					// Hooks
					hooks={props.hooks}
					// Events
					events={{
						...props.events,
						onChangeCommonData: handleChangeCommonData,
						onEnd: onEnd,
					}}
					// Player Features
					features={props.features}
					// Player Logger
					logger={props.logger}
				/>
			</Suspense>
		);
	} else if (
		hasRotated &&
		hasCorrectCastState &&
		currentPlaylistItem &&
		nativeCastState !== NativeCastState.CONNECTING &&
		nativeCastState !== NativeCastState.CONNECTED
	) {
		currentLogger.current?.debug(`Mounting NormalFlavour...`);
		isCasting.current = false;
		return (
			<Suspense fallback={props.components?.suspenseLoader}>
				<NormalFlavour
					playerContext={playerContext.current}
					playlistItem={currentPlaylistItem}
					languagesMapping={props.languagesMapping}
					avoidTimelineThumbnails={props.avoidTimelineThumbnails}
					// Initial State
					initialState={{
						...props.initialState,
						audioIndex: currentAudioIndex,
						subtitleIndex: currentSubtitleIndex,
					}}
					// Custom Components
					components={props.components}
					// Hooks
					hooks={props.hooks}
					// Events
					events={{
						...props.events,
						onChangeCommonData: handleChangeCommonData,
						onEnd: onEnd,
					}}
					// Features
					features={props.features}
					// Player Logger
					logger={props.logger}
				/>
			</Suspense>
		);
	} else {
		return null;
	}
}
