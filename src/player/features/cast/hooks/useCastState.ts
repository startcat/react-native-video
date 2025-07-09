import { useCallback, useEffect, useRef, useState } from 'react';
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
 *  Todas las interfaces ahora están consolidadas en types.ts
 */

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
    
    // Referencias para comparación
    const previousStateRef = useRef<CastStateInfo>(stateInfo);
    const previousConnectionRef = useRef<boolean>(false);
    
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
    
    // Función para mapear estado nativo a estado del manager
    const mapCastStateToManagerState = useCallback((nativeCastState?: CastState): CastManagerState => {
        if (!nativeCastState) {
            return CastManagerState.DISCONNECTED;
        }
        
        // Convertir enum a string para usar como clave
        const stateKey = String(nativeCastState);
        return CAST_STATE_MAPPING[stateKey] || CastManagerState.DISCONNECTED;
    }, []);
    
    // Función para crear nuevo estado
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
    
    // Función para actualizar estado
    const updateStateInfo = useCallback((newState: CastStateInfo) => {
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
                onStateChange(newState, previousState);
            }
            
            if (hasConnectionChange && onConnectionChange) {
                onConnectionChange(newState.isConnected, previousConnection);
            }
        } else {
            // Actualizar solo timestamps sin cambio de estado
            setStateInfo((prev: CastStateInfo) => ({
                ...prev,
                castStreamPosition: newState.castStreamPosition,
                lastUpdate: Date.now()
            }));
        }
    }, [debugMode, onStateChange, onConnectionChange]);
    
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
    }, [
        castState,
        castSession,
        castClient,
        castMediaStatus,
        castStreamPosition,
        createNewStateInfo,
        updateStateInfo
    ]);
    
    // Debug effect
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
    }, [castState, castSession, castClient, castMediaStatus, castStreamPosition, debugMode]);
    
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
    
    return getCastConnectivityInfo(castState || 'NOT_CONNECTED');
}

/*
 *  Hook que retorna solo si Cast está listo para operaciones
 *
 */

export function useCastReady(): boolean {
    const castState = useNativeCastState();
    const castSession = useCastSession();
    const castClient = useRemoteMediaClient();
    
    return castState === CastState.CONNECTED && !!castSession && !!castClient;
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
    
    useEffect(() => {
        if (castSession) {
            // Obtener nivel de volumen
            castSession.getVolume().then((volume: number) => {
                setVolumeInfo((prev: CastVolumeInfo) => ({ 
                    ...prev, 
                    level: volume,
                    controlType: 'master'
                }));
            }).catch(() => {
                setVolumeInfo((prev: CastVolumeInfo) => ({ 
                    ...prev, 
                    controlType: 'none'
                }));
            });
            
            // Obtener estado de mute
            castSession.isMute().then((isMuted: boolean) => {
                setVolumeInfo((prev: CastVolumeInfo) => ({ 
                    ...prev, 
                    muted: isMuted 
                }));
            }).catch(() => {
                // Ignore error
            });
        } else {
            // Reset cuando no hay sesión
            setVolumeInfo({ 
                level: 0.5, 
                muted: false, 
                stepInterval: 0.05,
                controlType: 'none'
            });
        }
    }, [castSession, castMediaStatus]);
    
    return volumeInfo;
}