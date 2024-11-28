import React, { useEffect, useState, createElement } from 'react';
import { StyleSheet, View } from 'react-native';

import {
    TimeMarkButton
} from '../buttons';

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

    const onPress = (id: CONTROL_ACTION, value?:any) => {

        if (props?.onPress){
            props?.onPress(id, value);
        }

    }

    const onPressSkipIntroExternalComponent = () => {

        const timeEntry = props.timeMarkers?.find(item => item.type === TIME_MARK_TYPE.INTRO);

        if (timeEntry){
            onPress(CONTROL_ACTION.SEEK, timeEntry.end);
        }

    }

    const onPressSkipRecapExternalComponent = () => {

        const timeEntry = props.timeMarkers?.find(item => item.type === TIME_MARK_TYPE.RECAP);

        if (timeEntry){
            onPress(CONTROL_ACTION.SEEK, timeEntry.end);
        }

    }

    const onPressSkipCreditsExternalComponent = () => {

        const timeEntry = props.timeMarkers?.find(item => item.type === TIME_MARK_TYPE.CREDITS);

        if (timeEntry){
            onPress(CONTROL_ACTION.SEEK, timeEntry.end);
        }

    }

    const onPressSkipEpisodeExternalComponent = () => {

        onPress(CONTROL_ACTION.NEXT);

    }

    return (
        <View style={styles.container}>

            {
                props.timeMarkers?.map((item, index) => {

                    if (item && currentTime && 
                        (
                            (item.secondsToEnd && props.duration && (props.duration - currentTime) >= item.secondsToEnd) ||
                            (currentTime >= item.start && (!item?.end || currentTime <= item?.end))
                        )
                    ){

                        if (item.type === TIME_MARK_TYPE.INTRO){

                            if (props.skipIntroButton){
                                return createElement(props.skipIntroButton, { 
                                    key: index,
                                    onPress: onPressSkipIntroExternalComponent
                                })

                            } else {
                                return (
                                    <TimeMarkButton
                                        key={index}
                                        title='Saltar intro'
                                        value={item.end}
                                        onPress={props?.onPress}
                                    />
                                )

                            }

                        }

                        if (item.type === TIME_MARK_TYPE.RECAP){
                            
                            if (props.skipRecapButton){
                                return createElement(props.skipRecapButton, { 
                                    key: index,
                                    onPress: onPressSkipRecapExternalComponent
                                })

                            } else {
                                return (
                                    <TimeMarkButton
                                        key={index}
                                        title='Saltar resumen'
                                        value={item.end}
                                        onPress={props?.onPress}
                                    />
                                )

                            }

                        }

                        if (item.type === TIME_MARK_TYPE.CREDITS){
                            
                            if (props.skipCreditsButton){
                                return createElement(props.skipCreditsButton, { 
                                    key: index,
                                    onPress: onPressSkipCreditsExternalComponent
                                })

                            } else {
                                return (
                                    <TimeMarkButton
                                        key={index}
                                        title='Saltar créditos'
                                        value={item.end}
                                        onPress={props?.onPress}
                                    />
                                )
                            }

                        }

                        if (item.type === TIME_MARK_TYPE.NEXT){
                            
                            if (props.nextButton){
                                return createElement(props.nextButton, { 
                                    key: index,
                                    onPress: onPressSkipEpisodeExternalComponent
                                })

                            } else {
                                return (
                                    <TimeMarkButton
                                        key={index}
                                        id={CONTROL_ACTION.NEXT}
                                        title='Saltar episodio'
                                        onPress={props?.onPress}
                                    />
                                )
                            }

                        }

                        return null;
                        
                    } else {
                        return null;

                    }

                })
            }

        </View>
    );

};

const styles = StyleSheet.create({
    container:{
        flex:1,
        flexDirection:'row',
        justifyContent:'flex-end',
        marginHorizontal: 12
    },
});