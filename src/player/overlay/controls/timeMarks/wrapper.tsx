import React, { useEffect, useState, createElement } from 'react';
import { StyleSheet, View } from 'react-native';

import {
    TimeMarkButton
} from '../buttons';

import { SPACING } from '../../../theme';

import { 
    CONTROL_ACTION,
    TIME_MARK_TYPE,
    type TimeMarksProps
} from '../../../types';

export function TimeMarks (props: TimeMarksProps): React.ReactElement {

    const [currentTime, setCurrentTime] = useState<number | undefined>(props?.currentTime);


    useEffect(() => {
        setCurrentTime(props?.currentTime);

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
                props.timeMarkers?.map((item, index) => {

                    if (item && currentTime && currentTime >= item.start && currentTime <= item.end){

                        if (item.type === TIME_MARK_TYPE.INTRO){

                            return (
                                <TimeMarkButton
                                    key={index}
                                    title='Saltar intro'
                                    value={item.end}
                                    onPress={props?.onPress}
                                />
                            )

                        }

                        if (item.type === TIME_MARK_TYPE.RECAP){
                            
                            return (
                                <TimeMarkButton
                                    key={index}
                                    title='Saltar resumen'
                                    value={item.end}
                                    onPress={props?.onPress}
                                />
                            )

                        }

                        if (item.type === TIME_MARK_TYPE.CREDITS){
                            
                            return (
                                <TimeMarkButton
                                    key={index}
                                    title='Saltar créditos'
                                    value={item.end}
                                    onPress={props?.onPress}
                                />
                            )

                        }

                        if (item.type === TIME_MARK_TYPE.NEXT_EPISODE){
                            
                            return (
                                <TimeMarkButton
                                    key={index}
                                    id={CONTROL_ACTION.NEXT}
                                    title='Siguiente capítulo'
                                    onPress={props?.onPress}
                                />
                            )

                        }

                        return (<></>)
                        
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