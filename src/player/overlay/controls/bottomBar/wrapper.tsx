import React, { useEffect, useState, useRef } from 'react';
import { View } from 'react-native';
import { SmallButton, LiveButton } from '../buttons';
import { Text } from '@ui-kitten/components';
import { CONTROL_ACTION } from '../../../types';
import { styles } from './styles';

interface Props {
    currentTime?: number;
    duration?: number;
    dvrTimeValue?: number;
    title?: string;
    muted?: boolean;
    isLive?: boolean;
    isDVR?: boolean;
    isContentLoaded?: boolean;
    hasNext?: boolean;
    volume?: number;
    onPress?: (id: CONTROL_ACTION, value?: any) => void;
}

export const BottomBar = (props: Props) => {

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

    const MenuButton = () => (
        <SmallButton
            id={CONTROL_ACTION.MENU}
            iconName='chatbox-ellipses-outline'
            disabled={!props.isContentLoaded}
            onPress={props?.onPress}
        />
    );

    const SettingsMenuButton = () => (
        <SmallButton
            id={CONTROL_ACTION.SETTINGS_MENU}
            iconName='settings-outline'
            disabled={!props.isContentLoaded}
            onPress={props?.onPress}
        />
    );

    const MuteButton = () => (
        <SmallButton
            id={CONTROL_ACTION.MUTE}
            iconName={ (isMuted) ? 'volume-mute-outline' : 'volume-high-outline'}
            value={!isMuted}
            onPress={props?.onPress}
        />
    );

    const VolumeButton = () => (
        <SmallButton
            id={CONTROL_ACTION.VOLUME}
            iconName='volume-high-outline'
            value={currentVolume}
            onPress={props?.onPress}
        />
    );

    const NextButton = () => (
        <SmallButton
            id={CONTROL_ACTION.NEXT}
            iconName='play-skip-forward-outline'
            disabled={!props.isContentLoaded}
            onPress={props?.onPress}
        />
    );

    const RestartButton = () => (
        <SmallButton
            id={CONTROL_ACTION.SEEK}
            iconName='refresh-outline'
            value={0}
            disabled={!props.isContentLoaded}
            onPress={props?.onPress}
        />
    );

    return (
        <View style={styles.container}>
            <View style={styles.left}>
                <MenuButton />
                <SettingsMenuButton />
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
                    isLive.current ?
                        <LiveButton 
                            currentTime={props?.currentTime}
                            duration={props?.duration}
                            dvrTimeValue={props?.dvrTimeValue}
                            isDVR={isDVR.current}
                            disabled={!props.isContentLoaded}
                            onPress={props?.onPress} 
                        />
                    : null
                }

            </View>
        </View>
    );

};
