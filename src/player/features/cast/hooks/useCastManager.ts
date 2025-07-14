import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    CastSession,
    RemoteMediaClient,
    useCastSession,
    useRemoteMediaClient,
} from 'react-native-google-cast';

import { CastMessageBuilder } from '../CastMessageBuilder';
import { CastContentInfo, CastManager, CastManagerCallbacks, CastManagerState, MessageBuilderConfig } from '../types/types';
import { useCastState } from './useCastState';

// ✅ Hook principal del Cast Manager
export function useCastManager(
    callbacks: CastManagerCallbacks = {},
    messageBuilderConfig?: MessageBuilderConfig
): CastManager {
    // Usar hooks existentes
    const castState = useCastState();
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
    const pendingSeekRef = useRef<number | null>(null);
    const messageBuilderRef = useRef<CastMessageBuilder>();

    if (!messageBuilderRef.current) {
        messageBuilderRef.current = new CastMessageBuilder(messageBuilderConfig);
    }
    
    // Actualizar callbacks
    useEffect(() => {
        callbacksRef.current = callbacks;
    }, [callbacks]);
    
    // ✅ Función helper para validar si se puede controlar
    const canPerformAction = useCallback((): boolean => {
        return (
            castState.connection.status === 'connected' &&
            !!nativeSession &&
            !!nativeClient
        );
    }, [castState.connection.status, nativeSession, nativeClient]);
    
    // ✅ Función helper para manejar errores
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
    
    // ✅ Función helper para iniciar acción
    const startAction = useCallback((action: string) => {
        setManagerState((prev: CastManagerState) => ({
            ...prev,
            isLoading: true,
            lastError: null,
            lastAction: action
        }));
    }, []);
    
    // ✅ Función helper para completar acción
    const completeAction = useCallback((action: string) => {
        setManagerState((prev: CastManagerState) => ({
            ...prev,
            isLoading: false,
            lastAction: action
        }));
    }, []);
    
    // ✅ Método para actualizar configuración del MessageBuilder
    const updateMessageBuilderConfig = useCallback((newConfig: any) => {
        messageBuilderRef.current.updateConfig(newConfig);
    }, []);
    
    // ✅ Acción: Cargar contenido (usando CastMessageBuilder)
    const loadContent = useCallback(async (content: CastContentInfo): Promise<boolean> => {
        if (!canPerformAction()) {
            handleActionError('loadContent', 'No Cast connection available');
            return false;
        }
        
        // ✅ Evitar recargar el mismo contenido
        if (lastLoadedContentRef.current === content.source.uri && 
            castState.media.url === content.source.uri && 
            !castState.media.isIdle) {
            console.log('[CastManager] Content already loaded, skipping:', content.source.uri);
            return true;
        }
        
        startAction('loadContent');
        
        try {
            // ✅ Usar CastMessageBuilder para construir el mensaje
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
            callbacksRef.current.onContentLoadError?.(
                error?.message || 'Failed to load content', 
                content
            );
            return handleActionError('loadContent', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient, castState.media]);
    
    // ✅ Acción: Limpiar contenido
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
    
    // ✅ Acción: Play
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
            return handleActionError('play', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);
    
    // ✅ Acción: Pause
    const pause = useCallback(async (): Promise<boolean> => {
        console.log(`[DANI] [CastManager] pause() - ENTRY`);

        if (!canPerformAction()) {
            console.log(`[DANI] [CastManager] pause() - Cannot perform action`);
            return handleActionError('pause', 'No Cast connection available');
        }

        console.log(`[DANI] [CastManager] pause() - Calling nativeClient.pause()`);
        startAction('pause');
        
        try {
            await nativeClient.pause();
            console.log(`[DANI] [CastManager] pause() - SUCCESS - Native pause completed`);
            completeAction('pause');
            return true;
        } catch (error) {
            console.log(`[DANI] [CastManager] pause() - ERROR:`, error);
            return handleActionError('pause', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);
    
    // ✅ Acción: Seek
    const seek = useCallback(async (position: number): Promise<boolean> => {
        if (!canPerformAction()) {
            return handleActionError('seek', 'No Cast connection available');
        }
        
        startAction('seek');
        pendingSeekRef.current = position;
        
        try {
            await nativeClient.seek({ position });
            completeAction('seek');
            
            // Callback de seek completado
            setTimeout(() => {
                callbacksRef.current.onSeekCompleted?.(position);
                pendingSeekRef.current = null;
            }, 100);
            
            return true;
        } catch (error) {
            pendingSeekRef.current = null;
            return handleActionError('seek', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);
    
    // ✅ Acción: Skip Forward
    const skipForward = useCallback(async (seconds: number = 30): Promise<boolean> => {
        const newPosition = castState.media.currentTime + seconds;
        return seek(newPosition);
    }, [seek, castState.media.currentTime]);
    
    // ✅ Acción: Skip Backward  
    const skipBackward = useCallback(async (seconds: number = 30): Promise<boolean> => {
        const newPosition = Math.max(0, castState.media.currentTime - seconds);
        return seek(newPosition);
    }, [seek, castState.media.currentTime]);
    
    // ✅ Acción: Stop
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
            return handleActionError('stop', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);
    
    // ✅ Acción: Mute
    const mute = useCallback(async (): Promise<boolean> => {
        console.log(`[DANI] [CastManager] mute() - ENTRY`);
        
        if (!canPerformAction()) {
            console.log(`[DANI] [CastManager] mute() - Cannot perform action`);
            return handleActionError('mute', 'No Cast connection available');
        }
        
        console.log(`[DANI] [CastManager] mute() - Calling nativeSession.setMute(true)`);
        startAction('mute');
        
        try {
            await nativeSession.setMute(true);
            console.log(`[DANI] [CastManager] mute() - SUCCESS - Native mute completed`);
            completeAction('mute');
            return true;
        } catch (error) {
            console.log(`[DANI] [CastManager] mute() - ERROR:`, error);
            return handleActionError('mute', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeSession]);
    
    // ✅ Acción: Unmute
    const unmute = useCallback(async (): Promise<boolean> => {
        console.log(`[DANI] [CastManager] unmute() - ENTRY`);
        
        if (!canPerformAction()) {
            console.log(`[DANI] [CastManager] unmute() - Cannot perform action`);
            return handleActionError('unmute', 'No Cast connection available');
        }
        
        console.log(`[DANI] [CastManager] unmute() - Calling nativeSession.setMute(false)`);
        startAction('unmute');
        
        try {
            await nativeSession.setMute(false);
            console.log(`[DANI] [CastManager] unmute() - SUCCESS - Native unmute completed`);
            completeAction('unmute');
            return true;
        } catch (error) {
            console.log(`[DANI] [CastManager] unmute() - ERROR:`, error);
            return handleActionError('unmute', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeSession]);
    
    // ✅ Acción: Set Volume
    const setVolume = useCallback(async (level: number): Promise<boolean> => {
        console.log(`[DANI] [CastManager] setVolume(${level}) - ENTRY`);
        
        if (!canPerformAction()) {
            console.log(`[DANI] [CastManager] setVolume() - Cannot perform action`);
            return handleActionError('setVolume', 'No Cast connection available');
        }
        
        const clampedLevel = Math.max(0, Math.min(1, level));
        console.log(`[DANI] [CastManager] setVolume() - Calling nativeSession.setVolume(${clampedLevel})`);
        startAction('setVolume');
        
        try {
            await nativeSession.setVolume(clampedLevel);
            console.log(`[DANI] [CastManager] setVolume() - SUCCESS - Native setVolume completed`);
            completeAction('setVolume');
            
            // Callback de cambio de volumen
            setTimeout(() => {
                callbacksRef.current.onVolumeChanged?.(clampedLevel, castState.volume.isMuted);
            }, 100);
            
            return true;
        } catch (error) {
            console.log(`[DANI] [CastManager] setVolume() - ERROR:`, error);
            return handleActionError('setVolume', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeSession, castState.volume.isMuted]);
    
    // ✅ Acción: Set Audio Track
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
            return handleActionError('setAudioTrack', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient]);
    
    // ✅ Acción: Set Subtitle Track
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
            return handleActionError('setSubtitleTrack', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient, castState.media.audioTrack]);
    
    // ✅ Acción: Disable Subtitles
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
            return handleActionError('disableSubtitles', error);
        }
    }, [canPerformAction, handleActionError, startAction, completeAction, nativeClient, castState.media.audioTrack]);
    
    // ✅ Actualizar estado de control
    useEffect(() => {
        setManagerState((prev: CastManagerState) => ({
            ...prev,
            canControl: canPerformAction()
        }));
    }, [canPerformAction]);
    
    // ✅ Callbacks de eventos basados en cambios de estado
    useEffect(() => {
        const { media } = castState;
        const callbacks = callbacksRef.current;

        console.log(`[DANI] [CastManager] (useEffect) Cast State Media: ${JSON.stringify(media)}`);
        
        // Detectar inicio de reproducción
        if (media.isPlaying && !media.isIdle && callbacks.onPlaybackStarted) {
            callbacks.onPlaybackStarted();
        }
        
        // Detectar fin de reproducción
        if (media.isIdle && lastLoadedContentRef.current && callbacks.onPlaybackEnded) {
            callbacks.onPlaybackEnded();
        }
        
    }, [castState.media]);
    
    // ✅ Callback de cambio de volumen
    useEffect(() => {
        const callbacks = callbacksRef.current;
        if (callbacks.onVolumeChanged) {
            callbacks.onVolumeChanged(castState.volume.level, castState.volume.isMuted);
        }
    }, [castState.volume.level, castState.volume.isMuted]);
    
    return useMemo(() => ({
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
        disableSubtitles,
        updateMessageBuilderConfig,
        
        // Estado
        state: managerState
    }), [
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
        disableSubtitles,
        updateMessageBuilderConfig,
        managerState
    ]);
}