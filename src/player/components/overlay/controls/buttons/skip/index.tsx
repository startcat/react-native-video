import { Text } from '@ui-kitten/components';
import React, { useCallback, useMemo } from 'react';
import { TouchableOpacity } from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {
    type SkipButtonProps,
    CONTROL_ACTION
} from '../../../../../types';
import { styles } from './styles';

const HAPTIC_OPTIONS = {
    enableVibrateFallback: true,
    ignoreAndroidSystemSettings: true
};

const SkipButtonBase = ({
    id,
    onPress: propOnPress,
    accessibilityLabel,
    disabled = false
}: SkipButtonProps): React.ReactElement => {

    const title = useMemo(() => {
        if (id === CONTROL_ACTION.SKIP_INTRO) {
            return 'Saltar Intro';
        } else if (id === CONTROL_ACTION.SKIP_CREDITS) {
            return 'Saltar Créditos';
        }
        return '';
    }, [id]);

    const containerStyle = useMemo(() => ({
        ...styles.container,
        ...styles.asButton
    }), []);

    const handlePress = useCallback(() => {
        ReactNativeHapticFeedback.trigger('impactLight', HAPTIC_OPTIONS);
        
        if (typeof propOnPress === 'function') {
            propOnPress(id);
        }
    }, [propOnPress, id]);

    return (
        <TouchableOpacity 
            style={containerStyle}
            onPress={handlePress} 
            accessible={true} 
            accessibilityRole='button' 
            accessibilityLabel={accessibilityLabel}
            pressRetentionOffset={5}
            disabled={disabled}
        >
            <Text category='h5' style={styles.title}>{title}</Text>
        </TouchableOpacity>
    );
};

const arePropsEqual = (prevProps: SkipButtonProps, nextProps: SkipButtonProps): boolean => {
    return (
        prevProps.id === nextProps.id &&
        prevProps.onPress === nextProps.onPress &&
        prevProps.accessibilityLabel === nextProps.accessibilityLabel &&
        prevProps.disabled === nextProps.disabled
    );
};

export const SkipButton = React.memo(SkipButtonBase, arePropsEqual);