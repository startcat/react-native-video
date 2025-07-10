import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    CastStateInfo,
    UseCastManagerConfig
} from '../types';
import { useCastState } from './useCastState';

/*
 *  Hook principal para gestionar Cast
 *
 */

export function useCastManager(config: UseCastManagerConfig = {}): CastManagerHookResult {
    const {
        ...managerConfig
    } = config;

    const LOG_KEY = '(useCastManager)';

    function log(message: string, data?: any): void {
        if (managerConfig.debugMode) {
            console.log(`${LOG_PREFIX} ${LOG_KEY} ${message} ${data ? `:: ${JSON.stringify(data)}` : ''}`);
        }
    }
    
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
    
    // Hook de estado de Cast
    const castState = useCastState({
        debugMode: managerConfig.debugMode,
        onStateChange: useCallback((newState: CastStateInfo, previousState: CastStateInfo) => {
            log(`Cast state changed:`, {
                from: previousState.managerState,
                to: newState.managerState
            });
        }, [managerConfig.debugMode])
    });

    const memoizedCallbacks = useMemo(() => ({
        onStateChange: (state: CastManagerState, previousState: CastManagerState) => {
            log(`Manager state changed:`, {
                from: previousState,
                to: state
            });
            
            // Actualizar estado local
            setStatus((prev: CastManagerStatus) => ({ ...prev, state }));
            
            // Llamar callback del usuario
            managerConfig.callbacks?.onStateChange?.(state, previousState);
        },
        onContentLoaded: (content: CastContentInfo) => {
            log(`onContentLoaded:`, {
                content
            });
            setCurrentContent(content);
            managerConfig.callbacks?.onContentLoaded?.(content);
        },
        onContentLoadError: (error: string, content?: CastContentInfo) => {
            log(`onContentLoadError:`, {
                error,
                content
            });
            managerConfig.callbacks?.onContentLoadError?.(error, content);
        },
        onPlaybackStarted: () => {
            log(`onPlaybackStarted`);
            setStatus((prev: CastManagerStatus) => ({ ...prev, isContentLoaded: true }));
            managerConfig.callbacks?.onPlaybackStarted?.();
        },
        onPlaybackEnded: () => {
            log(`onPlaybackEnded`);
            managerConfig.callbacks?.onPlaybackEnded?.();
        },
        onBufferingChange: (isBuffering: boolean) => {
            log(`onBufferingChange:`, {
                isBuffering
            });
            managerConfig.callbacks?.onBufferingChange?.(isBuffering);
        },
        onTimeUpdate: (currentTime: number, duration: number) => {
            log(`onTimeUpdate:`, {
                currentTime,
                duration
            });
            managerConfig.callbacks?.onTimeUpdate?.(currentTime, duration);
        }
    }), [managerConfig.debugMode]);

    const memoizedManagerConfig = useMemo(() => ({
        ...managerConfig,
        callbacks: memoizedCallbacks
    }), [
        managerConfig.retryAttempts,
        managerConfig.retryDelay,
        managerConfig.loadTimeout,
        managerConfig.debugMode,
        memoizedCallbacks
    ]);
    
    // Inicializar manager UNA SOLA VEZ
    useEffect(() => {
        if (!managerRef.current) {
            managerRef.current = new CastManager(memoizedManagerConfig);
            log(`Manager initialized`);
        }
        
        return () => {
            if (managerRef.current) {
                // Remover listener de eventos
                managerRef.current.removeAllListeners(CastManagerEvent.TIME_UPDATE);
                managerRef.current.destroy();
                managerRef.current = null;
            }
        };
    }, []); // Sin dependencias - se ejecuta solo una vez

    // Actualizar callbacks del manager cuando cambien
    useEffect(() => {
        if (managerRef.current && memoizedManagerConfig.callbacks) {
            // Actualizar solo los callbacks sin recrear el manager
            managerRef.current['callbacks'] = memoizedManagerConfig.callbacks;
            
            log(`Callbacks updated:`, {
                hasCallbacks: !!memoizedManagerConfig.callbacks,
                callbackKeys: Object.keys(memoizedManagerConfig.callbacks)
            });
        }
    }, [memoizedManagerConfig.callbacks]);

    useEffect(() => {
        if (!managerRef.current) return;

        managerRef.current.updateCastState(
            castState.castState,
            castState.castSession,
            castState.castClient,
            castState.castMediaStatus,
            castState.castStreamPosition
        );

        const newStatus = managerRef.current.getStatus();
        
        log(`newStatus: ${JSON.stringify(newStatus)}`);
        
        // Actualizar estado local
        setStatus(newStatus);
    }, [castState]);

    // Funciones de acción estables
    const loadContent = useCallback(async (config: CastMessageConfig): Promise<CastOperationResult> => {
        if (!managerRef.current) {
            log('Manager not initialized for loadContent');
            return CastOperationResult.FAILED;
        }
        
        try {
            const result = await managerRef.current.loadContent(config);
            
            // Actualizar estado local basado en el resultado
            if (result === CastOperationResult.SUCCESS) {
                setCurrentContent(managerRef.current.getCurrentContent());
                setProgressInfo(managerRef.current.getProgressInfo());
            }
            
            return result;
        } catch (error) {
            log('Error in loadContent:', error);
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
            console.warn(`${LOG_PREFIX} ${LOG_KEY} executeControl: Manager not initialized`);
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
    
    const stop = useCallback(() => executeControl({ command: CastControlCommand.STOP }), [executeControl]);
    
    const mute = useCallback(() => executeControl({ command: CastControlCommand.MUTE }), [executeControl]);
    
    const unmute = useCallback(() => executeControl({ command: CastControlCommand.UNMUTE }), [executeControl]);
    
    const setVolume = useCallback((volume: number) => executeControl({ 
        command: CastControlCommand.VOLUME, 
        volumeLevel: volume 
    }), [executeControl]);

    // Controles de pistas
    const setAudioTrack = useCallback((trackIndex: number) => executeControl({
        command: CastControlCommand.SET_AUDIO_TRACK,
        audioTrackIndex: trackIndex
    }), [executeControl]);
    
    const setSubtitleTrack = useCallback((trackIndex: number) => executeControl({
        command: CastControlCommand.SET_SUBTITLE_TRACK,
        subtitleTrackIndex: trackIndex
    }), [executeControl]);
    
    const disableSubtitles = useCallback(() => executeControl({
        command: CastControlCommand.SET_SUBTITLE_TRACK,
        subtitleTrackIndex: -1
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
    
    // Debug effect simplificado
    useEffect(() => {
        log(`Status updated:`, {
            state: status.state,
            isConnected: status.isConnected,
            isLoading: status.isLoading,
            isContentLoaded: status.isContentLoaded,
            hasCurrentContent: !!currentContent,
            hasProgressInfo: !!progressInfo
        });
    }, [status.state, status.isConnected, status.isLoading, status.isContentLoaded, currentContent, progressInfo]);
    
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
        stop,
        
        // Controles de audio
        mute,
        unmute,
        setVolume,

        // Controles de pistas
        setAudioTrack,
        setSubtitleTrack,
        disableSubtitles,
        
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
        debugMode: false
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
    const { status } = useCastManager({ 
        debugMode: false
    });
    return status;
}

/*
 *  Hook para obtener solo el progreso de Cast
 *
 */

export function useCastManagerProgress(): CastProgressInfo | undefined {
    const { progressInfo } = useCastManager({ 
        debugMode: false
    });
    return progressInfo;
}