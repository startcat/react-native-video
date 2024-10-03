import React, { useEffect, useState, useRef } from 'react';
import { TouchableOpacity, StyleProp, ViewStyle, TextStyle } from 'react-native';
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
    const containerStylesWithSize = useRef<StyleProp<ViewStyle>>(styles.container);
    const iconStylesWithSize = useRef<StyleProp<TextStyle>>(styles.icon);

    useEffect(() => {
        if (props.size === BUTTON_SIZE.SMALL){
            containerStylesWithSize.current = [styles.container, styles.small];
            iconStylesWithSize.current = [styles.icon, styles.iconSmall];
        }

        if (props.size === BUTTON_SIZE.MEDIUM){
            containerStylesWithSize.current = [styles.container, styles.medium];
            iconStylesWithSize.current = [styles.icon, styles.iconMedium];
        }

        if (props.size === BUTTON_SIZE.BIG){
            containerStylesWithSize.current = [styles.container, styles.big];
            iconStylesWithSize.current = [styles.icon, styles.iconBig];
        }

    }, [props?.size]);

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
            style={containerStylesWithSize.current} 
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
                        style={ (props.disabled) ? [iconStylesWithSize.current, styles.disabled] : iconStylesWithSize.current} 
                    />
                : null
            }

            { props?.children }
        </TouchableOpacity>
    );
};