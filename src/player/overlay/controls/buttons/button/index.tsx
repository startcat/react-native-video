import React, { useEffect, useState } from 'react';
import { TouchableOpacity } from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { Icon } from '@ui-kitten/components';
import { styles } from './styles';
import { 
    type ButtonProps,
    BUTTON_SIZE,
} from '../../../../types';

const HAPTIC_OPTIONS = {
    enableVibrateFallback: true,
    ignoreAndroidSystemSettings: true
};

export function Button (props: ButtonProps): React.ReactElement {

    const [iconName, setIconName] = useState<string | undefined>(props?.iconName);

    let containerStylesWithSize = styles.container;
    let iconStylesWithSize = styles.icon;

    if (props.size === BUTTON_SIZE.SMALL){
        containerStylesWithSize = { ...styles.container, ...styles.small };
        iconStylesWithSize = { ...styles.icon, ...styles.iconSmall };
    }

    if (props.size === BUTTON_SIZE.MEDIUM){
        containerStylesWithSize = { ...styles.container, ...styles.medium };
        iconStylesWithSize = { ...styles.icon, ...styles.iconMedium };
    }

    if (props.size === BUTTON_SIZE.BIG){
        containerStylesWithSize = { ...styles.container, ...styles.big };
        iconStylesWithSize = { ...styles.icon, ...styles.iconBig };
    }

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
            style={containerStylesWithSize} 
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
                        style={ (props.disabled) ? [iconStylesWithSize, styles.disabled] : iconStylesWithSize} 
                    />
                : null
            }

            { props?.children }
        </TouchableOpacity>
    );
};