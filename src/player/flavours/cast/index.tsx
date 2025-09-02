import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { Overlay } from '../../components/overlay';
import { BackgroundPoster } from '../../components/poster';

import { styles } from '../styles';

import {
    CONTROL_ACTION,
    DVR_PLAYBACK_TYPE,
    LogLevel,
    PLAYER_MENU_DATA_TYPE,
    YOUBORA_FORMAT,
    type CastFlavourProps,
    type ICommonData,
    type IDrm,
    type IMappedYoubora,
    type IPlayerMenuData,
    type LoggerConfigBasic
} from '../../types';

import {
    type IPlayerProgress,
    type ProgressUpdateData,
    type SliderValues
} from '../../../types';

import {
    DVRProgressManagerClass,
    VODProgressManagerClass,
    type ModeChangeData,
    type ProgramChangeData
} from '../../core/progress';

import { ComponentLogger } from '../../features/logger';

import { getTrackId, mergeCastMenuData } from '../../utils';

import { useIsBuffering } from '../../core/buffering';
import { SourceClass, type onSourceChangedProps } from '../../modules/source';
import { TudumClass } from '../../modules/tudum';

// Importar hooks individuales de Cast como en AudioCastFlavour
import {
    useCastConnected,
    useCastManager,
    useCastMedia,
    useCastMonitor,
    useCastPlaying,
    useCastProgress,
    useCastVolume
} from '../../features/cast/hooks';

import { PlayerError } from "../../core/errors";
import { type CastContentInfo, type CastTrackInfo } from '../../features/cast/types/types';

export function CastFlavour(props: CastFlavourProps): React.ReactElement {

    const currentLogger = useRef<ComponentLogger | null>(null);

    const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
    const [isLoadingContent, setIsLoadingContent] = useState<boolean>(false);
    const [hasTriedLoading, setHasTriedLoading] = useState<boolean>(false);
    const [currentTime, setCurrentTime] = useState<number>(props.playerProgress?.currentTime || 0);
    const [paused, setPaused] = useState<boolean>(!!props.playerProgress?.isPaused);
    const [muted, setMuted] = useState<boolean>(!!props?.playerProgress?.isMuted);
    const [buffering, setBuffering] = useState<boolean>(false);
    const [menuData, setMenuData] = useState<Array<IPlayerMenuData>>();
    const [audioIndex, setAudioIndex] = useState<number>(props.audioIndex!);
    const [subtitleIndex, setSubtitleIndex] = useState<number>(props.subtitleIndex!);
    const [sliderValuesUpdate, setSliderValuesUpdate] = useState<number>(0);
    const [isLiveProgramRestricted, setIsLiveProgramRestricted] = useState<boolean>(false);

    const isChangingSource = useRef<boolean>(true);
    const sliderValues = useRef<SliderValues>();
    const playerProgressRef = useRef<IPlayerProgress>();
    const youboraForVideo = useRef<IMappedYoubora>();
    const drm = useRef<IDrm>();

    const castLoggerConfig: LoggerConfigBasic = {
        enabled: props.logger?.cast?.enabled ?? true,
        level: props.logger?.cast?.level ?? LogLevel.INFO,
        instanceId: props.playerContext?.getInstanceId() || undefined,
    };

    // Logger
    if (!currentLogger.current && props.playerContext?.logger){
        currentLogger.current = props.playerContext?.logger?.forComponent('Cast Flavour', castLoggerConfig.enabled, castLoggerConfig.level);
    }

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

    // USAR HOOKS INDIVIDUALES DE CAST como en AudioCastFlavour
    const castConnected = useCastConnected(castLoggerConfig);
    const castMedia = useCastMedia(castLoggerConfig);
    const castPlaying = useCastPlaying(castLoggerConfig);
    const castProgress = useCastProgress(castLoggerConfig);
    const castVolume = useCastVolume(castLoggerConfig);

    // CREATE REFS FOR MAIN CALLBACKS to avoid circular dependencies
    const onLoadRef = useRef<(e: { currentTime: number; duration: number }) => void>();
    const onEndRef = useRef<() => void>();
    const onErrorRef = useRef<(e: any) => void>();

    // CALLBACKS DEL CAST MANAGER
    const onContentLoadedCallback = useCallback((content: CastContentInfo) => {
        currentLogger.current?.info(`Cast Manager - Content loaded:`, content.source.uri);
        setIsLoadingContent(false);
        isChangingSource.current = false;
        setIsContentLoaded(true);
        setHasTriedLoading(true);
        
        // Simular onLoad con duración si está disponible
        setTimeout(() => {
            if (castProgress.duration && castProgress.duration > 0) {
                const duration = castProgress.duration;
                currentLogger.current?.debug(`onContentLoadedCallback - calling onLoad with duration: ${duration}`);
                onLoadRef.current?.({
                    currentTime: content.metadata.startPosition || 0,
                    duration: duration
                });
            }
        }, 100);
    }, [castProgress.duration]);

    const onErrorCallback = useCallback((error: PlayerError, content: CastContentInfo) => {
        currentLogger.current?.error(`Cast Manager - Content load error: ${error}`);
        setIsLoadingContent(false);
        onErrorRef.current?.({ message: error });
    }, []);

    const onPlaybackStartedCallback = useCallback(() => {
        currentLogger.current?.debug(`Cast Manager - Playback started (isContentLoaded: ${isContentLoaded})`);
        setPaused(false);
        setBuffering(false);
        
        // Si no estaba cargado, marcarlo como cargado
        if (!isContentLoaded) {
            setIsContentLoaded(true);
            isChangingSource.current = false;
        }
    }, [isContentLoaded]);

    const onPlaybackEndedCallback = useCallback(() => {
        currentLogger.current?.info(`Cast Manager - Playback ended`);
        onEndRef.current?.();
    }, []);

    const onSeekCompletedCallback = useCallback((position: number) => {
        currentLogger.current?.debug(`Cast Manager - Seek completed: ${position}`);
        setCurrentTime(position);
    }, []);

    const onVolumeChangedCallback = useCallback((level: number, isMuted: boolean) => {
        currentLogger.current?.debug(`Cast Manager - Volume changed: ${level}, isMuted ${isMuted}`);
        setMuted(isMuted);
    }, []);

    // MEMORIZAR CONFIG
    const castManagerConfig = useMemo(() => ({
        enableYoubora: true,
        enableAds: true,
        defaultStartPosition: 0,
    }), []);

    // MEMORIZAR CALLBACKS OBJECT
    const castManagerCallbacks = useMemo(() => ({
        onContentLoaded: onContentLoadedCallback,
        onError: onErrorCallback,
        onPlaybackStarted: onPlaybackStartedCallback,
        onPlaybackEnded: onPlaybackEndedCallback,
        onSeekCompleted: onSeekCompletedCallback,
        onVolumeChanged: onVolumeChangedCallback
    }), [
        onContentLoadedCallback,
        onErrorCallback,
        onPlaybackStartedCallback,
        onPlaybackEndedCallback,
        onSeekCompletedCallback,
        onVolumeChangedCallback
    ]);

    // USAR CAST MANAGER para todas las acciones
    const castManager = useCastManager({
        ...castLoggerConfig,
        ...castManagerConfig
    }, castManagerCallbacks);

    // Refs para evitar dependencias en useCallbacks
    const castManagerRef = useRef(castManager);

    useEffect(() => {
        castManagerRef.current = castManager;
    }, [castManager]);

    // Hook para el estado de buffering
    const isBuffering = useIsBuffering({
        buffering: buffering || isLoadingContent,
        paused: paused,
        onBufferingChange: props.events?.onBuffering
    });

    // MONITOR DE CAST como en AudioCastFlavour
    useCastMonitor(castLoggerConfig, {
        onConnect: () => {
            currentLogger.current?.info(`Cast Monitor onConnect`);
        },
        onDisconnect: () => {
            currentLogger.current?.info(`Cast Monitor onDisconnect`);
            setIsContentLoaded(false);
            setIsLoadingContent(false);
            setHasTriedLoading(false);
        },
        onPlay: () => {
            currentLogger.current?.info(`Cast Monitor onPlay`);
            setPaused(false);
            setBuffering(false);
        },
        onPause: () => {
            currentLogger.current?.info(`Cast Monitor onPause`);
            setPaused(true);
        },
        onError: (error) => {
            currentLogger.current?.info(`Cast Monitor onError ${JSON.stringify(error)}`);
            setIsLoadingContent(false);
            handleOnError({ message: error.errorMessage || 'Cast error', code: error.errorCode || undefined });
        },
        onAudioTrackChange: (track: CastTrackInfo | null) => {
            if (track !== null) {
                currentLogger.current?.info(`Cast Monitor onAudioTrackChange ${JSON.stringify(track)}`);
            }
        },
        onTextTrackChange: (track: CastTrackInfo | null) => {
            if (track !== null) {
                currentLogger.current?.info(`Cast Monitor onTextTrackChange ${JSON.stringify(track)}`);
            }
        },
    });

    // INICIALIZAR PROGRESS MANAGERS
    useEffect(() => {
        // Initialize VOD Progress Manager only once
        if (!vodProgressManagerRef.current) {
            currentLogger.current?.debug(`Initializing VOD Progress Manager`);
            vodProgressManagerRef.current = new VODProgressManagerClass({
                logger: props.playerContext?.logger,
                loggerEnabled: props.logger?.progressManager?.enabled,
                loggerLevel: props.logger?.progressManager?.level,
                onProgressUpdate: onProgressUpdate,
                onSeekRequest: onSeekRequest
            });
        }

        // Initialize DVR Progress Manager only once
        if (!dvrProgressManagerRef.current) {
            currentLogger.current?.debug(`Initializing DVR Progress Manager`);
            dvrProgressManagerRef.current = new DVRProgressManagerClass({
                logger: props.playerContext?.logger,
                loggerEnabled: props.logger?.progressManager?.enabled,
                loggerLevel: props.logger?.progressManager?.level,
                playbackType: props.playerProgress?.liveValues?.playbackType,
                getEPGProgramAt: props.hooks?.getEPGProgramAt,
                onModeChange: onDVRModeChange,
                onProgramChange: onDVRProgramChange,
                onProgressUpdate: onProgressUpdate,
                onSeekRequest: onSeekRequest
            });
        }
    }, []);

    // Effect para manejar cambios en índices de audio/subtítulos
    useEffect(() => {
        setAudioIndex(props.audioIndex!);
    }, [props.audioIndex]);

    useEffect(() => {
        setSubtitleIndex(props.subtitleIndex!);
    }, [props.subtitleIndex]);

    // Effect para manejar cambios en tracks
    useEffect(() => {
        handleTrackChanges();
    }, [audioIndex, subtitleIndex, menuData]);

    useEffect(() => {
        if (menuData) {
            currentLogger.current?.debug(`useEffect menuData ready: ${JSON.stringify(menuData)}`);
            handleMenuDataReady();
        }
    }, [menuData]);

    useEffect(() => {
        if (castConnected && castProgress?.duration && castProgress?.duration > 0 && currentSourceType.current === 'content' && 
            !sourceRef.current?.isLive && !sourceRef.current?.isDVR) {

            if (sliderValues.current && sliderValues.current.duration !== castProgress?.duration) {
                currentLogger.current?.debug(`Updating sliderValues duration from Cast: ${castProgress.duration}s`);
                
                sliderValues.current = {
                    ...sliderValues.current,
                    duration: castProgress.duration
                };
                
                setSliderValuesUpdate((prev: number) => prev + 1);
            }
        }
    }, [castProgress.duration, castConnected]);

    // Detectar cuando el contenido termina
    useEffect(() => {
        if (castMedia.isIdle && isContentLoaded && currentSourceType.current) {
            currentLogger.current?.debug(`Cast content ended from idle state`);
            handleOnEnd();
        }
    }, [castMedia.isIdle, isContentLoaded]);

    // Procesar media tracks cuando estén disponibles (independiente de onLoad)
    useEffect(() => {
        if (castMedia.mediaTracks && castMedia.mediaTracks.length > 0 && isContentLoaded && !menuData) {
            currentLogger.current?.debug(`Processing media tracks from Cast: ${JSON.stringify(castMedia.mediaTracks)}`);
            
            if (props.hooks?.mergeCastMenuData && typeof(props.hooks.mergeCastMenuData) === 'function') {
                setMenuData(props.hooks.mergeCastMenuData(castMedia.mediaTracks, props.languagesMapping));
            } else {
                setMenuData(mergeCastMenuData(castMedia.mediaTracks, props.languagesMapping));
            }
        }
    }, [castMedia.mediaTracks, isContentLoaded, menuData, props.hooks?.mergeCastMenuData, props.languagesMapping]);


    // Cargar contenido cuando Cast esté listo
    useEffect(() => {
        if (castConnected && 
            sourceRef.current?.isReady && 
            currentSourceType.current === 'content' && 
            !isContentLoaded && 
            !isLoadingContent &&
            !hasTriedLoading &&
            castManager?.state?.canControl) {
            
            currentLogger.current?.debug(`Cast ready - Loading content automatically`);
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

            setTimeout(() => {
                loadContentWithCastManager(sourceData);
            }, 100);
        }
    }, [castConnected, isContentLoaded, isLoadingContent, hasTriedLoading, castManager]);

    // Sync con Cast states
    useEffect(() => {
        if (castConnected && castProgress.currentTime !== currentTime) {
            setCurrentTime(castProgress.currentTime);
        }
    }, [castProgress.currentTime, castConnected, currentTime]);

    useEffect(() => {
        const isPlaying = castPlaying;
        const shouldBePaused = !isPlaying;
        
        if (paused !== shouldBePaused) {
            setPaused(shouldBePaused);
        }
    }, [castPlaying, paused]);

    useEffect(() => {
        currentLogger.current?.debug(`useEffect muted - muted: ${!!muted}`);
        if (castVolume.isMuted !== muted) {
            setMuted(castVolume.isMuted);
        }
    }, [castVolume.isMuted, muted]);

    useEffect(() => {
        // Verificar si es contenido live/DVR vs VOD
        const isLiveContent = !!props.playerProgress?.isLive;

        if (isLiveContent) {
            handleLiveContent();
        } else {
            handleVODContent();
        }
    }, [props.manifests, props.isAutoNext, props.playerMetadata?.id]);

    const handleLiveContent = () => {
        currentLogger.current?.debug(`handleLiveContent`);
        
        if (!tudumRef.current) {
            tudumRef.current = new TudumClass({
                enabled: false,
                getTudumSource: props.hooks?.getTudumSource,
                getTudumManifest: props.hooks?.getTudumManifest,
            });
        }

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

        currentSourceType.current = 'content';
        isChangingSource.current = true;

        try {
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
            
        } catch (error: any) {
            currentLogger.current?.error(`changeSource failed: ${error?.message}`);
            handleOnError({ 
                error: { 
                    code: 'SOURCE_ERROR', 
                    error: error?.message || 'Failed to change source',
                    errorString: error?.message || 'Failed to change source',
                } 
            });
            return;
        }
    };

    const handleVODContent = () => {
        currentLogger.current?.debug(`handleVODContent`);
        
        // Reset completo solo para VOD
        currentSourceType.current = null;
        pendingContentSource.current = null;
        sliderValues.current = undefined;
        setIsContentLoaded(false);
        setHasTriedLoading(false);
        
        // Reset progress managers solo para VOD
        vodProgressManagerRef.current?.reset();
        dvrProgressManagerRef.current?.reset();

        const shouldPlayTudum = !!props.showExternalTudum && !props.isAutoNext && !props.playerProgress?.isLive;
        currentLogger.current?.debug(`shouldPlayTudum: ${shouldPlayTudum}`);

        if (!tudumRef.current) {
            tudumRef.current = new TudumClass({
                enabled: !!props.showExternalTudum,
                getTudumSource: props.hooks?.getTudumSource,
                getTudumManifest: props.hooks?.getTudumManifest,
                isAutoNext: props.isAutoNext
            });
        } else {
            tudumRef.current.updateAutoNextContext(!!props.isAutoNext);
        }

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
                isLive: false,
                isCast: true,
                headers: props.headers,
                getBestManifest: props.hooks?.getBestManifest,
                getSourceUri: props.hooks?.getSourceUri,
                onSourceChanged: onSourceChanged
            });
        }

        if (shouldPlayTudum && tudumRef.current?.isReady && !sourceRef.current?.isDownloaded) {
            currentLogger.current?.debug(`Will play tudum first, then content`);
            currentSourceType.current = 'tudum';
            loadTudumSource();
        } else {
            currentLogger.current?.debug(`Skipping tudum - loading content directly`);
            currentSourceType.current = 'content';
            loadContentSource();
        }
    };

    // LOAD TUDUM SOURCE
    const loadTudumSource = useCallback(async () => {
        currentLogger.current?.debug(`loadTudumSource`);
        
        if (!tudumRef.current?.source || !castConnected) {
            currentLogger.current?.debug(`loadTudumSource - Not ready:`, {
                hasSource: !!tudumRef.current?.source,
                castConnected
            });
            return;
        }

        try {
            currentSourceType.current = 'tudum';
            tudumRef.current.isPlaying = true;
            drm.current = tudumRef.current?.drm;
            setIsLoadingContent(true);
            
            currentLogger.current?.info(`Loading tudum to Cast:`, tudumRef.current.source);
            
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
            
        } catch (error: any) {
            setIsLoadingContent(false);
            currentSourceType.current = null;
            if (tudumRef.current) {
                tudumRef.current.isPlaying = false;
            }
            
            currentLogger.current?.error(`Failed to load tudum to Cast: ${JSON.stringify(error)}`);
            handleOnError({ 
                error: { 
                    code: 'CAST_TUDUM_ERROR', 
                    error: error?.message || 'Failed to load tudum to Cast',
                    errorString: error?.message || 'Failed to load tudum to Cast',
                } 
            });

            currentLogger.current?.debug(`Tudum failed, loading content directly`);
            currentSourceType.current = 'content';
            loadContentSource();
        }
    }, [castConnected]);

    // LOAD CONTENT SOURCE
    const loadContentSource = useCallback(() => {
        currentLogger.current?.debug(`loadContentSource`);
        
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
        }
    }, [props.playerMetadata, props.manifests, props.playerProgress, props.headers]);

    // SWITCH FROM TUDUM TO CONTENT
    const switchFromTudumToContent = useCallback(async () => {
        currentLogger.current?.debug(`switchFromTudumToContent`);
        
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
            // Si hay un source de contenido pendiente, usarlo directamente
            if (pendingContentSource.current && pendingContentSource.current.isReady) {
                currentLogger.current?.debug(`Loading pending content source directly`);
                currentSourceType.current = 'content';
                await loadContentWithCastManager(pendingContentSource.current);
                pendingContentSource.current = null;
            } else {
                // Cargar el contenido principal
                currentLogger.current?.debug(`Loading main content source`);
                currentSourceType.current = 'content';
                loadContentSource();
            }
        }, 100);
    }, [loadContentSource]);

    // LOAD CONTENT WITH CAST MANAGER
    const loadContentWithCastManager = useCallback(async (data: onSourceChangedProps) => {
        
        if (data && data.isReady && data.source && castManager?.state?.canControl) {
            currentLogger.current?.debug(`loadContentWithCastManager`);
            setIsLoadingContent(true);
            drm.current = data.drm;

            // Verificar si ya estamos reproduciendo el mismo contenido
            if (castMedia.url === data.source.uri && !castMedia.isIdle) {
                currentLogger.current?.info(`Content already loaded in Cast, skipping`);
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
                currentLogger.current?.error(`loadContentWithCastManager - Failed: ${JSON.stringify(error)}`);
                handleOnError({ message: error?.message || 'Failed to load content to Cast' });
            }
        }
    }, [castMedia, castManager, props.hooks, props.playerAnalytics, props.playerProgress, props.playerMetadata, props.liveStartDate, props.playerAds, props.events]);

    // SOURCE CHANGED HANDLER
    const onSourceChanged = useCallback((data: onSourceChangedProps) => {
        currentLogger.current?.debug(`onSourceChanged - currentSourceType: ${currentSourceType.current}`);
        currentLogger.current?.debug(`onSourceChanged - data: ${JSON.stringify(data)}`);
        
        if (!sourceRef.current?.isLive && !sourceRef.current?.isDownloaded && currentSourceType.current === 'tudum') {
            // Si estamos reproduciendo tudum, guardar el source del contenido para después
            currentLogger.current?.debug(`Saving content source for later (tudum is playing)`);
            pendingContentSource.current = data;
        } else if (currentSourceType.current === 'content') {
            currentLogger.current?.debug(`Processing content source normally`);

            if (data.isDVR && dvrProgressManagerRef.current) {
                dvrProgressManagerRef.current.setDVRWindowSeconds(data.dvrWindowSeconds || 3600);
            }
            
            updatePlayerProgressRef();
            loadContentWithCastManager(data);
        } else {
            currentLogger.current?.debug(`Initial state, processing source`);
            
            if (!currentSourceType.current) {
                currentSourceType.current = 'content';
            }
            
            updatePlayerProgressRef();
            loadContentWithCastManager(data);
        }

        if (sourceRef.current?.isLive && sourceRef.current?.isDVR) {
            dvrProgressManagerRef.current?.reset();
        }
    }, [loadContentWithCastManager]);

    // HANDLE TRACK CHANGES
    const handleTrackChanges = () => {
        currentLogger.current?.debug(`handleTrackChanges...`);
        let activeTracks:Array<number> = [];
        if (castConnected && menuData) {
            currentLogger.current?.debug(`handleTrackChanges - audio: ${audioIndex}, subtitle: ${subtitleIndex}`);
            // Usar la función existente de Cast para cambiar tracks
            if (castManager && menuData){

                if (typeof(audioIndex) === 'number'){
                    activeTracks.push( getTrackId('audio', audioIndex, menuData)! );
                }
                
                if (typeof(subtitleIndex) === 'number' && subtitleIndex !== -1){
                    activeTracks.push( getTrackId('text', subtitleIndex, menuData)! );
                }
        
                if (activeTracks.length){
                    currentLogger.current?.debug(`handleTrackChanges ${JSON.stringify(activeTracks)}`);
                    castManager.setActiveTrackIds(activeTracks);
                } else {
                    currentLogger.current?.warn(`handleTrackChanges empty ids... ${JSON.stringify(activeTracks)}`);
                }
        
            } else {
                currentLogger.current?.warn(`handleTrackChanges without objects: castManager ${!!castManager} / menuData ${!!menuData}`);
            }

        }
    };

    // HANDLE MENU DATA READY
    const handleMenuDataReady = () => {
        currentLogger.current?.debug(`handleMenuDataReady...`);

        if (menuData && props.events?.onChangeCommonData) {
            let data: ICommonData = {};
            let audioDefaultIndex = 0;
            let textDefaultIndex = -1;

            if (typeof(audioIndex) === 'number') {
                audioDefaultIndex = audioIndex;
            }

            if (typeof(subtitleIndex) === 'number') {
                textDefaultIndex = subtitleIndex;
            }

            data.audioIndex = audioDefaultIndex;
            data.audioLabel = menuData?.find((item: IPlayerMenuData) => item.type === PLAYER_MENU_DATA_TYPE.AUDIO && item.index === audioDefaultIndex)?.label;

            data.subtitleIndex = textDefaultIndex;
            data.subtitleLabel = menuData?.find((item: IPlayerMenuData) => item.type === PLAYER_MENU_DATA_TYPE.TEXT && item.index === textDefaultIndex)?.label;

            currentLogger.current?.debug(`handleMenuDataReady ${JSON.stringify(data)}`);

            if (data) {
                props.events.onChangeCommonData(data);
            }
        }
    };

    const updatePlayerProgressRef = useCallback(() => {
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
            currentLogger.current?.error(`updatePlayerProgressRef - error ${ex?.message}`);
        }
    }, [paused, muted, isContentLoaded, currentTime, props.playerProgress]);

    const onDVRModeChange = useCallback((data: ModeChangeData) => {
        currentLogger.current?.debug(`onDVRModeChange: ${JSON.stringify(data)}`);
    }, []);

    const onDVRProgramChange = useCallback((data: ProgramChangeData) => {
        currentLogger.current?.debug(`onDVRProgramChange: ${JSON.stringify(data)}`);
    }, []);

    const onProgressUpdate = useCallback((data: ProgressUpdateData) => {
        // Solo actualizar sliderValues si estamos reproduciendo contenido, no tudum
        if (currentSourceType.current === 'content') {
            currentLogger.current?.debug(`onProgressUpdate: ${JSON.stringify(data)}`);
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

            updatePlayerProgressRef();

            // Trigger re-render del useEffect para emitir eventos con nuevos sliderValues
            setSliderValuesUpdate((prev: number) => prev + 1);
        }
    }, []);

    const onSeekRequest = useCallback((playerTime: number) => {
        if (!!castManagerRef.current){
            currentLogger.current?.debug(`onSeekRequest: ${playerTime}`);
            castManagerRef.current.seek(playerTime);
        } else {
            currentLogger.current?.warn(`onSeekRequest - castManager is not initialized`);
        }
    }, []);

    // Actualizar callbacks del DVRProgressManagerClass cuando cambien
    useEffect(() => {        
        if (vodProgressManagerRef.current && !sourceRef.current?.isLive) {
            vodProgressManagerRef.current?.updateCallbacks({
                onProgressUpdate: onProgressUpdate,
                onSeekRequest: onSeekRequest
            });
        }

        if (dvrProgressManagerRef.current && sourceRef.current?.isDVR) {
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

    // SIMULAR EVENTOS DEL PLAYER
    const onLoad = useCallback(async (e: { currentTime: number; duration: number }) => {
        currentLogger.current?.info(`onLoad - duration: ${e.duration}, currentTime: ${e.currentTime}`);

        if (currentSourceType.current === 'content' && e.duration > 0) {
            currentLogger.current?.debug(`onLoad - Processing content load`);

            if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR && e.duration) {
                currentLogger.current?.debug(`onLoad - Setting VOD duration from load event: ${e.duration}s`);
                vodProgressManagerRef.current?.updatePlayerData({
                    currentTime: e.currentTime || 0,
                    seekableRange: { start: 0, end: e.duration },
                    duration: e.duration,
                    isBuffering: false,
                    isPaused: paused
                });
            }

            if (sourceRef.current?.isDVR && sourceRef.current?.dvrWindowSeconds) {
                currentLogger.current?.debug(`onLoad - Configuring DVR window: ${sourceRef.current.dvrWindowSeconds}s`);
                dvrProgressManagerRef.current?.setDVRWindowSeconds(sourceRef.current.dvrWindowSeconds);
            }

            isChangingSource.current = false;
            setIsContentLoaded(true);
            setIsLoadingContent(false);

            currentLogger.current?.debug(`onLoad - mediaTracks: ${JSON.stringify(castMedia.mediaTracks)}`);
            
            if (castMedia.mediaTracks && castMedia.mediaTracks.length > 0) {
                if (props.hooks?.mergeCastMenuData && typeof(props.hooks.mergeCastMenuData) === 'function') {
                    setMenuData(props.hooks.mergeCastMenuData(castMedia.mediaTracks, props.languagesMapping));
                } else {
                    setMenuData(mergeCastMenuData(castMedia.mediaTracks, props.languagesMapping));
                }
            }

            if (props.events?.onStart) {
                props.events.onStart();
            }

            if (sourceRef.current?.isDVR && dvrProgressManagerRef.current) {
                dvrProgressManagerRef.current?.checkInitialSeek('cast', isLiveProgramRestricted);
            }

        } else if (currentSourceType.current === 'tudum') {
            currentLogger.current?.debug(`onLoad - Tudum loaded, duration: ${e.duration}`);
            setIsLoadingContent(false);
        }
    }, [paused, props.events, castMedia.mediaTracks]);

    const handleOnEnd = useCallback(() => {
        currentLogger.current?.info(`handleOnEnd: currentSourceType ${currentSourceType.current}, isAutoNext: ${props.isAutoNext}`);
        
        if (currentSourceType.current === 'tudum') {
            currentLogger.current?.debug(`handleOnEnd: Tudum finished, switching to main content`);
            isChangingSource.current = true;
            switchFromTudumToContent();

        } else if (currentSourceType.current === 'content' && props.events?.onEnd) {
            currentLogger.current?.debug(`handleOnEnd: Content finished, preparing for possible auto next`);
            
            if (tudumRef.current) {
                tudumRef.current.prepareForAutoNext();
            }
            
            props.events.onEnd();
        }
    }, [props.isAutoNext, props.events, switchFromTudumToContent]);

    const handleOnError = useCallback((message: string, code?: string | number) => {
        currentLogger.current?.error(`handleOnError: ${JSON.stringify(message)} (${code}) - currentSourceType: ${currentSourceType.current}`);
        setIsLoadingContent(false);

        if (props.events?.onError && typeof(props.events.onError) === 'function'){
            props.events.onError({ error: {
                errorString: message,
                errorException: message,
                errorCode: code?.toString(),
                error: message,
                code: code
            } });
        }
    }, [props.events?.onError]);

    // PROGRESS SIMULATION usando castProgress
    useEffect(() => {
        if (!castConnected) return;

        const e = {
            currentTime: castProgress.currentTime,
            seekableDuration: castProgress.duration || 0
        };

        currentLogger.current?.debug(`Simulating onProgress - castProgress: ${JSON.stringify(castProgress)}`);
        currentLogger.current?.debug(`Simulating onProgress: ${JSON.stringify(e)}`);

        // Solo procesar progreso para contenido principal, no para tudum
        if (currentSourceType.current === 'content') {
            if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR) {
                vodProgressManagerRef.current?.updatePlayerData({
                    currentTime: e.currentTime,
                    seekableRange: { start: 0, end: e.seekableDuration },
                    duration: e.seekableDuration,
                    isBuffering: isBuffering || isLoadingContent,
                    isPaused: paused
                });
            }

            if (sourceRef.current?.isDVR) {
                dvrProgressManagerRef.current?.updatePlayerData({
                    currentTime: e.currentTime,
                    duration: e.seekableDuration,
                    seekableRange: { start: 0, end: e.seekableDuration },
                    isBuffering: isBuffering || isLoadingContent,
                    isPaused: paused
                });
            }

            if (!sourceRef.current?.isLive && props?.events?.onChangeCommonData) {
                props.events.onChangeCommonData({
                    time: e.currentTime,
                    duration: e.seekableDuration,
                });
            }
        }
    }, [castProgress.currentTime, castProgress.duration, castConnected, paused, isBuffering, isLoadingContent, props?.events?.onChangeCommonData]);

    // ASSIGN CALLBACKS TO REFS
    useEffect(() => {
        onLoadRef.current = onLoad;
        onEndRef.current = handleOnEnd;
        onErrorRef.current = handleOnError;
    }, [onLoad, handleOnEnd, handleOnError]);

    // CONTROLS PRESS HANDLER
    const onControlsPress = useCallback((id: CONTROL_ACTION, value?: number | boolean) => {
        const COMMON_DATA_FIELDS = ['time', 'volume', 'mute', 'pause', 'audioIndex', 'subtitleIndex'];

        currentLogger.current?.info(`onControlsPress: ${id} (${value})`);

        if (id === CONTROL_ACTION.PAUSE) {
            setPaused(!!value);
            if (value) {
                castManagerRef.current?.pause();
            } else {
                castManagerRef.current?.play();
            }
        }

        if (id === CONTROL_ACTION.MUTE) {
            setMuted(!!value);
            if (value) {
                castManagerRef.current?.mute();
            } else {
                castManagerRef.current?.unmute();
            }
        }

        if (id === CONTROL_ACTION.VOLUME && typeof value === 'number') {
            castManagerRef.current?.setVolume(value);
        }

        if (id === CONTROL_ACTION.NEXT && props.events?.onNext) {
            setIsContentLoaded(false);
            props.events?.onNext();
        }

        if (id === CONTROL_ACTION.PREVIOUS && props.events?.onPrevious) {
            setIsContentLoaded(false);
            props.events.onPrevious();
        }

        if (id === CONTROL_ACTION.LIVE_START_PROGRAM && sourceRef.current?.isDVR){
            
            const timestamp = props.events?.onLiveStartProgram?.();
            currentLogger.current?.debug(`onControlsPress: ${id} (${value}) - timestamp: ${timestamp}`);
            
            if (typeof(timestamp) === 'number'){
                isChangingSource.current = true;
                setIsContentLoaded(false);
                setBuffering(true);
                setIsLiveProgramRestricted(true);

                if (sourceRef.current){
                    sourceRef.current.changeDvrUriParameters(timestamp);
                }

                if (dvrProgressManagerRef.current){
                    dvrProgressManagerRef.current?.reset();
                    dvrProgressManagerRef.current?.setPlaybackType(DVR_PLAYBACK_TYPE.PROGRAM);
                }

                const sourceData: onSourceChangedProps = {
                    id: sourceRef.current?.id,
                    source: sourceRef.current?.playerSource,
                    drm: sourceRef.current?.playerSourceDrm,
                    dvrWindowSeconds: sourceRef.current?.dvrWindowSeconds,
                    isLive: sourceRef.current?.isLive,
                    isDVR: sourceRef.current?.isDVR,
                    isFakeVOD: sourceRef.current?.isFakeVOD,
                    isReady: true
                };

                setTimeout(() => {
                    loadContentWithCastManager(sourceData);
                }, 100);

            }
            
        }

        if (id === CONTROL_ACTION.LIVE && sourceRef.current?.isDVR) {

            if (isLiveProgramRestricted){
                isChangingSource.current = true;
                setIsContentLoaded(false);
                setBuffering(true);
                setIsLiveProgramRestricted(false);

                if (sourceRef.current){
                    sourceRef.current.reloadDvrStream();
                }

                const sourceData: onSourceChangedProps = {
                    id: sourceRef.current?.id,
                    source: sourceRef.current?.playerSource,
                    drm: sourceRef.current?.playerSourceDrm,
                    dvrWindowSeconds: sourceRef.current?.dvrWindowSeconds,
                    isLive: sourceRef.current?.isLive,
                    isDVR: sourceRef.current?.isDVR,
                    isFakeVOD: sourceRef.current?.isFakeVOD,
                    isReady: true
                };

                dvrProgressManagerRef.current?.reset();

                setTimeout(() => {
                    loadContentWithCastManager(sourceData);
                    
                    
                }, 100);

            } else {
                // Volver al directo en DVR
                dvrProgressManagerRef.current?.goToLive();
            }
        }

        if (id === CONTROL_ACTION.SEEK_OVER_EPG && sourceRef.current?.isDVR) {
            dvrProgressManagerRef.current?.goToProgramStart();
        }

        if (id === CONTROL_ACTION.SEEK && sourceRef.current?.isDVR) {
            dvrProgressManagerRef.current?.seekToTime(value as number);
        } else if (id === CONTROL_ACTION.SEEK && !sourceRef.current?.isLive) {
            vodProgressManagerRef.current?.seekToTime(value as number);
        }

        if (id === CONTROL_ACTION.FORWARD && sourceRef.current?.isDVR) {
            dvrProgressManagerRef.current?.skipForward(value as number);
        } else if (id === CONTROL_ACTION.FORWARD && !sourceRef.current?.isLive) {
            vodProgressManagerRef.current?.skipForward(value as number);
        }

        if (id === CONTROL_ACTION.BACKWARD && sourceRef.current?.isDVR) {
            dvrProgressManagerRef.current?.skipBackward(value as number);
        } else if (id === CONTROL_ACTION.BACKWARD && !sourceRef.current?.isLive) {
            vodProgressManagerRef.current?.skipBackward(value as number);
        }

        // Actions to be saved between flavours
        if (COMMON_DATA_FIELDS.includes(id) && props?.events?.onChangeCommonData) {
            let data: ICommonData = {};

            if (id === CONTROL_ACTION.MUTE) {
                data.muted = !!value;
            } else if (id === CONTROL_ACTION.PAUSE) {
                data.paused = !!value;
            } else if (typeof(value) === 'number') {
                data.volume = (id === CONTROL_ACTION.VOLUME) ? value : undefined;
                data.audioIndex = (id === CONTROL_ACTION.AUDIO_INDEX) ? value : undefined;
                data.subtitleIndex = (id === CONTROL_ACTION.SUBTITLE_INDEX) ? value : undefined;
                data.audioLabel = menuData?.find((item: IPlayerMenuData) => item.type === PLAYER_MENU_DATA_TYPE.AUDIO && item.index === value)?.label;
                data.subtitleLabel = menuData?.find((item: IPlayerMenuData) => item.type === PLAYER_MENU_DATA_TYPE.TEXT && item.index === value)?.label;
            }
            
            props.events?.onChangeCommonData(data);
        }
    }, [props.events, menuData]);

    const onSlidingComplete = useCallback((value: number) => {
        currentLogger.current?.debug(`onSlidingComplete: ${value}`);
        onControlsPress(CONTROL_ACTION.SEEK, value);
    }, [onControlsPress]);

    return (
        <View style={styles.container}>
            <BackgroundPoster poster={props.playerMetadata?.poster} />

            {!tudumRef.current?.isPlaying ? (
                <Overlay
                    preloading={isBuffering}
                    thumbnailsMetadata={sourceRef.current?.currentManifest?.thumbnailMetadata}
                    timeMarkers={props.timeMarkers}
                    avoidTimelineThumbnails={props.avoidTimelineThumbnails}
                    
                    alwaysVisible={true}
                    isChangingSource={isChangingSource.current}
                    
                    isContentLoaded={isContentLoaded}
                    
                    menuData={menuData}
                    audioIndex={audioIndex}
                    subtitleIndex={subtitleIndex}

                    // Nuevas Props Agrupadas
                    playerMetadata={props.playerMetadata}
                    playerProgress={{
                        ...props.playerProgress,
                        currentTime: currentTime,
                        duration: sliderValues.current?.duration || 0,
                        isBuffering: isBuffering,
                        isContentLoaded: isContentLoaded,
                        isChangingSource: isChangingSource.current,
                        isDVR: sourceRef.current?.isDVR,
                        isLive: sourceRef.current?.isLive,
                        isPaused: paused,
                        isMuted: muted,
                        sliderValues: sliderValues.current,
                    }}
                    playerAnalytics={props.playerAnalytics}
                    playerTimeMarkers={props.playerTimeMarkers}
                    playerAds={props.playerAds}

                    // Custom Components
                    components={props.components}

                    // Events
                    events={{
                        ...props.events,
                        onPress: onControlsPress,
                        onSlidingComplete: onSlidingComplete,
                    }}
                />
            ) : null}
        </View>
    );
}

export default CastFlavour;