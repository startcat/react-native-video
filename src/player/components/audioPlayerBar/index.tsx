import { Spinner } from "@ui-kitten/components";
import React, { createElement, useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import BackgroundTimer from "react-native-background-timer";
import { EventRegister } from "react-native-event-listeners";
import {
	CastState as NativeCastState,
	useCastState as useNativeCastState,
} from "react-native-google-cast";
import Animated, { useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { PlayerContext } from "../../core/context";
import { ComponentLogger, Logger, LoggerFactory } from "../../features/logger";
import {
	PlaylistEventType,
	PlaylistItem,
	PlaylistItemSimplified,
	PlaylistItemType,
	PlaylistRepeatMode,
	playlistsManager,
} from "../../features/playlists";
import { AudioCastFlavour, AudioFlavour } from "../../flavours";
import { styles } from "./styles";

import {
	type AudioPlayerActionEventProps,
	type AudioPlayerContentsDpo,
	type AudioPlayerEventProps,
	type AudioPlayerProps,
	type IAudioPlayerContent,
	type ICommonData,
	type IPreferencesCommonData,
	CONTROL_ACTION,
} from "../../types";

// Declaraciones globales para TypeScript
declare var __DEV__: boolean;

const PLAYER_MAX_HEIGHT = 80;

/*
 *  AudioPlayer
 *  Se inicia como barra inferior
 *
 */

export function AudioPlayer(props: AudioPlayerProps): React.ReactElement | null {
	const playerContext = useRef<PlayerContext | null>(null);
	const playerLogger = useRef<Logger | null>(null);
	const currentLogger = useRef<ComponentLogger | null>(null);

	const playerMaxHeight = useRef<number | string>(props.playerMaxHeight || PLAYER_MAX_HEIGHT);
	const audioPlayerHeight = useSharedValue(0);

	const hasBeenLoaded = useRef<boolean>(false);
	const [loadingNewContent, setLoadingNewContent] = useState<boolean>(false);

	const [contentId, setContentId] = useState<IAudioPlayerContent | null>();
	const [dpoData, setDpoData] = useState<AudioPlayerContentsDpo | null>(null);
	const [currentPlaylistItem, setCurrentPlaylistItem] = useState<PlaylistItem | null>(null);

	// Estado de sincronización entre flavours (móvil ↔ Chromecast)
	const [syncState, setSyncState] = useState<ICommonData>({});

	const watchingProgressIntervalObj = useRef<number>();
	const syncStateRef = useRef<ICommonData>(syncState);
	const currentPlaylistItemRef = useRef<PlaylistItem | null>(currentPlaylistItem);

	if (!playerLogger.current) {
		playerLogger.current = LoggerFactory.createFromConfig(__DEV__);
	}

	if (!playerContext.current) {
		playerContext.current = new PlayerContext(playerLogger.current!);
	}

	const nativeCastState = useNativeCastState();

	useEffect(() => {
		async function initPlaylistsManager() {
			await playlistsManager.initialize({
				enablePersistence: false,
			});

			setupPlaylistsManagerEventListeners();
		}

		initPlaylistsManager();

		const changesAudioPlayerListener = EventRegister.addEventListener(
			"audioPlayer",
			(data: AudioPlayerEventProps) => {
				// Verificar si el player ya está desplegado
				const isPlayerVisible =
					typeof playerMaxHeight.current === "number"
						? audioPlayerHeight.value >= playerMaxHeight.current
						: audioPlayerHeight.value > 0;
				if (!isPlayerVisible) {
					showPlayer();
					setTimeout(() => {
						setContentId({
							current: data,
						});
					}, 100);
				} else if (audioPlayerHeight) {
					// Si ya lo teníamos desplegado, cambiamos el ID/Slug del contenido
					// Para cambiar de contenido, necesitamos desmontarlo
					clearDataToChangeContents();
					setContentId({
						next: data,
					});
				}
			}
		);

		const actionsAudioPlayerListener = EventRegister.addEventListener(
			"audioPlayerAction",
			(data: AudioPlayerActionEventProps) => {
				if (data.action === CONTROL_ACTION.CLOSE_AUDIO_PLAYER) {
					clearDataToChangeContents();
					setContentId({
						current: null,
						next: null,
					});

					hidePlayer();
				}
			}
		);

		return () => {
			if (typeof changesAudioPlayerListener === "string") {
				EventRegister.removeEventListener(changesAudioPlayerListener);
			}

			if (typeof actionsAudioPlayerListener === "string") {
				EventRegister.removeEventListener(actionsAudioPlayerListener);
			}

			// Limpiar listeners del PlaylistsManager para evitar duplicados
			playlistsManager.removeAllListeners(PlaylistEventType.ITEM_CHANGED);
			playlistsManager.removeAllListeners(PlaylistEventType.ITEM_STARTED);
			playlistsManager.removeAllListeners(PlaylistEventType.ITEM_COMPLETED);
			playlistsManager.removeAllListeners(PlaylistEventType.ITEM_ERROR);
			playlistsManager.removeAllListeners(PlaylistEventType.PLAYLIST_ENDED);

			currentLogger.current?.debug(`Unmounted and cleaned up playlist listeners`);
		};
	}, []);

	useEffect(() => {
		async function fetchDpo() {
			if (props.fetchContentData) {
				try {
					const dpo = await props.fetchContentData(contentId?.current!);
					setLoadingNewContent(false);

					await playlistsManager.setPlaylist(
						dpo?.playlist || [],
						dpo?.playlistConfig || {
							autoNext: true,
							repeatMode: PlaylistRepeatMode.OFF,
							startIndex: 0,
							skipOnError: true,
						}
					);

					setDpoData(dpo);
					currentLogger.current =
						playerLogger.current?.forComponent(
							"Audio Player Bar Component",
							dpo?.logger?.core?.enabled,
							dpo?.logger?.core?.level
						) || null;

					setCurrentPlaylistItem(playlistsManager.getCurrentItem());
				} catch (err) {}
			}
		}

		hasBeenLoaded.current = false;
		setLoadingNewContent(true);

		// Hack para desmontar el player y limpiar sus datos al cambiar de contenido
		if (contentId?.next) {
			setContentId({
				current: contentId?.next,
			});
		} else if (contentId?.current) {
			// Llamamos la función externa que irá a buscar los datos del contenido solicitado
			fetchDpo();
		}
	}, [contentId]);

	// Mantener refs actualizadas sin causar re-renders
	React.useEffect(() => {
		syncStateRef.current = syncState;
	}, [syncState]);

	React.useEffect(() => {
		currentPlaylistItemRef.current = currentPlaylistItem;
	}, [currentPlaylistItem]);

	React.useEffect(() => {
		// Activamos un intervalo que envia los datos del continue watching según especificaciones de servidor
		if (
			typeof dpoData?.hooks?.watchingProgressInterval === "number" &&
			dpoData?.hooks?.watchingProgressInterval > 0 &&
			dpoData?.hooks?.addContentProgress
		) {
			watchingProgressIntervalObj.current = BackgroundTimer.setInterval(() => {
				// Usar refs para obtener valores actuales sin recrear el intervalo
				const currentItem = currentPlaylistItemRef.current;
				const currentSyncState = syncStateRef.current;

				// Evitamos mandar el watching progress en directos, TUDUM y en Chromecast
				if (
					hasBeenLoaded.current &&
					currentItem &&
					!currentItem.isLive &&
					currentItem.type !== PlaylistItemType.TUDUM &&
					dpoData.hooks?.addContentProgress
				) {
					const currentTime = currentSyncState.time ?? 0;
					const duration = currentSyncState.duration ?? 0;

					// Crear objeto simplificado del playlist item
					const itemSimplified: PlaylistItemSimplified = {
						id: currentItem.id,
						type: currentItem.type,
						status: currentItem.status,
						resolvedSources: currentItem.resolvedSources,
						metadata: currentItem.metadata,
						timeMarkers: currentItem.timeMarkers,
						duration: currentItem.duration,
						isLive: currentItem.isLive,
						liveSettings: currentItem.liveSettings,
						playOffline: currentItem.playOffline,
						addedAt: currentItem.addedAt,
						extraData: currentItem.extraData,
					};

					dpoData.hooks.addContentProgress(itemSimplified, currentTime, duration);
				}
			}, dpoData?.hooks?.watchingProgressInterval);
		}

		return () => {
			if (watchingProgressIntervalObj.current) {
				BackgroundTimer.clearInterval(watchingProgressIntervalObj.current);
			}
		};
	}, [dpoData?.hooks]);

	const clearDataToChangeContents = () => {
		hasBeenLoaded.current = false;
		setDpoData(null);
		currentLogger.current = null;
		// Limpiar estado de sincronización al cambiar de contenido
		setSyncState({});
	};

	const showPlayer = () => {
		// @ts-ignore
		audioPlayerHeight.value = withSpring(playerMaxHeight.current, {
			duration: 800,
		});
	};

	const hidePlayer = () => {
		audioPlayerHeight.value = withTiming(0, {
			duration: 200,
		});
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

	/*
	 *  Función al terminar el contenido
	 *
	 * IMPORTANTE: JavaScript NO debe intentar controlar la navegación.
	 *
	 */

	const onEnd = () => {
		// Always notify parent that item ended
		if (dpoData?.events?.onEnd) {
			dpoData?.events?.onEnd();
		}
	};

	/*
	 *  Función para guardar los cambios en el estado entre flavours
	 *  Gestiona la sincronización de estado cuando se cambia entre móvil ↔ Chromecast
	 *
	 */

	const changeCommonData = useCallback(
		(data: ICommonData) => {
			const preferencesData: IPreferencesCommonData = {};

			// 1. Actualizar estado de sincronización (inmutable)
			setSyncState(prev => ({ ...prev, ...data }));

			// 2. Marcar como cargado si recibimos duration
			if (data?.duration && !hasBeenLoaded.current) {
				hasBeenLoaded.current = true;
			}

			// 3. Notificar cambios de progreso
			if (
				(data?.time !== undefined || data?.duration !== undefined) &&
				dpoData?.events?.onProgress
			) {
				const currentTime = data.time ?? syncState.time ?? 0;
				const duration = data.duration ?? syncState.duration ?? 0;
				dpoData.events.onProgress(currentTime, duration);
			}

			// 4. Notificar cambios de estado de reproducción
			if (data?.paused !== undefined) {
				if (data.paused && dpoData?.events?.onPause) {
					dpoData.events.onPause();
				} else if (!data.paused && dpoData?.events?.onPlay) {
					dpoData.events.onPlay();
				}
			}

			// 5. Recopilar cambios de preferencias
			if (data?.muted !== undefined) {
				preferencesData.muted = !!data.muted;
			}

			if (typeof data?.volume === "number") {
				preferencesData.volume = data.volume;
			}

			if (data?.audioIndex !== undefined) {
				preferencesData.audioIndex = data.audioIndex;
				if (data?.audioLabel !== undefined) {
					preferencesData.audioLabel = data.audioLabel;
				}
			}

			if (data?.subtitleIndex !== undefined) {
				preferencesData.subtitleIndex = data.subtitleIndex;
				if (data?.subtitleLabel !== undefined) {
					preferencesData.subtitleLabel = data.subtitleLabel;
				}
			}

			if (data?.playbackRate !== undefined) {
				preferencesData.playbackRate = data.playbackRate;
			}

			// 6. Notificar cambios de preferencias
			if (
				Object.keys(preferencesData).length > 0 &&
				dpoData?.events?.onChangePreferences &&
				typeof dpoData.events.onChangePreferences === "function"
			) {
				dpoData.events.onChangePreferences(preferencesData);
			}
		},
		[syncState, dpoData]
	);

	const Loader = props.loader ? createElement(props.loader, {}) : null;

	return (
		<Animated.View
			style={
				props.style
					? [props.style, { height: audioPlayerHeight }]
					: {
							...styles.container,
							height: audioPlayerHeight,
							backgroundColor:
								props.backgroundColor || styles.container.backgroundColor,
						}
			}
		>
			{(!contentId?.current || !dpoData || loadingNewContent) && audioPlayerHeight.value > 10
				? Loader || (
						<View style={styles.contents}>
							<Spinner />
						</View>
					)
				: null}

			{contentId?.current &&
			dpoData &&
			currentPlaylistItem &&
			!loadingNewContent &&
			nativeCastState !== NativeCastState.CONNECTING &&
			nativeCastState !== NativeCastState.CONNECTED ? (
				<AudioFlavour
					playerContext={playerContext.current}
					playlistItem={currentPlaylistItem}
					// Styles
					backgroundColor={props.backgroundColor}
					topDividerColor={props.topDividerColor}
					// Initial State (con valores sincronizados)
					initialState={{
						...dpoData.initialState,
						// Sobrescribir con valores sincronizados si existen
						isPaused: syncState.paused ?? dpoData.initialState?.isPaused,
						isMuted: syncState.muted ?? dpoData.initialState?.isMuted,
						volume: syncState.volume ?? dpoData.initialState?.volume,
						audioIndex: syncState.audioIndex ?? dpoData.initialState?.audioIndex,
						subtitleIndex:
							syncState.subtitleIndex ?? dpoData.initialState?.subtitleIndex,
					}}
					// Components
					controls={props.controls}
					components={dpoData.components}
					// Hooks
					hooks={dpoData.hooks}
					// Events
					events={{
						...dpoData.events,
						onChangeCommonData: changeCommonData,
						onEnd: onEnd,
						onClose: hidePlayer,
					}}
					// Player Features
					features={dpoData.features}
					// Player Logger
					logger={dpoData.logger}
				/>
			) : null}

			{contentId?.current &&
			dpoData &&
			currentPlaylistItem &&
			(nativeCastState === NativeCastState.CONNECTING ||
				nativeCastState === NativeCastState.CONNECTED) ? (
				<AudioCastFlavour
					playerContext={playerContext.current}
					playlistItem={currentPlaylistItem}
					// Styles
					backgroundColor={props.backgroundColor}
					topDividerColor={props.topDividerColor}
					// Initial State (con valores sincronizados)
					initialState={{
						...dpoData.initialState,
						// Sobrescribir con valores sincronizados si existen
						isPaused: syncState.paused ?? dpoData.initialState?.isPaused,
						isMuted: syncState.muted ?? dpoData.initialState?.isMuted,
						volume: syncState.volume ?? dpoData.initialState?.volume,
						audioIndex: syncState.audioIndex ?? dpoData.initialState?.audioIndex,
						subtitleIndex:
							syncState.subtitleIndex ?? dpoData.initialState?.subtitleIndex,
					}}
					// Components
					controls={props.controls}
					components={dpoData.components}
					// Hooks
					hooks={dpoData.hooks}
					// Events
					events={{
						...dpoData.events,
						onChangeCommonData: changeCommonData,
						onEnd: onEnd,
						onClose: hidePlayer,
					}}
					// Player Features
					features={dpoData.features}
					// Player Logger
					logger={dpoData.logger}
				/>
			) : null}
		</Animated.View>
	);
}
