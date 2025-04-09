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
    getVideoSourceUri,
    getSourceMessageForCast,
    getDRM,
    mergeCastMenuData,
    subtractMinutesFromDate
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
    type LiveSeekableCastRange,
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
    const [menuData, setMenuData] = useState<Array<IPlayerMenuData>>();

    const [audioIndex, setAudioIndex] = useState<number>(props.audioIndex!);
    const [subtitleIndex, setSubtitleIndex] = useState<number>(props.subtitleIndex!);

    useEffect(() => {

        return () => {
            unregisterRemoteSubscriptions();
        };

    }, []);

    useEffect(() => {

        let uri,
            startingPoint = props.currentTime;

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
            dvrWindowSeconds.current = currentManifest.current?.dvr_window_minutes * 60;
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
            adTagUrl: props.adTagUrl,
            poster: props.squaredPoster || props.poster,
            isLive: props.isLive,
            hasNext: props.hasNext,
            startPosition: startingPoint
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

        if (castMediaStatus?.playerState === MediaPlayerState.PLAYING && castMediaStatus?.liveSeekableRange){
            liveSeekableRange.current = castMediaStatus.liveSeekableRange;

            console.log(`[Player] (Cast Flavour) liveSeekableRange ${JSON.stringify(liveSeekableRange.current)}`);
            
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

                if (props?.isLive && props?.onChangeCommonData){
                    props.onChangeCommonData({
                        duration: dvrWindowSeconds.current
                    });
                }

            } else if (typeof(castMediaStatus?.mediaInfo?.streamDuration) === 'number' && castMediaStatus?.mediaInfo?.streamDuration){
                setDuration(castMediaStatus?.mediaInfo?.streamDuration);

                if (!props?.isLive && props?.onChangeCommonData){
                    props.onChangeCommonData({
                        duration: castMediaStatus?.mediaInfo?.streamDuration
                    });
                }

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

    }, [castSession]);

    useEffect(() => {
        if (typeof(castStreamPosition) === 'number'){

            if (isDVR.current && dvrTimeValue !== castStreamPosition){
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

        const COMMON_DATA_FIELDS = ['time', 'volume', 'mute', 'pause', 'audioIndex', 'subtitleIndex'];

        console.log(`[Player] (Cast Flavour) onControlsPress: ${id} (${value})`);

        if (!isContentLoaded){
            return false;
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

        if (id === CONTROL_ACTION.SEEK && isDVR.current && typeof(value) === 'number'){
            // Guardamos el estado de la barra de tiempo en DVR
            setDvrTimeValue(value);
            onChangeDvrTimeValue(value);
        }

        if (id === CONTROL_ACTION.FORWARD && isDVR.current && typeof(value) === 'number' && typeof(dvrTimeValue) === 'number'){
            // Guardamos el estado de la barra de tiempo en DVR
            setDvrTimeValue(dvrTimeValue + value);
            onChangeDvrTimeValue(dvrTimeValue + value);
        }

        if (id === CONTROL_ACTION.BACKWARD && isDVR.current && typeof(value) === 'number' && typeof(dvrTimeValue) === 'number'){
            // Guardamos el estado de la barra de tiempo en DVR
            setDvrTimeValue(dvrTimeValue - value);
            onChangeDvrTimeValue(dvrTimeValue - value);
        }
        
        if (id === CONTROL_ACTION.SEEK || id === CONTROL_ACTION.FORWARD || id === CONTROL_ACTION.BACKWARD || id === CONTROL_ACTION.PAUSE || id === CONTROL_ACTION.MUTE){
            // Actions to invoke on player
            invokePlayerAction(castClient, castSession, id, value, currentTime, duration, liveSeekableRange.current);
        }

        if (id === CONTROL_ACTION.SEEK_OVER_EPG && props.onSeekOverEpg){
            const overEpgValue = props.onSeekOverEpg();
            setDvrTimeValue(overEpgValue!);
            onChangeDvrTimeValue(overEpgValue!);
            invokePlayerAction(castClient, castSession, CONTROL_ACTION.SEEK, props.onSeekOverEpg(), currentTime, duration, liveSeekableRange.current);
        }

        // Actions to be saved between flavours
        if (isContentLoaded && COMMON_DATA_FIELDS.includes(id) && props?.onChangeCommonData){
            let data:ICommonData = {};

            if (id === CONTROL_ACTION.MUTE){
                data.muted = !!value;

            } else if (id === CONTROL_ACTION.PAUSE){
                data.paused = !!value;

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
        if (props.onEnd){
            // Termina el contenido
            props.onEnd();
            
        }
        
    }

    // const onError = () => {

    // }

    const onSlidingStart = (value: number) => {

    }

    const onSlidingMove = (value: number) => {

    }

    const onSlidingComplete = (value: number) => {

        onChangeDvrTimeValue(value);
    }

    const onChangeDvrTimeValue = (value: number) => {

        let secondsToLive,
            date;

        if (typeof(duration) === 'number' && duration >= 0){
            secondsToLive = (duration > value) ? duration - value : 0;
            date = (secondsToLive > 0) ? subtractMinutesFromDate(new Date(), secondsToLive / 60) : new Date();

        }        

        if (props.onDVRChange){
            props.onDVRChange(value, secondsToLive, date);
        }

    }

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
                timeMarkers={props.timeMarkers}
                avoidTimelineThumbnails={props.avoidTimelineThumbnails}

                audioIndex={audioIndex}
                subtitleIndex={subtitleIndex}
                menuData={menuData}

                alwaysVisible={true}

                isLive={props?.isLive}
                isDVR={isDVR.current}
                isContentLoaded={isContentLoaded}

                // Components
                mosca={props.mosca}
                headerMetadata={props.headerMetadata}
                sliderVOD={props.sliderVOD}
                sliderDVR={props.sliderDVR}
                controlsHeaderBar={props.controlsHeaderBar}
                controlsMiddleBar={props.controlsMiddleBar}
                controlsBottomBar={props.controlsBottomBar}
                nextButton={props.nextButton}
                liveButton={props.liveButton}
                skipIntroButton={props.skipIntroButton}
                skipRecapButton={props.skipRecapButton}
                skipCreditsButton={props.skipCreditsButton}
                menu={props.menu}
                settingsMenu={props.settingsMenu}

                // Events
                onPress={onControlsPress}
                onSlidingStart={onSlidingStart}
                onSlidingMove={onSlidingMove}
                onSlidingComplete={onSlidingComplete}
            />
        </View>
    );

};
