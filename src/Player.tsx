import React, { useState, useRef, Suspense, lazy } from 'react';
import DeviceInfo from 'react-native-device-info';
import { activateKeepAwake, deactivateKeepAwake} from '@sayem314/react-native-keep-awake';
import Orientation, { useOrientationChange } from 'react-native-orientation-locker';
import BackgroundTimer from 'react-native-background-timer';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { CastState, useCastState } from 'react-native-google-cast';
import { Platform, ActivityIndicator, View } from 'react-native';
// import { NormalFlavour, CastFlavour } from './player/flavours';
import { default as Downloads } from './Downloads';

const NormalFlavour = lazy(() => import('./player/flavours/normal').then(module => ({ 
    default: module.NormalFlavour 
})));
const CastFlavour = lazy(() => import('./player/flavours/cast').then(module => ({ 
    default: module.CastFlavour 
})));

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
    const isPaused = useRef<boolean>(false);
    const isMuted = useRef<boolean>(false);
    const isCasting = useRef<boolean>(false);
    const watchingProgressIntervalObj = useRef<NodeJS.Timeout>();
    const hasBeenLoaded = useRef<boolean>(false);

    const [currentAudioIndex, setCurrentAudioIndex] = useState<number>(typeof(props.audioIndex) === 'number' ? props.audioIndex : -1);
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState<number>(typeof(props.subtitleIndex) === 'number' ? props.subtitleIndex : -1);

    const [hasRotated, setHasRotated] = useState<boolean>(!!props.avoidRotation || DeviceInfo.isTablet());

    const castState = useCastState();

    useOrientationChange((o) => {
        // Pequeño apaño para el lock de rotación
        if (!hasRotated){
            setTimeout(() => {
                setHasRotated(true);

            }, 500);
        }
        
    });

    React.useEffect(() => {

        // Al montar el Player, preparamos la sesión de Audio, el apagado de pantalla y la orientación

        if (Platform.OS === 'android'){
            SystemNavigationBar.fullScreen(true);
        }

        if (!props.avoidRotation && !DeviceInfo.isTablet()){
            // Bloqueamos a Landscape los móviles
            Orientation.lockToLandscape();
        }

        activateKeepAwake();

        async function stopDownloads() {
            await Downloads.pause();
        }

        // También detenemos las posibles descargas para mejorar la calidad de reproducción
        if (!props.avoidDownloadsManagement){
            stopDownloads();
        }

        // Activamos un intervalo que envia los datos del continue watching según especificaciones de servidor
        if (typeof(props.watchingProgressInterval) === 'number' && props.watchingProgressInterval > 0 && props.addContentProgress){
            watchingProgressIntervalObj.current = BackgroundTimer.setInterval(() => {

                // Evitamos mandar el watching progress en directos y en Chromecast
                if (hasBeenLoaded.current && !props.isLive && !isCasting.current){
                    // @ts-ignore
                    props.addContentProgress(currentTime.current, duration.current, props.id);
                }

            }, props.watchingProgressInterval);

        }

        console.log(`[Player] Manifests ${JSON.stringify(props.manifests)}`);
    
        return () => {

            if (watchingProgressIntervalObj.current){
                BackgroundTimer.clearInterval(watchingProgressIntervalObj.current);
            }

            deactivateKeepAwake();

            if (!props.avoidRotation && !DeviceInfo.isTablet()){
                Orientation.lockToPortrait();
            }

            async function resumeDownloads() {
                await Downloads.resume();
            }

            // Reanudamos las descargas
            if (!props.avoidDownloadsManagement){
                resumeDownloads();
            }

            if (Platform.OS === 'android'){
                SystemNavigationBar.fullScreen(false);
            }

        };

    }, []);

    /*
     *  Función para guardar los cambios en el estado entre flavours
     * 
     */

    const changeCommonData = (data: ICommonData) => {

        if (data?.time !== undefined){
            currentTime.current = data.time;
        }

        if (data?.duration !== undefined){
            duration.current = data.duration;

            if (!hasBeenLoaded.current){
                hasBeenLoaded.current = true;
            }

        }

        if ((data?.time !== undefined || data?.duration !== undefined) && props.onProgress){
            props.onProgress(currentTime.current, duration.current);
        }

        if (data?.paused !== undefined){
            isPaused.current = !!data.paused;
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
            <Suspense fallback={props.loader}>
                <CastFlavour
                    id={props.id}
                    title={props.title}
                    subtitle={props.subtitle}
                    description={props.description}
                    languagesMapping={props.languagesMapping}
                    mapHlsQualities={props.mapHlsQualities}

                    manifests={props.manifests}
                    headers={props.headers}
                    poster={props.poster}
                    squaredPoster={props.squaredPoster}
                    youbora={props.youbora}
                    adTagUrl={props.adTagUrl}
                    hasNext={props.hasNext}

                    paused={isPaused.current}
                    muted={isMuted.current}

                    isLive={props.isLive}
                    liveStartDate={props.liveStartDate}

                    currentTime={currentTime.current}
                    audioIndex={currentAudioIndex}
                    subtitleIndex={currentSubtitleIndex}

                    timeMarkers={props.timeMarkers}
                    avoidTimelineThumbnails={props.avoidTimelineThumbnails}

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

                    // Utils
                    getYouboraOptions={props.getYouboraOptions}
                    mergeCastMenuData={props.mergeCastMenuData}

                    // Events
                    onChangeCommonData={changeCommonData}
                    onDVRChange={props.onDVRChange}
                    onSeekOverEpg={props.onSeekOverEpg}
                    onNext={props.onNext}
                    onEnd={props.onEnd}
                    onExit={props.onExit}
                />
            </Suspense>
        );

    } else if (hasRotated){
        console.log(`[Player] Mounting NormalFlavour...`);
        isCasting.current = false;
        return (
            <Suspense fallback={props.loader}>
                <NormalFlavour
                    id={props.id}
                    title={props.title}
                    subtitle={props.subtitle}
                    description={props.description}
                    languagesMapping={props.languagesMapping}
                    mapHlsQualities={props.mapHlsQualities}

                    manifests={props.manifests}
                    headers={props.headers}
                    showExternalTudum={props.showExternalTudum}
                    poster={props.poster}
                    squaredPoster={props.squaredPoster}
                    youbora={props.youbora}
                    adTagUrl={props.adTagUrl}
                    hasNext={props.hasNext}

                    paused={isPaused.current}
                    muted={isMuted.current}
                    
                    playOffline={props.playOffline}
                    multiSession={props.multiSession}
                    isLive={props.isLive}
                    liveStartDate={props.liveStartDate}

                    currentTime={currentTime.current}
                    audioIndex={currentAudioIndex}
                    subtitleIndex={currentSubtitleIndex}

                    timeMarkers={props.timeMarkers}
                    avoidTimelineThumbnails={props.avoidTimelineThumbnails}

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

                    // Utils
                    getSourceUri={props.getSourceUri}
                    getTudumManifest={props.getTudumManifest}
                    getYouboraOptions={props.getYouboraOptions}
                    mergeMenuData={props.mergeMenuData}

                    // Events
                    onChangeCommonData={changeCommonData}
                    onDVRChange={props.onDVRChange}
                    onSeekOverEpg={props.onSeekOverEpg}
                    onNext={props.onNext}
                    onEnd={props.onEnd}
                    onExit={props.onExit}
                />
            </Suspense>
        );

    } else {
        return null;
        
    }

};
