import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { type OnBufferData, type OnLoadData, type OnProgressData } from '../../../types';
import Video, { type VideoRef } from '../../../Video';
import {
    type PlayerAdapter,
    type PlayerContentInfo,
    type TrackInfo
} from '../types';
import { type ReactNativeVideoAdapterProps, type ReactNativeVideoAdapterRef } from './types';

export const ReactNativeVideoAdapter = forwardRef<ReactNativeVideoAdapterRef, ReactNativeVideoAdapterProps>(
    (props: ReactNativeVideoAdapterProps, ref: React.Ref<ReactNativeVideoAdapterRef>) => {
        const videoRef = useRef<VideoRef>(null);
        
        // Estados básicos
        const [isPlaying, setIsPlaying] = useState(false);
        const [isPaused, setIsPaused] = useState(props.paused || false);
        const [isMuted, setIsMuted] = useState(props.muted || false);
        const [currentTime, setCurrentTime] = useState(0);
        const [duration, setDuration] = useState<number | null>(null);
        const [isBuffering, setIsBuffering] = useState(false);
        const [volume, setVolumeState] = useState(props.volume || 1);
        const [speedRate, setSpeedRateState] = useState(props.rate || 1);
        
        // Estados de tracks
        const [currentAudioTrack, setCurrentAudioTrack] = useState<TrackInfo | null>(null);
        const [currentVideoTrack, setCurrentVideoTrack] = useState<TrackInfo | null>(null);
        const [currentTextTrack, setCurrentTextTrack] = useState<TrackInfo | null>(null);
        const [availableAudioTracks, setAvailableAudioTracks] = useState<TrackInfo[]>([]);
        const [availableVideoTracks, setAvailableVideoTracks] = useState<TrackInfo[]>([]);
        const [availableTextTracks, setAvailableTextTracks] = useState<TrackInfo[]>([]);
        
        // Estados de calidad
        const [maxBitrate, setMaxBitrateState] = useState<number | null>(props.maxBitrate || null);
        const [currentBitrate, setCurrentBitrate] = useState<number | null>(null);
        const [isFullscreen, setIsFullscreen] = useState(false);
        const [resizeMode, setResizeModeState] = useState(props.resizeMode || 'contain');

        useImperativeHandle(ref, (): PlayerAdapter => ({
            // Estado básico
            isConnected: true,
            isPlaying,
            isPaused,
            isMuted,
            currentTime,
            duration,
            isBuffering,
            volume,
            speedRate,

            // Estado de tracks
            currentAudioTrack,
            currentVideoTrack,
            currentTextTrack,
            availableAudioTracks,
            availableVideoTracks,
            availableTextTracks,

            // Estado de calidad
            maxBitrate,
            currentBitrate,
            isFullscreen,
            resizeMode,

            // Métodos de control básico
            async loadContent(contentInfo: PlayerContentInfo): Promise<boolean> {
                // El contenido se carga automáticamente cuando cambia la prop
                return true;
            },

            async play(): Promise<boolean> {
                videoRef.current?.resume();
                setIsPlaying(true);
                setIsPaused(false);
                return true;
            },

            async pause(): Promise<boolean> {
                videoRef.current?.pause();
                setIsPlaying(false);
                setIsPaused(true);
                return true;
            },

            async seek(position: number): Promise<boolean> {
                videoRef.current?.seek(position);
                return true;
            },

            async stop(): Promise<boolean> {
                videoRef.current?.pause();
                setIsPlaying(false);
                setIsPaused(true);
                return true;
            },

            async mute(): Promise<boolean> {
                setIsMuted(true);
                return true;
            },

            async unmute(): Promise<boolean> {
                setIsMuted(false);
                return true;
            },

            async setVolume(level: number): Promise<boolean> {
                const clampedLevel = Math.max(0, Math.min(1, level));
                setVolumeState(clampedLevel);
                return true;
            },

            // Métodos de tracks
            async setAudioTrack(trackId: number): Promise<boolean> {
                try {
                    videoRef.current?.setSelectedAudioTrack(trackId);
                    const track = availableAudioTracks.find((t: TrackInfo) => t.id === trackId) || null;
                    setCurrentAudioTrack(track);
                    props.onAudioTrackChanged?.(track);
                    return true;
                } catch (error) {
                    return false;
                }
            },

            async setVideoTrack(trackId: number): Promise<boolean> {
                try {
                    videoRef.current?.setSelectedVideoTrack(trackId);
                    const track = availableVideoTracks.find((t: TrackInfo) => t.id === trackId) || null;
                    setCurrentVideoTrack(track);
                    props.onVideoTrackChanged?.(track);
                    return true;
                } catch (error) {
                    return false;
                }
            },

            async setTextTrack(trackId: number): Promise<boolean> {
                try {
                    videoRef.current?.setSelectedTextTrack(trackId);
                    const track = availableTextTracks.find((t: TrackInfo) => t.id === trackId) || null;
                    setCurrentTextTrack(track);
                    props.onTextTrackChanged?.(track);
                    return true;
                } catch (error) {
                    return false;
                }
            },

            async disableTextTrack(): Promise<boolean> {
                try {
                    videoRef.current?.setSelectedTextTrack(-1);
                    setCurrentTextTrack(null);
                    props.onTextTrackChanged?.(null);
                    return true;
                } catch (error) {
                    return false;
                }
            },

            // Métodos de reproducción avanzada
            async setSpeedRate(rate: number): Promise<boolean> {
                const clampedRate = Math.max(0.25, Math.min(4.0, rate));
                setSpeedRateState(clampedRate);
                props.onSpeedRateChanged?.(clampedRate);
                return true;
            },

            async setMaxBitrate(bitrate: number | null): Promise<boolean> {
                setMaxBitrateState(bitrate);
                // En react-native-video esto se haría con maxBitRate prop
                return true;
            },

            async setResizeMode(mode: 'contain' | 'cover' | 'stretch' | 'center'): Promise<boolean> {
                setResizeModeState(mode);
                return true;
            },

            async toggleFullscreen(): Promise<boolean> {
                const newFullscreenState = !isFullscreen;
                setIsFullscreen(newFullscreenState);
                props.onFullscreenChanged?.(newFullscreenState);
                return true;
            },

            // Métodos de calidad
            async enableAutoBitrate(): Promise<boolean> {
                setMaxBitrateState(null);
                return true;
            },

            async disableAutoBitrate(): Promise<boolean> {
                // Mantener el bitrate actual como máximo
                if (currentBitrate) {
                    setMaxBitrateState(currentBitrate);
                }
                return true;
            },

            async setPreferredAudioLanguage(language: string): Promise<boolean> {
                // Encontrar track con el idioma preferido
                const preferredTrack = availableAudioTracks.find((track: TrackInfo) => 
                    track.language === language
                );
                
                if (preferredTrack) {
                    return this.setAudioTrack(preferredTrack.id);
                }
                return false;
            },

            async setPreferredTextLanguage(language: string): Promise<boolean> {
                // Encontrar track con el idioma preferido
                const preferredTrack = availableTextTracks.find((track: TrackInfo) => 
                    track.language === language
                );
                
                if (preferredTrack) {
                    return this.setTextTrack(preferredTrack.id);
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
                console.log('[ReactNativeVideoAdapter] Initialize');
            },

            destroy() {
                console.log('[ReactNativeVideoAdapter] Destroy');
            },

            reset() {
                setCurrentTime(0);
                setDuration(null);
                setIsPlaying(false);
                setIsPaused(true);
                setIsBuffering(false);
                setCurrentAudioTrack(null);
                setCurrentVideoTrack(null);
                setCurrentTextTrack(null);
                setAvailableAudioTracks([]);
                setAvailableVideoTracks([]);
                setAvailableTextTracks([]);
            }
        }));

        // Eventos del Video
        const handleLoad = (e: OnLoadData & { audioTracks?: any[], videoTracks?: any[], textTracks?: any[] }) => {
            setDuration(e.duration);
            setCurrentTime(e.currentTime || 0);
            
            // Procesar tracks disponibles
            const audioTracks: TrackInfo[] = (e.audioTracks || []).map((track: any, index: number) => ({
                id: track.id || index,
                name: track.title || track.name || `Audio ${index + 1}`,
                language: track.language,
                type: 'AUDIO' as const,
                bitrate: track.bitrate,
                codecs: track.codecs
            }));
            
            const videoTracks: TrackInfo[] = (e.videoTracks || []).map((track: any, index: number) => ({
                id: track.id || index,
                name: track.title || track.name || `Video ${index + 1}`,
                language: track.language,
                type: 'VIDEO' as const,
                bitrate: track.bitrate,
                width: track.width,
                height: track.height,
                frameRate: track.frameRate,
                codecs: track.codecs
            }));
            
            const textTracks: TrackInfo[] = (e.textTracks || []).map((track: any, index: number) => ({
                id: track.id || index,
                name: track.title || track.name || `Subtitle ${index + 1}`,
                language: track.language,
                type: 'TEXT' as const
            }));
            
            setAvailableAudioTracks(audioTracks);
            setAvailableVideoTracks(videoTracks);
            setAvailableTextTracks(textTracks);
            
            // Establecer tracks por defecto
            if (audioTracks.length > 0) setCurrentAudioTrack(audioTracks[0]);
            if (videoTracks.length > 0) setCurrentVideoTrack(videoTracks[0]);
            
            props.onLoad?.({
                currentTime: e.currentTime || 0,
                duration: e.duration,
                availableAudioTracks: audioTracks,
                availableVideoTracks: videoTracks,
                availableTextTracks: textTracks
            });
        };

        const handleProgress = (e: OnProgressData & { currentBitrate?: number }) => {
            setCurrentTime(e.currentTime);
            
            // Actualizar bitrate actual
            if (e.currentBitrate && e.currentBitrate !== currentBitrate) {
                setCurrentBitrate(e.currentBitrate);
                props.onBitrateChanged?.(e.currentBitrate);
            }
            
            props.onProgress?.({
                currentTime: e.currentTime,
                playableDuration: e.playableDuration,
                seekableDuration: e.seekableDuration,
                currentBitrate: e.currentBitrate
            });
        };

        const handleBuffer = (e: OnBufferData) => {
            setIsBuffering(!!e?.isBuffering);
            props.onBuffer?.(!!e?.isBuffering);
        };

        const handleReady = () => {
            setIsBuffering(false);
            props.onReady?.();
        };

        const handleError = (e: any) => {
            props.onError?.({
                code: e.error?.code,
                message: e.error?.message || 'Video playback error',
                details: e.error,
                isRecoverable: e.error?.isRecoverable
            });
        };

        return props.contentInfo?.source ? (
            <Video
                ref={videoRef}
                style={{ flex: 1 }}
                source={{
                    uri: props.contentInfo.source.uri,
                    type: props.contentInfo.source.type,
                    headers: props.contentInfo.source.headers,
                    metadata: props.contentInfo.source.metadata
                }}
                drm={props.contentInfo.drm}
                youbora={props.contentInfo.youbora}
                
                // Configuración básica
                playOffline={props.playOffline}
                multiSession={props.multiSession}
                allowsExternalPlayback={props.allowsExternalPlayback}
                playInBackground={props.playInBackground}
                playWhenInactive={props.playWhenInactive}
                allowsPictureInPicture={props.allowsPictureInPicture}

                // Control de reproducción
                muted={isMuted}
                paused={isPaused}
                rate={speedRate}
                volume={volume}
                resizeMode={resizeMode}
                
                // Configuración de calidad
                maxBitRate={maxBitrate}
                
                // UI
                controls={false}
                focusable={false}
                hideShutterView={true}
                ignoreSilentSwitch='ignore'
                showNotificationControls={true}
                minLoadRetryCount={3}
                poster={props.contentInfo.metadata.poster}
                preventsDisplaySleepDuringVideoPlayback={false}
                progressUpdateInterval={1000}

                // Debug y buffer
                debug={{ enable: true, thread: true }}
                disableDisconnectError={true}
                bufferConfig={props.contentInfo.config?.bufferConfig || {
                    minBufferMs: 15000,
                    maxBufferMs: 50000,
                    bufferForPlaybackMs: 2500,
                    bufferForPlaybackAfterRebufferMs: 5000,
                    backBufferDurationMs: 120000,
                    cacheSizeMB: 50,
                    live: { targetOffsetMs: 25000 },
                }}

                // Eventos
                onLoad={handleLoad}
                onProgress={handleProgress}
                onEnd={props.onEnd}
                onReadyForDisplay={handleReady}
                onBuffer={handleBuffer}
                onError={handleError}
            />
        ) : null;
    }
);