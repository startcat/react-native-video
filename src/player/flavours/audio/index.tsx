import React, { useEffect, useState, useRef, createElement, useCallback } from 'react';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { EventRegister } from 'react-native-event-listeners';
import BackgroundTimer from 'react-native-background-timer';
import { 
    type OnProgressData,
    type OnBufferData,
    //type OnVideoErrorData,
    type OnLoadData,
    //type OnVolumeChangeData,
} from '../../../types';
import { type VideoRef } from '../../../Video';
import Video from '../../../Video';

import { 
    getBestManifest,
    getManifestSourceType,
    getVideoSourceUri,
    getContentIdIsDownloaded,
    getContentIdIsBinary,
    getContentById,
    getDRM,
    getMinutesSinceStart,
    subtractMinutesFromDate,
    useDvrPausedSeconds
} from '../../utils';

import {
    invokePlayerAction
} from './actions';

import { styles } from '../styles';

import { 
    type AudioFlavourProps,
    type IManifest, 
    type IMappedYoubora, 
    type IDrm,
    type IVideoSource,
    type ICommonData,
    type AudioPlayerActionEventProps,
    CONTROL_ACTION,
    STREAM_FORMAT_TYPE,
    YOUBORA_FORMAT,
} from '../../types';

export function AudioFlavour (props: AudioFlavourProps): React.ReactElement {

    const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
    const audioPlayerHeight = useSharedValue(0);

    const currentManifest = useRef<IManifest>();
    const youboraForVideo = useRef<IMappedYoubora>();
    const drm = useRef<IDrm>();
    const [videoSource, setVideoSource] = useState<IVideoSource | null>();
    const isDVR = useRef<boolean>();
    const isHLS = useRef<boolean>();
    const isDownloaded = useRef<boolean>();
    const isBinary = useRef<boolean>();
    const dvrWindowSeconds = useRef<number>();

    const [currentTime, setCurrentTime] = useState<number>(props.currentTime!);
    const [duration, setDuration] = useState<number>();
    const [dvrTimeValue, setDvrTimeValue] = useState<number>();
    const [paused, setPaused] = useState<boolean>(!!props.paused);
    const [muted, setMuted] = useState<boolean>(!!props?.muted);
    const [preloading, setPreloading] = useState<boolean>(false);
    const [isPlayingExternalTudum, setIsPlayingExternalTudum] = useState<boolean>(!!props.showExternalTudum);

    const [speedRate, setSpeedRate] = useState<number>(1);

    const refVideoPlayer = useRef<VideoRef>(null);
    const sleepTimerObj = useRef<NodeJS.Timeout | null>(null);

    const dvrPaused = useDvrPausedSeconds({
        paused: paused,
        isLive: !!props?.isLive,
        isDVR: !!isDVR.current
    });

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
        console.log(`[Player] (Audio Flavour) videoSource ${JSON.stringify(videoSource)}`);

    }, [videoSource]);

    useEffect(() => {
        console.log(`[Player] (Audio Flavour) manifests ${JSON.stringify(props.manifests)}`);
        if (isPlayingExternalTudum && props.getTudumSource){
            let tudumManifest = props.getTudumSource();

            // Montamos el Source del tudum para el player
            setVideoSource(tudumManifest);
            setPreloading(false);

        } else {
            setPlayerSource();

        }

    }, [props.manifests]);

    useEffect(() => {
        EventRegister.emit('audioPlayerProgress', {
            title:props.title,
            description:props.description,
            currentTime: currentTime,
            dvrTimeValue: dvrTimeValue,
            duration: duration,
            paused: paused,
            muted: muted,
            //volume: number;
            preloading: preloading,
            hasNext: props.hasNext,
            hasPrev: props.hasPrev,
            isLive: props.isLive,
            isDVR: props.isLive && isDVR.current,
            isContentLoaded: isContentLoaded,
            speedRate: speedRate,
            extraData: props.extraData
        });

    }, [currentTime, dvrTimeValue, duration, paused, muted, preloading, isDVR.current, isContentLoaded, speedRate]);

    useEffect(() => {

        if (typeof(dvrTimeValue) === 'number' && dvrPaused?.pausedDatum > 0 && dvrPaused?.pausedSeconds > 0){
            const moveDVRto = dvrTimeValue - dvrPaused.pausedSeconds;

            setDvrTimeValue(moveDVRto > 0 ? moveDVRto : 0);
        }

    }, [dvrPaused?.pausedDatum]);

    // Source Cooking
    const setPlayerSource = async () => {

        let uri;

        // Cogemos el manifest adecuado
        currentManifest.current = getBestManifest(props?.manifests!);

        // Preparamos el DRM adecuado al manifest y plataforma
        drm.current = getDRM(currentManifest.current!);

        // Marcamos si es HLS
        isHLS.current = currentManifest.current?.type === STREAM_FORMAT_TYPE.HLS;

        // Revisamos si se trata de un Binario descargado
        isDownloaded.current = getContentIdIsDownloaded(props.id!);
        isBinary.current = getContentIdIsBinary(props.id!);

        // Preparamos los datos de Youbora
        if (props.getYouboraOptions){
            youboraForVideo.current = props.getYouboraOptions(props.youbora!, YOUBORA_FORMAT.MOBILE);

        }

        // Preparamos la ventada de tiempo del directo (DVR) si estamos ante un Live
        if (props?.isLive && typeof(currentManifest.current?.dvr_window_minutes) === 'number' && currentManifest.current?.dvr_window_minutes > 0){
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

            if (props.getSourceUri){
                uri = props.getSourceUri(currentManifest.current!, currentManifest.current?.dvr_window_minutes);

            } else {
                uri = getVideoSourceUri(currentManifest.current!, currentManifest.current?.dvr_window_minutes);

            }

        }

        // Recalculamos la ventana de tiempo para el slider en DVR
        if (typeof(currentManifest.current?.dvr_window_minutes) === 'number' && currentManifest.current?.dvr_window_minutes > 0){
            const dvrRecalculatedMinutes = getMinutesSinceStart(uri);

            if (dvrRecalculatedMinutes){
                dvrWindowSeconds.current = dvrRecalculatedMinutes * 60;
                setDvrTimeValue(dvrWindowSeconds.current);
            }
        }

        console.log(`[Player] (Audio Flavour) uri ${JSON.stringify(uri)}`);

        // Montamos el Source para el player
        setVideoSource({
            id: props.id,
            title: props.title,
            uri: uri,
            type: getManifestSourceType(currentManifest.current!),
            startPosition: (!isDVR.current && currentTime > 0) ? currentTime * 1000 : undefined,
            headers: props.headers,
            metadata: {
                title: props.title,
                subtitle: props.subtitle,
                description: props.description,
                imageUri: props.squaredPoster || props.poster
            }
        });

        setPreloading(!preloading);

    }

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
    const maybeChangeBufferingState = (buffering: boolean) => {

        const newIsBuffering = buffering && !paused;

        if (preloading !== newIsBuffering){
            setPreloading(newIsBuffering);

        }

    }

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

            if (props.onClose){
                props.onClose();

            }

        }
        
        if (id === CONTROL_ACTION.MUTE){
            setMuted(!!value);
        }
        
        if (id === CONTROL_ACTION.NEXT && props.onNext){            
            setIsContentLoaded(false);
            props.onNext();
        }

        if (id === CONTROL_ACTION.PREVIOUS && props.onPrevious){
            setIsContentLoaded(false);
            props.onPrevious();
        }
        
        if (id === CONTROL_ACTION.SPEED_RATE && typeof(value) === 'number'){
            setSpeedRate(value);
        }

        if ((id === CONTROL_ACTION.SEEK || id === CONTROL_ACTION.FORWARD || id === CONTROL_ACTION.BACKWARD) && isDVR.current && typeof(value) === 'number' && typeof(duration) === 'number'){
            // Guardamos el estado de la barra de tiempo en DVR
            if (id === CONTROL_ACTION.FORWARD && typeof(value) === 'number' && typeof(currentTime) === 'number'){
                setDvrTimeValue((currentTime + value) > duration ? duration : currentTime + value);
        
            } else if (id === CONTROL_ACTION.BACKWARD && typeof(value) === 'number' && typeof(currentTime) === 'number'){
                setDvrTimeValue((currentTime - value) < 0 ? 0 : currentTime - value);
        
            } else if (id === CONTROL_ACTION.SEEK){
                setDvrTimeValue(value);

            }
            
        }
        
        if (id === CONTROL_ACTION.SEEK || id === CONTROL_ACTION.FORWARD || id === CONTROL_ACTION.BACKWARD){
            // Actions to invoke on player
            invokePlayerAction(refVideoPlayer, id, value, currentTime, duration);
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
        if (COMMON_DATA_FIELDS.includes(id) && props?.onChangeCommonData){
            let data:ICommonData = {};

            if (id === CONTROL_ACTION.MUTE){
                data.muted = !!value;

            } else if (typeof(value) === 'number'){
                data.volume = (id === CONTROL_ACTION.VOLUME) ? value : undefined;
                
            }
            
            props.onChangeCommonData(data);

        }

    }, [currentTime]);

    const onLoad = async (e: OnLoadData) => {

        console.log(`[Player] (Audio Flavour) onLoad ${JSON.stringify(e)}`);

        if (!isPlayingExternalTudum && !isContentLoaded){

            setIsContentLoaded(true);

            if (isDVR.current){
                setDuration(dvrWindowSeconds.current);

            } else if (typeof(e.duration) === 'number' && e.duration && duration !== e.duration){
                setDuration(e.duration);

                if (!props?.isLive && props?.onChangeCommonData){
                    props.onChangeCommonData({
                        duration: e.duration
                    });
                }

            }

        }

    }

    const onEnd = () => {

        if (isPlayingExternalTudum){
            // Acaba la reproducción del Tudum externo
            setPlayerSource();
            setIsPlayingExternalTudum(false);

        } else if (props.onEnd){
            // Termina el contenido
            props.onEnd();
            
        }

    }

    const setCurrentTimeWithValidation = (value: number) => {

        if (value < 0){
            setCurrentTime(0);

        } else if (typeof(duration) === 'number' && value > duration){
            setCurrentTime(duration);

        } else if (typeof(duration) === 'number') {
            setCurrentTime(value);

        }

    }

    const onProgress = (e: OnProgressData) => {

        if (typeof(e.currentTime) === 'number' && currentTime !== e.currentTime){
            setCurrentTimeWithValidation(e.currentTime);
        }

        // Calculamos la ventana de tiempo disponible en los directos ocasionales, según avanza el tiempo
        // if (typeof(dvrWindowSeconds.current) === 'number' && dvrWindowSeconds.current > 0 && start_date){

        // }

        if (!props?.isLive && props?.onChangeCommonData){
            props.onChangeCommonData({
                time: e.currentTime
            });
        }

    }

    const onReadyForDisplay = () => {
        maybeChangeBufferingState(false);
    }

    // const onVolumeChange = (e: OnVolumeChangeData) => {

    // }

    const onBuffer = (e: OnBufferData) => {
        maybeChangeBufferingState(e?.isBuffering);
    }

    // const onError = (e: OnVideoErrorData) => {

    // }

    const onSlidingStart = (value: number) => {

    }

    const onSlidingMove = (value: number) => {

    }

    const onSlidingComplete = (value: number) => {

        let secondsToLive,
            date;

        if (dvrTimeValue){
            secondsToLive = dvrTimeValue - value;
            date = subtractMinutesFromDate(new Date(), secondsToLive / 60);

        }

        if (props.onDVRChange){
            props.onDVRChange(value, secondsToLive, date);
        }

    }

    const Controls = props.controls ? createElement(props.controls, { 
        title: props.title,
        description: props.description,
        currentTime: currentTime,
        dvrTimeValue: dvrTimeValue,
        duration: duration,
        paused: paused,
        muted: muted,
        preloading: preloading,
        hasNext: props.hasNext,
        hasPrev: props.hasPrev,
        isLive: props.isLive,
        isDVR: isDVR.current,
        isContentLoaded: isContentLoaded,
        speedRate: speedRate,
        extraData: props.extraData,
    
        //Events
        onPress: onControlsPress,
        onSlidingStart: onSlidingStart,
        onSlidingMove: onSlidingMove,
        onSlidingComplete: onSlidingComplete

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
                        multiSession={props.multiSession}

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
                        poster={props?.poster}
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
