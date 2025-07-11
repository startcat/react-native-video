import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Overlay } from '../../components/overlay';
import { BackgroundPoster } from '../../components/poster';

import { mergeCastMenuData } from '../../utils';
import { changeActiveTracks } from '../actions/cast';
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

import { useIsBuffering } from '../../modules/buffer';
import {
    DVRProgressManagerClass,
    type ModeChangeData,
    type ProgramChangeData
} from '../../modules/dvr';



import { SourceClass, type onSourceChangedProps } from '../../modules/source';
import { TudumClass } from '../../modules/tudum';
import { VODProgressManagerClass } from '../../modules/vod';

// Importar el nuevo sistema de Cast
import {
    CastManagerState,
    CastOperationResult,
    useCastManager,
    useCastState,
    type CastContentInfo,
    type CastMessageConfig
} from '../../features/cast';

export function CastFlavour(props: CastFlavourProps): React.ReactElement {
    const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
    const [currentTime, setCurrentTime] = useState<number>(props.playerProgress?.currentTime || 0);
    const [paused, setPaused] = useState<boolean>(!!props.playerProgress?.isPaused);
    const [muted, setMuted] = useState<boolean>(!!props?.playerProgress?.isMuted);
    const [buffering, setBuffering] = useState<boolean>(false);
    const [menuData, setMenuData] = useState<Array<IPlayerMenuData>>();
    const [audioIndex, setAudioIndex] = useState<number>(props.audioIndex!);
    const [subtitleIndex, setSubtitleIndex] = useState<number>(props.subtitleIndex!);

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

    // Usar el nuevo sistema de Cast
    const castState = useCastState({
        streamPositionInterval: 1,
        debugMode: false,
        onStateChange: (newState, previousState) => {
            console.log(`[Player] (Cast Flavour) Cast state changed:`, {
                from: previousState.managerState,
                to: newState.managerState
            });
        },
        onConnectionChange: (isConnected, previouslyConnected) => {
            console.log(`[Player] (Cast Flavour) Cast connection changed:`, {
                from: previouslyConnected,
                to: isConnected
            });
        }
    });

    const { 
        status: castStatus, 
        currentContent: castCurrentContent, 
        progressInfo,
        ...castManager 
    } = useCastManager({
        debugMode: false,
        dvrProgressManager: dvrProgressManagerRef.current,
        callbacks: {
            onStateChange: (state, previousState) => {
                console.log(`[Player] (Cast Flavour) Cast manager state changed:`, {
                    from: previousState,
                    to: state
                });
                
                handleCastStateChange(state, previousState);
            },
            onContentLoaded: (content) => {
                console.log(`[Player] (Cast Flavour) Content loaded:`, content);
                handleContentLoaded(content);
            },
            onContentLoadError: (error, content) => {
                console.error(`[Player] (Cast Flavour) Content load error:`, error);
                handleContentLoadError(error, content);
            },
            onPlaybackStarted: () => {
                console.log(`[Player] (Cast Flavour) Playback started`);
                handlePlaybackStarted();
            },
            onPlaybackEnded: () => {
                console.log(`[Player] (Cast Flavour) Playback ended`);
                handlePlaybackEnded();
            },
            onTimeUpdate: (currentTime, duration) => {
                // console.log(`[Player] (Cast Flavour) Time update:`, currentTime, duration);
                setCurrentTime(currentTime);
                updateProgressManagers(currentTime, duration);
            },
            onBufferingChange: (isBuffering) => {
                // console.log(`[Player] (Cast Flavour) Buffering change:`, isBuffering);
                setBuffering(isBuffering);
            }
        }
    });

    // Hook para el estado de buffering
    const isBuffering = useIsBuffering({
        buffering: buffering,
        paused: paused,
        onBufferingChange: props.events?.onBuffering
    });

    // Effect para gestionar cambios en manifests
    useEffect(() => {
        console.log(`[Player] (Cast Flavour) useEffect manifests - isAutoNext: ${props.isAutoNext}`);
        console.log(`[Player] (Cast Flavour) useEffect manifests - content ID: ${props.playerMetadata?.id}`);

        // Detectar si cambió el ID del contenido
        const hasContentChanged = sourceRef.current?.id !== props.playerMetadata?.id;
        
        if (hasContentChanged) {
            console.log(`[Player] (Cast Flavour) Content ID changed, forcing reload`);
            setIsContentLoaded(false);
            isChangingSource.current = true;
            castManager.clearContent();
        }

        // Verificar si es contenido live/DVR vs VOD
        const isLiveContent = !!props.playerProgress?.isLive;

        if (isLiveContent) {
            handleLiveContent();
        } else {
            handleVODContent();
        }

    }, [props.manifests, props.isAutoNext, props.playerMetadata?.id]);

    // Effect para manejar cambios en índices de audio/subtítulos
    useEffect(() => {
        console.log(`[DANI] useEffect audioIndex - audioIndex: ${props.audioIndex}`);
        setAudioIndex(props.audioIndex!);
    }, [props.audioIndex]);

    useEffect(() => {
        console.log(`[DANI] useEffect subtitleIndex - subtitleIndex: ${props.subtitleIndex}`);
        setSubtitleIndex(props.subtitleIndex!);
    }, [props.subtitleIndex]);

    useEffect(() => {
        //if (!isContentLoaded) {
            handleTrackChanges();
        //}
    }, [audioIndex, subtitleIndex]);

    useEffect(() => {
        //if (menuData && !isContentLoaded) {
            handleMenuDataReady();
        //}
    }, [menuData]);

    // useEffect(() => {
    //     console.log(`[Player] (Cast Flavour) Cast state changed: ${JSON.stringify(castState)}`);
    // }, [castState]);

    // useEffect(() => {
    //     console.log(`[Player] (Cast Flavour) Progress info changed: ${JSON.stringify(progressInfo)}`);
    // }, [progressInfo]);

    // useEffect(() => {
    //     console.log(`[Player] (Cast Flavour) Status changed: ${JSON.stringify(castStatus)}`);
    // }, [castStatus]);

    // useEffect(() => {
    //     console.log(`[Player] (Cast Flavour) Current content changed: ${JSON.stringify(castCurrentContent)}`);
    // }, [castCurrentContent]);

    // Effect para monitorear cambios en el estado de Cast media
    useEffect(() => {
        if (castState.castMediaStatus) {
            const mediaStatus = castState.castMediaStatus;

            console.log(`[Player] (Cast Flavour) castMediaStatus changed: ${JSON.stringify(mediaStatus)}`);

            console.log(`[Player] (Cast Flavour) castMediaStatus changed - menuData: ${JSON.stringify(menuData)}`);
            console.log(`[Player] (Cast Flavour) castMediaStatus changed - mediaTracks: ${JSON.stringify(mediaStatus?.mediaInfo?.mediaTracks)}`);
            
            // Manejar cambios en las pistas de media si no tenemos menuData
            if (!menuData && mediaStatus?.mediaInfo?.mediaTracks) {
                console.log(`[Player] (Cast Flavour) Processing media tracks from media status change`);
                
                if (props.hooks?.mergeCastMenuData && typeof(props.hooks.mergeCastMenuData) === 'function') {
                    setMenuData(props.hooks.mergeCastMenuData(mediaStatus.mediaInfo.mediaTracks, props.languagesMapping));
                } else {
                    setMenuData(mergeCastMenuData(mediaStatus.mediaInfo.mediaTracks, props.languagesMapping));
                }
            }
            
            // Manejar cambios en mute desde el Cast
            if (castState.castSession) {
                castState.castSession.isMute().then((isMuted: boolean) => {
                    if (isMuted !== muted) {
                        setMuted(isMuted);
                    }
                }).catch(() => {
                    // Ignorar errores
                });
            }
        }
    }, [castState.castMediaStatus, castState.castSession, menuData, muted]);

    // Effect para actualizar gestores de progreso usando progressInfo del useCastManager
    useEffect(() => {
        if (progressInfo && currentSourceType.current === 'content') {
            console.log(`[Player] (Cast Flavour) Updating progress managers from progressInfo:`, {
                currentTime: progressInfo.currentTime,
                duration: progressInfo.duration,
                isPaused: progressInfo.isPaused,
                isBuffering: progressInfo.isBuffering
            });
            
            // Actualizar gestores VOD y DVR basándose en progressInfo
            if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR) {
                // Para VOD
                vodProgressManagerRef.current?.updatePlayerData({
                    currentTime: progressInfo.currentTime || 0,
                    seekableRange: { start: 0, end: progressInfo.duration || 0 },
                    duration: progressInfo.duration || 0,
                    isBuffering: progressInfo.isBuffering || false,
                    isPaused: progressInfo.isPaused
                });
            }

            if (sourceRef.current?.isDVR) {
                dvrProgressManagerRef.current?.updatePlayerData({
                    currentTime: progressInfo.currentTime || 0,
                    duration: progressInfo.duration || 0,
                    seekableRange: { start: 0, end: progressInfo.duration || 0 },
                    isBuffering: progressInfo.isBuffering || false,
                    isPaused: progressInfo.isPaused
                });
            }

            // Emitir evento de cambio de datos comunes para VOD
            if (!sourceRef.current?.isLive && props?.events?.onChangeCommonData) {
                props.events.onChangeCommonData({
                    time: progressInfo.currentTime || 0,
                    duration: progressInfo.duration || 0,
                });
            }
        }
    }, [progressInfo, sourceRef.current]);

    // Handlers para estados de Cast
    const handleCastStateChange = (state: CastManagerState, previousState: CastManagerState) => {
        if (state === CastManagerState.CONNECTING && !buffering) {
            setBuffering(true);
        } else if (state !== CastManagerState.CONNECTING && state !== CastManagerState.LOADING && buffering) {
            setBuffering(false);
        }

        if (state === CastManagerState.PAUSED && !paused) {
            setPaused(true);
        } else if (state !== CastManagerState.PAUSED && paused) {
            setPaused(false);
        }
    };

    const handleContentLoaded = (content: CastContentInfo) => {
        console.log(`[Player] (Cast Flavour) handleContentLoaded :: ${JSON.stringify(content)}`);

        console.log(`[Player] (Cast Flavour) handleContentLoaded - castState: ${JSON.stringify(castState)}`);
        
        // Verificar si el contenido cargado es el mismo que esperamos
        if (currentSourceType.current === 'content') {
            const currentContent = sourceRef.current?.playerSource;
            if (currentContent && castManager.isSameContent(createCastMessageConfig(currentContent, sourceRef.current?.playerSourceDrm))) {
                console.log(`[Player] (Cast Flavour) Content matches expected content`);
                setIsContentLoaded(true);
                setBuffering(false);
                isChangingSource.current = false;
                
            }
        } else if (currentSourceType.current === 'tudum') {
            // Tudum cargado
            setIsContentLoaded(true);
            setBuffering(false);
            isChangingSource.current = false;
        }
    };

    const handleContentLoadError = (error: string, content?: CastContentInfo) => {
        console.error(`[Player] (Cast Flavour) handleContentLoadError:`, error);
        setBuffering(false);
        isChangingSource.current = false;
    };

    const handlePlaybackStarted = () => {
        console.log(`[Player] (Cast Flavour) handlePlaybackStarted`);
        
        if (!isContentLoaded) {
            
            setIsContentLoaded(true);
            setBuffering(false);
            isChangingSource.current = false;
            
            if (props.events?.onStart) {
                props.events.onStart();
            }

            // Seek inicial al cargar un live con DVR
            if (sourceRef.current?.isDVR && dvrProgressManagerRef.current) {
                dvrProgressManagerRef.current.checkInitialSeek('cast');
            }
        }
    };

    const handlePlaybackEnded = () => {
        console.log(`[Player] (Cast Flavour) handlePlaybackEnded - currentSourceType: ${currentSourceType.current}`);
        
        if (currentSourceType.current === 'tudum') {
            // Acaba la reproducción del Tudum externo
            console.log(`[Player] (Cast Flavour) Tudum finished, switching to main content`);
            isChangingSource.current = true;
            switchFromTudumToContent();
        } else if (currentSourceType.current === 'content' && props.events?.onEnd) {
            // Termina el contenido principal
            console.log(`[Player] (Cast Flavour) Content finished, preparing for possible auto next`);
            
            // Preparar tudum para salto automático antes de notificar
            if (tudumRef.current) {
                tudumRef.current.prepareForAutoNext();
            }
            
            props.events.onEnd();
        }
    };

    const handleLiveContent = () => {
        console.log(`[Player] (Cast Flavour) handleLiveContent`);
        
        // COMPORTAMIENTO ORIGINAL PARA LIVE/DVR - Sin tudum, sin resets complicados
        if (!tudumRef.current) {
            tudumRef.current = new TudumClass({
                enabled: false, // Nunca tudum para live
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

        // Para live, cargar contenido directamente
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
        
        // LÓGICA DEL TUDUM SOLO PARA VOD
        
        // Reset completo solo para VOD
        currentSourceType.current = null;
        pendingContentSource.current = null;
        sliderValues.current = undefined;
        setIsContentLoaded(false);
        
        // Reset progress managers solo para VOD
        vodProgressManagerRef.current?.reset();
        dvrProgressManagerRef.current?.reset();

        // Determinar si debe reproducir tudum (solo para VOD)
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

        // Establecer currentSourceType basado en si vamos a reproducir tudum
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

    const loadTudumSource = () => {
        console.log(`[Player] (Cast Flavour) loadTudumSource`);
        
        if (tudumRef.current?.source) {
            currentSourceType.current = 'tudum';
            tudumRef.current.isPlaying = true;
            drm.current = tudumRef.current?.drm;
            
            const castConfig = createCastMessageConfig(tudumRef.current.source, tudumRef.current.drm);
            loadCastContent(castConfig);
        }
    };

    const loadContentSource = () => {
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
    };

    const switchFromTudumToContent = () => {
        console.log(`[Player] (Cast Flavour) switchFromTudumToContent`);
        
        // Limpiar completamente el source del tudum
        currentSourceType.current = null;
        tudumRef.current!.isPlaying = false;
        
        // Reset completo de progress managers y sliderValues
        sliderValues.current = undefined;
        vodProgressManagerRef.current?.reset();
        dvrProgressManagerRef.current?.reset();
        
        // Limpiar el contenido actual de Cast
        castManager.clearContent();
        
        // Pequeño delay para asegurar que se limpia el source
        setTimeout(() => {
            console.log(`[Player] (Cast Flavour) switchFromTudumToContent - pendingContentSource.current`, pendingContentSource.current);

            // Si hay un source de contenido pendiente, usarlo directamente
            if (pendingContentSource.current && pendingContentSource.current.isReady) {
                console.log(`[Player] (Cast Flavour) Loading pending content source directly`);
                currentSourceType.current = 'content';
                const castConfig = createCastMessageConfig(pendingContentSource.current.source!, pendingContentSource.current.drm);
                loadCastContent(castConfig);
                pendingContentSource.current = null;
            } else {
                // Cargar el contenido principal
                console.log(`[Player] (Cast Flavour) Loading main content source`);
                currentSourceType.current = 'content';
                loadContentSource();
            }
        }, 100);
    };

    const onSourceChanged = (data: onSourceChangedProps) => {
        console.log(`[Player] (Cast Flavour) onSourceChanged - currentSourceType: ${currentSourceType.current}`);
        console.log(`[Player] (Cast Flavour) onSourceChanged - data: ${JSON.stringify(data)}`);
        
        if (!sourceRef.current?.isLive && !sourceRef.current?.isDownloaded && currentSourceType.current === 'tudum') {
            // Si estamos reproduciendo tudum, guardar el source del contenido para después
            console.log(`[Player] (Cast Flavour) Saving content source for later (tudum is playing)`);
            pendingContentSource.current = data;
        } else if (currentSourceType.current === 'content') {
            // Si ya estamos en modo contenido, procesar normalmente
            console.log(`[Player] (Cast Flavour) Processing content source normally`);

            // Si el stream es DVR, debemos actualizar el tamaño de la ventana
            if (data.isDVR && dvrProgressManagerRef.current) {
                dvrProgressManagerRef.current.setDVRWindowSeconds(data.dvrWindowSeconds || 3600);
            }
            
            if (data.isReady && data.source) {
                const castConfig = createCastMessageConfig(data.source, data.drm);
                loadCastContent(castConfig);
            }
        } else {
            // Estado inicial o indefinido
            console.log(`[Player] (Cast Flavour) Initial state, processing source`);
            
            if (!currentSourceType.current) {
                currentSourceType.current = 'content';
            }
            
            if (data.isReady && data.source) {
                const castConfig = createCastMessageConfig(data.source, data.drm);
                loadCastContent(castConfig);
            }
        }

        // Actualizar progress reference
        updatePlayerProgressRef();

        // Reset DVR si es necesario
        if (sourceRef.current?.isLive && sourceRef.current?.isDVR) {
            dvrProgressManagerRef.current?.reset();
        }
    };

    const createCastMessageConfig = (source: any, sourceDrm?: IDrm): CastMessageConfig => {
        // Preparar Youbora si es necesario
        if (props.hooks?.getYouboraOptions) {
            youboraForVideo.current = props.hooks.getYouboraOptions(props.playerAnalytics?.youbora!, YOUBORA_FORMAT.CAST);
        }

        let startingPoint = props.playerProgress?.currentTime || 0;

        // Para DVR live, empezar en live edge (posición 0) no en inicio de ventana
        if (sourceRef.current?.isLive && sourceRef.current?.isDVR) {
            // Para streams live DVR, empezar en live edge para comportamiento tipo PLAYLIST correcto
            startingPoint = -1; // Live edge
            console.log(`[Player] (Cast Flavour) Live DVR content, starting at live edge (position: ${startingPoint})`);
        }

        return {
            source: source,
            manifest: sourceRef.current?.currentManifest || {},
            drm: sourceDrm,
            youbora: youboraForVideo.current,
            metadata: {
                id: props.playerMetadata?.id,
                title: props.playerMetadata?.title,
                subtitle: props.playerMetadata?.subtitle,
                description: props.playerMetadata?.description,
                poster: props.playerMetadata?.squaredPoster || props.playerMetadata?.poster,
                liveStartDate: props.liveStartDate ? parseInt(props.liveStartDate, 10) : undefined,
                adTagUrl: props.playerAds?.adTagUrl,
                hasNext: !!props.events?.onNext,
                isLive: !!props.playerProgress?.isLive,
                isDVR: sourceRef.current?.isDVR,
                startPosition: startingPoint
            }
        };
    };

    const loadCastContent = async (castConfig: CastMessageConfig) => {
        console.log(`[DANI] (Cast Flavour) loadCastContent: ${JSON.stringify(castConfig)}`);
        console.log(`[DANI] (Cast Flavour) loadCastContent - castManager: ${JSON.stringify(castManager)}`);
        console.log(`[DANI] (Cast Flavour) loadCastContent - castCurrentContent: ${JSON.stringify(castCurrentContent)}`);
        
        try {
            setBuffering(true);
            isChangingSource.current = true;

            // Verificar si ya tenemos el mismo contenido cargado
            let isSameContent = false;
            
            // Preferir comparación local si tenemos datos
            if (castCurrentContent) {
                isSameContent = castCurrentContent.contentUrl === castConfig.source.uri;
                console.log(`[DANI] (Cast Flavour) Local comparison result: ${isSameContent}`);
            }
            // Solo usar comparación del manager si no tenemos datos locales y el manager está listo
            else if (castManager.manager && castManager.isSameContent) {
                isSameContent = castManager.isSameContent(castConfig);
                console.log(`[DANI] (Cast Flavour) Manager comparison result: ${isSameContent}`);
            }
            
            if (isSameContent) {
                console.log(`[DANI] (Cast Flavour) Same content already loaded, skipping`);
                setBuffering(false);
                isChangingSource.current = false;
                return;
            }

            const result = await castManager.loadContent(castConfig);

            console.log(`[DANI] (Cast Flavour) loadCastContent - result: ${result}`);
            
            if (result === CastOperationResult.SUCCESS) {
                console.log(`[Player] (Cast Flavour) Content loaded successfully`);
                // El callback onContentLoaded manejará el resto
            } else if (result === CastOperationResult.PENDING) {
                console.log(`[Player] (Cast Flavour) Content load pending`);
                // Se cargará cuando Cast esté listo
            } else {
                console.error(`[Player] (Cast Flavour) Content load failed`);
                setBuffering(false);
                isChangingSource.current = false;
            }
        } catch (error) {
            console.error(`[Player] (Cast Flavour) Error loading cast content:`, error);
            setBuffering(false);
            isChangingSource.current = false;
        }
    };

    const updateProgressManagers = (currentTime: number, duration: number) => {
        // Solo procesar progreso para contenido principal, no para tudum
        if (currentSourceType.current === 'content') {
            if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR) {
                // Para VOD
                vodProgressManagerRef.current?.updatePlayerData({
                    currentTime: currentTime,
                    seekableRange: { start: 0, end: duration },
                    duration: duration,
                    isBuffering: isBuffering,
                    isPaused: paused
                });
            }

            if (sourceRef.current?.isDVR) {
                dvrProgressManagerRef.current?.updatePlayerData({
                    currentTime: currentTime,
                    duration: duration,
                    seekableRange: { start: 0, end: duration },
                    isBuffering: isBuffering,
                    isPaused: paused
                });
            }

            if (!sourceRef.current?.isLive && props?.events?.onChangeCommonData) {
                props.events.onChangeCommonData({
                    time: currentTime,
                    duration: duration,
                });
            }
        }
    };

    const handleTrackChanges = () => {
        // Cambiar pistas de audio/subtítulos en Cast
        console.log(`[DANI] handleTrackChanges...`);
        //isContentLoaded && 
        if (castState.castClient && menuData) {
            console.log(`[DANI] handleTrackChanges - audio: ${audioIndex}, subtitle: ${subtitleIndex}`);
            changeActiveTracks(castState.castClient, menuData, audioIndex, subtitleIndex);
        }
    };

    const handleMenuDataReady = () => {

        console.log(`[DANI] handleMenuDataReady...`);

        if (menuData){
            changeActiveTracks(castState.castClient, menuData, audioIndex, subtitleIndex);
        }

        if (menuData && props.events?.onChangeCommonData) {
            // Al cargar la lista de audios y subtítulos, mandamos las labels iniciales
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

            console.log(`[DANI] handleMenuDataReady ${JSON.stringify(data)}`);

            if (data) {
                props.events.onChangeCommonData(data);
            }
        }
    };

    const updatePlayerProgressRef = () => {
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
    };

    // Progress Manager Callbacks
    function onDVRModeChange(data: ModeChangeData) {
        console.log(`[Player] (Cast Flavour) onDVRModeChange:`, data);
    }

    function onDVRProgramChange(data: ProgramChangeData) {
        console.log(`[Player] (Cast Flavour) onDVRProgramChange:`, data);
    }

    function onProgressUpdate(data: ProgressUpdateData) {
        // Solo actualizar sliderValues si estamos reproduciendo contenido, no tudum
        if (currentSourceType.current === 'content') {
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
        }
    };

    function onSeekRequest(playerTime: number) {
        console.log(`[Player] (Cast Flavour) onSeekRequest:`, playerTime);
        // Use castManager if available, otherwise store for later
        if (castManager) {
            castManager.seek(playerTime);
        }
    };

    // Initialize Progress Managers after callback definitions
    if (!vodProgressManagerRef.current) {
        vodProgressManagerRef.current = new VODProgressManagerClass({
            onProgressUpdate: onProgressUpdate,
            onSeekRequest: onSeekRequest
        });
    }

    if (!dvrProgressManagerRef.current) {
        dvrProgressManagerRef.current = new DVRProgressManagerClass({
            playbackType: props.playerProgress?.liveValues?.playbackType,
            getEPGProgramAt: props.hooks?.getEPGProgramAt,
            getEPGNextProgram: props.hooks?.getEPGNextProgram,
            onModeChange: onDVRModeChange,
            onProgramChange: onDVRProgramChange,
            onProgressUpdate: onProgressUpdate,
            onSeekRequest: onSeekRequest
        });
    }

    // Control handlers
    const onControlsPress = (id: CONTROL_ACTION, value?: number | boolean) => {
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
            // Volver al directo en DVR
            dvrProgressManagerRef.current?.goToLive();
        }

        if (id === CONTROL_ACTION.SEEK_OVER_EPG && sourceRef.current?.isDVR) {
            // Volver al inicio del programa en DVR
            dvrProgressManagerRef.current?.goToProgramStart();
        }

        if (id === CONTROL_ACTION.SEEK && sourceRef.current?.isDVR) {
            // Hacer seek en DVR
            dvrProgressManagerRef.current?.seekToTime(value as number);
        } else if (id === CONTROL_ACTION.SEEK && !sourceRef.current?.isLive) {
            // Hacer seek en VOD
            vodProgressManagerRef.current?.seekToTime(value as number);
        }

        if (id === CONTROL_ACTION.FORWARD && sourceRef.current?.isDVR) {
            // Hacer forward en DVR
            dvrProgressManagerRef.current?.skipForward(value as number);
        } else if (id === CONTROL_ACTION.FORWARD && !sourceRef.current?.isLive) {
            // Hacer forward en VOD
            vodProgressManagerRef.current?.skipForward(value as number);
        }

        if (id === CONTROL_ACTION.BACKWARD && sourceRef.current?.isDVR) {
            // Hacer backward en DVR
            dvrProgressManagerRef.current?.skipBackward(value as number);
        } else if (id === CONTROL_ACTION.BACKWARD && !sourceRef.current?.isLive) {
            // Hacer backward en VOD
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
    };

    const onSlidingComplete = (value: number) => {
        console.log(`[Player] (Cast Flavour) onSlidingComplete:`, value);
        // Usar el control de seek que manejará DVR/VOD/Cast apropiadamente
        onControlsPress(CONTROL_ACTION.SEEK, value);
    };

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