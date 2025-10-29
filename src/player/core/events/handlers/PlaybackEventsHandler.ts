/*
 *  Handler específico para eventos de reproducción
 *
 */

import { PlayerError } from "../../../core/errors";
import { PlayerAnalyticsEvents } from "../../../features/analytics";

import type {
	OnBufferData,
	OnPlaybackStateChangedData,
	OnProgressData,
	OnSeekData,
} from "../../../../specs/VideoNativeComponent";

export class PlaybackEventsHandler {
	private analyticsEvents: PlayerAnalyticsEvents;
	private isSeekInProgress = false;
	private seekFromPosition?: number;
	private seekToPosition?: number;

	constructor(analyticsEvents: PlayerAnalyticsEvents) {
		this.analyticsEvents = analyticsEvents;
	}

	handleProgress = (data: OnProgressData, positionMs: number, durationMs: number) => {
		// Si hay un seek en progreso, verificar si ya llegamos a la posición objetivo
		if (this.isSeekInProgress && this.seekToPosition !== undefined) {
			const tolerance = 1000; // 1 segundo de tolerancia
			const currentPos = positionMs;
			const targetPos = this.seekToPosition;

			// Si estamos cerca de la posición objetivo, el seek terminó
			if (Math.abs(currentPos - targetPos) <= tolerance) {
				this.finishSeek(currentPos);
			}
		}

		// Actualizar posición - se dispara con cada evento onProgress del Video
		this.analyticsEvents.onPositionUpdate({
			position: positionMs,
			duration: durationMs,
			bufferedPosition: data.seekableDuration * 1000,
		});

		// Disparar evento de progreso - ya viene con la frecuencia correcta del reproductor
		const percentageWatched = durationMs > 0 ? (positionMs / durationMs) * 100 : 0;

		this.analyticsEvents.onProgress({
			position: positionMs,
			duration: durationMs,
			percentageWatched,
		});
	};

	handlePlaybackStateChange = (data: OnPlaybackStateChangedData, wasPlaying: boolean) => {
		if (data.isPlaying && !wasPlaying) {
			this.analyticsEvents.onPlay();
		} else if (!data.isPlaying && wasPlaying) {
			this.analyticsEvents.onPause();
		}
	};

	handleBuffer = (data: OnBufferData, wasBuffering: boolean) => {
		if (data.isBuffering && !wasBuffering) {
			this.analyticsEvents.onBufferStart();
		} else if (!data.isBuffering && wasBuffering) {
			this.analyticsEvents.onBufferStop();

			// Si había un seek en progreso y ya no está buffeando,
			// es posible que el seek haya terminado
			if (this.isSeekInProgress) {
				// Esperamos al próximo onProgress para confirmar la posición
				console.log(
					"[PlaybackEventsHandler] Seek buffering finished, waiting for position confirmation"
				);
			}
		}
	};

	handleSeek = (data: OnSeekData, fromPositionMs: number) => {
		try {
			const toPositionMs = data.currentTime * 1000;

			// Iniciar el seek
			if (!this.isSeekInProgress) {
				this.analyticsEvents.onSeekStart();
				this.isSeekInProgress = true;
				this.seekFromPosition = fromPositionMs;
				this.seekToPosition = toPositionMs;

				console.log(
					`[PlaybackEventsHandler] Seek started: ${fromPositionMs}ms -> ${toPositionMs}ms`
				);
			}

			// No disparamos onSeekEnd aquí - esperamos a que onProgress o onBuffer nos confirmen

        } catch (error) {
			throw new PlayerError("PLAYER_SEEK_TRACKING_ERROR", { originalError: error });
		}
	};

	private finishSeek = (currentPositionMs: number) => {
		try {
			if (this.isSeekInProgress) {
				this.analyticsEvents.onSeekEnd({
					position: currentPositionMs,
					fromPosition: this.seekFromPosition,
				});

				this.analyticsEvents.onPositionChange({
					position: currentPositionMs,
					playbackRate: 1.0, // Esto debería venir del estado del reproductor
				});

				console.log(`[PlaybackEventsHandler] Seek finished at: ${currentPositionMs}ms`);

				// Limpiar estado del seek
				this.isSeekInProgress = false;
				this.seekFromPosition = undefined;
				this.seekToPosition = undefined;
			}
		} catch (error) {
			throw new PlayerError("PLAYER_SEEK_TRACKING_ERROR", { originalError: error });
		}
	};

	stop = (reason: "user" | "error" | "completion" | "navigation" = "user") => {
		this.analyticsEvents.onStop({ reason });
	};

	// Método para forzar el final del seek si es necesario
	forceSeekEnd = (currentPositionMs: number) => {
		if (this.isSeekInProgress) {
			console.log("[PlaybackEventsHandler] Forcing seek end");
			this.finishSeek(currentPositionMs);
		}
	};

	// Getters para acceso al estado
	getIsSeekInProgress = () => this.isSeekInProgress;
	getSeekFromPosition = () => this.seekFromPosition;
	getSeekToPosition = () => this.seekToPosition;

