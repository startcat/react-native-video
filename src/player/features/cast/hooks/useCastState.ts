import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    CastSession,
    CastState,
    MediaStatus,
    RemoteMediaClient,
    useCastSession,
    useMediaStatus,
    useCastState as useNativeCastState,
    useRemoteMediaClient,
    useStreamPosition
} from 'react-native-google-cast';

import { CAST_STATE_MAPPING, LOG_PREFIX } from '../constants';
import { CastManagerState, CastStateInfo, CastVolumeInfo, UseCastStateConfig } from '../types';
import { getCastConnectivityInfo } from '../utils/castUtils';

/*
 *  Hook para gestionar estado de Cast de forma reactiva
 *
 */

export function useCastState(config: UseCastStateConfig = {}): CastStateInfo {
    const {
        debugMode = false,
        onStateChange,
        onConnectionChange,
        streamPositionInterval = 1
    } = config;

    const LOG_KEY = '(useCastState)';
    
    // Hooks nativos de Cast
    const castState = useNativeCastState();
    const castSession: CastSession = useCastSession();
    const castClient: RemoteMediaClient = useRemoteMediaClient();
    const castMediaStatus: MediaStatus = useMediaStatus();
    const castStreamPosition: number | null = useStreamPosition(streamPositionInterval);
    
    // Estado interno
    const [stateInfo, setStateInfo] = useState<CastStateInfo>(() => 
        createInitialStateInfo()
    );

    // Referencias para comparación y evitar bucles
    const previousStateRef = useRef<CastStateInfo>(stateInfo);
    const previousConnectionRef = useRef<boolean>(false);
    
    // Refs para capturar callbacks y debugMode sin crear dependencias
    const debugModeRef = useRef(debugMode);
    const onStateChangeRef = useRef(onStateChange);
    const onConnectionChangeRef = useRef(onConnectionChange);
    
    // Actualizar refs cuando cambien los valores
    debugModeRef.current = debugMode;
    onStateChangeRef.current = onStateChange;
    onConnectionChangeRef.current = onConnectionChange;
    
    // Función para crear estado inicial
    function createInitialStateInfo(): CastStateInfo {
        return {
            castState: undefined,
            castSession: undefined,
            castClient: undefined,
            castMediaStatus: undefined,
            castStreamPosition: undefined,
            managerState: CastManagerState.DISCONNECTED,
            isConnected: false,
            isConnecting: false,
            isDisconnected: true,
            hasSession: false,
            hasClient: false,
            hasMediaStatus: false,
            connectivityInfo: {
                isConnected: false,
                isConnecting: false,
                isDisconnected: true,
                statusText: 'Desconectado'
            },
            lastStateChange: Date.now(),
            lastUpdate: Date.now()
        };
    }

    function log(message: string, data?: any): void {
        if (debugModeRef.current) {
            console.log(`${LOG_PREFIX} ${LOG_KEY} ${message} ${data ? `:: ${JSON.stringify(data)}` : ''}`);
        }
    }
    
    // Función para mapear estado nativo a estado del manager
    const mapCastStateToManagerState = useCallback((nativeCastState?: string, mediaStatus?: any): CastManagerState => {
        if (!nativeCastState) {
            return CastManagerState.DISCONNECTED;
        }
        
        // Usar directamente el string normalizado
        const baseState = CAST_STATE_MAPPING[nativeCastState] || CastManagerState.DISCONNECTED;
        
        // Si está conectado y hay mediaStatus, determinar estado específico basado en playerState
        if (baseState === CastManagerState.CONNECTED && mediaStatus) {
            switch (mediaStatus.playerState) {
                case 'PLAYING':
                    return CastManagerState.PLAYING;
                case 'PAUSED':
                    return CastManagerState.PAUSED;
                case 'BUFFERING':
                case 'LOADING':
                    return CastManagerState.LOADING;
                case 'IDLE':
                    return CastManagerState.CONNECTED;
                default:
                    return CastManagerState.CONNECTED;
            }
        }
        
        return baseState;
    }, []);
    
    // Función para crear nuevo estado
    const createNewStateInfo = (
        nativeCastState?: CastState,
        session?: CastSession,
        client?: RemoteMediaClient,
        mediaStatus?: MediaStatus,
        streamPosition?: number | null
    ): CastStateInfo => {        
        // Convertir a uppercase para consistencia con las constantes
        const normalizedCastState = String(nativeCastState || 'NOT_CONNECTED').toUpperCase();
        
        const managerState = mapCastStateToManagerState(normalizedCastState, mediaStatus);

        const isConnected = normalizedCastState === 'CONNECTED';
        const isConnecting = normalizedCastState === 'CONNECTING';
        const isDisconnected = !isConnected && !isConnecting;
        const hasSession = !!session;
        const hasClient = !!client;
        const hasMediaStatus = !!mediaStatus;
        const connectivityInfo = getCastConnectivityInfo(normalizedCastState);
        const finalStreamPosition = streamPosition || 0;
        
        const result = {
            castState: nativeCastState,
            castSession: session,
            castClient: client,
            castMediaStatus: mediaStatus,
            castStreamPosition: finalStreamPosition,
            managerState,
            isConnected,
            isConnecting,
            isDisconnected,
            hasSession,
            hasClient,
            hasMediaStatus,
            connectivityInfo,
            lastStateChange: Date.now(),
            lastUpdate: Date.now()
        };
        
        return result;
    };

    // Función para actualizar estado de forma optimizada
    const updateStateInfo = useCallback((newState: CastStateInfo) => {
        
        try {
            const previousState = previousStateRef.current;
            const previousConnection = previousConnectionRef.current;
            
            // Verificar si hay cambios significativos
            const hasStateChange = (
                newState.castState !== previousState.castState ||
                newState.hasSession !== previousState.hasSession ||
                newState.hasClient !== previousState.hasClient ||
                newState.managerState !== previousState.managerState
            );
            
            const hasConnectionChange = newState.isConnected !== previousConnection;
            
            if (hasStateChange || hasConnectionChange) {
                log(`State updated:`, {
                    previous: {
                        castState: previousState.castState,
                        managerState: previousState.managerState,
                        isConnected: previousState.isConnected
                    },
                    current: {
                        castState: newState.castState,
                        managerState: newState.managerState,
                        isConnected: newState.isConnected
                    }
                });
                
                previousStateRef.current = newState;
                previousConnectionRef.current = newState.isConnected;
                
                // Emitir callbacks usando refs
                if (hasStateChange && onStateChangeRef.current) {
                    onStateChangeRef.current?.(newState, previousState);
                }
                
                if (hasConnectionChange && onConnectionChangeRef.current) {
                    onConnectionChangeRef.current?.(newState.isConnected, previousConnection);
                }

            }
            
        } finally {
            setStateInfo(newState);
        }
    }, []);

    useEffect(() => {
        const newState = createNewStateInfo(
            castState,
            castSession,
            castClient,
            castMediaStatus,
            castStreamPosition || 0
        );

        updateStateInfo(newState);

    }, [castState, castSession, castClient, castMediaStatus, castStreamPosition, updateStateInfo]);
    
    return stateInfo;
}

/*
 *  Hook simplificado que solo retorna información de conectividad
 *
 */

export function useCastConnectivity(): {
    isConnected: boolean;
    isConnecting: boolean;
    isDisconnected: boolean;
    statusText: string;
} {
    const castState = useNativeCastState();
    
    return useMemo(() => {
        return getCastConnectivityInfo(castState || 'NOT_CONNECTED');
    }, [castState]);
}

/*
 *  Hook que retorna solo si Cast está listo para operaciones
 *
 */

export function useCastReady(): boolean {
    const castState = useNativeCastState();
    const castSession = useCastSession();
    const castClient = useRemoteMediaClient();
    
    return useMemo(() => {
        return castState === CastState.CONNECTED && !!castSession && !!castClient;
    }, [castState, castSession, castClient]);
}

/*
 *  Hook para obtener información de progreso de Cast
 *
 */

export function useCastProgress(enabled: boolean = true): {
    currentTime: number;
    duration: number;
    progress: number;
    isBuffering: boolean;
    isPaused: boolean;
} {
    const castMediaStatus = useMediaStatus();
    const castStreamPosition = useStreamPosition(enabled ? 1 : 0);
    
    return useMemo(() => {
        const currentTime = castStreamPosition || 0;
        const duration = castMediaStatus?.mediaInfo?.streamDuration || 0;
        const progress = duration > 0 ? currentTime / duration : 0;
        const isBuffering = castMediaStatus?.playerState === 'BUFFERING' || 
                           castMediaStatus?.playerState === 'LOADING';
        const isPaused = castMediaStatus?.playerState === 'PAUSED';
        
        return {
            currentTime,
            duration,
            progress,
            isBuffering,
            isPaused,
        };
    }, [castMediaStatus, castStreamPosition]);
}

/*
 *  Hook para obtener información de volumen de Cast
 *
 */

export function useCastVolume(): CastVolumeInfo {
    const castSession = useCastSession();
    const castMediaStatus = useMediaStatus();
    const [volumeInfo, setVolumeInfo] = useState<CastVolumeInfo>({
        level: 0.5,
        muted: false,
        stepInterval: 0.05,
        controlType: 'master'
    });
    
    // Evitar actualizaciones innecesarias con un ref de comparación
    const lastSessionRef = useRef(castSession);
    const lastMediaStatusRef = useRef(castMediaStatus);
    
    useEffect(() => {
        // Solo ejecutar si realmente cambió la sesión o el estado del media
        if (lastSessionRef.current === castSession && lastMediaStatusRef.current === castMediaStatus) {
            return;
        }
        
        lastSessionRef.current = castSession;
        lastMediaStatusRef.current = castMediaStatus;
        
        if (castSession) {
            // Obtener nivel de volumen
            castSession.getVolume().then((volume: number) => {
                setVolumeInfo((prev: CastVolumeInfo) => {
                    if (prev.level !== volume || prev.controlType !== 'master') {
                        return { 
                            ...prev, 
                            level: volume,
                            controlType: 'master'
                        };
                    }
                    return prev;
                });
            }).catch(() => {
                setVolumeInfo((prev: CastVolumeInfo) => {
                    if (prev.controlType !== 'none') {
                        return { 
                            ...prev, 
                            controlType: 'none'
                        };
                    }
                    return prev;
                });
            });
            
            // Obtener estado de mute
            castSession.isMute().then((isMuted: boolean) => {
                setVolumeInfo((prev: CastVolumeInfo) => {
                    if (prev.muted !== isMuted) {
                        return { 
                            ...prev, 
                            muted: isMuted 
                        };
                    }
                    return prev;
                });
            }).catch(() => {
                // Ignore error
            });
        } else {
            // Reset cuando no hay sesión
            setVolumeInfo((prev: CastVolumeInfo) => {
                if (prev.level !== 0.5 || prev.muted !== false || prev.controlType !== 'none') {
                    return { 
                        level: 0.5, 
                        muted: false, 
                        stepInterval: 0.05,
                        controlType: 'none'
                    };
                }
                return prev;
            });
        }
    }, [castSession, castMediaStatus]);
    
    return volumeInfo;
}