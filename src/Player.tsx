import React, { useState, useRef } from 'react';
import DeviceInfo from 'react-native-device-info';
import { activateKeepAwake, deactivateKeepAwake} from '@sayem314/react-native-keep-awake';
import Orientation, { useOrientationChange } from 'react-native-orientation-locker';
import AudioSession from 'react-native-audio-session';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { CastState, useCastState } from 'react-native-google-cast';
import { Platform,  } from 'react-native';
import { NormalFlavour, CastFlavour } from './player/flavours';
import { default as Downloads } from './Downloads';

import { 
    type PlayerProps,
    type ICommonData
} from './player/types';



/*
 *  Esta primera capa del Player nos permite alternar entre los dos principales flavors:
 *  - Normal: Visionado en dispositivo o Airplay
 *  - Chromecast: Usando el móvil como mando
 * 
 *  Mantendremos el punto de reproducción, pista de audio, pista de subs, etc...
 *
 */

export function Player (props: PlayerProps): React.ReactElement | null {

    const currentTime = useRef<number>(props.startPosition || 0);
    const duration = useRef<number>(0);
    const volume = useRef<number>();
    const isMuted = useRef<boolean>(false);
    const isCasting = useRef<boolean>(false);
    const watchingProgressIntervalObj = useRef<NodeJS.Timeout>();

    const [currentAudioIndex, setCurrentAudioIndex] = useState<number>(typeof(props.audioIndex) === 'number' ? props.audioIndex : -1);
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState<number>(typeof(props.subtitleIndex) === 'number' ? props.subtitleIndex : -1);

    const [hasRotated, setHasRotated] = useState<boolean>(DeviceInfo.isTablet());

    const castState = useCastState();

    useOrientationChange((o) => {
        // Pequeño apaño para el lock de rotación
        setTimeout(() => {
            setHasRotated(true);

        }, 300);
        
    });

    React.useEffect(() => {

        // Al montar el Player, preparamos la sesión de Audio, el apagado de pantalla y la orientación

        if (Platform.OS === 'android'){
            SystemNavigationBar.fullScreen(true);
        }

        if (Platform.OS === 'ios'){
            AudioSession.setCategory('Playback', 'MixWithOthers');
        }

        if (!DeviceInfo.isTablet()){
            // Bloqueamos a Landscape los móviles
            Orientation.lockToLandscape();
        }

        activateKeepAwake();

        async function stopDownloads() {
            await Downloads.pause();
        }

        // También detenemos las posibles descargas para mejorar la calidad de reproducción
        stopDownloads();

        // Activamos un intervalo que envia los datos del continue watching según especificaciones de servidor
        if (typeof(props.watchingProgressInterval) === 'number' && props.watchingProgressInterval > 0 && props.addContentProgress){
            watchingProgressIntervalObj.current = setInterval(() => {

                // Evitamos mandar el watching progress en directos y en Chromecast
                if (!props.isLive && !isCasting.current){
                    // @ts-ignore
                    props.addContentProgress(currentTime.current, duration.current, props.id);
                }

            }, props.watchingProgressInterval);

        }

        console.log(`[Player] Manifests ${JSON.stringify(props.manifests)}`);
    
        return () => {

            if (watchingProgressIntervalObj.current){
                clearInterval(watchingProgressIntervalObj.current);
            }

            deactivateKeepAwake();

            if (!DeviceInfo.isTablet()){
                Orientation.lockToPortrait();
            }

            async function resumeDownloads() {
                await Downloads.resume();
            }

            // Reanudamos las descargas
            resumeDownloads();

            if (Platform.OS === 'android'){
                SystemNavigationBar.fullScreen(false);
            }

        };

    }, []);

    /*
     *  Obtenemos el estado inicial del dispositivo a usar
     *  - Si esta muteado
     *  - Nivel de volumen
     *  - Punto inicial de reproducción
     *  - Idioma por defecto
     *  - Subtítulos por defecto
     * 
     */

    // const checkPhysicalState = () => {
        
    // }

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

        if (typeof(data?.audioIndex) === 'number'){
            setCurrentAudioIndex(data.audioIndex);

            if (props.onChangeAudioIndex){
                props.onChangeAudioIndex(data?.audioIndex, data?.audioLabel);
            }
        }

        if (typeof(data?.subtitleIndex) === 'number'){
            setCurrentSubtitleIndex(data.subtitleIndex);

            if (props.onChangeSubtitleIndex){
                props.onChangeSubtitleIndex(data?.subtitleIndex, data?.subtitleLabel);
            }
        }
        
    }


    if (hasRotated && (castState === CastState.CONNECTING || castState === CastState.CONNECTED)){
        console.log(`[Player] Mounting CastFlavour...`);
        isCasting.current = true;
        return (
            <CastFlavour
                id={props.id}
                title={props.title}
                subtitle={props.subtitle}
                description={props.description}
                languagesMapping={props.languagesMapping}
                mapHlsQualities={props.mapHlsQualities}

                manifests={props.manifests}
                poster={props.poster}
                youbora={props.youbora}
                adTagUrl={props.adTagUrl}
                hasNext={props.hasNext}

                isLive={props.isLive}
                liveStartDate={props.liveStartDate}

                currentTime={currentTime.current}
                audioIndex={currentAudioIndex}
                subtitleIndex={currentSubtitleIndex}

                timeMarkers={props.timeMarkers}

                // Components
                mosca={props.mosca}
                headerMetadata={props.headerMetadata}
                sliderVOD={props.sliderVOD}
                sliderDVR={props.sliderDVR}
                controlsHeaderBar={props.controlsHeaderBar}
                controlsMiddleBar={props.controlsMiddleBar}
                controlsBottomBar={props.controlsBottomBar}
                nextButton={props.nextButton}
                skipIntroButton={props.skipIntroButton}
                skipRecapButton={props.skipRecapButton}
                skipCreditsButton={props.skipCreditsButton}
                menu={props.menu}
                settingsMenu={props.settingsMenu}

                // Utils
                getYouboraOptions={props.getYouboraOptions}

                // Events
                onChangeCommonData={changeCommonData}
                onDVRChange={props.onDVRChange}
                onNext={props.onNext}
            />
        );

    } else if (hasRotated){
        console.log(`[Player] Mounting NormalFlavour...`);
        isCasting.current = false;
        return (
            <NormalFlavour
                id={props.id}
                title={props.title}
                subtitle={props.subtitle}
                description={props.description}
                languagesMapping={props.languagesMapping}
                mapHlsQualities={props.mapHlsQualities}

                manifests={props.manifests}
                showExternalTudum={props.showExternalTudum}
                poster={props.poster}
                youbora={props.youbora}
                adTagUrl={props.adTagUrl}
                hasNext={props.hasNext}

                playOffline={props.playOffline}
                isLive={props.isLive}
                liveStartDate={props.liveStartDate}

                currentTime={currentTime.current}
                audioIndex={currentAudioIndex}
                subtitleIndex={currentSubtitleIndex}

                timeMarkers={props.timeMarkers}

                // Components
                mosca={props.mosca}
                headerMetadata={props.headerMetadata}
                sliderVOD={props.sliderVOD}
                sliderDVR={props.sliderDVR}
                controlsHeaderBar={props.controlsHeaderBar}
                controlsMiddleBar={props.controlsMiddleBar}
                controlsBottomBar={props.controlsBottomBar}
                nextButton={props.nextButton}
                skipIntroButton={props.skipIntroButton}
                skipRecapButton={props.skipRecapButton}
                skipCreditsButton={props.skipCreditsButton}
                menu={props.menu}
                settingsMenu={props.settingsMenu}

                // Utils
                getTudumManifest={props.getTudumManifest}
                getYouboraOptions={props.getYouboraOptions}

                // Events
                onChangeCommonData={changeCommonData}
                onDVRChange={props.onDVRChange}
                onNext={props.onNext}
            />
        );

    } else {
        return null;
        
    }

};
