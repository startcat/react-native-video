import React, { useState, useEffect, useRef, createElement } from 'react';
import Animated, { withSpring, withTiming, useSharedValue } from 'react-native-reanimated';
import AudioSession from 'react-native-audio-session';
import { EventRegister } from 'react-native-event-listeners';
import { SheetManager } from 'react-native-actions-sheet';
import { View, Platform } from 'react-native';
import { Text, Spinner } from '@ui-kitten/components';
import { AudioFlavour } from '../../flavours';
import { styles } from './styles';

import { 
    type AudioPlayerProps,
    type AudioPlayerActionEventProps,
    type AudioPlayerEventProps,
    type AudioPlayerContentsDpo,
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

    const playerMaxHeight = useRef<number>(props.playerMaxHeight || PLAYER_MAX_HEIGHT);
    const audioPlayerHeight = useSharedValue(0);

    const [contentId, setContentId] = useState<IAudioPlayerContent | null>();
    const [dpoData, setDpoData] = useState<AudioPlayerContentsDpo | null>(null);

    const currentTime = useRef<number>(0);
    const duration = useRef<number>(0);
    const volume = useRef<number>();
    const isMuted = useRef<boolean>(false);
    const watchingProgressIntervalObj = useRef<NodeJS.Timeout>();

    useEffect(() => {

        const changesAudioPlayerListener = EventRegister.addEventListener('audioPlayer', (data: AudioPlayerEventProps) => {

            if (audioPlayerHeight?.value < playerMaxHeight.current){
                // Desplegamos el player en formato de barra inferior
                setContentId({
                    current: data
                });

                showPlayer();

            } else if (audioPlayerHeight){
                // Si ya lo teníamos desplegado, cambiamos el ID/Slug del contenido
                // Para cambiar de contenido, necesitamos desmontarlo
                currentTime.current = 0;
                setDpoData(null);
                setContentId({
                    next: data
                });

            }
            
        });

        const actionsAudioPlayerListener = EventRegister.addEventListener('audioPlayerAction', (data: AudioPlayerActionEventProps) => {

            if (data.action === CONTROL_ACTION.CLOSE_AUDIO_PLAYER){
                setContentId(null);
                hidePlayer();
            }

        });

        return (() => {

            if (typeof(changesAudioPlayerListener) === 'string'){
                EventRegister.removeEventListener(changesAudioPlayerListener);
            }

            if (typeof(actionsAudioPlayerListener) === 'string'){
                EventRegister.removeEventListener(actionsAudioPlayerListener);
            }

        });

    }, []);

    useEffect(() => {

        async function fetchDpo(){

            if (props.fetchContentData){
                try {
                    const dpo = await props.fetchContentData(contentId?.current!);

                    if (Platform.OS !== 'android'){
                        AudioSession.setCategory('Playback', 'MixWithOthers');
        
                    }

                    setDpoData(dpo);

                } catch(err){

                }
                
            }

        }

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

    // React.useEffect(() => {

    //     // Al montar el Player, preparamos la sesión de Audio, el apagado de pantalla y la orientación

    //     if (Platform.OS === 'ios'){
    //         AudioSession.setCategory('Playback', 'MixWithOthers');
    //     }

    //     // Activamos un intervalo que envia los datos del continue watching según especificaciones de servidor
    //     if (typeof(props.watchingProgressInterval) === 'number' && props.watchingProgressInterval > 0 && props.addContentProgress){
    //         watchingProgressIntervalObj.current = setInterval(() => {

    //             // Evitamos mandar el watching progress en directos y en Chromecast
    //             if (!props.isLive){
    //                 // @ts-ignore
    //                 props.addContentProgress(currentTime.current, duration.current, props.id);
    //             }

    //         }, props.watchingProgressInterval);

    //     }

    //     console.log(`[AudioPlayer] Manifests ${JSON.stringify(props.manifests)}`);
    
    //     return () => {

    //         if (watchingProgressIntervalObj.current){
    //             clearInterval(watchingProgressIntervalObj.current);
    //         }

    //     };

    // }, []);

    const showPlayer = () => {
        audioPlayerHeight.value = withSpring(playerMaxHeight.current, {
            duration: 800
        });
    }

    const hidePlayer = () => {
        audioPlayerHeight.value = withTiming(0, {
            duration: 300
        });
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
                contentId?.current && dpoData ?
                    <AudioFlavour
                        id={dpoData.id}
                        title={dpoData.title}
                        subtitle={dpoData.subtitle}
                        description={dpoData.description}
                        // languagesMapping={props.languagesMapping}

                        manifests={dpoData.manifests}
                        poster={dpoData.poster}
                        youbora={dpoData.youbora}
                        hasNext={dpoData.hasNext}

                        playOffline={dpoData.playOffline}
                        isLive={dpoData.isLive}
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
                        getYouboraOptions={props.getYouboraOptions}

                        // Events
                        onChangeCommonData={changeCommonData}
                        onNext={props.onNext}
                    />
                : null
            }

        </Animated.View>
    );

};
