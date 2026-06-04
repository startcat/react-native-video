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

export function toNowPlayingCapabilities(playback: NowPlayingPlayback): NowPlayingCapabilities {
	return {
		canPlayPause: true,
		canSkipNext: false,
		canSkipPrevious: false,
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
		case "previous":
		default:
			// RNV reproduce un único vídeo: sin navegación de pistas.
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
			toNowPlayingCapabilities(playback)
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
