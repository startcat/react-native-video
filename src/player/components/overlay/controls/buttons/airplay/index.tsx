import React, { useCallback, useMemo } from 'react';
import { Button } from '../button';
import { AirplayButton as NativeAirplayButton, showRoutePicker } from 'react-airplay';
import { COLOR } from '../../../../../theme';
import { 
    type AirplayCastButtonProps,
    BUTTON_SIZE,
    CONTROL_ACTION
} from '../../../../../types';

const AirplayButton = ({ 
    accessibilityLabel = 'Airplay', 
    disabled = false
}: AirplayCastButtonProps): React.ReactElement => {
    const id = useMemo(() => CONTROL_ACTION.AIRPLAY, []);
    
    const handlePress = useCallback(() => {
        showRoutePicker({ prioritizesVideoDevices: true });
    }, []);

    const airplayButtonProps = useMemo(() => ({
        prioritizesVideoDevices: true,
        tintColor: 'white',
        activeTintColor: COLOR.theme.main,
        accessibilityRole: 'button' as const
    }), []);

    return (
        <Button 
            id={id}
            onPress={handlePress} 
            accessibilityLabel={accessibilityLabel}
            disabled={disabled}
            size={BUTTON_SIZE.SMALL}
        >
            <NativeAirplayButton {...airplayButtonProps} />
        </Button>
    );
};

// Comparador personalizado para evitar renderizados innecesarios
const arePropsEqual = (prevProps: AirplayCastButtonProps, nextProps: AirplayCastButtonProps): boolean => {
    return (
        prevProps.disabled === nextProps.disabled &&
        prevProps.accessibilityLabel === nextProps.accessibilityLabel
    );
};

export default React.memo(AirplayButton, arePropsEqual);