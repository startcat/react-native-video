/*
 * Tipos y definiciones para el sistema de playlists nativo
 *
 * Este sistema permite gestionar colas de reproducción completamente en el módulo nativo,
 * permitiendo auto-next, controles del widget multimedia, y reproducción en background
 * sin depender de JavaScript activo.
 *
 */

import type { IVideoSource, VideoMetadata } from "../../../types";
import { LogLevel } from "../logger";

/*
 * Tipo de contenido del item de playlist
 *
 */

export enum PlaylistItemType {
	/** Contenido de video */
	VIDEO = "VIDEO",
	/** Contenido de audio */
	AUDIO = "AUDIO",
	/** Contenido en vivo (live streaming) */
	LIVE = "LIVE",
}

/*
 * Estado de un item en la playlist
 *
 */

export enum PlaylistItemStatus {
	/** Pendiente de reproducción */
	PENDING = "PENDING",
	/** Actualmente reproduciéndose */
	PLAYING = "PLAYING",
	/** Completado */
	COMPLETED = "COMPLETED",
	/** Error durante reproducción */
	ERROR = "ERROR",
	/** Saltado por el usuario */
	SKIPPED = "SKIPPED",
}

/*
 * Modo de repetición de la playlist
 *
 */

export enum PlaylistRepeatMode {
	/** Sin repetición */
	OFF = "OFF",
	/** Repetir playlist completa */
	ALL = "ALL",
	/** Repetir item actual */
	ONE = "ONE",
}

/*
 * Modo de orden de reproducción
 *
 */

export enum PlaylistShuffleMode {
	/** Orden normal */
	OFF = "OFF",
	/** Orden aleatorio */
	ON = "ON",
}

/*
 * Item individual de la playlist con toda la información necesaria
 * para reproducción en el módulo nativo
 *
 */

export interface PlaylistItem {
	/** Identificador único del item (generado automáticamente si no se proporciona) */
	id: string;

	/** Source del contenido (URI, headers, DRM, etc.) */
	source: IVideoSource;

	/** Metadata del contenido (título, artista, imagen, etc.) */
	metadata: VideoMetadata;

	/** Tipo de contenido */
	type: PlaylistItemType;

	/** Posición inicial de reproducción en segundos (opcional, para reanudar) */
	startPosition?: number;

	/** Duración total del contenido en segundos (opcional, para optimización) */
	duration?: number;

	/** Estado del item */
	status?: PlaylistItemStatus;

	/** Timestamp de cuando se agregó a la playlist */
	addedAt?: number;

	/** Datos adicionales personalizados */
	customData?: Record<string, any>;
}

/*
 * Configuración de la playlist
 *
 */

export interface PlaylistConfig {
	/** Habilitar auto-next cuando un item termina (default: true) */
	autoNext?: boolean;

	/** Modo de repetición (default: OFF) */
	repeatMode?: PlaylistRepeatMode;

	/** Modo de reproducción aleatoria (default: OFF) */
	shuffleMode?: PlaylistShuffleMode;

	/** Precarga del siguiente item en segundos antes de que termine el actual (default: 30) */
	preloadNextItemSeconds?: number;

	/** Índice del item inicial (default: 0) */
	startIndex?: number;

	/** Saltar automáticamente items con error (default: true) */
	skipOnError?: boolean;

	/** Tiempo de espera máximo para cargar un item en ms (default: 30000) */
	loadTimeoutMs?: number;

	/** Guardar progreso de reproducción automáticamente (default: true) */
	saveProgress?: boolean;

	/** Intervalo para guardar progreso en segundos (default: 10) */
	saveProgressIntervalSeconds?: number;

	/** 
	 * Modo coordinado: PlaylistsManager solo gestiona la cola, 
	 * RCTVideo maneja la reproducción (para auto-next nativo en background)
	 * (default: false) 
	 */
	coordinatedMode?: boolean;
}

/*
 * Estado actual de la playlist
 *
 */

export interface PlaylistState {
	/** Items en la playlist */
	items: PlaylistItem[];

	/** Índice del item actual */
	currentIndex: number;

	/** Item actualmente reproduciéndose */
	currentItem: PlaylistItem | null;

	/** Número total de items */
	totalItems: number;

	/** Modo de repetición actual */
	repeatMode: PlaylistRepeatMode;

	/** Modo de shuffle actual */
	shuffleMode: PlaylistShuffleMode;

	/** Auto-next habilitado */
	autoNextEnabled: boolean;

	/** Playlist está reproduciéndose */
	isPlaying: boolean;

	/** Playlist ha terminado */
	hasEnded: boolean;
}

/*
 * Información de progreso de reproducción de un item
 *
 */

export interface PlaylistItemProgress {
	/** ID del item */
	itemId: string;

	/** Posición actual en segundos */
	position: number;

	/** Duración total en segundos */
	duration: number;

	/** Porcentaje completado (0-100) */
	percentage: number;

	/** Timestamp de la actualización */
	timestamp: number;
}

/*
 * Eventos emitidos por el sistema de playlists
 *
 */

export enum PlaylistEventType {
	/** Playlist cargada e inicializada */
	PLAYLIST_LOADED = "PLAYLIST_LOADED",

	/** Playlist actualizada (items agregados/removidos) */
	PLAYLIST_UPDATED = "PLAYLIST_UPDATED",

	/** Playlist limpiada */
	PLAYLIST_CLEARED = "PLAYLIST_CLEARED",

	/** Item cambió (next/previous/goto) */
	ITEM_CHANGED = "ITEM_CHANGED",

	/** Item empezó a reproducirse */
	ITEM_STARTED = "ITEM_STARTED",

	/** Item terminó de reproducirse */
	ITEM_COMPLETED = "ITEM_COMPLETED",

	/** Error al reproducir item */
	ITEM_ERROR = "ITEM_ERROR",

	/** Item saltado */
	ITEM_SKIPPED = "ITEM_SKIPPED",

	/** Progreso de reproducción actualizado */
	PROGRESS_UPDATED = "PROGRESS_UPDATED",

	/** Configuración de playlist cambió */
	CONFIG_CHANGED = "CONFIG_CHANGED",

	/** Toda la playlist terminó */
	PLAYLIST_ENDED = "PLAYLIST_ENDED",

	/** Orden de items cambió (shuffle) */
	ORDER_CHANGED = "ORDER_CHANGED",
}

/*
 * Callback genérico de eventos de playlist
 *
 */

export type PlaylistEventCallback<T = any> = (data: T) => void;

/*
 * Datos del evento ITEM_CHANGED
 *
 */

export interface ItemChangedEventData {
	/** Item anterior */
	previousItem: PlaylistItem | null;

	/** Item actual */
	currentItem: PlaylistItem;

	/** Índice anterior */
	previousIndex: number;

	/** Índice actual */
	currentIndex: number;

	/** Razón del cambio */
	reason: "next" | "previous" | "goto" | "ended" | "error" | "user";

	/** Timestamp del cambio */
	timestamp: number;
}

/*
 * Datos del evento ITEM_STARTED
 *
 */

export interface ItemStartedEventData {
	/** Item que empezó */
	item: PlaylistItem;

	/** Índice del item */
	index: number;

	/** Posición inicial en segundos */
	startPosition: number;

	/** Timestamp del inicio */
	timestamp: number;
}

/*
 * Datos del evento ITEM_COMPLETED
 *
 */

export interface ItemCompletedEventData {
	/** Item completado */
	item: PlaylistItem;

	/** Índice del item */
	index: number;

	/** Duración total reproducida en segundos */
	duration: number;

	/** Timestamp de finalización */
	timestamp: number;
}

/*
 * Datos del evento ITEM_ERROR
 *
 */

export interface ItemErrorEventData {
	/** Item que falló */
	item: PlaylistItem;

	/** Índice del item */
	index: number;

	/** Código de error */
	errorCode: string;

	/** Mensaje de error */
	errorMessage: string;

	/** Contexto adicional del error */
	errorContext?: Record<string, any>;

	/** Timestamp del error */
	timestamp: number;
}

/*
 * Datos del evento PROGRESS_UPDATED
 *
 */

export interface ProgressUpdatedEventData {
	/** Progreso del item actual */
	progress: PlaylistItemProgress;

	/** Item actual */
	item: PlaylistItem;

	/** Índice del item */
	index: number;
}

/*
 * Datos del evento PLAYLIST_UPDATED
 *
 */

export interface PlaylistUpdatedEventData {
	/** Total de items */
	totalItems: number;

	/** Índice actual */
	currentIndex: number;

	/** Acción realizada */
	action: "added" | "removed" | "inserted" | "reordered";

	/** IDs de items afectados */
	affectedItemIds: string[];

	/** Timestamp de actualización */
	timestamp: number;
}

/*
 * Datos del evento CONFIG_CHANGED
 *
 */

export interface ConfigChangedEventData {
	/** Configuración anterior */
	previousConfig: PlaylistConfig;

	/** Configuración actual */
	currentConfig: PlaylistConfig;

	/** Claves que cambiaron */
	changedKeys: (keyof PlaylistConfig)[];

	/** Timestamp del cambio */
	timestamp: number;
}

/*
 * Configuración del PlaylistsManager
 *
 */

export interface PlaylistsManagerConfig {
	/** Habilitar logging */
	logEnabled?: boolean;

	/** Nivel de logging */
	logLevel?: LogLevel;

	/** Configuración por defecto de playlists */
	defaultPlaylistConfig?: PlaylistConfig;

	/** Habilitar persistencia automática del estado */
	enablePersistence?: boolean;

	/** Clave para AsyncStorage (si enablePersistence = true) */
	persistenceKey?: string;
}

/*
 * Estadísticas de la playlist
 *
 */

export interface PlaylistStats {
	/** Total de items */
	totalItems: number;

	/** Items completados */
	completedItems: number;

	/** Items con error */
	errorItems: number;

	/** Items saltados */
	skippedItems: number;

	/** Items pendientes */
	pendingItems: number;

	/** Duración total en segundos */
	totalDuration: number;

	/** Duración reproducida en segundos */
	playedDuration: number;

	/** Porcentaje de progreso total (0-100) */
	overallProgress: number;
}

/*
 * Filtros para buscar items en la playlist
 *
 */

export interface PlaylistItemFilter {
	/** Filtrar por tipo */
	type?: PlaylistItemType;

	/** Filtrar por estado */
	status?: PlaylistItemStatus;

	/** Filtrar por texto en título o artista */
	searchText?: string;

	/** Filtrar por IDs específicos */
	ids?: string[];

	/** Filtrar por custom data */
	customData?: Record<string, any>;
}

/*
 * Opciones para operaciones batch
 *
 */

export interface PlaylistBatchOptions {
	/** Validar items antes de agregar (default: true) */
	validate?: boolean;

	/** Generar IDs automáticamente si faltan (default: true) */
	generateIds?: boolean;

	/** Notificar evento después de cada item o solo al final (default: 'end') */
	notifyMode?: "each" | "end";

	/** Continuar en caso de error en un item (default: true) */
	continueOnError?: boolean;
}
