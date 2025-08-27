import { useEffect, useRef } from 'react';
import { ComponentLogger, Logger, LoggerConfigBasic, LogLevel } from '../../logger';
import { LOGGER_CONFIG } from '../constants';
import { CastConnectionInfo, CastErrorInfo, CastTrackInfo } from '../types/types';
import { useCastState } from './useCastState';

// Hook para monitorear cambios específicos
export function useCastMonitor(config: LoggerConfigBasic = {}, callbacks: {
    onConnect?: () => void;
    onDisconnect?: () => void;
    onPlay?: () => void;
    onPause?: () => void;
    onError?: (error: CastErrorInfo) => void;
    onAudioTrackChange?: (track: CastTrackInfo | null) => void;
    onTextTrackChange?: (track: CastTrackInfo | null) => void;
}) {

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

        currentLogger.current = playerLogger.current?.forComponent('Cast Monitor', castLoggerConfig.enabled, castLoggerConfig.level);
    }

    const prevConnectionRef = useRef<CastConnectionInfo['status']>('notConnected');
    const prevPlayingRef = useRef(false);
    const prevAudioTrackRef = useRef<number | null>(null);
    const prevTextTrackRef = useRef<number | null>(null);
    
    const castState = useCastState(config);
    
    useEffect(() => {
        const { connection, media, error } = castState;
        
        // Monitor conexión
        if (connection.status !== prevConnectionRef.current) {
            if (connection.status === 'connected' && callbacks.onConnect) {
                currentLogger.current?.debug('Connection status: connected');
                callbacks.onConnect();
            } else if (connection.status === 'notConnected' && callbacks.onDisconnect) {
                currentLogger.current?.debug('Connection status: notConnected');
                callbacks.onDisconnect();
            }
            prevConnectionRef.current = connection.status;
        }
        
        // Monitor reproducción
        if (media.isPlaying !== prevPlayingRef.current) {
            if (media.isPlaying && callbacks.onPlay) {
                currentLogger.current?.debug('Media status: playing');
                callbacks.onPlay();
            } else if (!media.isPlaying && media.isPaused && callbacks.onPause) {
                currentLogger.current?.debug('Media status: paused');
                callbacks.onPause();
            }
            prevPlayingRef.current = media.isPlaying;
        }
        
        // Monitor cambios de pista de audio
        const currentAudioTrackId = media.audioTrack?.id || null;
        if (currentAudioTrackId !== prevAudioTrackRef.current && callbacks.onAudioTrackChange) {
            // Only trigger callback if it's a meaningful change (not just null → null)
            if (currentAudioTrackId !== null || prevAudioTrackRef.current !== null) {
                currentLogger.current?.debug(`Media audio track: ${currentAudioTrackId}`);
                callbacks.onAudioTrackChange(media.audioTrack);
            }
            prevAudioTrackRef.current = currentAudioTrackId;
        }
        
        // Monitor cambios de pista de subtítulos
        const currentTextTrackId = media.textTrack?.id || null;
        if (currentTextTrackId !== prevTextTrackRef.current && callbacks.onTextTrackChange) {
            // Only trigger callback if it's a meaningful change (not just null → null)
            if (currentTextTrackId !== null || prevTextTrackRef.current !== null) {
                currentLogger.current?.debug(`Media text track: ${currentTextTrackId}`);
                callbacks.onTextTrackChange(media.textTrack);
            }
            prevTextTrackRef.current = currentTextTrackId;
        }
        
        // Monitor errores
        if (error.hasError && callbacks.onError) {
            currentLogger.current?.debug(`Media error: ${JSON.stringify(error)}`);
            callbacks.onError(error);
        }
        
    }, [castState, callbacks]);
}