import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useAirplayConnectivity } from 'react-airplay';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    type IPlayerProgress,
    type OnBufferData,
    //type OnVideoErrorData,
    type OnLoadData,
    type OnProgressData,
    type OnReceiveAdEventData,
    type ProgressUpdateData,
    type SelectedTrack,
    type SelectedVideoTrack,
    type SliderValues,
    SelectedTrackType,
    //type OnVolumeChangeData,
    SelectedVideoTrackType
} from '../../../types';
import Video, { type VideoRef } from '../../../Video';
import { Overlay } from '../../components/overlay';
const BackgroundPoster = React.lazy(() => import('../../components/poster'));

import {
    useIsLandscape
} from '../common/hooks';

import {
    useIsBuffering
} from '../../modules/buffer';

import {
    mergeMenuData,
    onAdStarted
} from '../../utils';

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
} from '../../core/progress';

import { styles } from '../styles';

import {
    type ICommonData,
    type IDrm,
    type IMappedYoubora,
    type IPlayerMenuData,
    type IVideoSource,
    type NormalFlavourProps,
    CONTROL_ACTION,
    PLAYER_MENU_DATA_TYPE,
    YOUBORA_FORMAT
} from '../../types';

export function NormalFlavour (props: NormalFlavourProps): React.ReactElement {

    const [isPlayingAd, setIsPlayingAd] = useState<boolean>(false);
    const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
    
    const insets = useSafeAreaInsets();

    const youboraForVideo = useRef<IMappedYoubora>();
    const drm = useRef<IDrm>();
    const [videoSource, setVideoSource] = useState<IVideoSource | undefined>(undefined);

    const isChangingSource = useRef<boolean>(true);

    const [currentTime, setCurrentTime] = useState<number>(props.playerProgress?.currentTime || 0);
    const [paused, setPaused] = useState<boolean>(!!props.playerProgress?.isPaused);
    const [muted, setMuted] = useState<boolean>(!!props?.playerProgress?.isMuted);
    const [buffering, setBuffering] = useState<boolean>(false);
    const [menuData, setMenuData] = useState<Array<IPlayerMenuData>>();
    const [speedRate, setSpeedRate] = useState<number>(1);
    const [selectedAudioTrack, setSelectedAudioTrack] = useState<SelectedTrack>();
    const [selectedTextTrack, setSelectedTextTrack] = useState<SelectedTrack>();
    const [selectedVideoTrack, setSelectedVideoTrack] = useState<SelectedVideoTrack>({
        type:SelectedVideoTrackType.AUTO
    });
    const [maxBitRate, setMaxBitRate] = useState<number>(0);

    const refVideoPlayer = useRef<VideoRef>(null);
    const videoQualityIndex = useRef<number>(-1);
    const sliderValues = useRef<SliderValues>();

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
        
            // Callbacks
            onModeChange: onDVRModeChange,
            onProgramChange: onDVRProgramChange,
            onProgressUpdate: onProgressUpdate,
            onSeekRequest: onSeekRequest
        });
    }

    // Hook para la orientación de la pantalla
    const isLandscapePlayer = useIsLandscape();

    // Hook para el estado de Airplay
    const isAirplayConnected = useAirplayConnectivity();

    // Hook para el estado de buffering
    const isBuffering = useIsBuffering({
        buffering: buffering,
        paused: paused,
        onBufferingChange: props.events?.onBuffering
    });

    useEffect(() => {
        console.log(`[Player] (Video Flavour) useEffect videoSource ${JSON.stringify(videoSource)}`);

    }, [videoSource?.uri]);

    useEffect(() => {
        console.log(`[Player] (Video Flavour) useEffect manifests - isAutoNext: ${props.isAutoNext}`);
        console.log(`[Player] (Video Flavour) useEffect manifests - tudumRef.current ${tudumRef.current} - isReady ${tudumRef.current?.isReady}`);
        console.log(`[Player] (Video Flavour) useEffect manifests - sourceRef.current ${sourceRef.current} - isReady ${sourceRef.current?.isReady}`);

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
            console.log(`[Player] (Video Flavour) shouldPlayTudum: ${shouldPlayTudum}`);

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
                console.log(`[Player] (Video Flavour) Will play tudum first, then content`);
                currentSourceType.current = 'tudum';
                loadTudumSource();
            } else {
                console.log(`[Player] (Video Flavour) Skipping tudum - loading content directly`);
                currentSourceType.current = 'content';
                loadContentSource();
            }
        }

    }, [props.manifests, props.isAutoNext]);

    // Función para cargar source del tudum
    const loadTudumSource = () => {
        console.log(`[Player] (Video Flavour) loadTudumSource`);
        
        if (tudumRef.current?.source) {
            currentSourceType.current = 'tudum';
            tudumRef.current.isPlaying = true;
            drm.current = tudumRef.current?.drm;
            
            console.log(`[Player] (Video Flavour) Setting tudum source:`, tudumRef.current.source);
            setVideoSource(tudumRef.current.source);
        }
    };

    // Función para cargar source del contenido
    const loadContentSource = () => {
        console.log(`[Player] (Video Flavour) loadContentSource`);
        
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
                    console.log(`[Player] (Video Flavour) Forcing content load - sourceRef is ready`);
                    setPlayerSource();
                }
            }, 100);
        }
    };

    // Función para cambiar de tudum a contenido
    const switchFromTudumToContent = () => {
        console.log(`[Player] (Video Flavour) switchFromTudumToContent`);
        
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
            console.log(`[Player] (Video Flavour) switchFromTudumToContent - pendingContentSource.current ${JSON.stringify(pendingContentSource.current)}`)

            // Si hay un source de contenido pendiente, usarlo directamente
            if (pendingContentSource.current && pendingContentSource.current.isReady) {
                console.log(`[Player] (Video Flavour) Loading pending content source directly`);
                currentSourceType.current = 'content';
                setPlayerSource(pendingContentSource.current);
                pendingContentSource.current = null;
            } else {
                // Cargar el contenido principal
                console.log(`[Player] (Video Flavour) Loading main content source`);
                currentSourceType.current = 'content';
                loadContentSource();
            }
        }, 100);
    };

    useEffect(() => {
        // Montamos el selector de pista de Audio
        if (typeof(props.audioIndex) === 'number' && props.audioIndex > -1){
            setSelectedAudioTrack({
                value:props.audioIndex,
                type:SelectedTrackType.INDEX
            });

        }

    }, [props.audioIndex]);

    useEffect(() => {
        // Montamos el selector de pista de Subtítulo
        if (typeof(props.audioIndex) === 'number' && props.audioIndex > -1){
            setSelectedTextTrack({
                value:props.subtitleIndex,
                type:SelectedTrackType.INDEX
            });

        } else if (typeof(props.audioIndex) === 'number' && props.audioIndex === -1){
            setSelectedTextTrack({
                //value:props.subtitleIndex,
                type:SelectedTrackType.DISABLED
            });

        }


    }, [props.subtitleIndex]);

    useEffect(() => {

        if (menuData && props.events?.onChangeCommonData){
            // Al cargar la lista de audios y subtítulos, mandamos las labels iniciales
            // Lo necesitamos para pintar el idioma por encima del player con componentes externos

            let data:ICommonData = {},
                audioDefaultIndex = 0,
                textDefaultIndex = -1;

            if (typeof(selectedAudioTrack?.value) === 'number'){
                audioDefaultIndex = selectedAudioTrack?.value;
            }

            if (typeof(selectedTextTrack?.value) === 'number'){
                textDefaultIndex = selectedTextTrack?.value;
            }

            data.audioIndex = audioDefaultIndex;
            data.audioLabel = menuData?.find((item: IPlayerMenuData) => item.type === PLAYER_MENU_DATA_TYPE.AUDIO && item.index === audioDefaultIndex)?.label;

            data.subtitleIndex = textDefaultIndex;
            data.subtitleLabel = menuData?.find((item: IPlayerMenuData) => item.type === PLAYER_MENU_DATA_TYPE.TEXT && item.index === textDefaultIndex)?.label;
        
            if (data){
                props.events?.onChangeCommonData(data);
            }

        }

    }, [menuData]);

    // Source Cooking
    const onSourceChanged = (data:onSourceChangedProps) => {
        console.log(`[Player] (Video Flavour) onSourceChanged - currentSourceType: ${currentSourceType.current}`);
        console.log(`[Player] (Video Flavour) onSourceChanged - tudumRef.current?.isPlaying ${tudumRef.current?.isPlaying}`);
        console.log(`[Player] (Video Flavour) onSourceChanged - data isReady: ${data.isReady}`);
        console.log(`[Player] (Video Flavour) onSourceChanged - data ${JSON.stringify(data)}`);
        
        if (!sourceRef.current?.isLive && !sourceRef.current?.isDownloaded && currentSourceType.current === 'tudum') {
            // Si estamos reproduciendo tudum, guardar el source del contenido para después
            console.log(`[Player] (Video Flavour) onSourceChanged - Saving content source for later (tudum is playing)`);
            pendingContentSource.current = data;

            console.log(`[Player] (Video Flavour) onSourceChanged - pendingContentSource.current ${JSON.stringify(pendingContentSource.current)}`);
            
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
                    console.log(`[Player] (Video Flavour) onSourceChanged - error ${ex?.message}`);
                }
            }
            
        } else if (currentSourceType.current === 'content') {
            // Si ya estamos en modo contenido, procesar normalmente
            console.log(`[Player] (Video Flavour) onSourceChanged - Processing content source normally`);

            // Si el stream es DVR, debemos actualizar el tamaño de la ventana
            if (data.isDVR && dvrProgressManagerRef.current) {
                dvrProgressManagerRef.current.setDVRWindowSeconds(data.dvrWindowSeconds || 3600);
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
                console.log(`[Player] (Video Flavour) onSourceChanged - error ${ex?.message}`);
            }
            
            setPlayerSource(data);
            
        } else {
            // Estado inicial o indefinido
            console.log(`[Player] (Video Flavour) onSourceChanged - Initial state, processing source`);
            
            // Si no tenemos tipo definido, debe ser contenido
            if (!currentSourceType.current) {
                currentSourceType.current = 'content';
                console.log(`[Player] (Video Flavour) onSourceChanged - Setting currentSourceType to content`);
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
                console.log(`[Player] (Video Flavour) onSourceChanged - error ${ex?.message}`);
            }
            
            setPlayerSource(data);
        }

        // Reset DVR si es necesario
        if (sourceRef.current?.isLive && sourceRef.current?.isDVR) {
            dvrProgressManagerRef.current?.reset();
        }
    };
    
    const setPlayerSource = (data?:onSourceChangedProps) => {
        console.log(`[Player] (Video Flavour) setPlayerSource (data isReady ${!!data?.isReady})`);
        console.log(`[Player] (Video Flavour) setPlayerSource (sourceRef isReady ${!!sourceRef.current?.isReady})`);
        console.log(`[Player] (Video Flavour) setPlayerSource (currentSourceType ${currentSourceType.current})`);
        console.log(`[Player] (Video Flavour) setPlayerSource (data ${JSON.stringify(data)})`);

        if (data && data?.isReady) {
            console.log(`[Player] (Video Flavour) setPlayerSource - Using provided data`);
            setBuffering(true);
            drm.current = data.drm;

            // Preparamos los datos de Youbora
            if (props.hooks?.getYouboraOptions) {
                youboraForVideo.current = props.hooks.getYouboraOptions(props.playerAnalytics?.youbora!, YOUBORA_FORMAT.MOBILE);
            }

            console.log(`[Player] (Video Flavour) setPlayerSource - Setting content source:`, data.source);
            setVideoSource(data.source!);
        } else if (sourceRef.current?.isReady) {
            console.log(`[Player] (Video Flavour) setPlayerSource - Using sourceRef`);
            setBuffering(true);
            drm.current = sourceRef.current.playerSourceDrm;

            // Preparamos los datos de Youbora
            if (props.hooks?.getYouboraOptions) {
                youboraForVideo.current = props.hooks.getYouboraOptions(props.playerAnalytics?.youbora!, YOUBORA_FORMAT.MOBILE);
            }

            console.log(`[Player] (Video Flavour) setPlayerSource - Setting sourceRef content:`, sourceRef.current.playerSource);
            setVideoSource(sourceRef.current.playerSource!);
        } else {
            console.log(`[Player] (Video Flavour) setPlayerSource - No valid source available`);
        }
    }

    /*
     *  DVR Progress Manager
     */

    function onDVRModeChange(data:ModeChangeData) {
        console.log(`[Player] (Video Flavour) onDVRModeChange: ${JSON.stringify(data)}`);
    };

    function onDVRProgramChange(data:ProgramChangeData) {
        console.log(`[Player] (Video Flavour) onDVRProgramChange: ${JSON.stringify(data)}`);
    };

    function onProgressUpdate(data: ProgressUpdateData) {
        // console.log(`[Player] (Video Flavour) onProgressUpdate - currentSourceType: ${currentSourceType.current}, duration: ${data.duration}`);
        
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
                console.log(`[Player] (Video Flavour) onProgressUpdate - error ${ex?.message}`);
            }

        } else {
            console.log(`[Player] (Video Flavour) onProgressUpdate - Ignoring progress update for ${currentSourceType.current}`);
        }
    };

    function onSeekRequest(playerTime:number) {
        console.log(`[Player] (Video Flavour) onSeekRequest: ${playerTime}`);
        // Seek en player real
        refVideoPlayer.current?.seek(playerTime);
    };

    // Functions
    const onControlsPress = (id: CONTROL_ACTION, value?:number | boolean) => {

        const COMMON_DATA_FIELDS = ['time', 'volume', 'mute', 'pause', 'audioIndex', 'subtitleIndex'];

        console.log(`[Player] (Video Flavour) onControlsPress: ${id} (${value})`);

        if (id === CONTROL_ACTION.PAUSE){
            setPaused(!!value);
        }
        
        if (id === CONTROL_ACTION.MUTE){
            setMuted(!!value);
        }
        
        if (id === CONTROL_ACTION.NEXT && props.events?.onNext){
            setIsContentLoaded(false);
            props.events?.onNext();
        }

        if (id === CONTROL_ACTION.PREVIOUS && props.events?.onPrevious){
            setIsContentLoaded(false);
            props.events.onPrevious();
        }
        
        if (sourceRef.current?.isHLS && id === CONTROL_ACTION.VIDEO_INDEX && typeof(value) === 'number'){
            // Cambio de calidad con HLS
            if (value === -1){
                videoQualityIndex.current = -1;
                setMaxBitRate(0);

            } else {
                videoQualityIndex.current = value;
                setMaxBitRate(value);
            }
            
        }
        
        if (!sourceRef.current?.isHLS && id === CONTROL_ACTION.VIDEO_INDEX && typeof(value) === 'number'){
            // Cambio de calidad sin HLS
            if (value === -1){
                videoQualityIndex.current = -1;
                setSelectedVideoTrack({
                    type:SelectedVideoTrackType.AUTO
                });

            } else {
                videoQualityIndex.current = value;
                setSelectedVideoTrack({
                    type:SelectedVideoTrackType.INDEX,
                    value:value
                });

            }

        }
        
        if (id === CONTROL_ACTION.SPEED_RATE && typeof(value) === 'number'){
            setSpeedRate(value);
        }

        /*
        if (id === CONTROL_ACTION.LIVE_START_PROGRAM && sourceRef.current?.isDVR){
            
            const timestamp = props.events?.onLiveStartProgram?.();
            
            if (typeof(timestamp) === 'number'){
                isChangingSource.current = true;
                liveStartProgramTimestamp.current = timestamp;
                setIsContentLoaded(false);
                setDvrTimeValue(0);
                setHasSeekOverDRV(false);
                setPlayerSource();
            }
            
        }
        */

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

        // Actions to be saved between flavours
        if (COMMON_DATA_FIELDS.includes(id) && props?.events?.onChangeCommonData){
            let data:ICommonData = {};

            if (id === CONTROL_ACTION.MUTE){
                data.muted = !!value;

            } else if (id === CONTROL_ACTION.PAUSE){
                data.paused = !!value;
                
            } else if (typeof(value) === 'number'){
                data.volume = (id === CONTROL_ACTION.VOLUME) ? value : undefined;
                data.audioIndex = (id === CONTROL_ACTION.AUDIO_INDEX) ? value : undefined;
                data.subtitleIndex = (id === CONTROL_ACTION.SUBTITLE_INDEX) ? value : undefined;
                data.audioLabel = menuData?.find((item: IPlayerMenuData) => item.type === PLAYER_MENU_DATA_TYPE.AUDIO && item.index === value)?.label;
                data.subtitleLabel = menuData?.find((item: IPlayerMenuData) => item.type === PLAYER_MENU_DATA_TYPE.TEXT && item.index === value)?.label;
                
            }
            
            props.events?.onChangeCommonData(data);

        }

    }

    const onLoad = async (e: OnLoadData) => {

        console.log(`[Player] (Video Flavour) onLoad (${sourceRef.current?.playerSource?.uri})`);
        console.log(`[Player] (Video Flavour) onLoad currentSourceType: ${currentSourceType.current}`);
        console.log(`[Player] (Video Flavour) onLoad tudumRef.current?.isPlaying ${tudumRef.current?.isPlaying}`);
        console.log(`[Player] (Video Flavour) onLoad isContentLoaded ${isContentLoaded}`);
        console.log(`[Player] (Video Flavour) onLoad duration: ${e.duration}, currentTime: ${e.currentTime}`);

        // Solo procesar onLoad para contenido principal, no para tudum
        if (currentSourceType.current === 'content' && !isContentLoaded) {
            console.log(`[Player] (Video Flavour) onLoad - Processing content load`);

            // Para VOD, establecer la duración desde el evento onLoad
            if (!sourceRef.current?.isLive && !sourceRef.current?.isDVR && e.duration) {
                console.log(`[Player] (Video Flavour) onLoad - Setting VOD duration from load event: ${e.duration}s`);
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
                dvrProgressManagerRef.current?.setDVRWindowSeconds(sourceRef.current.dvrWindowSeconds);
            }

            isChangingSource.current = false;
            setIsContentLoaded(true);

            if (props.hooks?.mergeMenuData && typeof(props.hooks.mergeMenuData) === 'function'){
                setMenuData(props.hooks.mergeMenuData(e, props.languagesMapping, sourceRef.current?.isDASH));

            } else {
                setMenuData(mergeMenuData(e, props.languagesMapping, sourceRef.current?.isDASH));

            }

            if (props.events?.onStart) {
                props.events.onStart();
            }

            // Seek inicial al cargar un live con DVR
            if (sourceRef.current?.isDVR && dvrProgressManagerRef.current) {
                dvrProgressManagerRef.current.checkInitialSeek('player');
            }

        } else if (currentSourceType.current === 'tudum') {
            console.log(`[Player] (Video Flavour) onLoad - Tudum loaded, duration: ${e.duration}`);
        } else {
            console.log(`[Player] (Video Flavour) onLoad - Ignoring load event (sourceType: ${currentSourceType.current}, isContentLoaded: ${isContentLoaded})`);
        }

    }

    const onEnd = () => {
        console.log(`[Player] (Video Flavour) onEnd: currentSourceType ${currentSourceType.current}, isAutoNext: ${props.isAutoNext}`);
        
        if (currentSourceType.current === 'tudum') {
            // Acaba la reproducción del Tudum externo
            console.log(`[Player] (Video Flavour) onEnd: Tudum finished, switching to main content`);
            isChangingSource.current = true;
            switchFromTudumToContent();

        } else if (currentSourceType.current === 'content' && props.events?.onEnd) {
            // Termina el contenido principal
            console.log(`[Player] (Video Flavour) onEnd: Content finished, preparing for possible auto next`);
            
            // Preparar tudum para salto automático antes de notificar
            if (tudumRef.current) {
                tudumRef.current.prepareForAutoNext();
            }
            
            props.events.onEnd();
        } else {
            console.log(`[Player] (Video Flavour) onEnd: Unknown state - currentSourceType: ${currentSourceType.current}, hasOnEnd: ${!!props.events?.onEnd}`);
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
            console.log(`[Player] (Video Flavour) onProgress: Ignoring progress for ${currentSourceType.current} - currentTime: ${e.currentTime}, duration: ${e.playableDuration}`);
        }

    }

    const onReadyForDisplay = () => {
        setBuffering(false);
    }

    const onReceiveAdEvent = (e: OnReceiveAdEventData) => {

        if (e.event === 'STARTED'){
            setIsPlayingAd(true);
            onAdStarted(e);

        } else if (e.event === 'COMPLETED' || e.event === 'ALL_ADS_COMPLETED' || e.event === 'SKIPPED' || e.event === 'USER_CLOSE'){
            setIsPlayingAd(false);

        } else if (e.event === 'ERROR'){

        }

    }

    // const onVolumeChange = (e: OnVolumeChangeData) => {

    // }

    const onBuffer = (e: OnBufferData) => {
        setBuffering(!!e?.isBuffering);
    }

    const onError = (e: any) => {
        console.log(`[Player] (Video Flavour) onError: ${JSON.stringify(e)} - currentSourceType: ${currentSourceType.current}`);
    }

    const onSlidingComplete = (value: number) => {
        // console.log(`[Player] (Video Flavour) onSlidingComplete: ${value}`);
        onControlsPress(CONTROL_ACTION.SEEK, value);
    }

    return (
        <View style={styles.container}>
            {
                videoSource ?
                    <View style={{
                        ...styles.playerWrapper,
                        paddingHorizontal:Math.max(insets.left, insets.right),
                    }}>
                        <Video
                            // @ts-ignore
                            ref={refVideoPlayer}
                            style={[
                                styles.player,
                                (isLandscapePlayer) ? { height:'100%' } : { width:'100%' }
                            ]}
                            // @ts-ignore
                            source={videoSource}
                            // @ts-ignore
                            drm={drm.current}
                            // @ts-ignore
                            youbora={youboraForVideo.current}
                            playOffline={props.playOffline}
                            multiSession={props.playerProgress?.liveValues?.multiSession}

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

                            adTagUrl={props?.playerAds?.adTagUrl}
                            allowsExternalPlayback={true}
                            //volume={10}
                            controls={false}
                            ignoreSilentSwitch='ignore'
                            showNotificationControls={true}
                            resizeMode='cover'
                            posterResizeMode='cover'
                            minLoadRetryCount={3}
                            hideShutterView={true}
                            muted={muted}
                            paused={paused}
                            rate={speedRate}
                            maxBitRate={maxBitRate}
                            //pictureInPicture (ios)
                            playInBackground={isAirplayConnected}
                            playWhenInactive={isAirplayConnected}
                            poster={props?.playerMetadata?.poster}
                            preventsDisplaySleepDuringVideoPlayback={!isAirplayConnected}
                            progressUpdateInterval={1000}
                            selectedVideoTrack={tudumRef.current?.isPlaying ? undefined : selectedVideoTrack}
                            selectedAudioTrack={tudumRef.current?.isPlaying ? undefined : selectedAudioTrack}
                            selectedTextTrack={tudumRef.current?.isPlaying || (typeof(selectedTextTrack?.value) === 'number' && selectedTextTrack?.value < 0) ? undefined : selectedTextTrack}
                            subtitleStyle={props.subtitleStyle}

                            //onVolumeChange={onVolumeChange}
                            onEnd={onEnd}
                            onLoad={onLoad}
                            onProgress={onProgress}
                            onReadyForDisplay={onReadyForDisplay}
                            onReceiveAdEvent={onReceiveAdEvent}
                            onBuffer={onBuffer}
                            onError={onError}
                        />
                    </View>
                : null
            }

            {
                isAirplayConnected ?
                    <Suspense fallback={props.components?.loader}>
                        <BackgroundPoster poster={props.playerMetadata?.poster} />
                    </Suspense>
                : null
            }

            {
                !isPlayingAd && !tudumRef.current?.isPlaying ?
                    <Overlay
                        preloading={isBuffering}
                        thumbnailsMetadata={sourceRef.current?.currentManifest?.thumbnailMetadata}
                        timeMarkers={props.timeMarkers}
                        avoidTimelineThumbnails={props.avoidTimelineThumbnails}
                        
                        alwaysVisible={isAirplayConnected}
                        isChangingSource={isChangingSource.current}
                        
                        isContentLoaded={isContentLoaded}
                        
                        menuData={menuData}
                        videoIndex={videoQualityIndex.current}
                        audioIndex={props.audioIndex}
                        subtitleIndex={props.subtitleIndex}
                        speedRate={speedRate}

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
                : null
            }

        </View>
    );

};

export default NormalFlavour;
