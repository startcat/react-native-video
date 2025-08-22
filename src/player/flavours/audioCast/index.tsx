import React, { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EventRegister } from 'react-native-event-listeners';
import Animated, { useSharedValue } from 'react-native-reanimated';
import {
    type AudioControlsProps,
    type IPlayerProgress,
    type SliderValues,
} from '../../../types';

import {
    useCastConnected,
    useCastManager,
    useCastMedia,
    useCastMonitor,
    useCastPlaying,
    useCastProgress,
    useCastVolume
} from '../../features/cast/hooks';

import { type CastContentInfo } from '../../features/cast/types/types';

import {
    useIsBuffering
} from '../../core/buffering';

import {
    type onSourceChangedProps,
    SourceClass
} from '../../modules/source';

import {
    TudumClass
} from '../../modules/tudum';

import {
    type ModeChangeData,
    type ProgramChangeData,
    DVRProgressManagerClass,
    VODProgressManagerClass,
} from '../../core/progress';

import { ComponentLogger } from '../../features/logger';

import { styles } from '../styles';

import {
    type AudioFlavourProps,
    type AudioPlayerActionEventProps,
    type ICommonData,
    type IDrm,
    type IMappedYoubora,
    CONTROL_ACTION,
    ProgressUpdateData,
    YOUBORA_FORMAT,
} from '../../types';

export function AudioCastFlavour(props: AudioFlavourProps): React.ReactElement {

    const currentLogger = useRef<ComponentLogger | null>(null);

    const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
    const [isLoadingContent, setIsLoadingContent] = useState<boolean>(false);
    const [hasTriedLoading, setHasTriedLoading] = useState<boolean>(false);
    const audioPlayerHeight = useSharedValue(0);

    const youboraForVideo = useRef<IMappedYoubora>();
    const drm = useRef<IDrm>();
    const isChangingSource = useRef<boolean>(true);

    // USAR HOOKS PERSONALIZADOS en lugar de los nativos
    const castConnected = useCastConnected();
    const castMedia = useCastMedia();
    const castPlaying = useCastPlaying();
    const castProgress = useCastProgress();
    const castVolume = useCastVolume();

    // Logger
    if (!currentLogger.current && props.playerContext?.logger){
        currentLogger.current = props.playerContext?.logger?.forComponent('Audio Cast Flavour', props.logger?.core?.enabled, props.logger?.core?.level);
    }

    const onContentLoadedCallback = useCallback((content: CastContentInfo) => {
        console.log(`[Player] (Audio Cast Flavour) Cast Manager - Content loaded:`, content.source.uri);
        setIsLoadingContent(false);
        isChangingSource.current = false;
        setIsContentLoaded(true);
        setHasTriedLoading(true);
        
        setTimeout(() => {
            if (castProgress.duration && castProgress.duration > 0) {
                const duration = castProgress.duration;
                console.log(`[Player] (Audio Cast Flavour) onContentLoadedCallback - calling onLoad with duration: ${duration}`);
                onLoadRef.current?.({
                    currentTime: content.metadata.startPosition || 0,
                    duration: duration
                });
            }
        }, 100);
    }, [castProgress.duration]);

    const onContentLoadErrorCallback = useCallback((error: string, content: CastContentInfo) => {
        console.log(`[Player] (Audio Cast Flavour) Cast Manager - Content load error:`, error);
        setIsLoadingContent(false);
        // setHasTriedLoading(false);
        onErrorRef.current?.({ message: error });
    }, []);

    const onPlaybackStartedCallback = useCallback(() => {
        console.log(`[Player] (Audio Cast Flavour) Cast Manager - 🎬 onPlaybackStarted`);
        setPaused(false);
        setBuffering(false);
    }, []);

    const onPlaybackEndedCallback = useCallback(() => {
        console.log(`[Player] (Audio Cast Flavour) Cast Manager - Playback ended`);
        onEndRef.current?.();
    }, []);

    const onSeekCompletedCallback = useCallback((position: number) => {
        console.log(`[Player] (Audio Cast Flavour) Cast Manager - Seek completed:`, position);
        setCurrentTime(position);
    }, []);

    const onVolumeChangedCallback = useCallback((level: number, isMuted: boolean) => {
        console.log(`[Player] (Audio Cast Flavour) Cast Manager - Volume changed:`, { level, isMuted });
        setMuted(isMuted);
    }, []);

    // MEMORIZAR CONFIG también
    const castManagerConfig = useMemo(() => ({
        enableYoubora: true,
        enableAds: true,
        defaultStartPosition: 0,
        debugMode: true
    }), []);

    // MEMORIZAR CALLBACKS OBJECT
    const castManagerCallbacks = useMemo(() => ({
        onContentLoaded: onContentLoadedCallback,
        onContentLoadError: onContentLoadErrorCallback,
        onPlaybackStarted: onPlaybackStartedCallback,
        onPlaybackEnded: onPlaybackEndedCallback,
        onSeekCompleted: onSeekCompletedCallback,
        onVolumeChanged: onVolumeChangedCallback
    }), [
        onContentLoadedCallback,
        onContentLoadErrorCallback,
        onPlaybackStartedCallback,
        onPlaybackEndedCallback,
        onSeekCompletedCallback,
        onVolumeChangedCallback
    ]);

    // USAR CAST MANAGER para todas las acciones
    const castManager = useCastManager(castManagerCallbacks, castManagerConfig);

    // Refs para evitar dependencias en useCallbacks
    const castManagerRef = useRef(castManager);

    useEffect(() => {
        castManagerRef.current = castManager;
    }, [castManager]);

    // Estados derivados del Cast
    const [currentTime, setCurrentTime] = useState<number>(castProgress.currentTime || 0);
    const [paused, setPaused] = useState<boolean>(!castPlaying);
    const [muted, setMuted] = useState<boolean>(castVolume.isMuted);
    const [buffering, setBuffering] = useState<boolean>(false);

    const sliderValues = useRef<SliderValues>();
    const playerProgressRef = useRef<IPlayerProgress>();
    const [sliderValuesUpdate, setSliderValuesUpdate] = useState<number>(0);

    // Source
    const sourceRef = useRef<SourceClass | null>(null);

    // Tudum
    const tudumRef = useRef<TudumClass | null>(null);

    // VOD Progress Manager
    const vodProgressManagerRef = useRef<VODProgressManagerClass | null>(null);

    // DVR Progress Manager
    const dvrProgressManagerRef = useRef<DVRProgressManagerClass | null>(null);

    // Control para evitar mezcla de sources
    const currentSourceType = useRef<'tudum' | 'content' | null>(null);
    const pendingContentSource = useRef<onSourceChangedProps | null>(null);

    // CREATE REFS FOR MAIN CALLBACKS to avoid circular dependencies
    const onLoadRef = useRef<(e: { currentTime: number; duration: number }) => void>();
    const onEndRef = useRef<() => void>();
    const onErrorRef = useRef<(e: any) => void>();

    // Hook para el estado de buffering
    const isBuffering = useIsBuffering({
        buffering: buffering || isLoadingContent,
        paused: paused,
        onBufferingChange: props.events?.onBuffering
    });

    useCastMonitor({
        onConnect: () => {
            console.log(`[Player] (Audio Cast Flavour) Cast connected`);
            setHasTriedLoading(false);
        },
        onDisconnect: () => {
            console.log(`[Player] (Audio Cast Flavour) Cast notConnected`);
            setIsContentLoaded(false);
            setIsLoadingContent(false);
            setHasTriedLoading(false);
        },
        onPlay: () => {
            console.log(`[Player] (Audio Cast Flavour) Cast started playing`);
            setPaused(false);
            setBuffering(false);
        },
        onPause: () => {
            console.log(`[Player] (Audio Cast Flavour) Cast paused`);
            setPaused(true);
        },
        onError: (error) => {
            console.log(`[Player] (Audio Cast Flavour) Cast error:`, error);
            setIsLoadingContent(false);
            setHasTriedLoading(false);
            onError({ message: error.errorMessage || 'Cast error' });
        }
    });

    useEffect(() => {
        if (castConnected && castProgress?.duration && castProgress?.duration > 0 && currentSourceType.current === 'content' && 
            !sourceRef.current?.isLive && !sourceRef.current?.isDVR) {
            
            console.log(`[Player] (Audio Cast Flavour) Updating sliderValues duration from Cast: ${castProgress.duration}s`);

            // Si sliderValues existe pero tiene duration 0, actualizarlo
            if (sliderValues.current && sliderValues.current.duration === 0) {
                console.log(`[Player] (Audio Cast Flavour) Updating sliderValues duration from Cast: ${castProgress.duration}s`);
                
                sliderValues.current = {
                    ...sliderValues.current,
                    duration: castProgress.duration
                };
                
                // Trigger re-render
                setSliderValuesUpdate((prev: number) => prev + 1);
            }
        }
    }, [castProgress.duration, castConnected]);

    // Detectar cuando el contenido termina usando cambios en el estado
    useEffect(() => {
        if (castMedia.isIdle && isContentLoaded && currentSourceType.current) {
            console.log(`[Player] (Audio Cast Flavour) Cast content ended`);
            onEnd();
        }
    }, [castMedia.isIdle, isContentLoaded]);

    // useEffect para cargar contenido cuando Cast esté listo
    useEffect(() => {
        // console.log(`[Player] (Audio Cast Flavour) Cast ready useEffect - State check:`, {
        //     castConnected,
        //     sourceReady: sourceRef.current?.isReady,
        //     currentSourceType: currentSourceType.current,
        //     isContentLoaded,
        //     isLoadingContent,
        //     hasTriedLoading,
        // });
        
        if (castConnected && 
            sourceRef.current?.isReady && 
            currentSourceType.current === 'content' && 
            !isContentLoaded && 
            !isLoadingContent &&
            !hasTriedLoading) {
            
            // console.log(`[Player] (Audio Cast Flavour) Cast ready - Loading content automatically`);
            setHasTriedLoading(true);
            
            const sourceData: onSourceChangedProps = {
                id: props.playerMetadata?.id,
                source: sourceRef.current.playerSource,
                drm: sourceRef.current.playerSourceDrm,
                dvrWindowSeconds: sourceRef.current.dvrWindowSeconds,
                isLive: sourceRef.current.isLive,
                isDVR: sourceRef.current.isDVR,
                isFakeVOD: sourceRef.current.isFakeVOD,
                isReady: true
            };
            
            // Add a small delay to ensure Cast client is truly stable
            setTimeout(() => {
                // console.log(`[Player] (Audio Cast Flavour) Cast ready - About to load content with delay`);
                loadContentWithCastManager(sourceData);
            }, 100);
        }
    }, [castConnected, sourceRef.current?.isReady, currentSourceType.current, isContentLoaded, isLoadingContent, hasTriedLoading]);

    // Sync with Cast progress with debounce to prevent immediate override of seeks
    useEffect(() => {
        if (castConnected && castProgress.currentTime !== currentTime) {
            setCurrentTime(castProgress.currentTime);
        }
        return undefined;
    }, [castProgress.currentTime, castConnected, currentTime]);

    // Sync with Cast playing state with debounce to prevent immediate override
    useEffect(() => {
        const isPlaying = castPlaying;
        const shouldBePaused = !isPlaying;
        
        if (paused !== shouldBePaused) {
            setPaused(shouldBePaused);
        }
        
        return undefined;
    }, [castPlaying, paused]);

    // Sync with Cast volume with debounce to prevent immediate override
    useEffect(() => {
        if (castVolume.isMuted !== muted) {
            setMuted(castVolume.isMuted);
        }
        
        return undefined;
    }, [castVolume.isMuted, muted]);

    useEffect(() => {
        console.log(`[Player] (Audio Cast Flavour) 🔄 useEffect manifests TRIGGERED`);
        // console.log(`[Player] (Audio Cast Flavour) useEffect manifests - isAutoNext: ${props.isAutoNext}`);
        // console.log(`[Player] (Audio Cast Flavour) useEffect manifests - isContentLoaded: ${isContentLoaded}, isChangingSource: ${isChangingSource.current}`);

        // Verificar si el contenido ya está cargado en Cast
        const isLiveContent = !!props.playerProgress?.isLive;
        const desiredUri = sourceRef.current?.playerSource?.uri;
        
        // Verificar si ya estamos reproduciendo el contenido deseado
        if (castConnected && castMedia.url && desiredUri && castMedia.url === desiredUri && !castMedia.isIdle) {
            console.log(`[Player] (Audio Cast Flavour) Content already loaded in Cast: ${castMedia.url}`);
            if (!isContentLoaded) {
                setIsContentLoaded(true);
                isChangingSource.current = false;
            }
            return;
        }

        if (isLiveContent) {
            // LÓGICA PARA LIVE/DVR - cargar contenido directamente sin tudum
            console.log(`[Player] (Audio Cast Flavour) useEffect manifests - Live content detected, skipping tudum`);
            
            // Crear sourceRef si no existe
            if (!sourceRef.current) {
                sourceRef.current = new SourceClass({
                    id: props.playerMetadata?.id,
                    title: props.playerMetadata?.title,
                    subtitle: props.playerMetadata?.subtitle,
                    description: props.playerMetadata?.description,
                    poster: props.playerMetadata?.poster,
                    squaredPoster: props.playerMetadata?.squaredPoster,
                    manifests: props.manifests,
                    startPosition: props.playerProgress?.currentTime || 0,
                    isLive: true,
                    isCast: true,
                    headers: props.headers,
                    getBestManifest: props.hooks?.getBestManifest,
                    getSourceUri: props.hooks?.getSourceUri,
                    onSourceChanged: onSourceChanged
                });
            }

            // Para live, cargar contenido directamente
            // console.log(`[Player] (Audio Cast Flavour) useEffect manifests - Setting currentSourceType to 'content' and isChangingSource to true`);
            currentSourceType.current = 'content';
            isChangingSource.current = true;
            
            // console.log(`[Player] (Audio Cast Flavour) useEffect manifests - Calling changeSource with manifests`);
            sourceRef.current.changeSource({
                id: props.playerMetadata?.id,
                title: props.playerMetadata?.title,
                subtitle: props.playerMetadata?.subtitle,
                description: props.playerMetadata?.description,
                poster: props.playerMetadata?.poster,
                squaredPoster: props.playerMetadata?.squaredPoster,
                manifests: props.manifests,
                startPosition: props.playerProgress?.currentTime || 0,
                isLive: true,
                isCast: true,
                headers: props.headers,
            });

        } else {
            // LÓGICA DEL TUDUM SOLO PARA VOD
            
            // Reset completo solo para VOD
            currentSourceType.current = null;
            pendingContentSource.current = null;
            sliderValues.current = undefined;
            setIsContentLoaded(false);
            setHasTriedLoading(false);
            
            // Reset progress managers solo para VOD
            vodProgressManagerRef.current?.reset();
            dvrProgressManagerRef.current?.reset();

            // Determinar si debe reproducir tudum (solo para VOD)
            const shouldPlayTudum = !!props.showExternalTudum && !props.isAutoNext && !props.playerProgress?.isLive;
            console.log(`[Player] (Audio Cast Flavour) shouldPlayTudum: ${shouldPlayTudum}`);

            if (!tudumRef.current){
                tudumRef.current = new TudumClass({
                    enabled: !!props.showExternalTudum,
                    getTudumSource: props.hooks?.getTudumSource,
                    getTudumManifest: props.hooks?.getTudumManifest,
                    isAutoNext: props.isAutoNext
                });
            } else {
                // Actualizar contexto si el tudum ya existe
                tudumRef.current.updateAutoNextContext(!!props.isAutoNext);
            }

            if (!sourceRef.current){
                sourceRef.current = new SourceClass({
                    id: props.playerMetadata?.id,
                    title: props.playerMetadata?.title,
                    subtitle: props.playerMetadata?.subtitle,
                    description: props.playerMetadata?.description,
                    poster: props.playerMetadata?.poster,
                    squaredPoster: props.playerMetadata?.squaredPoster,
                    manifests: props.manifests,
                    startPosition: props.playerProgress?.currentTime || 0,
                    isLive: false,
                    isCast: true,
                    headers: props.headers,
                    getBestManifest: props.hooks?.getBestManifest,
                    getSourceUri: props.hooks?.getSourceUri,
                    onSourceChanged: onSourceChanged
                });
            }

            // ESTABLECER currentSourceType Y LLAMAR A LAS FUNCIONES CORRECTAS
            if (shouldPlayTudum && tudumRef.current?.isReady && !sourceRef.current?.isDownloaded) {
                console.log(`[Player] (Audio Cast Flavour) Will play tudum first, then content`);
                currentSourceType.current = 'tudum';
                loadTudumSource(); // AQUÍ SE INVOCA loadTudumSource
            } else {
                console.log(`[Player] (Audio Cast Flavour) Skipping tudum - loading content directly`);
                currentSourceType.current = 'content';
                loadContentSource(); // AQUÍ SE INVOCA loadContentSource
            }
        }

    }, [props.manifests, props.isAutoNext]);

    useEffect(() => {
        EventRegister.emit('audioPlayerProgress', {
            preloading: isBuffering || isLoadingContent,
            isContentLoaded: isContentLoaded,
            speedRate: 1,
            extraData: props.extraData,
            playerMetadata: props.playerMetadata,
            playerProgress: {
                ...props.playerProgress,
                currentTime: currentTime,
                isPaused: paused,
                isMuted: muted,
                isLive: sourceRef.current?.isLive,
                isDVR: sourceRef.current?.isDVR,
                isBinary: sourceRef.current?.isBinary,
                isChangingSource: isChangingSource.current,
                sliderValues: sliderValues.current,
                currentProgram: playerProgressRef.current?.currentProgram,
            },
            playerAnalytics: props.playerAnalytics,
            playerTimeMarkers: props.playerTimeMarkers,
            events: props.events,
        } as AudioControlsProps);

    }, [currentTime, props.playerMetadata, paused, muted, isBuffering, isLoadingContent, sourceRef.current?.isDVR, isContentLoaded, sliderValuesUpdate]);

    const loadContentWithCastManager = useCallback(async (data: onSourceChangedProps) => {
        // console.log(`[Player] (Audio Cast Flavour) loadContentWithCastManager`);
        
        if (data && data.isReady && data.source) {
            setIsLoadingContent(true);
            drm.current = data.drm;

            // Verificar si ya estamos reproduciendo el mismo contenido
            if (castMedia.url === data.source.uri && !castMedia.isIdle) {
                console.log(`[Player] (Audio Cast Flavour) Content already loaded in Cast, skipping`);
                setIsLoadingContent(false);
                isChangingSource.current = false;
                setIsContentLoaded(true);
                setHasTriedLoading(true);
                return;
            }

            try {
                // Preparar Youbora si es necesario
                if (props.hooks?.getYouboraOptions) {
                    youboraForVideo.current = props.hooks.getYouboraOptions(props.playerAnalytics?.youbora!, YOUBORA_FORMAT.CAST);
                }

                let startingPoint = props.playerProgress?.currentTime || 0;

                // Para DVR, ajustar el punto de inicio
                if (sourceRef.current?.isLive && sourceRef.current?.isDVR && sourceRef.current?.dvrWindowSeconds) {
                    startingPoint = sourceRef.current.dvrWindowSeconds;
                }

                const success = await castManagerRef.current?.loadContent({
                    source: data.source,
                    manifest: sourceRef.current?.currentManifest || {},
                    drm: data.drm,
                    youbora: youboraForVideo.current,
                    metadata: {
                        id: props.playerMetadata?.id?.toString() || '',
                        title: props.playerMetadata?.title,
                        subtitle: props.playerMetadata?.subtitle,
                        description: props.playerMetadata?.description,
                        poster: props.playerMetadata?.squaredPoster || props.playerMetadata?.poster,
                        liveStartDate: props.liveStartDate,
                        adTagUrl: props.playerAds?.adTagUrl,
                        hasNext: !!props.events?.onNext,
                        isLive: !!props.playerProgress?.isLive,
                        isDVR: sourceRef.current?.isDVR,
                        startPosition: startingPoint
                    }
                });

                if (!success) {
                    throw new Error('CastManager failed to load content');
                }

            } catch (error: any) {
                setIsLoadingContent(false);
                // setHasTriedLoading(false);
                console.log(`[Player] (Audio Cast Flavour) loadContentWithCastManager - Failed:`, error);
                onError({ message: error?.message || 'Failed to load content to Cast' });
            }
        }
    }, [castMedia, props.hooks, props.playerAnalytics, props.playerProgress, props.playerMetadata, props.liveStartDate, props.playerAds, props.events]);

    const loadTudumSource = useCallback(async () => {
        // console.log(`[Player] (Audio Cast Flavour) loadTudumSource`);
        
        if (!tudumRef.current?.source || !castConnected) {
            console.log(`[Player] (Audio Cast Flavour) loadTudumSource - Not ready:`, {
                hasSource: !!tudumRef.current?.source,
                castConnected
            });
            return;
        }

        try {
            // Configurar estado para tudum
            currentSourceType.current = 'tudum';
            tudumRef.current.isPlaying = true;
            drm.current = tudumRef.current?.drm;
            setIsLoadingContent(true);
            
            console.log(`[Player] (Audio Cast Flavour) Loading tudum to Cast:`, tudumRef.current.source);
            
            // USAR castManager.loadContent para tudum
            const success = await castManagerRef.current?.loadContent({
                source: tudumRef.current.source,
                manifest: {},
                drm: tudumRef.current.drm,
                youbora: undefined,
                metadata: {
                    id: 'tudum',
                    title: tudumRef.current.source.title || 'Tudum',
                    subtitle: tudumRef.current.source.subtitle || '',
                    description: tudumRef.current.source.description || '',
                    poster: tudumRef.current.source.metadata?.imageUri,
                    isLive: false,
                    isDVR: false,
                    startPosition: 0
                }
            });

            if (!success) {
                throw new Error('CastManager failed to load tudum');
            }

            // console.log(`[Player] (Audio Cast Flavour) Tudum loaded successfully via castManager`);
            
        } catch (error: any) {
            setIsLoadingContent(false);
            currentSourceType.current = null;
            if (tudumRef.current) {
                tudumRef.current.isPlaying = false;
            }
            
            console.log(`[Player] (Audio Cast Flavour) Failed to load tudum to Cast:`, error);
            
            // En caso de error con tudum, saltar directamente al contenido
            console.log(`[Player] (Audio Cast Flavour) Tudum failed, loading content directly`);
            currentSourceType.current = 'content';
            loadContentSource();
        }
    }, [castConnected]);

    const loadContentSource = useCallback(() => {
        // console.log(`[Player] (Audio Cast Flavour) loadContentSource`);
        
        isChangingSource.current = true;
        currentSourceType.current = 'content';
        
        if (sourceRef.current) {
            sourceRef.current?.changeSource({
                id: props.playerMetadata?.id,
                title: props.playerMetadata?.title,
                subtitle: props.playerMetadata?.subtitle,
                description: props.playerMetadata?.description,
                poster: props.playerMetadata?.poster,
                squaredPoster: props.playerMetadata?.squaredPoster,
                manifests: props.manifests,
                startPosition: props.playerProgress?.currentTime || 0,
                isLive: !!props.playerProgress?.isLive,
                isCast: true,
                headers: props.headers,
            });
            
            // El useEffect con castConnected se encargará de cargar cuando esté todo listo
            console.log(`[Player] (Audio Cast Flavour) loadContentSource - Waiting for castConnected useEffect to trigger`);
        }
    }, [props.playerMetadata, props.manifests, props.playerProgress, props.headers]);

    const switchFromTudumToContent = useCallback(async () => {
        // console.log(`[Player] (Audio Cast Flavour) switchFromTudumToContent`);
        
        // Limpiar completamente el source del tudum
        currentSourceType.current = null;
        if (tudumRef.current) {
            tudumRef.current.isPlaying = false;
        }
        
        // Reset completo de progress managers y sliderValues
        sliderValues.current = undefined;
        vodProgressManagerRef.current?.reset();
        dvrProgressManagerRef.current?.reset();
        
        // Pequeño delay para asegurar que se limpia el source
        setTimeout(async () => {
            // console.log(`[Player] (Audio Cast Flavour) switchFromTudumToContent - pendingContentSource.current ${JSON.stringify(pendingContentSource.current)}`)

            // Si hay un source de contenido pendiente, usarlo directamente
            if (pendingContentSource.current && pendingContentSource.current.isReady) {
                // console.log(`[Player] (Audio Cast Flavour) Loading pending content source directly`);
                currentSourceType.current = 'content';
                await loadContentWithCastManager(pendingContentSource.current);
                pendingContentSource.current = null;
            } else {
                // Cargar el contenido principal
                console.log(`[Player] (Audio Cast Flavour) Loading main content source`);
                currentSourceType.current = 'content';
                loadContentSource();
            }
        }, 100);
    }, [loadContentWithCastManager, loadContentSource]);

    // Source Cooking
    const onSourceChanged = useCallback((data: onSourceChangedProps) => {
        // console.log(`[Player] (Audio Cast Flavour) onSourceChanged - currentSourceType: ${currentSourceType.current}`);
        // console.log(`[Player] (Audio Cast Flavour) onSourceChanged - tudumRef.current?.isPlaying ${tudumRef.current?.isPlaying}`);
        // console.log(`[Player] (Audio Cast Flavour) onSourceChanged - data isReady: ${data.isReady}`);
        console.log(`[Player] (Audio Cast Flavour) onSourceChanged - data ${JSON.stringify(data)}`);
        
        if (!sourceRef.current?.isLive && !sourceRef.current?.isDownloaded && currentSourceType.current === 'tudum') {
            // Si estamos reproduciendo tudum, guardar el source del contenido para después
            // console.log(`[Player] (Audio Cast Flavour) onSourceChanged - Saving content source for later (tudum is playing)`);
            pendingContentSource.current = data;

            // console.log(`[Player] (Audio Cast Flavour) onSourceChanged - pendingContentSource.current ${JSON.stringify(pendingContentSource.current)}`);
            
            // También preparar el progress
            if (data.isReady) {
                try {
                    playerProgressRef.current = {
                        ...props.playerProgress,
                        currentTime: currentTime,
                        duration: sliderValues.current?.duration || 0,
                        isPaused: paused,
                        isMuted: muted,
                        isContentLoaded: isContentLoaded,
                        isChangingSource: isChangingSource.current,
                        sliderValues: sliderValues.current,
                    };
                } catch (ex: any) {
                    console.log(`[Player] (Audio Cast Flavour) onSourceChanged - error ${ex?.message}`);
                }
            }
            
        } else if (currentSourceType.current === 'content') {
            // Si ya estamos en modo contenido, procesar normalmente
            console.log(`[Player] (Audio Cast Flavour) onSourceChanged - Processing content source normally`);

            // Si el stream es DVR, debemos actualizar el tamaño de la ventana
            if (data.isDVR && dvrProgressManagerRef.current) {
                dvrProgressManagerRef.current?.setDVRWindowSeconds(data.dvrWindowSeconds || 3600);
            }
            
            try {
                playerProgressRef.current = {
                    ...props.playerProgress,
                    currentTime: currentTime,
                    duration: sliderValues.current?.duration || 0,
                    isPaused: paused,
                    isMuted: muted,
                    isContentLoaded: isContentLoaded,
                    isChangingSource: isChangingSource.current,
                    sliderValues: sliderValues.current,
                };
            } catch (ex: any) {
                console.log(`[Player] (Audio Cast Flavour) onSourceChanged - error ${ex?.message}`);
            }
            
            // USAR loadContentWithCastManager en lugar de setPlayerSource
            loadContentWithCastManager(data);
            
        } else {
            // Estado inicial o indefinido
            console.log(`[Player] (Audio Cast Flavour) onSourceChanged - Initial state, processing source`);
            
            // Si no tenemos tipo definido, debe ser contenido
            if (!currentSourceType.current) {
                currentSourceType.current = 'content';
                console.log(`[Player] (Audio Cast Flavour) onSourceChanged - Setting currentSourceType to content`);
            }
            
            try {
                playerProgressRef.current = {
                    ...props.playerProgress,
                    currentTime: currentTime,
                    duration: sliderValues.current?.duration || 0,
                    isPaused: paused,
                    isMuted: muted,
                    isContentLoaded: isContentLoaded,
                    isChangingSource: isChangingSource.current,
                    sliderValues: sliderValues.current,
                };
            } catch (ex: any) {
                console.log(`[Player] (Audio Cast Flavour) onSourceChanged - error ${ex?.message}`);
            }
            
            // USAR loadContentWithCastManager en lugar de setPlayerSource
            loadContentWithCastManager(data);
        }

        // Reset DVR si es necesario
        if (sourceRef.current?.isLive && sourceRef.current?.isDVR) {
            dvrProgressManagerRef.current?.reset();
        }
    }, [loadContentWithCastManager, props.playerProgress, currentTime, paused, muted, isContentLoaded]);

    /*
     *  DVR Progress Manager
     */

    const onDVRModeChange = useCallback((data: ModeChangeData) => {
        console.log(`[Player] (Audio Cast Flavour) onDVRModeChange: ${JSON.stringify(data)}`);
    }, []);

    const onDVRProgramChange = useCallback((data: ProgramChangeData) => {
        console.log(`[Player] (Audio Cast Flavour) onDVRProgramChange: ${JSON.stringify(data)}`);
    }, []);

    const onProgressUpdate = useCallback((data: ProgressUpdateData) => {
        // Solo actualizar sliderValues si estamos reproduciendo contenido, no tudum
        if (currentSourceType.current === 'content') {
            console.log(`[Player] (Audio Cast Flavour) onProgressUpdate: ${JSON.stringify(data)}`);
            sliderValues.current = {
                minimumValue: data.minimumValue,
                maximumValue: data.maximumValue,
                progress: data.progress,
                percentProgress: data.percentProgress,
                duration: data.duration || 0,
                canSeekToEnd: data.canSeekToEnd,
                liveEdge: data.liveEdge,
                percentLiveEdge: data.percentLiveEdge,
                isProgramLive: data.isProgramLive,
                progressDatum: data.progressDatum,
                liveEdgeOffset: data.liveEdgeOffset,
                isLiveEdgePosition: data.isLiveEdgePosition,
            };

            try {
                playerProgressRef.current = {
                    ...props.playerProgress,
                    currentTime: currentTime,
                    duration: sliderValues.current?.duration || 0,
                    isPaused: paused,
                    isMuted: muted,
                    isContentLoaded: isContentLoaded,
                    isChangingSource: isChangingSource.current,
                    sliderValues: sliderValues.current,
                    currentProgram: data.currentProgram,
                };
            } catch (ex: any) {
                console.log(`[Player] (Audio Cast Flavour) onProgressUpdate - error ${ex?.message}`);
            }

            // Trigger re-render del useEffect para emitir eventos con nuevos sliderValues
            setSliderValuesUpdate((prev: number) => prev + 1);
        } else {
            console.log(`[Player] (Audio Cast Flavour) onProgressUpdate - Ignoring progress update for ${currentSourceType.current}`);
        }
    }, [paused, muted, isContentLoaded]);

    const onSeekRequest = useCallback((playerTime: number) => {
        if (!!castManagerRef.current){
            console.log(`[Player] (Audio Cast Flavour) onSeekRequest:`, playerTime);
            castManagerRef.current.seek(playerTime);
        } else {
            console.log(`[Player] (Audio Cast Flavour) onSeekRequest - castManager is not initialized`);
        }
    }, []);

    useEffect(() => {
        // Initialize VOD Progress Manager only once
        if (!vodProgressManagerRef.current) {
            vodProgressManagerRef.current = new VODProgressManagerClass({
                onProgressUpdate: onProgressUpdate,
                onSeekRequest: onSeekRequest
            });
        }

        // Initialize DVR Progress Manager only once
        if (!dvrProgressManagerRef.current) {
            console.log(`[Player] (Audio Cast Flavour) Initializing DVR Progress Manager`);
            console.log(`[Player] (Audio Cast Flavour) EPG hooks available - getEPGProgramAt: ${!!props.hooks?.getEPGProgramAt}`);
            
            dvrProgressManagerRef.current = new DVRProgressManagerClass({
                playbackType: props.playerProgress?.liveValues?.playbackType,
                getEPGProgramAt: props.hooks?.getEPGProgramAt,
                onModeChange: onDVRModeChange,
                onProgramChange: onDVRProgramChange,
                onProgressUpdate: onProgressUpdate,
                onSeekRequest: onSeekRequest
            });
        }
    }, []);

    // Actualizar callbacks del DVRProgressManagerClass cuando cambien
    useEffect(() => {
        if (vodProgressManagerRef.current) {
            vodProgressManagerRef.current?.updateCallbacks({
                onProgressUpdate: onProgressUpdate,
                onSeekRequest: onSeekRequest
            });
        }

        if (dvrProgressManagerRef.current) {
            dvrProgressManagerRef.current?.updateCallbacks({
                getEPGProgramAt: props.hooks?.getEPGProgramAt,
                onModeChange: onDVRModeChange,
                onProgramChange: onDVRProgramChange,
                onProgressUpdate: onProgressUpdate,
                onSeekRequest: onSeekRequest
            });
        }
    }, [
        props.hooks?.getEPGProgramAt,
        onDVRModeChange,
        onDVRProgramChange,
        onProgressUpdate,
        onSeekRequest
    ]);

    const onControlsPress = useCallback(async (id: CONTROL_ACTION, value?: number | boolean) => {

        const COMMON_DATA_FIELDS = ['time', 'volume', 'mute', 'pause'];

        console.log(`[Player] (Audio Cast Flavour) onControlsPress: ${id} (${value})`);

        if (id === CONTROL_ACTION.PAUSE){
            if (value) {
                await castManagerRef.current?.pause();
            } else {
                await castManagerRef.current?.play();
            }
        }

        if (id === CONTROL_ACTION.CLOSE_AUDIO_PLAYER){
            await castManagerRef.current?.stop();
            if (props.events?.onClose){
                props.events.onClose();
            }
        }
        
        if (id === CONTROL_ACTION.MUTE){
            if (value) {
                await castManagerRef.current?.mute();
            } else {
                await castManagerRef.current?.unmute();
            }
        }

        if (id === CONTROL_ACTION.VOLUME && typeof(value) === 'number'){
            await castManagerRef.current?.setVolume(value);
        }
        
        if (id === CONTROL_ACTION.NEXT && props.events?.onNext){            
            console.log(`[Player] (Audio Cast Flavour) CONTROL_ACTION.NEXT - Resetting isContentLoaded to false`);
            setIsContentLoaded(false);
            props.events.onNext();
        }

        if (id === CONTROL_ACTION.PREVIOUS && props.events?.onPrevious){
            console.log(`[Player] (Audio Cast Flavour) CONTROL_ACTION.PREVIOUS - Resetting isContentLoaded to false`);
            setIsContentLoaded(false);
            props.events.onPrevious();
        }

        if (id === CONTROL_ACTION.LIVE && sourceRef.current?.isDVR){
            dvrProgressManagerRef.current?.goToLive();
        }

        if (id === CONTROL_ACTION.SEEK_OVER_EPG && sourceRef.current?.isDVR){
            dvrProgressManagerRef.current?.goToProgramStart();
        }

        if (id === CONTROL_ACTION.SEEK && sourceRef.current?.isDVR){
            dvrProgressManagerRef.current?.seekToTime(value);
        }

        if (id === CONTROL_ACTION.FORWARD && sourceRef.current?.isDVR){
            dvrProgressManagerRef.current?.skipForward(value);
        }

        if (id === CONTROL_ACTION.BACKWARD && sourceRef.current?.isDVR){
            dvrProgressManagerRef.current?.skipBackward(value);
        }

        if (id === CONTROL_ACTION.SEEK && !sourceRef.current?.isLive){
            vodProgressManagerRef.current?.seekToTime(value);
        }

        if (id === CONTROL_ACTION.FORWARD && !sourceRef.current?.isLive){
            vodProgressManagerRef.current?.skipForward(value);
        }

        if (id === CONTROL_ACTION.BACKWARD && !sourceRef.current?.isLive){
            vodProgressManagerRef.current?.skipBackward(value);
        }

        // Actions to be saved between flavours
        if (COMMON_DATA_FIELDS.includes(id) && props?.events?.onChangeCommonData){
            let data: ICommonData = {};

            if (id === CONTROL_ACTION.MUTE){
                data.muted = !!value;

            } else if (id === CONTROL_ACTION.PAUSE){
                data.paused = !!value;

            } else if (typeof(value) === 'number'){
                data.volume = (id === CONTROL_ACTION.VOLUME) ? value : undefined;
                
            }
            
            props.events.onChangeCommonData(data);
        }

    }, [props.events]);

    useEffect(() => {
        const actionsAudioPlayerListener = EventRegister.addEventListener('audioPlayerAction', (data: AudioPlayerActionEventProps) => {
            console.log(`[Player] (Audio Cast Flavour) audioPlayerAction received: ${JSON.stringify(data)}`);
            onControlsPress(data.action, data.value);
        });

        return (() => {
            if (typeof(actionsAudioPlayerListener) === 'string'){
                EventRegister.removeEventListener(actionsAudioPlayerListener);
            }
        });
    }, [onControlsPress]);

    // Simular eventos del reproductor usando Cast hooks
    const onLoad = useCallback(async (e: { currentTime: number; duration: number }) => {
        // console.log(`[Player] (Audio Cast Flavour) onLoad ENTRY - currentSourceType: ${currentSourceType.current}`);
        // console.log(`[Player] (Audio Cast Flavour) onLoad ENTRY - isContentLoaded: ${isContentLoaded}`);
        // console.log(`[Player] (Audio Cast Flavour) onLoad ENTRY - isChangingSource: ${isChangingSource.current}`);
        console.log(`[Player] (Audio Cast Flavour) onLoad ENTRY - duration: ${e.duration}, currentTime: ${e.currentTime}`);

        // Solo procesar onLoad para contenido principal, no para tudum
        if (currentSourceType.current === 'content' && e.duration > 0) {
            console.log(`[Player] (Audio Cast Flavour) onLoad - ✅ CONDITIONS MET - Processing content load`);

            // Para VOD, establecer la duración desde el evento onLoad
            if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR && e.duration) {
                console.log(`[Player] (Audio Cast Flavour) onLoad - Setting VOD duration from load event: ${e.duration}s`);
                vodProgressManagerRef.current?.updatePlayerData({
                    currentTime: e.currentTime || 0,
                    seekableRange: { start: 0, end: e.duration },
                    duration: e.duration,
                    isBuffering: false,
                    isPaused: paused
                });
            }

            // CRÍTICO: Configurar DVR window ANTES de marcar contenido como cargado
            if (sourceRef.current?.isDVR && sourceRef.current?.dvrWindowSeconds) {
                console.log(`[Player] (Audio Cast Flavour) onLoad - 🔧 Configuring DVR window: ${sourceRef.current.dvrWindowSeconds}s`);
                dvrProgressManagerRef.current?.setDVRWindowSeconds(sourceRef.current.dvrWindowSeconds);
            }

            console.log(`[Player] (Audio Cast Flavour) onLoad - 🔄 Setting isChangingSource to false and isContentLoaded to true`);
            isChangingSource.current = false;
            setIsContentLoaded(true);
            setIsLoadingContent(false);

            if (props.events?.onStart) {
                console.log(`[Player] (Audio Cast Flavour) onLoad - 🎬 Calling onStart event`);
                props.events.onStart();
            }

            // Seek inicial al cargar un live con DVR
            if (sourceRef.current?.isDVR && dvrProgressManagerRef.current) {
                console.log(`[Player] (Audio Cast Flavour) onLoad - 🎯 Checking initial seek for DVR`);
                dvrProgressManagerRef.current?.checkInitialSeek('cast');
            }

        } else if (currentSourceType.current === 'tudum') {
            console.log(`[Player] (Audio Cast Flavour) onLoad - 🎵 Tudum loaded, duration: ${e.duration}`);
            setIsLoadingContent(false);
        } else {
            console.log(`[Player] (Audio Cast Flavour) onLoad - ❌ CONDITIONS NOT MET - Ignoring load event`);
        }
    }, [isContentLoaded, paused, props.events]);

    const onEnd = useCallback(() => {
        console.log(`[Player] (Audio Cast Flavour) onEnd ENTRY: currentSourceType ${currentSourceType.current}, isAutoNext: ${props.isAutoNext}`);
        
        if (currentSourceType.current === 'tudum') {
            // Acaba la reproducción del Tudum externo
            console.log(`[Player] (Audio Cast Flavour) onEnd: Tudum finished, switching to main content`);
            isChangingSource.current = true;
            switchFromTudumToContent();

        } else if (currentSourceType.current === 'content' && props.events?.onEnd) {
            // Termina el contenido principal
            console.log(`[Player] (Audio Cast Flavour) onEnd: Content finished, preparing for possible auto next`);
            
            // Preparar tudum para salto automático antes de notificar
            if (tudumRef.current) {
                tudumRef.current.prepareForAutoNext();
            }
            
            props.events.onEnd();
        } else {
            console.log(`[Player] (Audio Cast Flavour) onEnd: Unknown state - currentSourceType: ${currentSourceType.current}, hasOnEnd: ${!!props.events?.onEnd}`);
        }
    }, [props.isAutoNext, props.events, switchFromTudumToContent]);

    // Simular onProgress usando castProgress
    useEffect(() => {
        if (!castConnected || currentTime === castProgress.currentTime) return;

        const e = {
            currentTime: castProgress.currentTime,
            seekableDuration: castProgress.duration || 0
        };

        console.log(`[Player] (Audio Cast Flavour) Simulating onProgress: ${JSON.stringify(e)}`);

        // Solo procesar progreso para contenido principal, no para tudum
        if (currentSourceType.current === 'content') {
            if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR){
                // Para VOD: mantener duración establecida en onLoad
                vodProgressManagerRef.current?.updatePlayerData({
                    currentTime: e.currentTime,
                    seekableRange: { start: 0, end: e.seekableDuration },
                    duration: e.seekableDuration,
                    isBuffering: isBuffering || isLoadingContent,
                    isPaused: paused
                });
            }

            if (sourceRef.current?.isDVR){
                // Para DVR, usar la duración del progreso
                dvrProgressManagerRef.current?.updatePlayerData({
                    currentTime: e.currentTime,
                    duration: e.seekableDuration,
                    seekableRange: { start: 0, end: e.seekableDuration },
                    isBuffering: isBuffering || isLoadingContent,
                    isPaused: paused
                });
            }

            if (!sourceRef.current?.isLive && props?.events?.onChangeCommonData){
                props.events.onChangeCommonData({
                    time: e.currentTime,
                    duration: e.seekableDuration,
                });
            }
        }

    }, [castProgress.currentTime, castProgress.duration, castConnected, paused, isBuffering, isLoadingContent]);

    const onError = useCallback((e: any) => {
        console.log(`[Player] (Audio Cast Flavour) onError: ${JSON.stringify(e)} - currentSourceType: ${currentSourceType.current}`);
        setIsLoadingContent(false);
    }, []);

    useEffect(() => {
        onLoadRef.current = onLoad;
        onEndRef.current = onEnd;
        onErrorRef.current = onError;
    }, [onLoad, onEnd, onError]);

    const onSlidingComplete = (value: number) => {
        onControlsPress(CONTROL_ACTION.SEEK, value);
    }

    const Controls = props.controls ? createElement(props.controls, { 
        preloading: isBuffering || isLoadingContent,
        isContentLoaded: isContentLoaded,
        speedRate: 1,
        extraData: props.extraData,
        playerMetadata: props.playerMetadata,
        playerProgress: playerProgressRef.current,
        playerAnalytics: props.playerAnalytics,
        playerTimeMarkers: props.playerTimeMarkers,
        playerAds: props.playerAds,
        events: {
            onPress: onControlsPress,
            onSlidingComplete: onSlidingComplete
        }
    }) : null;

    return (
        <Animated.View style={{
            ...styles.audioContainer,
            height: audioPlayerHeight,
            backgroundColor: props.backgroundColor || styles.container.backgroundColor,
            borderColor: props.topDividerColor,
            borderTopWidth: props.topDividerColor ? 1 : 0
        }}>
            { Controls }
        </Animated.View>
    );

};

export default AudioCastFlavour;