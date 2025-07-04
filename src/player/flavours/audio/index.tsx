import React, { useEffect, useState, useRef, createElement, useCallback } from 'react';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { EventRegister } from 'react-native-event-listeners';
import BackgroundTimer from 'react-native-background-timer';
import { 
    type IPlayerProgress,
    type OnProgressData,
    type OnBufferData,
    //type OnVideoErrorData,
    type OnLoadData,
    //type OnVolumeChangeData,
    type SliderValues,
    type AudioControlsProps,
    type ProgressUpdateData,
} from '../../../types';
import { type VideoRef } from '../../../Video';
import Video from '../../../Video';

import {
    useIsBuffering
} from '../../modules/buffer';

import { 
    getMinutesSinceStart,
    subtractMinutesFromDate,
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
} from '../../modules/dvr';

import {
    invokePlayerAction
} from '../actions/player';

import { styles } from '../styles';

import { 
    type AudioFlavourProps,
    type IMappedYoubora, 
    type IDrm,
    type IVideoSource,
    type ICommonData,
    type AudioPlayerActionEventProps,
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

    const sliderValues = useRef<SliderValues>();

    const [speedRate, setSpeedRate] = useState<number>(1);

    const refVideoPlayer = useRef<VideoRef>(null);
    const sleepTimerObj = useRef<NodeJS.Timeout | null>(null);

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
        // console.log(`[Player] (Audio Flavour) useEffect manifests ${JSON.stringify(props.manifests)}`);
        // console.log(`[Player] (Audio Flavour) useEffect manifests - tudumRef.current ${tudumRef.current} - isReady ${tudumRef.current?.isReady}`);
        // console.log(`[Player] (Audio Flavour) useEffect manifests - sourceRef.current ${sourceRef.current} - isReady ${sourceRef.current?.isReady}`);

        if (!tudumRef.current){
            tudumRef.current = new TudumClass({
                enabled:!!props.showExternalTudum,
                getTudumSource:props.hooks?.getTudumSource
            });
        }

        if (!sourceRef.current){
            sourceRef.current = new SourceClass({
                // Metadata
                id: props.playerMetadata?.id,
                title: props.playerMetadata?.title,
                subtitle: props.playerMetadata?.subtitle,
                description: props.playerMetadata?.description,
                poster: props.playerMetadata?.poster,
                squaredPoster: props.playerMetadata?.squaredPoster,
        
                // Main Source
                manifests: props.manifests,
                startPosition: props.playerProgress?.currentTime || 0,
                headers: props.headers,
        
                // Callbacks
                getSourceUri: props.hooks?.getSourceUri,
                onSourceChanged: onSourceChanged
            });
        }

        if (tudumRef.current?.isReady){
            // Montamos el Source para el player
            tudumRef.current.isPlaying = true;
            drm.current = tudumRef.current?.drm;
            setVideoSource(tudumRef.current?.source);

        } else {
            isChangingSource.current = true;
            
            sourceRef.current.changeSource({
                manifests: props.manifests,
                startPosition: props.playerProgress?.currentTime || 0,
                isLive: !!props.playerProgress?.isLive,
                headers: props.headers,
                title: props.playerMetadata?.title,
                subtitle: props.playerMetadata?.subtitle,
                description: props.playerMetadata?.description,
                poster: props.playerMetadata?.poster,
                squaredPoster: props.playerMetadata?.squaredPoster,
            });

        }

    }, [props.manifests]);

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
                duration: sliderValues.current?.duration || 0,
                isPaused: paused,
                isMuted: muted,
                isLive: sourceRef.current?.isLive,
                isDVR: sourceRef.current?.isDVR,
                isBinary: sourceRef.current?.isBinary,
                isChangingSource: isChangingSource.current,
                sliderValues: sliderValues.current,
            },
            playerAnalytics: props.playerAnalytics,
            playerTimeMarkers: props.playerTimeMarkers,
            //Events
            events: props.events,
        } as AudioControlsProps);

    }, [currentTime, props.playerMetadata, paused, muted, isBuffering, sourceRef.current?.isDVR, isContentLoaded, speedRate, sliderValuesUpdate]);

    // Source Cooking
    const onSourceChanged = (data:onSourceChangedProps) => {
        console.log(`[Player] (Audio Flavour) onSourceChanged - tudumRef.current ${tudumRef.current} - isReady ${tudumRef.current?.isReady}`);
        if (!tudumRef.current?.isPlaying){

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

        } else if (sourceRef.current?.isLive && sourceRef.current?.isDVR){
            dvrProgressManagerRef.current?.reset();

        }
        
    };

    const setPlayerSource = (data?:onSourceChangedProps) => {
        console.log(`[Player] (Audio Flavour) setPlayerSource (data isReady ${!!data?.isReady})`);
        console.log(`[Player] (Audio Flavour) setPlayerSource (sourceRef isReady ${!!sourceRef.current?.isReady})`);
        console.log(`[Player] (Audio Flavour) setPlayerSource (tudumRef isPlaying ${tudumRef.current?.isPlaying})`);

        if (data && data?.isReady){
            setBuffering(true);
            drm.current = data.drm;

            // Preparamos los datos de Youbora
            if (props.hooks?.getYouboraOptions){
                youboraForVideo.current = props.hooks.getYouboraOptions(props.playerAnalytics?.youbora!, YOUBORA_FORMAT.MOBILE);
            }

            setVideoSource(data.source!);
        }

        if (!data && sourceRef.current?.isReady){
            setBuffering(true);
            drm.current = sourceRef.current.playerSourceDrm;

            // Preparamos los datos de Youbora
            if (props.hooks?.getYouboraOptions){
                youboraForVideo.current = props.hooks.getYouboraOptions(props.playerAnalytics?.youbora!, YOUBORA_FORMAT.MOBILE);
            }

            setVideoSource(sourceRef.current.playerSource!);
        }

        /*

        // Preparamos la ventada de tiempo del directo (DVR) si estamos ante un Live
        if (props?.isLive && (typeof(currentManifest.current?.dvr_window_minutes) === 'number' && currentManifest.current?.dvr_window_minutes > 0) || props.forcedDvrWindowMinutes){
            isDVR.current = true;
            dvrWindowSeconds.current = props.forcedDvrWindowMinutes ? props.forcedDvrWindowMinutes * 60 : currentManifest.current?.dvr_window_minutes * 60;
            setDvrTimeValue(dvrWindowSeconds.current);
        }

        // Preparamos la URI del contenido
        if (isDownloaded.current && isBinary.current){
            const offlineBinary = getContentById(props.id!);
            console.log(`[Player] (Audio Flavour) isDownloaded && isBinary`);

            uri = `file://${offlineBinary?.offlineData.fileUri}`;

        } else {
            
            const dvrWindowMinutes = dvrWindowSeconds?.current ? dvrWindowSeconds.current / 60 : undefined;
            if (props.getSourceUri){
                uri = props.getSourceUri(currentManifest.current!,  dvrWindowMinutes);
            } else {
                uri = getVideoSourceUri(currentManifest.current!,  dvrWindowMinutes);
            }

        }

        // Recalculamos la ventana de tiempo para el slider en DVR
        if ((typeof(currentManifest.current?.dvr_window_minutes) === 'number' && currentManifest.current?.dvr_window_minutes > 0) || props.forcedDvrWindowMinutes){
            const dvrRecalculatedMinutes = getMinutesSinceStart(uri);

            if (dvrRecalculatedMinutes){
                dvrWindowSeconds.current = dvrRecalculatedMinutes * 60;
                setDvrTimeValue(dvrWindowSeconds.current);
            }
        }
        */

    }

    /*
     *  DVR Progress Manager
     */

    function onDVRModeChange(data:ModeChangeData) {
        console.log(`[Player] (Audio Flavour) onDVRModeChange: ${JSON.stringify(data)}`);
    };

    function onDVRProgramChange(data:ProgramChangeData) {
        console.log(`[Player] (Audio Flavour) onDVRProgramChange: ${JSON.stringify(data)}`);
    };

    function onProgressUpdate(data:ProgressUpdateData) {
        // console.log(`[Player] (Audio Flavour) onProgressUpdate: ${JSON.stringify(data)}`);
        sliderValues.current = {
            minimumValue: data.minimumValue,
            maximumValue: data.maximumValue,
            progress: data.progress,
            percentProgress: data.percentProgress,
            duration: data.duration,
            canSeekToEnd: data.canSeekToEnd,
            liveEdge: data.liveEdge,
            isProgramLive: data.isProgramLive,
            progressDatum: data.progressDatum,
            liveEdgeOffset: data.liveEdgeOffset,
            isLiveEdgePosition: data.isLiveEdgePosition,
        };
        
        if (paused || isBuffering){
            // Trigger re-render del useEffect para emitir eventos con nuevos sliderValues en caso de no disponer de onProgress
            setSliderValuesUpdate((prev: number) => prev + 1);
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

        /*
        if (props.onDVRChange){
            props.onDVRChange(value, secondsToLive, date);
        }
        */
    };

    function onSeekRequest(playerTime:number) {
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
    const onControlsPress = useCallback((id: CONTROL_ACTION, value?:number | boolean) => {

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
            let data:ICommonData = {};

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

        console.log(`[Player] (Audio Flavour) onLoad (${sourceRef.current?.playerSource?.uri}) ${JSON.stringify(e)}`);
        console.log(`[Player] (Audio Flavour) onLoad tudumRef.current?.isPlaying ${tudumRef.current?.isPlaying}`);
        console.log(`[Player] (Audio Flavour) onLoad isContentLoaded ${isContentLoaded}`);

        if (!tudumRef.current?.isPlaying && !isContentLoaded){

            if (sourceRef.current?.isDVR){
                dvrProgressManagerRef.current?.setInitialTimeWindowSeconds(sourceRef.current.dvrWindowSeconds);
            }

            isChangingSource.current = false;
            setIsContentLoaded(true);
            
            // if (needsLiveInitialSeek.current){
            //     // Al ir al inicio de un programa, debemos hacer seek para no ir al edge live
            //     invokePlayerAction(refVideoPlayer, CONTROL_ACTION.SEEK, 0, currentTime);
            // }

            if (props.events?.onStart){
                props.events.onStart();
            }

        }

    }

    const onEnd = () => {
        console.log(`[Player] (Audio Flavour) onEnd: tudum isPlaying ${tudumRef.current?.isPlaying}`);
        if (tudumRef.current?.isPlaying){
            // Acaba la reproducción del Tudum externo
            isChangingSource.current = true;
            tudumRef.current.isPlaying = false;
            setPlayerSource();

        } else if (props.events?.onEnd){
            // Termina el contenido
            props.events.onEnd();
            
        }

    }

    const onProgress = (e: OnProgressData) => {

        console.log(`[DANI] onProgress ${JSON.stringify(e)}`);
        // console.log(`[DANI] onProgress - vodProgressManagerRef ${vodProgressManagerRef.current}`);
        // console.log(`[DANI] onProgress - dvrProgressManagerRef ${dvrProgressManagerRef.current}`);

        if (typeof(e.currentTime) === 'number' && currentTime !== e.currentTime){
            // Triger para el cambio de estado
            setCurrentTime(e.currentTime);
        }

        if (!sourceRef.current?.isLive){
            vodProgressManagerRef.current?.updatePlayerData({
                currentTime: e.currentTime,
                seekableRange: { start: 0, end: e.playableDuration },
                duration: e.playableDuration,
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
            props.events.onChangeCommonData({
                time: e.currentTime,
                duration: e.playableDuration,
            });
        }

    }

    const onReadyForDisplay = () => {
        setBuffering(false);
    }

    // const onVolumeChange = (e: OnVolumeChangeData) => {

    // }

    const onBuffer = (e: OnBufferData) => {
        setBuffering(!!e?.isBuffering);
    }

    // const onError = (e: OnVideoErrorData) => {

    // }

    const onSlidingStart = (value: number) => {

    }

    const onSlidingMove = (value: number) => {

    }

    const onSlidingComplete = (value: number) => {
        console.log(`[Player] (Audio Flavour) onSlidingComplete: ${value}`);
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
            onSlidingStart: onSlidingStart,
            onSlidingMove: onSlidingMove,
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
                        //onError={onError}
                    />
                : null
            }

            { Controls }

        </Animated.View>
    );

};

export default AudioFlavour;