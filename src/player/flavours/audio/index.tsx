import React, { createElement, useCallback, useEffect, useRef, useState } from 'react';
import BackgroundTimer from 'react-native-background-timer';
import { EventRegister } from 'react-native-event-listeners';
import Animated, { useSharedValue } from 'react-native-reanimated';
import {
    type AudioControlsProps,
    type IPlayerProgress,
    type OnBufferData,
    type OnLoadData,
    type OnProgressData,
    type OnVideoErrorData,
    type ProgressUpdateData,
    type SliderValues
} from '../../../types';
import Video, { type VideoRef } from '../../../Video';

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

import { useVideoAnalytics } from '../../core/events/hooks/useVideoAnalytics';

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
    const [sliderValues, setSliderValues] = useState<SliderValues | undefined>(undefined);

    // Player Progress
    const playerProgressRef = useRef<IPlayerProgress>();

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

    // Hook para el estado de buffering
    const isBuffering = useIsBuffering({
        buffering: buffering,
        paused: paused,
        onBufferingChange: props.events?.onBuffering
    });

    // Hook para los plugins de analíticas
    const {
        videoEvents,
        analyticsEvents,
    } = useVideoAnalytics({
        plugins: props.features?.analyticsConfig || [],
    });

    useEffect(() => {
        console.log(`[Player] (Audio Flavour) useEffect videoSource ${JSON.stringify(videoSource)}`);

    }, [videoSource?.uri]);

    useEffect(() => {

        const actionsAudioPlayerListener = EventRegister.addEventListener('audioPlayerAction', (data: AudioPlayerActionEventProps) => {
            handleOnControlsPress(data.action, data.value);
            
        });

        return (() => {

            if (typeof(actionsAudioPlayerListener) === 'string'){
                EventRegister.removeEventListener(actionsAudioPlayerListener);
            }

        });

    }, []);

    useEffect(() => {
        console.log(`[Player] (Audio Flavour) 🔄 useEffect manifests TRIGGERED`);
        console.log(`[Player] (Audio Flavour) useEffect manifests - isAutoNext: ${props.isAutoNext}`);
        console.log(`[Player] (Audio Flavour) useEffect manifests - tudumRef.current ${tudumRef.current} - isReady ${tudumRef.current?.isReady}`);
        console.log(`[Player] (Audio Flavour) useEffect manifests - sourceRef.current ${sourceRef.current} - isReady ${sourceRef.current?.isReady}`);
        console.log(`[Player] (Audio Flavour) useEffect manifests - isContentLoaded: ${isContentLoaded}, isChangingSource: ${isChangingSource.current}`);

        // Verificar si es contenido live/DVR vs VOD
        const isLiveContent = !!props.playerProgress?.isLive;

        if (isLiveContent) {
            // Para contenido live, si ya está cargado y no estamos cambiando source, no hacer nada
            if (isContentLoaded && !isChangingSource.current) {
                console.log(`[Player] (Audio Flavour) useEffect manifests - ✅ Live content already loaded, skipping`);
                return;
            }
            // LÓGICA PARA LIVE/DVR - cargar contenido directamente sin tudum
            console.log(`[Player] (Audio Flavour) useEffect manifests - Live content detected, skipping tudum`);
            
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
                    isCast: false,                    
                    headers: props.headers,
                    getBestManifest: props.hooks?.getBestManifest,
                    getSourceUri: props.hooks?.getSourceUri,
                    onSourceChanged: onSourceChanged
                });
            }

            // Para live, cargar contenido directamente
            console.log(`[Player] (Audio Flavour) useEffect manifests - Setting currentSourceType to 'content' and isChangingSource to true`);
            currentSourceType.current = 'content';
            isChangingSource.current = true;
            
            console.log(`[Player] (Audio Flavour) useEffect manifests - Calling changeSource with manifests`);
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
                isCast: false,
                headers: props.headers,
            });
            
            console.log(`[Player] (Audio Flavour) useEffect manifests - changeSource called, waiting for onLoad...`);

        } else {
            // LÓGICA DEL TUDUM SOLO PARA VOD
            
            // Reset completo solo para VOD
            currentSourceType.current = null;
            pendingContentSource.current = null;
            setSliderValues(undefined);
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
                    isLive: false,
                    isCast: false,
                    headers: props.headers,
                    getBestManifest: props.hooks?.getBestManifest,
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

    // Debug useEffect para monitorear cambios en isContentLoaded
    useEffect(() => {
        console.log(`[Player] (Audio Flavour) 🔍 isContentLoaded changed to: ${isContentLoaded}`);
        console.log(`[Player] (Audio Flavour) 🔍 isChangingSource current value: ${isChangingSource.current}`);
    }, [isContentLoaded]);

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
                isCast: false,
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
        setSliderValues(undefined);
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

    // Función auxiliar para combinar eventos
    const combineEventHandlers = (originalHandler?: Function, analyticsHandler?: Function) => {
        return (...args: any[]) => {
            // Ejecutar handler original primero
            originalHandler?.(...args);
            // Luego ejecutar handler de analíticas
            analyticsHandler?.(...args);
        };
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
                        duration: sliderValues?.duration || 0,
                        isPaused: paused,
                        isMuted: muted,
                        isContentLoaded: isContentLoaded,
                        isChangingSource: isChangingSource.current,
                        sliderValues: sliderValues,
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
                    duration: sliderValues?.duration || 0,
                    isPaused: paused,
                    isMuted: muted,
                    isContentLoaded: isContentLoaded,
                    isChangingSource: isChangingSource.current,
                    sliderValues: sliderValues,
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
                    duration: sliderValues?.duration || 0,
                    isPaused: paused,
                    isMuted: muted,
                    isContentLoaded: isContentLoaded,
                    isChangingSource: isChangingSource.current,
                    sliderValues: sliderValues,
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
     *  Gestores de Progreso
     *
     */

    const handleOnProgressUpdate = useCallback((data: ProgressUpdateData) => {
        console.log(`[Player] (Audio Flavour) handleOnProgressUpdate ${JSON.stringify(data)}`);
        
        // Solo actualizar sliderValues si estamos reproduciendo contenido, no tudum
        if (currentSourceType.current === 'content') {
            setSliderValues({
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
                isLiveEdgePosition: data.isLiveEdgePosition
            });

            try {
                playerProgressRef.current = {
                    ...props.playerProgress,
                    currentTime: currentTime,
                    duration: sliderValues?.duration || 0,
                    isPaused: paused,
                    isMuted: muted,
                    isContentLoaded: isContentLoaded,
                    isChangingSource: isChangingSource.current,
                    sliderValues: sliderValues,
                    currentProgram: data.currentProgram,
                };
            } catch (ex: any) {
                console.log(`[Player] (Audio Flavour) handleOnProgressUpdate - error ${ex?.message}`);
            }
        }
    }, [currentTime, paused, muted, isContentLoaded, props.playerProgress]);

    const handleOnSeekRequest = useCallback((playerTime: number) => {
        console.log(`[Player] (Audio Flavour) handleOnSeekRequest: ${playerTime}`);
        refVideoPlayer.current?.seek(playerTime);
    }, []);

    const handleOnDVRModeChange = useCallback((data: ModeChangeData) => {
        console.log(`[Player] (Audio Flavour) handleOnDVRModeChange: ${JSON.stringify(data)}`);
    }, []);

    const handleOnDVRProgramChange = useCallback((data: ProgramChangeData) => {
        console.log(`[Player] (Audio Flavour) handleOnDVRProgramChange: ${JSON.stringify(data)}`);
    }, []);

    /*
     *  Inicialización de Progress Managers
     *
     */
    
    useEffect(() => {
        // Initialize VOD Progress Manager
        if (!vodProgressManagerRef.current) {
            vodProgressManagerRef.current = new VODProgressManagerClass({
                onProgressUpdate: handleOnProgressUpdate,
                onSeekRequest: handleOnSeekRequest
            });
            console.log('[Player] VOD Progress Manager initialized');
        }

        // Initialize DVR Progress Manager  
        if (!dvrProgressManagerRef.current) {
            dvrProgressManagerRef.current = new DVRProgressManagerClass({
                playbackType: props.playerProgress?.liveValues?.playbackType,
                getEPGProgramAt: props.hooks?.getEPGProgramAt,
                onModeChange: handleOnDVRModeChange,
                onProgramChange: handleOnDVRProgramChange,
                onProgressUpdate: handleOnProgressUpdate,
                onSeekRequest: handleOnSeekRequest
            });
            console.log('[Player] DVR Progress Manager initialized');
        }
    }, [handleOnProgressUpdate, handleOnSeekRequest, handleOnDVRModeChange, handleOnDVRProgramChange]);

    useEffect(() => {
        return () => {
            if (vodProgressManagerRef.current) {
                vodProgressManagerRef.current.destroy();
            }
            if (dvrProgressManagerRef.current) {
                dvrProgressManagerRef.current.destroy();
            }
        };
    }, []);

    useEffect(() => {
        const isLiveContent = !!props.playerProgress?.isLive;
        
        if (isLiveContent && sourceRef.current?.isDVR && dvrProgressManagerRef.current) {
            const dvrWindow = sourceRef.current.dvrWindowSeconds || 3600; // 1 hora por defecto
            console.log(`[Player] Setting DVR window: ${dvrWindow}s`);
            dvrProgressManagerRef.current.setDVRWindowSeconds(dvrWindow);
        }
    }, [props.playerProgress?.isLive, sourceRef.current?.isDVR, sourceRef.current?.dvrWindowSeconds]);

    /*
     *  Sleep Timer
     *
     */

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

    /*
     *  Handlers para los eventos de interfaz
     *
     */

    const handleOnControlsPress = useCallback(async (id: CONTROL_ACTION, value?: number | boolean) => {

        const COMMON_DATA_FIELDS = ['time', 'volume', 'mute', 'pause'];

        console.log(`[Player] (Audio Flavour) handleOnControlsPress: ${id} (${value})`);

        if (id === CONTROL_ACTION.PAUSE){
            const newPausedState = !!value;
            setPaused(newPausedState);
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
            console.log(`[Player] (Audio Flavour) CONTROL_ACTION.NEXT - Resetting isContentLoaded to false`);
            setIsContentLoaded(false);
            props.events.onNext();

            // Evento analíticas
            analyticsEvents.onStop({ reason: 'navigation' });
        }

        if (id === CONTROL_ACTION.PREVIOUS && props.events?.onPrevious){
            console.log(`[Player] (Audio Flavour) CONTROL_ACTION.PREVIOUS - Resetting isContentLoaded to false`);
            setIsContentLoaded(false);
            props.events.onPrevious();

            // Evento analíticas
            analyticsEvents.onStop({ reason: 'navigation' });
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

    }, [currentTime, isBuffering]);

    const handleOnSlidingStart = (value: number) => {
        console.log(`[Player] (Audio Flavour) handleOnSlidingStart: ${value}`);
        
        // Activar manual seeking en el progress manager correspondiente
        if (sourceRef.current?.isDVR) {
            dvrProgressManagerRef.current?.setManualSeeking(true);
        }
    };

    const handleOnSlidingComplete = (value: number) => {
        console.log(`[Player] (Audio Flavour) handleOnSlidingComplete: ${value}`);

        // Desactivar manual seeking y hacer el seek
        if (sourceRef.current?.isDVR) {
            dvrProgressManagerRef.current?.setManualSeeking(false);
        }

        handleOnControlsPress(CONTROL_ACTION.SEEK, value);
    }

    /*
     *  Evento del progreso del audio player
     *
     */

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
                sliderValues: sliderValues,
                currentProgram: playerProgressRef.current?.currentProgram,
            },
            playerAnalytics: props.playerAnalytics,
            playerTimeMarkers: props.playerTimeMarkers,
            //Events
            events: props.events,
        } as AudioControlsProps);

    }, [currentTime, sliderValues, props.playerProgress, props.playerMetadata, paused, muted, isBuffering, sourceRef.current?.isDVR, isContentLoaded, speedRate, handleOnControlsPress]);

    /*
     *  Handlers para los eventos
     *
     */

    const handleOnLoad = async (e: OnLoadData) => {

        console.log(`[Player] (Audio Flavour) handleOnLoad ENTRY - URI: ${sourceRef.current?.playerSource?.uri}`);
        console.log(`[Player] (Audio Flavour) handleOnLoad ENTRY - currentSourceType: ${currentSourceType.current}`);
        console.log(`[Player] (Audio Flavour) handleOnLoad ENTRY - isContentLoaded: ${isContentLoaded}`);
        console.log(`[Player] (Audio Flavour) handleOnLoad ENTRY - isChangingSource: ${isChangingSource.current}`);
        console.log(`[Player] (Audio Flavour) handleOnLoad ENTRY - duration: ${e.duration}, currentTime: ${e.currentTime}`);
        console.log(`[Player] (Audio Flavour) handleOnLoad ENTRY - isDVR: ${sourceRef.current?.isDVR}, dvrWindowSeconds: ${sourceRef.current?.dvrWindowSeconds}`);

        // Solo procesar onLoad para contenido principal, no para tudum
        if (currentSourceType.current === 'content' && !isContentLoaded) {
            console.log(`[Player] (Audio Flavour) handleOnLoad - ✅ CONDITIONS MET - Processing content load`);

            // Para VOD, establecer la duración desde el evento onLoad
            if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR && e.duration) {
                console.log(`[Player] (Audio Flavour) handleOnLoad - Setting VOD duration from load event: ${e.duration}s`);
                vodProgressManagerRef.current?.updatePlayerData({
                    currentTime: e.currentTime || 0,
                    seekableRange: { start: 0, end: e.duration },
                    duration: e.duration,
                    isBuffering: false,
                    isPaused: paused
                });
            }

            console.log(`[Player] (Audio Flavour) handleOnLoad - 🔄 Setting isChangingSource to false and isContentLoaded to true`);
            isChangingSource.current = false;
            setIsContentLoaded(true);
            console.log(`[Player] (Audio Flavour) handleOnLoad - ✅ setIsContentLoaded(true) called`);

            if (props.events?.onStart) {
                console.log(`[Player] (Audio Flavour) handleOnLoad - 🎬 Calling onStart event`);
                props.events.onStart();
            }

            // Seek inicial al cargar un live con DVR
            if (sourceRef.current?.isDVR && dvrProgressManagerRef.current) {
                console.log(`[Player] (Audio Flavour) handleOnLoad - 🎯 Checking initial seek for DVR`);
                dvrProgressManagerRef.current.checkInitialSeek('player');
            }

        } else if (currentSourceType.current === 'tudum') {
            console.log(`[Player] (Audio Flavour) handleOnLoad - 🎵 Tudum loaded, duration: ${e.duration}`);
        } else {
            console.log(`[Player] (Audio Flavour) handleOnLoad - ❌ CONDITIONS NOT MET - Ignoring load event`);
            console.log(`[Player] (Audio Flavour) handleOnLoad - ❌ Reason: sourceType: ${currentSourceType.current}, isContentLoaded: ${isContentLoaded}`);
        }
        
        console.log(`[Player] (Audio Flavour) handleOnLoad EXIT - Final isContentLoaded will be: ${!isContentLoaded ? 'true (if conditions met)' : 'unchanged (already true)'}`);
    }

    const handleOnBuffer = (e: OnBufferData) => {
        setBuffering(!!e?.isBuffering);
    }

    const handleOnReadyForDisplay = () => {
        setBuffering(false);
    }

    const handleOnProgress = (e: OnProgressData) => {
        
        console.log(`[Player] (Audio Flavour) handleOnProgress - currentSourceType: ${currentSourceType.current}, currentTime: ${e.currentTime}, seekableDuration: ${e.seekableDuration}`);

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
                    duration: e.seekableDuration,
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
            console.log(`[Player] (Audio Flavour) handleOnProgress: Ignoring progress for ${currentSourceType.current} - currentTime: ${e.currentTime}, duration: ${e.seekableDuration}`);
        }

    }

    const handleOnEnd = () => {
        console.log(`[Player] (Audio Flavour) handleOnEnd ENTRY: currentSourceType ${currentSourceType.current}, isAutoNext: ${props.isAutoNext}`);
        console.log(`[Player] (Audio Flavour) handleOnEnd ENTRY: isLive: ${sourceRef.current?.isLive}, isDVR: ${sourceRef.current?.isDVR}`);
        console.log(`[Player] (Audio Flavour) handleOnEnd ENTRY: ⚠️ WARNING - onEnd called for live content, this might be unexpected`);
        
        if (currentSourceType.current === 'tudum') {
            // Acaba la reproducción del Tudum externo
            console.log(`[Player] (Audio Flavour) handleOnEnd: Tudum finished, switching to main content`);
            isChangingSource.current = true;
            switchFromTudumToContent();

        } else if (currentSourceType.current === 'content' && props.events?.onEnd) {
            // Termina el contenido principal
            console.log(`[Player] (Audio Flavour) handleOnEnd: Content finished, preparing for possible auto next`);
            
            // Preparar tudum para salto automático antes de notificar
            if (tudumRef.current) {
                tudumRef.current.prepareForAutoNext();
            }
            
            props.events.onEnd();
        } else {
            console.log(`[Player] (Audio Flavour) handleOnEnd: Unknown state - currentSourceType: ${currentSourceType.current}, hasOnEnd: ${!!props.events?.onEnd}`);
        }
    }

    const handleOnError = (e: OnVideoErrorData) => {
        console.log(`[Player] (Audio Flavour) handleOnError: ${JSON.stringify(e)} - currentSourceType: ${currentSourceType.current}`);
    }

    /*
     *  Render
     *
     */

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
            onPress: handleOnControlsPress,
            onSlidingStart: handleOnSlidingStart,
            onSlidingComplete: handleOnSlidingComplete
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

                        // Eventos combinados: originales + analytics
                        onLoadStart={videoEvents.onLoadStart}
                        onLoad={combineEventHandlers(handleOnLoad, videoEvents.onLoad)}
                        onProgress={combineEventHandlers(handleOnProgress, videoEvents.onProgress)}
                        onEnd={combineEventHandlers(handleOnEnd, videoEvents.onEnd)}
                        onError={combineEventHandlers(handleOnError, videoEvents.onError)}
                        onReadyForDisplay={combineEventHandlers(handleOnReadyForDisplay, videoEvents.onReadyForDisplay)}
                        onReceiveAdEvent={videoEvents.onReceiveAdEvent}
                        onBuffer={combineEventHandlers(handleOnBuffer, videoEvents.onBuffer)}
                        onSeek={videoEvents.onSeek}
                        onPlaybackStateChanged={videoEvents.onPlaybackStateChanged}
                        onPlaybackRateChange={videoEvents.onPlaybackRateChange}
                        onVolumeChange={videoEvents.onVolumeChange}
                        onAudioTracks={videoEvents.onAudioTracks}
                        onTextTracks={videoEvents.onTextTracks}
                        onVideoTracks={videoEvents.onVideoTracks}
                        onBandwidthUpdate={videoEvents.onBandwidthUpdate}
                        onAspectRatio={videoEvents.onAspectRatio}
                        onTimedMetadata={videoEvents.onTimedMetadata}
                        onAudioBecomingNoisy={videoEvents.onAudioBecomingNoisy}
                        onIdle={videoEvents.onIdle}
                        onExternalPlaybackChange={videoEvents.onExternalPlaybackChange}
                        onFullscreenPlayerWillPresent={videoEvents.onFullscreenPlayerWillPresent}
                        onFullscreenPlayerDidPresent={videoEvents.onFullscreenPlayerDidPresent}
                        onFullscreenPlayerWillDismiss={videoEvents.onFullscreenPlayerWillDismiss}
                        onFullscreenPlayerDidDismiss={videoEvents.onFullscreenPlayerDidDismiss}
                    />
                : null
            }

            { Controls }

        </Animated.View>
    );

};

export default AudioFlavour;