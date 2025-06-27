import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useAirplayConnectivity } from 'react-airplay';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
    SelectedVideoTrackType,
    DVR_PLAYBACK_TYPE
} from '../../../types';
import Video, { type VideoRef } from '../../../Video';
import { Overlay } from '../../overlay';
const BackgroundPoster = React.lazy(() => import('../../components/poster'));

import {
    useIsLandscape
} from '../common/hooks';

import {
    useIsBuffering
} from '../../modules/buffer';

import {
    mergeMenuData,
    onAdStarted,
    subtractMinutesFromDate
} from '../../utils';

import {
    type onSourceChangedProps,
    SourceClass
} from '../../modules/source';

import {
    TudumClass
} from '../../modules/tudum';

import {
    handleDvrPausedDatum,
    useDvrPausedSeconds,
    DVRProgressManager,
    type SeekableRange,
    type Program,
    type SliderValues,
    type ProgramChangeData,
    type ModeChangeData,
    type ProgressUpdateData,
    type UpdatePlayerData,
    type DVRProgressManagerData
} from '../../modules/dvr';

import {
    invokePlayerAction
} from '../actions/player';

import { styles } from '../styles';

import {
    type ICommonData,
    type IDrm,
    type IMappedYoubora,
    type IPlayerMenuData,
    type IVideoSource,
    type NormalFlavourProps,
    CONTROL_ACTION,
    PLAYER_MENU_DATA_TYPE,
    YOUBORA_FORMAT
} from '../../types';

export function NormalFlavour (props: NormalFlavourProps): React.ReactElement {

    const [isPlayingAd, setIsPlayingAd] = useState<boolean>(false);
    const [isContentLoaded, setIsContentLoaded] = useState<boolean>(false);
    
    const insets = useSafeAreaInsets();

    const youboraForVideo = useRef<IMappedYoubora>();
    const drm = useRef<IDrm>();
    const [videoSource, setVideoSource] = useState<IVideoSource | undefined>(undefined);

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
    const [buffering, setBuffering] = useState<boolean>(false);
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

    // Source
    const sourceRef = useRef<SourceClass | null>(null);

    // Tudum
    const tudumRef = useRef<TudumClass | null>(null);

    // DVR Progress Manager
    const dvrProgressManagerRef = useRef<DVRProgressManager | null>(null);

    // Hook para la orientación de la pantalla
    const isLandscapePlayer = useIsLandscape();

    // Hook para el estado de Airplay
    const isAirplayConnected = useAirplayConnectivity();

    // Hook para el estado de buffering
    const isBuffering = useIsBuffering({
        buffering: buffering,
        paused: paused,
        onBufferingChange: props.onBuffering
    });

    useEffect(() => {
        console.log(`[Player] (Normal Flavour) useEffect videoSource ${JSON.stringify(videoSource)}`);

    }, [videoSource?.uri]);

    useEffect(() => {
        console.log(`[Player] (Normal Flavour) useEffect manifests ${JSON.stringify(props.manifests)}`);

        if (!tudumRef.current){
            tudumRef.current = new TudumClass({
                enabled:!!props.showExternalTudum,
                getTudumManifest:props.getTudumManifest
            });
        }

        if (!sourceRef.current){
            sourceRef.current = new SourceClass({
                // Metadata
                id:props.id,
                title:props.title,
                subtitle:props.subtitle,
                description:props.description,
                poster:props.poster,
                squaredPoster:props.squaredPoster,
        
                // Main Source
                manifests:props.manifests,
                startPosition:props.currentTime,
                headers:props.headers,
        
                // Callbacks
                getSourceUri:props.getSourceUri,
                onSourceChanged:onSourceChanged
            });
        }

        if (tudumRef.current?.isReady){
            // Montamos el Source para el player
            drm.current = tudumRef.current?.drm;
            setVideoSource(tudumRef.current?.source);

        } else {
            isChangingSource.current = true;
            
            sourceRef.current.changeSource({
                manifests:props.manifests,
                startPosition:props.currentTime,
                isLive:props.isLive,
                headers:props.headers,
                title:props.title,
                subtitle:props.subtitle,
                description:props.description,
                poster:props.poster,
                squaredPoster:props.squaredPoster
            });

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

    // Source Cooking
    const onSourceChanged = (data:onSourceChangedProps) => {
        console.log(`[Player] (Normal Flavour) onSourceChanged`);

        if (!tudumRef.current?.isPlaying){
            // No estamos reproduciendo el Tudum externo
            setBuffering(true);

            // Preparamos los datos de Youbora
            if (props.getYouboraOptions){
                youboraForVideo.current = props.getYouboraOptions(props.youbora!, YOUBORA_FORMAT.MOBILE);

            }

            if (dvrProgressManagerRef.current){
                // Si teniamos un DVR Progress Manager, lo eliminamos
                dvrProgressManagerRef.current = null;
            }

            if (sourceRef.current?.isDVR && !dvrProgressManagerRef.current){
                // El nuevo contenido es DVR, creamos un nuevo DVR Progress Manager
                dvrProgressManagerRef.current = new DVRProgressManager({
                    dvrWindowSeconds: data.dvrWindowSeconds,
                    currentTime: currentTime,
                    isPaused: paused,
                    isBuffering: isBuffering,
                    playbackType: props.moduleDVR?.playbackType || DVR_PLAYBACK_TYPE.WINDOW,
                
                    // EPG Provider
                    getEPGProgramAt: props.moduleDVR?.getEPGProgramAt,
                    getEPGNextProgram: props.moduleDVR?.getEPGNextProgram,
                
                    // Callbacks
                    // onModeChange?: (data:ModeChangeData) => void;
                    // onProgramChange?: (data:ProgramChangeData) => void;
                    // onProgressUpdate?: (data:ProgressUpdateData) => void;
                    // onSeekRequest?: (playerTime:number) => void;
                });
            }

            setPlayerSource(data);

        }
        
    };
    
    const setPlayerSource = (data?:onSourceChangedProps) => {
        console.log(`[Player] (Normal Flavour) setPlayerSource (data isReady ${!!data?.isReady})`);
        console.log(`[Player] (Normal Flavour) setPlayerSource (sourceRef isReady ${!!sourceRef.current?.isReady})`);

        if (data && data?.isReady){
            setBuffering(true);
            drm.current = data.drm;

            // Preparamos los datos de Youbora
            if (props.getYouboraOptions){
                youboraForVideo.current = props.getYouboraOptions(props.youbora!, YOUBORA_FORMAT.MOBILE);
            }

            setVideoSource(data.source!);
        }

        if (!data && sourceRef.current?.isReady){
            setBuffering(true);
            drm.current = sourceRef.current.playerSourceDrm;

            // Preparamos los datos de Youbora
            if (props.getYouboraOptions){
                youboraForVideo.current = props.getYouboraOptions(props.youbora!, YOUBORA_FORMAT.MOBILE);
            }

            setVideoSource(sourceRef.current.playerSource!);
        }

        /*

        // Preparamos la uri por si necesitamos incorporar el start en el dvr
        if (props.getSourceUri){
            uri = props.getSourceUri(currentManifest.current!, currentManifest.current?.dvr_window_minutes, liveStartProgramTimestamp.current);

        } else {
            uri = getVideoSourceUri(currentManifest.current!, currentManifest.current?.dvr_window_minutes, liveStartProgramTimestamp.current);
            
        }

        */

    }

    // Functions
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
        
        if (id === CONTROL_ACTION.LIVE_START_PROGRAM && sourceRef.current?.isDVR){
            
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
        
        if (sourceRef.current?.isHLS && id === CONTROL_ACTION.VIDEO_INDEX && typeof(value) === 'number'){
            // Cambio de calidad con HLS
            if (value === -1){
                videoQualityIndex.current = -1;
                setMaxBitRate(0);

            } else {
                videoQualityIndex.current = value;
                setMaxBitRate(value);
            }
            
        }
        
        if (!sourceRef.current?.isHLS && id === CONTROL_ACTION.VIDEO_INDEX && typeof(value) === 'number'){
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

        if (id === CONTROL_ACTION.SEEK && sourceRef.current?.isDVR && typeof(value) === 'number' && typeof(seekableRange.current) === 'number'){
            // Guardamos el estado de la barra de tiempo en DVR
            setDvrTimeValue(value);
            onChangeDvrTimeValue(value);
            if (typeof(duration) === 'number' && value >= duration){
                setHasSeekOverDRV(false);
            }
        }

        if (id === CONTROL_ACTION.LIVE && sourceRef.current?.isDVR && typeof(duration) === 'number' && typeof(seekableRange.current) === 'number'){
            // Volver al directo en DVR

            // Si tenemos un timestamp de inicio de programa, lo eliminamos y refrescamos el source con la ventana original
            if (typeof(liveStartProgramTimestamp.current) === 'number' && liveStartProgramTimestamp.current > 0){
                isChangingSource.current = true;
                liveStartProgramTimestamp.current = undefined;
                setIsContentLoaded(false);

                setDvrTimeValue(sourceRef.current?.currentManifest?.dvr_window_minutes);
                onChangeDvrTimeValue(sourceRef.current?.currentManifest?.dvr_window_minutes!);
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

        if (id === CONTROL_ACTION.FORWARD && sourceRef.current?.isDVR && typeof(value) === 'number' && typeof(dvrTimeValue) === 'number' && typeof(duration) === 'number' && typeof(seekableRange.current) === 'number'){

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

        if (id === CONTROL_ACTION.BACKWARD && sourceRef.current?.isDVR && typeof(value) === 'number' && typeof(dvrTimeValue) === 'number'){
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

        if (!tudumRef.current?.isPlaying && !isContentLoaded){

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

            console.log(`[Player] (Normal Flavour) onLoad -> isDVR ${sourceRef.current?.isDVR}`);
            if (sourceRef.current?.isDVR){
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
                setMenuData(props.mergeMenuData(e, props.languagesMapping, sourceRef.current?.isDASH));

            } else {
                setMenuData(mergeMenuData(e, props.languagesMapping, sourceRef.current?.isDASH));

            }

        }

    }

    const onEnd = () => {
        console.log(`[Player] (Normal Flavour) onEnd`);
        if (tudumRef.current?.isPlaying){
            // Acaba la reproducción del Tudum externo
            isChangingSource.current = true;
            tudumRef.current.isPlaying = false;
            setPlayerSource();

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

        if (dvrProgressManagerRef.current){
            dvrProgressManagerRef.current.updatePlayerData({
                currentTime: e.currentTime,
                seekableRange: {
                    start: 0,
                    end: seekableRange.current || 0
                },
                isBuffering: buffering,
                isPaused: paused
            });
        }

        if (props?.onChangeCommonData){
            props.onChangeCommonData({
                time: e.currentTime
            });
        }

    }

    const onReadyForDisplay = () => {
        setBuffering(false);
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
        setBuffering(!!e?.isBuffering);

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
                videoSource ?
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
                            source={videoSource}
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
                            selectedVideoTrack={tudumRef.current?.isPlaying ? undefined : selectedVideoTrack}
                            selectedAudioTrack={tudumRef.current?.isPlaying ? undefined : selectedAudioTrack}
                            selectedTextTrack={tudumRef.current?.isPlaying || (typeof(selectedTextTrack?.value) === 'number' && selectedTextTrack?.value < 0) ? undefined : selectedTextTrack}
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
                !isPlayingAd && !tudumRef.current?.isPlaying ?
                    <Overlay
                        title={props?.title}
                        currentTime={currentTime}
                        duration={duration}
                        dvrTimeValue={dvrTimeValue}

                        muted={muted}
                        paused={paused}
                        preloading={isBuffering}
                        hasNext={props?.hasNext}
                        thumbnailsMetadata={sourceRef.current?.currentManifest?.thumbnailMetadata}
                        timeMarkers={props.timeMarkers}
                        avoidTimelineThumbnails={props.avoidTimelineThumbnails}

                        speedRate={speedRate}
                        videoIndex={videoQualityIndex.current}
                        audioIndex={props.audioIndex}
                        subtitleIndex={props.subtitleIndex}
                        menuData={menuData}

                        alwaysVisible={isAirplayConnected}
                        
                        isLive={props?.isLive}
                        isDVR={sourceRef.current?.isDVR}
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
