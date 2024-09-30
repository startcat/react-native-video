import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { Text } from '@ui-kitten/components';
import { i18n } from 'locales';
import { styles } from './styles';
import { CONTROL_ACTION } from '../../../../types';

interface ButtonProps {
    currentTime?: number;
    duration?: number;
    dvrTimeValue?: number;
    isDVR?: boolean;
    disabled?: boolean;
    onPress?: (id: CONTROL_ACTION, value?: any) => void;
}

const HAPTIC_OPTIONS = {
    enableVibrateFallback: true,
    ignoreAndroidSystemSettings: true
};

export const LiveButton = (props: ButtonProps) => {

    const [isBehindLive, setIsBehindLive] = useState<boolean>();

    useEffect(() => {
        
        if (!!props?.isDVR && typeof(props.dvrTimeValue) === 'number' && typeof(props?.duration) === 'number'){

            if (props.dvrTimeValue < props?.duration && !isBehindLive){
                setIsBehindLive(true);

            } else if (props.dvrTimeValue === props?.duration && isBehindLive){
                setIsBehindLive(false);

            }

        }

    }, [props?.dvrTimeValue, props?.duration]);

    const onPress = () => {

        ReactNativeHapticFeedback.trigger('impactLight', HAPTIC_OPTIONS);

        if (props?.onPress){
            props?.onPress(CONTROL_ACTION.SEEK, props?.duration);

        }
    };

    if (isBehindLive){
        return (
            <TouchableOpacity 
                style={{ ...styles.container, ...styles.asButton }} 
                onPress={onPress} 
                accessible={true} 
                accessibilityRole='button' 
                accessibilityLabel={i18n.t('goToLive')}
                pressRetentionOffset={5}
                disabled={props.disabled}
            >
                <Text category='h5' style={styles.title}>{ i18n.t('goToLive') }</Text>
            </TouchableOpacity>
        );

    } else {
        return (
            <View style={styles.container}>
                <Text category='h5' style={styles.title}>{ i18n.t('video_live') }</Text>
            </View>
        );
    }

};