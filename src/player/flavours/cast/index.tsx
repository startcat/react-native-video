import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { Overlay } from '../../components/overlay';
import { BackgroundPoster } from '../../components/poster';

import { styles } from '../styles';

import {
    CONTROL_ACTION,
    PLAYER_MENU_DATA_TYPE,
    YOUBORA_FORMAT,
    type CastFlavourProps,
    type ICommonData,
    type IDrm,
    type IMappedYoubora,
    type IPlayerMenuData
} from '../../types';

import {
    type IPlayerProgress,
    type ProgressUpdateData,
    type SliderValues
} from '../../../types';

import {
    DVRProgressManagerClass,
    type ModeChangeData,
    type ProgramChangeData
} from '../../core/progress';

import { mergeCastMenuData } from '../../utils';
import {
    getTrackId
} from '../actions/cast';

import { useIsBuffering } from '../../modules/buffer';
import { SourceClass, type onSourceChangedProps } from '../../modules/source';
import { TudumClass } from '../../modules/tudum';
import { VODProgressManagerClass } from '../../modules/vod';

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

import { type CastContentInfo, type CastTrackInfo } from '../../features/cast/types/types';

export function CastFlavour(props: CastFlavourProps): React.ReactElement {
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

    const isChangingSource = useRef<boolean>(true);
    const sliderValues = useRef<SliderValues>();
    const playerProgressRef = useRef<IPlayerProgress>();
    const youboraForVideo = useRef<IMappedYoubora>();
    const drm = useRef<IDrm>();

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

    // ✅ USAR HOOKS INDIVIDUALES DE CAST como en AudioCastFlavour
    const castConnected = useCastConnected();
    const castMedia = useCastMedia();
    const castPlaying = useCastPlaying();
    const castProgress = useCastProgress();
    const castVolume = useCastVolume();

    // ✅ CREATE REFS FOR MAIN CALLBACKS to avoid circular dependencies
    const onLoadRef = useRef<(e: { currentTime: number; duration: number }) => void>();
    const onEndRef = useRef<() => void>();
    const onErrorRef = useRef<(e: any) => void>();

    // ✅ CALLBACKS DEL CAST MANAGER
    const onContentLoadedCallback = useCallback((content: CastContentInfo) => {
        console.log(`[Player] (Cast Flavour) Cast Manager - Content loaded:`, content.source.uri);
        setIsLoadingContent(false);
        isChangingSource.current = false;
        setIsContentLoaded(true);
        setHasTriedLoading(true);
        
        // Simular onLoad con duración si está disponible
        setTimeout(() => {
            if (castProgress.duration && castProgress.duration > 0) {
                const duration = castProgress.duration;
                console.log(`[Player] (Cast Flavour) onContentLoadedCallback - calling onLoad with duration: ${duration}`);
                onLoadRef.current?.({
                    currentTime: content.metadata.startPosition || 0,
                    duration: duration
                });
            }
        }, 100);
    }, [castProgress.duration]);

    const onContentLoadErrorCallback = useCallback((error: string, content: CastContentInfo) => {
        console.log(`[Player] (Cast Flavour) Cast Manager - Content load error:`, error);
        setIsLoadingContent(false);
        onErrorRef.current?.({ message: error });
    }, []);

    const onPlaybackStartedCallback = useCallback(() => {
        console.log(`[Player] (Cast Flavour) Cast Manager - Playback started`);
        setPaused(false);
        setBuffering(false);
        
        // Si no estaba cargado, marcarlo como cargado
        if (!isContentLoaded) {
            setIsContentLoaded(true);
            isChangingSource.current = false;

            console.log(`[Player] (Cast Flavour) Cast Manager - Playback started - mediaTracks:`, castMedia.mediaTracks);
            
            if (castMedia.mediaTracks && castMedia.mediaTracks.length > 0) {
                if (props.hooks?.mergeCastMenuData && typeof(props.hooks.mergeCastMenuData) === 'function') {
                    setMenuData(props.hooks.mergeCastMenuData(castMedia.mediaTracks, props.languagesMapping));
                } else {
                    setMenuData(mergeCastMenuData(castMedia.mediaTracks, props.languagesMapping));
                }
            }
        }
    }, [isContentLoaded, castMedia.mediaTracks]);

    const onPlaybackEndedCallback = useCallback(() => {
        console.log(`[Player] (Cast Flavour) Cast Manager - Playback ended`);
        onEndRef.current?.();
    }, []);

    const onSeekCompletedCallback = useCallback((position: number) => {
        console.log(`[Player] (Cast Flavour) Cast Manager - Seek completed:`, position);
        setCurrentTime(position);
    }, []);

    const onVolumeChangedCallback = useCallback((level: number, isMuted: boolean) => {
        console.log(`[Player] (Cast Flavour) Cast Manager - Volume changed:`, { level, isMuted });
        setMuted(isMuted);
    }, []);

    // ✅ MEMORIZAR CONFIG
    const castManagerConfig = useMemo(() => ({
        enableYoubora: true,
        enableAds: true,
        defaultStartPosition: 0,
        debugMode: true
    }), []);

    // ✅ MEMORIZAR CALLBACKS OBJECT
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

    // ✅ USAR CAST MANAGER para todas las acciones
    const castManager = useCastManager(castManagerCallbacks, castManagerConfig);

    // Hook para el estado de buffering
    const isBuffering = useIsBuffering({
        buffering: buffering || isLoadingContent,
        paused: paused,
        onBufferingChange: props.events?.onBuffering
    });

    // ✅ MONITOR DE CAST como en AudioCastFlavour
    useCastMonitor({
        onConnect: () => {
            console.log(`[Player] (Cast Flavour) Cast connected`);
            setHasTriedLoading(false);
        },
        onDisconnect: () => {
            console.log(`[Player] (Cast Flavour) Cast disconnected`);
            setIsContentLoaded(false);
            setIsLoadingContent(false);
            setHasTriedLoading(false);
        },
        onPlay: () => {
            console.log(`[Player] (Cast Flavour) Cast started playing`);
            setPaused(false);
            setBuffering(false);
        },
        onPause: () => {
            console.log(`[Player] (Cast Flavour) Cast paused`);
            setPaused(true);
        },
        onError: (error) => {
            console.log(`[Player] (Cast Flavour) Cast error:`, error);
            setIsLoadingContent(false);
            setHasTriedLoading(false);
            onError({ message: error.errorMessage || 'Cast error' });
        },
        onAudioTrackChange: (track: CastTrackInfo | null) => {
            if (track !== null) {
                console.log(`[Player] (Cast Flavour) Audio track changed:`, track);
            }
        },
        onTextTrackChange: (track: CastTrackInfo | null) => {
            if (track !== null) {
                console.log(`[Player] (Cast Flavour) Text track changed:`, track);
            }
        },
    });

    // ✅ INICIALIZAR PROGRESS MANAGERS
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
            console.log(`[Player] (Cast Flavour) Initializing DVR Progress Manager`);
            console.log(`[Player] (Cast Flavour) EPG hooks available - getEPGProgramAt: ${!!props.hooks?.getEPGProgramAt}`);
            
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

    // Effect para manejar cambios en índices de audio/subtítulos
    useEffect(() => {
        console.log(`[Player] (Cast Flavour) useEffect audioIndex - audioIndex: ${props.audioIndex}`);
        setAudioIndex(props.audioIndex!);
    }, [props.audioIndex]);

    useEffect(() => {
        console.log(`[Player] (Cast Flavour) useEffect subtitleIndex - subtitleIndex: ${props.subtitleIndex}`);
        setSubtitleIndex(props.subtitleIndex!);
    }, [props.subtitleIndex]);

    // Effect para manejar cambios en tracks
    useEffect(() => {
        handleTrackChanges();
    }, [audioIndex, subtitleIndex, menuData]);

    useEffect(() => {
        if (menuData) {
            handleMenuDataReady();
        }
    }, [menuData]);

    // ✅ SYNC CON CAST PROGRESS
    useEffect(() => {
        if (castConnected && castProgress?.duration && castProgress?.duration > 0 && currentSourceType.current === 'content' && 
            !sourceRef.current?.isLive && !sourceRef.current?.isDVR) {
            
            console.log(`[Player] (Cast Flavour) Updating sliderValues duration from Cast: ${castProgress.duration}s`);

            if (sliderValues.current && sliderValues.current.duration === 0) {
                console.log(`[Player] (Cast Flavour) Updating sliderValues duration from Cast: ${castProgress.duration}s`);
                
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
            console.log(`[Player] (Cast Flavour) Cast content ended`);
            onEnd();
        }
    }, [castMedia.isIdle, isContentLoaded]);

    // ✅ CARGAR CONTENIDO CUANDO CAST ESTÉ LISTO
    useEffect(() => {
        if (castConnected && 
            sourceRef.current?.isReady && 
            currentSourceType.current === 'content' && 
            !isContentLoaded && 
            !isLoadingContent &&
            !hasTriedLoading) {
            
            console.log(`[Player] (Cast Flavour) Cast ready - Loading content automatically`);
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
    }, [castConnected, sourceRef.current?.isReady, currentSourceType.current, isContentLoaded, isLoadingContent, hasTriedLoading]);

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
        console.log(`[Player] (Cast Flavour) useEffect muted - muted: ${muted}`);
        if (castVolume.isMuted !== muted) {
            //setMuted(castVolume.isMuted);
        }
    }, [castVolume.isMuted, muted]);

    // ✅ USEEFFECT MANIFESTS similar a NormalFlavour
    useEffect(() => {
        console.log(`[Player] (Cast Flavour) useEffect manifests - isAutoNext: ${props.isAutoNext}`);
        console.log(`[Player] (Cast Flavour) useEffect manifests - content ID: ${props.playerMetadata?.id}`);

        // Verificar si es contenido live/DVR vs VOD
        const isLiveContent = !!props.playerProgress?.isLive;

        if (isLiveContent) {
            handleLiveContent();
        } else {
            handleVODContent();
        }
    }, [props.manifests, props.isAutoNext, props.playerMetadata?.id]);

    // ✅ HANDLERS PARA LIVE Y VOD CONTENT
    const handleLiveContent = () => {
        console.log(`[Player] (Cast Flavour) handleLiveContent`);
        
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
                headers: props.headers,
                getSourceUri: props.hooks?.getSourceUri,
                onSourceChanged: onSourceChanged
            });
        }

        currentSourceType.current = 'content';
        isChangingSource.current = true;
        
        sourceRef.current.changeSource({
            id: props.playerMetadata?.id,
            title: props.playerMetadata?.title,
            subtitle: props.playerMetadata?.subtitle,
            description: props.playerMetadata?.description,
            poster: props.playerMetadata?.poster,
            squaredPoster: props.playerMetadata?.squaredPoster,
            manifests: props.manifests,
            startPosition: props.playerProgress?.currentTime || 0,
            isLive: !!props.playerProgress?.isLive,
            headers: props.headers,
        });
    };

    const handleVODContent = () => {
        console.log(`[Player] (Cast Flavour) handleVODContent`);
        
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
        console.log(`[Player] (Cast Flavour) shouldPlayTudum: ${shouldPlayTudum}`);

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
                headers: props.headers,
                getSourceUri: props.hooks?.getSourceUri,
                onSourceChanged: onSourceChanged
            });
        }

        if (shouldPlayTudum && tudumRef.current?.isReady && !sourceRef.current?.isDownloaded) {
            console.log(`[Player] (Cast Flavour) Will play tudum first, then content`);
            currentSourceType.current = 'tudum';
            loadTudumSource();
        } else {
            console.log(`[Player] (Cast Flavour) Skipping tudum - loading content directly`);
            currentSourceType.current = 'content';
            loadContentSource();
        }
    };

    // ✅ LOAD TUDUM SOURCE
    const loadTudumSource = useCallback(async () => {
        console.log(`[Player] (Cast Flavour) loadTudumSource`);
        
        if (!tudumRef.current?.source || !castConnected) {
            console.log(`[Player] (Cast Flavour) loadTudumSource - Not ready:`, {
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
            
            console.log(`[Player] (Cast Flavour) Loading tudum to Cast:`, tudumRef.current.source);
            
            const success = await castManager.loadContent({
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
            
            console.log(`[Player] (Cast Flavour) Failed to load tudum to Cast:`, error);
            
            console.log(`[Player] (Cast Flavour) Tudum failed, loading content directly`);
            currentSourceType.current = 'content';
            loadContentSource();
        }
    }, [castManager, castConnected]);

    // ✅ LOAD CONTENT SOURCE
    const loadContentSource = useCallback(() => {
        console.log(`[Player] (Cast Flavour) loadContentSource`);
        
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
                headers: props.headers,
            });
        }
    }, [props.playerMetadata, props.manifests, props.playerProgress, props.headers]);

    // ✅ SWITCH FROM TUDUM TO CONTENT
    const switchFromTudumToContent = useCallback(async () => {
        console.log(`[Player] (Cast Flavour) switchFromTudumToContent`);
        
        currentSourceType.current = null;
        if (tudumRef.current) {
            tudumRef.current.isPlaying = false;
        }
        
        sliderValues.current = undefined;
        vodProgressManagerRef.current?.reset();
        dvrProgressManagerRef.current?.reset();
        
        setTimeout(async () => {
            if (pendingContentSource.current && pendingContentSource.current.isReady) {
                console.log(`[Player] (Cast Flavour) Loading pending content source directly`);
                currentSourceType.current = 'content';
                await loadContentWithCastManager(pendingContentSource.current);
                pendingContentSource.current = null;
            } else {
                console.log(`[Player] (Cast Flavour) Loading main content source`);
                currentSourceType.current = 'content';
                loadContentSource();
            }
        }, 100);
    }, [loadContentSource]);

    // ✅ LOAD CONTENT WITH CAST MANAGER
    const loadContentWithCastManager = useCallback(async (data: onSourceChangedProps) => {
        console.log(`[Player] (Cast Flavour) loadContentWithCastManager`);
        
        if (data && data.isReady && data.source) {
            setIsLoadingContent(true);
            drm.current = data.drm;

            if (castMedia.url === data.source.uri && !castMedia.isIdle) {
                console.log(`[Player] (Cast Flavour) Content already loaded in Cast, skipping`);
                setIsLoadingContent(false);
                isChangingSource.current = false;
                setIsContentLoaded(true);
                setHasTriedLoading(true);
                return;
            }

            try {
                if (props.hooks?.getYouboraOptions) {
                    youboraForVideo.current = props.hooks.getYouboraOptions(props.playerAnalytics?.youbora!, YOUBORA_FORMAT.CAST);
                }

                let startingPoint = props.playerProgress?.currentTime || 0;

                if (sourceRef.current?.isLive && sourceRef.current?.isDVR && sourceRef.current?.dvrWindowSeconds) {
                    startingPoint = sourceRef.current.dvrWindowSeconds;
                }

                const success = await castManager.loadContent({
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
                console.log(`[Player] (Cast Flavour) loadContentWithCastManager - Failed:`, error);
                onError({ message: error?.message || 'Failed to load content to Cast' });
            }
        }
    }, [castManager, castMedia, props.hooks, props.playerAnalytics, props.playerProgress, props.playerMetadata, props.liveStartDate, props.playerAds, props.events]);

    // ✅ SOURCE CHANGED HANDLER
    const onSourceChanged = useCallback((data: onSourceChangedProps) => {
        console.log(`[Player] (Cast Flavour) onSourceChanged - currentSourceType: ${currentSourceType.current}`);
        console.log(`[Player] (Cast Flavour) onSourceChanged - data: ${JSON.stringify(data)}`);
        
        if (!sourceRef.current?.isLive && !sourceRef.current?.isDownloaded && currentSourceType.current === 'tudum') {
            console.log(`[Player] (Cast Flavour) Saving content source for later (tudum is playing)`);
            pendingContentSource.current = data;
        } else if (currentSourceType.current === 'content') {
            console.log(`[Player] (Cast Flavour) Processing content source normally`);

            if (data.isDVR && dvrProgressManagerRef.current) {
                dvrProgressManagerRef.current.setDVRWindowSeconds(data.dvrWindowSeconds || 3600);
            }
            
            updatePlayerProgressRef();
            loadContentWithCastManager(data);
        } else {
            console.log(`[Player] (Cast Flavour) Initial state, processing source`);
            
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

    // ✅ HANDLE TRACK CHANGES
    const handleTrackChanges = () => {
        console.log(`[Player] (Cast Flavour) handleTrackChanges...`);
        let activeTracks:Array<number> = [];
        if (castConnected && menuData) {
            console.log(`[Player] (Cast Flavour) handleTrackChanges - audio: ${audioIndex}, subtitle: ${subtitleIndex}`);
            // Usar la función existente de Cast para cambiar tracks
            if (castManager && menuData){

                if (typeof(audioIndex) === 'number'){
                    activeTracks.push( getTrackId('audio', audioIndex, menuData)! );
                }
                
                if (typeof(subtitleIndex) === 'number' && subtitleIndex !== -1){
                    activeTracks.push( getTrackId('text', subtitleIndex, menuData)! );
                }
        
                if (activeTracks.length){
                    console.log(`[Player] (Cast Actions) handleTrackChanges ${JSON.stringify(activeTracks)}`);
                    castManager.setActiveTrackIds(activeTracks);
                } else {
                    console.log(`[Player] (Cast Actions) handleTrackChanges empty ids... ${JSON.stringify(activeTracks)}`);
                }
        
            } else {
                console.log(`[Player] (Cast Actions) handleTrackChanges without objects: castManager ${!!castManager} / menuData ${!!menuData}`);
            }

        }
    };

    // ✅ HANDLE MENU DATA READY
    const handleMenuDataReady = () => {
        console.log(`[Player] (Cast Flavour) handleMenuDataReady...`);

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

            console.log(`[Player] (Cast Flavour) handleMenuDataReady ${JSON.stringify(data)}`);

            if (data) {
                props.events.onChangeCommonData(data);
            }
        }
    };

    // ✅ UPDATE PLAYER PROGRESS REF
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
            console.log(`[Player] (Cast Flavour) updatePlayerProgressRef - error ${ex?.message}`);
        }
    }, [props.playerProgress, currentTime, paused, muted, isContentLoaded]);

    // ✅ PROGRESS MANAGER CALLBACKS
    const onDVRModeChange = useCallback((data: ModeChangeData) => {
        console.log(`[Player] (Cast Flavour) onDVRModeChange:`, data);
    }, []);

    const onDVRProgramChange = useCallback((data: ProgramChangeData) => {
        console.log(`[Player] (Cast Flavour) onDVRProgramChange:`, data);
    }, []);

    const onProgressUpdate = useCallback((data: ProgressUpdateData) => {
        if (currentSourceType.current === 'content') {
            console.log(`[Player] (Cast Flavour) onProgressUpdate:`, data);
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
            setSliderValuesUpdate((prev: number) => prev + 1);
        }
    }, [updatePlayerProgressRef]);

    const onSeekRequest = useCallback((playerTime: number) => {
        console.log(`[Player] (Cast Flavour) onSeekRequest:`, playerTime);
        castManager.seek(playerTime);
    }, [castManager]);

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

    // ✅ SIMULAR EVENTOS DEL PLAYER
    const onLoad = useCallback(async (e: { currentTime: number; duration: number }) => {
        console.log(`[Player] (Cast Flavour) onLoad - duration: ${e.duration}, currentTime: ${e.currentTime}`);

        if (currentSourceType.current === 'content' && e.duration > 0) {
            console.log(`[Player] (Cast Flavour) onLoad - Processing content load`);

            if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR && e.duration) {
                console.log(`[Player] (Cast Flavour) onLoad - Setting VOD duration from load event: ${e.duration}s`);
                vodProgressManagerRef.current?.updatePlayerData({
                    currentTime: e.currentTime || 0,
                    seekableRange: { start: 0, end: e.duration },
                    duration: e.duration,
                    isBuffering: false,
                    isPaused: paused
                });
            }

            if (sourceRef.current?.isDVR && sourceRef.current?.dvrWindowSeconds) {
                console.log(`[Player] (Cast Flavour) onLoad - Configuring DVR window: ${sourceRef.current.dvrWindowSeconds}s`);
                dvrProgressManagerRef.current?.setDVRWindowSeconds(sourceRef.current.dvrWindowSeconds);
            }

            isChangingSource.current = false;
            setIsContentLoaded(true);
            setIsLoadingContent(false);

            console.log(`[Player] (Cast Flavour) onLoad - mediaTracks:`, castMedia.mediaTracks);
            
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
                dvrProgressManagerRef.current?.checkInitialSeek('cast');
            }

        } else if (currentSourceType.current === 'tudum') {
            console.log(`[Player] (Cast Flavour) onLoad - Tudum loaded, duration: ${e.duration}`);
            setIsLoadingContent(false);
        }
    }, [paused, props.events, castMedia.mediaTracks]);

    const onEnd = useCallback(() => {
        console.log(`[Player] (Cast Flavour) onEnd: currentSourceType ${currentSourceType.current}, isAutoNext: ${props.isAutoNext}`);
        
        if (currentSourceType.current === 'tudum') {
            console.log(`[Player] (Cast Flavour) onEnd: Tudum finished, switching to main content`);
            isChangingSource.current = true;
            switchFromTudumToContent();

        } else if (currentSourceType.current === 'content' && props.events?.onEnd) {
            console.log(`[Player] (Cast Flavour) onEnd: Content finished, preparing for possible auto next`);
            
            if (tudumRef.current) {
                tudumRef.current.prepareForAutoNext();
            }
            
            props.events.onEnd();
        }
    }, [props.isAutoNext, props.events, switchFromTudumToContent]);

    const onError = useCallback((e: any) => {
        console.log(`[Player] (Cast Flavour) onError: ${JSON.stringify(e)} - currentSourceType: ${currentSourceType.current}`);
        setIsLoadingContent(false);
    }, []);

    // ✅ PROGRESS SIMULATION usando castProgress
    useEffect(() => {
        if (!castConnected || currentTime === castProgress.currentTime) return;

        const e = {
            currentTime: castProgress.currentTime,
            playableDuration: castProgress.duration || 0,
            seekableDuration: castProgress.duration || 0
        };

        console.log(`[Player] (Cast Flavour) Simulating onProgress: ${JSON.stringify(e)}`);

        if (currentSourceType.current === 'content') {
            if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR) {
                const currentDuration = vodProgressManagerRef.current?.duration || 0;
                vodProgressManagerRef.current?.updatePlayerData({
                    currentTime: e.currentTime,
                    seekableRange: { start: 0, end: currentDuration > 0 ? currentDuration : e.seekableDuration },
                    duration: currentDuration,
                    isBuffering: isBuffering || isLoadingContent,
                    isPaused: paused
                });
            }

            if (sourceRef.current?.isDVR) {
                dvrProgressManagerRef.current?.updatePlayerData({
                    currentTime: e.currentTime,
                    duration: e.playableDuration,
                    seekableRange: { start: 0, end: e.seekableDuration },
                    isBuffering: isBuffering || isLoadingContent,
                    isPaused: paused
                });
            }

            if (!sourceRef.current?.isLive && props?.events?.onChangeCommonData) {
                const vodDuration = vodProgressManagerRef.current?.duration || 0;
                props.events.onChangeCommonData({
                    time: e.currentTime,
                    duration: vodDuration,
                });
            }
        }
    }, [castProgress.currentTime, castProgress.duration, castConnected, paused, isBuffering, isLoadingContent]);

    // ✅ ASSIGN CALLBACKS TO REFS
    useEffect(() => {
        onLoadRef.current = onLoad;
        onEndRef.current = onEnd;
        onErrorRef.current = onError;
    }, [onLoad, onEnd, onError]);

    // ✅ CONTROLS PRESS HANDLER
    const onControlsPress = useCallback((id: CONTROL_ACTION, value?: number | boolean) => {
        const COMMON_DATA_FIELDS = ['time', 'volume', 'mute', 'pause', 'audioIndex', 'subtitleIndex'];

        console.log(`[Player] (Cast Flavour) onControlsPress: ${id} (${value})`);

        if (id === CONTROL_ACTION.PAUSE) {
            setPaused(!!value);
            if (value) {
                castManager.pause();
            } else {
                castManager.play();
            }
        }

        if (id === CONTROL_ACTION.MUTE) {
            setMuted(!!value);
            if (value) {
                castManager.mute();
            } else {
                castManager.unmute();
            }
        }

        if (id === CONTROL_ACTION.VOLUME && typeof value === 'number') {
            castManager.setVolume(value);
        }

        if (id === CONTROL_ACTION.NEXT && props.events?.onNext) {
            setIsContentLoaded(false);
            props.events?.onNext();
        }

        if (id === CONTROL_ACTION.PREVIOUS && props.events?.onPrevious) {
            setIsContentLoaded(false);
            props.events.onPrevious();
        }

        if (id === CONTROL_ACTION.LIVE && sourceRef.current?.isDVR) {
            dvrProgressManagerRef.current?.goToLive();
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
    }, [castManager, props.events, menuData]);

    const onSlidingComplete = useCallback((value: number) => {
        console.log(`[Player] (Cast Flavour) onSlidingComplete:`, value);
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