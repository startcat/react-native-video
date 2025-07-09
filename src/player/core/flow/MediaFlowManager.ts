import type { IDrm, OnProgressData } from '../../../types';
import { MediaFlowDecisionEngine } from './MediaFlowDecisionEngine';
import { MediaFlowEventBus } from './MediaFlowEventBus';
import { MediaFlowStateManager } from './MediaFlowState';
import {
    MediaFlowStateType,
    MediaType,
    StateChangeReason,
    type ExtendedVideoSource,
    type MediaFlowConfig,
    type MediaFlowState
} from './types';

export interface MediaFlowManagerOptions {
    debugMode?: boolean;
    onSourceReady?: (source: ExtendedVideoSource, drm?: IDrm) => void;
    onStateChange?: (state: MediaFlowState) => void;
    onError?: (error: Error) => void;
}

export class MediaFlowManager {
    
    private eventBus: MediaFlowEventBus;
    private stateManager: MediaFlowStateManager;
    private decisionEngine: MediaFlowDecisionEngine;
  
    // Configuración y estado
    private config?: MediaFlowConfig;
    private isInitialized = false;
    private errorCount = 0;
    private transitionTimeout?: ReturnType<typeof setTimeout>;
  
    // Cache de sources
    private tudumSource?: ExtendedVideoSource;
    private tudumDrm?: IDrm;
    private contentSource?: ExtendedVideoSource;
    private contentDrm?: IDrm;
  
    // Callbacks opcionales
    private onSourceReady?: (source: ExtendedVideoSource, drm?: IDrm) => void;
    private onStateChange?: (state: MediaFlowState) => void;
    private onError?: (error: Error) => void;

    constructor(options: MediaFlowManagerOptions = {}) {
        // Inicializar componentes core
        this.eventBus = new MediaFlowEventBus(options.debugMode);
        this.stateManager = new MediaFlowStateManager();
        this.decisionEngine = new MediaFlowDecisionEngine();
    
        // Guardar callbacks
        this.onSourceReady = options.onSourceReady;
        this.onStateChange = options.onStateChange;
        this.onError = options.onError;
    
        // Configurar listeners internos
        this.setupInternalListeners();
    }

    /*
     *  Obtener el bus de eventos para suscripciones externas
     *
     */

    get events(): MediaFlowEventBus {
        return this.eventBus;
    }

    /*  
     *  Obtener el estado actual
     *
     */
    
    getCurrentState(): MediaFlowState {
        return this.stateManager.getCurrentState();
    }

    /*
     *  Obtener si está inicializado
     *
     */
    
    getIsInitialized(): boolean {
        return this.isInitialized;
    }

    /*
     *  Inicializar el flujo con la configuración
     *
     */
    
    async initialize(config: MediaFlowConfig): Promise<void> {
        console.log('[MediaFlowManager] Initializing with config:', config);
    
        // Validar configuración
        const validation = this.decisionEngine.validateConfig(config);
        if (!validation.valid) {
            throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
        }
    
        this.config = config;
        this.errorCount = 0;
    
        // Reset estado
        this.stateManager.reset();
        this.clearSources();
    
        // Preparar sources
        await this.prepareSources(config);
    
        this.isInitialized = true;
    
        // Emitir evento de inicialización
        this.eventBus.emit('flow:initialized', {
            config,
            initialState: MediaFlowStateType.IDLE
        });
    
        // Iniciar el flujo
        await this.startFlow();
    }

    /*
     *  Iniciar el flujo de reproducción
     *
     */

    private async startFlow(): Promise<void> {
        if (!this.config) {
            throw new Error('Flow not initialized');
        }
    
        // Tomar decisión inicial
        const decision = this.decisionEngine.makeDecision({
            currentState: this.stateManager.getCurrentState(),
            config: this.config,
            tudumAvailable: this.isTudumAvailable(),
            contentReady: this.isContentReady(),
            errorCount: this.errorCount,
            tudumSource: this.tudumSource,
            contentSource: this.contentSource
        });
    
        console.log('[MediaFlowManager] Initial decision:', decision);
    
        // Ejecutar la acción decidida
        await this.executeDecision(decision);
    }

    /*
     *  Manejar el progreso del video
     *
     */

    handleProgress(data: OnProgressData): void {
        const currentState = this.stateManager.getCurrentState();
    
        if (!currentState.mediaType) return;
    
        // Obtener duración del progreso o del estado actual
        // OnProgressData podría no tener duration definido en el tipo
        const progressData = data as any;
        const duration = progressData.duration || 
                    progressData.playableDuration || 
                    progressData.seekableDuration ||
                    0;
    
        // Emitir evento de progreso
        this.eventBus.emit('progress:update', {
            type: currentState.mediaType,
            currentTime: data.currentTime,
            duration: duration,
            isBuffering: false,
            isPaused: false
            // TODO: Agregar sliderValues cuando ProgressCoordinator esté disponible
        });
    }

    /*
     *  Manejar el fin del media actual
     *
     */
    
    handleMediaEnd(): void {
        const currentState = this.stateManager.getCurrentState();
    
        if (currentState.type === MediaFlowStateType.PLAYING_TUDUM) {
            console.log('[MediaFlowManager] Tudum ended, transitioning to content');
            this.handleTudumEnd();
        } else if (currentState.type === MediaFlowStateType.PLAYING_CONTENT) {
            console.log('[MediaFlowManager] Content ended');
            this.handleContentEnd();
        }
    }

    /*
     *  Pausar la reproducción
     *
     */

    pause(): void {
        const currentState = this.stateManager.getCurrentState();
        if (currentState.mediaType) {
            this.eventBus.emit('playback:pause', {
                type: currentState.mediaType,
                currentTime: 0 // TODO: Obtener tiempo actual real del ProgressCoordinator
            });
        }
    }

    /*
     *  Reanudar la reproducción
     *
     */
    
    resume(): void {
        const currentState = this.stateManager.getCurrentState();
        if (currentState.mediaType) {
            this.eventBus.emit('playback:resume', {
                type: currentState.mediaType,
                currentTime: 0 // TODO: Obtener tiempo actual real del ProgressCoordinator
            });
        }
    }

    /*
     *  Limpiar recursos
     *
     */
    
    dispose(): void {
        console.log('[MediaFlowManager] Disposing');
    
        // Limpiar timeout si existe
        if (this.transitionTimeout) {
            clearTimeout(this.transitionTimeout);
            this.transitionTimeout = undefined;
        }
    
        // Emitir evento de disposición
        const finalState = this.stateManager.getCurrentState();
        this.eventBus.emit('flow:disposed', {
            finalState: finalState.type,
            playbackTime: 0 // TODO: Calcular tiempo total de reproducción
        });
    
        // Limpiar recursos
        this.eventBus.dispose();
        this.stateManager.reset();
        this.clearSources();
    
        this.isInitialized = false;
        this.config = undefined;
    }

    /*
     *  Métodos privados
     *
     */
    
    private setupInternalListeners(): void {
        // Escuchar cambios de estado y notificar
        this.eventBus.on('state:change', (data) => {
            if (this.onStateChange) {
                this.onStateChange(data.current);
            }
        });
    
        // Escuchar cuando una fuente está lista
        this.eventBus.on('source:ready', (data) => {
            if (this.onSourceReady) {
                this.onSourceReady(data.source, data.drm);
            }
        });
    
        // Escuchar errores
        this.eventBus.on('source:error', (data) => {
            this.handleError(data.error, data.type);
        });
    }

    private async prepareSources(config: MediaFlowConfig): Promise<void> {
        // Preparar source del tudum si está habilitado
        if (config.showExternalTudum && config.hooks?.getTudumSource) {
            try {
                const tudumSource = config.hooks.getTudumSource();
                if (tudumSource) {
                    this.tudumSource = tudumSource;
                    // TODO: Obtener DRM del tudum cuando TudumManager esté disponible
                }
            } catch (error) {
                console.error('[MediaFlowManager] Error preparing tudum source:', error);
            }
        }
    
        // TODO: Preparar source del contenido cuando SourceManager esté disponible
        // Por ahora, usar un placeholder
        if (config.manifests && config.manifests.length > 0) {
            this.contentSource = {
                uri: 'content_placeholder', // TODO: Obtener URI real del manifest
                title: config.title
            };
        }
    }

    private clearSources(): void {
        this.tudumSource = undefined;
        this.tudumDrm = undefined;
        this.contentSource = undefined;
        this.contentDrm = undefined;
    }

    private async executeDecision(decision: any): Promise<void> {
        switch (decision.action) {
            case 'PLAY_TUDUM':
                await this.loadTudum();
                break;
        
            case 'PLAY_CONTENT':
                await this.loadContent();
                break;
        
            case 'SKIP_TUDUM':
                this.skipToContent(decision.reason);
                break;
        
            case 'WAIT':
                // No hacer nada, esperar siguiente evento
                break;
        
            case 'ERROR':
                this.handleError(new Error(decision.reason), null);
                break;
        }
    }

    private async loadTudum(): Promise<void> {
        try {
            if (!this.tudumSource) {
                throw new Error('Tudum source not available');
            }

            // Cambiar estado
            const newState = this.stateManager.startPreparingTudum(
                this.tudumSource,
                this.tudumDrm
            );
            
            this.emitStateChange(newState, StateChangeReason.INITIALIZATION);
      
            // Emitir source ready
            this.eventBus.emit('source:ready', {
                source: this.tudumSource,
                drm: this.tudumDrm,
                type: MediaType.TUDUM,
                isReady: true
            });
      
            // Cambiar a playing
            const playingState = this.stateManager.startPlayingTudum();
            this.emitStateChange(playingState, StateChangeReason.INITIALIZATION);
      
            // Emitir evento de inicio
            this.eventBus.emit('playback:start', {
                type: MediaType.TUDUM,
                startPosition: 0
            });
      
        } catch (error) {
            this.eventBus.emit('source:error', {
                error: error as Error,
                type: MediaType.TUDUM,
                fallbackAvailable: true
            });
        }
    }

    private async loadContent(): Promise<void> {
        try {
            if (!this.contentSource) {
                throw new Error('Content source not available');
            }

            // Cambiar estado
            const newState = this.stateManager.startPreparingContent(
                this.contentSource,
                this.contentDrm,
                this.config?.startPosition
            );
      
            this.emitStateChange(newState, StateChangeReason.INITIALIZATION);
      
            // Emitir source ready
            this.eventBus.emit('source:ready', {
                source: this.contentSource,
                drm: this.contentDrm,
                type: MediaType.CONTENT,
                isReady: true
            });
      
            // Cambiar a playing
            const playingState = this.stateManager.startPlayingContent();
            this.emitStateChange(playingState, StateChangeReason.INITIALIZATION);
      
            // Emitir evento de inicio
            this.eventBus.emit('playback:start', {
                type: MediaType.CONTENT,
                startPosition: this.config?.startPosition || 0
            });
      
        } catch (error) {
            this.eventBus.emit('source:error', {
                error: error as Error,
                type: MediaType.CONTENT,
                fallbackAvailable: false
            });
        }
    }

    private skipToContent(reason: string): void {
        console.log('[MediaFlowManager] Skipping tudum:', reason);
    
        this.eventBus.emit('decision:skipTudum', {
            reason,
            conditions: {
                isAutoNext: this.config?.isAutoNext || false,
                hasStartPosition: (this.config?.startPosition ?? 0) > 0,
                tudumAvailable: this.isTudumAvailable()
            }
        });
    
        this.loadContent();
    }

    private handleTudumEnd(): void {
        // Iniciar transición
        const transitionState = this.stateManager.startTransitioning(StateChangeReason.MEDIA_END);
        this.emitStateChange(transitionState, StateChangeReason.MEDIA_END);
    
        // Emitir evento
        this.eventBus.emit('playback:end', {
            type: MediaType.TUDUM,
            triggeredAutoNext: false,
            nextContentAvailable: true
        });
    
        // Pequeño delay para limpiar recursos
        this.transitionTimeout = setTimeout(() => {
            this.loadContent();
            this.transitionTimeout = undefined;
        }, 100);
    }

    private handleContentEnd(): void {
        const endedState = this.stateManager.setEnded();
        this.emitStateChange(endedState, StateChangeReason.MEDIA_END);
    
        // Determinar si hay siguiente contenido
        const hasNext = false; // TODO: Verificar si hay siguiente episodio cuando esté disponible
    
        this.eventBus.emit('playback:end', {
            type: MediaType.CONTENT,
            triggeredAutoNext: hasNext && (this.config?.isAutoNext || false),
            nextContentAvailable: hasNext
        });
    }

    private handleError(error: Error, mediaType: MediaType | null): void {
        console.error('[MediaFlowManager] Error:', error);
    
        this.errorCount++;
    
        if (mediaType) {
            const errorState = this.stateManager.setError(error, mediaType);
            this.emitStateChange(errorState, StateChangeReason.ERROR);
        }
    
        if (this.onError) {
            this.onError(error);
        }
    
        // Intentar recuperación si tenemos configuración
        if (this.config) {
            const decision = this.decisionEngine.makeDecision({
                currentState: this.stateManager.getCurrentState(),
                config: this.config,
                tudumAvailable: this.isTudumAvailable(),
                contentReady: this.isContentReady(),
                errorCount: this.errorCount,
                tudumSource: this.tudumSource,
                contentSource: this.contentSource
            });
      
            this.executeDecision(decision);
        }
    }

    private emitStateChange(newState: MediaFlowState, reason: StateChangeReason): void {
        const previousState = { ...this.stateManager.getCurrentState() };
    
        this.eventBus.emit('state:change', {
            previous: previousState,
            current: newState,
            reason
        });
    
        this.eventBus.emit('transition:complete', {
            state: newState.type,
            mediaType: newState.mediaType
        });
    }

    private isTudumAvailable(): boolean {
        return !!(this.config?.showExternalTudum && this.tudumSource);
    }

    private isContentReady(): boolean {
        return !!this.contentSource;
    }
}