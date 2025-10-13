import { Spinner } from "@ui-kitten/components";
import React, { createElement, useEffect, useRef, useState } from "react";
import { View } from "react-native";
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

	// const watchingProgressIntervalObj = useRef<ReturnType<typeof setTimeout>>();

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
			console.log(`[Audio Player Bar] Unmounted`);

			if (typeof changesAudioPlayerListener === "string") {
				EventRegister.removeEventListener(changesAudioPlayerListener);
			}

			if (typeof actionsAudioPlayerListener === "string") {
				EventRegister.removeEventListener(actionsAudioPlayerListener);
			}
		};
	}, []);

	useEffect(() => {
		console.log(`[Audio Player Bar] contendId ${JSON.stringify(contentId)}`);

		async function fetchDpo() {
			if (props.fetchContentData) {
				try {
					const dpo = await props.fetchContentData(contentId?.current!);
					setLoadingNewContent(false);

					console.log(
						`[Audio Player Bar] playlistConfig ${JSON.stringify(dpo?.playlistConfig)}`
					);

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

	// React.useEffect(() => {
	// 	console.log(
	// 		`[Audio Player Bar] dpoData?.playerMetadata?.id ${dpoData?.playerMetadata?.id}`
	// 	);

	// 	currentLogger.current?.debug(`New DPO Metadata ID ${dpoData?.playerMetadata?.id}`);

	// 	// Activamos un intervalo que envia los datos del continue watching según especificaciones de servidor
	// 	if (
	// 		typeof dpoData?.hooks?.watchingProgressInterval === "number" &&
	// 		dpoData?.hooks?.watchingProgressInterval > 0 &&
	// 		dpoData?.hooks?.addContentProgress
	// 	) {
	// 		watchingProgressIntervalObj.current = BackgroundTimer.setInterval(() => {
	// 			// Evitamos mandar el watching progress en directos y en Chromecast
	// 			if (hasBeenLoaded.current && !dpoData?.isLive) {
	// 				// @ts-ignore
	// 				dpoData.hooks?.addContentProgress(
	// 					dpoData.playerProgress?.currentTime,
	// 					dpoData.playerProgress?.duration
	// 				);
	// 			}
	// 		}, dpoData?.hooks?.watchingProgressInterval);
	// 	}

	// 	return () => {
	// 		if (watchingProgressIntervalObj.current) {
	// 			BackgroundTimer.clearInterval(watchingProgressIntervalObj.current);
	// 		}
	// 	};
	// }, [dpoData?.playerMetadata?.id]);

	const clearDataToChangeContents = () => {
		hasBeenLoaded.current = false;
		setDpoData(null);
		currentLogger.current = null;
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
			currentLogger.current?.debug(`Playlist ITEM_CHANGED: ${JSON.stringify(data)}`);

			// Usar currentItem si está disponible, sino usar item
			const itemToUse = data.currentItem || data.item;

			if (itemToUse) {
				currentLogger.current?.info(`📝 Setting currentPlaylistItem to: ${itemToUse.id}`);
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
	 */

	const onEnd = () => {
		// if (watchingProgressIntervalObj.current) {
		// 	BackgroundTimer.clearInterval(watchingProgressIntervalObj.current);
		// }

		if (dpoData?.events?.onEnd) {
			dpoData?.events?.onEnd();
		}
	};

	/*
	 *  Función para guardar los cambios en el estado entre flavours
	 *
	 */

	const changeCommonData = (data: ICommonData) => {
		let preferencesData: IPreferencesCommonData = {};

		if (data?.time && dpoData?.playerProgress) {
			dpoData.playerProgress.currentTime = data.time;
		}

		if (data?.duration && dpoData?.playerProgress) {
			dpoData.playerProgress.duration = data.duration;

			if (!hasBeenLoaded.current) {
				hasBeenLoaded.current = true;
			}
		}

		if (
			(data?.time !== undefined || data?.duration !== undefined) &&
			dpoData?.events?.onProgress
		) {
			dpoData?.events?.onProgress(
				dpoData.playerProgress.currentTime,
				dpoData.playerProgress.duration
			);
		}

		if (data?.paused !== undefined) {
			dpoData.playerProgress.isPaused = !!data.paused;

			if (!!data.paused && dpoData?.events?.onPause) {
				dpoData?.events?.onPause();
			} else if (dpoData?.events?.onPlay) {
				dpoData?.events?.onPlay();
			}
		}

		if (data?.muted !== undefined) {
			dpoData.playerProgress.isMuted = !!data.muted;
			preferencesData.muted = !!data.muted;
		}

		if (typeof data?.volume === "number") {
			dpoData.playerProgress.volume = data.volume;
			preferencesData.volume = data.volume;
		}

		if (
			dpoData?.events?.onChangePreferences &&
			typeof dpoData.events?.onChangePreferences === "function" &&
			Object.keys(preferencesData).length > 0
		) {
			dpoData.events?.onChangePreferences(preferencesData);
		}
	};

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
					// Initial State
					initialState={dpoData.initialState}
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
					// Initial State
					initialState={dpoData.initialState}
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
