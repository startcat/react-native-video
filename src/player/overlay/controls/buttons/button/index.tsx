import React, { useCallback, useMemo } from 'react';
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

const ButtonComponent = ({
    id,
    iconName,
    size,
    onPress: propOnPress,
    accessibilityLabel,
    disabled = false,
    value,
    children
}: ButtonProps): React.ReactElement => {

    // Memoizamos los estilos basados en el tamaño del botón
    const { containerStylesWithSize, iconStylesWithSize } = useMemo(() => {
        let containerStyles = styles.container;
        let iconStyles = styles.icon;

        if (size === BUTTON_SIZE.SMALL) {
            containerStyles = { ...styles.container, ...styles.small };
            iconStyles = { ...styles.icon, ...styles.iconSmall };
        } else if (size === BUTTON_SIZE.MEDIUM) {
            containerStyles = { ...styles.container, ...styles.medium };
            iconStyles = { ...styles.icon, ...styles.iconMedium };
        } else if (size === BUTTON_SIZE.BIG) {
            containerStyles = { ...styles.container, ...styles.big };
            iconStyles = { ...styles.icon, ...styles.iconBig };
        }

        return { containerStylesWithSize: containerStyles, iconStylesWithSize: iconStyles };
    }, [size]);

    // Memoizamos los valores lógicos
    const isAccessible = useMemo(() => !!accessibilityLabel, [accessibilityLabel]);
    
    // Memoizamos los estilos del icono basados en el estado de disabled
    const iconStyles = useMemo(() => {
        return disabled ? [iconStylesWithSize, styles.disabled] : iconStylesWithSize;
    }, [disabled, iconStylesWithSize]);

    // Manejador de eventos con useCallback
    const handlePress = useCallback(() => {
        ReactNativeHapticFeedback.trigger('impactLight', HAPTIC_OPTIONS);

        if (typeof propOnPress === 'function') {
            propOnPress(id, value);
        }
    }, [propOnPress, id, value]);

    // Condición para mostrar el icono memoizada
    const showIcon = useMemo(() => iconName && !children, [iconName, children]);

    return (
        <TouchableOpacity 
            style={containerStylesWithSize} 
            onPress={handlePress} 
            accessible={isAccessible} 
            accessibilityRole='button' 
            accessibilityLabel={accessibilityLabel}
            pressRetentionOffset={10}
            disabled={disabled}
        >
            {showIcon && (
                <Icon 
                    name={iconName!} 
                    style={iconStyles} 
                />
            )}

            {children}
        </TouchableOpacity>
    );
};

ButtonComponent.displayName = 'Button';

export const Button = React.memo(ButtonComponent);