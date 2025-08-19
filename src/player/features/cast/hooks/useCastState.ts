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

// Hook principal que maneja toda la sincronización
export function useCastState(options: { 
    debugMode?: boolean;
    onConnectionChange?: (status: CastConnectionInfo['status']) => void;
    onMediaChange?: (media: CastMediaInfo) => void;
    onError?: (error: CastErrorInfo) => void;
    onAudioTrackChange?: (track: CastTrackInfo | null) => void;
    onTextTrackChange?: (track: CastTrackInfo | null) => void;
} = {}): CastStateCustom {
    const { 
        debugMode = true, 
        onConnectionChange, 
        onMediaChange, 
        onError,
        onAudioTrackChange,
        onTextTrackChange 
    } = options;
    
    // Hooks nativos - se ejecutan de forma independiente
    const nativeCastState = useNativeCastState();
    const nativeSession = useCastSession();
    const nativeClient = useRemoteMediaClient();
    const nativeMediaStatus = useMediaStatus();
    const nativeStreamPosition = useStreamPosition(1); // Cada 1 segundo
    
    // Reducer para sincronización
    const [state, dispatch] = useReducer(castReducer, {
        castState: createInitialCastState(),
        lastValidPosition: 0,
        updateSequence: 0
    });
    
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
        
    }, [nativeCastState, nativeSession, nativeClient, nativeMediaStatus, nativeStreamPosition, debugMode]);

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
