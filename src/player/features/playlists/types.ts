/*
 * Tipos y definiciones para el sistema de playlists nativo
 *
 * Este sistema permite gestionar colas de reproducción completamente en el módulo nativo,
 * permitiendo auto-next, controles del widget multimedia, y reproducción en background
 * sin depender de JavaScript activo.
 *
 */

import type {
	IBasicProgram,
	ILanguagesMapping,
	IManifest,
	IPlayerAds,
	IPlayerAnalytics,
	IPlayerMetadata,
	IPlayerTimeMarkers,
} from "../../types";
import { DVR_PLAYBACK_TYPE } from "../../types/enums";
import { LogLevel } from "../logger";

/*
 * Tipo de contenido del item de playlist
 *
 */

export enum PlaylistItemType {
	TUDUM = "TUDUM",
	VIDEO = "VIDEO",
	AUDIO = "AUDIO",
}

/*
 * Estado de un item en la playlist
 *
 */

export enum PlaylistItemStatus {
	PENDING = "PENDING",
	PLAYING = "PLAYING",
	COMPLETED = "COMPLETED",
	ERROR = "ERROR",
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
 * Sources pre-resueltos para diferentes contextos de reproducción
 *
 * Permite tener diferentes URIs y manifests según dónde se reproduzca el contenido:
 * - Local: Reproducción en el dispositivo (HLS en iOS, DASH en Android, etc.)
 * - Cast: Reproducción en Chromecast (típicamente DASH)
 * - Download: Contenido descargado para offline
 *
 */

export interface ResolvedSources {
	/*
	 * Source para reproducción local en el dispositivo
	 *
	 * ✅ OBLIGATORIO: Este source siempre debe estar presente
	 *
	 */

	local: {
		uri: string;
		manifest: IManifest;
		headers?: Headers;
	} | null;

	/*
	 * Source para reproducción en Chromecast/Google Cast
	 *
	 * ⚠️ OPCIONAL: Si no se proporciona, se usará el source local
	 *
	 * Útil cuando Cast necesita un formato diferente:
	 * - iOS local usa HLS → Cast usa DASH
	 * - Diferentes CDNs para Cast
	 * - DRM diferente para Cast
	 *
	 */

	cast?: {
		uri: string;
		manifest: IManifest;
		headers?: Headers;
		contentType?: string;
		streamType?: "BUFFERED" | "LIVE";
	} | null;

	/*
	 * Source para contenido descargado offline
	 *
	 * ⚠️ OPCIONAL: Solo si el contenido está descargado
	 *
	 */

	download?: {
		uri: string;
		downloadId?: string;
	} | null;
}

/*
 * Información EPG pre-resuelta para contenido live/DVR
 *
 * Contiene un rango de programas para permitir navegación en background
 * sin necesidad de llamar hooks React Native
 *
 */

export interface ResolvedEPG {
	/*
	 * Lista de programas en la ventana DVR
	 *
	 * Para reproducción en background, pre-resuelve al menos
	 * los programas que cubren la ventana DVR completa.
	 *
	 * El sistema nativo puede buscar en este array basándose en timestamps
	 * para actualizar los metadatos del widget multimedia sin llamar a React Native.
	 *
	 */

	programs?: IBasicProgram[];

	/*
	 * Timestamp de cuando se resolvió esta EPG
	 *
	 * Útil para saber si la EPG está desactualizada
	 *
	 */

	resolvedAt?: number;

	/*
	 * Ventana DVR en minutos
	 *
	 * Indica cuánto tiempo hacia atrás se puede navegar
	 *
	 */

	dvrWindowMinutes?: number;
}

export interface liveSettings {
	playbackType: DVR_PLAYBACK_TYPE;
	multiSession?: boolean;
	currentProgram?: IBasicProgram | null;
	liveStartDate?: string;

	/* EPG pre-resuelta para contenido live/DVR */
	resolvedEPG?: ResolvedEPG;
}

/*
 * Item individual de la playlist con toda la información necesaria
 * para reproducción en el módulo nativo
 *
 */

export interface PlaylistItem {
	/* Identificador único del item (generado automáticamente si no se proporciona) */
	id: string;

	/* Tipo de contenido */
	type: PlaylistItemType;

	/* Estado del item */
	status?: PlaylistItemStatus;

	/* Sources PRE-RESUELTOS (Multi-contexto) */
	resolvedSources?: ResolvedSources;

	/* Metadata del contenido (título, artista, imagen, etc.) */
	metadata?: IPlayerMetadata;

	/* Analytics del contenido */
	analytics?: IPlayerAnalytics;

	/* Time markers del contenido */
	timeMarkers?: IPlayerTimeMarkers;

	/* Anuncios del contenido */
	ads?: IPlayerAds;

	/** Estado inicial de reproducción para este item */
	initialState?: {
		startPosition?: number;
		duration?: number;
	};

	/** Idiomas disponibles para el contenido */
	languages?: ILanguagesMapping;

	/** Duración del contenido en segundos (para estadísticas) */
	duration?: number;

	/** Configuración de reproducción DVR */
	isLive?: boolean;
	liveSettings?: liveSettings;

	/** Reproducir desde contenido descargado offline */
	playOffline?: boolean;

	/* Timestamp de cuando se agregó a la playlist */
	addedAt?: number;

	/* Datos extra */
	extraData?: any;
}

/*
 * Versión reducida de PlaylistItem para hooks y callbacks
 *
 */

export interface PlaylistItemSimplified {
	id: string;
	type: PlaylistItemType;
	status?: PlaylistItemStatus;
	resolvedSources?: ResolvedSources;
	metadata?: IPlayerMetadata;
	timeMarkers?: IPlayerTimeMarkers;
	duration?: number;
	isLive?: boolean;
	liveSettings?: liveSettings;
	playOffline?: boolean;
	addedAt?: number;
	extraData?: any;
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

	/** Índice del item inicial (default: 0) */
	startIndex?: number;

	/** Saltar automáticamente items con error (default: true) */
	skipOnError?: boolean;

	/** Tiempo de espera máximo para cargar un item en ms (default: 30000) */
	loadTimeoutMs?: number;

	/**
	 * Modo coordinado con componente Video (default: true)
	 *
	 * - true: El módulo nativo escucha eventos del componente Video y gestiona solo la cola.
	 *   Ideal para reproducción con UI visual (Video component).
	 *
	 * - false: Modo standalone - el módulo gestiona su propio reproductor.
	 *   Útil para reproducción desde servicios JavaScript sin componentes visuales.
	 */
	coordinatedMode?: boolean;
}

/*
 * Estado actual de la playlist
 *
 */

export interface PlaylistState {
	items: PlaylistItem[];
	currentIndex: number;
	currentItem: PlaylistItem | null;
	totalItems: number;
	repeatMode: PlaylistRepeatMode;
	shuffleMode: PlaylistShuffleMode;
	autoNextEnabled: boolean;
	isPlaying: boolean;
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
	/** ID del item que empezó */
	itemId?: string;

	/** Índice del item */
	index?: number;

	/** Posición inicial en segundos */
	startPosition?: number;

	/** Timestamp del inicio */
	timestamp: number;
}

/*
 * Datos del evento ITEM_COMPLETED
 *
 */

export interface ItemCompletedEventData {
	/** ID del item completado */
	itemId: string;

	/** Índice del item */
	index: number;

	/** Timestamp de finalización */
	timestamp: number;
}

/*
 * Datos del evento ITEM_ERROR
 *
 */

export interface ItemErrorEventData {
	/** ID del item que falló */
	itemId: string;

	/** Índice del item */
	index?: number;

	/** Código de error */
	errorCode?: string;

	/** Mensaje de error */
	errorMessage?: string;

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
	/** Progreso del item actual (datos nativos) */
	[key: string]: any;
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
