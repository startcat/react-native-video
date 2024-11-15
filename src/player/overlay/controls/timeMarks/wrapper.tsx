import React, { useEffect, useState, createElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../../../theme';

import { 
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