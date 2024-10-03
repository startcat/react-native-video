import React from 'react';
import { Button } from '../button';
import { CastButton as NativeCastButton, CastContext, CastState, useCastState } from 'react-native-google-cast';
import { 
    type AirplayCastButtonProps,
    BUTTON_SIZE,
    CONTROL_ACTION
} from '../../../../types';

export function CastButton(props: AirplayCastButtonProps): React.ReactElement | null {
    
    const id = CONTROL_ACTION.CAST;
    const castState = useCastState();

    const onPress = () => {

        if (props?.onPress){
            props?.onPress(id);

        }

        try {
            CastContext.showCastDialog();
        } catch(err){

        }
        

    };

    if (castState === CastState.NO_DEVICES_AVAILABLE){
        return null;
        
    } else {

        return (
            <Button 
                id={id}
                onPress={onPress} 
                accessibilityLabel={props?.accessibilityLabel || 'Chromecast'}
                disabled={props.disabled}
                size={BUTTON_SIZE.SMALL}
            >
                <NativeCastButton tintColor='white' style={{width: 22, height: 22, tintColor:'white'}}/>
            </Button>
        );
        
    }
};