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
    getBestManifest,
    getDRM,
    getSourceMessageForCast,
    getVideoSourceUri,
    subtractMinutesFromDate
} from '../../utils';

import {
    invokePlayerAction,
} from '../actions/cast';

import { styles } from '../styles';

import {
    type AudioCastFlavourProps,
    type AudioPlayerActionEventProps,
    CONTROL_ACTION,
    type ICommonData,
    type IDrm,
    type IManifest,
    type IMappedYoubora,
    type LiveSeekableCastRange,
    YOUBORA_FORMAT,
} from '../../types';

export function AudioCastFlavour (props: AudioCastFlavourProps): React.ReactElement {

    const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
    const audioPlayerHeight = useSharedValue(0);

    const castState = useCastState();
    const castSession = useCastSession();
    const castClient = useRemoteMediaClient();
    const castMediaStatus = useMediaStatus();
    const castStreamPosition = useStreamPosition(1);

    const liveSeekableRange = useRef<LiveSeekableCastRange | null>();
    const lastCastState = useRef<CastState | null>();
    const eventsRegistered = useRef<boolean>(false);
    const onMediaPlaybackEndedListener = useRef<EmitterSubscription>();
    const onMediaPlaybackStartedListener = useRef<EmitterSubscription>();

    const currentManifest = useRef<IManifest>();
    const youboraForVideo = useRef<IMappedYoubora>();
    const drm = useRef<IDrm>();
    const castMessage = useRef();
    const isDVR = useRef<boolean>();
    const dvrWindowSeconds = useRef<number>();

    const [currentTime, setCurrentTime] = useState<number>(props.currentTime!);
    const [duration, setDuration] = useState<number>();
    const [dvrTimeValue, setDvrTimeValue] = useState<number>();
    const [paused, setPaused] = useState<boolean>(!!props.paused);
    const [muted, setMuted] = useState<boolean>(!!props?.muted);
    const [preloading, setPreloading] = useState<boolean>(true);
    const [loading, setLoading] = useState<boolean>(false);
    const [hasSeekOverDRV, setHasSeekOverDRV] = useState<boolean>(false);

    useEffect(() => {

        castMessage.current = undefined;

        return () => {
            unregisterRemoteSubscriptions();
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
            extraData: props.extraData
        });

    }, [currentTime, dvrTimeValue, duration, paused, muted, preloading, isDVR.current, isContentLoaded]);

    useEffect(() => {

        let uri,
            startingPoint = props.currentTime;

        castMessage.current = undefined;

        // Cogemos el manifest adecuado
        currentManifest.current = getBestManifest(props?.manifests!, true);

        // Preparamos el URI adecuado
        if (props.getSourceUri){
            uri = props.getSourceUri(currentManifest.current!, currentManifest.current?.dvr_window_minutes);

        } else {
            uri = getVideoSourceUri(currentManifest.current!, currentManifest.current?.dvr_window_minutes);

        }

        // Preparamos el DRM adecuado al manifest y plataforma
        drm.current = getDRM(currentManifest.current!);

        // Preparamos los datos de Youbora
        if (props.getYouboraOptions){
            youboraForVideo.current = props.getYouboraOptions(props.youbora!, YOUBORA_FORMAT.CAST);

        }

        // Preparamos la ventada de tiempo del directo (DVR) si estamos ante un Live
        if (props.isLive && typeof(currentManifest.current?.dvr_window_minutes) === 'number' && currentManifest.current?.dvr_window_minutes > 0){
            isDVR.current = true;
            dvrWindowSeconds.current = props.forcedDvrWindowMinutes ? props.forcedDvrWindowMinutes * 60 : currentManifest.current?.dvr_window_minutes * 60;
            startingPoint = dvrWindowSeconds.current;
            setDvrTimeValue(dvrWindowSeconds.current);
        }

        // Monstamos el mensaje para el Cast
        // @ts-ignore
        castMessage.current = getSourceMessageForCast(uri, currentManifest.current!, drm.current, youboraForVideo.current, {
            id: props.id,
            title: props.title,
            subtitle: props.subtitle,
            description: props.description,
            liveStartDate: props.liveStartDate,
            poster: props.squaredPoster || props.poster,
            isLive: props.isLive,
            hasNext: props.hasNext,
            startPosition: startingPoint
        });

        tryLoadMedia();

    }, [props.manifests]);

    useEffect(() => {

        if (castState === CastState.CONNECTING && !preloading){
            setPreloading(true);

        } else if (castState !== CastState.CONNECTING && preloading){
            setPreloading(false);
        }

        lastCastState.current = castState;

        tryLoadMedia();

    }, [castState]);

    useEffect(() => {

        if (castClient && !eventsRegistered.current){
            registerRemoteSubscriptions();

        } else if (!castClient && eventsRegistered.current){
            unregisterRemoteSubscriptions();

        }

        tryLoadMedia();

    }, [castClient]);

    useEffect(() => {

        if (!castMediaStatus){
            return;
        }

        if (castMediaStatus?.playerState === MediaPlayerState.PLAYING && castMediaStatus?.liveSeekableRange){
            liveSeekableRange.current = castMediaStatus.liveSeekableRange;

            console.log(`[Player] (Audio Cast Flavour) liveSeekableRange ${JSON.stringify(liveSeekableRange.current)}`);
        }

        // Loading
        if ((castMediaStatus?.playerState === MediaPlayerState.BUFFERING || castMediaStatus?.playerState === MediaPlayerState.LOADING) && !loading){
            setLoading(true);

        } else if ((castMediaStatus?.playerState !== MediaPlayerState.BUFFERING && castMediaStatus?.playerState !== MediaPlayerState.LOADING) && loading){
            setLoading(false);

        }

        // Duration
        if (!duration){

            if (isDVR.current){
                setDuration(dvrWindowSeconds.current);

            } else if (typeof(castMediaStatus?.mediaInfo?.streamDuration) === 'number' && castMediaStatus?.mediaInfo?.streamDuration){
                setDuration(castMediaStatus?.mediaInfo?.streamDuration);

                if (!props?.isLive && props?.onChangeCommonData){
                    props.onChangeCommonData({
                        duration: castMediaStatus?.mediaInfo?.streamDuration
                    });
                }

            }

            if (!isContentLoaded){
                setIsContentLoaded(true);
            }

        }

        if (castMediaStatus?.playerState === MediaPlayerState.PAUSED && !paused){
            onControlsPress(CONTROL_ACTION.PAUSE, true);

        } else if (castMediaStatus?.playerState !== MediaPlayerState.PAUSED && paused){
            onControlsPress(CONTROL_ACTION.PAUSE, false);

        }

    }, [castMediaStatus]);

    useEffect(() => {

        // Muted
        castSession?.isMute().then(value => {
            if (value !== muted){
                onControlsPress(CONTROL_ACTION.MUTE, !!value);
            }
            
        });

        tryLoadMedia();

    }, [castSession]);

    useEffect(() => {
        if (typeof(castStreamPosition) === 'number'){

            if (isDVR.current){
                setDvrTimeValue(castStreamPosition);

            }

            setCurrentTime(castStreamPosition);

            if (props?.onChangeCommonData){
                props.onChangeCommonData({
                    time: castStreamPosition
                });
            }
        }

    }, [castStreamPosition]);

    // Cast Events
    const registerRemoteSubscriptions = () => {

        if (castClient){
            eventsRegistered.current = true;

            onMediaPlaybackEndedListener.current = castClient.onMediaPlaybackEnded((mediaStatus) => {
                onEnd();
                
            });

            onMediaPlaybackStartedListener.current = castClient.onMediaPlaybackStarted((mediaStatus) => {

                if (!isContentLoaded){
                    setIsContentLoaded(true);
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

    }

    // Functions
    const onControlsPress = (id: CONTROL_ACTION, value?:number | boolean) => {

        const COMMON_DATA_FIELDS = ['time', 'volume', 'mute', 'pause'];

        if (!isContentLoaded){
            return false;
        }

        console.log(`[Player] (Audio Cast Flavour) onControlsPress: ${id} (${value})`);

        if (id === CONTROL_ACTION.CLOSE_AUDIO_PLAYER){

            if (props.onClose){
                props.onClose();

            }

        }

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

        if (id === CONTROL_ACTION.PREVIOUS && props.onPrevious){
            setIsContentLoaded(false);
            props.onPrevious();
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
        
        if (id === CONTROL_ACTION.SEEK || id === CONTROL_ACTION.FORWARD || id === CONTROL_ACTION.BACKWARD || id === CONTROL_ACTION.PAUSE || id === CONTROL_ACTION.MUTE){
            // Actions to invoke on player
            invokePlayerAction(castClient, castSession, id, value, currentTime, duration, liveSeekableRange.current);
        }

        // Actions to be saved between flavours
        if (COMMON_DATA_FIELDS.includes(id) && props?.onChangeCommonData){
            let data:ICommonData = {};

            if (id === CONTROL_ACTION.MUTE){
                data.muted = !!value;

            } else if (id === CONTROL_ACTION.PAUSE){
                data.paused = !!value;

            } else if (typeof(value) === 'number'){
                data.volume = (id === CONTROL_ACTION.VOLUME) ? value : undefined;
                data.audioIndex = (id === CONTROL_ACTION.AUDIO_INDEX) ? value : undefined;
                data.subtitleIndex = (id === CONTROL_ACTION.SUBTITLE_INDEX) ? value : undefined;
                
            }
            
            props.onChangeCommonData(data);

        }

    }

    const onEnd = () => {
        if (props.onEnd){
            // Termina el contenido
            props.onEnd();
            
        }
        
    }

    async function getCurrentMediaStatus(){
        const mediaStatus = await castClient?.getMediaStatus();

        // @ts-ignore
        if (mediaStatus?.mediaInfo?.contentId !== castMessage.current?.mediaInfo?.contentId){
            console.log(`[Player] (Audio Cast Flavour) Different content so loading media: ${JSON.stringify(castMessage.current)}`);
            castClient?.loadMedia(castMessage.current!);

        } else {
            setIsContentLoaded(true);

        }

    }

    const tryLoadMedia = () => {

        if (castState === CastState.CONNECTED && castClient){
            try {
                getCurrentMediaStatus();
                
            } catch (reason){
                console.log(`[Player] (Audio Cast Flavour) Loading media error: ${JSON.stringify(reason)}`);
            }

        }

    }

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
        preloading: loading || preloading,
        hasNext: props.hasNext,
        hasPrev: props.hasPrev,
        isLive: props.isLive,
        isDVR: isDVR.current,
        isContentLoaded: isContentLoaded,
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

            { Controls }

        </Animated.View>
    );

};

export default AudioCastFlavour;
