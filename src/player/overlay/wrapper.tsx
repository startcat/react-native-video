import React, { useEffect, useState, useRef } from 'react';
import { Pressable } from 'react-native';
import { Controls } from './controls';
import { Mosca } from './mosca';
import { Menu } from './menu';
import { SettingsMenu } from './settingsMenu';
import { SkipButtons } from './skip';
import { 
    IThumbnailMetadata, 
    IPlayerMenuData,
    CONTROL_ACTION 
} from '../types';
import { styles } from './styles';

interface Props {
    title?:string;
    currentTime?: number;
    dvrTimeValue?: number;
    duration?: number;
    paused?: boolean;
    muted?: boolean;
    volume?: number;
    preloading?: boolean;
    hasNext?: boolean;
    thumbnailsMetadata?: IThumbnailMetadata;
    
    alwaysVisible?: boolean;
    
    isLive?: boolean;
    isDVR?: boolean;
    isContentLoaded?: boolean;
    
    menuData?: Array<IPlayerMenuData>;
    videoIndex?: number;
    audioIndex?: number;
    subtitleIndex?: number;
    speedRate?: number;

    // Components
    mosca?: React.ReactNode;
    controlsHeader?: React.ReactNode;

    // Events
    onPress?: (id: CONTROL_ACTION, value?:any) => void;
    onSlidingStart?: (value: number) => void;
    onSlidingMove?: (value: number) => void;
    onSlidingComplete?: (value: number) => void;
}

const PLAYER_HIDE_CONTROLS = 5000;

export const Overlay = (props: Props) => {

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
                false && !visibleControls ?
                    <SkipButtons 
                        currentTime={currentTime}
                        onPress={onPress}
                    />
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
                        header={props?.controlsHeader}

                        thumbnailsMetadata={props?.thumbnailsMetadata}

                        paused={props?.paused}
                        muted={props?.muted}
                        volume={props?.volume}
                        preloading={props?.preloading}

                        isLive={props?.isLive}
                        isDVR={props?.isDVR}
                        isContentLoaded={props?.isContentLoaded}
                        hasNext={props?.hasNext}

                        onPress={onPress}
                        onSlidingStart={onSlidingStart}
                        onSlidingMove={onSlidingMove}
                        onSlidingComplete={onSlidingComplete}
                    />
                : null
            }

            {
                // Player Menu
                visibleMenu ?
                    <Menu
                        videoIndex={props.videoIndex}
                        audioIndex={props.audioIndex}
                        subtitleIndex={props.subtitleIndex}
                        menuData={props.menuData}

                        onPress={onPress}
                        onClose={onCloseMenu}
                    />
                : null
            }

            {
                // Player Settings Menu
                visibleSettingsMenu ?
                    <SettingsMenu
                        speedRate={props.speedRate}
                        videoIndex={props.videoIndex}
                        menuData={props.menuData}

                        onPress={onPress}
                        onClose={onCloseMenu}
                    />
                : null
            }

        </Pressable>
    );

};
