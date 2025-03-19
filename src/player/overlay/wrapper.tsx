import React, { useEffect, useState, useRef, createElement } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Controls, TimeMarks } from './controls';
import { Menu } from './menu';
import { SettingsMenu } from './settingsMenu';
import { 
    type OverlayProps,
    CONTROL_ACTION 
} from '../types';
import { styles } from './styles';

const PLAYER_HIDE_CONTROLS = 5000;

export function Overlay (props: OverlayProps): React.ReactElement {

    const insets = useSafeAreaInsets();

    const [avoidDissapear, setAvoidDissapear] = useState<boolean>(!!props.alwaysVisible);
    const [visibleControls, setVisibleControls] = useState<boolean>(!!props.alwaysVisible);
    const [visibleMenu, setVisibleMenu] = useState<boolean>(false);
    const [visibleSettingsMenu, setVisibleSettingsMenu] = useState<boolean>(false);

    const controlsTimeout = useRef<ReturnType<typeof setInterval> | null>(null);

    const [currentTime, setCurrentTime] = useState<number>(props?.currentTime!);
    const [dvrTimeValue, setDvrTimeValue] = useState<number>(props?.dvrTimeValue!);

    useEffect(() => {
        // If we are connected to Airplay, don't let the controls dissapear
        setAvoidDissapear(!!props.alwaysVisible);
        if (avoidDissapear){
            setVisibleControls(true);
        }

    }, [props.alwaysVisible]);

    useEffect(() => {
        setCurrentTime(props?.currentTime!);

    }, [props.currentTime]);

    useEffect(() => {
        setDvrTimeValue(props?.dvrTimeValue!);

    }, [props.dvrTimeValue]);

    useEffect(() => {
        resetControlsTimer();

    }, [visibleControls]);

    // Controls Autohide Timer
    const resetControlsTimer = () => {

        cancelControlsTimer();
        
        if (visibleControls && !avoidDissapear){
            controlsTimeout.current = setTimeout(() => setVisibleControls(false), PLAYER_HIDE_CONTROLS);

        }

    }

    const cancelControlsTimer = () => {

        if (controlsTimeout.current){
            clearTimeout(controlsTimeout.current);

        }

    }

    // Actions
    const onToggle = () => {

        if (!avoidDissapear){
            setVisibleControls(!visibleControls);
        }

    }

    const onCloseMenu = () => {

        setVisibleMenu(false);
        setVisibleSettingsMenu(false);

        if (!avoidDissapear){
            setVisibleControls(false);
        }

    }

    const onPress = (id:CONTROL_ACTION, value?:any) => {

        resetControlsTimer();

        if (id === CONTROL_ACTION.MENU){
            if (!avoidDissapear){
                setVisibleControls(false);
            }
            setVisibleMenu(true);
            setVisibleSettingsMenu(false);
            cancelControlsTimer();

        } else if (id === CONTROL_ACTION.SETTINGS_MENU){
            if (!avoidDissapear){
                setVisibleControls(false);
            }
            setVisibleMenu(false);
            setVisibleSettingsMenu(true);
            cancelControlsTimer();

        } else if (id === CONTROL_ACTION.MENU_CLOSE){
            onCloseMenu();

        } else if (props?.onPress){
            props?.onPress(id, value);
        }

    }

    const onSlidingStart = (value: number) => {

        cancelControlsTimer();

        if (props?.onPress){
            props?.onPress(CONTROL_ACTION.PAUSE, true);
        }

        if (props?.onSlidingStart){
            props?.onSlidingStart(value);
        }

    }

    const onSlidingMove = (value: number) => {

        if (props?.onSlidingMove){
            props?.onSlidingMove(value);
        }

    }

    const onSlidingComplete = (value: number) => {

        resetControlsTimer();

        if (props?.onSlidingComplete){
            props?.onSlidingComplete(value);
        }

        if (props?.onPress){
            props?.onPress(CONTROL_ACTION.SEEK, value);
            props?.onPress(CONTROL_ACTION.PAUSE, false);
        }

    }

    // Optional Component Layers
    const PropMenu = props.menu ? createElement(props.menu, { 
        menuData: props.menuData,
        videoIndex: props.videoIndex,
        audioIndex: props.audioIndex,
        subtitleIndex: props.subtitleIndex,
        speedRate: props.speedRate,
        onPress: onPress,
        onClose: onCloseMenu

    }) : null;

    const PropSettingsMenu = props.settingsMenu ? createElement(props.settingsMenu, { 
        menuData: props.menuData,
        videoIndex: props.videoIndex,
        audioIndex: props.audioIndex,
        subtitleIndex: props.subtitleIndex,
        speedRate: props.speedRate,
        onPress: onPress,
        onClose: onCloseMenu

    }) : null;

    return (
        <Pressable 
            onPress={onToggle} 
            style={styles.container} 
            accessible={!avoidDissapear && !visibleControls && !visibleMenu} 
        >

            {
                !visibleMenu && !visibleControls && props?.mosca ?
                    props?.mosca
                : null
            }

            {
                // Player Controls
                avoidDissapear || visibleControls ?
                    <Controls 
                        currentTime={currentTime}
                        duration={props?.duration}
                        dvrTimeValue={dvrTimeValue}
                        title={props?.title}

                        thumbnailsMetadata={props?.thumbnailsMetadata}
                        timeMarkers={props.timeMarkers}

                        paused={props?.paused}
                        muted={props?.muted}
                        volume={props?.volume}
                        preloading={props?.preloading}

                        isLive={props?.isLive}
                        isDVR={props?.isDVR}
                        isContentLoaded={props?.isContentLoaded}
                        hasNext={props?.hasNext}

                        // Components
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

                        // Events
                        onPress={onPress}
                        onSlidingStart={onSlidingStart}
                        onSlidingMove={onSlidingMove}
                        onSlidingComplete={onSlidingComplete}
                    />
                : null
            }

            {
                // Player External Menu
                visibleMenu && PropMenu ? PropMenu : null
            }

            {
                // Player Menu
                visibleMenu && !PropMenu ?
                    <Menu
                        videoIndex={props.videoIndex}
                        audioIndex={props.audioIndex}
                        subtitleIndex={props.subtitleIndex}
                        menuData={props.menuData}

                        // Events
                        onPress={onPress}
                        onClose={onCloseMenu}
                    />
                : null
            }

            {
                // Player External Settings Menu
                visibleSettingsMenu && PropSettingsMenu ? PropSettingsMenu : null
            }

            {
                // Player Settings Menu
                visibleSettingsMenu && !PropSettingsMenu ?
                    <SettingsMenu
                        speedRate={props.speedRate}
                        videoIndex={props.videoIndex}
                        menuData={props.menuData}

                        // Events
                        onPress={onPress}
                        onClose={onCloseMenu}
                    />
                : null
            }

            {
                // Timed Buttons (Saltar intro...)
                !visibleMenu && !visibleSettingsMenu && !visibleControls && !avoidDissapear ?
                    <View 
                        style={{
                            ...styles.temporalButtonsBar,
                            bottom: styles.temporalButtonsBar.bottom + insets?.bottom,
                            left: styles.temporalButtonsBar.left + Math.max(insets.left, insets.right),
                            right: styles.temporalButtonsBar.right + Math.max(insets.left, insets.right)
                        }}
                    >

                        <TimeMarks 
                            currentTime={props.currentTime}
                            duration={props.duration}
                            timeMarkers={props.timeMarkers}
                            hasNext={props.hasNext}

                            // Components
                            nextButton={props.nextButton}
                            skipIntroButton={props.skipIntroButton}
                            skipRecapButton={props.skipRecapButton}
                            skipCreditsButton={props.skipCreditsButton}
                            
                            // Events
                            onPress={onPress}
                        />
                                            
                    </View>
                : null
            }

        </Pressable>
    );

};
