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

const OverlayBase = ({
    currentTime: propCurrentTime,
    dvrTimeValue: propDvrTimeValue,
    duration,
    title,
    thumbnailsMetadata,
    timeMarkers,
    avoidTimelineThumbnails,
    paused,
    muted,
    volume,
    preloading,
    isLive,
    isDVR,
    isDVRStart,
    isContentLoaded,
    isChangingSource,
    hasNext,
    alwaysVisible,
    menuData,
    videoIndex,
    audioIndex,
    subtitleIndex,
    speedRate,
    mosca,
    headerMetadata,
    loader,
    sliderVOD,
    sliderDVR,
    controlsHeaderBar,
    controlsMiddleBar,
    controlsBottomBar,
    nextButton,
    liveButton,
    skipIntroButton,
    skipRecapButton,
    skipCreditsButton,
    menu,
    settingsMenu,
    onPress: propOnPress,
    onSlidingStart: propOnSlidingStart,
    onSlidingMove: propOnSlidingMove,
    onSlidingComplete: propOnSlidingComplete,
    onExit
}: OverlayProps): React.ReactElement => {

    const insets = useSafeAreaInsets();

    const [avoidDissapear, setAvoidDissapear] = useState<boolean>(!!alwaysVisible);
    const [visibleControls, setVisibleControls] = useState<boolean>(!!alwaysVisible);
    const [visibleMenu, setVisibleMenu] = useState<boolean>(false);
    const [visibleSettingsMenu, setVisibleSettingsMenu] = useState<boolean>(false);
    const [currentTime, setCurrentTime] = useState<number>(propCurrentTime || 0);
    const [dvrTimeValue, setDvrTimeValue] = useState<number>(propDvrTimeValue || duration!);

    const controlsTimeout = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        // If we are connected to Airplay, don't let the controls disappear
        setAvoidDissapear(!!alwaysVisible);
        if (!!alwaysVisible) {
            setVisibleControls(true);
        }
    }, [alwaysVisible]);

    useEffect(() => {
        if (propCurrentTime !== undefined) {
            setCurrentTime(propCurrentTime);
        }
    }, [propCurrentTime]);

    useEffect(() => {
        if (propDvrTimeValue !== undefined) {
            setDvrTimeValue(propDvrTimeValue);
        }
    }, [propDvrTimeValue]);

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
            setVisibleControls(prev => !prev);
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
        } else if (typeof propOnPress === 'function') {
            propOnPress(id, value);
        }
    }, [avoidDissapear, cancelControlsTimer, onCloseMenu, propOnPress, resetControlsTimer]);

    const onSlidingStart = useCallback((value: number) => {
        cancelControlsTimer();

        if (!avoidDissapear && typeof propOnPress === 'function') {
            propOnPress(CONTROL_ACTION.PAUSE, true);
        }

        if (typeof propOnSlidingStart === 'function') {
            propOnSlidingStart(value);
        }
    }, [avoidDissapear, cancelControlsTimer, propOnPress, propOnSlidingStart]);

    const onSlidingMove = useCallback((value: number) => {
        if (typeof propOnSlidingMove === 'function') {
            propOnSlidingMove(value);
        }
    }, [propOnSlidingMove]);

    const onSlidingComplete = useCallback((value: number) => {
        resetControlsTimer();

        if (!avoidDissapear && typeof propOnSlidingComplete === 'function') {
            propOnSlidingComplete(value);
        }

        if (typeof propOnPress === 'function') {
            propOnPress(CONTROL_ACTION.SEEK, value);
            propOnPress(CONTROL_ACTION.PAUSE, false);
        }
    }, [avoidDissapear, propOnPress, propOnSlidingComplete, resetControlsTimer]);

    const commonMenuProps = useMemo(() => ({
        menuData,
        videoIndex,
        audioIndex,
        subtitleIndex,
        speedRate,
        onPress,
        onClose: onCloseMenu
    }), [audioIndex, menuData, onCloseMenu, onPress, speedRate, subtitleIndex, videoIndex]);

    const PropMenu = useMemo(() => 
        menu ? createElement(menu, commonMenuProps) : null
    , [menu, commonMenuProps]);

    const PropSettingsMenu = useMemo(() => 
        settingsMenu ? createElement(settingsMenu, commonMenuProps) : null
    , [settingsMenu, commonMenuProps]);

    const temporalButtonsBarStyle = useMemo(() => ({
        ...styles.temporalButtonsBar,
        bottom: styles.temporalButtonsBar.bottom + (insets?.bottom || 0),
        left: styles.temporalButtonsBar.left + Math.max(insets?.left || 0, insets?.right || 0),
        right: styles.temporalButtonsBar.right + Math.max(insets?.left || 0, insets?.right || 0)
    }), [insets]);

    const showMosca = useMemo(() => 
        !visibleMenu && !visibleControls && mosca
    , [visibleMenu, visibleControls, mosca]);

    const showControls = useMemo(() => 
        avoidDissapear || visibleControls
    , [avoidDissapear, visibleControls]);

    const showTimeMarks = useMemo(() => 
        !isChangingSource && !visibleMenu && !visibleSettingsMenu && !visibleControls && !avoidDissapear
    , [visibleMenu, visibleSettingsMenu, visibleControls, avoidDissapear, isChangingSource]);

    return (
        <Pressable 
            onPress={onToggle} 
            style={styles.container} 
            accessible={!avoidDissapear && !visibleControls && !visibleMenu} 
        >
            {showMosca && mosca}

            {showControls && (
                <Controls 
                    currentTime={currentTime}
                    duration={duration}
                    dvrTimeValue={dvrTimeValue}
                    title={title}
                    thumbnailsMetadata={thumbnailsMetadata}
                    timeMarkers={timeMarkers}
                    avoidTimelineThumbnails={avoidTimelineThumbnails}
                    paused={paused}
                    muted={muted}
                    volume={volume}
                    preloading={preloading}
                    isChangingSource={isChangingSource}
                    isLive={isLive}
                    isDVR={isDVR}
                    isDVRStart={isDVRStart}
                    isContentLoaded={isContentLoaded}
                    hasNext={hasNext}
                    headerMetadata={headerMetadata}
                    sliderVOD={sliderVOD}
                    sliderDVR={sliderDVR}
                    loader={loader}
                    controlsHeaderBar={controlsHeaderBar}
                    controlsMiddleBar={controlsMiddleBar}
                    controlsBottomBar={controlsBottomBar}
                    nextButton={nextButton}
                    liveButton={liveButton}
                    skipIntroButton={skipIntroButton}
                    skipRecapButton={skipRecapButton}
                    skipCreditsButton={skipCreditsButton}
                    onPress={onPress}
                    onSlidingStart={onSlidingStart}
                    onSlidingMove={onSlidingMove}
                    onSlidingComplete={onSlidingComplete}
                    onExit={onExit}
                />
            )}

            {!isChangingSource && visibleMenu && PropMenu}

            {!isChangingSource && visibleMenu && !PropMenu && (
                <Suspense fallback={loader}>
                    <Menu
                        videoIndex={videoIndex}
                        audioIndex={audioIndex}
                        subtitleIndex={subtitleIndex}
                        menuData={menuData}
                        onPress={onPress}
                        onClose={onCloseMenu}
                    />
                </Suspense>
            )}

            {!isChangingSource && visibleSettingsMenu && PropSettingsMenu}

            {!isChangingSource && visibleSettingsMenu && !PropSettingsMenu && (
                <Suspense fallback={loader}>
                    <SettingsMenu
                        speedRate={speedRate}
                        videoIndex={videoIndex}
                        menuData={menuData}
                        onPress={onPress}
                        onClose={onCloseMenu}
                    />
                </Suspense>
            )}

            {showTimeMarks && (
                <View style={temporalButtonsBarStyle}>
                    <TimeMarks 
                        currentTime={currentTime}
                        duration={duration}
                        timeMarkers={timeMarkers}
                        hasNext={hasNext}
                        nextButton={nextButton}
                        skipIntroButton={skipIntroButton}
                        skipRecapButton={skipRecapButton}
                        skipCreditsButton={skipCreditsButton}
                        onPress={onPress}
                    />
                </View>
            )}
        </Pressable>
    );
};

export const Overlay = React.memo(OverlayBase);
