import { EmitterSubscription, NativeEventEmitter, NativeModules } from "react-native";

const { PlaylistControlModule } = NativeModules;

if (!PlaylistControlModule) {
	throw new Error("PlaylistControlModule native module is not available");
}

// Event emitter for playlist events
const playlistEventEmitter = new NativeEventEmitter(PlaylistControlModule);

// Event types
export const PlaylistEvents = {
	ITEM_CHANGED: PlaylistControlModule.EVENT_ITEM_CHANGED,
	ITEM_STARTED: PlaylistControlModule.EVENT_ITEM_STARTED,
	ITEM_COMPLETED: PlaylistControlModule.EVENT_ITEM_COMPLETED,
	ITEM_ERROR: PlaylistControlModule.EVENT_ITEM_ERROR,
	PLAYLIST_ENDED: PlaylistControlModule.EVENT_PLAYLIST_ENDED,
	PROGRESS_UPDATED: PlaylistControlModule.EVENT_PROGRESS_UPDATED,
	CONTROL_ACTION: PlaylistControlModule.EVENT_CONTROL_ACTION,
	PLAYBACK_STATE_CHANGED: PlaylistControlModule.EVENT_PLAYBACK_STATE_CHANGED,
};

// Event data types
export interface PlaylistItemChangedEvent {
	itemId: string;
	index: number;
	previousIndex: number;
	timestamp: number;
}

export interface PlaylistItemStartedEvent {
	itemId: string;
	index: number;
	timestamp: number;
}

export interface PlaylistItemCompletedEvent {
	itemId: string;
	index: number;
	timestamp: number;
}

export interface PlaylistItemErrorEvent {
	itemId: string;
	index: number;
	errorMessage: string;
	timestamp: number;
}

export interface PlaylistEndedEvent {
	timestamp: number;
}

export interface PlaylistControlActionEvent {
	action: "play" | "pause" | "seek" | "next" | "previous" | "stop";
	currentIndex: number;
	timestamp: number;
	position?: number; // For seek action
}

export interface PlaylistPlaybackStateChangedEvent {
	state: "playing" | "paused" | "stopped" | "buffering" | "ended";
	itemId: string;
	index: number;
	mode: "standalone" | "coordinated";
	timestamp: number;
	// Solo en modo standalone:
	isPlaying?: boolean;
	position?: number;
	duration?: number;
}

export interface PlaybackState {
	mode: "standalone" | "coordinated";
	currentIndex: number;
	totalItems: number;
	isPlaying?: boolean; // Only in standalone mode
	position?: number; // Only in standalone mode
	duration?: number; // Only in standalone mode
}

/*
 * PlaylistControl - Control de playlist nativo para Android
 *
 * Proporciona control unificado de playlist en modo standalone y coordinated.
 * Compatible con widgets multimedia y controles externos.
 *
 */

export class PlaylistControl {
	/*
	 * Reproducir el item actual
	 * - Standalone: Controla el player interno
	 * - Coordinated: Emite evento para ReactExoplayerView
	 *
	 */

	static async play(): Promise<boolean> {
		return PlaylistControlModule.play();
	}

	/*
	 * Pausar el item actual
	 * - Standalone: Controla el player interno
	 * - Coordinated: Emite evento para ReactExoplayerView
	 *
	 */

	static async pause(): Promise<boolean> {
		return PlaylistControlModule.pause();
	}

	/*
	 * Buscar a una posición específica (en milisegundos)
	 * - Standalone: Controla el player interno
	 * - Coordinated: Emite evento para ReactExoplayerView
	 *
	 */

	static async seekTo(positionMs: number): Promise<boolean> {
		return PlaylistControlModule.seekTo(positionMs);
	}

	/*
	 * Avanzar al siguiente item de la playlist
	 * - Standalone: Carga el siguiente item automáticamente
	 * - Coordinated: Emite evento y actualiza índice
	 *
	 */

	static async next(): Promise<boolean> {
		return PlaylistControlModule.next();
	}

	/*
	 * Retroceder al item anterior de la playlist
	 * - Standalone: Carga el item anterior automáticamente
	 * - Coordinated: Emite evento y actualiza índice
	 *
	 */

	static async previous(): Promise<boolean> {
		return PlaylistControlModule.previous();
	}

	/*
	 * Detener la reproducción
	 * - Standalone: Detiene el player interno
	 * - Coordinated: Emite evento para ReactExoplayerView
	 *
	 */

	static async stop(): Promise<boolean> {
		return PlaylistControlModule.stop();
	}

	/*
	 * Ir a un índice específico de la playlist
	 *
	 */

	static async goToIndex(index: number): Promise<boolean> {
		return PlaylistControlModule.goToIndex(index);
	}

	/*
	 * Obtener el estado actual de reproducción
	 *
	 */

	static async getPlaybackState(): Promise<PlaybackState> {
		return PlaylistControlModule.getPlaybackState();
	}

	/*
	 * Verificar si el módulo está listo
	 *
	 */

	static async isReady(): Promise<boolean> {
		return PlaylistControlModule.isModuleReady();
	}

	// ========== Event Listeners ==========

	/*
	 * Escuchar cambios de item en la playlist
	 *
	 */

	static onItemChanged(callback: (event: PlaylistItemChangedEvent) => void): EmitterSubscription {
		return playlistEventEmitter.addListener(PlaylistEvents.ITEM_CHANGED, callback);
	}

	/*
	 * Escuchar cuando un item comienza a reproducirse
	 *
	 */

	static onItemStarted(callback: (event: PlaylistItemStartedEvent) => void): EmitterSubscription {
		return playlistEventEmitter.addListener(PlaylistEvents.ITEM_STARTED, callback);
	}

	/*
	 * Escuchar cuando un item termina de reproducirse
	 *
	 */

	static onItemCompleted(
		callback: (event: PlaylistItemCompletedEvent) => void
	): EmitterSubscription {
		return playlistEventEmitter.addListener(PlaylistEvents.ITEM_COMPLETED, callback);
	}

	/*
	 * Escuchar errores en items de la playlist
	 *
	 */

	static onItemError(callback: (event: PlaylistItemErrorEvent) => void): EmitterSubscription {
		return playlistEventEmitter.addListener(PlaylistEvents.ITEM_ERROR, callback);
	}

	/*
	 * Escuchar cuando la playlist termina completamente
	 *
	 */

	static onPlaylistEnded(callback: (event: PlaylistEndedEvent) => void): EmitterSubscription {
		return playlistEventEmitter.addListener(PlaylistEvents.PLAYLIST_ENDED, callback);
	}

	/*
	 * Escuchar acciones de control (solo en modo coordinated)
	 *
	 */

	static onControlAction(
		callback: (event: PlaylistControlActionEvent) => void
	): EmitterSubscription {
		return playlistEventEmitter.addListener(PlaylistEvents.CONTROL_ACTION, callback);
	}

	/*
	 * Escuchar cambios en el estado de reproducción
	 * Se dispara cuando cambia entre playing, paused, stopped, buffering, ended
	 *
	 */

	static onPlaybackStateChanged(
		callback: (event: PlaylistPlaybackStateChangedEvent) => void
	): EmitterSubscription {
		return playlistEventEmitter.addListener(PlaylistEvents.PLAYBACK_STATE_CHANGED, callback);
	}

	/*
	 * Remover todos los listeners
	 *
	 */

	static removeAllListeners(): void {
		Object.values(PlaylistEvents).forEach(eventName => {
			playlistEventEmitter.removeAllListeners(eventName);
		});
	}
}

export default PlaylistControl;
