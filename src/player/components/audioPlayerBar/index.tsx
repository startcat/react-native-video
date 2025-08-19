import { Spinner } from '@ui-kitten/components';
import React, { createElement, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import BackgroundTimer from 'react-native-background-timer';
import { EventRegister } from 'react-native-event-listeners';
import { CastState as NativeCastState, useCastState as useNativeCastState } from 'react-native-google-cast';
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
    CONTROL_ACTION
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

    const watchingProgressIntervalObj = useRef<ReturnType<typeof setTimeout>>();

    const nativeCastState = useNativeCastState();

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

                    if (dpo?.playerProgress){
                        dpo.playerProgress.currentTime = dpo?.initialState?.startPosition || 0;
                    }

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

        console.log(`[Audio Player Bar] dpoData?.playerMetadata?.id ${dpoData?.playerMetadata?.id}`);

        // Activamos un intervalo que envia los datos del continue watching según especificaciones de servidor
        if (typeof(dpoData?.hooks?.watchingProgressInterval) === 'number' && dpoData?.hooks?.watchingProgressInterval > 0 && dpoData?.hooks?.addContentProgress){
            watchingProgressIntervalObj.current = BackgroundTimer.setInterval(() => {

                // Evitamos mandar el watching progress en directos y en Chromecast
                if (hasBeenLoaded.current && !dpoData?.isLive){
                    // @ts-ignore
                    dpoData.hooks?.addContentProgress(dpoData.playerProgress?.currentTime, dpoData.playerProgress?.duration, props.id);
                }

            }, dpoData?.hooks?.watchingProgressInterval);

        }

        return () => {

            if (watchingProgressIntervalObj.current){
                BackgroundTimer.clearInterval(watchingProgressIntervalObj.current);
            }

        };

    }, [dpoData?.playerMetadata?.id]);

    const clearDataToChangeContents = () => {

        hasBeenLoaded.current = false;
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

        if (dpoData?.events?.onEnd){
            dpoData?.events?.onEnd();

        }

    }



    /*
     *  Función para guardar los cambios en el estado entre flavours
     * 
     */

    const changeCommonData = (data: ICommonData) => {

        if (data?.time && dpoData?.playerProgress){
            dpoData.playerProgress.currentTime = data.time;
        }

        if (data?.duration && dpoData?.playerProgress){
            dpoData.playerProgress.duration = data.duration;

            if (!hasBeenLoaded.current){
                hasBeenLoaded.current = true;
            }

        }

        if ((data?.time !== undefined || data?.duration !== undefined) && dpoData?.events?.onProgress){
            dpoData?.events?.onProgress(dpoData.playerProgress.currentTime, dpoData.playerProgress.duration);
        }

        if (data?.paused !== undefined){
            dpoData.playerProgress.isPaused = !!data.paused;

            if (!!data.paused && dpoData?.events?.onPause){
                dpoData?.events?.onPause();
            } else if (dpoData?.events?.onPlay){
                dpoData?.events?.onPlay();
            }
        }

        if (data?.muted !== undefined){
            dpoData.playerProgress.isMuted = !!data.muted;
        }

        if (typeof(data?.volume) === 'number'){
            dpoData.playerProgress.volume = data.volume;
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
                contentId?.current && dpoData && (nativeCastState !== NativeCastState.CONNECTING && nativeCastState !== NativeCastState.CONNECTED)?
                    <AudioFlavour
                        manifests={dpoData.manifests}
                        headers={dpoData.headers}
                        playOffline={dpoData.playOffline}
                        showExternalTudum={dpoData.showExternalTudum}

                        // Extra Data
                        extraData={dpoData.extraData}

                        // Styles
                        backgroundColor={props.backgroundColor}
                        topDividerColor={props.topDividerColor}

                        // Initial State
                        initialState={dpoData.initialState}

                        // Nuevas Props Agrupadas
                        playerProgress={dpoData.playerProgress}
                        playerMetadata={dpoData.playerMetadata}
                        playerAnalytics={dpoData.playerAnalytics}
                        playerTimeMarkers={dpoData.playerTimeMarkers}
                        playerAds={dpoData.playerAds}

                        // Components
                        controls={props.controls}

                        // Hooks
                        hooks={dpoData.hooks}

                        // Events
                        events={{
                            ...dpoData.events,
                            onChangeCommonData: changeCommonData,
                            onEnd: onEnd,
                            onClose: hidePlayer,
                        }}

                        // Player Features
                        features={dpoData.features}
                    />
                : null
            }

            {
                contentId?.current && dpoData && (nativeCastState === NativeCastState.CONNECTING || nativeCastState === NativeCastState.CONNECTED)?
                    <AudioCastFlavour
                        manifests={dpoData.manifests}
                        headers={dpoData.headers}

                        // Extra Data
                        extraData={dpoData.extraData}

                        // Styles
                        backgroundColor={props.backgroundColor}
                        topDividerColor={props.topDividerColor}

                        // Initial State
                        initialState={dpoData.initialState}

                        // Nuevas Props Agrupadas
                        playerProgress={dpoData.playerProgress}
                        playerMetadata={dpoData.playerMetadata}
                        playerAnalytics={dpoData.playerAnalytics}
                        playerTimeMarkers={dpoData.playerTimeMarkers}
                        playerAds={dpoData.playerAds}

                        // Components
                        controls={props.controls}

                        // Hooks
                        hooks={dpoData.hooks}

                        // Events
                        events={{
                            ...dpoData.events,
                            onChangeCommonData: changeCommonData,
                            onEnd: onEnd,
                            onClose: hidePlayer,
                        }}

                        // Player Features
                        features={dpoData.features}
                    />
                : null
            }

        </Animated.View>
    );

};
