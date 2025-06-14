import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useAirplayConnectivity } from 'react-airplay';
import { useWindowDimensions, View } from 'react-native';
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    type OnBufferData,
    //type OnVideoErrorData,
    type OnLoadData,
    type OnProgressData,
    type OnReceiveAdEventData,
    type SelectedTrack,
    type SelectedVideoTrack,
    SelectedTrackType,
    //type OnVolumeChangeData,
    SelectedVideoTrackType
} from '../../../types';
import Video, { type VideoRef } from '../../../Video';
import { Overlay } from '../../overlay';
const BackgroundPoster = React.lazy(() => import('../../components/poster'));

import {
    getBestManifest,
    getDRM,
    getManifestSourceType,
    getMinutesFromTimestamp,
    getMinutesSinceStart,
    getVideoSourceUri,
    mergeMenuData,
    onAdStarted,
    subtractMinutesFromDate,
    useDvrPausedSeconds
} from '../../utils';

import {
    invokePlayerAction
} from '../actions/player';

import { styles } from '../styles';

import {
    type ICommonData,
    type IDrm,
    type IManifest,
    type IMappedYoubora,
    type IPlayerMenuData,
    type IVideoSource,
    type NormalFlavourProps,
    CONTROL_ACTION,
    PLAYER_MENU_DATA_TYPE,
    STREAM_FORMAT_TYPE,
    YOUBORA_FORMAT
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
    const seekableRange = useRef<number>();
    const liveStartProgramTimestamp = useRef<number>();
    const needsLiveInitialSeek = useRef<boolean>(false);
    const isChangingSource = useRef<boolean>(true);

    const [currentTime, setCurrentTime] = useState<number>(props.currentTime!);
    const [duration, setDuration] = useState<number>();
    const [dvrTimeValue, setDvrTimeValue] = useState<number>();
    const [paused, setPaused] = useState<boolean>(!!props.paused);
    const [muted, setMuted] = useState<boolean>(!!props?.muted);
    const [preloading, setPreloading] = useState<boolean>(false);
    const [isPlayingExternalTudum, setIsPlayingExternalTudum] = useState<boolean>(!!props.showExternalTudum);
    const [menuData, setMenuData] = useState<Array<IPlayerMenuData>>();
    const [hasSeekOverDRV, setHasSeekOverDRV] = useState<boolean>(false);

    const [speedRate, setSpeedRate] = useState<number>(1);
    const [selectedAudioTrack, setSelectedAudioTrack] = useState<SelectedTrack>();
    const [selectedTextTrack, setSelectedTextTrack] = useState<SelectedTrack>();
    const [selectedVideoTrack, setSelectedVideoTrack] = useState<SelectedVideoTrack>({
        type:SelectedVideoTrackType.AUTO
    });
    const [maxBitRate, setMaxBitRate] = useState<number>(0);

    const refVideoPlayer = useRef<VideoRef>(null);
    const videoQualityIndex = useRef<number>(-1);

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
            isChangingSource.current = true;
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

        if (typeof(dvrTimeValue) === 'number' && dvrPaused?.pausedDatum > 0 && dvrPaused?.pausedSeconds > 0){
            const moveDVRto = dvrTimeValue - dvrPaused.pausedSeconds;

            // Revisaremos si hay que hacer crecer la ventana de tiempo del directo
            if (typeof(dvrWindowSeconds.current) === 'number'){
                dvrWindowSeconds.current = dvrWindowSeconds.current + dvrPaused.pausedSeconds;
                setDuration(dvrWindowSeconds.current);

                if (props?.isLive && props?.onChangeCommonData){
                    props.onChangeCommonData({
                        duration: dvrWindowSeconds.current
                    });
                }
            }

            // Si nos detenemos tras volver al inicio de un programa en DVR, seguiremos viendo como nos alejamos del directo
            setDvrTimeValue(moveDVRto);
        }

    }, [dvrPaused?.pausedDatum]);

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

        let uri = "",
            startPosition;

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
            needsLiveInitialSeek.current = false;

            if (typeof(liveStartProgramTimestamp.current) === 'number' && liveStartProgramTimestamp.current > 0){
                const minutes = getMinutesFromTimestamp(liveStartProgramTimestamp.current);

                console.log(`[Player] (Normal Flavour) setPlayerSource -> liveStartProgramTimestamp minutes ${minutes}`);

                // Revisamos que la ventana de DVR no sea inferior que el timestamp de inicio del programa
                // Por ahora no lo hacemos, ya que el valor de la ventana de DVR es el que viene del manifest mientras que el stream tiene una ventana mucho mayor
                // if (minutes < currentManifest.current?.dvr_window_minutes){
                    // Adecuamos el valor de la ventana de DVR, para la barra de progreso y los calculos de DVR
                    dvrWindowSeconds.current = minutes * 60;
                    setDvrTimeValue(0);
                    needsLiveInitialSeek.current = true;
                // }

            } else {
                dvrWindowSeconds.current = currentManifest.current?.dvr_window_minutes * 60;
                setDvrTimeValue(dvrWindowSeconds.current);
            }
        }

        // Preparamos la uri por si necesitamos incorporar el start en el dvr
        if (props.getSourceUri){
            uri = props.getSourceUri(currentManifest.current!, currentManifest.current?.dvr_window_minutes, liveStartProgramTimestamp.current);

        } else {
            uri = getVideoSourceUri(currentManifest.current!, currentManifest.current?.dvr_window_minutes, liveStartProgramTimestamp.current);
            
        }

        // Recalculamos la ventana de tiempo para el slider en DVR
        if (typeof(currentManifest.current?.dvr_window_minutes) === 'number' && currentManifest.current?.dvr_window_minutes > 0 && !liveStartProgramTimestamp.current){
            const dvrRecalculatedMinutes = getMinutesSinceStart(uri);

            if (dvrRecalculatedMinutes){
                dvrWindowSeconds.current = dvrRecalculatedMinutes * 60;
                setDvrTimeValue(dvrWindowSeconds.current);
                startPosition = ((dvrRecalculatedMinutes * 60) + 600) * 1000;
            }
        }

        if (!isDVR.current && currentTime > 0){
            startPosition = currentTime * 1000;

        }

        console.log(`[Player] (Normal Flavour) setPlayerSource startPosition: ${startPosition}`);

        // Montamos el Source para el player
        videoSource.current = {
            id: props.id,
            title: props.title,
            uri: uri,
            type: getManifestSourceType(currentManifest.current!),
            startPosition: startPosition || undefined,
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

            if (props.onBuffering){
                props.onBuffering(newIsBuffering);
            }

        }

    }

    const onControlsPress = (id: CONTROL_ACTION, value?:number | boolean) => {

        const COMMON_DATA_FIELDS = ['time', 'volume', 'mute', 'pause', 'audioIndex', 'subtitleIndex'];

        console.log(`[Player] (Normal Flavour) onControlsPress: ${id} -> ${value} (${currentTime}/${duration}) Seekable ${seekableRange.current}`);

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
        
        if (id === CONTROL_ACTION.LIVE_START_PROGRAM && isDVR.current){
            
            const timestamp = props.onLiveStartProgram?.();
            
            if (typeof(timestamp) === 'number'){
                isChangingSource.current = true;
                liveStartProgramTimestamp.current = timestamp;
                setIsContentLoaded(false);
                setDvrTimeValue(0);
                setHasSeekOverDRV(false);
                setPlayerSource();
            }
            
        }
        
        if (isHLS.current && id === CONTROL_ACTION.VIDEO_INDEX && typeof(value) === 'number'){
            // Cambio de calidad con HLS
            if (value === -1){
                videoQualityIndex.current = -1;
                setMaxBitRate(0);

            } else {
                videoQualityIndex.current = value;
                setMaxBitRate(value);
            }
            
        }
        
        if (!isHLS.current && id === CONTROL_ACTION.VIDEO_INDEX && typeof(value) === 'number'){
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

        if (id === CONTROL_ACTION.SEEK && isDVR.current && typeof(value) === 'number' && typeof(seekableRange.current) === 'number'){
            // Guardamos el estado de la barra de tiempo en DVR
            setDvrTimeValue(value);
            onChangeDvrTimeValue(value);
            if (typeof(duration) === 'number' && value >= duration){
                setHasSeekOverDRV(false);
            }
        }

        if (id === CONTROL_ACTION.LIVE && isDVR.current && typeof(duration) === 'number' && typeof(seekableRange.current) === 'number'){
            // Volver al directo en DVR

            // Si tenemos un timestamp de inicio de programa, lo eliminamos y refrescamos el source con la ventana original
            if (typeof(liveStartProgramTimestamp.current) === 'number' && liveStartProgramTimestamp.current > 0){
                isChangingSource.current = true;
                liveStartProgramTimestamp.current = undefined;
                setIsContentLoaded(false);

                setDvrTimeValue(currentManifest.current?.dvr_window_minutes);
                onChangeDvrTimeValue(currentManifest.current?.dvr_window_minutes!);
                setHasSeekOverDRV(false);
                setPlayerSource();

            } else {
                setDvrTimeValue(duration);
                onChangeDvrTimeValue(duration);

                if (typeof(duration) === 'number'){
                    setHasSeekOverDRV(false);
                }

                invokePlayerAction(refVideoPlayer, CONTROL_ACTION.SEEK, seekableRange.current, currentTime, duration, seekableRange.current, props.onSeek);

            }

        }

        if (id === CONTROL_ACTION.FORWARD && isDVR.current && typeof(value) === 'number' && typeof(dvrTimeValue) === 'number' && typeof(duration) === 'number' && typeof(seekableRange.current) === 'number'){

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
        
        if (id === CONTROL_ACTION.SEEK || id === CONTROL_ACTION.FORWARD || id === CONTROL_ACTION.BACKWARD){
            // Actions to invoke on player
            invokePlayerAction(refVideoPlayer, id, value, currentTime, duration, seekableRange.current, props.onSeek);
        }

        if (id === CONTROL_ACTION.SEEK_OVER_EPG && props.onSeekOverEpg){
            setHasSeekOverDRV(true);
            const overEpgValue = props.onSeekOverEpg();
            let realSeek = overEpgValue;

            if (typeof(duration) === 'number' && typeof(seekableRange.current) === 'number'){
                realSeek = overEpgValue! + (seekableRange.current - duration);
            }

            setDvrTimeValue(overEpgValue!);
            onChangeDvrTimeValue(overEpgValue!);
            invokePlayerAction(refVideoPlayer, CONTROL_ACTION.SEEK, realSeek, currentTime, duration, seekableRange.current, props.onSeek);
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
                data.audioLabel = menuData?.find(item => item.type === PLAYER_MENU_DATA_TYPE.AUDIO && item.index === value)?.label;
                data.subtitleLabel = menuData?.find(item => item.type === PLAYER_MENU_DATA_TYPE.TEXT && item.index === value)?.label;
                
            }
            
            props.onChangeCommonData(data);

        }

    }

    const onLoad = async (e: OnLoadData) => {

        console.log(`[Player] (Normal Flavour) onLoad ${JSON.stringify(e)}`);

        if (!isPlayingExternalTudum && !isContentLoaded){

            if (!isContentLoaded){
                setIsContentLoaded(true);

                if (needsLiveInitialSeek.current){
                    // Al ir al inicio de un programa, debemos hacer seek para no ir al edge live
                    invokePlayerAction(refVideoPlayer, CONTROL_ACTION.SEEK, 0, currentTime);
                }

                isChangingSource.current = false;

                if (props.onStart){
                    props.onStart();
                }
            }

            console.log(`[Player] (Normal Flavour) onLoad -> isDVR ${isDVR.current}`);
            if (isDVR.current){
                console.log(`[Player] (Normal Flavour) onLoad -> setDuration ${dvrWindowSeconds.current}`);
                setDuration(dvrWindowSeconds.current);

                if (props?.isLive && props?.onChangeCommonData){
                    props.onChangeCommonData({
                        duration: dvrWindowSeconds.current
                    });
                }

            } else if (typeof(e.duration) === 'number' && e.duration && duration !== e.duration){
                console.log(`[Player] (Normal Flavour) onLoad -> B. setDuration ${e.duration}`);
                setDuration(e.duration);

                if (!props?.isLive && props?.onChangeCommonData){
                    props.onChangeCommonData({
                        duration: e.duration
                    });
                }

            }

            if (props.mergeMenuData && typeof(props.mergeMenuData) === 'function'){
                setMenuData(props.mergeMenuData(e, props.languagesMapping, isDASH.current));

            } else {
                setMenuData(mergeMenuData(e, props.languagesMapping, isDASH.current));

            }

        }

    }

    const onEnd = () => {

        if (isPlayingExternalTudum){
            // Acaba la reproducción del Tudum externo
            isChangingSource.current = true;
            setPlayerSource();
            setIsPlayingExternalTudum(false);

        } else if (props.onEnd){
            // Termina el contenido
            props.onEnd();
            
        }

    }

    const onProgress = (e: OnProgressData) => {

        if (typeof(e.currentTime) === 'number' && currentTime !== e.currentTime){
            setCurrentTime(e.currentTime);
        }

        if (typeof(e.seekableDuration) === 'number' && seekableRange.current !== e.seekableDuration){
            seekableRange.current = e.seekableDuration;
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
                            maxBitRate={maxBitRate}
                            //pictureInPicture (ios)
                            playInBackground={isAirplayConnected}
                            playWhenInactive={isAirplayConnected}
                            poster={props?.poster}
                            preventsDisplaySleepDuringVideoPlayback={!isAirplayConnected}
                            progressUpdateInterval={1000}
                            selectedVideoTrack={isPlayingExternalTudum ? undefined : selectedVideoTrack}
                            selectedAudioTrack={isPlayingExternalTudum ? undefined : selectedAudioTrack}
                            selectedTextTrack={isPlayingExternalTudum || (typeof(selectedTextTrack?.value) === 'number' && selectedTextTrack?.value < 0) ? undefined : selectedTextTrack}
                            subtitleStyle={props.subtitleStyle}

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
                    <Suspense fallback={props.loader}>
                        <BackgroundPoster poster={props.poster} />
                    </Suspense>
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
                        avoidTimelineThumbnails={props.avoidTimelineThumbnails}

                        speedRate={speedRate}
                        videoIndex={videoQualityIndex.current}
                        audioIndex={props.audioIndex}
                        subtitleIndex={props.subtitleIndex}
                        menuData={menuData}

                        alwaysVisible={isAirplayConnected}
                        
                        isLive={props?.isLive}
                        isDVR={isDVR.current}
                        isDVRStart={hasSeekOverDRV}
                        isContentLoaded={isContentLoaded}
                        isChangingSource={isChangingSource.current}

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
                : null
            }

        </View>
    );

};

export default NormalFlavour;
