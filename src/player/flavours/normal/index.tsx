import React, { useEffect, useState, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
    onAdStarted,
    mergeMenuData,
    getHlsQualities,
} from '../../utils';

import {
    invokePlayerAction
} from './actions';

import { styles } from '../styles';

import { 
    type IManifest, 
    type IMappedYoubora, 
    type IDrm,
    type IVideoSource,
    type ICommonData,
    type IPlayerMenuData,
    type ILanguagesMapping,
    type IYouboraSettingsFormat,
    type IYoubora,
    CONTROL_ACTION,
    STREAM_FORMAT_TYPE,
    YOUBORA_FORMAT
} from '../../types';

interface Props {
    id?:number;
    title?:string;
    subtitle?:string;
    description?:string;
    liveStartDate?:string;

    manifests?:Array<IManifest>,
    showExternalTudum?: boolean;
    youbora?: IYoubora;
    adTagUrl?: string;
    poster?: string;

    playOffline?: boolean;
    isLive?: boolean;
    hasNext?: boolean;

    muted?: boolean;
    volume?: number;

    currentTime?: number;
    audioIndex?: number;
    subtitleIndex?: number;
    languagesMapping?:ILanguagesMapping;

    // Components
    mosca?: React.ReactNode
    header?: React.ReactNode;

    // Utils
    getTudumManifest?: () => IManifest | undefined;
    getYouboraOptions?: (data: IYoubora, format?: IYouboraSettingsFormat) => IMappedYoubora;

    // Events
    onChangeCommonData?: (data: ICommonData) => void;
    onPress?: (id: CONTROL_ACTION, value?:any) => void;
    onNext?: () => void;
    onClose?: () => void;
}

export const NormalFlavour = (props: Props) => {

    const [isPlayingAd, setIsPlayingAd] = useState<boolean>(false);
    const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
    const isAirplayConnected = useAirplayConnectivity();
    const insets = useSafeAreaInsets();

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
    const [isPlayingExternalTudum, setIsPlayingExternalTudum] = useState<boolean>(!!props.showExternalTudum);
    const [menuData, setMenuData] = useState<Array<IPlayerMenuData>>();

    const [speedRate, setSpeedRate] = useState<number>(1);
    const [selectedAudioTrack, setSelectedAudioTrack] = useState<SelectedTrack>();
    const [selectedTextTrack, setSelectedTextTrack] = useState<SelectedTrack>();
    const [selectedVideoTrack, setSelectedVideoTrack] = useState<SelectedVideoTrack>({
        type:SelectedVideoTrackType.AUTO
    });

    const refVideoPlayer = useRef<VideoRef>(null);

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
        setSelectedAudioTrack({
            value:props.audioIndex,
            type:SelectedTrackType.INDEX
        });

    }, [props.audioIndex]);

    useEffect(() => {
        // Montamos el selector de pista de Subtítulo
        setSelectedTextTrack({
            value:props.subtitleIndex,
            type:SelectedTrackType.INDEX
        });

    }, [props.subtitleIndex]);

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
                type: videoSource.current.type
            };

            setSelectedVideoTrack({
                type:SelectedVideoTrackType.INDEX,
                value:index
            });

        }

    }

    const onControlsPress = (id: CONTROL_ACTION, value?:number | boolean) => {

        const COMMON_DATA_FIELDS = ['time', 'volume', 'mute', 'audioIndex', 'subtitleIndex'];

        console.log(`[Player] (Normal Flavour) onControlsPress: ${id} (${value})`);

        // State Actions
        if (id === CONTROL_ACTION.PAUSE){
            setPaused(!!value);

        } else if (id === CONTROL_ACTION.MUTE){
            setMuted(!!value);

        
        } else if (id === CONTROL_ACTION.NEXT){
            if (props.onNext){
                props.onNext();
            }

        } else if (isHLS.current && id === CONTROL_ACTION.VIDEO_INDEX && typeof(value) === 'number'){
            // Cambio de calidad con HLS
            changeHlsVideoQuality(value);

        } else if (id === CONTROL_ACTION.VIDEO_INDEX && typeof(value) === 'number'){
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

        } else if (id === CONTROL_ACTION.SPEED_RATE && typeof(value) === 'number'){
            setSpeedRate(value);

        // Actions to invoke on player
        } else {

            // Guardamos el estado de la barra de tiempo en DVR
            if (id === CONTROL_ACTION.SEEK && isDVR.current && typeof(value) === 'number'){
                setDvrTimeValue(value);
            }

            invokePlayerAction(refVideoPlayer, id, value, currentTime);

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
                
            }
            
            props.onChangeCommonData(data);

        }

    }

    const onLoad = async (e: OnLoadData) => {

        let hlsQualities;

        console.log(`[Player] (Normal Flavour) onLoad ${JSON.stringify(e)}`);

        if (!isPlayingExternalTudum && !isContentLoaded){

            // En caso de HLS, preparamos las calidades
            if (isHLS.current){
                hlsQualities = await getHlsQualities(currentManifest.current?.manifestURL!);

            }

            if (!isContentLoaded){
                setIsContentLoaded(true);
            }

            if (isDVR.current){
                setDuration(dvrWindowSeconds.current);

            } else if (typeof(e.duration) === 'number' && e.duration && duration !== e.duration){
                setDuration(e.duration);

            }

            // La primera vez, nos movemos al punto donde lo habíamos dejado
            if (!isDVR.current && currentTime > 0){
                onControlsPress(CONTROL_ACTION.SEEK, currentTime);
            }

            setMenuData(mergeMenuData(e, props.languagesMapping, hlsQualities));

        }

    }

    const onEnd = () => {

        if (isPlayingExternalTudum){
            // Acaba la reproducción del Tudum externo
            setPlayerSource();
            setIsPlayingExternalTudum(false);

        } else {
            // Termina el contenido

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

    // const onSlidingStart = (value: number) => {

    // }

    // const onSlidingMove = (value: number) => {

    // }

    // const onSlidingComplete = (value: number) => {

    // }

    return (
        <View style={styles.container}>

            {
                videoSource.current ?
                    <View style={{
                        ...styles.playerWrapper,
                        //paddingTop:insets.top,
                        paddingHorizontal:Math.max(insets.left, insets.right),
                        //paddingBottom:insets.bottom
                    }}>
                        <Video
                            // @ts-ignore
                            ref={refVideoPlayer}
                            style={styles.player}
                            // @ts-ignore
                            source={videoSource.current}
                            // @ts-ignore
                            drm={drm.current}
                            // @ts-ignore
                            youbora={youboraForVideo.current}
                            playOffline={props.playOffline}

                            adTagUrl={props?.adTagUrl}
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
                            playInBackground={isAirplayConnected}
                            playWhenInactive={isAirplayConnected}
                            poster={props?.poster}
                            preventsDisplaySleepDuringVideoPlayback={!isAirplayConnected}
                            progressUpdateInterval={1000}
                            selectedVideoTrack={isPlayingExternalTudum || isHLS.current ? undefined : selectedVideoTrack}
                            selectedAudioTrack={isPlayingExternalTudum || isHLS.current ? undefined : selectedAudioTrack}
                            selectedTextTrack={isPlayingExternalTudum || isHLS.current ? undefined : selectedTextTrack}

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
                        controlsHeader={props.header}

                        // Events
                        onPress={onControlsPress}
                        // onSlidingStart={onSlidingStart}
                        // onSlidingMove={onSlidingMove}
                        // onSlidingComplete={onSlidingComplete}
                    />
                : null
            }

        </View>
    );

};
