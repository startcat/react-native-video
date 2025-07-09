import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    CastState,
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
        enableStreamPosition = true,
        streamPositionInterval = 1,
        debugMode = false,
        onStateChange,
        onConnectionChange
    } = config;
    
    // Hooks nativos de Cast
    const castState = useNativeCastState();
    const castSession = useCastSession();
    const castClient = useRemoteMediaClient();
    const castMediaStatus = useMediaStatus();
    const castStreamPosition = useStreamPosition(enableStreamPosition ? streamPositionInterval : 0);
    
    // Estado interno
    const [stateInfo, setStateInfo] = useState<CastStateInfo>(() => 
        createInitialStateInfo()
    );
    
    // Referencias para comparación y evitar bucles
    const previousStateRef = useRef<CastStateInfo>(stateInfo);
    const previousConnectionRef = useRef<boolean>(false);
    const isUpdatingRef = useRef<boolean>(false);
    
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
    
    // Función para mapear estado nativo a estado del manager (memoizada)
    const mapCastStateToManagerState = useCallback((nativeCastState?: CastState): CastManagerState => {
        if (!nativeCastState) {
            return CastManagerState.DISCONNECTED;
        }
        
        // Convertir enum a string para usar como clave
        const stateKey = String(nativeCastState);
        return CAST_STATE_MAPPING[stateKey] || CastManagerState.DISCONNECTED;
    }, []);
    
    // Función para crear nuevo estado (memoizada)
    const createNewStateInfo = useCallback((
        nativeCastState?: CastState,
        session?: any,
        client?: any,
        mediaStatus?: any,
        streamPosition?: number
    ): CastStateInfo => {
        const managerState = mapCastStateToManagerState(nativeCastState);
        const isConnected = nativeCastState === CastState.CONNECTED;
        const isConnecting = nativeCastState === CastState.CONNECTING;
        const isDisconnected = !isConnected && !isConnecting;
        const hasSession = !!session;
        const hasClient = !!client;
        const hasMediaStatus = !!mediaStatus;
        const connectivityInfo = getCastConnectivityInfo(nativeCastState || 'NOT_CONNECTED');
        
        return {
            castState: nativeCastState,
            castSession: session,
            castClient: client,
            castMediaStatus: mediaStatus,
            castStreamPosition: streamPosition,
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
    }, [mapCastStateToManagerState]);
    
    // Función para actualizar estado de forma optimizada
    const updateStateInfo = useCallback((newState: CastStateInfo) => {
        // Evitar actualizaciones concurrentes
        if (isUpdatingRef.current) {
            return;
        }
        
        isUpdatingRef.current = true;
        
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
                if (debugMode) {
                    console.log(`${LOG_PREFIX} [useCastState] State updated:`, {
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
                }
                
                setStateInfo(newState);
                previousStateRef.current = newState;
                previousConnectionRef.current = newState.isConnected;
                
                // Emitir callbacks
                if (hasStateChange && onStateChange) {
                    // Usar setTimeout para evitar que el callback cause más renders síncronos
                    setTimeout(() => onStateChange(newState, previousState), 0);
                }
                
                if (hasConnectionChange && onConnectionChange) {
                    setTimeout(() => onConnectionChange(newState.isConnected, previousConnection), 0);
                }
            } else {
                // Actualizar solo timestamps y streamPosition sin cambio de estado
                setStateInfo((prev: CastStateInfo) => {
                    // Solo actualizar si streamPosition realmente cambió
                    if (prev.castStreamPosition !== newState.castStreamPosition) {
                        return {
                            ...prev,
                            castStreamPosition: newState.castStreamPosition,
                            lastUpdate: Date.now()
                        };
                    }
                    return prev;
                });
            }
        } finally {
            isUpdatingRef.current = false;
        }
    }, [debugMode, onStateChange, onConnectionChange]);

    // Crear hash para detectar cambios reales en las dependencias
    const dependencyHash = useMemo(() => {
        return JSON.stringify({
            castState: castState,
            hasSession: !!castSession,
            hasClient: !!castClient,
            hasMediaStatus: !!castMediaStatus,
            streamPosition: castStreamPosition
        });
    }, [castState, castSession, castClient, castMediaStatus, castStreamPosition]);
    
    // Efecto para actualizar estado cuando cambian los hooks nativos
    useEffect(() => {
        const newState = createNewStateInfo(
            castState,
            castSession,
            castClient,
            castMediaStatus,
            castStreamPosition
        );
        
        updateStateInfo(newState);
    }, [dependencyHash, createNewStateInfo, updateStateInfo]);
    
    // Debug effect optimizado
    useEffect(() => {
        if (debugMode) {
            console.log(`${LOG_PREFIX} [useCastState] Cast hooks updated:`, {
                castState,
                hasSession: !!castSession,
                hasClient: !!castClient,
                hasMediaStatus: !!castMediaStatus,
                streamPosition: castStreamPosition
            });
        }
    }, [dependencyHash, debugMode]);
    
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
    position: number;
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
            position: currentTime
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