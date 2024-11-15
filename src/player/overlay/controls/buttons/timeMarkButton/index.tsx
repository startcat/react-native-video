import React from 'react';
import { TouchableOpacity } from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { Text } from '@ui-kitten/components';
import { styles } from './styles';
import { 
    type TimeMarkButtonProps,
    CONTROL_ACTION
} from '../../../../types';

const HAPTIC_OPTIONS = {
    enableVibrateFallback: true,
    ignoreAndroidSystemSettings: true
};

export function TimeMarkButton (props: TimeMarkButtonProps): React.ReactElement {

    const onPress = () => {

        ReactNativeHapticFeedback.trigger('impactLight', HAPTIC_OPTIONS);

        if (props?.onPress){
            props?.onPress(props.id || CONTROL_ACTION.SEEK, props.value);

        }
    };

    return (
        <TouchableOpacity 
            style={{ ...styles.container, ...styles.asButton }} 
            onPress={onPress} 
            accessible={true} 
            accessibilityRole='button' 
            accessibilityLabel={props?.accessibilityLabel}
            pressRetentionOffset={5}
            disabled={props.disabled}
        >
            <Text category='h5' style={styles.title}>{ props.title }</Text>
        </TouchableOpacity>
    );

};