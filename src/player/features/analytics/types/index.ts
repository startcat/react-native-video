/*
 *  Interfaz principal del Plugin Genérico de Analíticas
 *
 */

export interface PositionParams {
    position: number; // Posición en milisegundos
    duration?: number; // Duración total en milisegundos (opcional)
  }
  
  export interface MetadataParams {
    metadata: any;
  }
  
  export interface DurationChangeParams {
    duration: number; // Nueva duración en milisegundos
    previousDuration?: number; // Duración anterior (opcional)
  }
  
  export interface StopParams {
    reason?: 'user' | 'error' | 'completion' | 'navigation'; // Razón de la parada (opcional)
  }
  
  export interface SeekEndParams extends PositionParams {
    fromPosition?: number; // Posición desde donde se buscó (opcional)
  }
  
  export interface PositionChangeParams extends PositionParams {
    playbackRate?: number; // Velocidad de reproducción actual (opcional)
  }
  
  export interface PositionUpdateParams extends PositionParams {
    bufferedPosition?: number; // Posición buffeada (opcional)
  }
  
  export interface ProgressParams extends PositionParams {
    percentageWatched?: number; // Porcentaje visto (calculado, opcional)
  }
  
  export interface PlaybackRateChangeParams {
    rate: number; // Nueva velocidad de reproducción (REQUERIDO)
    previousRate?: number; // Velocidad anterior (opcional)
  }
  
  export interface AdBeginParams {
    adId?: string; // ID del anuncio (opcional)
    adDuration?: number; // Duración del anuncio en milisegundos (opcional)
    adPosition?: number; // Posición del anuncio en el contenido (opcional)
    adType?: 'preroll' | 'midroll' | 'postroll'; // Tipo de anuncio (opcional)
  }
  
  export interface AdEndParams {
    adId?: string; // ID del anuncio (opcional)
    completed?: boolean; // Si el anuncio se completó o se saltó (opcional)
  }
  
  export interface AdPauseParams {
    adId?: string; // ID del anuncio (opcional)
  }
  
  export interface AdResumeParams {
    adId?: string; // ID del anuncio (opcional)
  }
  
  export interface AdSkipParams {
    adId?: string; // ID del anuncio (opcional)
    skipPosition?: number; // Posición donde se saltó en milisegundos (opcional)
  }
  
  export interface AdBreakBeginParams {
    adBreakId?: string; // ID del bloque de anuncios (opcional)
    adCount?: number; // Número de anuncios en el bloque (opcional)
    adBreakPosition?: number; // Posición del bloque en el contenido (opcional)
  }
  
  export interface AdBreakEndParams {
    adBreakId?: string; // ID del bloque de anuncios (opcional)
  }
  
  export interface ErrorParams {
    errorCode?: string | number; // Código de error (opcional)
    errorMessage?: string; // Mensaje de error (opcional)
    errorType?: 'playback' | 'network' | 'drm' | 'other'; // Tipo de error (opcional)
    isFatal?: boolean; // Si el error es fatal (opcional)
  }
  
  export interface ContentProtectionErrorParams extends ErrorParams {
    drmType?: string; // Tipo de DRM (opcional)
  }
  
  export interface NetworkErrorParams extends ErrorParams {
    statusCode?: number; // Código de estado HTTP (opcional)
    url?: string; // URL que causó el error (opcional)
  }
  
  export interface StreamErrorParams extends ErrorParams {
    streamUrl?: string; // URL del stream (opcional)
    bitrate?: number; // Bitrate del stream (opcional)
  }
  
  export interface AudioTrackChangeParams {
    trackIndex: number; // Índice de la pista de audio (REQUERIDO)
    trackLabel?: string; // Etiqueta de la pista (opcional)
    language?: string; // Idioma de la pista (opcional, código ISO)
  }
  
  export interface VolumeChangeParams {
    volume: number; // Nivel de volumen 0.0 - 1.0 (REQUERIDO)
    previousVolume?: number; // Volumen anterior (opcional)
  }
  
  export interface MuteChangeParams {
    muted: boolean; // Estado de silencio (REQUERIDO)
  }
  
  export interface SubtitleTrackChangeParams {
    trackIndex: number; // Índice de la pista de subtítulos (REQUERIDO)
    trackLabel?: string; // Etiqueta de la pista (opcional)
    language?: string; // Idioma de la pista (opcional, código ISO)
  }
  
  export interface SubtitleShowParams {
    trackIndex?: number; // Índice de la pista mostrada (opcional)
  }
  
  export interface QualityChangeParams {
    quality: string; // Etiqueta de calidad (REQUERIDO)
    height?: number; // Altura en píxeles (opcional)
    width?: number; // Ancho en píxeles (opcional)
    bitrate?: number; // Bitrate en bps (opcional)
  }
  
  export interface BitrateChangeParams {
    bitrate: number; // Nuevo bitrate en bps (REQUERIDO)
    previousBitrate?: number; // Bitrate anterior (opcional)
    adaptive?: boolean; // Si es adaptativo (opcional)
  }
  
  export interface ResolutionChangeParams {
    width: number; // Ancho en píxeles (REQUERIDO)
    height: number; // Alto en píxeles (REQUERIDO)
    previousWidth?: number; // Ancho anterior (opcional)
    previousHeight?: number; // Alto anterior (opcional)
  }
  
  export interface PlayerPlugin {
    name: string;
    version: string;
  
    /*
     * Gestión de Sesión y Lifecycle
     *
     */
  
    onSourceChange?: () => void;
    onCreatePlaybackSession?: () => void;
    onMetadataLoaded?: (params: MetadataParams) => void;
    onMetadataUpdate?: (params: MetadataParams) => void;
    onDurationChange?: (params: DurationChangeParams) => void;
    onPlay?: () => void;
    onPause?: () => void;
    onEnd?: () => void;
    onStop?: (params: StopParams) => void;
    onBufferStart?: () => void;
    onBufferStop?: () => void;
    onSeekStart?: () => void;
    onSeekEnd?: (params: SeekEndParams) => void;
    onPositionChange?: (params: PositionChangeParams) => void;
    onPositionUpdate?: (params: PositionUpdateParams) => void;
    onProgress?: (params: ProgressParams) => void;
    onPlaybackRateChange?: (params: PlaybackRateChangeParams) => void;
  
    /*
     * Publicidad
     *
     */
  
    onAdBegin?: (params: AdBeginParams) => void;
    onAdEnd?: (params: AdEndParams) => void;
    onAdPause?: (params: AdPauseParams) => void;
    onAdResume?: (params: AdResumeParams) => void;
    onAdSkip?: (params: AdSkipParams) => void;
    onAdBreakBegin?: (params: AdBreakBeginParams) => void;
    onAdBreakEnd?: (params: AdBreakEndParams) => void;
    onContentResume?: () => void;
  
    /*
     * Gestión de Errores
     *
     */
  
    onError?: (params: ErrorParams) => void;
    onContentProtectionError?: (params: ContentProtectionErrorParams) => void;
    onNetworkError?: (params: NetworkErrorParams) => void;
    onStreamError?: (params: StreamErrorParams) => void;
  
    /*
     * Audio y Subtítulos
     *
     */
  
    onAudioTrackChange?: (params: AudioTrackChangeParams) => void;
    onVolumeChange?: (params: VolumeChangeParams) => void;
    onMuteChange?: (params: MuteChangeParams) => void;
    onSubtitleTrackChange?: (params: SubtitleTrackChangeParams) => void;
    onSubtitleShow?: (params: SubtitleShowParams) => void;
    onSubtitleHide?: () => void;
  
    /*
     * Calidades
     *
     */
  
    onQualityChange?: (params: QualityChangeParams) => void;
    onBitrateChange?: (params: BitrateChangeParams) => void;
    onResolutionChange?: (params: ResolutionChangeParams) => void;
  
    /*
     * Limpieza
     *
     */
  
    destroy: () => void;
  }
  