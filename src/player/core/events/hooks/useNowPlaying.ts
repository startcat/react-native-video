/*
 *  Hook que alimenta el lock-screen / Control Center de iOS a través del módulo
 *  `@overon/react-native-overon-player-now-playing` (NowPlayingControl).
 *
 *  SÓLO iOS: en Android la MediaSession la gobierna el adapter nativo
 *  (getPlayer sobre el ExoPlayer), por lo que aquí no se empuja nada. En iOS el
 *  adapter nativo sólo transporta play/pause, así que metadata/estado/posición se
 *  empujan vía update()/updateState() y el seek llega por el command handler.
 *
 *  La lógica de mapeo vive (y se testea) en NowPlayingAdapter; este hook es sólo
 *  el cableado React + ciclo de vida, igual que useVideoAnalytics.
 */

import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";

import { NowPlayingControl } from "@overon/react-native-overon-player-now-playing";

import {
	NowPlayingAdapter,
	type NowPlayingCommandSink,
	type NowPlayingPlayback,
	type NowPlayingSource,
} from "../NowPlayingAdapter";

import type { OnLoadData } from "../../../../types/events";
import type { OnProgressData } from "../../../../specs/VideoNativeComponent";

/** Ref mínima del player que el command handler necesita para hacer seek. */
interface NowPlayingPlayerRef {
	seek: (time: number, tolerance?: number) => void;
}

export interface UseNowPlayingProps {
	/** showNotificationControls — sólo se activa el lock-screen si es true. */
	enabled?: boolean;
	/** Metadata del contenido (IPlayerMetadata es estructuralmente compatible). */
	metadata?: NowPlayingSource;
	isLive?: boolean;
	isDVR?: boolean;
	/** Estado pausado controlado del flavour. */
	paused?: boolean;
	/** Ref al componente Video para ejecutar seek desde el lock-screen. */
	refVideoPlayer: { current: NowPlayingPlayerRef | null };
	/** Setter del estado pausado del flavour (mantiene la UI sincronizada). */
	setPaused: (paused: boolean) => void;
}

export interface UseNowPlayingReturn {
	nowPlayingEvents: {
		onLoad: (data: OnLoadData) => void;
		onProgress: (data: OnProgressData) => void;
	};
}

const POSITION_PUSH_INTERVAL_MS = 1000;
const isIOS = Platform.OS === "ios";

export const useNowPlaying = ({
	enabled = false,
	metadata,
	isLive,
	isDVR,
	paused = false,
	refVideoPlayer,
	setPaused,
}: UseNowPlayingProps): UseNowPlayingReturn => {
	const adapterRef = useRef<NowPlayingAdapter>();

	// Refs con el último valor para construir el estado sin re-crear la sink ni
	// re-suscribir efectos en cada render/tick.
	const sourceRef = useRef<NowPlayingSource>(metadata ?? {});
	const isLiveRef = useRef<boolean>(!!isLive);
	const isDVRRef = useRef<boolean>(!!isDVR);
	const pausedRef = useRef<boolean>(paused);
	const durationRef = useRef<number>(0);
	const currentTimeRef = useRef<number>(0);
	const bufferingRef = useRef<boolean>(false);
	const lastPositionPushRef = useRef<number>(0);
	const refVideoPlayerRef = useRef(refVideoPlayer);
	const setPausedRef = useRef(setPaused);

	refVideoPlayerRef.current = refVideoPlayer;
	setPausedRef.current = setPaused;
	sourceRef.current = metadata ?? {};
	isLiveRef.current = !!isLive;
	isDVRRef.current = !!isDVR;

	const buildPlayback = useCallback(
		(): NowPlayingPlayback => ({
			isLive: isLiveRef.current,
			isDVR: isDVRRef.current,
			currentTime: currentTimeRef.current,
			duration: durationRef.current,
			paused: pausedRef.current,
			buffering: bufferingRef.current,
		}),
		[]
	);

	const active = isIOS && enabled;

	// Ciclo de vida: enable + command handler mientras esté activo.
	useEffect(() => {
		if (!active) {
			return;
		}

		const sink: NowPlayingCommandSink = {
			seekTo: (seconds: number) => refVideoPlayerRef.current.current?.seek(seconds),
			setPaused: (value: boolean) => setPausedRef.current(value),
			getPaused: () => pausedRef.current,
		};

		const adapter = new NowPlayingAdapter(NowPlayingControl, sink);
		adapterRef.current = adapter;
		adapter.start();
		adapter.syncMetadata(sourceRef.current, buildPlayback());

		return () => {
			adapter.stop();
			adapterRef.current = undefined;
		};
	}, [active, buildPlayback]);

	// Cambios de metadata / live → re-empujar update() completo.
	useEffect(() => {
		if (!active) {
			return;
		}
		adapterRef.current?.syncMetadata(sourceRef.current, buildPlayback());
	}, [active, metadata, isLive, isDVR, buildPlayback]);

	// Cambios de pausa → updateState() ligero.
	useEffect(() => {
		pausedRef.current = paused;
		if (active) {
			adapterRef.current?.syncState(buildPlayback());
		}
	}, [active, paused, buildPlayback]);

	const onLoad = useCallback(
		(data: OnLoadData) => {
			if (typeof data?.duration === "number") {
				durationRef.current = data.duration;
			}
			if (typeof data?.currentTime === "number") {
				currentTimeRef.current = data.currentTime;
			}
			if (active) {
				adapterRef.current?.syncMetadata(sourceRef.current, buildPlayback());
			}
		},
		[active, buildPlayback]
	);

	const onProgress = useCallback(
		(data: OnProgressData) => {
			if (typeof data?.currentTime === "number") {
				currentTimeRef.current = data.currentTime;
			}
			if (!active) {
				return;
			}
			const now = Date.now();
			if (now - lastPositionPushRef.current >= POSITION_PUSH_INTERVAL_MS) {
				lastPositionPushRef.current = now;
				adapterRef.current?.syncMetadata(sourceRef.current, buildPlayback());
			}
		},
		[active, buildPlayback]
	);

	return { nowPlayingEvents: { onLoad, onProgress } };
};
