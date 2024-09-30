import React, { useEffect, useState } from 'react';
import { TouchableOpacity } from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { Icon } from '@ui-kitten/components';
import { styles } from './styles';
import { CONTROL_ACTION } from '../../../../types';

interface ButtonProps {
    id: CONTROL_ACTION;
    iconName?: string;
    value?: boolean | number;
    accessibilityLabel?: string;
    disabled?: boolean;
    children?: React.ReactNode | undefined;
    onPress?: (id: CONTROL_ACTION, value?: any) => void;
}

const HAPTIC_OPTIONS = {
    enableVibrateFallback: true,
    ignoreAndroidSystemSettings: true
};

export const SmallButton = (props: ButtonProps) => {

    const [iconName, setIconName] = useState<string | undefined>(props?.iconName);

    useEffect(() => {
        setIconName(props?.iconName);

    }, [props?.iconName]);

    const onPress = () => {

        ReactNativeHapticFeedback.trigger('impactLight', HAPTIC_OPTIONS);

        if (props?.onPress){
            props?.onPress(props?.id, props?.value);

        }
    };

    return (
        <TouchableOpacity 
            style={styles.container} 
            onPress={onPress} 
            accessible={!!props?.accessibilityLabel} 
            accessibilityRole='button' 
            accessibilityLabel={props?.accessibilityLabel}
            pressRetentionOffset={5}
            disabled={props.disabled}
        >
            {
                iconName && !props?.children ?
                    <Icon 
                        name={iconName} 
                        style={ (props.disabled) ? [styles.icon, styles.disabled] : styles.icon} 
                    />
                : null
            }

            { props?.children }
        </TouchableOpacity>
    );
};