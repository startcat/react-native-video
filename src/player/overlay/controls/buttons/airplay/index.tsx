import React from 'react';
import { SmallButton } from '../smallButton';
import { AirplayButton as NativeAirplayButton, showRoutePicker } from 'react-airplay';
import { COLOR } from '../../../../theme';
import { CONTROL_ACTION } from '../../../../types';

interface ButtonProps {
    disabled?: boolean;
    onPress?: (id: CONTROL_ACTION) => void;
}

export const AirplayButton = (props: ButtonProps) => {

    const id = CONTROL_ACTION.AIRPLAY;
    
    const onPress = () => {
        showRoutePicker({prioritizesVideoDevices: true});

    };

    return (
        <SmallButton 
            id={id}
            onPress={onPress} 
            accessibilityLabel={'Airplay'}
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