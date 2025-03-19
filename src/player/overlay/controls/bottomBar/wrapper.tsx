import React, { useEffect, useState, useRef, createElement } from 'react';
import { View } from 'react-native';
import { Button, LiveButton } from '../buttons';
import { Text } from '@ui-kitten/components';
import { 
    CONTROL_ACTION,
    BUTTON_SIZE,
    type ControlsBarProps
} from '../../../types';
import { styles } from './styles';

export function ControlsBottomBar (props: ControlsBarProps): React.ReactElement {

    const [title, setTitle] = useState<string | undefined>(props?.title);
    const [isMuted, setIsMuted] = useState<boolean>(!!props?.muted);
    const [hasNext, setHasNext] = useState<boolean>(!!props?.hasNext);
    const [currentVolume, setCurrentVolume] = useState<number | undefined>(props?.volume);

    const isLive = useRef<boolean>(!!props?.isLive);
    const isDVR = useRef<boolean>(!!props?.isDVR);

    useEffect(() => {
        setTitle(props?.title);

    }, [props?.title]);

    useEffect(() => {
        setIsMuted(!!props?.muted);

    }, [props?.muted]);

    useEffect(() => {
        setHasNext(!!props?.hasNext);

    }, [props.hasNext]);

    useEffect(() => {
        setCurrentVolume(props?.volume);

    }, [props?.volume]);

    const LiveButtonProp = props.liveButton ? createElement(props.liveButton, { 
        currentTime: props?.currentTime,
        duration: props?.duration,
        dvrTimeValue: props?.dvrTimeValue,
        isDVR: isDVR.current,
        disabled: !props.isContentLoaded,
        onPress: props?.onPress

    }) : null;

    const MenuButton = () => (
        <Button
            id={CONTROL_ACTION.MENU}
            size={BUTTON_SIZE.SMALL}
            iconName='chatbox-ellipses-outline'
            disabled={!props.isContentLoaded}
            onPress={props?.onPress}
        />
    );

    const SettingsMenuButton = () => (
        <Button
            id={CONTROL_ACTION.SETTINGS_MENU}
            size={BUTTON_SIZE.SMALL}
            iconName='settings-outline'
            disabled={!props.isContentLoaded}
            onPress={props?.onPress}
        />
    );

    const MuteButton = () => (
        <Button
            id={CONTROL_ACTION.MUTE}
            size={BUTTON_SIZE.SMALL}
            iconName={ (isMuted) ? 'volume-mute-outline' : 'volume-high-outline'}
            value={!isMuted}
            onPress={props?.onPress}
        />
    );

    const VolumeButton = () => (
        <Button
            id={CONTROL_ACTION.VOLUME}
            size={BUTTON_SIZE.SMALL}
            iconName='volume-high-outline'
            value={currentVolume}
            onPress={props?.onPress}
        />
    );

    const NextButton = () => (
        <Button
            id={CONTROL_ACTION.NEXT}
            size={BUTTON_SIZE.SMALL}
            iconName='play-skip-forward-outline'
            disabled={!props.isContentLoaded}
            onPress={props?.onPress}
        />
    );



    const RestartButton = () => (
        <Button
            id={CONTROL_ACTION.SEEK}
            size={BUTTON_SIZE.SMALL}
            iconName='refresh-outline'
            value={0}
            disabled={!props.isContentLoaded}
            onPress={props?.onPress}
        />
    );

    return (
        <View style={styles.container}>
            <View style={styles.left}>
                {
                    !isLive.current &&
                    <>
                        <MenuButton />
                        <SettingsMenuButton />
                    </>
                }

                <MuteButton />

            </View>

            <View style={styles.middle}>
                {
                    title ?
                        <Text category='h4' style={styles.title} ellipsizeMode='tail' numberOfLines={1}>{ title }</Text>
                    :null
                }
            </View>

            <View style={styles.right}>

                {
                    !isLive.current || isDVR.current ?
                        <RestartButton />
                    : null
                }
                
                {
                    hasNext ?
                        <NextButton />
                    : null
                }

                {
                    isLive.current && LiveButtonProp
                }

                {
                    isLive.current && !LiveButtonProp &&
                    <LiveButton 
                        currentTime={props?.currentTime}
                        duration={props?.duration}
                        dvrTimeValue={props?.dvrTimeValue}
                        isDVR={isDVR.current}
                        disabled={!props.isContentLoaded}
                        onPress={props?.onPress} 
                    />
                }

            </View>
        </View>
    );

};
