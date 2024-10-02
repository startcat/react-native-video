import React, { useEffect, useState } from 'react';
import { TouchableOpacity } from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { Icon } from '@ui-kitten/components';
import { styles } from './styles';
import { 
    type ButtonProps
} from '../../../../types';

const HAPTIC_OPTIONS = {
    enableVibrateFallback: true,
    ignoreAndroidSystemSettings: true
};

export function BigButton (props: ButtonProps): React.ReactElement {

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
            pressRetentionOffset={10}
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