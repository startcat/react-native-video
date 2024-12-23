import React, { useState, useEffect, useRef, createElement } from 'react';
import Animated, { withSpring, withTiming, useSharedValue } from 'react-native-reanimated';
import BackgroundTimer from 'react-native-background-timer';
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

    const hasBeenLoaded = useRef<boolean>(false);

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

        return (() => {

            if (typeof(changesAudioPlayerListener) === 'string'){
                EventRegister.removeEventListener(changesAudioPlayerListener);
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

        // Al montar el Player, preparamos la sesión de Audio

        if (Platform.OS === 'ios'){
            AudioSession.setCategory('Playback', 'MixWithOthers');
        }

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

    const showPlayer = () => {
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
                        hasPrev={dpoData.hasPrev}

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
                        watchingProgressInterval={dpoData.watchingProgressInterval}
                        addContentProgress={dpoData.addContentProgress}
                        getYouboraOptions={dpoData.getYouboraOptions}

                        // Events
                        onChangeCommonData={changeCommonData}
                        onNext={dpoData.onNext}
                        onPrevious={dpoData.onPrevious}
                        onEnd={onEnd}
                    />
                : null
            }

        </Animated.View>
    );

};
