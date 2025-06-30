import { Spinner } from '@ui-kitten/components';
import React, { createElement, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import BackgroundTimer from 'react-native-background-timer';
import { EventRegister } from 'react-native-event-listeners';
import { CastState, useCastState } from 'react-native-google-cast';
import Animated, { useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { AudioCastFlavour, AudioFlavour } from '../../flavours';
import { styles } from './styles';

import {
    type AudioPlayerActionEventProps,
    type AudioPlayerContentsDpo,
    type AudioPlayerEventProps,
    type AudioPlayerProps,
    type IAudioPlayerContent,
    type ICommonData,
    CONTROL_ACTION,
} from '../../types';

const PLAYER_MAX_HEIGHT = 80;



/*
 *  AudioPlayer
 *  Se inicia como barra inferior
 *
 */

export function AudioPlayer (props: AudioPlayerProps): React.ReactElement | null {

    const playerMaxHeight = useRef<number | string>(props.playerMaxHeight || PLAYER_MAX_HEIGHT);
    const audioPlayerHeight = useSharedValue(0);

    const hasBeenLoaded = useRef<boolean>(false);

    const [contentId, setContentId] = useState<IAudioPlayerContent | null>();
    const [dpoData, setDpoData] = useState<AudioPlayerContentsDpo | null>(null);

    const currentTime = useRef<number>(0);
    const duration = useRef<number>(0);
    const volume = useRef<number>();
    const isPaused = useRef<boolean>(false);
    const isMuted = useRef<boolean>(false);
    const watchingProgressIntervalObj = useRef<NodeJS.Timeout>();

    const castState = useCastState();

    useEffect(() => {

        console.log(`[Audio Player Bar] Mounted`);

        const changesAudioPlayerListener = EventRegister.addEventListener('audioPlayer', (data: AudioPlayerEventProps) => {

            if ((typeof(playerMaxHeight.current) === 'number' && audioPlayerHeight?.value < playerMaxHeight.current) || playerMaxHeight.current === 'auto'){
                // Desplegamos el player en formato de barra inferior
                setContentId({
                    current: data
                });

                showPlayer();

            } else if (audioPlayerHeight){
                // Si ya lo teníamos desplegado, cambiamos el ID/Slug del contenido
                // Para cambiar de contenido, necesitamos desmontarlo
                clearDataToChangeContents();
                setContentId({
                    next: data
                });

            }
            
        });


        const actionsAudioPlayerListener = EventRegister.addEventListener('audioPlayerAction', (data: AudioPlayerActionEventProps) => {
            
            if (data.action === CONTROL_ACTION.CLOSE_AUDIO_PLAYER){

                clearDataToChangeContents();
                setContentId({
                    current: null,
                    next: null
                });

                hidePlayer();
                
            }
            
        });

        return (() => {

            console.log(`[Audio Player Bar] Unmounted`);

            if (typeof(changesAudioPlayerListener) === 'string'){
                EventRegister.removeEventListener(changesAudioPlayerListener);
            }

            if (typeof(actionsAudioPlayerListener) === 'string'){
                EventRegister.removeEventListener(actionsAudioPlayerListener);
            }

        });

    }, []);

    useEffect(() => {

        console.log(`[Audio Player Bar] contendId ${JSON.stringify(contentId)}`);

        async function fetchDpo(){

            if (props.fetchContentData){
                try {
                    const dpo = await props.fetchContentData(contentId?.current!);

                    currentTime.current = dpo?.startPosition || 0;

                    setDpoData(dpo);

                } catch(err){

                }
                
            }

        }

        hasBeenLoaded.current = false;

        // Hack para desmontar el player y limpiar sus datos al cambiar de contenido
        if (contentId?.next){
            setContentId({
                current: contentId?.next
            });

        } else if (contentId?.current){

            // Llamamos la función externa que irá a buscar los datos del contenido solicitado
            fetchDpo();

        }

    }, [contentId]);

    React.useEffect(() => {

        console.log(`[Audio Player Bar] dpoData?.id ${dpoData?.id}`);

        // Activamos un intervalo que envia los datos del continue watching según especificaciones de servidor
        if (typeof(dpoData?.watchingProgressInterval) === 'number' && dpoData?.watchingProgressInterval > 0 && dpoData?.addContentProgress){
            watchingProgressIntervalObj.current = BackgroundTimer.setInterval(() => {

                // Evitamos mandar el watching progress en directos y en Chromecast
                if (hasBeenLoaded.current && !dpoData?.isLive){
                    // @ts-ignore
                    dpoData.addContentProgress(currentTime.current, duration.current, props.id);
                }

            }, dpoData?.watchingProgressInterval);

        }

        return () => {

            if (watchingProgressIntervalObj.current){
                BackgroundTimer.clearInterval(watchingProgressIntervalObj.current);
            }

        };

    }, [dpoData?.id]);

    const clearDataToChangeContents = () => {

        hasBeenLoaded.current = false;
        currentTime.current = 0;
        duration.current = 0;
        setDpoData(null);

    }

    const showPlayer = () => {
        // @ts-ignore
        audioPlayerHeight.value = withSpring(playerMaxHeight.current, {
            duration: 800
        });
    }

    const hidePlayer = () => {
        audioPlayerHeight.value = withTiming(0, {
            duration: 200
        });
    }

    /*
     *  Función al terminar el contenido
     *
     */

    const onEnd = () => {

        if (watchingProgressIntervalObj.current){
            BackgroundTimer.clearInterval(watchingProgressIntervalObj.current);
        }

        if (dpoData?.onEnd){
            dpoData?.onEnd();

        }

    }



    /*
     *  Función para guardar los cambios en el estado entre flavours
     * 
     */

    const changeCommonData = (data: ICommonData) => {

        if (data?.time){
            currentTime.current = data.time;
        }

        if (data?.duration){
            duration.current = data.duration;

            if (!hasBeenLoaded.current){
                hasBeenLoaded.current = true;
            }

        }

        if ((data?.time !== undefined || data?.duration !== undefined) && dpoData?.onProgress){
            dpoData?.onProgress(currentTime.current, duration.current);
        }

        if (data?.paused !== undefined){
            isPaused.current = !!data.paused;

            if (!!data.paused && dpoData?.onPause){
                dpoData?.onPause();
            } else if (dpoData?.onPlay){
                dpoData?.onPlay();
            }
        }

        if (data?.muted !== undefined){
            isMuted.current = !!data.muted;
        }

        if (typeof(data?.volume) === 'number'){
            volume.current = data.volume;
        }
        
    }

    const Loader = props.loader ? createElement(props.loader, {}) : null;

    return (
        <Animated.View style={ props.style ? [props.style, { height:audioPlayerHeight }] : {
            ...styles.container,
            height:audioPlayerHeight,
            backgroundColor: props.backgroundColor || styles.container.backgroundColor,
        }}>

            {
                (!contentId?.current || !dpoData) && audioPlayerHeight.value > 10 ?
                    Loader ||
                    <View style={styles.contents}>
                        <Spinner />
                    </View>
                : null
            }

            {
                contentId?.current && dpoData && (castState !== CastState.CONNECTING && castState !== CastState.CONNECTED)?
                    <AudioFlavour
                        id={dpoData.id}
                        title={dpoData.title}
                        subtitle={dpoData.subtitle}
                        description={dpoData.description}
                        // languagesMapping={props.languagesMapping}

                        manifests={dpoData.manifests}
                        headers={dpoData.headers}
                        poster={dpoData.poster}
                        squaredPoster={dpoData.squaredPoster}
                        youbora={dpoData.youbora}
                        hasNext={dpoData.hasNext}
                        hasPrev={dpoData.hasPrev}

                        paused={isPaused.current}
                        muted={isMuted.current}

                        playOffline={dpoData.playOffline}
                        multiSession={dpoData.multiSession}
                        isLive={dpoData.isLive}
                        showExternalTudum={dpoData.showExternalTudum}
                        forcedDvrWindowMinutes={dpoData.forcedDvrWindowMinutes}
                        // liveStartDate={props.liveStartDate}

                        currentTime={currentTime.current}

                        // Extra Data
                        extraData={dpoData.extraData}

                        // Styles
                        backgroundColor={props.backgroundColor}
                        topDividerColor={props.topDividerColor}

                        // Components
                        controls={props.controls}

                        // Utils
                        getSourceUri={dpoData.getSourceUri}
                        getYouboraOptions={dpoData.getYouboraOptions}
                        getTudumManifest={dpoData.getTudumManifest}
                        getTudumSource={dpoData.getTudumSource}

                        // Events
                        onChangeCommonData={changeCommonData}
                        onDVRChange={dpoData.onDVRChange}
                        onNext={dpoData.onNext}
                        onPrevious={dpoData.onPrevious}
                        onEnd={onEnd}
                        onClose={hidePlayer}
                        onBuffering={dpoData?.onBuffering}
                        onSeek={dpoData?.onSeek}
                        onStart={dpoData?.onStart}
                    />
                : null
            }

            {
                contentId?.current && dpoData && (castState === CastState.CONNECTING || castState === CastState.CONNECTED)?
                    <AudioCastFlavour
                        id={dpoData.id}
                        title={dpoData.title}
                        subtitle={dpoData.subtitle}
                        description={dpoData.description}
                        // languagesMapping={props.languagesMapping}

                        manifests={dpoData.manifests}
                        headers={dpoData.headers}
                        poster={dpoData.poster}
                        squaredPoster={dpoData.squaredPoster}
                        youbora={dpoData.youbora}
                        hasNext={dpoData.hasNext}
                        hasPrev={dpoData.hasPrev}

                        paused={isPaused.current}
                        muted={isMuted.current}
                        
                        isLive={dpoData.isLive}
                        forcedDvrWindowMinutes={dpoData.forcedDvrWindowMinutes}
                        // liveStartDate={props.liveStartDate}

                        currentTime={currentTime.current}

                        // Extra Data
                        extraData={dpoData.extraData}

                        // Styles
                        backgroundColor={props.backgroundColor}
                        topDividerColor={props.topDividerColor}

                        // Components
                        controls={props.controls}

                        // Utils
                        getYouboraOptions={dpoData.getYouboraOptions}
                        getTudumManifest={dpoData.getTudumManifest}
                        getTudumSource={dpoData.getTudumSource}

                        // Events
                        onChangeCommonData={changeCommonData}
                        onDVRChange={dpoData.onDVRChange}
                        onNext={dpoData.onNext}
                        onPrevious={dpoData.onPrevious}
                        onEnd={onEnd}
                        onClose={hidePlayer}
                        onBuffering={dpoData?.onBuffering}
                        onSeek={dpoData?.onSeek}
                        onStart={dpoData?.onStart}
                    />
                : null
            }

        </Animated.View>
    );

};
