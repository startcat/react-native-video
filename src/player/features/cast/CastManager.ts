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

/*
 *  Clase principal para gestionar Cast
 *
 */

export class CastManager extends SimpleEventEmitter {
    private state: CastManagerState = CastManagerState.DISCONNECTED;
    private config: CastManagerConfig;
    private messageBuilder: CastMessageBuilder;
    private callbacks: CastManagerCallbacks;
    
    // Estado de Cast nativo
    private castState?: CastState;
    private castSession?: CastSession;
    private castClient?: RemoteMediaClient;
    private castMediaStatus?: any;
    
    // Estado interno
    private currentContent?: CastContentInfo;
    private isLoading: boolean = false;
    private isContentLoaded: boolean = false;
    private pendingOperations: PendingCastOperation[] = [];
    private retryAttempts: number = 0;
    private loadTimeout?: ReturnType<typeof setTimeout>;
    private progressInterval?: ReturnType<typeof setInterval>;
    
    // Listeners de eventos Cast
    private eventListeners: Map<string, any> = new Map();

    constructor(config: CastManagerConfig = {}) {
        super();
        
        this.config = { ...DEFAULT_CAST_CONFIG, ...config };
        this.callbacks = config.callbacks || {};
        this.messageBuilder = new CastMessageBuilder({
            debugMode: this.config.debugMode
        });
        
        this.log('CastManager initialized', { config: this.config });
    }

    /*
     *  Actualiza el estado de Cast desde hooks externos
     *
     */
    
    updateCastState(
        castState?: CastState,
        castSession?: CastSession,
        castClient?: RemoteMediaClient,
        castMediaStatus?: any
    ): void {
        const previousState = this.state;
        
        this.castState = castState;
        this.castSession = castSession;
        this.castClient = castClient;
        this.castMediaStatus = castMediaStatus;
        
        this.log('Cast state updated', {
            castState,
            hasSession: !!castSession,
            hasClient: !!castClient,
            hasMediaStatus: !!castMediaStatus
        });
        
        // Actualizar estado interno
        this.updateInternalState();
        
        // Procesar operaciones pendientes si Cast está listo
        if (this.isCastReady()) {
            this.processPendingOperations();
        }
        
        // Registrar/desregistrar listeners
        this.manageEventListeners();
        
        // Emitir cambio de estado si cambió
        if (previousState !== this.state) {
            this.emitStateChange(previousState);
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

            // Verificar si es el mismo contenido
            if (this.currentContent && this.isSameContent(config)) {
                this.log('Same content already loaded, skipping');
                return CastOperationResult.SUCCESS;
            }

            // Marcar como cargando
            this.setLoadingState(true);

            // Construir mensaje Cast
            const castMessage = this.messageBuilder.buildCastMessage(config);
            
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
            
            // Emitir evento
            this.emitEvent(CastManagerEvent.CONTENT_LOADED, this.currentContent);
            
            return CastOperationResult.SUCCESS;

        } catch (error) {
            this.logError('Error loading content', error);
            
            this.setLoadingState(false);
            this.clearLoadTimeout();
            
            // Intentar retry si es posible
            if (this.shouldRetry()) {
                this.log('Retrying content load');
                return this.retryLoadContent(config);
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
            return undefined;
        }

        return {
            currentTime: this.castMediaStatus.currentTime || 0,
            duration: this.castMediaStatus.mediaInfo?.streamDuration || 0,
            isBuffering: this.castMediaStatus.playerState === MediaPlayerState.BUFFERING,
            isPaused: this.castMediaStatus.playerState === MediaPlayerState.PAUSED,
            isMuted: this.castMediaStatus.isMuted || false,
            playbackRate: this.castMediaStatus.playbackRate || 1,
            position: this.castMediaStatus.currentTime || 0
        };
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
        this.clearProgressInterval();
        
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
        const previousState = this.state;
        
        if (!previousState || previousState === CastState.NOT_CONNECTED) {
            this.state = CastManagerState.DISCONNECTED;
        } else if (previousState === CastState.CONNECTING) {
            this.state = CastManagerState.CONNECTING;
        } else if (previousState === CastState.CONNECTED) {
            if (this.isLoading) {
                this.state = CastManagerState.LOADING;
            } else if (this.castMediaStatus) {
                this.state = this.mapMediaStateToManagerState(this.castMediaStatus.playerState);
            } else {
                this.state = CastManagerState.CONNECTED;
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
            this.log('Playback started');
            this.emitEvent(CastManagerEvent.PLAYBACK_STARTED);
        });
        
        const onPlaybackEnded = this.castClient.onMediaPlaybackEnded(() => {
            this.log('Playback ended');
            this.emitEvent(CastManagerEvent.PLAYBACK_ENDED);
        });
        
        this.eventListeners.set('playbackStarted', onPlaybackStarted);
        this.eventListeners.set('playbackEnded', onPlaybackEnded);
        
        // Iniciar seguimiento de progreso
        this.startProgressTracking();
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
        this.clearProgressInterval();
    }

    /*
     *  Inicia seguimiento de progreso
     *
     */

    private startProgressTracking(): void {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        
        this.progressInterval = setInterval(() => {
            const progressInfo = this.getProgressInfo();
            if (progressInfo) {
                this.emitEvent(CastManagerEvent.TIME_UPDATE, progressInfo);
            }
        }, 1000);
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
     *  Limpia interval de progreso
     *
     */

    private clearProgressInterval(): void {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = undefined;
        }
    }

    /*
     *  Establece estado de carga
     *
     */

    private setLoadingState(loading: boolean): void {
        this.isLoading = loading;
        if (loading) {
            this.state = CastManagerState.LOADING;
        } else {
            this.updateInternalState();
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
        
        this.callbacks.onStateChange?.(this.state, previousState);
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
            console.log(`${LOG_PREFIX} ${message}`, data || '');
        }
    }

    /*
     *  Log de errores
     *
     */

    private logError(message: string, error: any): void {
        console.error(`${LOG_PREFIX} ${message}`, error);
    }
}