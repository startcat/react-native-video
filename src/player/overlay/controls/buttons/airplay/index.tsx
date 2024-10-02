import React from 'react';
import { SmallButton } from '../smallButton';
import { AirplayButton as NativeAirplayButton, showRoutePicker } from 'react-airplay';
import { COLOR } from '../../../../theme';
import { 
    type ButtonProps,
    CONTROL_ACTION
} from '../../../../types';

export function AirplayButton (props: ButtonProps): React.ReactElement {

    const id = CONTROL_ACTION.AIRPLAY;
    
    const onPress = () => {
        showRoutePicker({prioritizesVideoDevices: true});

    };

    return (
        <SmallButton 
            id={id}
            onPress={onPress} 
            accessibilityLabel={props?.accessibilityLabel || 'Airplay'}
            disabled={props.disabled}
        >
            <NativeAirplayButton
                prioritizesVideoDevices={true}
                tintColor={'white'}
                activeTintColor={COLOR.theme.main}
                accessibilityRole='button'
            />
        </SmallButton>
    );
};