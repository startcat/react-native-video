import React, { useEffect, useState, useRef } from 'react';
import { 
    CastState, 
    useCastState, 
    useCastSession, 
    useRemoteMediaClient, 
    useMediaStatus, 
    useStreamPosition,
    MediaPlayerState,
} from 'react-native-google-cast';
import { View, type EmitterSubscription } from 'react-native';
import { Overlay } from '../../overlay';
import { BackgroundPoster } from '../../components/poster';

import { 
    getBestManifest,
    getSourceMessageForCast,
    getDRM,
    mergeCastMenuData,
} from '../../utils';

import {
    invokePlayerAction,
    changeActiveTracks
} from './actions';

import { styles } from '../styles';

import { 
    type CastFlavourProps,
    type IManifest, 
    type IMappedYoubora,
    type IDrm,
    type ICommonData,
    type IPlayerMenuData,
    CONTROL_ACTION,
    YOUBORA_FORMAT,
    PLAYER_MENU_DATA_TYPE
} from '../../types';

export function CastFlavour (props: CastFlavourProps): React.ReactElement {

    const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
    const castState = useCastState();
    const castSession = useCastSession();
    const castClient = useRemoteMediaClient();
    const castMediaStatus = useMediaStatus();
    const castStreamPosition = useStreamPosition(1);

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
    const [paused, setPaused] = useState<boolean>(false);
    const [muted, setMuted] = useState<boolean>(!!props?.muted);
    const [preloading, setPreloading] = useState<boolean>(true);
    const [loading, setLoading] = useState<boolean>(false);
    const [menuData, setMenuData] = useState<Array<IPlayerMenuData>>();

    const [audioIndex, setAudioIndex] = useState<number>(props.audioIndex!);
    const [subtitleIndex, setSubtitleIndex] = useState<number>(props.subtitleIndex!);

    useEffect(() => {

        return () => {
            unregisterRemoteSubscriptions();
        };

    }, []);

    useEffect(() => {

        // Cogemos el manifest adecuado
        currentManifest.current = getBestManifest(props?.manifests!, true);

        // Preparamos el DRM adecuado al manifest y plataforma
        drm.current = getDRM(currentManifest.current!);

        // Preparamos los datos de Youbora
        if (props.getYouboraOptions){
            youboraForVideo.current = props.getYouboraOptions(props.youbora!, YOUBORA_FORMAT.CAST);

        }

        // Preparamos la ventada de tiempo del directo (DVR) si estamos ante un Live
        if (typeof(currentManifest.current?.dvr_window_minutes) === 'number' && currentManifest.current?.dvr_window_minutes > 0){
            isDVR.current = true;
            dvrWindowSeconds.current = currentManifest.current?.dvr_window_minutes * 60;
            setDvrTimeValue(dvrWindowSeconds.current);
        }

        // Monstamos el mensaje para el Cast
        // @ts-ignore
        castMessage.current = getSourceMessageForCast(currentManifest.current!, drm.current, youboraForVideo.current, {
            id: props.id,
            title: props.title,
            subtitle: props.subtitle,
            description: props.description,
            liveStartDate: props.liveStartDate,
            adTagUrl: props.adTagUrl,
            poster: props.poster,
            isLive: props.isLive,
            hasNext: props.hasNext,
            startPosition: props.currentTime
        });

        if (castState === CastState.CONNECTED && castClient){
            console.log(`[Player] (Cast Flavour) Loading media after creating castMessage: ${JSON.stringify(castMessage.current)}`);
            castClient?.loadMedia(castMessage.current!);

        }

    }, [props.manifests]);

    useEffect(() => {
        setAudioIndex(props.audioIndex!);

    }, [props.audioIndex]);

    useEffect(() => {
        setSubtitleIndex(props.subtitleIndex!);

    }, [props.subtitleIndex]);

    useEffect(() => {
        // Ajustamos los cambios en las pistas activas
        if (isContentLoaded){
            changeActiveTracks(castClient, menuData, audioIndex, subtitleIndex);
        }

    }, [audioIndex, subtitleIndex]);

    useEffect(() => {
        // Montamos las pistas activas de inicio
        if (menuData){
            changeActiveTracks(castClient, menuData, audioIndex, subtitleIndex);
        }

        if (menuData && props.onChangeCommonData){
            // Al cargar la lista de audios y subtítulos, mandamos las labels iniciales

            let data:ICommonData = {},
                audioDefaultIndex = 0,
                textDefaultIndex = -1;

            if (typeof(audioIndex) === 'number'){
                audioDefaultIndex = audioIndex;
            }

            if (typeof(subtitleIndex) === 'number'){
                textDefaultIndex = subtitleIndex;
            }

            data.audioIndex = audioDefaultIndex;
            data.audioLabel = menuData?.find(item => item.type === PLAYER_MENU_DATA_TYPE.AUDIO && item.index === audioDefaultIndex)?.label;

            data.subtitleIndex = textDefaultIndex;
            data.subtitleLabel = menuData?.find(item => item.type === PLAYER_MENU_DATA_TYPE.TEXT && item.index === textDefaultIndex)?.label;
        
            if (data){
                props.onChangeCommonData(data);
            }

        }

    }, [menuData]);

    useEffect(() => {

        if (castState === CastState.CONNECTING && !preloading){
            setPreloading(true);

        } else if (castState !== CastState.CONNECTING && preloading){
            setPreloading(false);
        }

        lastCastState.current = castState;

    }, [castState]);

    useEffect(() => {

        if (castClient && !eventsRegistered.current){
            registerRemoteSubscriptions();

        } else if (!castClient && eventsRegistered.current){
            unregisterRemoteSubscriptions();

        }

        async function getCurrentMediaStatus(){
            const mediaStatus = await castClient?.getMediaStatus();

            // @ts-ignore
            if (mediaStatus?.mediaInfo?.contentId !== castMessage.current?.mediaInfo?.contentId){
                console.log(`[Player] (Cast Flavour) Different content so loading media: ${JSON.stringify(castMessage.current)}`);
                castClient?.loadMedia(castMessage.current!);

            } else {
                setMenuData(mergeCastMenuData(mediaStatus?.mediaInfo?.mediaTracks, props.languagesMapping));
                setIsContentLoaded(true);

            }

        }

        if (castState === CastState.CONNECTED && castClient && castMessage.current){
            
            try {
                getCurrentMediaStatus();
                
            } catch (reason){
                console.log(`[Player] (Cast Flavour) Loading media error: ${JSON.stringify(reason)}`);
            }
            
        }

    }, [castClient]);

    useEffect(() => {

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

            }

        }

        // Paused
        if ((castMediaStatus?.playerState === MediaPlayerState.PAUSED || castMediaStatus?.playerState === MediaPlayerState.IDLE) && !paused){
            setPaused(true);

        } else if ((castMediaStatus?.playerState !== MediaPlayerState.PAUSED && castMediaStatus?.playerState !== MediaPlayerState.IDLE) && paused){
            setPaused(false);

        }

    }, [castMediaStatus]);

    useEffect(() => {

        // Muted
        castSession?.isMute().then(value => {
            if (value !== muted){
                setMuted(value);
            }
            
        });

    }, [castSession]);

    useEffect(() => {
        if (typeof(castStreamPosition) === 'number' && currentTime !== castStreamPosition){
            setCurrentTimeWithValidation(castStreamPosition);

            if (!props?.isLive && props?.onChangeCommonData){
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
                    setMenuData(mergeCastMenuData(mediaStatus?.mediaInfo?.mediaTracks, props.languagesMapping));
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

        const COMMON_DATA_FIELDS = ['time', 'volume', 'mute', 'audioIndex', 'subtitleIndex'];

        if (!isContentLoaded){
            return false;
        }

        console.log(`[Player] (Cast Flavour) onControlsPress: ${id} (${value})`);

        // State Actions
        if (id === CONTROL_ACTION.NEXT){
            if (props.onNext){
                props.onNext();
            }

        // Actions to invoke on player
        } else {

            // Guardamos el estado de la barra de tiempo en DVR
            if (id === CONTROL_ACTION.SEEK && isDVR.current && typeof(value) === 'number'){
                setDvrTimeValue(value);
            }

            if (id === CONTROL_ACTION.MUTE){
                setMuted(!!value);
            }

            invokePlayerAction(castClient, castSession, id, value, currentTime, props?.isLive, menuData);

        }

        // Actions to be saved between flavours
        if (isContentLoaded && COMMON_DATA_FIELDS.includes(id) && props?.onChangeCommonData){
            let data:ICommonData = {};

            if (id === CONTROL_ACTION.MUTE){
                data.muted = !!value;

            } else if (typeof(value) === 'number'){
                data.volume = (id === CONTROL_ACTION.VOLUME) ? value : undefined;
                data.audioIndex = (id === CONTROL_ACTION.AUDIO_INDEX) ? value : undefined;
                data.subtitleIndex = (id === CONTROL_ACTION.SUBTITLE_INDEX) ? value : undefined;
                data.audioLabel = menuData?.find(item => item.type === PLAYER_MENU_DATA_TYPE.AUDIO && item.index === value)?.label;
                data.subtitleLabel = menuData?.find(item => item.type === PLAYER_MENU_DATA_TYPE.TEXT && item.index === value)?.label;
                
            }
            
            props.onChangeCommonData(data);

        }

    }

    const onEnd = () => {

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

    // const onError = () => {

    // }

    // const onSlidingStart = (value: number) => {

    // }

    // const onSlidingMove = (value: number) => {

    // }

    // const onSlidingComplete = (value: number) => {

    // }

    return (
        <View style={styles.container}>
            <BackgroundPoster poster={props.poster} />

            <Overlay
                title={props?.title}
                currentTime={currentTime}
                duration={duration}
                dvrTimeValue={dvrTimeValue}
                muted={muted}
                paused={paused}
                preloading={loading || preloading}
                hasNext={props?.hasNext}
                thumbnailsMetadata={currentManifest.current?.thumbnailMetadata}

                audioIndex={audioIndex}
                subtitleIndex={subtitleIndex}
                menuData={menuData}

                alwaysVisible={true}

                isLive={props?.isLive}
                isDVR={isDVR.current}
                isContentLoaded={isContentLoaded}

                // Components
                mosca={props.mosca}
                controlsHeaderMetadata={props.controlsHeaderMetadata}
                sliderVOD={props.sliderVOD}
                sliderDVR={props.sliderDVR}

                // Events
                onPress={onControlsPress}
                // onSlidingStart={onSlidingStart}
                // onSlidingMove={onSlidingMove}
                // onSlidingComplete={onSlidingComplete}
            />
        </View>
    );

};
