import { activateKeepAwake, deactivateKeepAwake } from '@sayem314/react-native-keep-awake';
import React, { Suspense, lazy, useRef, useState } from 'react';
import { Platform } from 'react-native';
import BackgroundTimer from 'react-native-background-timer';
import DeviceInfo from 'react-native-device-info';
import { CastState as NativeCastState, useCastState as useNativeCastState } from 'react-native-google-cast';
import Orientation, { useOrientationChange } from 'react-native-orientation-locker';
import SystemNavigationBar from 'react-native-system-navigation-bar';
import { default as Downloads } from './Downloads';
import { PlayerContext } from './player/core/context';
import { DEFAULT_CAST_CONFIG } from './player/features/cast/constants';
import { ComponentLogger, Logger, LoggerFactory } from './player/features/logger';
import { type IPlayerProgress, type IPreferencesCommonData } from './player/types';

// Declaraciones globales para TypeScript
declare var __DEV__: boolean;
declare var require: any;

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
    type ICommonData,
    type PlayerProps
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

    const playerContext = useRef<PlayerContext | null>(null);
    const playerLogger = useRef<Logger | null>(null);
    const playerVideoLogger = useRef<ComponentLogger | null>(null);
    const playerProgress = useRef<IPlayerProgress | null>(null);

    const isCasting = useRef<boolean>(false);
    const watchingProgressIntervalObj = useRef<number>();
    const hasBeenLoaded = useRef<boolean>(false);
    const hasBeenLoadedAudio = useRef<boolean>(false);

    const [currentAudioIndex, setCurrentAudioIndex] = useState<number>(typeof(props.audioIndex) === 'number' ? props.audioIndex : -1);
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState<number>(typeof(props.subtitleIndex) === 'number' ? props.subtitleIndex : -1);

    const [hasRotated, setHasRotated] = useState<boolean>(!!props.avoidRotation || DeviceInfo.isTablet());
    const [hasCorrectCastState, setCorrectCastState] = useState<boolean>(false);

    const nativeCastState = useNativeCastState();

    if (!playerLogger.current){
        playerLogger.current = LoggerFactory.createFromConfig(__DEV__);
        playerVideoLogger.current = playerLogger.current?.forComponent('Video Player Component', props.logger?.core?.enabled, props.logger?.core?.level);
    }

    if (!playerContext.current){
        playerContext.current = new PlayerContext(playerLogger.current!);
    }

    if (!playerProgress.current){
        playerProgress.current = {
            ...props.playerProgress,
            currentTime: props.initialState?.startPosition || 0,
        };
    }

    useOrientationChange((o: OrientationType) => {
        // Pequeño apaño para el lock de rotación (fallback para dispositivos viejos)
        if (!hasRotated){
            setTimeout(() => {
                setHasRotated(true);

            }, 500);
        }
        
    });

    React.useEffect(() => {

        // Al montar el Player, preparamos la sesión de Audio, el apagado de pantalla y la orientación
        console.log(`Player mounted - subtitleIndex: ${props.subtitleIndex}`);

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
                    props.hooks?.addContentProgress(playerProgress.current.currentTime, playerProgress.current.duration, playerProgress.current.id);
                }

            }, props.hooks?.watchingProgressInterval);

        }

        const baseTimer = setTimeout(() => {
            setCorrectCastState(true);

        }, DEFAULT_CAST_CONFIG.initializationDelay);

        playerVideoLogger.current?.debug(`Received manifests ${JSON.stringify(props.manifests)}`);
    
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

            clearTimeout(baseTimer);

        };

    }, []);

    /*
     *  Función para guardar los cambios en el estado entre flavours
     * 
     */

    const handleChangeCommonData = (data: ICommonData) => {

        let preferencesData: IPreferencesCommonData = {};

        playerVideoLogger.current?.debug(`handleChangeCommonData ${JSON.stringify(data)}`);

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
            preferencesData.muted = !!data.muted;
        }

        if (typeof(data?.volume) === 'number'){
            playerProgress.current.volume = data.volume;
            preferencesData.volume = data.volume;
        }

        if (typeof(data?.audioIndex) === 'number'){
            setCurrentAudioIndex(data.audioIndex);
            preferencesData.audioIndex = data.audioIndex;
            preferencesData.audioLabel = data.audioLabel;

            if (props.events?.onChangeAudioIndex){
                props.events.onChangeAudioIndex(data?.audioIndex, data?.audioLabel);
            }
        }

        if (typeof(data?.subtitleIndex) === 'number'){
            setCurrentSubtitleIndex(data.subtitleIndex);
            preferencesData.subtitleIndex = data.subtitleIndex;
            preferencesData.subtitleLabel = data.subtitleLabel;

            if (props.events?.onChangeSubtitleIndex){
                props.events.onChangeSubtitleIndex(data?.subtitleIndex, data?.subtitleLabel);
            }
        }

        if (hasBeenLoadedAudio.current && props?.events?.onChangePreferences && typeof(props.events?.onChangePreferences) === 'function' && Object.keys(preferencesData).length > 0){
            playerVideoLogger.current?.info(`Calling onChangePreferences with ${JSON.stringify(preferencesData)}`);
            props.events?.onChangePreferences(preferencesData);
        }

        if (!hasBeenLoadedAudio.current && (typeof(data?.audioIndex) === 'number' || typeof(data?.subtitleIndex) === 'number')){
            hasBeenLoadedAudio.current = true;
        }
        
    }

    if (hasRotated && hasCorrectCastState && (nativeCastState === NativeCastState.CONNECTING || nativeCastState === NativeCastState.CONNECTED)){
        playerVideoLogger.current?.debug(`Mounting CastFlavour...`);
        isCasting.current = true;
        return (
            <Suspense fallback={props.components?.suspenseLoader}>
                <CastFlavour
                    playerContext={playerContext.current}
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
                        onChangeCommonData: handleChangeCommonData,
                    }}

                    // Player Features
                    features={props.features}

                    // Player Logger
                    logger={props.logger}
                />
            </Suspense>
        );

    } else if (hasRotated && hasCorrectCastState && (nativeCastState !== NativeCastState.CONNECTING && nativeCastState !== NativeCastState.CONNECTED)){
        playerVideoLogger.current?.debug(`Mounting NormalFlavour...`);
        isCasting.current = false;
        return (
            <Suspense fallback={props.components?.suspenseLoader}>
                <NormalFlavour
                    playerContext={playerContext.current}
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
                        onChangeCommonData: handleChangeCommonData,
                    }}

                    // Features
                    features={props.features}

                    // Player Logger
                    logger={props.logger}
                />
            </Suspense>
        );

    } else {
        return null;
        
    }

};