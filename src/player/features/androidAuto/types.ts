/**
 * Tipos para integración con Android Auto
 * 
 * Sistema opcional que permite a apps integrar el reproductor de audio
 * con Android Auto para navegación y control desde el vehículo.
 * 
 * Solo disponible en Android.
 */

/**
 * Item de media para Android Auto
 * 
 * Representa un elemento navegable o reproducible en la biblioteca de medios.
 * Puede ser una carpeta (browsable) o un contenido reproducible (playable).
 */
export interface MediaItem {
    /** ID único del item - usado para identificar el contenido */
    id: string;
    
    /** Título del item - mostrado en Android Auto */
    title: string;
    
    /** Subtítulo o descripción - información adicional */
    subtitle?: string;
    
    /** Artista o autor - mostrado debajo del título */
    artist?: string;
    
    /** URI de la imagen/artwork - mostrada en Android Auto */
    artworkUri?: string;
    
    /** URI del contenido de audio/video - usado para reproducción */
    mediaUri?: string;
    
    /** Si el item es navegable (carpeta/categoría) */
    browsable?: boolean;
    
    /** Si el item es reproducible (contenido de audio) */
    playable?: boolean;
    
    /** ID del padre en la jerarquía (para navegación) */
    parentId?: string;
    
    /** Metadata adicional personalizada */
    extras?: Record<string, any>;
}

/**
 * Metadata del contenido actual
 * 
 * Información mostrada en Android Auto durante la reproducción.
 * Se actualiza automáticamente cuando cambia el contenido.
 */
export interface MediaMetadata {
    /** Título del contenido */
    title?: string;
    
    /** Artista o autor */
    artist?: string;
    
    /** Álbum o serie */
    album?: string;
    
    /** URI de artwork/imagen */
    artworkUri?: string;
    
    /** Duración total en segundos */
    duration?: number;
    
    /** Posición actual en segundos */
    position?: number;
    
    /** Metadata adicional */
    extras?: Record<string, any>;
}

/**
 * Callback para solicitudes de navegación
 * 
 * Android Auto solicita contenido de un parentId específico.
 * La app debe retornar los items hijos de ese parent.
 * 
 * @param parentId - ID del padre cuyos hijos se solicitan ("root" para raíz)
 * @returns Array de MediaItems o Promise que resuelve a array
 * 
 * @example
 * ```typescript
 * AndroidAutoControl.onBrowseRequest((parentId) => {
 *     if (parentId === 'root') {
 *         return [
 *             { id: 'podcasts', title: 'Podcasts', browsable: true },
 *             { id: 'music', title: 'Música', browsable: true }
 *         ];
 *     }
 *     
 *     if (parentId === 'podcasts') {
 *         return myPodcasts.map(p => ({
 *             id: p.id,
 *             title: p.title,
 *             artist: p.author,
 *             playable: true
 *         }));
 *     }
 *     
 *     return [];
 * });
 * ```
 */
export type BrowseCallback = (parentId: string) => MediaItem[] | Promise<MediaItem[]>;

/**
 * Callback para reproducción desde Android Auto
 * 
 * Llamado cuando el usuario selecciona un item para reproducir.
 * La app debe cargar el contenido en el reproductor.
 * 
 * @param mediaId - ID del item seleccionado
 * 
 * @example
 * ```typescript
 * AndroidAutoControl.onPlayFromMediaId((mediaId) => {
 *     const item = findItemById(mediaId);
 *     setCurrentSource({
 *         uri: item.uri,
 *         metadata: {
 *             title: item.title,
 *             subtitle: item.artist
 *         }
 *     });
 * });
 * ```
 */
export type PlayCallback = (mediaId: string) => void;

/**
 * Callback para búsqueda en Android Auto
 * 
 * Llamado cuando el usuario realiza una búsqueda por voz o texto.
 * La app debe retornar items que coincidan con la query.
 * 
 * @param query - Texto de búsqueda
 * @returns Array de MediaItems que coinciden con la búsqueda
 */
export type SearchCallback = (query: string) => MediaItem[] | Promise<MediaItem[]>;

/**
 * Configuración de Android Auto
 * 
 * Configuración opcional para integrar el reproductor con Android Auto.
 * Solo se aplica si Android Auto está habilitado.
 */
export interface AndroidAutoConfig {
    /** Habilitar integración con Android Auto */
    enabled: boolean;
    
    /** 
     * Biblioteca de medios inicial
     * Se guarda en caché para respuesta rápida cuando app está cerrada
     */
    library?: MediaItem[];
    
    /** 
     * Callback para navegación dinámica
     * Permite generar contenido bajo demanda en lugar de biblioteca estática
     */
    onBrowseRequest?: BrowseCallback;
    
    /** 
     * Callback para reproducción
     * Llamado cuando usuario selecciona item en Android Auto
     */
    onPlayFromMediaId?: PlayCallback;
    
    /**
     * Callback para búsqueda
     * Permite búsqueda personalizada de contenido
     */
    onSearch?: SearchCallback;
    
    /**
     * Actualizar metadata automáticamente
     * Si true, actualiza Android Auto cuando cambia el contenido
     * @default true
     */
    autoUpdateMetadata?: boolean;
}

/**
 * Estado de conexión de Android Auto
 */
export interface AndroidAutoConnectionStatus {
    /** Si Android Auto está habilitado */
    enabled: boolean;
    
    /** Si Android Auto está conectado actualmente */
    connected: boolean;
    
    /** Si la app está activa (no en background) */
    appActive: boolean;
    
    /** Si JavaScript está listo para recibir eventos */
    jsReady: boolean;
}

/**
 * Evento de Android Auto
 * 
 * Eventos emitidos por el sistema Android Auto
 */
export enum AndroidAutoEvent {
    /** Android Auto se conectó */
    CONNECTED = 'androidAutoConnected',
    
    /** Android Auto se desconectó */
    DISCONNECTED = 'androidAutoDisconnected',
    
    /** Solicitud de navegación */
    BROWSE_REQUEST = 'onBrowseRequest',
    
    /** Solicitud de reproducción */
    PLAY_FROM_MEDIA_ID = 'onPlayFromMediaId',
    
    /** Solicitud de búsqueda */
    SEARCH_REQUEST = 'onSearchRequest',
    
    /** Solicitud de reproducción desde búsqueda */
    PLAY_FROM_SEARCH = 'onPlayFromSearch',
    
    /** Solicitud de reproducción desde URI */
    PLAY_FROM_URI = 'onPlayFromUri',
    
    /** Solicitud de reproducción desde Android Auto */
    ANDROID_AUTO_PLAY_REQUEST = 'androidAutoPlayRequest',
}

/**
 * Datos del evento de navegación
 */
export interface BrowseRequestData {
    /** ID de la solicitud (para responder) */
    requestId: string;
    
    /** ID del padre cuyos hijos se solicitan */
    parentId: string;
    
    /** Página solicitada (para paginación) */
    page?: number;
    
    /** Tamaño de página (para paginación) */
    pageSize?: number;
}

/**
 * Datos del evento de reproducción
 */
export interface PlayRequestData {
    /** ID del media a reproducir */
    mediaId: string;
    
    /** Extras adicionales */
    extras?: Record<string, any>;
}

/**
 * Datos del evento de búsqueda
 */
export interface SearchRequestData {
    /** Query de búsqueda */
    query: string;
    
    /** Extras adicionales */
    extras?: Record<string, any>;
}
