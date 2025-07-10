import {
    CastSession,
    CastState,
    MediaPlayerState,
    RemoteMediaClient
} from 'react-native-google-cast';
import { SimpleEventEmitter } from './utils/SimpleEventEmitter';

import { CastMessageBuilder } from './CastMessageBuilder';
import {
    CAST_ERROR_MESSAGES,
    DEFAULT_CAST_CONFIG,
    LOG_PREFIX,
    RETRY_CONFIG
} from './constants';
import {
    CastContentInfo,
    CastControlCommand,
    CastControlParams,
    CastManagerCallbacks,
    CastManagerConfig,
    CastManagerEvent,
    CastManagerEventData,
    CastManagerState,
    CastManagerStatus,
    CastMessageConfig,
    CastOperationResult,
    CastProgressInfo,
    PendingCastOperation
} from './types';
import { compareContent } from './utils/castUtils';
import { DVRProgressManagerClass } from '../../modules/dvr';

const LOG_KEY = '(CastManager)';

/*
 *  Clase principal para gestionar Cast
 *
 */

export class CastManager extends SimpleEventEmitter {
    private state: CastManagerState = CastManagerState.DISCONNECTED;
    private config: CastManagerConfig;
    private messageBuilder: CastMessageBuilder;
    private callbacks: CastManagerCallbacks;
    private dvrProgressManager?: DVRProgressManagerClass | null;
    
    // Estado de Cast nativo
    private castState?: CastState;
    private castSession?: CastSession;
    private castClient?: RemoteMediaClient;
    private castMediaStatus?: any;
    private streamPosition?: number;
    
    // Estado interno
    private currentContent?: CastContentInfo;
    private isLoading: boolean = false;
    private isContentLoaded: boolean = false;
    private pendingOperations: PendingCastOperation[] = [];
    private retryAttempts: number = 0;
    private loadTimeout?: ReturnType<typeof setTimeout>;
    
    // Listeners de eventos Cast
    private eventListeners: Map<string, any> = new Map();

    constructor(config: CastManagerConfig = {}) {
        super();
        
        this.config = { ...DEFAULT_CAST_CONFIG, ...config };
        this.callbacks = config.callbacks || {};
        this.dvrProgressManager = config.dvrProgressManager || null;
        this.messageBuilder = new CastMessageBuilder({
            debugMode: this.config.debugMode
        });
        
        this.log(`Initialized`, { config: this.config });
    }

    /*
     *  Actualiza el estado de Cast desde hooks externos
     *
     */
    
    updateCastState(
        castState?: CastState,
        castSession?: CastSession,
        castClient?: RemoteMediaClient,
        castMediaStatus?: any,
        streamPosition?: number
    ): void {
        
        this.castState = castState;
        this.castSession = castSession;
        this.castClient = castClient;
        this.castMediaStatus = castMediaStatus;
        this.streamPosition = streamPosition;
        
        if (this.config.debugMode) {
            this.log(`updateCastState received:`, {
                castState,
                hasSession: !!castSession,
                hasClient: !!castClient,
                hasMediaStatus: !!castMediaStatus,
                castMediaStatus: castMediaStatus,
                currentTime: streamPosition
            });
        }
        
        // SOLUCIÓN: Sincronizar currentContent si hay contenido reproduciéndose
        this.syncCurrentContentFromMediaStatus();
        
        this.updateInternalState();
        
        // Procesar operaciones pendientes si Cast está listo
        if (this.isCastReady()) {
            this.processPendingOperations();
        }
        
        // Registrar/desregistrar listeners
        this.manageEventListeners();
        
        // Debug: Verificar estado después de la actualización
        if (this.config.debugMode) {
            this.log(`updateCastState finished. Current state:`, {
                hasCurrentContent: !!this.currentContent,
                hasCastMediaStatus: !!this.castMediaStatus,
                progressInfoAvailable: this.getProgressInfo() !== undefined,
                currentContentId: this.currentContent?.contentId,
                castMediaCurrentTime: streamPosition
            });
        }
    }

    /*
     *  Carga contenido en Cast
     *
     */

    async loadContent(config: CastMessageConfig): Promise<CastOperationResult> {
        this.log('Loading content', { 
            sourceUri: config.source.uri,
            contentId: config.metadata.id,
            isLive: config.metadata.isLive 
        });

        try {
            // Validar que Cast esté disponible
            if (!this.isCastReady()) {
                this.log('Cast not ready, queuing operation');
                this.queueOperation('load', config);
                return CastOperationResult.PENDING;
            }

            // Verificar si es el mismo contenido antes de procesar
            if (this.currentContent && this.isSameContent(config)) {
                this.log('Same content already loaded, skipping');
                return CastOperationResult.SUCCESS;
            }

            // Construir mensaje Cast
            const castMessage = this.messageBuilder.buildCastMessage(config);

            // Marcar como cargando
            this.setLoadingState(true);

            this.log(`loadContent config:`, { config });
            this.log(`loadContent castMessage:`, { castMessage });
            
            // Configurar timeout
            this.setupLoadTimeout();

            // Cargar en Cast
            const result = await this.castClient!.loadMedia(castMessage);
            
            // Actualizar contenido actual
            this.updateCurrentContent(config, castMessage);
            
            // Limpiar timeout
            this.clearLoadTimeout();
            
            // Marcar como cargado
            this.setLoadingState(false);
            this.isContentLoaded = true;
            
            this.log('Content loaded successfully', { result });
            
            // Invocar callback directo
            if (this.callbacks.onContentLoaded && this.currentContent) {
                this.log('Invoking onContentLoaded callback');
                this.callbacks.onContentLoaded(this.currentContent);
            }
            
            // Emitir evento
            this.emitEvent(CastManagerEvent.CONTENT_LOADED, this.currentContent);
            
            return CastOperationResult.SUCCESS;

        } catch (error) {
            // Detectar errores comunes de Cast que requieren retry
            const errorString = String(error);
            const isMediaControlError = errorString.includes('2103') || errorString.includes('Media control channel');
            
            if (isMediaControlError) {
                this.log('Media control channel not ready (expected on first load), will retry', { error: errorString, attempt: this.retryAttempts + 1 });
            } else {
                this.logError('Error loading content', error);
            }
            
            this.setLoadingState(false);
            this.clearLoadTimeout();
            
            // Intentar retry si es posible
            if (this.shouldRetry()) {
                const retryReason = isMediaControlError ? 'Media control channel timing' : 'General error';
                this.log(`Retrying content load due to: ${retryReason}`);
                return this.retryLoadContent(config);
            }
            
            // Invocar callback directo
            if (this.callbacks.onContentLoadError) {
                this.log('Invoking onContentLoadError callback', error);
                this.callbacks.onContentLoadError(String(error), this.currentContent);
            }
            
            // Emitir error
            this.emitEvent(CastManagerEvent.CONTENT_LOAD_ERROR, { error, config });
            
            return CastOperationResult.FAILED;
        }
    }

    /*
     *  Ejecuta un comando de control
     *
     */
    
    async executeControl(params: CastControlParams): Promise<CastOperationResult> {
        this.log('Executing control command', params);

        if (!this.isCastReady()) {
            this.log('Cast not ready, queuing control operation');
            this.queueOperation(params.command, undefined, params.value);
            return CastOperationResult.PENDING;
        }

        try {
            switch (params.command) {
                case CastControlCommand.PLAY:
                    await this.castClient!.play();
                    break;
                    
                case CastControlCommand.PAUSE:
                    await this.castClient!.pause();
                    break;
                    
                case CastControlCommand.SEEK:
                    if (params.seekTime !== undefined) {
                        await this.castClient!.seek({ position: params.seekTime });
                    }
                    break;
                    
                case CastControlCommand.MUTE:
                    await this.castSession!.setMute(true);
                    break;
                    
                case CastControlCommand.UNMUTE:
                    await this.castSession!.setMute(false);
                    break;
                    
                case CastControlCommand.VOLUME:
                    if (params.volumeLevel !== undefined) {
                        await this.castSession!.setVolume(params.volumeLevel);
                    }
                    break;
                    
                case CastControlCommand.STOP:
                    await this.castClient!.stop();
                    break;

                    case CastControlCommand.SET_AUDIO_TRACK:
                        if (params.audioTrackIndex !== undefined) {
                            // Obtener pistas de audio disponibles
                            const audioTracks = this.castMediaStatus?.mediaInfo?.tracks?.filter(
                                (track: any) => track.type === 'AUDIO'
                            ) || [];
                            
                            if (audioTracks[params.audioTrackIndex]) {
                                await this.castClient!.setActiveTrackIds([audioTracks[params.audioTrackIndex].trackId]);
                                this.log('Audio track changed', { trackIndex: params.audioTrackIndex });
                            } else {
                                throw new Error(`Audio track index ${params.audioTrackIndex} not available`);
                            }
                        }
                        break;
                        
                    case CastControlCommand.SET_SUBTITLE_TRACK:
                        if (params.subtitleTrackIndex !== undefined) {
                            // Obtener pistas de subtítulos disponibles
                            const subtitleTracks = this.castMediaStatus?.mediaInfo?.tracks?.filter(
                                (track: any) => track.type === 'TEXT'
                            ) || [];
                            
                            if (params.subtitleTrackIndex === -1) {
                                // Desactivar subtítulos
                                await this.castClient!.setActiveTrackIds([]);
                                this.log('Subtitles disabled');
                            } else if (subtitleTracks[params.subtitleTrackIndex]) {
                                await this.castClient!.setActiveTrackIds([subtitleTracks[params.subtitleTrackIndex].trackId]);
                                this.log('Subtitle track changed', { trackIndex: params.subtitleTrackIndex });
                            } else {
                                throw new Error(`Subtitle track index ${params.subtitleTrackIndex} not available`);
                            }
                        }
                        break;
                    
                default:
                    throw new Error(`Unsupported control command: ${params.command}`);
            }
            
            this.log('Control command executed successfully', params);
            return CastOperationResult.SUCCESS;
            
        } catch (error) {
            this.logError('Error executing control command', error);
            return CastOperationResult.FAILED;
        }
    }

    /*
     *  Obtiene el estado actual completo
     *
     */

    getStatus(): CastManagerStatus {
        return {
            state: this.state,
            isConnected: this.castState === CastState.CONNECTED,
            isLoading: this.isLoading,
            isContentLoaded: this.isContentLoaded,
            currentContent: this.currentContent ? { ...this.currentContent } : undefined,
            castState: this.castState,
            hasSession: !!this.castSession,
            hasClient: !!this.castClient
        };
    }

    /*
     *  Obtiene información del contenido actual
     *
     */
    
    getCurrentContent(): CastContentInfo | undefined {
        return this.currentContent ? { ...this.currentContent } : undefined;
    }

    /*
     *  Obtiene información de progreso actual
     *
     */

    getProgressInfo(): CastProgressInfo | undefined {
        
        if (!this.currentContent || !this.castMediaStatus) {
            this.log('getProgressInfo returning undefined', {
                hasCurrentContent: !!this.currentContent,
                hasCastMediaStatus: !!this.castMediaStatus,
                currentTime: this.streamPosition
            });
            return undefined;
        }

        // Use streamPosition for Cast playback position (currentTime may be undefined)
        const currentPosition = this.streamPosition || this.castMediaStatus.streamPosition || 0;
        
        // Get base duration from Cast media info
        let duration = this.castMediaStatus.mediaInfo?.streamDuration || 0;
        
        // For live streams with no duration (DVR case), calculate artificial DVR duration
        if (duration === 0 && this.currentContent.isLive) {
            duration = this.calculateDVRDuration();
            
            this.log('Calculated DVR duration', {
                isLive: this.currentContent.isLive,
                isDVR: this.currentContent.isDVR,
                currentPosition: currentPosition,
                calculatedDuration: duration,
                streamDuration: this.castMediaStatus.mediaInfo?.streamDuration
            });
        }
        
        const progressInfo = {
            currentTime: currentPosition,
            duration: duration,
            isBuffering: this.castMediaStatus.playerState === MediaPlayerState.BUFFERING,
            isPaused: this.castMediaStatus.playerState === MediaPlayerState.PAUSED,
            isMuted: this.castMediaStatus.isMuted || false,
            playbackRate: this.castMediaStatus.playbackRate || 1,
        };
        
        this.log('getProgressInfo returning', progressInfo);
        return progressInfo;
    }

    /*
     *  Calcula la duración DVR artificial para streams en vivo
     *
     */

    private calculateDVRDuration(): number {
        // 1. PRIORIDAD MÁXIMA: Usar valores exactos del DVRProgressManagerClass
        if (this.dvrProgressManager) {
            const stats = this.dvrProgressManager.getStats();
            
            // Si tiene duración externa configurada, usarla
            if (stats.duration && stats.duration > 0) {
                this.log('Using exact DVR duration from DVRProgressManager', {
                    dvrDuration: stats.duration,
                    source: 'external_duration'
                });
                return stats.duration;
            }
            
            // Si no, usar la ventana DVR actual (que crece dinámicamente)
            if (stats.currentTimeWindowSeconds && stats.currentTimeWindowSeconds > 0) {
                this.log('Using exact DVR window from DVRProgressManager', {
                    windowSeconds: stats.currentTimeWindowSeconds,
                    source: 'current_window'
                });
                return stats.currentTimeWindowSeconds;
            }
        }
        
        // 2. FALLBACK: Intentar obtener desde customData del Cast
        const customData = this.castMediaStatus?.mediaInfo?.customData || {};
        if (customData.dvrWindowSeconds && customData.dvrWindowSeconds > 0) {
            this.log('Using DVR window from Cast customData', {
                windowSeconds: customData.dvrWindowSeconds,
                source: 'cast_custom_data'
            });
            return customData.dvrWindowSeconds;
        }
        
        // 3. FALLBACK: Calcular desde seekable ranges si están disponibles
        if (customData.seekableStart !== undefined && customData.seekableEnd !== undefined) {
            const seekableWindow = customData.seekableEnd - customData.seekableStart;
            if (seekableWindow > 0) {
                this.log('Using DVR window from seekable range', {
                    windowSeconds: seekableWindow,
                    source: 'seekable_range'
                });
                return Math.max(seekableWindow, 300); // Mínimo 5 minutos
            }
        }
        
        // 4. Último FALLBACK: Ventana por defecto
        const DEFAULT_DVR_WINDOW_SECONDS = 3600; // 1 hora por defecto
        this.log('Using default DVR window (no exact data available)', {
            windowSeconds: DEFAULT_DVR_WINDOW_SECONDS,
            source: 'default_fallback'
        });
        
        return DEFAULT_DVR_WINDOW_SECONDS;
    }

    /*
     *  Verifica si el contenido dado es el mismo que el actual
     *
     */

    isSameContent(config: CastMessageConfig): boolean {
        if (!this.currentContent) {
            return false;
        }

        const comparison = compareContent(this.currentContent, config);
        return comparison.isSameContent;
    }

    /*
     *  Limpia el contenido actual
     *
     */

    clearCurrentContent(): void {
        this.currentContent = undefined;
        this.isContentLoaded = false;
        this.log('Current content cleared');
    }

    /*
     *  Destruye el manager y limpia recursos
     *
     */

    destroy(): void {
        this.log('Destroying CastManager');
        
        // Limpiar timeouts
        this.clearLoadTimeout();
        
        // Limpiar listeners
        this.clearEventListeners();
        
        // Limpiar operaciones pendientes
        this.pendingOperations = [];
        
        // Limpiar estado
        this.currentContent = undefined;
        this.isLoading = false;
        this.isContentLoaded = false;
        
        // Remover todos los listeners
        this.removeAllListeners();
        
        this.log('CastManager destroyed');
    }

    // MÉTODOS PRIVADOS

    /*
     *  Actualiza el estado interno basado en el estado de Cast
     *
     */

    private updateInternalState(): void {
        const previousManagerState = this.state;
        
        // Actualizar estado basado en el estado de Cast nativo
        if (!this.castState || this.castState === CastState.NOT_CONNECTED) {
            this.state = CastManagerState.DISCONNECTED;
        } else if (this.castState === CastState.CONNECTING) {
            this.state = CastManagerState.CONNECTING;
        } else if (this.castState === CastState.CONNECTED) {
            if (this.isLoading) {
                this.state = CastManagerState.LOADING;
            } else if (this.castMediaStatus) {
                // Mapear estado del reproductor a estado del manager
                this.state = this.mapMediaStateToManagerState(this.castMediaStatus.playerState);
            } else {
                this.state = CastManagerState.CONNECTED;
            }
        }
        
        // Log para depuración del estado
        if (previousManagerState !== this.state) {
            this.log('Manager state changed', {
                from: previousManagerState,
                to: this.state,
                castState: this.castState,
                isLoading: this.isLoading,
                hasMediaStatus: !!this.castMediaStatus,
                playerState: this.castMediaStatus?.playerState
            });
            
            // Emitir cambio de estado
            this.emitStateChange(previousManagerState);
            
            // Invocar callback de buffering change si hay cambio relevante
            const isNowBuffering = this.state === CastManagerState.LOADING;
            const wasBuffering = previousManagerState === CastManagerState.LOADING;
            if (isNowBuffering !== wasBuffering && this.callbacks.onBufferingChange) {
                this.log('Invoking onBufferingChange callback', { isBuffering: isNowBuffering });
                this.callbacks.onBufferingChange(isNowBuffering);
            }
        }
        
        // Invocar callback de time update si hay media status
        if (this.castMediaStatus && this.callbacks.onTimeUpdate) {
            // Use streamPosition for Cast (currentTime may be undefined)
            const currentTime = this.streamPosition || 0;
            const duration = this.castMediaStatus.mediaInfo?.streamDuration || 0;
            if (currentTime > 0 || duration > 0) {
                this.log('Invoking onTimeUpdate callback', { currentTime, duration, streamPosition: this.streamPosition });
                this.callbacks.onTimeUpdate(currentTime, duration);
            }
        }
        
        // Limpiar contenido si se desconecta
        if (this.state === CastManagerState.DISCONNECTED) {
            this.clearCurrentContent();
        }
    }

    /*
     *  Mapea estado de media a estado del manager
     *
     */

    private mapMediaStateToManagerState(mediaState: MediaPlayerState): CastManagerState {
        switch (mediaState) {
            case MediaPlayerState.PLAYING:
                return CastManagerState.PLAYING;
            case MediaPlayerState.PAUSED:
                return CastManagerState.PAUSED;
            case MediaPlayerState.BUFFERING:
            case MediaPlayerState.LOADING:
                return CastManagerState.BUFFERING;
            case MediaPlayerState.IDLE:
                return CastManagerState.CONNECTED;
            default:
                return CastManagerState.CONNECTED;
        }
    }

    /*
     *  Verifica si Cast está listo para operaciones
     *
     */

    private isCastReady(): boolean {
        return this.castState === CastState.CONNECTED && 
               !!this.castSession && 
               !!this.castClient;
    }

    /*
     *  Gestiona listeners de eventos Cast
     *
     */

    private manageEventListeners(): void {
        if (this.castClient && this.eventListeners.size === 0) {
            this.registerEventListeners();
        } else if (!this.castClient && this.eventListeners.size > 0) {
            this.clearEventListeners();
        }
    }

    /*
     *  Registra listeners de eventos Cast
     *
     */

    private registerEventListeners(): void {
        if (!this.castClient) return;
        
        this.log('Registering Cast event listeners');
        
        const onPlaybackStarted = this.castClient.onMediaPlaybackStarted(() => {
            this.log('Playback started - clearing loading state');
            
            // Limpiar estado de carga y actualizar estado interno
            this.setLoadingState(false);
            
            // Invocar callback directo
            if (this.callbacks.onPlaybackStarted) {
                this.log('Invoking onPlaybackStarted callback');
                this.callbacks.onPlaybackStarted();
            }
            
            this.emitEvent(CastManagerEvent.PLAYBACK_STARTED);
        });
        
        const onPlaybackEnded = this.castClient.onMediaPlaybackEnded(() => {
            this.log('Playback ended');
            
            // Invocar callback directo
            if (this.callbacks.onPlaybackEnded) {
                this.log('Invoking onPlaybackEnded callback');
                this.callbacks.onPlaybackEnded();
            }
            
            this.emitEvent(CastManagerEvent.PLAYBACK_ENDED);
        });
        
        this.eventListeners.set('playbackStarted', onPlaybackStarted);
        this.eventListeners.set('playbackEnded', onPlaybackEnded);
        
    }

    /*
     *  Limpia listeners de eventos Cast
     *
     */

    private clearEventListeners(): void {
        this.log('Clearing Cast event listeners');
        
        this.eventListeners.forEach((listener) => {
            if (listener && typeof listener.remove === 'function') {
                listener.remove();
            }
        });
        
        this.eventListeners.clear();
    }

    /*
     *  Procesa operaciones pendientes
     *
     */

    private processPendingOperations(): void {
        if (this.pendingOperations.length === 0) return;
        
        this.log('Processing pending operations', { count: this.pendingOperations.length });
        
        const operations = [...this.pendingOperations];
        this.pendingOperations = [];
        
        operations.forEach(async (operation) => {
            try {
                if (operation.type === 'load' && operation.config) {
                    await this.loadContent(operation.config);
                } else {
                    await this.executeControl({
                        command: operation.type as CastControlCommand,
                        value: operation.value
                    });
                }
            } catch (error) {
                this.logError('Error processing pending operation', error);
            }
        });
    }

    /*
     *  Agrega operación a la cola de pendientes
     *
     */

    private queueOperation(type: string, config?: CastMessageConfig, value?: any): void {
        this.pendingOperations.push({
            type: type as any,
            config,
            value,
            timestamp: Date.now()
        });
        
        this.log('Operation queued', { type, queueLength: this.pendingOperations.length });
    }

    /*
     *  Actualiza información del contenido actual
     *
     */

    private updateCurrentContent(config: CastMessageConfig, castMessage: any): void {
        this.currentContent = {
            contentId: castMessage.mediaInfo?.contentId || '',
            contentUrl: config.source.uri,
            title: config.metadata.title,
            subtitle: config.metadata.subtitle,
            description: config.metadata.description,
            poster: config.metadata.poster,
            isLive: config.metadata.isLive || false,
            isDVR: config.metadata.isDVR || false,
            contentType: config.metadata.isLive ? 
                (config.metadata.isDVR ? 'dvr' : 'live') : 'vod',
            startPosition: config.metadata.startPosition || 0
        } as CastContentInfo;
        
        this.log('Current content updated', this.currentContent);
    }

    /*
     *  Detecta si un stream tiene capacidades DVR
     *
     */

    private detectDVRCapability(mediaInfo: any): boolean {
        // 1. Si el stream tiene duración indefinida/0, probablemente es DVR
        const streamDuration = mediaInfo.streamDuration || 0;
        const hasIndefiniteDuration = streamDuration === 0;
        
        // 2. Verificar si hay información de seekable ranges en customData
        const customData = mediaInfo.customData || {};
        const hasSeekableInfo = !!(customData.seekableStart !== undefined || 
                                   customData.seekableEnd !== undefined ||
                                   customData.dvrWindowSeconds !== undefined);
        
        // 3. Verificar si la posición actual es significativa (indica buffering desde el pasado)
        const currentTime = this.streamPosition || this.castMediaStatus?.streamPosition || 0;
        const hasSignificantPosition = currentTime > 60; // Más de 1 minuto indica posible DVR
        
        // 4. Verificar patrones típicos de URLs DVR (HLS con parámetros de tiempo)
        const contentUrl = mediaInfo.contentUrl || '';
        const hasTimeParams = /[&?](t|start|begin|time)=/.test(contentUrl);
        
        this.log('DVR capability detection', {
            streamDuration: streamDuration,
            hasIndefiniteDuration: hasIndefiniteDuration,
            hasSeekableInfo: hasSeekableInfo,
            currentTime: currentTime,
            hasSignificantPosition: hasSignificantPosition,
            hasTimeParams: hasTimeParams,
            customData: customData
        });
        
        // Es DVR si tiene duración indefinida Y (posición significativa O información seekable O parámetros de tiempo)
        return hasIndefiniteDuration && (hasSignificantPosition || hasSeekableInfo || hasTimeParams);
    }

    /*
     *  Sincroniza currentContent cuando hay contenido reproduciéndose
     *  pero no fue cargado vía loadContent()
     */

    private syncCurrentContentFromMediaStatus(): void {
        this.log('[SYNC] syncCurrentContentFromMediaStatus called', {
            hasCurrentContent: !!this.currentContent,
            hasCastMediaStatus: !!this.castMediaStatus,
            hasMediaInfo: !!this.castMediaStatus?.mediaInfo,
            mediaInfo: this.castMediaStatus?.mediaInfo
        });
        
        // Solo sincronizar si:
        // 1. No tenemos currentContent ya establecido
        // 2. Tenemos castMediaStatus válido con mediaInfo
        if (this.currentContent) {
            this.log('[SYNC] Skipping sync - currentContent already exists');
            return;
        }
        
        if (!this.castMediaStatus) {
            this.log('[SYNC] Skipping sync - no castMediaStatus');
            return;
        }
        
        if (!this.castMediaStatus.mediaInfo) {
            this.log('[SYNC] Skipping sync - no mediaInfo in castMediaStatus');
            return;
        }

        const mediaInfo = this.castMediaStatus.mediaInfo;
        
        // Detectar si es DVR basándose en características del stream
        const isLiveStream = mediaInfo.streamType === 'LIVE';
        const hasDVRCapability = this.detectDVRCapability(mediaInfo);
        
        // Crear currentContent basado en la información disponible del mediaStatus
        this.currentContent = {
            contentId: mediaInfo.contentId || '',
            contentUrl: mediaInfo.contentUrl || '',
            title: mediaInfo.metadata?.title || 'Unknown Title',
            subtitle: mediaInfo.metadata?.subtitle || '',
            description: mediaInfo.metadata?.description || '',
            poster: mediaInfo.metadata?.images?.[0]?.url || '',
            isLive: isLiveStream,
            isDVR: isLiveStream && hasDVRCapability,
            contentType: isLiveStream ? (hasDVRCapability ? 'dvr' : 'live') : 'vod',
            startPosition: 0
        } as CastContentInfo;
        
        this.log('[SYNC] Auto-synced currentContent from castMediaStatus:', {
            contentId: this.currentContent.contentId,
            title: this.currentContent.title,
            isLive: this.currentContent.isLive,
            streamType: mediaInfo.streamType
        });
    }

    /*
     *  Configura timeout para carga
     *
     */

    private setupLoadTimeout(): void {
        this.clearLoadTimeout();
        
        this.loadTimeout = setTimeout(() => {
            this.logError('Load timeout exceeded', { timeout: this.config.loadTimeout });
            this.setLoadingState(false);
            this.emitEvent(CastManagerEvent.CONTENT_LOAD_ERROR, { 
                error: CAST_ERROR_MESSAGES.TIMEOUT 
            });
        }, this.config.loadTimeout);
    }

    /*
     *  Limpia timeout de carga
     *
     */

    private clearLoadTimeout(): void {
        if (this.loadTimeout) {
            clearTimeout(this.loadTimeout);
            this.loadTimeout = undefined;
        }
    }

    /*
     *  Establece estado de carga
     *
     */

    private setLoadingState(loading: boolean): void {
        const previousLoading = this.isLoading;
        const previousState = this.state;
        
        this.isLoading = loading;
        
        if (loading) {
            this.state = CastManagerState.LOADING;
        } else {
            this.updateInternalState();
        }
        
        // Log para depuración de cambios de loading
        if (previousLoading !== loading || previousState !== this.state) {
            this.log('Loading state changed', {
                from: { loading: previousLoading, state: previousState },
                to: { loading: this.isLoading, state: this.state },
                hasMediaStatus: !!this.castMediaStatus,
                playerState: this.castMediaStatus?.playerState
            });
        }
    }

    /*
     *  Verifica si debe reintentar operación
     *
     */

    private shouldRetry(): boolean {
        return this.retryAttempts < (this.config.retryAttempts || RETRY_CONFIG.MAX_ATTEMPTS);
    }

    /*
     *  Reintenta cargar contenido
     *
     */

    private async retryLoadContent(config: CastMessageConfig): Promise<CastOperationResult> {
        this.retryAttempts++;
        
        await new Promise(resolve => 
            setTimeout(resolve, this.config.retryDelay || RETRY_CONFIG.INITIAL_DELAY)
        );
        
        return this.loadContent(config);
    }

    /*
     *  Emite cambio de estado
     *
     */

    private emitStateChange(previousState: CastManagerState): void {
        this.log('State changed', { from: previousState, to: this.state });
        
        // Debug: Verificar callbacks disponibles
        this.log('emitStateChange called:', {
            hasCallbacks: !!this.callbacks,
            hasStateChangeCallback: typeof this.callbacks.onStateChange === 'function',
            callbackKeys: this.callbacks ? Object.keys(this.callbacks) : []
        });
        
        if (this.callbacks.onStateChange) {
            this.log('Invoking onStateChange callback');
            this.callbacks.onStateChange(this.state, previousState);
        } else {
            this.log('No onStateChange callback available');
        }
        
        this.emitEvent(CastManagerEvent.STATE_CHANGED, { 
            state: this.state, 
            previousState 
        });
    }

    /*
     *  Emite evento genérico
     *
     */

    private emitEvent(event: CastManagerEvent, data?: any): void {
        const eventData: CastManagerEventData = {
            event,
            data,
            timestamp: Date.now()
        };
        
        this.emit(event, eventData);
    }

    /*
     *  Log interno
     *
     */

    private log(message: string, data?: any): void {
        if (this.config.debugMode) {
            console.log(`${LOG_PREFIX} ${LOG_KEY} ${message} ${data ? `:: ${JSON.stringify(data)}` : ''}`);
        }
    }

    /*
     *  Log de errores
     *
     */

    private logError(message: string, error: any): void {
        console.error(`${LOG_PREFIX} ${LOG_KEY} ${message} ${error ? `:: ${JSON.stringify(error)}` : ''}`);
    }
}