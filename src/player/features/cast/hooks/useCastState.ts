import { useEffect, useReducer, useRef } from 'react';
import {
    useCastSession,
    useMediaStatus,
    useCastState as useNativeCastState,
    useRemoteMediaClient,
    useStreamPosition
} from 'react-native-google-cast';

import { CastConnectionInfo, CastErrorInfo, CastMediaInfo, CastStateCustom, CastTrackInfo } from '../types/types';
import { castReducer, createInitialCastState, getVolume } from '../utils/castUtils';

import { ComponentLogger, Logger, LoggerConfigBasic, LogLevel } from '../../logger';
import { DEFAULT_CAST_CONFIG, LOGGER_CONFIG } from '../constants';

// Hook principal que maneja toda la sincronización
export function useCastState(config: LoggerConfigBasic = {}, callbacks:{ 
    onConnectionChange?: (status: CastConnectionInfo['status']) => void;
    onMediaChange?: (media: CastMediaInfo) => void;
    onError?: (error: CastErrorInfo) => void;
    onAudioTrackChange?: (track: CastTrackInfo | null) => void;
    onTextTrackChange?: (track: CastTrackInfo | null) => void;
} = {}): CastStateCustom {
    const { 
        onConnectionChange, 
        onMediaChange, 
        onError,
        onAudioTrackChange,
        onTextTrackChange 
    } = callbacks;

    const playerLogger = useRef<Logger | null>(null);
    const currentLogger = useRef<ComponentLogger | null>(null);

    const castLoggerConfig: LoggerConfigBasic = {
        enabled: config?.enabled ?? true,
        level: config?.level ?? LogLevel.INFO,
        instanceId: config?.instanceId || undefined,
    };

    if (!playerLogger.current){
        playerLogger.current = new Logger({
            enabled: castLoggerConfig.enabled,
            prefix: LOGGER_CONFIG.prefix,
            level: castLoggerConfig.level,
            useColors: true,
            includeLevelName: false,
            includeTimestamp: true,
            includeInstanceId: true,
        }, castLoggerConfig.instanceId);

        currentLogger.current = playerLogger.current?.forComponent('Cast State with Reducer', castLoggerConfig.enabled, castLoggerConfig.level);
    }
    
    // Hooks nativos - se ejecutan de forma independiente
    const nativeCastState = useNativeCastState();
    const nativeSession = useCastSession();
    const nativeClient = useRemoteMediaClient();
    const nativeMediaStatus = useMediaStatus();
    const nativeStreamPosition = useStreamPosition(DEFAULT_CAST_CONFIG.streamPositionInterval);
    
    // Reducer para sincronización
    const [state, dispatch] = useReducer(castReducer, {
        castState: createInitialCastState(),
        lastValidPosition: 0,
        updateSequence: 0,
        logger: currentLogger.current
    });

    // Actualizar logger en el reducer si no está disponible
    useEffect(() => {
        if (currentLogger.current && !state.logger) {
            dispatch({
                type: 'UPDATE_LOGGER',
                payload: { logger: currentLogger.current }
            });
        }
    }, [currentLogger.current, state.logger]);
    
    const isMountedRef = useRef(true);
    const callbacksRef = useRef({ onConnectionChange, onMediaChange, onError, onAudioTrackChange, onTextTrackChange });
    const prevStateRef = useRef(state.castState);
    
    // Mantener callbacks actualizados
    callbacksRef.current = { onConnectionChange, onMediaChange, onError };
    
    useEffect(() => {
        return () => { isMountedRef.current = false; };
    }, []);
    
    // UN SOLO useEffect que sincroniza TODO junto
    useEffect(() => {
        if (!isMountedRef.current) return;
        
        dispatch({
            type: 'SYNC_UPDATE',
            payload: {
                nativeCastState,
                nativeSession,
                nativeClient,
                nativeMediaStatus,
                nativeStreamPosition
            }
        });
        
    }, [nativeCastState, nativeSession, nativeClient, nativeMediaStatus, nativeStreamPosition]);

    useEffect(() => {
        const updateVolume = async () => {
            const volume = await getVolume(nativeSession);
            dispatch({ type: 'UPDATE_VOLUME', payload: volume });
        };
        updateVolume();
    }, [nativeSession]);
    
    useEffect(() => {
        const currentState = state.castState;
        const prevState = prevStateRef.current;
        const callbacks = callbacksRef.current;
        
        // Callback de cambio de conexión
        if (currentState.connection.status !== prevState.connection.status && callbacks.onConnectionChange) {
            callbacks.onConnectionChange(currentState.connection.status);
        }
        
        // Callback de cambio de media
        if (
            (currentState.media.url !== prevState.media.url ||
             currentState.media.isPlaying !== prevState.media.isPlaying ||
             currentState.media.isPaused !== prevState.media.isPaused) &&
            callbacks.onMediaChange
        ) {
            callbacks.onMediaChange(currentState.media);
        }
        
        // Callback de cambio de pista de audio
        if (
            currentState.media.audioTrack?.id !== prevState.media.audioTrack?.id &&
            callbacks.onAudioTrackChange
        ) {
            callbacks.onAudioTrackChange(currentState.media.audioTrack);
        }
        
        // Callback de cambio de pista de subtítulos
        if (
            currentState.media.textTrack?.id !== prevState.media.textTrack?.id &&
            callbacks.onTextTrackChange
        ) {
            callbacks.onTextTrackChange(currentState.media.textTrack);
        }
        
        // Callback de error
        if (currentState.error.hasError !== prevState.error.hasError && callbacks.onError) {
            callbacks.onError(currentState.error);
        }
        
        prevStateRef.current = currentState;
    }, [state.castState]);
    
    return state.castState;
}
