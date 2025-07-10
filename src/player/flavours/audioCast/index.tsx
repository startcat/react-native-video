import React, { createElement, useEffect, useRef, useState } from 'react';
import { type EmitterSubscription } from 'react-native';
import { EventRegister } from 'react-native-event-listeners';
import {
    CastState,
    MediaPlayerState,
    useCastSession,
    useCastState,
    useMediaStatus,
    useRemoteMediaClient,
    useStreamPosition,
} from 'react-native-google-cast';
import Animated, { useSharedValue } from 'react-native-reanimated';

import {
    getSourceMessageForCast,
} from '../../utils';

import {
    invokePlayerAction,
} from '../actions/cast';

import { styles } from '../styles';

import {
    useIsBuffering
} from '../../modules/buffer';

import {
    type onSourceChangedProps,
    SourceClass
} from '../../modules/source';

import {
    TudumClass
} from '../../modules/tudum';

import {
    VODProgressManagerClass,
} from '../../modules/vod';

import {
    type ModeChangeData,
    type ProgramChangeData,
    DVRProgressManagerClass
} from '../../modules/dvr';

import {
    type AudioCastFlavourProps,
    type AudioControlsProps,
    type AudioPlayerActionEventProps,
    type ICommonData,
    type IDrm,
    type IMappedYoubora,
    type IPlayerProgress,
    CONTROL_ACTION,
    YOUBORA_FORMAT,
} from '../../types';

import {
    type ProgressUpdateData,
    type SliderValues
} from '../../../types';

export function AudioCastFlavour (props: AudioCastFlavourProps): React.ReactElement {

    const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
    const [isLoadingContent, setIsLoadingContent] = useState<boolean>(false);
    const audioPlayerHeight = useSharedValue(0);

    const castState = useCastState();
    const castSession = useCastSession();
    const castClient = useRemoteMediaClient();
    const castMediaStatus = useMediaStatus();
    const castStreamPosition = useStreamPosition(1);

    const lastCastState = useRef<CastState | null>();
    const eventsRegistered = useRef<boolean>(false);
    const onMediaPlaybackEndedListener = useRef<EmitterSubscription>();
    const onMediaPlaybackStartedListener = useRef<EmitterSubscription>();

    const youboraForVideo = useRef<IMappedYoubora>();
    const drm = useRef<IDrm>();
    const castMessage = useRef();

    const isChangingSource = useRef<boolean>(true);

    const [currentTime, setCurrentTime] = useState<number>(props.playerProgress?.currentTime || 0);
    const [paused, setPaused] = useState<boolean>(!!props.playerProgress?.isPaused);
    const [muted, setMuted] = useState<boolean>(!!props?.playerProgress?.isMuted);
    const [buffering, setBuffering] = useState<boolean>(false);

    const sliderValues = useRef<SliderValues>();
    const pendingCastMessageData = useRef<{source: any, sourceDrm?: IDrm} | null>(null);

    // Player Progress
    const playerProgressRef = useRef<IPlayerProgress>();
    
    // Trigger para forzar re-render cuando sliderValues cambie
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
    
    // Initialize VOD Progress Manager only once
    if (!vodProgressManagerRef.current) {
        vodProgressManagerRef.current = new VODProgressManagerClass({
            // Callbacks
            onProgressUpdate: onProgressUpdate,
            onSeekRequest: onSeekRequest
        });
    }

    // Initialize DVR Progress Manager only once
    if (!dvrProgressManagerRef.current) {
        dvrProgressManagerRef.current = new DVRProgressManagerClass({
            playbackType: props.playerProgress?.liveValues?.playbackType,

            // Metadata
            getEPGProgramAt: props.hooks?.getEPGProgramAt,
            getEPGNextProgram: props.hooks?.getEPGNextProgram,
        
            // Callbacks
            onModeChange: onDVRModeChange,
            onProgramChange: onDVRProgramChange,
            onProgressUpdate: onProgressUpdate,
            onSeekRequest: onSeekRequest
        });
    }

    // Hook para el estado de buffering
    const isBuffering = useIsBuffering({
        buffering: buffering,
        paused: paused,
        onBufferingChange: props.events?.onBuffering
    });

    useEffect(() => {
        console.log(`[Player] (Audio Cast Flavour) Cast State Change:`, {
            castState,
            castSession: !!castSession,
            castClient: !!castClient,
            castMediaStatus: !!castMediaStatus,
            timestamp: new Date().toISOString()
        });
    }, [castState, castSession, castClient, castMediaStatus]);

    useEffect(() => {
        castMessage.current = undefined;
        pendingCastMessageData.current = null;
    
        return () => {
            console.log(`[Player] (Audio Cast Flavour) Component unmounting, cleaning up`);
            unregisterRemoteSubscriptions();
            pendingCastMessageData.current = null;
        };
    }, []);

    useEffect(() => {
        const actionsAudioPlayerListener = EventRegister.addEventListener('audioPlayerAction', (data: AudioPlayerActionEventProps) => {
            onControlsPress(data.action, data.value);
        });

        return (() => {
            if (typeof(actionsAudioPlayerListener) === 'string'){
                EventRegister.removeEventListener(actionsAudioPlayerListener);
            }
        });
    }, [currentTime]);

    useEffect(() => {
        console.log(`[Player] (Audio Cast Flavour) useEffect manifests - isAutoNext: ${props.isAutoNext}`);
        console.log(`[Player] (Audio Cast Flavour) useEffect manifests - tudumRef.current ${tudumRef.current} - isReady ${tudumRef.current?.isReady}`);
        console.log(`[Player] (Audio Cast Flavour) useEffect manifests - sourceRef.current ${sourceRef.current} - isReady ${sourceRef.current?.isReady}`);

        // Verificar si es un contenido diferente al actual
        const newContentId = props.playerMetadata?.id;
        const currentContentId = sourceRef.current?.playerSource?.id || sourceRef.current?.id;
        const isNewContent = newContentId !== currentContentId;

        console.log(`[Player] (Audio Cast Flavour) Content comparison - current: ${currentContentId}, new: ${newContentId}, isNew: ${isNewContent}`);

        // Si es el mismo contenido, no hacer nada
        if (!isNewContent && sourceRef.current && !props.isAutoNext) {
            console.log(`[Player] (Audio Cast Flavour) Same content, skipping reload`);
            return;
        }

        // Verificar si es contenido live/DVR vs VOD
        const isLiveContent = !!props.playerProgress?.isLive;

        if (isLiveContent) {
            // COMPORTAMIENTO ORIGINAL PARA LIVE/DVR - Sin tudum, sin resets complicados
            if (!tudumRef.current || isNewContent){
                tudumRef.current = new TudumClass({
                    enabled: false, // Nunca tudum para live
                    getTudumSource: props.hooks?.getTudumSource,
                    getTudumManifest: props.hooks?.getTudumManifest,
                });
            }

            if (!sourceRef.current || isNewContent){
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

            // Para live, cargar contenido directamente (siempre si es nuevo contenido)
            if (isNewContent || !isContentLoaded) {
                if (isNewContent) {
                    setIsContentLoaded(false);
                    setIsLoadingContent(false);
                    // Solo resetear castMessage para contenido nuevo si realmente es necesario
                    if (castMessage.current) {
                        console.log(`[Player] (Audio Cast Flavour) Resetting castMessage for new content`);
                        castMessage.current = undefined;
                    }
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
            }

        } else {
            // LÓGICA DEL TUDUM SOLO PARA VOD
            
            // Reset completo para VOD (siempre, o cuando sea nuevo contenido)
            if (isNewContent || !sourceRef.current) {
                currentSourceType.current = null;
                pendingContentSource.current = null;
                sliderValues.current = undefined;
                setIsContentLoaded(false);
                setIsLoadingContent(false);
                
                // Solo limpiar el cast message para VOD si es realmente necesario
                if (isNewContent) {
                    castMessage.current = undefined;
                }
                
                // Reset progress managers
                vodProgressManagerRef.current?.reset();
                dvrProgressManagerRef.current?.reset();
            }

            // Determinar si debe reproducir tudum (solo para VOD)
            const shouldPlayTudum = !!props.showExternalTudum && !props.isAutoNext && !props.playerProgress?.isLive;
            console.log(`[Player] (Audio Cast Flavour) shouldPlayTudum: ${shouldPlayTudum}`);

            if (!tudumRef.current || isNewContent){
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

            if (!sourceRef.current || isNewContent){
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

            // Establecer currentSourceType basado en si vamos a reproducir tudum (solo si es nuevo contenido o cambio)
            if (isNewContent || !isContentLoaded) {
                if (shouldPlayTudum && tudumRef.current?.isReady && !sourceRef.current?.isDownloaded) {
                    console.log(`[Player] (Audio Cast Flavour) Will play tudum first, then content`);
                    currentSourceType.current = 'tudum';
                    loadTudumSource();
                } else {
                    console.log(`[Player] (Audio Cast Flavour) Skipping tudum - loading content directly`);
                    currentSourceType.current = 'content';
                    loadContentSource();
                }
            }
        }
    }, [props.manifests, props.isAutoNext, props.playerMetadata?.id]);

    useEffect(() => {
        EventRegister.emit('audioPlayerProgress', {
            preloading: isBuffering || isLoadingContent,
            isContentLoaded: isContentLoaded,
            speedRate: 1, // Cast no tiene speedRate
            extraData: props.extraData,
            // Nuevas Props Agrupadas
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
            //Events
            events: props.events,
        } as AudioControlsProps);

    }, [currentTime, props.playerMetadata, paused, muted, isBuffering, isLoadingContent, sourceRef.current?.isDVR, isContentLoaded, sliderValuesUpdate]);

    // Función para cargar source del tudum
    const loadTudumSource = () => {
        console.log(`[Player] (Audio Cast Flavour) loadTudumSource`);
        
        if (tudumRef.current?.source) {
            currentSourceType.current = 'tudum';
            tudumRef.current.isPlaying = true;
            drm.current = tudumRef.current?.drm;
            
            console.log(`[Player] (Audio Cast Flavour) Setting tudum source:`, tudumRef.current.source);
            // Para Cast, preparar el mensaje del tudum
            prepareCastMessage(tudumRef.current.source, tudumRef.current.drm);
        }
    };

    // Función para cargar source del contenido
    const loadContentSource = () => {
        console.log(`[Player] (Audio Cast Flavour) loadContentSource`);
        
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

            // Si el source ya está listo inmediatamente, forzar la carga
            setTimeout(() => {
                if (sourceRef.current?.isReady && currentSourceType.current === 'content') {
                    console.log(`[Player] (Audio Cast Flavour) Forcing content load - sourceRef is ready`);
                    setCastSource();
                }
            }, 100);
        }
    };

    // Función para cambiar de tudum a contenido
    const switchFromTudumToContent = () => {
        console.log(`[Player] (Audio Cast Flavour) switchFromTudumToContent`);
        
        // Limpiar completamente el source del tudum
        currentSourceType.current = null;
        tudumRef.current!.isPlaying = false;
        
        // Reset completo de progress managers y sliderValues
        sliderValues.current = undefined;
        vodProgressManagerRef.current?.reset();
        dvrProgressManagerRef.current?.reset();
        
        // Limpiar el cast message actual
        castMessage.current = undefined;
        
        // Pequeño delay para asegurar que se limpia el source
        setTimeout(() => {
            console.log(`[Player] (Audio Cast Flavour) switchFromTudumToContent - pendingContentSource.current ${JSON.stringify(pendingContentSource.current)}`)

            // Si hay un source de contenido pendiente, usarlo directamente
            if (pendingContentSource.current && pendingContentSource.current.isReady) {
                console.log(`[Player] (Audio Cast Flavour) Loading pending content source directly`);
                currentSourceType.current = 'content';
                setCastSource(pendingContentSource.current);
                pendingContentSource.current = null;
            } else {
                // Cargar el contenido principal
                console.log(`[Player] (Audio Cast Flavour) Loading main content source`);
                currentSourceType.current = 'content';
                loadContentSource();
            }
        }, 100);
    };

    useEffect(() => {
        console.log(`[Player] (Audio Cast Flavour) castState useEffect - Previous: ${lastCastState.current}, Current: ${castState}`);
        
        if (castState === CastState.CONNECTING && !buffering) {
            console.log(`[Player] (Audio Cast Flavour) Cast connecting, setting buffering true`);
            setBuffering(true);
        } else if (castState !== CastState.CONNECTING && buffering) {
            console.log(`[Player] (Audio Cast Flavour) Cast not connecting, setting buffering false`);
            setBuffering(false);
        }
    
        // Si se desconecta, limpiar estado
        if (castState === CastState.NOT_CONNECTED || castState === CastState.NO_DEVICES_AVAILABLE) {
            console.log(`[Player] (Audio Cast Flavour) Cast disconnected, cleaning up`);
            setIsContentLoaded(false);
            setIsLoadingContent(false);
            castMessage.current = undefined;
            pendingCastMessageData.current = null;
        }
    
        lastCastState.current = castState;
    }, [castState, buffering]);

    useEffect(() => {
        console.log(`[Player] (Audio Cast Flavour) Cast Ready Check:`, {
            castState,
            castClient: !!castClient,
            castSession: !!castSession,
            hasPendingData: !!pendingCastMessageData.current,
            hasCastMessage: !!castMessage.current,
            timestamp: new Date().toISOString()
        });
    
        // Solo proceder si Cast está completamente listo
        const isCastReady = castState === CastState.CONNECTED && castClient && castSession;
        
        if (isCastReady) {
            console.log(`[Player] (Audio Cast Flavour) Cast is fully ready`);
            
            // Si hay datos pendientes, preparar el mensaje
            if (pendingCastMessageData.current) {
                console.log(`[Player] (Audio Cast Flavour) Processing pending message data`);
                const { source, sourceDrm } = pendingCastMessageData.current;
                pendingCastMessageData.current = null;
                
                // Preparar mensaje directamente, sin timeout
                prepareCastMessage(source, sourceDrm);
            }
            // Si ya tenemos mensaje preparado, intentar cargar
            else if (castMessage.current) {
                console.log(`[Player] (Audio Cast Flavour) Cast message exists, trying to load media`);
                tryLoadMedia();
            }
        }
    }, [castState, castClient, castSession]);

    useEffect(() => {
        console.log(`[Player] (Audio Cast Flavour) castClient useEffect - Client: ${!!castClient}, Events registered: ${eventsRegistered.current}`);
        
        if (castClient && !eventsRegistered.current) {
            console.log(`[Player] (Audio Cast Flavour) Registering remote subscriptions`);
            registerRemoteSubscriptions();
        } else if (!castClient && eventsRegistered.current) {
            console.log(`[Player] (Audio Cast Flavour) Unregistering remote subscriptions`);
            unregisterRemoteSubscriptions();
        }
        
        // La lógica de cargar media se maneja en el useEffect dedicado
    }, [castClient]);

    useEffect(() => {
        if (!castMediaStatus){
            return;
        }

        // Loading/Buffering
        if ((castMediaStatus?.playerState === MediaPlayerState.BUFFERING || castMediaStatus?.playerState === MediaPlayerState.LOADING) && !buffering){
            setBuffering(true);
        } else if ((castMediaStatus?.playerState !== MediaPlayerState.BUFFERING && castMediaStatus?.playerState !== MediaPlayerState.LOADING) && buffering){
            setBuffering(false);
        }

        // Paused state
        if (castMediaStatus?.playerState === MediaPlayerState.PAUSED && !paused){
            onControlsPress(CONTROL_ACTION.PAUSE, true);
        } else if (castMediaStatus?.playerState !== MediaPlayerState.PAUSED && paused){
            onControlsPress(CONTROL_ACTION.PAUSE, false);
        }

        // Duration handling - only for content, not tudum
        if (currentSourceType.current === 'content' && typeof(castMediaStatus?.mediaInfo?.streamDuration) === 'number' && castMediaStatus?.mediaInfo?.streamDuration) {
            const duration = castMediaStatus.mediaInfo.streamDuration;
            
            if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR) {
                // Para VOD, establecer la duración
                vodProgressManagerRef.current?.updatePlayerData({
                    currentTime: currentTime,
                    seekableRange: { start: 0, end: duration },
                    duration: duration,
                    isBuffering: isBuffering,
                    isPaused: paused
                });
            }

            if (sourceRef.current?.isDVR) {
                // Para DVR
                dvrProgressManagerRef.current?.updatePlayerData({
                    currentTime: currentTime,
                    duration: duration,
                    seekableRange: { start: 0, end: duration },
                    isBuffering: isBuffering,
                    isPaused: paused
                });
            }
        }
    }, [castMediaStatus]);

    useEffect(() => {
        console.log(`[Player] (Audio Cast Flavour) castSession useEffect - Session: ${!!castSession}`);
        
        if (castSession) {
            // Muted
            castSession.isMute().then((value: boolean) => {
                console.log(`[Player] (Audio Cast Flavour) Cast session mute status: ${value}`);
                if (value !== muted) {
                    onControlsPress(CONTROL_ACTION.MUTE, !!value);
                }
            }).catch((error: any) => {
                console.error(`[Player] (Audio Cast Flavour) Error checking mute status:`, error);
            });
        }
        
        // La lógica de cargar media se maneja en el useEffect dedicado
    }, [castSession]);

    useEffect(() => {
        if (typeof(castStreamPosition) === 'number'){
            setCurrentTime(castStreamPosition);

            // Solo procesar progreso para contenido principal, no para tudum
            if (currentSourceType.current === 'content') {
                if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR){
                    // Para VOD: mantener la duración que se estableció previamente
                    const currentDuration = vodProgressManagerRef.current?.duration || 0;
                    vodProgressManagerRef.current?.updatePlayerData({
                        currentTime: castStreamPosition,
                        seekableRange: { start: 0, end: currentDuration },
                        duration: currentDuration,
                        isBuffering: isBuffering,
                        isPaused: paused
                    });
                }

                if (sourceRef.current?.isDVR){
                    // Para DVR, obtener duración del castMediaStatus si está disponible
                    const duration = castMediaStatus?.mediaInfo?.streamDuration || 0;
                    dvrProgressManagerRef.current?.updatePlayerData({
                        currentTime: castStreamPosition,
                        duration: duration,
                        seekableRange: { start: 0, end: duration },
                        isBuffering: isBuffering,
                        isPaused: paused
                    });
                }

                if (!sourceRef.current?.isLive && props?.events?.onChangeCommonData){
                    const vodDuration = vodProgressManagerRef.current?.duration || 0;
                    props.events.onChangeCommonData({
                        time: castStreamPosition,
                        duration: vodDuration,
                    });
                }
            }
        }
    }, [castStreamPosition]);

    /*
     *  Progress Manager Callbacks
     */

    function onDVRModeChange(data: ModeChangeData) {
        console.log(`[Player] (Audio Cast Flavour) onDVRModeChange: ${JSON.stringify(data)}`);
    };

    function onDVRProgramChange(data: ProgramChangeData) {
        console.log(`[Player] (Audio Cast Flavour) onDVRProgramChange: ${JSON.stringify(data)}`);
    };

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
    };

    function onSeekRequest(playerTime: number) {
        console.log(`[Player] (Audio Cast Flavour) onSeekRequest: ${playerTime}`);
        // Seek en cast player
        invokePlayerAction(castClient, castSession, CONTROL_ACTION.SEEK, playerTime, currentTime, sliderValues.current?.duration || 0, castMediaStatus?.liveSeekableRange, props.events?.onSeek);
    };

    /*
     *  Source Cooking
     */

    const onSourceChanged = (data: onSourceChangedProps) => {
        console.log(`[Player] (Audio Cast Flavour) onSourceChanged - currentSourceType: ${currentSourceType.current}`);
        console.log(`[Player] (Audio Cast Flavour) onSourceChanged - tudumRef.current?.isPlaying ${tudumRef.current?.isPlaying}`);
        console.log(`[Player] (Audio Cast Flavour) onSourceChanged - data isReady: ${data.isReady}`);
        console.log(`[Player] (Audio Cast Flavour) onSourceChanged - data ${JSON.stringify(data)}`);

        console.log(`[Player] (Audio Cast Flavour) onSourceChanged - CAST STATE:`, {
            castState,
            castClient: !!castClient,
            currentSourceType: currentSourceType.current,
            dataReady: data.isReady,
            isLive: sourceRef.current?.isLive,
            isDVR: sourceRef.current?.isDVR,
            timestamp: new Date().toISOString()
        });
        
        if (!sourceRef.current?.isLive && !sourceRef.current?.isDownloaded && currentSourceType.current === 'tudum') {
            // Si estamos reproduciendo tudum, guardar el source del contenido para después
            console.log(`[Player] (Audio Cast Flavour) onSourceChanged - Saving content source for later (tudum is playing)`);
            pendingContentSource.current = data;
            
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
            
            setCastSource(data);
            
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
            
            setCastSource(data);
        }

        // Reset DVR si es necesario
        if (sourceRef.current?.isLive && sourceRef.current?.isDVR) {
            dvrProgressManagerRef.current?.reset();
        }
    };

    const prepareCastMessage = (source: any, sourceDrm?: IDrm) => {
        console.log(`[Player] (Audio Cast Flavour) prepareCastMessage - CAST STATE DEBUG:`, {
            castState,
            castSession: !!castSession,
            castClient: !!castClient,
            castMediaStatus: !!castMediaStatus,
            lastCastState: lastCastState.current,
            eventsRegistered: eventsRegistered.current,
            currentSourceType: currentSourceType.current,
            isLive: sourceRef.current?.isLive,
            isDVR: sourceRef.current?.isDVR,
            timestamp: new Date().toISOString()
        });
        
        // Validación estricta - si no está listo, guardar para después
        if (!castClient || !castSession || castState !== CastState.CONNECTED) {
            console.log(`[Player] (Audio Cast Flavour) prepareCastMessage - Cast not ready, storing pending data`);
            pendingCastMessageData.current = { source, sourceDrm };
            return;
        }
        
        console.log(`[Player] (Audio Cast Flavour) prepareCastMessage - Cast ready, preparing message`);
        
        // Preparamos los datos de Youbora
        if (props.hooks?.getYouboraOptions) {
            youboraForVideo.current = props.hooks.getYouboraOptions(props.playerAnalytics?.youbora!, YOUBORA_FORMAT.CAST);
        }
    
        let startingPoint = props.playerProgress?.currentTime || 0;
    
        // Para DVR, ajustar el punto de inicio
        if (sourceRef.current?.isLive && sourceRef.current?.isDVR && sourceRef.current?.dvrWindowSeconds) {
            startingPoint = undefined; //sourceRef.current.dvrWindowSeconds;
            console.log(`[Player] (Audio Cast Flavour) DVR content, startingPoint set to: ${startingPoint}`);
        }
    
        // Montar el mensaje para el Cast
        castMessage.current = getSourceMessageForCast(source.uri, sourceRef.current?.currentManifest!, sourceDrm || drm.current, youboraForVideo.current, {
            id: props.playerMetadata?.id,
            title: props.playerMetadata?.title,
            subtitle: props.playerMetadata?.subtitle,
            description: props.playerMetadata?.description,
            liveStartDate: props.liveStartDate ? parseInt(props.liveStartDate, 10) : undefined,
            adTagUrl: props.playerAds?.adTagUrl,
            poster: props.playerMetadata?.squaredPoster || props.playerMetadata?.poster,
            isLive: !!props.playerProgress?.isLive,
            hasNext: !!props.events?.onNext,
            startPosition: startingPoint
        });
    
        console.log(`[Player] (Audio Cast Flavour) prepareCastMessage - Message prepared successfully:`, {
            contentId: castMessage.current?.mediaInfo?.contentId,
            isLive: !!props.playerProgress?.isLive,
            isDVR: sourceRef.current?.isDVR,
            startPosition: startingPoint,
            uri: source.uri
        });
        
        // Intentar cargar inmediatamente
        tryLoadMedia();
    };

    const setCastSource = (data?: onSourceChangedProps) => {
        console.log(`[Player] (Audio Cast Flavour) setCastSource - CAST STATE:`, {
            castState,
            castClient: !!castClient,
            dataReady: !!data?.isReady,
            sourceReady: !!sourceRef.current?.isReady,
            currentSourceType: currentSourceType.current,
            timestamp: new Date().toISOString()
        });
    
        if (data && data?.isReady) {
            console.log(`[Player] (Audio Cast Flavour) setCastSource - Using provided data`);
            setBuffering(true);
            drm.current = data.drm;
            prepareCastMessage(data.source!, data.drm);
        } else if (sourceRef.current?.isReady) {
            console.log(`[Player] (Audio Cast Flavour) setCastSource - Using sourceRef`);
            setBuffering(true);
            drm.current = sourceRef.current.playerSourceDrm;
            prepareCastMessage(sourceRef.current.playerSource!, sourceRef.current.playerSourceDrm);
        } else {
            console.log(`[Player] (Audio Cast Flavour) setCastSource - No valid source available`);
        }
    };

    // Cast Events
    const registerRemoteSubscriptions = () => {
        if (castClient){
            eventsRegistered.current = true;

            onMediaPlaybackEndedListener.current = castClient.onMediaPlaybackEnded((mediaStatus: typeof castMediaStatus) => {
                onEnd();
            });

            onMediaPlaybackStartedListener.current = castClient.onMediaPlaybackStarted((mediaStatus: typeof castMediaStatus) => {
                console.log(`[Player] (Audio Cast Flavour) onMediaPlaybackStarted - isContentLoaded: ${isContentLoaded}, isLoadingContent: ${isLoadingContent}`);
                
                if (!isContentLoaded || isLoadingContent){
                    isChangingSource.current = false;
                    setIsContentLoaded(true);
                    setIsLoadingContent(false);

                    if (props.events?.onStart){
                        props.events.onStart();
                    }
                }
            });
        }
    }

    const unregisterRemoteSubscriptions = () => {
        if (onMediaPlaybackEndedListener.current){
            onMediaPlaybackEndedListener.current.remove();
            onMediaPlaybackEndedListener.current = undefined;
        }

        if (onMediaPlaybackStartedListener.current){
            onMediaPlaybackStartedListener.current.remove();
            onMediaPlaybackStartedListener.current = undefined;
        }

        eventsRegistered.current = false;
    }

    // Functions
    const onControlsPress = (id: CONTROL_ACTION, value?: number | boolean) => {
        const COMMON_DATA_FIELDS = ['time', 'volume', 'mute', 'pause'];

        console.log(`[Player] (Audio Cast Flavour) onControlsPress: ${id} (${value})`);

        if (id === CONTROL_ACTION.CLOSE_AUDIO_PLAYER){
            if (props.events?.onClose){
                props.events.onClose();
            }
        }

        if (id === CONTROL_ACTION.PAUSE){
            setPaused(!!value);
        }

        if (id === CONTROL_ACTION.MUTE){
            setMuted(!!value);
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
            // Volver al directo en DVR
            dvrProgressManagerRef.current?.goToLive();
        }

        if (id === CONTROL_ACTION.SEEK_OVER_EPG && sourceRef.current?.isDVR){
            // Volver al inicio del programa en DVR
            dvrProgressManagerRef.current?.goToProgramStart();
        }

        if (id === CONTROL_ACTION.SEEK && sourceRef.current?.isDVR){
            // Hacer seek en DVR
            dvrProgressManagerRef.current?.seekToTime(value);
        }

        if (id === CONTROL_ACTION.FORWARD && sourceRef.current?.isDVR){
            // Hacer seek en DVR
            dvrProgressManagerRef.current?.skipForward(value);
        }

        if (id === CONTROL_ACTION.BACKWARD && sourceRef.current?.isDVR){
            // Hacer seek en DVR
            dvrProgressManagerRef.current?.skipBackward(value);
        }

        if (id === CONTROL_ACTION.SEEK && !sourceRef.current?.isLive){
            // Hacer seek en VOD
            vodProgressManagerRef.current?.seekToTime(value);
        }

        if (id === CONTROL_ACTION.FORWARD && !sourceRef.current?.isLive){
            // Hacer seek en VOD
            vodProgressManagerRef.current?.skipForward(value);
        }

        if (id === CONTROL_ACTION.BACKWARD && !sourceRef.current?.isLive){
            // Hacer seek en VOD
            vodProgressManagerRef.current?.skipBackward(value);
        }

        // Cast specific actions
        if (id === CONTROL_ACTION.SEEK || id === CONTROL_ACTION.FORWARD || id === CONTROL_ACTION.BACKWARD || id === CONTROL_ACTION.PAUSE || id === CONTROL_ACTION.MUTE){
            // Actions to invoke on cast player
            invokePlayerAction(castClient, castSession, id, value, currentTime, sliderValues.current?.duration || 0, castMediaStatus?.liveSeekableRange, props.events?.onSeek);
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
    }

    const onEnd = () => {
        console.log(`[Player] (Audio Cast Flavour) onEnd: currentSourceType ${currentSourceType.current}, isAutoNext: ${props.isAutoNext}`);
        
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
    }

    async function getCurrentMediaStatus() {
        if (isLoadingContent) {
            console.log(`[Player] (Audio Cast Flavour) Already loading content, skipping...`);
            return;
        }
    
        try {
            console.log(`[Player] (Audio Cast Flavour) Getting current media status...`);
            const mediaStatus = await castClient?.getMediaStatus();
            const currentCastContentId = mediaStatus?.mediaInfo?.contentId;
            const newCastContentId = castMessage.current?.mediaInfo?.contentId;
    
            console.log(`[Player] (Audio Cast Flavour) getCurrentMediaStatus - Current Cast: ${currentCastContentId}, New: ${newCastContentId}`);
    
            if (currentCastContentId !== newCastContentId) {
                console.log(`[Player] (Audio Cast Flavour) Different content, loading media:`, {
                    contentId: newCastContentId,
                    isLive: !!props.playerProgress?.isLive,
                    isDVR: sourceRef.current?.isDVR,
                    playbackType: dvrProgressManagerRef.current?.playbackType,
                    startPosition: castMessage.current?.startPosition,
                    uri: castMessage.current?.mediaInfo?.contentUrl
                });
                
                setIsLoadingContent(true);
                setIsContentLoaded(false);
                
                try {
                    const result = await castClient?.loadMedia(castMessage.current!);
                    console.log(`[Player] (Audio Cast Flavour) Media loaded successfully:`, result);
                } catch (error) {
                    console.error(`[Player] (Audio Cast Flavour) Error loading media:`, error);
                    setIsLoadingContent(false);
                    
                    // Reintentar después de un delay si falla
                    setTimeout(() => {
                        console.log(`[Player] (Audio Cast Flavour) Retrying media load...`);
                        if (castState === CastState.CONNECTED && castClient && castSession) {
                            tryLoadMedia();
                        }
                    }, 2000);
                }
            } else {
                console.log(`[Player] (Audio Cast Flavour) Same content already loaded in Cast`);
                if (!isContentLoaded) {
                    setIsContentLoaded(true);
                }
            }
        } catch (error) {
            console.error(`[Player] (Audio Cast Flavour) Error getting media status:`, error);
            setIsLoadingContent(false);
        }
    }

    const tryLoadMedia = () => {
        console.log(`[Player] (Audio Cast Flavour) tryLoadMedia - DETAILED STATE:`, {
            castState,
            castClient: !!castClient,
            castSession: !!castSession,
            castMessage: !!castMessage.current,
            isLoadingContent,
            isContentLoaded,
            currentSourceType: currentSourceType.current,
            contentId: castMessage.current?.mediaInfo?.contentId,
            timestamp: new Date().toISOString()
        });
        
        // Validación más estricta
        if (castState !== CastState.CONNECTED) {
            console.log(`[Player] (Audio Cast Flavour) tryLoadMedia - Cast not connected (state: ${castState}), skipping`);
            return;
        }
        
        if (!castClient) {
            console.log(`[Player] (Audio Cast Flavour) tryLoadMedia - No castClient available, skipping`);
            return;
        }
        
        if (!castSession) {
            console.log(`[Player] (Audio Cast Flavour) tryLoadMedia - No castSession available, skipping`);
            return;
        }
        
        if (!castMessage.current) {
            console.log(`[Player] (Audio Cast Flavour) tryLoadMedia - No castMessage prepared, skipping`);
            return;
        }
        
        console.log(`[Player] (Audio Cast Flavour) tryLoadMedia - All conditions met, attempting to load media`);
        
        try {
            getCurrentMediaStatus();
        } catch (reason) {
            console.error(`[Player] (Audio Cast Flavour) tryLoadMedia error:`, reason);
        }
    };

    const onSlidingComplete = (value: number) => {
        console.log(`[Player] (Audio Cast Flavour) onSlidingComplete: ${value}`);
        onControlsPress(CONTROL_ACTION.SEEK, value);
    }

    const Controls = props.controls ? createElement(props.controls, { 
        preloading: isBuffering || isLoadingContent,
        isContentLoaded: isContentLoaded,
        speedRate: 1, // Cast no tiene speedRate
        extraData: props.extraData,

        // Nuevas Props Agrupadas
        playerMetadata: props.playerMetadata,
        playerProgress: playerProgressRef.current,
        playerAnalytics: props.playerAnalytics,
        playerTimeMarkers: props.playerTimeMarkers,
        playerAds: props.playerAds,

        //Events
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