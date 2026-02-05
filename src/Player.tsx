import { activateKeepAwake, deactivateKeepAwake } from "@sayem314/react-native-keep-awake";
import React, { Suspense, lazy, useRef, useState } from "react";
import { Platform } from "react-native";
import BackgroundTimer from "react-native-background-timer";
import DeviceInfo from "react-native-device-info";
import {
    CastState as NativeCastState,
    useCastSession,
    useCastState as useNativeCastState,
} from "react-native-google-cast";
import Orientation, { useOrientationChange } from "react-native-orientation-locker";
import SystemNavigationBar from "react-native-system-navigation-bar";
import { PlayerContext } from "./player/core/context";
import { DEFAULT_CAST_CONFIG } from "./player/features/cast/constants";
import { ComponentLogger, Logger, LoggerFactory } from "./player/features/logger";
import { type IPlayerProgress, type IPreferencesCommonData } from "./player/types";

// Declaraciones globales para TypeScript
declare let __DEV__: boolean;
declare let require: any;

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

import { type ICommonData, type PlayerProps } from "./player/types";

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

	const isCasting = useRef<boolean>(false);
	const watchingProgressIntervalObj = useRef<number>();
	const hasBeenLoaded = useRef<boolean>(false);
	const hasBeenLoadedAudio = useRef<boolean>(false);
	const isPlayingAd = useRef<boolean>(false);

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
	// castSession no se usa directamente pero useCastSession se mantiene por si se necesita en el futuro
	useCastSession();

	// Ref para recordar si Cast estaba activo - evita fluctuaciones de estado en background
	const wasCastActiveRef = useRef<boolean>(false);
	// Estado con delay para evitar fluctuaciones rápidas
	const [stableCastActive, setStableCastActive] = useState<boolean>(false);
	const disconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Tiempo de gracia antes de considerar Cast como desconectado (5 segundos)
	const CAST_DISCONNECT_GRACE_PERIOD_MS = 5000;

	// Determinar si Cast está conectado según el estado nativo
	const isNativeCastConnected =
		nativeCastState === NativeCastState.CONNECTING ||
		nativeCastState === NativeCastState.CONNECTED;

	// Usar el estado estable para decidir qué flavour renderizar
	const isCastActive = stableCastActive || isNativeCastConnected;

	// Manejar cambios de estado de Cast con timeout de gracia
	React.useEffect(() => {
		console.log(
			`[Player] Cast state change - nativeCastState: ${nativeCastState}, isNativeCastConnected: ${isNativeCastConnected}, stableCastActive: ${stableCastActive}, wasCastActive: ${wasCastActiveRef.current}`
		);

		if (isNativeCastConnected) {
			// Cast está conectado - cancelar cualquier timeout de desconexión pendiente
			if (disconnectTimeoutRef.current) {
				console.log("[Player] Cast connected - cancelling disconnect timeout");
				clearTimeout(disconnectTimeoutRef.current);
				disconnectTimeoutRef.current = null;
			}
			wasCastActiveRef.current = true;
			setStableCastActive(true);
			console.log("[Player] Cast connected - marking as active");
		} else if (wasCastActiveRef.current && !disconnectTimeoutRef.current) {
			// Cast se desconectó pero estaba activo - iniciar timeout de gracia
			console.log(
				`[Player] Cast disconnected - starting ${CAST_DISCONNECT_GRACE_PERIOD_MS}ms grace period before switching to NormalFlavour`
			);
			disconnectTimeoutRef.current = setTimeout(() => {
				console.log(
					"[Player] Cast disconnect grace period ended - switching to NormalFlavour"
				);
				wasCastActiveRef.current = false;
				setStableCastActive(false);
				disconnectTimeoutRef.current = null;
			}, CAST_DISCONNECT_GRACE_PERIOD_MS);
		}

		return () => {
			// Cleanup timeout on unmount
			if (disconnectTimeoutRef.current) {
				clearTimeout(disconnectTimeoutRef.current);
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [nativeCastState, isNativeCastConnected]);

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

	if (!playerProgress.current) {
		playerProgress.current = {
			...props.playerProgress,
			currentTime: props.initialState?.startPosition || 0,
		};
	}

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

		// async function stopDownloads() {
		//     await Downloads.pause();
		// }
		// if (!props.avoidDownloadsManagement){
		//     stopDownloads();
		// }

		// Activamos un intervalo que envia los datos del continue watching según especificaciones de servidor
		if (
			typeof props.hooks?.watchingProgressInterval === "number" &&
			props.hooks?.watchingProgressInterval > 0 &&
			props.hooks?.addContentProgress &&
			playerProgress.current &&
			typeof playerProgress.current.currentTime === "number" &&
			typeof playerProgress.current.duration === "number"
		) {
			watchingProgressIntervalObj.current = BackgroundTimer.setInterval(() => {
				// Evitamos mandar el watching progress en directos, en Chromecast y durante anuncios
				if (hasBeenLoaded.current && !props.playerProgress?.isLive && !isCasting.current && !isPlayingAd.current) {
					props?.hooks?.addContentProgress?.(
						playerProgress.current?.currentTime || 0,
						playerProgress.current?.duration || 0
					);
				}
			}, props.hooks?.watchingProgressInterval);
		}

		const baseTimer = setTimeout(() => {
			setCorrectCastState(true);
		}, DEFAULT_CAST_CONFIG.initializationDelay);
		currentLogger.current?.debug(`Received manifests ${JSON.stringify(props.manifests)}`);

		return () => {
			if (watchingProgressIntervalObj.current) {
				BackgroundTimer.clearInterval(watchingProgressIntervalObj.current);
			}

			deactivateKeepAwake();

			if (!props.avoidRotation && !DeviceInfo.isTablet()) {
				Orientation.lockToPortrait();
			}

			// async function resumeDownloads() {
			//     await Downloads.resume();
			// }

			// Reanudamos las descargas
			// if (!props.avoidDownloadsManagement){
			//     resumeDownloads();
			// }

			if (Platform.OS === "android") {
				SystemNavigationBar.fullScreen(false);
			}

			clearTimeout(baseTimer);
		};
	}, []);

	const handleChangePreferences = (preferences: any) => {
		currentLogger.current?.info(
			`[Player] handleChangePreferences called with: ${JSON.stringify(preferences)}`
		);

		// Actualizar estados internos cuando se aplican preferencias
		if (typeof preferences?.audioIndex === "number") {
			currentLogger.current?.info(
				`[Player] Setting currentAudioIndex to ${preferences.audioIndex}`
			);
			setCurrentAudioIndex(preferences.audioIndex);
		}
		if (typeof preferences?.subtitleIndex === "number") {
			currentLogger.current?.info(
				`[Player] Setting currentSubtitleIndex to ${preferences.subtitleIndex}`
			);
			setCurrentSubtitleIndex(preferences.subtitleIndex);
		}

		// Llamar al callback del usuario
		if (props.events?.onChangePreferences) {
			props.events.onChangePreferences(preferences);
		}
	};

	/*
	 *  Función para guardar los cambios en el estado entre flavours
	 *
	 */

	const handleChangeCommonData = (data: ICommonData) => {
		const preferencesData: IPreferencesCommonData = {};

		currentLogger.current?.debug(`handleChangeCommonData ${JSON.stringify(data)}`);

		if (data?.time !== undefined && playerProgress.current) {
			playerProgress.current.currentTime = data.time;
		}

		if (data?.duration !== undefined && playerProgress.current) {
			playerProgress.current.duration = data.duration;

			if (!hasBeenLoaded.current) {
				hasBeenLoaded.current = true;
			}
		}

		if (
			(data?.time !== undefined || data?.duration !== undefined) &&
			props.events?.onProgress
		) {
			props.events.onProgress(
				playerProgress.current?.currentTime || 0,
				playerProgress.current?.duration || 0
			);
		}

		if (data?.paused !== undefined && playerProgress.current) {
			playerProgress.current.isPaused = !!data.paused;

			if (!!data.paused && props.events?.onPause) {
				props.events.onPause();
			} else if (props.events?.onPlay) {
				props.events.onPlay();
			}
		}

		if (data?.muted !== undefined && playerProgress.current) {
			playerProgress.current.isMuted = !!data.muted;
			preferencesData.muted = !!data.muted;
		}

		if (typeof data?.volume === "number" && playerProgress.current) {
			playerProgress.current.volume = data.volume;
			preferencesData.volume = data.volume;
		}

		if (typeof data?.audioIndex === "number") {
			setCurrentAudioIndex(data.audioIndex);
			preferencesData.audioIndex = data.audioIndex;
			preferencesData.audioLabel = data.audioLabel;
			preferencesData.audioCode = data.audioCode;

			if (props.events?.onChangeAudioIndex) {
				props.events.onChangeAudioIndex(data?.audioIndex, data?.audioLabel);
			}
		}

		if (typeof data?.subtitleIndex === "number") {
			setCurrentSubtitleIndex(data.subtitleIndex);
			preferencesData.subtitleIndex = data.subtitleIndex;
			preferencesData.subtitleLabel = data.subtitleLabel;
			preferencesData.subtitleCode = data.subtitleCode;

			if (props.events?.onChangeSubtitleIndex) {
				props.events.onChangeSubtitleIndex(data?.subtitleIndex, data?.subtitleLabel);
			}
		}

		if (
			hasBeenLoadedAudio.current &&
			props?.events?.onChangePreferences &&
			typeof props.events?.onChangePreferences === "function" &&
			Object.keys(preferencesData).length > 0
		) {
			currentLogger.current?.info(
				`Calling onChangePreferences with ${JSON.stringify(preferencesData)}`
			);
			props.events?.onChangePreferences(preferencesData);
		}

		if (
			!hasBeenLoadedAudio.current &&
			(typeof data?.audioIndex === "number" || typeof data?.subtitleIndex === "number")
		) {
			hasBeenLoadedAudio.current = true;
		}

		// Actualizar estado de reproducción de anuncios
		if (data?.isPlayingAd !== undefined) {
			isPlayingAd.current = data.isPlayingAd;
			currentLogger.current?.debug(`[Player] isPlayingAd changed to: ${data.isPlayingAd}`);
			// Propagar el evento al consumidor
			props.events?.onAdPlayingChange?.(data.isPlayingAd);
		}
	};

	if (hasRotated && hasCorrectCastState && isCastActive) {
		currentLogger.current?.debug("Mounting CastFlavour...");
		isCasting.current = true;
		return (
			<Suspense fallback={props.components?.suspenseLoader}>
				<CastFlavour
					playerContext={playerContext.current}
					manifests={props.manifests}
					headers={props.headers}
					languagesMapping={props.languagesMapping}
					liveStartDate={props.liveStartDate}
					audioIndex={currentAudioIndex}
					subtitleIndex={currentSubtitleIndex}
					avoidTimelineThumbnails={props.avoidTimelineThumbnails}
					// Initial State
					initialState={props.initialState}
					// Nuevas Props Agrupadas
					playerMetadata={props.playerMetadata}
					playerProgress={playerProgress.current}
					playerAnalytics={props.playerAnalytics}
					playerTimeMarkers={props.playerTimeMarkers}
					playerAds={props.playerAds}
					// Custom data for Cast receiver
					customDataForCast={props.customDataForCast}
					// Custom Components
					components={props.components}
					// Hooks
					hooks={props.hooks}
					// Events
					events={{
						...props.events,
						onChangeCommonData: handleChangeCommonData,
						onChangePreferences: handleChangePreferences,
					}}
					// Player Features
					features={props.features}
					// Player Logger
					logger={props.logger}
				/>
			</Suspense>
		);
	} else if (hasRotated && hasCorrectCastState && !isCastActive) {
		currentLogger.current?.debug("Mounting NormalFlavour...");
		isCasting.current = false;
		return (
			<Suspense fallback={props.components?.suspenseLoader}>
				<NormalFlavour
					playerContext={playerContext.current}
					manifests={props.manifests}
					headers={props.headers}
					languagesMapping={props.languagesMapping}
					showExternalTudum={props.showExternalTudum}
					playOffline={props.playOffline}
					liveStartDate={props.liveStartDate}
					audioIndex={currentAudioIndex}
					subtitleIndex={currentSubtitleIndex}
					subtitleStyle={props.subtitleStyle}
					avoidTimelineThumbnails={props.avoidTimelineThumbnails}
					// Initial State
					initialState={props.initialState}
					// Nuevas Props Agrupadas
					playerMetadata={props.playerMetadata}
					playerProgress={playerProgress.current}
					playerAnalytics={props.playerAnalytics}
					playerTimeMarkers={props.playerTimeMarkers}
					playerAds={props.playerAds}
					// Custom Components
					components={props.components}
					// Hooks
					hooks={props.hooks}
					// Events
					events={{
						...props.events,
						onChangeCommonData: handleChangeCommonData,
						onChangePreferences: handleChangePreferences,
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
