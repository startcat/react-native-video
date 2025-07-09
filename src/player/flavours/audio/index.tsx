import React, { createElement, useCallback, useEffect, useRef, useState } from 'react';
import BackgroundTimer from 'react-native-background-timer';
import { EventRegister } from 'react-native-event-listeners';
import Animated, { useSharedValue } from 'react-native-reanimated';
import {
    type AudioControlsProps,
    type IPlayerProgress,
    type OnBufferData,
    //type OnVideoErrorData,
    type OnLoadData,
    type OnProgressData,
    type ProgressUpdateData,
    //type OnVolumeChangeData,
    type SliderValues,
} from '../../../types';
import Video, { type VideoRef } from '../../../Video';

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

import { styles } from '../styles';

import {
    type AudioFlavourProps,
    type AudioPlayerActionEventProps,
    type ICommonData,
    type IDrm,
    type IMappedYoubora,
    type IVideoSource,
    CONTROL_ACTION,
    YOUBORA_FORMAT,
} from '../../types';

export function AudioFlavour (props: AudioFlavourProps): React.ReactElement {

    const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
    const audioPlayerHeight = useSharedValue(0);

    const youboraForVideo = useRef<IMappedYoubora>();
    const drm = useRef<IDrm>();
    const [videoSource, setVideoSource] = useState<IVideoSource | undefined>(undefined);

    const isChangingSource = useRef<boolean>(true);

    const [currentTime, setCurrentTime] = useState<number>(props.playerProgress?.currentTime || 0);
    const [paused, setPaused] = useState<boolean>(!!props.playerProgress?.isPaused);
    const [muted, setMuted] = useState<boolean>(!!props?.playerProgress?.isMuted);
    const [buffering, setBuffering] = useState<boolean>(false);
    const [speedRate, setSpeedRate] = useState<number>(1);

    const refVideoPlayer = useRef<VideoRef>(null);
    const sleepTimerObj = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sliderValues = useRef<SliderValues>();

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
        console.log(`[Player] (Audio Flavour) useEffect videoSource ${JSON.stringify(videoSource)}`);

    }, [videoSource?.uri]);

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
        console.log(`[Player] (Audio Flavour) useEffect manifests - isAutoNext: ${props.isAutoNext}`);
        console.log(`[Player] (Audio Flavour) useEffect manifests - tudumRef.current ${tudumRef.current} - isReady ${tudumRef.current?.isReady}`);
        console.log(`[Player] (Audio Flavour) useEffect manifests - sourceRef.current ${sourceRef.current} - isReady ${sourceRef.current?.isReady}`);

        // Verificar si es contenido live/DVR vs VOD
        const isLiveContent = !!props.playerProgress?.isLive;

        if (isLiveContent) {
            // COMPORTAMIENTO ORIGINAL PARA LIVE/DVR - Sin tudum, sin resets complicados
            if (!tudumRef.current){
                tudumRef.current = new TudumClass({
                    enabled: false, // Nunca tudum para live
                    getTudumSource: props.hooks?.getTudumSource,
                    getTudumManifest: props.hooks?.getTudumManifest,
                });
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

        } else {
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
            console.log(`[Player] (Audio Flavour) shouldPlayTudum: ${shouldPlayTudum}`);

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
                    headers: props.headers,
                    getSourceUri: props.hooks?.getSourceUri,
                    onSourceChanged: onSourceChanged
                });
            }

            // Establecer currentSourceType basado en si vamos a reproducir tudum
            if (shouldPlayTudum && tudumRef.current?.isReady && !sourceRef.current?.isDownloaded) {
                console.log(`[Player] (Audio Flavour) Will play tudum first, then content`);
                currentSourceType.current = 'tudum';
                loadTudumSource();
            } else {
                console.log(`[Player] (Audio Flavour) Skipping tudum - loading content directly`);
                currentSourceType.current = 'content';
                loadContentSource();
            }
        }

    }, [props.manifests, props.isAutoNext]);

    useEffect(() => {
        EventRegister.emit('audioPlayerProgress', {
            preloading: isBuffering,
            isContentLoaded: isContentLoaded,
            speedRate: speedRate,
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

    }, [currentTime, props.playerMetadata, paused, muted, isBuffering, sourceRef.current?.isDVR, isContentLoaded, speedRate, sliderValuesUpdate]);

    // Función para cargar source del tudum
    const loadTudumSource = () => {
        console.log(`[Player] (Audio Flavour) loadTudumSource`);
        
        if (tudumRef.current?.source) {
            currentSourceType.current = 'tudum';
            tudumRef.current.isPlaying = true;
            drm.current = tudumRef.current?.drm;
            
            console.log(`[Player] (Audio Flavour) Setting tudum source:`, tudumRef.current.source);
            setVideoSource(tudumRef.current.source);
        }
    };

    // Función para cargar source del contenido
    const loadContentSource = () => {
        console.log(`[Player] (Audio Flavour) loadContentSource`);
        
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
                    console.log(`[Player] (Audio Flavour) Forcing content load - sourceRef is ready`);
                    setPlayerSource();
                }
            }, 100);
        }
    };

    // Función para cambiar de tudum a contenido
    const switchFromTudumToContent = () => {
        console.log(`[Player] (Audio Flavour) switchFromTudumToContent`);
        
        // Limpiar completamente el source del tudum
        currentSourceType.current = null;
        tudumRef.current!.isPlaying = false;
        
        // Reset completo de progress managers y sliderValues
        sliderValues.current = undefined;
        vodProgressManagerRef.current?.reset();
        dvrProgressManagerRef.current?.reset();
        
        // Limpiar el video source actual
        setVideoSource(undefined);
        
        // Pequeño delay para asegurar que se limpia el source
        setTimeout(() => {
            console.log(`[Player] (Audio Flavour) switchFromTudumToContent - pendingContentSource.current ${JSON.stringify(pendingContentSource.current)}`)

            // Si hay un source de contenido pendiente, usarlo directamente
            if (pendingContentSource.current && pendingContentSource.current.isReady) {
                console.log(`[Player] (Audio Flavour) Loading pending content source directly`);
                currentSourceType.current = 'content';
                setPlayerSource(pendingContentSource.current);
                pendingContentSource.current = null;
            } else {
                // Cargar el contenido principal
                console.log(`[Player] (Audio Flavour) Loading main content source`);
                currentSourceType.current = 'content';
                loadContentSource();
            }
        }, 100);
    };

    // Source Cooking
    const onSourceChanged = (data: onSourceChangedProps) => {
        console.log(`[Player] (Audio Flavour) onSourceChanged - currentSourceType: ${currentSourceType.current}`);
        console.log(`[Player] (Audio Flavour) onSourceChanged - tudumRef.current?.isPlaying ${tudumRef.current?.isPlaying}`);
        console.log(`[Player] (Audio Flavour) onSourceChanged - data isReady: ${data.isReady}`);
        console.log(`[Player] (Audio Flavour) onSourceChanged - data ${JSON.stringify(data)}`);
        
        if (!sourceRef.current?.isLive && !sourceRef.current?.isDownloaded && currentSourceType.current === 'tudum') {
            // Si estamos reproduciendo tudum, guardar el source del contenido para después
            console.log(`[Player] (Audio Flavour) onSourceChanged - Saving content source for later (tudum is playing)`);
            pendingContentSource.current = data;

            console.log(`[Player] (Audio Flavour) onSourceChanged - pendingContentSource.current ${JSON.stringify(pendingContentSource.current)}`);
            
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
                    console.log(`[Player] (Audio Flavour) onSourceChanged - error ${ex?.message}`);
                }
            }
            
        } else if (currentSourceType.current === 'content') {
            // Si ya estamos en modo contenido, procesar normalmente
            console.log(`[Player] (Audio Flavour) onSourceChanged - Processing content source normally`);
            
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
                console.log(`[Player] (Audio Flavour) onSourceChanged - error ${ex?.message}`);
            }
            
            setPlayerSource(data);
            
        } else {
            // Estado inicial o indefinido
            console.log(`[Player] (Audio Flavour) onSourceChanged - Initial state, processing source`);
            
            // Si no tenemos tipo definido, debe ser contenido
            if (!currentSourceType.current) {
                currentSourceType.current = 'content';
                console.log(`[Player] (Audio Flavour) onSourceChanged - Setting currentSourceType to content`);
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
                console.log(`[Player] (Audio Flavour) onSourceChanged - error ${ex?.message}`);
            }
            
            setPlayerSource(data);
        }

        // Reset DVR si es necesario
        if (sourceRef.current?.isLive && sourceRef.current?.isDVR) {
            dvrProgressManagerRef.current?.reset();
        }
    };

    const setPlayerSource = (data?: onSourceChangedProps) => {
        console.log(`[Player] (Audio Flavour) setPlayerSource (data isReady ${!!data?.isReady})`);
        console.log(`[Player] (Audio Flavour) setPlayerSource (sourceRef isReady ${!!sourceRef.current?.isReady})`);
        console.log(`[Player] (Audio Flavour) setPlayerSource (currentSourceType ${currentSourceType.current})`);
        console.log(`[Player] (Audio Flavour) setPlayerSource (data ${JSON.stringify(data)})`);

        if (data && data?.isReady) {
            console.log(`[Player] (Audio Flavour) setPlayerSource - Using provided data`);
            setBuffering(true);
            drm.current = data.drm;

            // Preparamos los datos de Youbora
            if (props.hooks?.getYouboraOptions) {
                youboraForVideo.current = props.hooks.getYouboraOptions(props.playerAnalytics?.youbora!, YOUBORA_FORMAT.MOBILE);
            }

            console.log(`[Player] (Audio Flavour) setPlayerSource - Setting content source:`, data.source);
            setVideoSource(data.source!);
        } else if (sourceRef.current?.isReady) {
            console.log(`[Player] (Audio Flavour) setPlayerSource - Using sourceRef`);
            setBuffering(true);
            drm.current = sourceRef.current.playerSourceDrm;

            // Preparamos los datos de Youbora
            if (props.hooks?.getYouboraOptions) {
                youboraForVideo.current = props.hooks.getYouboraOptions(props.playerAnalytics?.youbora!, YOUBORA_FORMAT.MOBILE);
            }

            console.log(`[Player] (Audio Flavour) setPlayerSource - Setting sourceRef content:`, sourceRef.current.playerSource);
            setVideoSource(sourceRef.current.playerSource!);
        } else {
            console.log(`[Player] (Audio Flavour) setPlayerSource - No valid source available`);
        }
    }

    /*
     *  DVR Progress Manager
     */

    function onDVRModeChange(data: ModeChangeData) {
        console.log(`[Player] (Audio Flavour) onDVRModeChange: ${JSON.stringify(data)}`);
    };

    function onDVRProgramChange(data: ProgramChangeData) {
        console.log(`[Player] (Audio Flavour) onDVRProgramChange: ${JSON.stringify(data)}`);
    };

    function onProgressUpdate(data: ProgressUpdateData) {
        // console.log(`[Player] (Audio Flavour) onProgressUpdate - currentSourceType: ${currentSourceType.current}, duration: ${data.duration}`);
        
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
                console.log(`[Player] (Audio Flavour) onProgressUpdate - error ${ex?.message}`);
            }

            // Trigger re-render del useEffect para emitir eventos con nuevos sliderValues
            setSliderValuesUpdate((prev: number) => prev + 1);
        } else {
            console.log(`[Player] (Audio Flavour) onProgressUpdate - Ignoring progress update for ${currentSourceType.current}`);
        }
    };

    function onSeekRequest(playerTime: number) {
        console.log(`[Player] (Audio Flavour) onSeekRequest: ${playerTime}`);
        // Seek en player real
        refVideoPlayer.current?.seek(playerTime);
    };

    // Sleep Timer
    const cancelSleepTimer = () => {
        const now = new Date();
        console.log(`[Player] (Audio Flavour) [${now.toLocaleDateString()} ${now.toLocaleTimeString()}] Cancel sleep timer`);

        if (sleepTimerObj.current){
            BackgroundTimer.clearTimeout(sleepTimerObj.current);

        }

    }

    const refreshSleepTimer = (value: number) => {
        const now = new Date();
        console.log(`[Player] (Audio Flavour) [${now.toLocaleDateString()} ${now.toLocaleTimeString()}] Creating sleep timer for ${value} seconds`);

        if (sleepTimerObj.current){
            BackgroundTimer.clearTimeout(sleepTimerObj.current);

        }

        sleepTimerObj.current = BackgroundTimer.setTimeout(() => {
            const now = new Date();
            console.log(`[Player] (Audio Flavour) [${now.toLocaleDateString()} ${now.toLocaleTimeString()}] onSleepTimer Done...`);
            
            if (refVideoPlayer.current){
                console.log(`[Player] (Audio Flavour) [${now.toLocaleDateString()} ${now.toLocaleTimeString()}] onSleepTimer Done... calling pause`);
                refVideoPlayer.current?.pause();
                cancelSleepTimer();
                setPaused(true);

            } else {
                console.log(`[Player] (Audio Flavour) [${now.toLocaleDateString()} ${now.toLocaleTimeString()}] onSleepTimer Done... cant acces refVideoPlayer`);
                refreshSleepTimer(2000);

            }

        }, value * 1000);

    }

    // Functions
    const onControlsPress = useCallback((id: CONTROL_ACTION, value?: number | boolean) => {

        const COMMON_DATA_FIELDS = ['time', 'volume', 'mute', 'pause'];

        console.log(`[Player] (Audio Flavour) onControlsPress: ${id} (${value})`);

        if (id === CONTROL_ACTION.PAUSE){
            setPaused(!!value);
        }

        if (id === CONTROL_ACTION.CLOSE_AUDIO_PLAYER){
            // Clear workarround
            setVideoSource({
                // @ts-ignore
                id: null,
                // @ts-ignore
                title: null,
                // @ts-ignore
                uri: null,
                // @ts-ignore
                type: null
            });

            if (props.events?.onClose){
                props.events.onClose();

            }

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
        
        if (id === CONTROL_ACTION.SPEED_RATE && typeof(value) === 'number'){
            setSpeedRate(value);
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
            // Hacer seek en DVR
            vodProgressManagerRef.current?.seekToTime(value);
        }

        if (id === CONTROL_ACTION.FORWARD && !sourceRef.current?.isLive){
            // Hacer seek en DVR
            vodProgressManagerRef.current?.skipForward(value);
        }

        if (id === CONTROL_ACTION.BACKWARD && !sourceRef.current?.isLive){
            // Hacer seek en DVR
            vodProgressManagerRef.current?.skipBackward(value);
        }

        if (id === CONTROL_ACTION.SLEEP && (value === 0 || !value)){
            // Desactivamos el sleeper
            cancelSleepTimer();
        }

        if (id === CONTROL_ACTION.SLEEP && typeof(value) === 'number' && value > 0){
            // Activamos el sleeper
            refreshSleepTimer(value);
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

    }, [currentTime]);

    const onLoad = async (e: OnLoadData) => {

        console.log(`[Player] (Audio Flavour) onLoad (${sourceRef.current?.playerSource?.uri})`);
        console.log(`[Player] (Audio Flavour) onLoad currentSourceType: ${currentSourceType.current}`);
        console.log(`[Player] (Audio Flavour) onLoad tudumRef.current?.isPlaying ${tudumRef.current?.isPlaying}`);
        console.log(`[Player] (Audio Flavour) onLoad isContentLoaded ${isContentLoaded}`);
        console.log(`[Player] (Audio Flavour) onLoad duration: ${e.duration}, currentTime: ${e.currentTime}`);

        // Solo procesar onLoad para contenido principal, no para tudum
        if (currentSourceType.current === 'content' && !isContentLoaded) {
            console.log(`[Player] (Audio Flavour) onLoad - Processing content load`);

            // Para VOD, establecer la duración desde el evento onLoad
            if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR && e.duration) {
                console.log(`[Player] (Audio Flavour) onLoad - Setting VOD duration from load event: ${e.duration}s`);
                vodProgressManagerRef.current?.updatePlayerData({
                    currentTime: e.currentTime || 0,
                    seekableRange: { start: 0, end: e.duration },
                    duration: e.duration,
                    isBuffering: false,
                    isPaused: paused
                });
            }

            // Inicializar progress managers
            if (sourceRef.current?.isDVR) {
                dvrProgressManagerRef.current?.setInitialTimeWindowSeconds(sourceRef.current.dvrWindowSeconds);
            }

            isChangingSource.current = false;
            setIsContentLoaded(true);

            if (props.events?.onStart) {
                props.events.onStart();
            }

            // Seek inicial al cargar un live con DVR
            if (sourceRef.current?.isDVR && dvrProgressManagerRef.current) {
                dvrProgressManagerRef.current.checkInitialSeek();
            }

        } else if (currentSourceType.current === 'tudum') {
            console.log(`[Player] (Audio Flavour) onLoad - Tudum loaded, duration: ${e.duration}`);
        } else {
            console.log(`[Player] (Audio Flavour) onLoad - Ignoring load event (sourceType: ${currentSourceType.current}, isContentLoaded: ${isContentLoaded})`);
        }
    }

    const onEnd = () => {
        console.log(`[Player] (Audio Flavour) onEnd: currentSourceType ${currentSourceType.current}, isAutoNext: ${props.isAutoNext}`);
        
        if (currentSourceType.current === 'tudum') {
            // Acaba la reproducción del Tudum externo
            console.log(`[Player] (Audio Flavour) onEnd: Tudum finished, switching to main content`);
            isChangingSource.current = true;
            switchFromTudumToContent();

        } else if (currentSourceType.current === 'content' && props.events?.onEnd) {
            // Termina el contenido principal
            console.log(`[Player] (Audio Flavour) onEnd: Content finished, preparing for possible auto next`);
            
            // Preparar tudum para salto automático antes de notificar
            if (tudumRef.current) {
                tudumRef.current.prepareForAutoNext();
            }
            
            props.events.onEnd();
        } else {
            console.log(`[Player] (Audio Flavour) onEnd: Unknown state - currentSourceType: ${currentSourceType.current}, hasOnEnd: ${!!props.events?.onEnd}`);
        }
    }

    const onProgress = (e: OnProgressData) => {

        if (typeof(e.currentTime) === 'number' && currentTime !== e.currentTime){
            // Trigger para el cambio de estado
            setCurrentTime(e.currentTime);
        }

        // Solo procesar progreso para contenido principal, no para tudum
        if (currentSourceType.current === 'content') {
            if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR){
                // Para VOD: NO actualizar duration en onProgress, mantener la que se estableció en onLoad
                const currentDuration = vodProgressManagerRef.current?.duration || 0;
                vodProgressManagerRef.current?.updatePlayerData({
                    currentTime: e.currentTime,
                    seekableRange: { start: 0, end: currentDuration > 0 ? currentDuration : e.seekableDuration },
                    duration: currentDuration, // Mantener duración existente
                    isBuffering: isBuffering,
                    isPaused: paused
                });
            }

            if (sourceRef.current?.isDVR){
                // Para DVR, usar la duración del evento onProgress
                dvrProgressManagerRef.current?.updatePlayerData({
                    currentTime: e.currentTime,
                    duration: e.playableDuration,
                    seekableRange: { start: 0, end: e.seekableDuration },
                    isBuffering: isBuffering,
                    isPaused: paused
                });
            }

            if (!sourceRef.current?.isLive && props?.events?.onChangeCommonData){
                const vodDuration = vodProgressManagerRef.current?.duration || 0;
                props.events.onChangeCommonData({
                    time: e.currentTime,
                    duration: vodDuration, // Usar la duración guardada para VOD
                });
            }

        } else {
            console.log(`[Player] (Audio Flavour) onProgress: Ignoring progress for ${currentSourceType.current} - currentTime: ${e.currentTime}, duration: ${e.playableDuration}`);
        }

    }

    const onReadyForDisplay = () => {
        setBuffering(false);
    }

    const onBuffer = (e: OnBufferData) => {
        setBuffering(!!e?.isBuffering);
    }

    const onError = (e: any) => {
        console.log(`[Player] (Audio Flavour) onError: ${JSON.stringify(e)} - currentSourceType: ${currentSourceType.current}`);
    }

    const onSlidingComplete = (value: number) => {
        // console.log(`[Player] (Audio Flavour) onSlidingComplete: ${value}`);
        onControlsPress(CONTROL_ACTION.SEEK, value);
    }

    const Controls = props.controls ? createElement(props.controls, { 
        preloading: isBuffering,
        isContentLoaded: isContentLoaded,
        speedRate: speedRate,
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
            height:audioPlayerHeight,
            backgroundColor: props.backgroundColor || styles.container.backgroundColor,
            borderColor: props.topDividerColor,
            borderTopWidth: props.topDividerColor ? 1 : 0
        }}>

            {
                videoSource ?
                    <Video
                        // @ts-ignore
                        ref={refVideoPlayer}
                        style={styles.audioPlayer}
                        // @ts-ignore
                        source={videoSource}
                        // @ts-ignore
                        drm={drm.current}
                        // @ts-ignore
                        youbora={youboraForVideo.current}
                        playOffline={props.playOffline}
                        multiSession={props.playerProgress?.liveValues?.multiSession}

                        focusable={false}
                        disableDisconnectError={true}
                        debug={{
                            enable: true,
                            thread: true,
                        }}

                        bufferConfig={{
                            minBufferMs: 15000,
                            maxBufferMs: 50000,
                            bufferForPlaybackMs: 2500,
                            bufferForPlaybackAfterRebufferMs: 5000,
                            backBufferDurationMs: 120000,
                            cacheSizeMB: 50,
                            live: {
                                targetOffsetMs: 25000,
                            },
                        }}

                        allowsExternalPlayback={true}
                        //volume={10}
                        controls={false}
                        ignoreSilentSwitch='ignore'
                        showNotificationControls={true}
                        resizeMode='contain'
                        minLoadRetryCount={3}
                        hideShutterView={true}
                        muted={muted}
                        paused={paused}
                        rate={speedRate}
                        //pictureInPicture (ios)
                        playInBackground={true}
                        playWhenInactive={true}
                        poster={props?.playerMetadata?.poster}
                        preventsDisplaySleepDuringVideoPlayback={false}
                        progressUpdateInterval={1000}

                        //onVolumeChange={onVolumeChange}
                        onEnd={onEnd}
                        onLoad={onLoad}
                        onProgress={onProgress}
                        onReadyForDisplay={onReadyForDisplay}
                        onBuffer={onBuffer}
                        onError={onError}
                    />
                : null
            }

            { Controls }

        </Animated.View>
    );

};

export default AudioFlavour;