import { useCallback, useEffect, useRef, useState } from 'react';

import {
    CastSession,
    RemoteMediaClient,
    useCastSession,
    useRemoteMediaClient
} from 'react-native-google-cast';

import { ComponentLogger, Logger, LoggerConfigBasic, LogLevel } from '../../logger';
import { CastMessageBuilder } from '../CastMessageBuilder';
import { LOGGER_CONFIG } from '../constants';
import { CastContentInfo, CastManager, CastManagerCallbacks, CastManagerState, MessageBuilderConfig } from '../types/types';
import { useCastState } from './useCastState';

// Hook principal del Cast Manager
export function useCastManager(
    config: LoggerConfigBasic & MessageBuilderConfig = {},
    callbacks: CastManagerCallbacks = {},
): CastManager {

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

        currentLogger.current = playerLogger.current?.forComponent('Cast Manager', castLoggerConfig.enabled, castLoggerConfig.level);
    }
    
    // this.currentLogger.info(`Initialized: ${JSON.stringify(this.config)}`);

    // Usar hooks existentes
    const castState = useCastState(castLoggerConfig);
    const nativeSession: CastSession = useCastSession();
    const nativeClient: RemoteMediaClient = useRemoteMediaClient();
    
    // Estado interno del manager
    const [managerState, setManagerState] = useState<CastManagerState>({
        isLoading: false,
        lastError: null,
        lastAction: null,
        canControl: false
    });
    
    // Referencias para callbacks, contenido y message builder
    const callbacksRef = useRef(callbacks);
    const lastLoadedContentRef = useRef<string | null>(null);
    const messageBuilderRef = useRef<CastMessageBuilder>();
    const playbackStartedForUrlRef = useRef<string | null>(null);

    if (!messageBuilderRef.current) {
        messageBuilderRef.current = new CastMessageBuilder(config);
    }
    
    // Actualizar callbacks
    useEffect(() => {
        callbacksRef.current = callbacks;
    }, [callbacks]);
    
    // Función helper para validar si se puede controlar
    const canPerformAction = useCallback((): boolean => {
        const connectionOk = castState.connection.status === 'connected';
        const sessionOk = !!nativeSession;
        const clientOk = !!nativeClient;
        const canPerform = connectionOk && sessionOk && clientOk;
        
        if (!canPerform){
            currentLogger.current?.debug(`canPerformAction - connectionStatus: '${castState.connection.status}' (${connectionOk}), hasSession: ${sessionOk}, hasClient: ${clientOk} => ${canPerform}`);
        }
        
        return canPerform;
    }, [castState.connection.status, nativeSession, nativeClient]);
    
    // Función helper para manejar errores
    const handleActionError = useCallback((action: string, error: any): boolean => {
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        setManagerState((prev: CastManagerState) => ({
            ...prev,
            isLoading: false,
            lastError: `${action}: ${errorMessage}`,
            lastAction: action
        }));
        return false;
    }, []);
    
    // Función helper para iniciar acción
    const startAction = useCallback((action: string) => {
        setManagerState((prev: CastManagerState) => ({
            ...prev,
            isLoading: true,
            lastError: null,
            lastAction: action
        }));
    }, []);
    
    // Función helper para completar acción
    const completeAction = useCallback((action: string) => {
        setManagerState((prev: CastManagerState) => ({
            ...prev,
            isLoading: false,
            lastAction: action
        }));
    }, []);
    
    // Método para actualizar configuración del MessageBuilder
    const updateMessageBuilderConfig = useCallback((newConfig: any) => {
        messageBuilderRef.current.updateConfig(newConfig);
    }, []);
    
    // Acción: Cargar contenido (usando CastMessageBuilder)
    const loadContent = useCallback(async (content: CastContentInfo): Promise<boolean> => {
        if (!canPerformAction()) {
            handleActionError('loadContent', 'No Cast connection available');
            return false;
        }

        const currentMedia = await nativeClient.getMediaStatus();

        if (currentMedia && currentMedia.mediaInfo && currentMedia.mediaInfo.contentId !== lastLoadedContentRef.current) {
            currentLogger.current?.debug(`loadContent - Guardamos el contentId del media que esta reproduciendose en cast: ${JSON.stringify(currentMedia.mediaInfo.contentId)}`);
            lastLoadedContentRef.current = currentMedia.mediaInfo.contentId;
        }

        // currentLogger.current?.temp(`loadContent - lastLoadedContentRef: ${JSON.stringify(lastLoadedContentRef.current)}`);
        // currentLogger.current?.temp(`loadContent - content.source.uri: ${JSON.stringify(content.source.uri)}`);
        // currentLogger.current?.temp(`loadContent - isIdle: ${JSON.stringify(currentMedia?.playerState)}`);
        
        // Evitar recargar el mismo contenido
        if (lastLoadedContentRef.current === content.source.uri && 
            currentMedia?.playerState !== "idle") {
            currentLogger.current?.debug(`Content already loaded, skipping: ${content.source.uri}`);
            callbacksRef.current.onContentLoaded?.(content);
            return true;
        }
        
        startAction('loadContent');
        
        try {
            // Usar CastMessageBuilder para construir el mensaje
            const castMessage = messageBuilderRef.current?.buildCastMessage({
                source: content.source,
                manifest: content.manifest,
                drm: content.drm,
                youbora: content.youbora,
                metadata: content.metadata
            });
            
            if (!castMessage || !castMessage.mediaInfo) {
                throw new Error('Failed to build cast message');
            }
            
            currentLogger.current?.debug(`loadContent - castMessage: ${JSON.stringify(castMessage)}`);
            
            await nativeClient.loadMedia(castMessage);
            
            lastLoadedContentRef.current = content.source.uri;
            completeAction('loadContent');
            
            // Callback de éxito (se ejecutará cuando cambie el estado)
            setTimeout(() => {
                callbacksRef.current.onContentLoaded?.(content);
            }, 100);
            
            return true;
            
        } catch (error: any) {
            lastLoadedContentRef.current = null;
            playbackStartedForUrlRef.current = null;
            callbacksRef.current.onContentLoadError?.(
                error?.message || 'Failed to load content', 
                content
            );
            return handleActionError('loadContent', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);
    
    // Acción: Limpiar contenido
    const clearContent = useCallback(async (): Promise<boolean> => {
        if (!canPerformAction()) {
            return handleActionError('clearContent', 'No Cast connection available');
        }
        
        startAction('clearContent');
        
        try {
            await nativeClient.stop();
            lastLoadedContentRef.current = null;
            completeAction('clearContent');
            return true;
        } catch (error) {
            return handleActionError('clearContent', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);
    
    // Acción: Play
    const play = useCallback(async (): Promise<boolean> => {
        if (!canPerformAction()) {
            return handleActionError('play', 'No Cast connection available');
        }
        
        startAction('play');
        
        try {
            await nativeClient.play();
            completeAction('play');
            return true;
        } catch (error) {
            currentLogger.current?.error(`Action Play - Error: ${JSON.stringify(error)}`);
            return handleActionError('play', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);
    
    // Acción: Pause
    const pause = useCallback(async (): Promise<boolean> => {
        if (!canPerformAction()) {
            return handleActionError('pause', 'No Cast connection available');
        }

        startAction('pause');
        
        try {
            await nativeClient.pause();
            completeAction('pause');
            return true;
        } catch (error) {
            currentLogger.current?.error(`Action Pause - Error: ${JSON.stringify(error)}`);
            return handleActionError('pause', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);
    
    // Acción: Seek
    const seek = useCallback(async (position: number): Promise<boolean> => {
        if (!canPerformAction()) {
            return handleActionError('seek', 'No Cast connection available');
        }
        
        startAction('seek');
        
        try {
            await nativeClient.seek({ position });
            completeAction('seek');
            
            // Callback de seek completado
            setTimeout(() => {
                callbacksRef.current.onSeekCompleted?.(position);
            }, 100);
            
            return true;
        } catch (error) {
            currentLogger.current?.error(`Action Seek - Error: ${JSON.stringify(error)}`);
            return handleActionError('seek', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);
    
    // Acción: Skip Forward
    const skipForward = useCallback(async (seconds: number = 15): Promise<boolean> => {
        const newPosition = castState.media.currentTime + seconds;
        return seek(newPosition);
    }, [seek, castState.media.currentTime]);
    
    // Acción: Skip Backward  
    const skipBackward = useCallback(async (seconds: number = 15): Promise<boolean> => {
        const newPosition = Math.max(0, castState.media.currentTime - seconds);
        return seek(newPosition);
    }, [seek, castState.media.currentTime]);
    
    // Acción: Stop
    const stop = useCallback(async (): Promise<boolean> => {
        if (!canPerformAction()) {
            return handleActionError('stop', 'No Cast connection available');
        }
        
        startAction('stop');
        
        try {
            await nativeClient.stop();
            lastLoadedContentRef.current = null;
            completeAction('stop');
            return true;
        } catch (error) {
            currentLogger.current?.error(`Action Stop - Error: ${JSON.stringify(error)}`);
            return handleActionError('stop', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);
    
    // Acción: Mute
    const mute = useCallback(async (): Promise<boolean> => {
        if (!canPerformAction()) {
            return handleActionError('mute', 'No Cast connection available');
        }
        
        startAction('mute');
        
        try {
            await nativeSession.setMute(true);
            completeAction('mute');

            // Callback de mute completado
            setTimeout(() => {
                callbacksRef.current.onVolumeChanged?.(0, true);
            }, 100);

            return true;
        } catch (error) {
            currentLogger.current?.error(`Action Mute - Error: ${JSON.stringify(error)}`);
            return handleActionError('mute', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeSession]);
    
    // Acción: Unmute
    const unmute = useCallback(async (): Promise<boolean> => {
        if (!canPerformAction()) {
            return handleActionError('unmute', 'No Cast connection available');
        }
        
        startAction('unmute');
        
        try {
            await nativeSession.setMute(false);
            completeAction('unmute');

            // Callback de unmute completado
            setTimeout(async () => {
                try {
                    const currentVolume = await nativeSession.getVolume();
                    callbacksRef.current.onVolumeChanged?.(currentVolume, false);
                } catch (error) {
                    currentLogger.current?.error(`Action Unmute - Error: ${JSON.stringify(error)}`);
                    callbacksRef.current.onVolumeChanged?.(0.5, false); // Fallback volume
                }
            }, 100);
            
            return true;
        } catch (error) {
            currentLogger.current?.error(`Action Unmute - Error: ${JSON.stringify(error)}`);
            return handleActionError('unmute', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeSession]);
    
    // Acción: Set Volume
    const setVolume = useCallback(async (level: number): Promise<boolean> => {
        if (!canPerformAction()) {
            return handleActionError('setVolume', 'No Cast connection available');
        }
        
        const clampedLevel = Math.max(0, Math.min(1, level));
        startAction('setVolume');
        
        try {
            await nativeSession.setVolume(clampedLevel);
            completeAction('setVolume');
            
            // Callback de cambio de volumen
            setTimeout(() => {
                callbacksRef.current.onVolumeChanged?.(clampedLevel, castState.volume.isMuted);
            }, 100);
            
            return true;
        } catch (error) {
            currentLogger.current?.error(`Action SetVolume - Error: ${JSON.stringify(error)}`);
            return handleActionError('setVolume', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeSession, castState.volume.isMuted]);
    
    // Acción: Set Audio Track
    const setAudioTrack = useCallback(async (trackId: number): Promise<boolean> => {
        if (!canPerformAction()) {
            return handleActionError('setAudioTrack', 'No Cast connection available');
        }
        
        startAction('setAudioTrack');
        
        try {
            await nativeClient.setActiveTrackIds([trackId]);
            completeAction('setAudioTrack');
            return true;
        } catch (error) {
            currentLogger.current?.error(`Action SetAudioTrack - Error: ${JSON.stringify(error)}`);
            return handleActionError('setAudioTrack', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);
    
    // Acción: Set Subtitle Track
    const setSubtitleTrack = useCallback(async (trackId: number): Promise<boolean> => {
        if (!canPerformAction()) {
            return handleActionError('setSubtitleTrack', 'No Cast connection available');
        }
        
        startAction('setSubtitleTrack');
        
        try {
            // Mantener track de audio actual y añadir track de subtítulos
            const currentAudioId = castState.media.audioTrack?.id;
            const activeIds = currentAudioId ? [currentAudioId, trackId] : [trackId];
            
            await nativeClient.setActiveTrackIds(activeIds);
            completeAction('setSubtitleTrack');
            return true;
        } catch (error) {
            currentLogger.current?.error(`Action SetSubtitleTrack - Error: ${JSON.stringify(error)}`);
            return handleActionError('setSubtitleTrack', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient, castState.media.audioTrack]);

    const setActiveTrackIds = useCallback(async (trackIds: number[]): Promise<boolean> => {
        if (!canPerformAction()) {
            return handleActionError('setActiveTrackIds', 'No Cast connection available');
        }
        
        startAction('setActiveTrackIds');
        
        try {
            await nativeClient.setActiveTrackIds(trackIds);
            completeAction('setActiveTrackIds');
            return true;
        } catch (error) {
            currentLogger.current?.error(`Action SetActiveTrackIds - Error: ${JSON.stringify(error)}`);
            return handleActionError('setActiveTrackIds', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);
    
    // Acción: Disable Subtitles
    const disableSubtitles = useCallback(async (): Promise<boolean> => {
        if (!canPerformAction()) {
            return handleActionError('disableSubtitles', 'No Cast connection available');
        }
        
        startAction('disableSubtitles');
        
        try {
            // Solo mantener track de audio
            const currentAudioId = castState.media.audioTrack?.id;
            const activeIds = currentAudioId ? [currentAudioId] : [];
            
            await nativeClient.setActiveTrackIds(activeIds);
            completeAction('disableSubtitles');
            return true;
        } catch (error) {
            currentLogger.current?.error(`Action DisableSubtitles - Error: ${JSON.stringify(error)}`);
            return handleActionError('disableSubtitles', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient, castState.media.audioTrack]);
    
    // Actualizar estado de control
    useEffect(() => {
        setManagerState((prev: CastManagerState) => ({
            ...prev,
            canControl: canPerformAction()
        }));
    }, [canPerformAction]);
    
    // Callbacks de eventos basados en cambios de estado: onPlaybackStarted, onPlaybackEnded
    useEffect(() => {
        const { media } = castState;
        const callbacks = callbacksRef.current;

        // currentLogger.current?.temp(`(useEffect) Cast State Media - isPlaying: ${media.isPlaying}, isIdle: ${media.isIdle}, url: ${media.url}, ref: ${lastLoadedContentRef.current}`);
        
        // Detectar inicio de reproducción -> Primera reproducción de un nuevo contenido
        if (media.isPlaying && !media.isIdle && callbacks.onPlaybackStarted && (!lastLoadedContentRef.current || lastLoadedContentRef.current !== media.url)) {
            currentLogger.current?.info(`Firing onPlaybackStarted callback - media.isPlaying: ${media.isPlaying}, media.isIdle: ${media.isIdle}`);
            lastLoadedContentRef.current = media.url;
            callbacks.onPlaybackStarted();
        }
        
        // Detectar fin de reproducción
        if (media.isIdle && lastLoadedContentRef.current && callbacks.onPlaybackEnded) {
            lastLoadedContentRef.current = null;
            callbacks.onPlaybackEnded();
        }
        
    }, [castState.media.isPlaying, castState.media.isIdle, castState.media.url]);
    
    // Callback de cambio de volumen: onVolumeChanged
    useEffect(() => {
        const callbacks = callbacksRef.current;
        if (callbacks.onVolumeChanged) {
            callbacks.onVolumeChanged(castState.volume.level, castState.volume.isMuted);
        }
    }, [castState.volume.level, castState.volume.isMuted]);
    
    return {
        // Acciones
        loadContent,
        clearContent,
        play,
        pause,
        seek,
        skipForward,
        skipBackward,
        stop,
        mute,
        unmute,
        setVolume,
        setAudioTrack,
        setSubtitleTrack,
        setActiveTrackIds,
        disableSubtitles,
        updateMessageBuilderConfig,
        
        // Estado
        state: managerState
    };
}