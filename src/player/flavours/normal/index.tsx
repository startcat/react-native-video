import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useSafeAreaInsets, EdgeInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { 
    type SelectedTrack,
    type SelectedVideoTrack,
    type OnProgressData,
    type OnReceiveAdEventData,
    type OnBufferData,
    //type OnVideoErrorData,
    type OnLoadData,
    //type OnVolumeChangeData,
    SelectedVideoTrackType,
    SelectedTrackType
} from '../../../types';
import { type VideoRef } from '../../../Video';
import Video from '../../../Video';
import { useAirplayConnectivity } from 'react-airplay';
import { Overlay } from '../../overlay';
import { BackgroundPoster } from '../../components/poster';
import { View } from 'react-native';

import { 
    getBestManifest,
    getManifestSourceType,
    getVideoSourceUri,
    getDRM,
    getMinutesSinceStart,
    onAdStarted,
    mergeMenuData,
    getHlsQualities,
    subtractMinutesFromDate,
    useDvrPausedSeconds
} from '../../utils';

import {
    invokePlayerAction
} from './actions';

import { styles } from '../styles';

import { 
    type NormalFlavourProps,
    type IManifest, 
    type IMappedYoubora, 
    type IDrm,
    type IVideoSource,
    type ICommonData,
    type IPlayerMenuData,
    CONTROL_ACTION,
    STREAM_FORMAT_TYPE,
    YOUBORA_FORMAT,
    PLAYER_MENU_DATA_TYPE
} from '../../types';

export function NormalFlavour (props: NormalFlavourProps): React.ReactElement {

    const [isPlayingAd, setIsPlayingAd] = useState<boolean>(false);
    const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
    const isAirplayConnected = useAirplayConnectivity();
    const insets = useSafeAreaInsets();
    const {height, width} = useWindowDimensions();

    const currentManifest = useRef<IManifest>();
    const youboraForVideo = useRef<IMappedYoubora>();
    const drm = useRef<IDrm>();
    const videoSource = useRef<IVideoSource>();
    const isDVR = useRef<boolean>();
    const isHLS = useRef<boolean>();
    const isDASH = useRef<boolean>();
    const dvrWindowSeconds = useRef<number>();

    const [currentTime, setCurrentTime] = useState<number>(props.currentTime!);
    const [duration, setDuration] = useState<number>();
    const [dvrTimeValue, setDvrTimeValue] = useState<number>();
    const [paused, setPaused] = useState<boolean>(!!props.paused);
    const [muted, setMuted] = useState<boolean>(!!props?.muted);
    const [preloading, setPreloading] = useState<boolean>(false);
    const [isPlayingExternalTudum, setIsPlayingExternalTudum] = useState<boolean>(!!props.showExternalTudum);
    const [menuData, setMenuData] = useState<Array<IPlayerMenuData>>();

    const [speedRate, setSpeedRate] = useState<number>(1);
    const [selectedAudioTrack, setSelectedAudioTrack] = useState<SelectedTrack>();
    const [selectedTextTrack, setSelectedTextTrack] = useState<SelectedTrack>();
    const [selectedVideoTrack, setSelectedVideoTrack] = useState<SelectedVideoTrack>({
        type:SelectedVideoTrackType.AUTO
    });

    const refVideoPlayer = useRef<VideoRef>(null);

    const dvrPaused = useDvrPausedSeconds({
        paused: paused,
        isLive: !!props?.isLive,
        isDVR: !!isDVR.current
    });

    useEffect(() => {

        if (isPlayingExternalTudum && props.getTudumManifest){
            let tudumManifest = props.getTudumManifest();

            drm.current = getDRM(tudumManifest!);

            // Montamos el Source para el player
            videoSource.current = {
                uri: getVideoSourceUri(tudumManifest!)
            };

        } else {
            setPlayerSource();

        }

    }, [props.manifests]);

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

        if (menuData && props.onChangeCommonData){
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
            data.audioLabel = menuData?.find(item => item.type === PLAYER_MENU_DATA_TYPE.AUDIO && item.index === audioDefaultIndex)?.label;

            data.subtitleIndex = textDefaultIndex;
            data.subtitleLabel = menuData?.find(item => item.type === PLAYER_MENU_DATA_TYPE.TEXT && item.index === textDefaultIndex)?.label;
        
            if (data){
                props.onChangeCommonData(data);
            }

        }

    }, [menuData]);

    useEffect(() => {

        if (typeof(dvrTimeValue) === 'number' && dvrPaused.pausedSeconds > 0){
            const moveDVRto = dvrTimeValue - dvrPaused.pausedSeconds;

            setDvrTimeValue(moveDVRto > 0 ? moveDVRto : 0);
        }

    }, [dvrPaused.pausedDatum, dvrPaused.pausedSeconds]);

    const checkIfPlayerIsLandscape = (height: number, width: number, insets: EdgeInsets): boolean => {

        // Calculamos una dimension del player
        const margins = Math.max(insets.left, insets.right);
        const playerAspectRatio = 16/9;
        const windowAspectRatio = (width - margins) / height;

        return (windowAspectRatio >= playerAspectRatio);

    }

    const isLandscapePlayer = useMemo(
        () => checkIfPlayerIsLandscape(height, width, insets),
        [height, width, insets]
    );

    // Source Cooking
    const setPlayerSource = async () => {

        let uri = "";

        // Cogemos el manifest adecuado
        currentManifest.current = getBestManifest(props?.manifests!);

        // Preparamos el DRM adecuado al manifest y plataforma
        drm.current = getDRM(currentManifest.current!);

        // Marcamos si es HLS
        isHLS.current = currentManifest.current?.type === STREAM_FORMAT_TYPE.HLS;

        // Marcamos si es DASH
        isDASH.current = currentManifest.current?.type === STREAM_FORMAT_TYPE.DASH;

        // Preparamos los datos de Youbora
        if (props.getYouboraOptions){
            youboraForVideo.current = props.getYouboraOptions(props.youbora!, YOUBORA_FORMAT.MOBILE);

        }

        // Preparamos la ventada de tiempo del directo (DVR) si estamos ante un Live
        if (props.isLive && typeof(currentManifest.current?.dvr_window_minutes) === 'number' && currentManifest.current?.dvr_window_minutes > 0){
            isDVR.current = true;
            dvrWindowSeconds.current = currentManifest.current?.dvr_window_minutes * 60;
            setDvrTimeValue(dvrWindowSeconds.current);
        }

        // Preparamos la uri por si necesitamos incorporar el start en el dvr
        if (props.getSourceUri){
            uri = props.getSourceUri(currentManifest.current!, currentManifest.current?.dvr_window_minutes);

        } else {
            uri = getVideoSourceUri(currentManifest.current!, currentManifest.current?.dvr_window_minutes);
            
        }

        // Recalculamos la ventana de tiempo para el slider en DVR
        if (typeof(currentManifest.current?.dvr_window_minutes) === 'number' && currentManifest.current?.dvr_window_minutes > 0){
            const dvrRecalculatedMinutes = getMinutesSinceStart(uri);

            if (dvrRecalculatedMinutes){
                dvrWindowSeconds.current = dvrRecalculatedMinutes * 60;
                setDvrTimeValue(dvrWindowSeconds.current);
            }
        }

        // Montamos el Source para el player
        videoSource.current = {
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
        };

    }

    // Functions
    const maybeChangeBufferingState = (buffering: boolean) => {

        const newIsBuffering = buffering && !paused;

        if (preloading !== newIsBuffering){
            setPreloading(newIsBuffering);

        }

    }

    const changeHlsVideoQuality = (index:number) => {

        const quality = menuData?.find(item => item.type === 'video' && item.index === index);

        if (quality && quality.code && videoSource.current){

            videoSource.current = {
                id: videoSource.current.id,
                title: videoSource.current.title,
                uri: quality.code,
                type: videoSource.current.type,
                headers: props.headers,
                metadata: videoSource.current.metadata
            };

            setSelectedVideoTrack({
                type:SelectedVideoTrackType.INDEX,
                value:index
            });

        }

    }

    const onControlsPress = (id: CONTROL_ACTION, value?:number | boolean) => {

        const COMMON_DATA_FIELDS = ['time', 'volume', 'mute', 'pause', 'audioIndex', 'subtitleIndex'];

        console.log(`[Player] (Normal Flavour) onControlsPress: ${id} (${value})`);

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
        
        if (isHLS.current && id === CONTROL_ACTION.VIDEO_INDEX && typeof(value) === 'number'){
            // Cambio de calidad con HLS
            changeHlsVideoQuality(value);
        }
        
        if (!isHLS.current && id === CONTROL_ACTION.VIDEO_INDEX && typeof(value) === 'number'){
            // Cambio de calidad sin HLS
            if (value === -1){
                setSelectedVideoTrack({
                    type:SelectedVideoTrackType.AUTO
                });

            } else {
                setSelectedVideoTrack({
                    type:SelectedVideoTrackType.INDEX,
                    value:value
                });

            }

        }
        
        if (id === CONTROL_ACTION.SPEED_RATE && typeof(value) === 'number'){
            setSpeedRate(value);
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
        
        if (id === CONTROL_ACTION.SEEK || id === CONTROL_ACTION.FORWARD || id === CONTROL_ACTION.BACKWARD){
            // Actions to invoke on player
            invokePlayerAction(refVideoPlayer, id, value, currentTime, duration);
        }

        if (id === CONTROL_ACTION.SEEK_OVER_EPG && props.onSeekOverEpg){
            const overEpgValue = props.onSeekOverEpg();
            setDvrTimeValue(overEpgValue!);
            onChangeDvrTimeValue(overEpgValue!);
            invokePlayerAction(refVideoPlayer, CONTROL_ACTION.SEEK, overEpgValue, currentTime, duration);
        }

        // Actions to be saved between flavours
        if (COMMON_DATA_FIELDS.includes(id) && props?.onChangeCommonData){
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

    const onLoad = async (e: OnLoadData) => {

        let hlsQualities;

        console.log(`[Player] (Normal Flavour) onLoad ${JSON.stringify(e)}`);

        if (!isPlayingExternalTudum && !isContentLoaded){

            // En caso de HLS, preparamos las calidades
            if (isHLS.current && props.mapHlsQualities){
                hlsQualities = await getHlsQualities(currentManifest.current?.manifestURL!);

            }

            if (!isContentLoaded){
                setIsContentLoaded(true);
            }

            if (isDVR.current){
                setDuration(dvrWindowSeconds.current);

                if (props?.isLive && props?.onChangeCommonData){
                    props.onChangeCommonData({
                        duration: dvrWindowSeconds.current
                    });
                }

            } else if (typeof(e.duration) === 'number' && e.duration && duration !== e.duration){
                setDuration(e.duration);

                if (!props?.isLive && props?.onChangeCommonData){
                    props.onChangeCommonData({
                        duration: e.duration
                    });
                }

            }

            setMenuData(mergeMenuData(e, props.languagesMapping, hlsQualities, isDASH.current));

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

        if (props?.onChangeCommonData){
            props.onChangeCommonData({
                time: e.currentTime
            });
        }

    }

    const onReadyForDisplay = () => {
        maybeChangeBufferingState(false);
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
        maybeChangeBufferingState(e?.isBuffering);
    }

    // const onError = (e: OnVideoErrorData) => {

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

            {
                videoSource.current ?
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
                            source={videoSource.current}
                            // @ts-ignore
                            drm={drm.current}
                            // @ts-ignore
                            youbora={youboraForVideo.current}
                            playOffline={props.playOffline}
                            multiSession={props.multiSession}

                            disableDisconnectError={true}
                            debug={{
                                enable: true,
                                thread: true,
                            }}

                            adTagUrl={props?.adTagUrl}
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
                            //pictureInPicture (ios)
                            playInBackground={isAirplayConnected}
                            playWhenInactive={isAirplayConnected}
                            poster={props?.poster}
                            preventsDisplaySleepDuringVideoPlayback={!isAirplayConnected}
                            progressUpdateInterval={1000}
                            selectedVideoTrack={isPlayingExternalTudum ? undefined : selectedVideoTrack}
                            selectedAudioTrack={isPlayingExternalTudum ? undefined : selectedAudioTrack}
                            selectedTextTrack={isPlayingExternalTudum || (typeof(selectedTextTrack?.value) === 'number' && selectedTextTrack?.value < 0) ? undefined : selectedTextTrack}

                            //onVolumeChange={onVolumeChange}
                            onEnd={onEnd}
                            onLoad={onLoad}
                            onProgress={onProgress}
                            onReadyForDisplay={onReadyForDisplay}
                            onReceiveAdEvent={onReceiveAdEvent}
                            onBuffer={onBuffer}
                            //onError={onError}
                        />
                    </View>
                : null
            }

            {
                isAirplayConnected ?
                    <BackgroundPoster poster={props.poster} />
                : null
            }

            {
                !isPlayingAd && !isPlayingExternalTudum ?
                    <Overlay
                        title={props?.title}
                        currentTime={currentTime}
                        duration={duration}
                        dvrTimeValue={dvrTimeValue}

                        muted={muted}
                        paused={paused}
                        preloading={preloading}
                        hasNext={props?.hasNext}
                        thumbnailsMetadata={currentManifest.current?.thumbnailMetadata}
                        timeMarkers={props.timeMarkers}

                        speedRate={speedRate}
                        videoIndex={(typeof(selectedVideoTrack?.value) === 'number') ? selectedVideoTrack?.value : -1}
                        audioIndex={props.audioIndex}
                        subtitleIndex={props.subtitleIndex}
                        menuData={menuData}

                        alwaysVisible={isAirplayConnected}
                        
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
                : null
            }

        </View>
    );

};
