import React, { useEffect, useState, useRef, createElement, useCallback, useMemo, Suspense } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Controls, TimeMarks } from './controls';
// Importamos los componentes con lazy para carga diferida
const Menu = React.lazy(() => import('./menu/wrapper'));
const SettingsMenu = React.lazy(() => import('./settingsMenu/wrapper'));
import { 
    type OverlayProps,
    CONTROL_ACTION 
} from '../types';
import { styles } from './styles';

const PLAYER_HIDE_CONTROLS = 5000;

const OverlayBase = (props: OverlayProps): React.ReactElement => {

    const insets = useSafeAreaInsets();

    const [avoidDissapear, setAvoidDissapear] = useState<boolean>(!!props.alwaysVisible);
    const [visibleControls, setVisibleControls] = useState<boolean>(!!props.alwaysVisible);
    const [visibleMenu, setVisibleMenu] = useState<boolean>(false);
    const [visibleSettingsMenu, setVisibleSettingsMenu] = useState<boolean>(false);
    //const [currentTime, setCurrentTime] = useState<number>(playerProgress?.currentTime || 0);
    //const [dvrTimeValue, setDvrTimeValue] = useState<number>(propDvrTimeValue || duration!);

    const controlsTimeout = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        // If we are connected to Airplay, don't let the controls disappear
        setAvoidDissapear(!!props.alwaysVisible);
        if (!!props.alwaysVisible) {
            setVisibleControls(true);
        }
    }, [props.alwaysVisible]);

    // useEffect(() => {
    //     if (playerProgress?.currentTime !== undefined) {
    //         setCurrentTime(playerProgress?.currentTime);
    //     }
    // }, [playerProgress?.currentTime]);

    // useEffect(() => {
    //     if (propDvrTimeValue !== undefined) {
    //         setDvrTimeValue(propDvrTimeValue);
    //     }
    // }, [propDvrTimeValue]);

    const cancelControlsTimer = useCallback(() => {
        if (controlsTimeout.current) {
            clearTimeout(controlsTimeout.current);
            controlsTimeout.current = null;
        }
    }, []);

    const resetControlsTimer = useCallback(() => {
        cancelControlsTimer();
        
        if (visibleControls && !avoidDissapear) {
            controlsTimeout.current = setTimeout(() => setVisibleControls(false), PLAYER_HIDE_CONTROLS);
        }
    }, [visibleControls, avoidDissapear, cancelControlsTimer]);

    useEffect(() => {
        resetControlsTimer();
    }, [visibleControls, resetControlsTimer]);

    const onCloseMenu = useCallback(() => {
        setVisibleMenu(false);
        setVisibleSettingsMenu(false);

        if (!avoidDissapear) {
            setVisibleControls(false);
        }
    }, [avoidDissapear]);

    const onToggle = useCallback(() => {
        if (!avoidDissapear) {
            setVisibleControls((prev: boolean) => !prev);
        }
    }, [avoidDissapear]);

    const onPress = useCallback((id: CONTROL_ACTION, value?: any) => {
        resetControlsTimer();

        if (id === CONTROL_ACTION.MENU) {
            if (!avoidDissapear) {
                setVisibleControls(false);
            }
            setVisibleMenu(true);
            setVisibleSettingsMenu(false);
            cancelControlsTimer();
        } else if (id === CONTROL_ACTION.SETTINGS_MENU) {
            if (!avoidDissapear) {
                setVisibleControls(false);
            }
            setVisibleMenu(false);
            setVisibleSettingsMenu(true);
            cancelControlsTimer();
        } else if (id === CONTROL_ACTION.MENU_CLOSE) {
            onCloseMenu();
        } else if (typeof props.events?.onPress === 'function') {
            props.events.onPress(id, value);
        }
    }, [avoidDissapear, cancelControlsTimer, onCloseMenu, props.events?.onPress, resetControlsTimer]);

    const onSlidingStart = useCallback((value: number) => {
        cancelControlsTimer();

        if (!avoidDissapear && typeof props.events?.onPress === 'function') {
            props.events.onPress(CONTROL_ACTION.PAUSE, true);
        }

        if (typeof props.events?.onSlidingStart === 'function') {
            props.events.onSlidingStart(value);
        }
    }, [avoidDissapear, cancelControlsTimer, props.events?.onPress, props.events?.onSlidingStart]);

    const onSlidingMove = useCallback((value: number) => {
        if (typeof props.events?.onSlidingMove === 'function') {
            props.events.onSlidingMove(value);
        }
    }, [props.events?.onSlidingMove]);

    const onSlidingComplete = useCallback((value: number) => {
        resetControlsTimer();

        if (!avoidDissapear && typeof props.events?.onSlidingComplete === 'function') {
            props.events.onSlidingComplete(value);
        }

        if (typeof props.events?.onPress === 'function') {
            props.events.onPress(CONTROL_ACTION.SEEK, value);
            props.events.onPress(CONTROL_ACTION.PAUSE, false);
        }
    }, [avoidDissapear, props.events?.onPress, props.events?.onSlidingComplete, resetControlsTimer]);

    const commonMenuProps = useMemo(() => ({
        menuData: props.menuData,
        videoIndex: props.videoIndex,
        audioIndex: props.audioIndex,
        subtitleIndex: props.subtitleIndex,
        speedRate: props.speedRate,
        onPress: onPress,
        onClose: onCloseMenu
    }), [props.audioIndex, props.menuData, onCloseMenu, onPress, props.speedRate, props.subtitleIndex, props.videoIndex]);

    const PropMenu = useMemo(() => 
        props.components?.menu ? createElement(props.components.menu, commonMenuProps) : null
    , [props.components?.menu, commonMenuProps]);

    const PropSettingsMenu = useMemo(() => 
        props.components?.settingsMenu ? createElement(props.components.settingsMenu, commonMenuProps) : null
    , [props.components?.settingsMenu, commonMenuProps]);

    const temporalButtonsBarStyle = useMemo(() => ({
        ...styles.temporalButtonsBar,
        bottom: styles.temporalButtonsBar.bottom + (insets?.bottom || 0),
        left: styles.temporalButtonsBar.left + Math.max(insets?.left || 0, insets?.right || 0),
        right: styles.temporalButtonsBar.right + Math.max(insets?.left || 0, insets?.right || 0)
    }), [insets]);

    const showMosca = useMemo(() => 
        !visibleMenu && !visibleControls && props.components?.mosca
    , [visibleMenu, visibleControls, props.components?.mosca]);

    const showControls = useMemo(() => 
        avoidDissapear || visibleControls
    , [avoidDissapear, visibleControls]);

    const showTimeMarks = useMemo(() => 
        !props.playerProgress?.isChangingSource && !visibleMenu && !visibleSettingsMenu && !visibleControls && !avoidDissapear
    , [visibleMenu, visibleSettingsMenu, visibleControls, avoidDissapear, props.playerProgress?.isChangingSource]);

    return (
        <Pressable 
            onPress={onToggle} 
            style={styles.container} 
            accessible={!avoidDissapear && !visibleControls && !visibleMenu} 
        >
            {showMosca && props.components?.mosca}

            {showControls && (
                <Controls 
                    preloading={props.preloading}
                    thumbnailsMetadata={props.thumbnailsMetadata}
                    timeMarkers={props.timeMarkers}
                    avoidTimelineThumbnails={props.avoidTimelineThumbnails}
                    isContentLoaded={props.isContentLoaded}
                    isChangingSource={props.isChangingSource}

                    // Nuevas Props Agrupadas
                    playerMetadata={props.playerMetadata}
                    playerProgress={props.playerProgress}
                    playerAnalytics={props.playerAnalytics}
                    playerTimeMarkers={props.playerTimeMarkers}
                    playerAds={props.playerAds}

                    // Custom Components
                    components={props.components}

                    //Events
                    events={{
                        ...props.events,
                        onPress: onPress,
                        onSlidingStart: onSlidingStart,
                        onSlidingMove: onSlidingMove,
                        onSlidingComplete: onSlidingComplete,
                    }}
                />
            )}

            {!props.playerProgress?.isChangingSource && visibleMenu && PropMenu}

            {!props.playerProgress?.isChangingSource && visibleMenu && !PropMenu && (
                <Suspense fallback={props.components?.loader}>
                    <Menu
                        videoIndex={props.videoIndex}
                        audioIndex={props.audioIndex}
                        subtitleIndex={props.subtitleIndex}
                        menuData={props.menuData}
                        onPress={onPress}
                        onClose={onCloseMenu}
                    />
                </Suspense>
            )}

            {!props.playerProgress?.isChangingSource && visibleSettingsMenu && PropSettingsMenu}

            {!props.playerProgress?.isChangingSource && visibleSettingsMenu && !PropSettingsMenu && (
                <Suspense fallback={props.components?.loader}>
                    <SettingsMenu
                        speedRate={props.speedRate}
                        videoIndex={props.videoIndex}
                        menuData={props.menuData}
                        onPress={onPress}
                        onClose={onCloseMenu}
                    />
                </Suspense>
            )}

            {showTimeMarks && (
                <View style={temporalButtonsBarStyle}>
                    <TimeMarks 
                        currentTime={props.playerProgress?.currentTime || 0}
                        duration={props.playerProgress?.duration}
                        timeMarkers={props.playerTimeMarkers}
                        hasNext={props.playerProgress?.hasNext || false}
                        nextButton={props.components?.nextButton}
                        skipIntroButton={props.components?.skipIntroButton}
                        skipRecapButton={props.components?.skipRecapButton}
                        skipCreditsButton={props.components?.skipCreditsButton}
                        onPress={onPress}
                    />
                </View>
            )}
        </Pressable>
    );
};

export const Overlay = React.memo(OverlayBase);
