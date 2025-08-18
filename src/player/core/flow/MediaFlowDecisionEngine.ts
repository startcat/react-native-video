import type { MediaFlowConfig, MediaFlowState } from './types';
import { MediaFlowStateType, MediaType } from './types';

export interface DecisionContext {
    currentState: MediaFlowState;
    config: MediaFlowConfig;
    tudumAvailable: boolean;
    contentReady: boolean;
    errorCount: number;
    tudumSource?: any; // Para validar el source del tudum
    contentSource?: any; // Para validar el source del contenido
}

export interface DecisionResult {
    action: 'PLAY_TUDUM' | 'PLAY_CONTENT' | 'SKIP_TUDUM' | 'WAIT' | 'ERROR';
    reason: string;
    metadata?: {
        skipReasons?: string[];
        waitTime?: number;
    };
}

export class MediaFlowDecisionEngine {
    private errorThreshold = 3;

    /*
     *  Decidir qué hacer basado en el contexto actual
     *
     */
    
    makeDecision(context: DecisionContext): DecisionResult {
        const { currentState } = context;

        // Decisiones basadas en el estado actual
        switch (currentState.type) {
            case MediaFlowStateType.IDLE:
                return this.decideFromIdle(context);
      
            case MediaFlowStateType.PREPARING_TUDUM:
                return this.decideFromPreparingTudum(context);
      
            case MediaFlowStateType.PLAYING_TUDUM:
                return this.decideFromPlayingTudum(context);
      
            case MediaFlowStateType.TRANSITIONING:
                return this.decideFromTransitioning(context);
      
            case MediaFlowStateType.PREPARING_CONTENT:
                return this.decideFromPreparingContent(context);
      
            case MediaFlowStateType.PLAYING_CONTENT:
                return this.decideFromPlayingContent(context);
      
            case MediaFlowStateType.ERROR:
                return this.decideFromError(context);
      
            case MediaFlowStateType.ENDED:
                return this.decideFromEnded(context);
      
            default:
                return {
                    action: 'ERROR',
                    reason: `Unknown state: ${currentState.type}`
                };
        }
    }

    /*
     *  Determinar si debe reproducirse el tudum
     *
     */

    shouldPlayTudum(props: {
        showExternalTudum: boolean;
        isAutoNext: boolean;
        hasStartPosition: boolean;
        tudumAvailable: boolean;
        hasPlayedTudum: boolean;
        isLive: boolean;
        hasAds: boolean;
    }): { should: boolean; reasons: string[] } {
        
        const reasons: string[] = [];

        // Condiciones que previenen la reproducción del tudum
        if (!props.showExternalTudum) {
            reasons.push('tudum_disabled');
        }

        if (props.isAutoNext) {
            reasons.push('auto_next_skip');
        }

        if (props.hasStartPosition) {
            reasons.push('has_start_position');
        }

        if (!props.tudumAvailable) {
            reasons.push('tudum_not_available');
        }

        if (props.hasPlayedTudum) {
            reasons.push('tudum_already_played');
        }

        if (props.isLive) {
            reasons.push('live_content');
        }

        if (props.hasAds) {
            reasons.push('has_advertisements');
        }

        return {
            should: reasons.length === 0,
            reasons
        };
    }

    /*
     *  Validar si una fuente es válida
     *
     */

    private isValidSource(source: any): boolean {
        return source && 
               source.uri && 
               typeof source.uri === 'string' &&
               source.uri.length > 0;
    }

    /*
     *  Decisiones específicas por estado
     *
     */
    
    private decideFromIdle(context: DecisionContext): DecisionResult {
        const { config, tudumAvailable } = context;

        const tudumDecision = this.shouldPlayTudum({
            showExternalTudum: config.showExternalTudum,
            isAutoNext: config.isAutoNext,
            hasStartPosition: (config.startPosition ?? 0) > 0,
            tudumAvailable,
            hasPlayedTudum: context.currentState.metadata.hasPlayedTudum,
            isLive: config.isLive || false,
            hasAds: false // TODO: Obtener de config cuando esté disponible
        });

        // Validar source del tudum si está disponible
        if (tudumDecision.should && tudumAvailable) {
            
            // Si tenemos el source, validarlo
            if (context.tudumSource && !this.isValidSource(context.tudumSource)) {
                return {
                    action: 'SKIP_TUDUM',
                    reason: 'invalid_tudum_source',
                    metadata: {
                        skipReasons: ['invalid_source']
                    }
                };
            }

            return {
                action: 'PLAY_TUDUM',
                reason: 'initial_tudum_playback'
            };
        }

        return {
            action: 'PLAY_CONTENT',
            reason: 'direct_content_playback',
            metadata: {
                skipReasons: tudumDecision.reasons
            }
        };
    }

    private decideFromPreparingTudum(context: DecisionContext): DecisionResult {
        if (!context.tudumAvailable) {
            return {
                action: 'SKIP_TUDUM',
                reason: 'tudum_preparation_failed'
            };
        }

        // Validar source si está disponible
        if (context.tudumSource && !this.isValidSource(context.tudumSource)) {
            return {
                action: 'SKIP_TUDUM',
                reason: 'invalid_tudum_source_during_preparation'
            };
        }

        return {
            action: 'WAIT',
            reason: 'waiting_tudum_ready'
        };
    }

    private decideFromPlayingTudum(context: DecisionContext): DecisionResult {
        // Durante la reproducción del tudum, solo esperar
        return {
            action: 'WAIT',
            reason: 'tudum_playing'
        };
    }

    private decideFromTransitioning(context: DecisionContext): DecisionResult {
        if (context.contentReady) {
            // Validar source del contenido antes de reproducir
            if (context.contentSource && !this.isValidSource(context.contentSource)) {
                return {
                    action: 'ERROR',
                    reason: 'invalid_content_source'
                };
            }

            return {
                action: 'PLAY_CONTENT',
                reason: 'content_ready_after_transition'
            };
        }

        return {
            action: 'WAIT',
            reason: 'waiting_content_ready',
            metadata: {
                waitTime: 100 // ms
            }
        };
    }

    private decideFromPreparingContent(context: DecisionContext): DecisionResult {
        if (!context.contentReady) {
            return {
                action: 'WAIT',
                reason: 'waiting_content_preparation'
            };
        }

        // Validar source del contenido
        if (context.contentSource && !this.isValidSource(context.contentSource)) {
            return {
                action: 'ERROR',
                reason: 'invalid_content_source_during_preparation'
            };
        }

        return {
            action: 'WAIT',
            reason: 'content_preparation_in_progress'
        };
    }

    private decideFromPlayingContent(context: DecisionContext): DecisionResult {
        // Durante la reproducción del contenido, solo esperar
        return {
            action: 'WAIT',
            reason: 'content_playing'
        };
    }

    private decideFromError(context: DecisionContext): DecisionResult {
        if (context.errorCount >= this.errorThreshold) {
            return {
                action: 'ERROR',
                reason: 'max_errors_reached'
            };
        }

        // Si el error fue con el tudum, intentar con el contenido
        if (context.currentState.mediaType === MediaType.TUDUM) {
            return {
                action: 'SKIP_TUDUM',
                reason: 'tudum_error_fallback'
            };
        }

        // Reintentar contenido
        return {
            action: 'PLAY_CONTENT',
            reason: 'content_error_retry'
        };
    }

    private decideFromEnded(context: DecisionContext): DecisionResult {
        // El componente padre debe manejar qué hacer cuando termina
        return {
            action: 'WAIT',
            reason: 'playback_ended'
        };
    }

    /*
     *  Validar configuración
     *
     */
    
    validateConfig(config: MediaFlowConfig): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!config.manifests || config.manifests.length === 0) {
            errors.push('No manifests provided');
        }

        if (config.showExternalTudum && !config.hooks?.getTudumSource) {
            errors.push('Tudum enabled but no getTudumSource hook provided');
        }

        if (config.startPosition && config.startPosition < 0) {
            errors.push('Invalid start position');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}