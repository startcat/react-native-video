import { useCallback, useEffect, useRef, useState } from 'react';
import {
    CastManager
} from '../CastManager';
import { LOG_PREFIX } from '../constants';
import {
    CastContentInfo,
    CastControlCommand,
    CastControlParams,
    CastManagerEvent,
    CastManagerHookResult,
    CastManagerState,
    CastManagerStatus,
    CastMessageConfig,
    CastOperationResult,
    CastProgressInfo,
    UseCastManagerConfig
} from '../types';
import { useCastState } from './useCastState';

/*
 *  Hook principal para gestionar Cast
 *
 */

export function useCastManager(config: UseCastManagerConfig = {}): CastManagerHookResult {
    const {
        enableAutoUpdate = true,
        autoUpdateInterval = 1000,
        ...managerConfig
    } = config;
    
    // Estados
    const [status, setStatus] = useState<CastManagerStatus>(() => ({
        state: CastManagerState.DISCONNECTED,
        isConnected: false,
        isLoading: false,
        isContentLoaded: false,
        hasSession: false,
        hasClient: false
    }));
    
    const [currentContent, setCurrentContent] = useState<CastContentInfo | undefined>();
    const [progressInfo, setProgressInfo] = useState<CastProgressInfo | undefined>();
    
    // Referencias
    const managerRef = useRef<CastManager | null>(null);
    const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    
    // Hook de estado de Cast
    const castState = useCastState({
        enableStreamPosition: true,
        debugMode: managerConfig.debugMode,
        onStateChange: (newState, previousState) => {
            if (managerConfig.debugMode) {
                console.log(`${LOG_PREFIX} [useCastManager] Cast state changed:`, {
                    from: previousState.managerState,
                    to: newState.managerState
                });
            }
        }
    });
    
    // Inicializar manager
    useEffect(() => {
        if (!managerRef.current) {
            managerRef.current = new CastManager({
                ...managerConfig,
                callbacks: {
                    ...managerConfig.callbacks,
                    onStateChange: (state, previousState) => {
                        if (managerConfig.debugMode) {
                            console.log(`${LOG_PREFIX} [useCastManager] Manager state changed:`, {
                                from: previousState,
                                to: state
                            });
                        }
                        
                        // Actualizar estado local
                        setStatus((prev: CastManagerStatus) => ({ ...prev, state }));
                        
                        // Llamar callback del usuario
                        managerConfig.callbacks?.onStateChange?.(state, previousState);
                    },
                    onContentLoaded: (content) => {
                        setCurrentContent(content);
                        managerConfig.callbacks?.onContentLoaded?.(content);
                    },
                    onContentLoadError: (error, content) => {
                        if (managerConfig.debugMode) {
                            console.error(`${LOG_PREFIX} [useCastManager] Content load error:`, error);
                        }
                        managerConfig.callbacks?.onContentLoadError?.(error, content);
                    },
                    onPlaybackStarted: () => {
                        setStatus((prev: CastManagerStatus) => ({ ...prev, isContentLoaded: true }));
                        managerConfig.callbacks?.onPlaybackStarted?.();
                    },
                    onPlaybackEnded: () => {
                        managerConfig.callbacks?.onPlaybackEnded?.();
                    }
                }
            });
            
            // Listener para actualizaciones de progreso
            managerRef.current.on(CastManagerEvent.TIME_UPDATE, (eventData: any) => {
                const progressInfo = eventData.data as CastProgressInfo;
                setProgressInfo(progressInfo);
                managerConfig.callbacks?.onTimeUpdate?.(progressInfo.currentTime, progressInfo.duration);
            });
            
            if (managerConfig.debugMode) {
                console.log(`${LOG_PREFIX} [useCastManager] Manager initialized`);
            }
        }
        
        return () => {
            if (managerRef.current) {
                // Remover listener de eventos
                managerRef.current.removeAllListeners(CastManagerEvent.TIME_UPDATE);
                managerRef.current.destroy();
                managerRef.current = null;
            }
        };
    }, [managerConfig]);
    
    // Actualizar estado de Cast en el manager
    useEffect(() => {
        if (managerRef.current) {
            managerRef.current.updateCastState(
                castState.castState,
                castState.castSession,
                castState.castClient,
                castState.castMediaStatus
            );
            
            // Actualizar estado local
            setStatus(managerRef.current.getStatus());
        }
    }, [castState]);
    
    // Auto-actualización periódica
    useEffect(() => {
        if (enableAutoUpdate && managerRef.current) {
            updateIntervalRef.current = setInterval(() => {
                if (managerRef.current) {
                    const newStatus = managerRef.current.getStatus();
                    setStatus(newStatus);
                    
                    const newCurrentContent = managerRef.current.getCurrentContent();
                    setCurrentContent(newCurrentContent);
                    
                    const newProgressInfo = managerRef.current.getProgressInfo();
                    setProgressInfo(newProgressInfo);
                }
            }, autoUpdateInterval);
            
            return () => {
                if (updateIntervalRef.current) {
                    clearInterval(updateIntervalRef.current);
                }
            };
        }
        
        // Retorno explícito de undefined cuando auto-update está deshabilitado
        return undefined;
    }, [enableAutoUpdate, autoUpdateInterval]);
    
    // Funciones de acción
    const loadContent = useCallback(async (config: CastMessageConfig): Promise<CastOperationResult> => {
        if (!managerRef.current) {
            console.warn(`${LOG_PREFIX} [useCastManager] Manager not initialized`);
            return CastOperationResult.FAILED;
        }
        
        try {
            const result = await managerRef.current.loadContent(config);
            
            // Actualizar estado después de cargar
            setStatus(managerRef.current.getStatus());
            setCurrentContent(managerRef.current.getCurrentContent());
            
            return result;
        } catch (error) {
            console.error(`${LOG_PREFIX} [useCastManager] Error loading content:`, error);
            return CastOperationResult.FAILED;
        }
    }, []);
    
    const clearContent = useCallback(() => {
        if (managerRef.current) {
            managerRef.current.clearCurrentContent();
            setCurrentContent(undefined);
            setProgressInfo(undefined);
        }
    }, []);
    
    const executeControl = useCallback(async (params: CastControlParams): Promise<CastOperationResult> => {
        if (!managerRef.current) {
            console.warn(`${LOG_PREFIX} [useCastManager] Manager not initialized`);
            return CastOperationResult.FAILED;
        }
        
        return managerRef.current.executeControl(params);
    }, []);
    
    // Controles específicos
    const play = useCallback(() => executeControl({ command: CastControlCommand.PLAY }), [executeControl]);
    const pause = useCallback(() => executeControl({ command: CastControlCommand.PAUSE }), [executeControl]);
    const seek = useCallback((time: number) => executeControl({ 
        command: CastControlCommand.SEEK, 
        seekTime: time 
    }), [executeControl]);
    const skipForward = useCallback((seconds: number) => executeControl({ 
        command: CastControlCommand.SKIP_FORWARD, 
        value: seconds 
    }), [executeControl]);
    const skipBackward = useCallback((seconds: number) => executeControl({ 
        command: CastControlCommand.SKIP_BACKWARD, 
        value: seconds 
    }), [executeControl]);
    const mute = useCallback(() => executeControl({ command: CastControlCommand.MUTE }), [executeControl]);
    const unmute = useCallback(() => executeControl({ command: CastControlCommand.UNMUTE }), [executeControl]);
    const setVolume = useCallback((volume: number) => executeControl({ 
        command: CastControlCommand.VOLUME, 
        volumeLevel: volume 
    }), [executeControl]);
    
    // Utilidades
    const isSameContent = useCallback((config: CastMessageConfig): boolean => {
        return managerRef.current?.isSameContent(config) || false;
    }, []);
    
    const isContentLoaded = useCallback((): boolean => {
        return status.isContentLoaded;
    }, [status.isContentLoaded]);
    
    const isReady = useCallback((): boolean => {
        return status.isConnected && status.hasClient && status.hasSession;
    }, [status.isConnected, status.hasClient, status.hasSession]);
    
    // Debug effect
    useEffect(() => {
        if (managerConfig.debugMode) {
            console.log(`${LOG_PREFIX} [useCastManager] Status updated:`, {
                state: status.state,
                isConnected: status.isConnected,
                isLoading: status.isLoading,
                isContentLoaded: status.isContentLoaded,
                hasCurrentContent: !!currentContent,
                hasProgressInfo: !!progressInfo
            });
        }
    }, [status, currentContent, progressInfo, managerConfig.debugMode]);
    
    return {
        // Estado
        status,
        currentContent,
        progressInfo,
        
        // Acciones principales
        loadContent,
        clearContent,
        
        // Controles de reproducción
        play,
        pause,
        seek,
        skipForward,
        skipBackward,
        
        // Controles de audio
        mute,
        unmute,
        setVolume,
        
        // Utilidades
        isSameContent,
        isContentLoaded,
        isReady,
        
        // Manager instance
        manager: managerRef.current!
    };
}

/*
 *  Hook simplificado para casos básicos
 *
 */

export function useSimpleCastManager(): {
    isConnected: boolean;
    isLoading: boolean;
    currentContent?: CastContentInfo;
    loadContent: (config: CastMessageConfig) => Promise<CastOperationResult>;
    play: () => Promise<CastOperationResult>;
    pause: () => Promise<CastOperationResult>;
} {
    const {
        status,
        currentContent,
        loadContent,
        play,
        pause
    } = useCastManager({
        debugMode: false,
        enableAutoUpdate: false
    });
    
    return {
        isConnected: status.isConnected,
        isLoading: status.isLoading,
        currentContent,
        loadContent,
        play,
        pause
    };
}

/*
 *  Hook para obtener solo el estado de Cast
 *
 */

export function useCastManagerStatus(): CastManagerStatus {
    const { status } = useCastManager({ enableAutoUpdate: false });
    return status;
}

/*
 *  Hook para obtener solo el progreso de Cast
 *
 */

export function useCastManagerProgress(): CastProgressInfo | undefined {
    const { progressInfo } = useCastManager({ enableAutoUpdate: true });
    return progressInfo;
}