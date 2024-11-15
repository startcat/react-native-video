import React, { useEffect, useState, createElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@ui-kitten/components';

import {
    Button
} from '../buttons';

import { SPACING } from '../../../theme';

import { 
    CONTROL_ACTION,
    BUTTON_SIZE,
    TIME_MARK_TYPE,
    type TimeMarksProps
} from '../../../types';

export function TimeMarks (props: TimeMarksProps): React.ReactElement {

    const [sliderValueVOD, setSliderValueVOD] = useState<number | undefined>(props?.currentTime);


    useEffect(() => {
        

    }, [props?.currentTime]);

    // const SliderVOD = props.sliderVOD ? createElement(props.sliderVOD, { 
    //     currentTime: props?.currentTime,
    //     duration: props?.duration,
    //     onSlidingStart: onSlidingStart,
    //     onSlidingMove: onSlidingMove,
    //     onSlidingComplete: onSlidingComplete
    // }) : null;

    // const SliderDVR = props.sliderDVR ? createElement(props.sliderDVR, { 
    //     value: props?.dvrTimeValue,
    //     liveLoadTime: props?.duration,
    //     onSlidingStart: onSlidingStart,
    //     onSlidingMove: onSlidingMove,
    //     onSlidingComplete: onSlidingComplete
    // }) : null;

    return (
        <View style={styles.container}>

            {
                props.currentTime && props.timeMarkers?.map(item => {

                    if (item && props.currentTime && props.currentTime >= item.start && props.currentTime <= item.end){

                        if (item.type === TIME_MARK_TYPE.INTRO){

                            return (
                                <Button
                                    id={CONTROL_ACTION.SEEK}
                                    value={item.end}
                                    size={BUTTON_SIZE.SMALL}
                                    onPress={props?.onPress}
                                >
                                    <Text category='h5'>Saltar intro</Text>
                                </Button>
                            )

                        }

                        if (item.type === TIME_MARK_TYPE.RECAP){
                            
                            return (
                                <Button
                                    id={CONTROL_ACTION.SEEK}
                                    value={item.end}
                                    size={BUTTON_SIZE.SMALL}
                                    onPress={props?.onPress}
                                >
                                    <Text category='h5'>Saltar resumen</Text>
                                </Button>
                            )

                        }

                        if (item.type === TIME_MARK_TYPE.CREDITS){
                            
                            return (
                                <Button
                                    id={CONTROL_ACTION.SEEK}
                                    value={item.end}
                                    size={BUTTON_SIZE.SMALL}
                                    onPress={props?.onPress}
                                >
                                    <Text category='h5'>Saltar créditos</Text>
                                </Button>
                            )

                        }

                        if (item.type === TIME_MARK_TYPE.NEXT_EPISODE){
                            
                            return (
                                <Button
                                    id={CONTROL_ACTION.NEXT}
                                    size={BUTTON_SIZE.SMALL}
                                    onPress={props?.onPress}
                                >
                                    <Text category='h5'>Siguiente capítulo</Text>
                                </Button>
                            )

                        }
                        
                    } else {
                        return (<></>)
                    }

                })
            }

        </View>
    );

};

const styles = StyleSheet.create({
    container:{
        width:'100%',
        height:50,
        backgroundColor:'purple'
    },
});