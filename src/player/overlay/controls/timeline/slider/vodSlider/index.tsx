import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { throttle } from 'lodash';
import { TimelineText } from '../../texts';
import Slider from '@react-native-community/slider';
import {
    type SliderVODProps
} from '../../../../../types';

import { COLOR } from '../../../../../theme';
import { styles } from './styles';

const PLAYER_SLIDER_THROTTLE = 50;

export const VODSlider = (props: SliderVODProps): React.ReactElement | null => {

    const [currentTime, setCurrentTime] = useState<number | undefined>(props?.currentTime);
    const [duration, setDuration] = useState<number | undefined>(props?.duration);
    const [isEnded, setIsEnded] = useState<boolean>(false);
    const [thumbTintColor, setThumbTintColor] = useState<string>((Platform.OS === 'android') ? COLOR.theme.main : 'transparent');
    
    let _isDragging = false;

    useEffect(() => {
        checkContentIsEnded();

        return () => {
            
            if (handleDragThrottled){
                handleDragThrottled.cancel();

            }

        }

    }, []);

    useEffect(() => {
        checkContentIsEnded();

    }, [currentTime, duration]);

    useEffect(() => {
        setCurrentTime(props?.currentTime);

    }, [props?.currentTime]);

    useEffect(() => {
        setDuration(props?.duration);

    }, [props?.duration]);

    const handleDrag = (value: number) => {

        if (props?.onSlidingMove){
            props?.onSlidingMove(value);
            
        }
    }

    const handleDragThrottled = throttle(handleDrag, PLAYER_SLIDER_THROTTLE);

    const checkContentIsEnded = () => {

        if (!_isDragging && typeof(duration) === 'number' && typeof(currentTime) === 'number' && isFinite(duration)){

            try {
                if (!isEnded && Math.abs(duration - currentTime) < 5){
                    setIsEnded(true);
    
                } else if (isEnded && Math.abs(duration - currentTime) >= 5){
                    setIsEnded(false);
    
                }
    
            } catch (ex: any){
                console.log(ex?.message);
            }

        }

    };

    const onSlidingStart = (value: number) => {

        _isDragging = true;
        setThumbTintColor('white');

        if (props?.onSlidingStart){
            props?.onSlidingStart(value);
        }

    }

    const onSlidingComplete = (value: number) => {
        
        _isDragging = false;
        setThumbTintColor((Platform.OS === 'android') ? COLOR.theme.main : 'transparent');

        if (props?.onSlidingComplete){
            props?.onSlidingComplete(value);
        }

    }

    const onValueChange = (value: number) => {
        handleDragThrottled(value);
    }

    if (typeof(duration) === 'number' && duration > 0 && typeof(currentTime) === 'number' && currentTime > 0 && isFinite(duration)){
        return (
            <View style={styles.container}>
                <View style={styles.barContentsEdge}>
                    <TimelineText value={currentTime} />
                </View>

                <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={duration}
                    minimumTrackTintColor={COLOR.theme.main}
                    maximumTrackTintColor={ (isEnded) ? COLOR.theme.main : 'white' }
                    value={props?.currentTime}
                    step={(duration > 120) ? 20 : 1}
                    tapToSeek={true}

                    thumbTintColor={thumbTintColor}
                    hitSlop={styles.hitSlop}

                    onSlidingStart={onSlidingStart}
                    onValueChange={onValueChange}
                    onSlidingComplete={onSlidingComplete}
                />

                <View style={styles.barContentsEdge}>
                    <TimelineText value={duration} />
                </View>
            </View>

        );

    } else {
        return null;

    }

};
