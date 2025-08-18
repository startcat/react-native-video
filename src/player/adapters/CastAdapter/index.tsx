import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
    useCastConnected,
    useCastManager,
    useCastMedia,
    useCastMonitor,
    useCastPlaying,
    useCastProgress,
    useCastTracks,
    useCastVolume
} from '../../features/cast/hooks';
import { type CastContentInfo, type CastManagerCallbacks } from '../../features/cast/types/types';
import { type PlayerAdapter, type PlayerContentInfo, type TrackInfo } from '../types';
import { type CastAdapterProps, type CastAdapterRef } from './types';

export const CastAdapter = forwardRef<CastAdapterRef, CastAdapterProps>(
    (props: CastAdapterProps, ref: React.Ref<CastAdapterRef>) => {
        // Cast hooks
        const castConnected = useCastConnected();
        const castMedia = useCastMedia();
        const castPlaying = useCastPlaying();
        const castProgress = useCastProgress();
        const castVolume = useCastVolume();
        const castTracks = useCastTracks();

        // Estados locales para Cast
        const [isBuffering, setIsBuffering] = useState(false);
        const [speedRate, setSpeedRate] = useState(1); // Cast normalmente no soporta speed rate
        const [maxBitrate, setMaxBitrate] = useState<number | null>(null);
        const [isFullscreen, setIsFullscreen] = useState(false);
        const [resizeMode, setResizeMode] = useState<'contain' | 'cover' | 'stretch' | 'center'>('contain');

        // Cast Manager con callbacks
        const castManagerCallbacks: CastManagerCallbacks = {
            onContentLoaded: (contentInfo: CastContentInfo) => {
                // Convertir tracks de Cast a TrackInfo
                const audioTracks: TrackInfo[] = castTracks.availableAudioTracks.map(track => ({
                    id: track.id,
                    name: track.name,
                    language: track.language,
                    type: 'AUDIO' as const
                }));
                
                const textTracks: TrackInfo[] = castTracks.availableTextTracks.map(track => ({
                    id: track.id,
                    name: track.name,
                    language: track.language,
                    type: 'TEXT' as const
                }));

                props.onLoad?.({
                    currentTime: contentInfo.metadata.startPosition || 0,
                    duration: castProgress.duration || 0,
                    availableAudioTracks: audioTracks,
                    availableVideoTracks: [], // Cast generalmente no expone tracks de video
                    availableTextTracks: textTracks
                });
            },
            onContentLoadError: (error: string) => {
                props.onError?.({
                    message: error,
                    isRecoverable: true
                });
            },
            onPlaybackStarted: () => {
                setIsBuffering(false);
                props.onReady?.();
            },
            onPlaybackEnded: () => {
                props.onEnd?.();
            }
        };

        const castManager = useCastManager(castManagerCallbacks);

        // Monitor Cast state changes
        useCastMonitor({
            onConnect: () => console.log('[CastAdapter] Connected'),
            onDisconnect: () => console.log('[CastAdapter] Disconnected'),
            onError: (error) => props.onError?.({
                message: error.errorMessage || 'Cast error',
                code: error.errorCode || undefined,
                isRecoverable: true
            }),
            onAudioTrackChange: (track) => {
                const trackInfo = track ? {
                    id: track.id,
                    name: track.name,
                    language: track.language,
                    type: 'AUDIO' as const
                } : null;
                props.onAudioTrackChanged?.(trackInfo);
            },
            onTextTrackChange: (track) => {
                const trackInfo = track ? {
                    id: track.id,
                    name: track.name,
                    language: track.language,
                    type: 'TEXT' as const
                } : null;
                props.onTextTrackChanged?.(trackInfo);
            }
        });

        // Sync progress
        useEffect(() => {
            if (castConnected && castProgress.currentTime >= 0) {
                props.onProgress?.({
                    currentTime: castProgress.currentTime,
                    playableDuration: castProgress.duration || 0,
                    seekableDuration: castProgress.duration || 0
                });
            }
        }, [castProgress.currentTime, castProgress.duration, castConnected]);

        useImperativeHandle(ref, (): PlayerAdapter => ({
            // Estado básico
            isConnected: castConnected,
            isPlaying: castPlaying,
            isPaused: !castPlaying,
            isMuted: castVolume.isMuted,
            currentTime: castProgress.currentTime,
            duration: castProgress.duration,
            isBuffering,
            volume: castVolume.level,
            speedRate, // Cast normalmente siempre es 1

            // Estado de tracks
            currentAudioTrack: castTracks.audioTrack ? {
                id: castTracks.audioTrack.id,
                name: castTracks.audioTrack.name,
                language: castTracks.audioTrack.language,
                type: 'AUDIO'
            } : null,
            currentVideoTrack: null, // Cast generalmente no expone video tracks
            currentTextTrack: castTracks.textTrack ? {
                id: castTracks.textTrack.id,
                name: castTracks.textTrack.name,
                language: castTracks.textTrack.language,
                type: 'TEXT'
            } : null,
            availableAudioTracks: castTracks.availableAudioTracks.map(track => ({
                id: track.id,
                name: track.name,
                language: track.language,
                type: 'AUDIO' as const
            })),
            availableVideoTracks: [], // Cast generalmente no expone video tracks
            availableTextTracks: castTracks.availableTextTracks.map(track => ({
                id: track.id,
                name: track.name,
                language: track.language,
                type: 'TEXT' as const
            })),

            // Estado de calidad
            maxBitrate,
            currentBitrate: null, // Cast generalmente no expone bitrate actual
            isFullscreen,
            resizeMode,

            // Métodos de control básico
            async loadContent(contentInfo: PlayerContentInfo): Promise<boolean> {
                // Verificar si ya está cargado
                if (castMedia.url === contentInfo.source.uri && !castMedia.isIdle) {
                    return true;
                }

                setIsBuffering(true);

                // Convertir a CastContentInfo
                const castContentInfo: CastContentInfo = {
                    source: { uri: contentInfo.source.uri },
                    manifest: contentInfo.manifest || {},
                    drm: contentInfo.drm,
                    youbora: contentInfo.youbora,
                    metadata: {
                        id: contentInfo.metadata.id,
                        title: contentInfo.metadata.title,
                        subtitle: contentInfo.metadata.subtitle,
                        description: contentInfo.metadata.description,
                        poster: contentInfo.metadata.poster,
                        squaredPoster: contentInfo.metadata.squaredPoster,
                        isLive: contentInfo.metadata.isLive || false,
                        isDVR: contentInfo.metadata.isDVR || false,
                        startPosition: contentInfo.metadata.startPosition || 0
                    }
                };

                const success = await castManager.loadContent(castContentInfo);
                if (!success) setIsBuffering(false);
                return success;
            },

            async play(): Promise<boolean> {
                return await castManager.play();
            },

            async pause(): Promise<boolean> {
                return await castManager.pause();
            },

            async seek(position: number): Promise<boolean> {
                return await castManager.seek(position);
            },

            async stop(): Promise<boolean> {
                return await castManager.stop();
            },

            async mute(): Promise<boolean> {
                return await castManager.mute();
            },

            async unmute(): Promise<boolean> {
                return await castManager.unmute();
            },

            async setVolume(level: number): Promise<boolean> {
                return await castManager.setVolume(level);
            },

            // Métodos de tracks
            async setAudioTrack(trackId: number): Promise<boolean> {
                return await castManager.setAudioTrack(trackId);
            },

            async setVideoTrack(trackId: number): Promise<boolean> {
                // Cast generalmente no soporta cambio de video track
                console.warn('[CastAdapter] Video track switching not supported');
                return false;
            },

            async setTextTrack(trackId: number): Promise<boolean> {
                return await castManager.setSubtitleTrack(trackId);
            },

            async disableTextTrack(): Promise<boolean> {
                return await castManager.disableSubtitles();
            },

            // Métodos de reproducción avanzada
            async setSpeedRate(rate: number): Promise<boolean> {
                // Cast generalmente no soporta speed rate
                console.warn('[CastAdapter] Speed rate not supported in Cast');
                return false;
            },

            async setMaxBitrate(bitrate: number | null): Promise<boolean> {
                setMaxBitrate(bitrate);
                // Cast generalmente no permite control manual de bitrate
                console.warn('[CastAdapter] Manual bitrate control not supported in Cast');
                return false;
            },

            async setResizeMode(mode: 'contain' | 'cover' | 'stretch' | 'center'): Promise<boolean> {
                setResizeMode(mode);
                // Cast generalmente no permite control de resize mode
                return false;
            },

            async toggleFullscreen(): Promise<boolean> {
                const newFullscreenState = !isFullscreen;
                setIsFullscreen(newFullscreenState);
                props.onFullscreenChanged?.(newFullscreenState);
                // En Cast, fullscreen se maneja en el receptor
                return true;
            },

            // Métodos de calidad
            async enableAutoBitrate(): Promise<boolean> {
                // Cast siempre usa bitrate automático
                return true;
            },

            async disableAutoBitrate(): Promise<boolean> {
                // Cast generalmente no permite deshabilitar bitrate automático
                return false;
            },

            async setPreferredAudioLanguage(language: string): Promise<boolean> {
                const preferredTrack = castTracks.availableAudioTracks.find(track => 
                    track.language === language
                );
                
                if (preferredTrack) {
                    return await castManager.setAudioTrack(preferredTrack.id);
                }
                return false;
            },

            async setPreferredTextLanguage(language: string): Promise<boolean> {
                const preferredTrack = castTracks.availableTextTracks.find(track => 
                    track.language === language
                );
                
                if (preferredTrack) {
                    return await castManager.setSubtitleTrack(preferredTrack.id);
                }
                return false;
            },

            // Eventos
            onLoad: props.onLoad,
            onProgress: props.onProgress,
            onEnd: props.onEnd,
            onError: props.onError,
            onReady: props.onReady,
            onBuffer: props.onBuffer,
            onAudioTrackChanged: props.onAudioTrackChanged,
            onVideoTrackChanged: props.onVideoTrackChanged,
            onTextTrackChanged: props.onTextTrackChanged,
            onBitrateChanged: props.onBitrateChanged,
            onFullscreenChanged: props.onFullscreenChanged,
            onSpeedRateChanged: props.onSpeedRateChanged,

            // Ciclo de vida
            initialize() {
                console.log('[CastAdapter] Initialize');
            },

            destroy() {
                console.log('[CastAdapter] Destroy');
            },

            reset() {
                setIsBuffering(false);
                setSpeedRate(1);
                setMaxBitrate(null);
                setIsFullscreen(false);
                setResizeMode('contain');
            }
        }));

        return null; // Cast no renderiza nada
    }
);
