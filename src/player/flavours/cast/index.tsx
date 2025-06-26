import React, { useEffect, useRef, useState } from 'react';
import { View, type EmitterSubscription } from 'react-native';
import {
    CastState,
    MediaPlayerState,
    useCastSession,
    useCastState,
    useMediaStatus,
    useRemoteMediaClient,
    useStreamPosition,
} from 'react-native-google-cast';
import { BackgroundPoster } from '../../components/poster';
import { Overlay } from '../../overlay';

import {
    getBestManifest,
    getDRM,
    getSourceMessageForCast,
    getVideoSourceUri,
    mergeCastMenuData,
    subtractMinutesFromDate
} from '../../utils';

import {
    useDvrPausedSeconds,
    handleDvrPausedDatum,
    type handleDvrPausedDatumResults
} from '../../modules/dvr';

import {
    changeActiveTracks,
    invokePlayerAction
} from '../actions/cast';

import { styles } from '../styles';

import {
    CONTROL_ACTION,
    PLAYER_MENU_DATA_TYPE,
    YOUBORA_FORMAT,
    type CastFlavourProps,
    type ICommonData,
    type IDrm,
    type IManifest,
    type IMappedYoubora,
    type IPlayerMenuData,
    type LiveSeekableCastRange
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
    const liveStartProgramTimestamp = useRef<number>();
    const needsLiveInitialSeek = useRef<boolean>(false);
    const isChangingSource = useRef<boolean>(true);

    const [currentTime, setCurrentTime] = useState<number>(props.currentTime!);
    const [duration, setDuration] = useState<number>();
    const [dvrTimeValue, setDvrTimeValue] = useState<number>();
    const [paused, setPaused] = useState<boolean>(!!props.paused);
    const [muted, setMuted] = useState<boolean>(!!props?.muted);
    const [preloading, setPreloading] = useState<boolean>(true);
    const [loading, setLoading] = useState<boolean>(false);
    const [menuData, setMenuData] = useState<Array<IPlayerMenuData>>();
    const [hasSeekOverDRV, setHasSeekOverDRV] = useState<boolean>(false);

    const [audioIndex, setAudioIndex] = useState<number>(props.audioIndex!);
    const [subtitleIndex, setSubtitleIndex] = useState<number>(props.subtitleIndex!);

    const dvrPaused = useDvrPausedSeconds({
        paused: paused,
        isLive: !!props?.isLive,
        isDVR: !!isDVR.current
    });

    useEffect(() => {

        castMessage.current = undefined;

        return () => {
            unregisterRemoteSubscriptions();
        };

    }, []);

    useEffect(() => {

        let uri,
            startingPoint = props.currentTime;

        castMessage.current = undefined;
        isChangingSource.current = true;

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
            needsLiveInitialSeek.current = false;
            
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

        tryLoadMedia();

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
        // Gestionamos la ventana al realizar pause sobre un DVR
        const handleDvrPausedDatumResults = handleDvrPausedDatum(!!props.isLive, dvrWindowSeconds.current!, dvrPaused, dvrTimeValue, props?.onChangeCommonData);

        if (handleDvrPausedDatumResults.duration){
            setDuration(handleDvrPausedDatumResults.duration);
        }

        if (handleDvrPausedDatumResults.dvrTimeValue){
            setDvrTimeValue(handleDvrPausedDatumResults.dvrTimeValue);
        }

    }, [dvrPaused?.pausedDatum]);

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

        if (castMediaStatus?.liveSeekableRange?.endTime && castMediaStatus?.liveSeekableRange?.endTime !== liveSeekableRange?.current?.endTime) {
            liveSeekableRange.current = castMediaStatus.liveSeekableRange;

            console.log(`[Player] (Cast Flavour) liveSeekableRange ${JSON.stringify(liveSeekableRange.current)}`);
            
        }

        // Loading
        if ((castMediaStatus?.playerState === MediaPlayerState.BUFFERING || castMediaStatus?.playerState === MediaPlayerState.LOADING) && !loading){
            setLoading(true);

            if (props.onBuffering){
                props.onBuffering(true);
            }

        } else if ((castMediaStatus?.playerState !== MediaPlayerState.BUFFERING && castMediaStatus?.playerState !== MediaPlayerState.LOADING) && loading){
            setLoading(false);

            if (props.onBuffering){
                props.onBuffering(false);
            }

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

        tryLoadMedia();

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
                    
                    if (props.mergeCastMenuData && typeof(props.mergeCastMenuData) === 'function'){
                        setMenuData(props.mergeCastMenuData(mediaStatus?.mediaInfo?.mediaTracks, props.languagesMapping));

                    } else {
                        setMenuData(mergeCastMenuData(mediaStatus?.mediaInfo?.mediaTracks, props.languagesMapping));

                    }

                    setIsContentLoaded(true);

                    if (props.onStart){
                        props.onStart();
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
            if (typeof(duration) === 'number' && value >= duration){
                setHasSeekOverDRV(false);
            }
        }

        if (id === CONTROL_ACTION.LIVE && isDVR.current && typeof(duration) === 'number' && typeof(liveSeekableRange?.current?.endTime) === 'number'){
            // Volver al directo en DVR
            setDvrTimeValue(duration);
            onChangeDvrTimeValue(duration);
            if (typeof(duration) === 'number'){
                setHasSeekOverDRV(false);
            }

            invokePlayerAction(castClient, castSession, CONTROL_ACTION.SEEK, liveSeekableRange.current.endTime, currentTime, duration, liveSeekableRange.current, props.onSeek);

        }

        if (id === CONTROL_ACTION.FORWARD && isDVR.current && typeof(value) === 'number' && typeof(dvrTimeValue) === 'number' && typeof(duration) === 'number'){

            // Si excedemos el rango, no hacemos nada
            if ((dvrTimeValue + value) > duration){
                return;
            }

            // Guardamos el estado de la barra de tiempo en DVR
            const maxBarRange = Math.min(dvrTimeValue + value, duration);
            setDvrTimeValue(maxBarRange);
            onChangeDvrTimeValue(maxBarRange);
            if (typeof(duration) === 'number' && (maxBarRange) >= duration){
                setHasSeekOverDRV(false);
            }
        }

        if (id === CONTROL_ACTION.BACKWARD && isDVR.current && typeof(value) === 'number' && typeof(dvrTimeValue) === 'number'){
            // Guardamos el estado de la barra de tiempo en DVR
            const minBarRange = Math.max(0, dvrTimeValue - value);
            setDvrTimeValue(minBarRange);
            onChangeDvrTimeValue(minBarRange);
        }
        
        if (id === CONTROL_ACTION.SEEK || id === CONTROL_ACTION.FORWARD || id === CONTROL_ACTION.BACKWARD || id === CONTROL_ACTION.PAUSE || id === CONTROL_ACTION.MUTE){
            // Actions to invoke on player
            invokePlayerAction(castClient, castSession, id, value, currentTime, duration, liveSeekableRange.current, props.onSeek);
        }

        if (id === CONTROL_ACTION.SEEK_OVER_EPG && props.onSeekOverEpg){
            setHasSeekOverDRV(true);
            const overEpgValue = props.onSeekOverEpg();
            let realSeek = overEpgValue;

            if (typeof(duration) === 'number' && typeof(liveSeekableRange.current) === 'number'){
                realSeek = overEpgValue! + (liveSeekableRange.current - duration);
            }

            setDvrTimeValue(overEpgValue!);
            onChangeDvrTimeValue(overEpgValue!);
            invokePlayerAction(castClient, castSession, CONTROL_ACTION.SEEK, realSeek, currentTime, duration, liveSeekableRange.current, props.onSeek);
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

    async function getCurrentMediaStatus(){
        const mediaStatus = await castClient?.getMediaStatus();

        // @ts-ignore
        if (mediaStatus?.mediaInfo?.contentId !== castMessage.current?.mediaInfo?.contentId){
            console.log(`[Player] (Cast Flavour) Different content so loading media: ${JSON.stringify(castMessage.current)}`);
            castClient?.loadMedia(castMessage.current!);

        } else {

            if (props.mergeCastMenuData && typeof(props.mergeCastMenuData) === 'function'){
                setMenuData(props.mergeCastMenuData(mediaStatus?.mediaInfo?.mediaTracks, props.languagesMapping));

            } else {
                setMenuData(mergeCastMenuData(mediaStatus?.mediaInfo?.mediaTracks, props.languagesMapping));

            }

            setIsContentLoaded(true);

        }

    }

    const tryLoadMedia = () => {

        if (castState === CastState.CONNECTED && castClient){
            try {
                getCurrentMediaStatus();
                
            } catch (reason){
                console.log(`[Player] (Cast Flavour) Loading media error: ${JSON.stringify(reason)}`);
            }

        }

    }

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
                isDVRStart={hasSeekOverDRV}
                isContentLoaded={isContentLoaded}

                // Components
                loader={props.loader}
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
                onExit={props.onExit}
            />
        </View>
    );

};

export default CastFlavour;
