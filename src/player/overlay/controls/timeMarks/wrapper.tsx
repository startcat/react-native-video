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

    return (
        <View style={styles.container}>

            {
                props.timeMarkers?.map((item, index) => {

                    if (item && currentTime && currentTime >= item.start && currentTime <= item.end){

                        if (item.type === TIME_MARK_TYPE.INTRO){

                            if (props.skipIntroButton){
                                return createElement(props.skipIntroButton, { 
                                    key: index,
                                    id: CONTROL_ACTION.SEEK,
                                    value: item.end,
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
                                    id: CONTROL_ACTION.SEEK,
                                    value: item.end,
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
                                    id: CONTROL_ACTION.SEEK,
                                    value: item.end,
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
        justifyContent:'flex-end'
    },
});