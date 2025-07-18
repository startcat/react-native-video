/*
 *  Hook personalizado para integrar los eventos del Video con PlayerAnalyticsEvents
 *
 */

import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import type { ReactVideoEvents } from '../../../../types';

import {
    PlayerAnalyticsEvents,
    type PlayerAnalyticsPlugin
} from '../../../features/analytics';

import { VideoEventsAdapter } from '../VideoEventsAdapter';

import type {
    OnAudioTracksData,
    OnBandwidthUpdateData,
    OnBufferData,
    OnExternalPlaybackChangeData,
    OnLoadStartData,
    OnPlaybackRateChangeData,
    OnPlaybackStateChangedData,
    OnProgressData,
    OnSeekData,
    OnTimedMetadataData,
    OnVideoAspectRatioData,
    OnVideoErrorData,
    OnVideoTracksData,
    OnVolumeChangeData
} from '../../../../specs/VideoNativeComponent';

import type {
    OnLoadData,
    OnReceiveAdEventData,
    OnTextTracksData
} from '../../../../types/events';

interface UseVideoAnalyticsProps {
    plugins?: PlayerAnalyticsPlugin[];
}

interface UseVideoAnalyticsReturn {
    // Eventos para conectar con el componente Video
    videoEvents: ReactVideoEvents;
    
    // Métodos para control manual
    analyticsEvents: PlayerAnalyticsEvents;
    adapter: VideoEventsAdapter;
    
    // Utilidades
    getCurrentPosition: () => number;
    getDuration: () => number;
    isPlaying: () => boolean;
    isBuffering: () => boolean;
    isSeekInProgress: () => boolean;
    getSeekFromPosition: () => number | undefined;
    getSeekToPosition: () => number | undefined;
}

export const useVideoAnalytics = ({
    plugins = []
}: UseVideoAnalyticsProps = {}): UseVideoAnalyticsReturn => {
    
    const analyticsEventsRef = useRef<PlayerAnalyticsEvents>();
    const adapterRef = useRef<VideoEventsAdapter>();
    const appStateRef = useRef<string>(AppState.currentState);

    // Inicializar PlayerAnalyticsEvents
    if (!analyticsEventsRef.current) {
        analyticsEventsRef.current = new PlayerAnalyticsEvents();
    }

    // Inicializar VideoEventsAdapter
    if (!adapterRef.current && analyticsEventsRef.current) {
        adapterRef.current = new VideoEventsAdapter(analyticsEventsRef.current);
    }

    // Configurar plugins
    useEffect(() => {
        if (!analyticsEventsRef.current) return;

        // Limpiar plugins existentes
        const existingPlugins = analyticsEventsRef.current.getPlugins();
        existingPlugins.forEach((plugin: PlayerAnalyticsPlugin) => {
            analyticsEventsRef.current!.removePlugin(plugin.name);
        });

        // Agregar nuevos plugins
        plugins.forEach((plugin: PlayerAnalyticsPlugin) => {
            analyticsEventsRef.current!.addPlugin(plugin);
        });

        return () => {
            // Cleanup al desmontar
            if (analyticsEventsRef.current) {
                analyticsEventsRef.current.destroy();
            }
        };
    }, [plugins]);

    // Manejar cambios de estado de la aplicación
    useEffect(() => {
        if (!adapterRef.current) return;

        const handleAppStateChange = (nextAppState: string) => {
            if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
                adapterRef.current!.onApplicationForeground();
                adapterRef.current!.onApplicationActive();
            } else if (appStateRef.current === 'active' && nextAppState.match(/inactive|background/)) {
                adapterRef.current!.onApplicationInactive();
                adapterRef.current!.onApplicationBackground();
            }
            appStateRef.current = nextAppState;
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);
        
        return () => {
            subscription?.remove();
        };
    }, []);

    // Crear los eventos del video usando useCallback para evitar re-renders
    const videoEvents: ReactVideoEvents = {
        onLoadStart: useCallback((e: OnLoadStartData) => {
            if (adapterRef.current) {
                adapterRef.current.onLoadStart(e);
            }
        }, []),

        onLoad: useCallback((e: OnLoadData) => {
            if (adapterRef.current) {
                adapterRef.current.onLoad(e);
            }
        }, []),

        onProgress: useCallback((e: OnProgressData) => {
            if (adapterRef.current) {
                adapterRef.current.onProgress(e);
            }
        }, []),

        onPlaybackStateChanged: useCallback((e: OnPlaybackStateChangedData) => {
            if (adapterRef.current) {
                adapterRef.current.onPlaybackStateChanged(e);
            }
        }, []),

        onBuffer: useCallback((e: OnBufferData) => {
            if (adapterRef.current) {
                adapterRef.current.onBuffer(e);
            }
        }, []),

        onSeek: useCallback((e: OnSeekData) => {
            if (adapterRef.current) {
                adapterRef.current.onSeek(e);
            }
        }, []),

        onPlaybackRateChange: useCallback((e: OnPlaybackRateChangeData) => {
            if (adapterRef.current) {
                adapterRef.current.onPlaybackRateChange(e);
            }
        }, []),

        onVolumeChange: useCallback((e: OnVolumeChangeData) => {
            if (adapterRef.current) {
                adapterRef.current.onVolumeChange(e);
            }
        }, []),

        onEnd: useCallback(() => {
            if (adapterRef.current) {
                adapterRef.current.onEnd();
            }
        }, []),

        onError: useCallback((e: OnVideoErrorData) => {
            if (adapterRef.current) {
                adapterRef.current.onError(e);
            }
        }, []),

        onReceiveAdEvent: useCallback((e: OnReceiveAdEventData) => {
            if (adapterRef.current) {
                adapterRef.current.onReceiveAdEvent(e);
            }
        }, []),

        onAudioTracks: useCallback((e: OnAudioTracksData) => {
            if (adapterRef.current) {
                adapterRef.current.onAudioTracks(e);
            }
        }, []),

        onTextTracks: useCallback((e: OnTextTracksData) => {
            if (adapterRef.current) {
                adapterRef.current.onTextTracks(e);
            }
        }, []),

        onVideoTracks: useCallback((e: OnVideoTracksData) => {
            if (adapterRef.current) {
                adapterRef.current.onVideoTracks(e);
            }
        }, []),

        onBandwidthUpdate: useCallback((e: OnBandwidthUpdateData) => {
            if (adapterRef.current) {
                adapterRef.current.onBandwidthUpdate(e);
            }
        }, []),

        onAspectRatio: useCallback((e: OnVideoAspectRatioData) => {
            if (adapterRef.current) {
                adapterRef.current.onAspectRatio(e);
            }
        }, []),

        onTimedMetadata: useCallback((e: OnTimedMetadataData) => {
            if (adapterRef.current) {
                adapterRef.current.onTimedMetadata(e);
            }
        }, []),

        onReadyForDisplay: useCallback(() => {
            if (adapterRef.current) {
                adapterRef.current.onReadyForDisplay();
            }
        }, []),

        // Eventos adicionales que pueden ser útiles
        onAudioBecomingNoisy: useCallback(() => {
            if (analyticsEventsRef.current) {
                analyticsEventsRef.current.onPause();
            }
        }, []),

        onIdle: useCallback(() => {
            if (analyticsEventsRef.current) {
                analyticsEventsRef.current.onPause();
            }
        }, []),

        onExternalPlaybackChange: useCallback((e: OnExternalPlaybackChangeData) => {
            // Manejar cambios en la reproducción externa (AirPlay, Chromecast, etc.)
            console.log('[useVideoAnalytics] External playback change:', e);
        }, []),

        onFullscreenPlayerWillPresent: useCallback(() => {
            console.log('[useVideoAnalytics] Fullscreen will present');
        }, []),

        onFullscreenPlayerDidPresent: useCallback(() => {
            console.log('[useVideoAnalytics] Fullscreen did present');
        }, []),

        onFullscreenPlayerWillDismiss: useCallback(() => {
            console.log('[useVideoAnalytics] Fullscreen will dismiss');
        }, []),

        onFullscreenPlayerDidDismiss: useCallback(() => {
            console.log('[useVideoAnalytics] Fullscreen did dismiss');
        }, []),
    };

    // Métodos de utilidad
    const getCurrentPosition = useCallback(() => {
        return adapterRef.current?.getCurrentPosition() || 0;
    }, []);

    const getDuration = useCallback(() => {
        return adapterRef.current?.getDuration() || 0;
    }, []);

    const isPlaying = useCallback(() => {
        return adapterRef.current?.getIsPlaying() || false;
    }, []);

    const isBuffering = useCallback(() => {
        return adapterRef.current?.getIsBuffering() || false;
    }, []);

    const isSeekInProgress = useCallback(() => {
        return adapterRef.current?.getIsSeekInProgress() || false;
    }, []);

    const getSeekFromPosition = useCallback(() => {
        return adapterRef.current?.getSeekFromPosition();
    }, []);

    const getSeekToPosition = useCallback(() => {
        return adapterRef.current?.getSeekToPosition();
    }, []);

    return {
        videoEvents,
        analyticsEvents: analyticsEventsRef.current!,
        adapter: adapterRef.current!,
        getCurrentPosition,
        getDuration,
        isPlaying,
        isBuffering,
        isSeekInProgress,
        getSeekFromPosition,
        getSeekToPosition
    };
};