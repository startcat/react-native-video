import React, { useState, useRef } from 'react';
import AudioSession from 'react-native-audio-session';
import { Platform,  } from 'react-native';
import { AudioFlavour } from './player/flavours';

import { 
    type AudioPlayerProps,
    type ICommonData
} from './player/types';



/*
 *  AudioPlayer
 *  Se inicia como barra inferior
 *
 */

export function AudioPlayer (props: AudioPlayerProps): React.ReactElement | null {

    const currentTime = useRef<number>(props.startPosition || 0);
    const duration = useRef<number>(0);
    const volume = useRef<number>();
    const isMuted = useRef<boolean>(false);
    const watchingProgressIntervalObj = useRef<NodeJS.Timeout>();

    React.useEffect(() => {

        // Al montar el Player, preparamos la sesión de Audio, el apagado de pantalla y la orientación

        if (Platform.OS === 'ios'){
            AudioSession.setCategory('Playback', 'MixWithOthers');
        }

        // Activamos un intervalo que envia los datos del continue watching según especificaciones de servidor
        if (typeof(props.watchingProgressInterval) === 'number' && props.watchingProgressInterval > 0 && props.addContentProgress){
            watchingProgressIntervalObj.current = setInterval(() => {

                // Evitamos mandar el watching progress en directos y en Chromecast
                if (!props.isLive){
                    // @ts-ignore
                    props.addContentProgress(currentTime.current, duration.current, props.id);
                }

            }, props.watchingProgressInterval);

        }

        console.log(`[AudioPlayer] Manifests ${JSON.stringify(props.manifests)}`);
    
        return () => {

            if (watchingProgressIntervalObj.current){
                clearInterval(watchingProgressIntervalObj.current);
            }

        };

    }, []);

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

    return (
        <AudioFlavour
            id={props.id}
            title={props.title}
            subtitle={props.subtitle}
            description={props.description}
            languagesMapping={props.languagesMapping}

            manifests={props.manifests}
            poster={props.poster}
            youbora={props.youbora}
            hasNext={props.hasNext}

            playOffline={props.playOffline}
            isLive={props.isLive}
            liveStartDate={props.liveStartDate}

            currentTime={currentTime.current}

            // Components
            // mosca={props.mosca}
            // controlsHeaderMetadata={props.controlsHeaderMetadata}
            // sliderVOD={props.sliderVOD}
            // sliderDVR={props.sliderDVR}

            // Utils
            getYouboraOptions={props.getYouboraOptions}

            // Events
            onChangeCommonData={changeCommonData}
            onNext={props.onNext}
        />
    );

};
