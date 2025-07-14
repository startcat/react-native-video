import { useEffect, useRef } from 'react';
import { CastConnectionInfo, CastErrorInfo, CastTrackInfo } from '../types/types';
import { useCastState } from './useCastState';

// ✅ Hook para monitorear cambios específicos
export function useCastMonitor(callbacks: {
    onConnect?: () => void;
    onDisconnect?: () => void;
    onPlay?: () => void;
    onPause?: () => void;
    onError?: (error: CastErrorInfo) => void;
    onAudioTrackChange?: (track: CastTrackInfo | null) => void;
    onTextTrackChange?: (track: CastTrackInfo | null) => void;
}) {
    const prevConnectionRef = useRef<CastConnectionInfo['status']>('disconnected');
    const prevPlayingRef = useRef(false);
    const prevAudioTrackRef = useRef<number | null>(null);
    const prevTextTrackRef = useRef<number | null>(null);
    
    const castState = useCastState();
    
    useEffect(() => {
        const { connection, media, error } = castState;
        
        // Monitor conexión
        if (connection.status !== prevConnectionRef.current) {
            if (connection.status === 'connected' && callbacks.onConnect) {
                callbacks.onConnect();
            } else if (connection.status === 'disconnected' && callbacks.onDisconnect) {
                callbacks.onDisconnect();
            }
            prevConnectionRef.current = connection.status;
        }
        
        // Monitor reproducción
        if (media.isPlaying !== prevPlayingRef.current) {
            if (media.isPlaying && callbacks.onPlay) {
                callbacks.onPlay();
            } else if (!media.isPlaying && media.isPaused && callbacks.onPause) {
                callbacks.onPause();
            }
            prevPlayingRef.current = media.isPlaying;
        }
        
        // ✅ Monitor cambios de pista de audio
        const currentAudioTrackId = media.audioTrack?.id || null;
        if (currentAudioTrackId !== prevAudioTrackRef.current && callbacks.onAudioTrackChange) {
            // Only trigger callback if it's a meaningful change (not just null → null)
            if (currentAudioTrackId !== null || prevAudioTrackRef.current !== null) {
                callbacks.onAudioTrackChange(media.audioTrack);
            }
            prevAudioTrackRef.current = currentAudioTrackId;
        }
        
        // ✅ Monitor cambios de pista de subtítulos
        const currentTextTrackId = media.textTrack?.id || null;
        if (currentTextTrackId !== prevTextTrackRef.current && callbacks.onTextTrackChange) {
            // Only trigger callback if it's a meaningful change (not just null → null)
            if (currentTextTrackId !== null || prevTextTrackRef.current !== null) {
                callbacks.onTextTrackChange(media.textTrack);
            }
            prevTextTrackRef.current = currentTextTrackId;
        }
        
        // Monitor errores
        if (error.hasError && callbacks.onError) {
            callbacks.onError(error);
        }
        
    }, [castState, callbacks]);
}