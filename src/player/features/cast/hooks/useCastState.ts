import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
    CastSession,
    CastState,
    useCastSession,
    useMediaStatus,
    useCastState as useNativeCastState,
    useRemoteMediaClient,
    useStreamPosition
} from 'react-native-google-cast';

import { CastConnectionInfo, CastErrorInfo, CastMediaInfo, CastTrackInfo } from '../types/types';
import { castReducer, createInitialCastState } from '../utils/castUtils';

// ✅ Hook principal que maneja toda la sincronización
export function useCastState(options: { 
    debugMode?: boolean;
    onConnectionChange?: (status: CastConnectionInfo['status']) => void;
    onMediaChange?: (media: CastMediaInfo) => void;
    onError?: (error: CastErrorInfo) => void;
    onAudioTrackChange?: (track: CastTrackInfo | null) => void;
    onTextTrackChange?: (track: CastTrackInfo | null) => void;
} = {}): CastState {
    const { 
        debugMode = false, 
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
        updateSequence: 0,
        volumeUpdatePromise: null
    });
    
    const isMountedRef = useRef(true);
    const callbacksRef = useRef({ onConnectionChange, onMediaChange, onError, onAudioTrackChange, onTextTrackChange });
    const prevStateRef = useRef(state.castState);
    
    // Mantener callbacks actualizados
    callbacksRef.current = { onConnectionChange, onMediaChange, onError };
    
    useEffect(() => {
        return () => { isMountedRef.current = false; };
    }, []);
    
    // ✅ Función para actualizar volumen de forma async
    const updateVolumeInfo = useCallback(async (session: CastSession) => {
        console.log(`[CastState] updateVolumeInfo - session: ${session}, volumeUpdatePromise: ${state.volumeUpdatePromise}`);
        if (!session || state.volumeUpdatePromise) return;
        
        const volumePromise = (async () => {
            try {
                const [volume, isMuted] = await Promise.all([
                    session.getVolume(),
                    session.isMute()
                ]);
                
                if (isMountedRef.current) {
                    dispatch({
                        type: 'UPDATE_VOLUME',
                        payload: {
                            level: Math.max(0, Math.min(1, volume)), // Clamp 0-1
                            isMuted,
                            canControl: true
                        }
                    });
                }
            } catch (error) {
                if (isMountedRef.current) {
                    dispatch({
                        type: 'UPDATE_VOLUME',
                        payload: {
                            level: 0.5,
                            isMuted: false,
                            canControl: false
                        }
                    });
                    
                    if (debugMode) {
                        console.warn('[CastState] Volume update failed:', error);
                    }
                }
            }
        })();
        
        return volumePromise;
    }, [state.volumeUpdatePromise, debugMode]);
    
    // ✅ UN SOLO useEffect que sincroniza TODO junto
    useEffect(() => {
        if (!isMountedRef.current) return;
        
        // ✅ DEBUGGING: Logear estados nativos
        // console.log('[CastState] Native state sync:', {
        //     nativeCastState,
        //     hasSession: !!nativeSession,
        //     hasClient: !!nativeClient,
        //     hasMedia: !!nativeMediaStatus,
        //     mediaStatus: nativeMediaStatus ? {
        //         isPlaying: nativeMediaStatus.isPlaying,
        //         isPaused: nativeMediaStatus.isPaused,
        //         isIdle: nativeMediaStatus.isIdle,
        //         playerState: nativeMediaStatus.playerState
        //     } : null,
        //     position: nativeStreamPosition,
        //     sequence: state.updateSequence + 1
        // });
        
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
    
    // ✅ Efecto para actualizar volumen cuando hay sesión válida
    useEffect(() => {
        console.log(`[CastState] useEffect - nativeSession: ${nativeSession}, connectionStatus: ${state.castState.connection.status}`);
        if (nativeSession && state.castState.connection.status === 'connected') {
            updateVolumeInfo(nativeSession);
        } else if (!nativeSession) {
            // Reset volumen cuando no hay sesión
            dispatch({
                type: 'UPDATE_VOLUME',
                payload: {
                    level: 0.5,
                    isMuted: false,
                    canControl: false
                }
            });
        }
    }, [nativeSession, state.castState.connection.status, updateVolumeInfo]);
    
    // ✅ Efecto para callbacks cuando cambian los datos
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
        
        // ✅ Callback de cambio de pista de audio
        if (
            currentState.media.audioTrack?.id !== prevState.media.audioTrack?.id &&
            callbacks.onAudioTrackChange
        ) {
            callbacks.onAudioTrackChange(currentState.media.audioTrack);
        }
        
        // ✅ Callback de cambio de pista de subtítulos
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
