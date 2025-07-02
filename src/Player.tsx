import React, { useState, useRef, Suspense, lazy } from 'react';

// Declaraciones globales para TypeScript
declare var __DEV__: boolean;
declare var require: any;
import DeviceInfo from 'react-native-device-info';
import { activateKeepAwake, deactivateKeepAwake} from '@sayem314/react-native-keep-awake';
import Orientation, { useOrientationChange } from 'react-native-orientation-locker';
import BackgroundTimer from 'react-native-background-timer';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { CastState, useCastState } from 'react-native-google-cast';
import { Platform } from 'react-native';
import { default as Downloads } from './Downloads';
import { IPlayerProgress } from './player/types';

// Imports condicionales: lazy loading solo en producción
let NormalFlavour: React.ComponentType<any>;
let CastFlavour: React.ComponentType<any>;

if (__DEV__) {
    // En desarrollo: import estático para mejor debugging y hot reload
    const { NormalFlavour: NormalDev } = require('./player/flavours/normal');
    const { CastFlavour: CastDev } = require('./player/flavours/cast');
    NormalFlavour = NormalDev;
    CastFlavour = CastDev;
} else {
    // En producción: lazy loading para mejor performance
    NormalFlavour = lazy(() => import('./player/flavours/normal').then(module => ({ 
        default: module.NormalFlavour 
    })));
    CastFlavour = lazy(() => import('./player/flavours/cast').then(module => ({ 
        default: module.CastFlavour 
    })));
}

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

    const playerProgress = useRef<IPlayerProgress | null>(null);

    // const currentTime = useRef<number>(props.startPosition || 0);
    // const duration = useRef<number>(0);
    // const volume = useRef<number>();
    // const isPaused = useRef<boolean>(false);
    // const isMuted = useRef<boolean>(false);
    const isCasting = useRef<boolean>(false);
    const watchingProgressIntervalObj = useRef<number>();
    const hasBeenLoaded = useRef<boolean>(false);

    const [currentAudioIndex, setCurrentAudioIndex] = useState<number>(typeof(props.audioIndex) === 'number' ? props.audioIndex : -1);
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState<number>(typeof(props.subtitleIndex) === 'number' ? props.subtitleIndex : -1);

    const [hasRotated, setHasRotated] = useState<boolean>(!!props.avoidRotation || DeviceInfo.isTablet());

    const castState = useCastState();

    if (!playerProgress.current){
        playerProgress.current = {
            ...props.playerProgress,
            currentTime: props.initialState?.startPosition || 0,
        };
    }

    useOrientationChange((o) => {
        // Pequeño apaño para el lock de rotación (fallback para dispositivos viejos)
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
        if (typeof(props.hooks?.watchingProgressInterval) === 'number' && props.hooks?.watchingProgressInterval > 0 && props.hooks?.addContentProgress){
            watchingProgressIntervalObj.current = BackgroundTimer.setInterval(() => {

                // Evitamos mandar el watching progress en directos y en Chromecast
                if (hasBeenLoaded.current && !props.playerProgress?.isLive && !isCasting.current){
                    // @ts-ignore
                    props.hooks?.addContentProgress(currentTime.current, duration.current, props.id);
                }

            }, props.hooks?.watchingProgressInterval);

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
            playerProgress.current.currentTime = data.time;
        }

        if (data?.duration !== undefined){
            playerProgress.current.duration = data.duration;

            if (!hasBeenLoaded.current){
                hasBeenLoaded.current = true;
            }

        }

        if ((data?.time !== undefined || data?.duration !== undefined) && props.events?.onProgress){
            props.events.onProgress(playerProgress.current.currentTime, playerProgress.current.duration);
        }

        if (data?.paused !== undefined){
            playerProgress.current.isPaused = !!data.paused;

            if (!!data.paused && props.events?.onPause){
                props.events.onPause();
            } else if (props.events?.onPlay){
                props.events.onPlay();
            }
        }

        if (data?.muted !== undefined){
            playerProgress.current.isMuted = !!data.muted;
        }

        if (typeof(data?.volume) === 'number'){
            playerProgress.current.volume = data.volume;
        }

        if (typeof(data?.audioIndex) === 'number'){
            setCurrentAudioIndex(data.audioIndex);

            if (props.events?.onChangeAudioIndex){
                props.events.onChangeAudioIndex(data?.audioIndex, data?.audioLabel);
            }
        }

        if (typeof(data?.subtitleIndex) === 'number'){
            setCurrentSubtitleIndex(data.subtitleIndex);

            if (props.events?.onChangeSubtitleIndex){
                props.events.onChangeSubtitleIndex(data?.subtitleIndex, data?.subtitleLabel);
            }
        }
        
    }

    if (hasRotated && (castState === CastState.CONNECTING || castState === CastState.CONNECTED)){
        console.log(`[Player] Mounting CastFlavour...`);
        isCasting.current = true;
        return (
            <Suspense fallback={props.components?.suspenseLoader}>
                <CastFlavour
                    manifests={props.manifests}
                    headers={props.headers}
                    languagesMapping={props.languagesMapping}
                    liveStartDate={props.liveStartDate}

                    audioIndex={currentAudioIndex}
                    subtitleIndex={currentSubtitleIndex}

                    timeMarkers={props.timeMarkers}
                    avoidTimelineThumbnails={props.avoidTimelineThumbnails}

                    // Initial State
                    initialState={props.initialState}

                    // Nuevas Props Agrupadas
                    playerMetadata={props.playerMetadata}
                    playerProgress={playerProgress.current}
                    playerAnalytics={props.playerAnalytics}
                    playerTimeMarkers={props.playerTimeMarkers}
                    playerAds={props.playerAds}

                    // Custom Components
                    components={props.components}

                    // Hooks
                    hooks={props.hooks}

                    // Events
                    events={{
                        ...props.events,
                        onChangeCommonData: changeCommonData,
                    }}
                />
            </Suspense>
        );

    } else if (hasRotated){
        console.log(`[Player] Mounting NormalFlavour...`);
        isCasting.current = false;
        return (
            <Suspense fallback={props.components?.suspenseLoader}>
                <NormalFlavour
                    manifests={props.manifests}
                    headers={props.headers}
                    languagesMapping={props.languagesMapping}
                    showExternalTudum={props.showExternalTudum}

                    playOffline={props.playOffline}
                    liveStartDate={props.liveStartDate}

                    audioIndex={currentAudioIndex}
                    subtitleIndex={currentSubtitleIndex}
                    subtitleStyle={props.subtitleStyle}

                    timeMarkers={props.timeMarkers}
                    avoidTimelineThumbnails={props.avoidTimelineThumbnails}

                    // Initial State
                    initialState={props.initialState}

                    // Nuevas Props Agrupadas
                    playerMetadata={props.playerMetadata}
                    playerProgress={playerProgress.current}
                    playerAnalytics={props.playerAnalytics}
                    playerTimeMarkers={props.playerTimeMarkers}
                    playerAds={props.playerAds}

                    // Custom Components
                    components={props.components}

                    // Hooks
                    hooks={props.hooks}

                    // Events
                    events={{
                        ...props.events,
                        onChangeCommonData: changeCommonData,
                    }}
                />
            </Suspense>
        );

    } else {
        return null;
        
    }

};