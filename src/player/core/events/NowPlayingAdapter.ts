/*
 *  Adaptador que traduce el estado del Player de RNV a la API del módulo
 *  `@overon/react-native-overon-player-now-playing` (NowPlayingControl).
 *
 *  Sólo aplica a iOS: el adapter nativo del módulo (play/pause) no transporta
 *  metadata ni seek, así que el lock-screen iOS se alimenta empujando metadata
 *  vía update()/updateState() y recibiendo comandos (seekTo / togglePlayPause)
 *  por el handler. En Android la sesión media3 la gobierna el adapter nativo
 *  (getPlayer sobre el ExoPlayer), no este código JS.
 *
 *  La lógica de mapeo es pura (toNowPlaying*) para poder testearla aislada.
 */

import { NowPlayingState } from "@overon/react-native-overon-player-now-playing";

import type {
	NowPlayingCapabilities,
	NowPlayingCommand,
	NowPlayingMetadata,
} from "@overon/react-native-overon-player-now-playing";

/** Superficie mínima de NowPlayingControl que consume el adapter (inyectable). */
export interface NowPlayingControlApi {
	enable(): Promise<void> | void;
	disable(): Promise<void> | void;
	update(
		metadata: NowPlayingMetadata,
		state: NowPlayingState,
		capabilities?: NowPlayingCapabilities
	): Promise<void> | void;
	updateState(state: NowPlayingState): Promise<void> | void;
	setCommandHandler(
		handler: (command: NowPlayingCommand, data?: { position?: number }) => void
	): void;
	removeCommandHandler(): void;
}

/** Metadata de origen tal y como la expone el Player de RNV (IPlayerMetadata). */
export interface NowPlayingSource {
	title?: string;
	subtitle?: string;
	artist?: string;
	poster?: string;
	squaredPoster?: string;
}

/** Estado de reproducción relevante para el lock-screen. */
export interface NowPlayingPlayback {
	isLive?: boolean;
	isDVR?: boolean;
	currentTime?: number;
	duration?: number;
	paused?: boolean;
	buffering?: boolean;
	ended?: boolean;
}

/** Acciones que un comando del lock-screen ejecuta sobre el player de RNV. */
export interface NowPlayingCommandSink {
	seekTo(positionSeconds: number): void;
	setPaused(paused: boolean): void;
	getPaused(): boolean;
	/** Navegación de cola del consumidor. Opcionales: sin cola, no se implementan. */
	next?(): void;
	previous?(): void;
}

export function toNowPlayingMetadata(
	source: NowPlayingSource,
	playback: NowPlayingPlayback
): NowPlayingMetadata {
	const metadata: NowPlayingMetadata = {
		title: source.title ?? "",
	};

	const artist = source.artist ?? source.subtitle;
	if (artist) {
		metadata.artist = artist;
	}

	const artworkUrl = source.squaredPoster ?? source.poster;
	if (artworkUrl) {
		metadata.artworkUrl = artworkUrl;
	}

	if (typeof playback.duration === "number" && playback.duration > 0) {
		metadata.duration = playback.duration;
	}

	if (typeof playback.currentTime === "number") {
		metadata.currentTime = playback.currentTime;
	}

	if (playback.isLive) {
		metadata.isLive = true;
	}

	return metadata;
}

export function toNowPlayingCapabilities(
	playback: NowPlayingPlayback,
	/**
	 * Navegación de cola disponible en el consumidor. En iOS estas capabilities son
	 * las que habilitan los comandos del MPRemoteCommandCenter: con `canSkipNext`
	 * fijo a false, el sistema NUNCA ofrece el botón y el comando no llega jamás —
	 * el equivalente exacto de que en Android la sesión no anuncie
	 * `COMMAND_SEEK_TO_NEXT`. Por defecto false: sin cola, nada cambia.
	 */
	navigation?: { canSkipNext?: boolean; canSkipPrevious?: boolean }
): NowPlayingCapabilities {
	return {
		canPlayPause: true,
		canSkipNext: !!navigation?.canSkipNext,
		canSkipPrevious: !!navigation?.canSkipPrevious,
		// Live sin DVR no permite scrubbing (preserva PLAYER-50); VOD y live+DVR sí.
		canSeek: !playback.isLive || !!playback.isDVR,
	};
}

export function toNowPlayingState(playback: NowPlayingPlayback): NowPlayingState {
	if (playback.buffering) {
		return NowPlayingState.BUFFERING;
	}
	if (playback.ended) {
		return NowPlayingState.STOPPED;
	}
	if (playback.paused) {
		return NowPlayingState.PAUSED;
	}
	return NowPlayingState.PLAYING;
}

export function resolveNowPlayingCommand(
	command: NowPlayingCommand,
	data: { position?: number } | undefined,
	sink: NowPlayingCommandSink
): void {
	switch (command) {
		case "play":
			sink.setPaused(false);
			break;
		case "pause":
			sink.setPaused(true);
			break;
		case "togglePlayPause":
			sink.setPaused(!sink.getPaused());
			break;
		case "seekTo":
			if (data && typeof data.position === "number") {
				sink.seekTo(data.position);
			}
			break;
		case "next":
			// RNV reproduce un único vídeo, pero el flavour puede estar sirviendo una
			// cola del consumidor (props.events.onNext). Si no la hay, el sink no
			// implementa estos métodos y esto sigue siendo un no-op.
			sink.next?.();
			break;
		case "previous":
			sink.previous?.();
			break;
		default:
			break;
	}
}

export class NowPlayingAdapter {
	constructor(
		private readonly control: NowPlayingControlApi,
		private readonly sink: NowPlayingCommandSink
	) {}

	start(): void {
		this.control.enable();
		this.control.setCommandHandler((command, data) =>
			resolveNowPlayingCommand(command, data, this.sink)
		);
	}

	syncMetadata(source: NowPlayingSource, playback: NowPlayingPlayback): void {
		this.control.update(
			toNowPlayingMetadata(source, playback),
			toNowPlayingState(playback),
			// El propio sink dice si hay cola: si el consumidor no pasó onNext, el
			// comando no se anuncia y el sistema no muestra el botón.
			toNowPlayingCapabilities(playback, {
				canSkipNext: !!this.sink.next,
				canSkipPrevious: !!this.sink.previous,
			})
		);
	}

	syncState(playback: NowPlayingPlayback): void {
		this.control.updateState(toNowPlayingState(playback));
	}

	stop(): void {
		this.control.removeCommandHandler();
		this.control.disable();
	}
}
