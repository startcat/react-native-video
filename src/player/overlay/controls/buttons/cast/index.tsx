import React from 'react';
import { SmallButton } from '../smallButton';
import { CastButton as NativeCastButton, CastContext, CastState, useCastState } from 'react-native-google-cast';
import { 
    type ButtonProps,
    CONTROL_ACTION
} from '../../../../types';

export function CastButton(props: ButtonProps): React.ReactElement | null {
    
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
            <SmallButton 
                id={id}
                onPress={onPress} 
                accessibilityLabel={props?.accessibilityLabel || 'Chromecast'}
                disabled={props.disabled}
            >
                <NativeCastButton tintColor='white' style={{width: 22, height: 22, tintColor:'white'}}/>
            </SmallButton>
        );
        
    }
};