import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { throttle } from 'lodash';
import { TimelineText } from '../../texts';
import Slider from '@react-native-community/slider';
import { parseToCounter } from '../../../../../utils/time';

import { COLOR } from '../../../../../theme';
import { styles } from './styles';

const PLAYER_SLIDER_THROTTLE = 50;

type Props = {
    value?: number;
    liveLoadTime?: number;
    onSlidingStart?: (value: number) => void;
    onSlidingMove?: (value: number) => void;
    onSlidingComplete?: (value: number) => void;
}

export const DVRSlider = (props: Props) => {

    const [value, setValue] = useState<number | undefined>(props?.value);
    const [liveLoadTime, setLiveLoadTime] = useState<number | undefined>(props?.liveLoadTime);
    const [thumbTintColor, setThumbTintColor] = useState<string>((Platform.OS === 'android') ? COLOR.theme.main : 'transparent');
    
    let _isDragging = false;

    useEffect(() => {

        console.log(`[DVR Slider] ${value} / ${liveLoadTime}`);
        
        return () => {
            
            if (handleDragThrottled){
                handleDragThrottled.cancel();

            }

        }

    }, []);

    useEffect(() => {
        setValue(props?.value);

    }, [props?.value]);

    useEffect(() => {
        setLiveLoadTime(props?.liveLoadTime);

    }, [props?.liveLoadTime]);

    const handleDrag = (value: number) => {

        if (props?.onSlidingMove){
            props?.onSlidingMove(value);
            
        }
    }

    const handleDragThrottled = throttle(handleDrag, PLAYER_SLIDER_THROTTLE);

    const onSlidingStart = (value: number) => {

        _isDragging = true;
        setThumbTintColor('white');

        if (props?.onSlidingStart){
            props?.onSlidingStart(value);
        }

    }

    const onSlidingComplete = (value: number) => {
        
        _isDragging = false;
        setValue(value);
        setThumbTintColor((Platform.OS === 'android') ? COLOR.theme.main : 'transparent');

        if (props?.onSlidingComplete){
            props?.onSlidingComplete(value);
        }

    }

    const onValueChange = (value: number) => {
        handleDragThrottled(value);
    }

    const formatOffsetTime = () => {

        if (typeof(liveLoadTime) === 'number' && typeof(value) === 'number' && Math.abs(liveLoadTime - value) > 30){
            return `- ${parseToCounter(Math.abs(liveLoadTime - value))}`;

        }

        return '';

    }

    if (typeof(liveLoadTime) === 'number' && liveLoadTime > 0 && typeof(value) === 'number' && isFinite(liveLoadTime)){
        return (
            <View style={styles.container}>
                <View style={styles.barContentsEdge}>
                    <TimelineText value={value} />
                </View>

                <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={liveLoadTime}
                    minimumTrackTintColor={COLOR.theme.main}
                    maximumTrackTintColor={'white'}
                    value={value}
                    step={(liveLoadTime > 120) ? 20 : 1}
                    tapToSeek={true}

                    thumbTintColor={thumbTintColor}
                    hitSlop={styles.hitSlop}

                    onSlidingStart={onSlidingStart}
                    onValueChange={onValueChange}
                    onSlidingComplete={onSlidingComplete}
                />

                <View style={styles.barContentsEdge}>
                    <TimelineText value={formatOffsetTime()} />
                </View>
            </View>
        );

    } else {
        return null;

    }

};
