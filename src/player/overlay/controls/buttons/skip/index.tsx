import React, { useEffect, useState } from 'react';
import { TouchableOpacity } from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { Text } from '@ui-kitten/components';
import { styles } from './styles';
import { CONTROL_ACTION } from '../../../../types';

interface ButtonProps {
    id: CONTROL_ACTION.SKIP_INTRO | CONTROL_ACTION.SKIP_CREDITS;
    currentTime?: number;
    disabled?: boolean;
    onPress?: (id: CONTROL_ACTION, value?: any) => void;
}

const HAPTIC_OPTIONS = {
    enableVibrateFallback: true,
    ignoreAndroidSystemSettings: true
};

export const SkipButton = (props: ButtonProps) => {

    const [isBehindLive, setIsBehindLive] = useState<boolean>(false);
    const [title, setTitle] = useState<string>('');

    useEffect(() => {
        
        if (props?.id === CONTROL_ACTION.SKIP_INTRO){
            setTitle('Saltar Intro');

        } else if (props?.id === CONTROL_ACTION.SKIP_CREDITS){
            setTitle('Saltar Créditos');

        }

    }, []);

    const onPress = () => {

        ReactNativeHapticFeedback.trigger('impactLight', HAPTIC_OPTIONS);

        if (props?.onPress){
            props?.onPress(props?.id);

        }
    };

    return (
        <TouchableOpacity 
            style={{ ...styles.container, ...styles.asButton }} 
            onPress={onPress} 
            accessible={true} 
            accessibilityRole='button' 
            pressRetentionOffset={5}
            disabled={props.disabled}
        >
            <Text category='h5' style={styles.title}>{ title }</Text>
        </TouchableOpacity>
    );

};