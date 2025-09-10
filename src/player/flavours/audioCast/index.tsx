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

import { PlayerError, handleErrorException } from "../../core/errors";
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
    type LoggerConfigBasic,
    CONTROL_ACTION,
    LogLevel,
    ProgressUpdateData,
    YOUBORA_FORMAT
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

    const castLoggerConfig: LoggerConfigBasic = {
        enabled: props.logger?.cast?.enabled ?? true,
        level: props.logger?.cast?.level ?? LogLevel.INFO,
        instanceId: props.playerContext?.getInstanceId() || undefined,
    };

    // USAR HOOKS PERSONALIZADOS en lugar de los nativos
    const castConnected = useCastConnected(castLoggerConfig);
    const castMedia = useCastMedia(castLoggerConfig);
    const castPlaying = useCastPlaying(castLoggerConfig);
    const castProgress = useCastProgress(castLoggerConfig);
    const castVolume = useCastVolume(castLoggerConfig);

    // Logger
    if (!currentLogger.current && props.playerContext?.logger){
        currentLogger.current = props.playerContext?.logger?.forComponent('Audio Cast Flavour', castLoggerConfig.enabled, castLoggerConfig.level);
    }

    const onContentLoadedCallback = useCallback((content: CastContentInfo) => {
        currentLogger.current?.info(`Cast Manager - Content loaded: ${content.source.uri}`);
        setIsLoadingContent(false);
        isChangingSource.current = false;
        setIsContentLoaded(true);
        setHasTriedLoading(true);
        
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
        onErrorRef.current?.(error);
    }, []);

    const onPlaybackStartedCallback = useCallback(() => {
        currentLogger.current?.info(`Cast Manager - Playback started`);
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

    // MEMORIZAR CONFIG también
    const castManagerConfig = useMemo(() => ({
        enableYoubora: true,
        enableAds: true,
        defaultStartPosition: 0,
        debugMode: true,
        level: LogLevel.DEBUG
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
    const onErrorRef = useRef<(error: PlayerError) => void>();

    // Hook para el estado de buffering
    const isBuffering = useIsBuffering({
        buffering: buffering || isLoadingContent,
        paused: paused,
        onBufferingChange: props.events?.onBuffering
    });

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
        onError: (error: PlayerError) => {
            currentLogger.current?.info(`Cast Monitor onError ${JSON.stringify(error)}`);
            setIsLoadingContent(false);
            // No resetear hasTriedLoading para evitar loops infinitos
            handleOnError(error);
        }
    });

    useEffect(() => {
        if (castConnected && castProgress?.duration && castProgress?.duration > 0 && currentSourceType.current === 'content' && 
            !sourceRef.current?.isLive && !sourceRef.current?.isDVR) {

            if (sliderValues.current && sliderValues.current.duration !== castProgress?.duration) {
                currentLogger.current?.debug(`Updating sliderValues duration from Cast: ${castProgress.duration}s`);
                
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
            currentLogger.current?.debug(`Cast content ended from idle state`);
            handleOnEnd();
        }
    }, [castMedia.isIdle, isContentLoaded]);

    // useEffect para cargar contenido cuando Cast esté listo
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
    }, [castPlaying, paused]);

    // Sync with Cast volume with debounce to prevent immediate override
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
            handleOnError(handleErrorException(error, 'PLAYER_MEDIA_LOAD_FAILED'));
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
                    throw new PlayerError("PLAYER_CAST_CONNECTION_FAILED");
                }

            } catch (error: any) {
                setIsLoadingContent(false);
                currentLogger.current?.error(`loadContentWithCastManager - Failed: ${JSON.stringify(error)}`);
                handleOnError(handleErrorException(error, 'PLAYER_CAST_OPERATION_FAILED'));
            }
        }
    }, [castMedia, castManager, props.hooks, props.playerAnalytics, props.playerProgress, props.playerMetadata, props.liveStartDate, props.playerAds, props.events]);

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
                throw new PlayerError("PLAYER_CAST_CONNECTION_FAILED");
            }
            
        } catch (error: any) {
            setIsLoadingContent(false);
            currentSourceType.current = null;
            if (tudumRef.current) {
                tudumRef.current.isPlaying = false;
            }
            
            currentLogger.current?.error(`Failed to load tudum to Cast: ${JSON.stringify(error)}`);
            handleOnError(handleErrorException(error, 'PLAYER_CAST_OPERATION_FAILED'));

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
            try {
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
            } catch (error: any) {
                handleOnError(handleErrorException(error, 'PLAYER_MEDIA_LOAD_FAILED'));
                return;
            }
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

    const updatePlayerProgressRef = useCallback(() => {

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
            try {
                currentLogger.current?.debug(`onSeekRequest: ${playerTime}`);
                castManagerRef.current.seek(playerTime);
            } catch (error: any) {
                currentLogger.current?.error(`onSeekRequest failed: ${error?.message}`);
                handleOnError(handleErrorException(error, 'PLAYER_CAST_OPERATION_FAILED'));
            }
        } else {
            currentLogger.current?.warn(`onSeekRequest - castManager is not initialized`);
            handleOnError(new PlayerError("PLAYER_CAST_NOT_READY"));
        }
    }, []);

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

        currentLogger.current?.info(`onControlsPress: ${id} (${value})`);

        if (id === CONTROL_ACTION.PAUSE){
            try {
                if (value) {
                    await castManagerRef.current?.pause();
                } else {
                    await castManagerRef.current?.play();
                }
            } catch (error: any) {
                currentLogger.current?.error(`Pause/Play operation failed: ${error?.message}`);
                handleOnError(handleErrorException(error, 'PLAYER_CAST_OPERATION_FAILED'));
            }
        }

        if (id === CONTROL_ACTION.CLOSE_AUDIO_PLAYER){
            try {
                await castManagerRef.current?.stop();
                if (props.events?.onClose){
                    props.events.onClose();
                }
            } catch (error: any) {
                currentLogger.current?.error(`Stop operation failed: ${error?.message}`);
                handleOnError(handleErrorException(error, 'PLAYER_CAST_OPERATION_FAILED'));
            }
        }
        
        if (id === CONTROL_ACTION.MUTE){
            try {
                if (value) {
                    await castManagerRef.current?.mute();
                } else {
                    await castManagerRef.current?.unmute();
                }
            } catch (error: any) {
                currentLogger.current?.error(`Mute/Unmute operation failed: ${error?.message}`);
                handleOnError(handleErrorException(error, 'PLAYER_CAST_OPERATION_FAILED'));
            }
        }

        if (id === CONTROL_ACTION.VOLUME && typeof(value) === 'number'){
            try {
                await castManagerRef.current?.setVolume(value);
            } catch (error: any) {
                currentLogger.current?.error(`Volume operation failed: ${error?.message}`);
                handleOnError(handleErrorException(error, 'PLAYER_CAST_OPERATION_FAILED'));
            }
        }
        
        if (id === CONTROL_ACTION.NEXT && props.events?.onNext){            
            setIsContentLoaded(false);
            props.events.onNext();
        }

        if (id === CONTROL_ACTION.PREVIOUS && props.events?.onPrevious){
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
            currentLogger.current?.info(`[Player] (Audio Cast Flavour) audioPlayerAction received: ${JSON.stringify(data)}`);
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
        currentLogger.current?.info(`onLoad - duration: ${e.duration}, currentTime: ${e.currentTime}`);

        // Solo procesar onLoad para contenido principal, no para tudum
        if (currentSourceType.current === 'content' && e.duration > 0) {
            currentLogger.current?.debug(`onLoad - Processing content load`);

            // Para VOD, establecer la duración desde el evento onLoad
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

            if (props.events?.onStart) {
                props.events.onStart();
            }

            if (sourceRef.current?.isDVR && dvrProgressManagerRef.current) {
                dvrProgressManagerRef.current?.checkInitialSeek('cast');
            }

        } else if (currentSourceType.current === 'tudum') {
            currentLogger.current?.debug(`onLoad - Tudum loaded, duration: ${e.duration}`);
            setIsLoadingContent(false);
        }
    }, [isContentLoaded, paused, props.events]);

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

    // Simular onProgress usando castProgress
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
            if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR){
                vodProgressManagerRef.current?.updatePlayerData({
                    currentTime: e.currentTime,
                    seekableRange: { start: 0, end: e.seekableDuration },
                    duration: e.seekableDuration,
                    isBuffering: isBuffering || isLoadingContent,
                    isPaused: paused
                });
            }

            if (sourceRef.current?.isDVR){
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

    }, [castProgress.currentTime, castProgress.duration, castConnected, paused, isBuffering, isLoadingContent, props?.events?.onChangeCommonData]);

    const handleOnError = useCallback((error: PlayerError) => {
        currentLogger.current?.error(`handleOnError: ${JSON.stringify(error?.message)} (${error?.code}) - currentSourceType: ${currentSourceType.current}`);
        setIsLoadingContent(false);

        if (props.events?.onError && typeof(props.events.onError) === 'function'){
            props.events.onError(error);
        }
    }, [props.events?.onError]);

    useEffect(() => {
        onLoadRef.current = onLoad;
        onEndRef.current = handleOnEnd;
        onErrorRef.current = handleOnError;
    }, [onLoad, handleOnEnd, handleOnError]);

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