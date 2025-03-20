import React, { useCallback, useMemo } from 'react';
import { Button } from '../button';
import { CastButton as NativeCastButton, CastContext, CastState, useCastState } from 'react-native-google-cast';
import { 
    type AirplayCastButtonProps,
    BUTTON_SIZE,
    CONTROL_ACTION
} from '../../../../types';

const CastButton = ({ 
    onPress: propOnPress, 
    accessibilityLabel = 'Chromecast', 
    disabled = false 
}: AirplayCastButtonProps): React.ReactElement | null => {
    
    const id = useMemo(() => CONTROL_ACTION.CAST, []);
    const castState = useCastState();

    const handlePress = useCallback(() => {
        // Enfoque más seguro para manejar la función de la prop
        if (typeof propOnPress === 'function') {
            propOnPress(id);
        }

        try {
            CastContext.showCastDialog();
        } catch(err) {
            // Manejo silencioso de errores
        }
    }, [id, propOnPress]);

    const shouldRenderButton = useMemo(() => 
        castState !== CastState.NO_DEVICES_AVAILABLE, 
    [castState]);

    const castButtonStyle = useMemo(() => ({
        width: 22, 
        height: 22, 
        tintColor: 'white'
    }), []);

    if (!shouldRenderButton) {
        return null;
    }

    return (
        <Button 
            id={id}
            onPress={handlePress} 
            accessibilityLabel={accessibilityLabel}
            disabled={disabled}
            size={BUTTON_SIZE.SMALL}
        >
            <NativeCastButton tintColor='white' style={castButtonStyle} />
        </Button>
    );
};

// Comparador personalizado para evitar renderizados innecesarios
const arePropsEqual = (prevProps: AirplayCastButtonProps, nextProps: AirplayCastButtonProps): boolean => {
    return (
        prevProps.disabled === nextProps.disabled &&
        prevProps.accessibilityLabel === nextProps.accessibilityLabel &&
        prevProps.onPress === nextProps.onPress
    );
};

export default React.memo(CastButton, arePropsEqual);