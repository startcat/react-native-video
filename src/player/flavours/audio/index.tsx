import React, { useEffect, useState, useRef, useMemo, createElement } from 'react';
import Animated, { withSpring, withTiming, useSharedValue } from 'react-native-reanimated';
import { 
    type OnProgressData,
    type OnBufferData,
    //type OnVideoErrorData,
    type OnLoadData,
    //type OnVolumeChangeData,
} from '../../../types';
import { type VideoRef } from '../../../Video';
import Video from '../../../Video';
import { View } from 'react-native';

import { 
    getBestManifest,
    getManifestSourceType,
    getVideoSourceUri,
    getDRM,
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
    const videoSource = useRef<IVideoSource>();
    const isDVR = useRef<boolean>();
    const isHLS = useRef<boolean>();
    const dvrWindowSeconds = useRef<number>();

    const [currentTime, setCurrentTime] = useState<number>(props.currentTime!);
    const [duration, setDuration] = useState<number>();
    const [dvrTimeValue, setDvrTimeValue] = useState<number>();
    const [paused, setPaused] = useState<boolean>(false);
    const [muted, setMuted] = useState<boolean>(!!props?.muted);
    const [preloading, setPreloading] = useState<boolean>(false);

    const [speedRate, setSpeedRate] = useState<number>(1);

    const refVideoPlayer = useRef<VideoRef>(null);

    useEffect(() => {
        setPlayerSource();

    }, [props.manifests]);

    // Source Cooking
    const setPlayerSource = async () => {

        // Cogemos el manifest adecuado
        currentManifest.current = getBestManifest(props?.manifests!);

        // Preparamos el DRM adecuado al manifest y plataforma
        drm.current = getDRM(currentManifest.current!);

        // Marcamos si es HLS
        isHLS.current = currentManifest.current?.type === STREAM_FORMAT_TYPE.HLS;

        // Preparamos los datos de Youbora
        if (props.getYouboraOptions){
            youboraForVideo.current = props.getYouboraOptions(props.youbora!, YOUBORA_FORMAT.MOBILE);

        }

        // Preparamos la ventada de tiempo del directo (DVR) si estamos ante un Live
        if (typeof(currentManifest.current?.dvr_window_minutes) === 'number' && currentManifest.current?.dvr_window_minutes > 0){
            isDVR.current = true;
            dvrWindowSeconds.current = currentManifest.current?.dvr_window_minutes * 60;
            setDvrTimeValue(dvrWindowSeconds.current);
        }

        // Montamos el Source para el player
        videoSource.current = {
            id: props.id,
            title: props.title,
            uri: getVideoSourceUri(currentManifest.current!, currentManifest.current?.dvr_window_minutes),
            type: getManifestSourceType(currentManifest.current!)
        };

        setPreloading(!preloading);

    }

    // Functions
    const maybeChangeBufferingState = (buffering: boolean) => {

        const newIsBuffering = buffering && !paused;

        if (preloading !== newIsBuffering){
            setPreloading(newIsBuffering);

        }

    }

    const onControlsPress = (id: CONTROL_ACTION, value?:number | boolean) => {

        const COMMON_DATA_FIELDS = ['time', 'volume', 'mute'];

        console.log(`[Player] (Audio Flavour) onControlsPress: ${id} (${value})`);

        if (id === CONTROL_ACTION.PAUSE){
            setPaused(!!value);
        }
        
        if (id === CONTROL_ACTION.MUTE){
            setMuted(!!value);
        }
        
        if (id === CONTROL_ACTION.NEXT && props.onNext){
            setIsContentLoaded(false);
            props.onNext();
        }
        
        if (id === CONTROL_ACTION.SPEED_RATE && typeof(value) === 'number'){
            setSpeedRate(value);
        }

        if (id === CONTROL_ACTION.SEEK && isDVR.current && typeof(value) === 'number'){
            // Guardamos el estado de la barra de tiempo en DVR
            setDvrTimeValue(value);
        }
        
        if (id === CONTROL_ACTION.SEEK || id === CONTROL_ACTION.FORWARD || id === CONTROL_ACTION.BACKWARD){
            // Actions to invoke on player
            invokePlayerAction(refVideoPlayer, id, value, currentTime);
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

    }

    const onLoad = async (e: OnLoadData) => {

        console.log(`[Player] (Audio Flavour) onLoad ${JSON.stringify(e)}`);

        if (!isContentLoaded){

            if (!isContentLoaded){
                setIsContentLoaded(true);
            }

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

            // La primera vez, nos movemos al punto donde lo habíamos dejado
            if (!isDVR.current && currentTime > 0){
                onControlsPress(CONTROL_ACTION.SEEK, currentTime);
            }

        }

    }

    const onEnd = () => {
        // Termina el contenido

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

    }

    const Controls = props.controls ? createElement(props.controls, { 
        title: props.title,
        currentTime: currentTime,
        dvrTimeValue: dvrTimeValue,
        duration: duration,
        paused: paused,
        muted: muted,
        preloading: preloading,
        hasNext: props.hasNext,
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
            ...styles.container,
            height:audioPlayerHeight,
            backgroundColor: props.backgroundColor || styles.container.backgroundColor,
            borderColor: props.topDividerColor,
            borderTopWidth: props.topDividerColor ? 1 : 0
        }}>

            {
                videoSource.current ?
                    <Video
                        // @ts-ignore
                        ref={refVideoPlayer}
                        style={styles.audioPlayer}
                        // @ts-ignore
                        source={videoSource.current}
                        // @ts-ignore
                        drm={drm.current}
                        // @ts-ignore
                        youbora={youboraForVideo.current}
                        playOffline={props.playOffline}

                        allowsExternalPlayback={true}
                        //volume={10}
                        controls={false}
                        ignoreSilentSwitch='ignore'
                        // @ts-ignore
                        enableMediaSession={true}
                        mediaSessionMetadata={{
                            title: props?.title,
                            subtitle: props?.subtitle,
                            description: props?.description,
                            imageUri: props?.poster
                        }}
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
