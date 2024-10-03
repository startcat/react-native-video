import React from 'react';
import { Button } from '../button';
import { AirplayButton as NativeAirplayButton, showRoutePicker } from 'react-airplay';
import { COLOR } from '../../../../theme';
import { 
    type AirplayCastButtonProps,
    BUTTON_SIZE,
    CONTROL_ACTION
} from '../../../../types';

export function AirplayButton (props: AirplayCastButtonProps): React.ReactElement {

    const id = CONTROL_ACTION.AIRPLAY;
    
    const onPress = () => {
        showRoutePicker({prioritizesVideoDevices: true});

    };

    return (
        <Button 
            id={id}
            onPress={onPress} 
            accessibilityLabel={props?.accessibilityLabel || 'Airplay'}
            disabled={props.disabled}
            size={BUTTON_SIZE.SMALL}
        >
            <NativeAirplayButton
                prioritizesVideoDevices={true}
                tintColor={'white'}
                activeTintColor={COLOR.theme.main}
                accessibilityRole='button'
            />
        </Button>
    );
};