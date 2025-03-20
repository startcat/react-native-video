import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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

const VODSliderBase = ({
    currentTime,
    duration,
    onSlidingStart: propOnSlidingStart,
    onSlidingMove: propOnSlidingMove,
    onSlidingComplete: propOnSlidingComplete
}: SliderVODProps): React.ReactElement | null => {
    
    const [isEnded, setIsEnded] = useState<boolean>(false);
    const [thumbTintColor, setThumbTintColor] = useState<string>(
        Platform.OS === 'android' ? COLOR.theme.main : 'transparent'
    );
    
    const isDraggingRef = useRef<boolean>(false);
    
    const handleDragThrottled = useRef(
        throttle((value: number) => {
            if (typeof propOnSlidingMove === 'function') {
                propOnSlidingMove(value);
            }
        }, PLAYER_SLIDER_THROTTLE)
    ).current;
    
    const checkContentIsEnded = useCallback(() => {
        if (
            !isDraggingRef.current && 
            typeof duration === 'number' && 
            typeof currentTime === 'number' && 
            isFinite(duration)
        ) {
            try {
                if (!isEnded && Math.abs(duration - currentTime) < 5) {
                    setIsEnded(true);
                } else if (isEnded && Math.abs(duration - currentTime) >= 5) {
                    setIsEnded(false);
                }
            } catch (ex: any) {
                console.log(ex?.message);
            }
        }
    }, [duration, currentTime, isEnded]);
    
    useEffect(() => {
        checkContentIsEnded();
    }, [checkContentIsEnded]);
    
    useEffect(() => {
        return () => {
            handleDragThrottled.cancel();
        };
    }, [handleDragThrottled]);
    
    const handleSlidingStart = useCallback((value: number) => {
        isDraggingRef.current = true;
        setThumbTintColor('white');
        
        if (typeof propOnSlidingStart === 'function') {
            propOnSlidingStart(value);
        }
    }, [propOnSlidingStart]);
    
    const handleSlidingComplete = useCallback((value: number) => {
        isDraggingRef.current = false;
        setThumbTintColor(Platform.OS === 'android' ? COLOR.theme.main : 'transparent');
        
        if (typeof propOnSlidingComplete === 'function') {
            propOnSlidingComplete(value);
        }
    }, [propOnSlidingComplete]);
    
    const handleValueChange = useCallback((value: number) => {
        handleDragThrottled(value);
    }, [handleDragThrottled]);
    
    const shouldRenderSlider = useMemo(() => 
        typeof duration === 'number' && 
        duration > 0 && 
        typeof currentTime === 'number' && 
        currentTime > 0 && 
        isFinite(duration)
    , [duration, currentTime]);
    
    const sliderStep = useMemo(() => 
        duration && duration > 120 ? 20 : 1
    , [duration]);
    
    const maximumTrackTintColor = useMemo(() => 
        isEnded ? COLOR.theme.main : 'white'
    , [isEnded]);
    
    const CurrentTimeText = useMemo(() => 
        <TimelineText value={currentTime} />
    , [currentTime]);
    
    const DurationText = useMemo(() => 
        <TimelineText value={duration} />
    , [duration]);
    
    if (!shouldRenderSlider) {
        return null;
    }
    
    return (
        <View style={styles.container}>
            <View style={styles.barContentsEdge}>
                {CurrentTimeText}
            </View>
            
            <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={duration}
                minimumTrackTintColor={COLOR.theme.main}
                maximumTrackTintColor={maximumTrackTintColor}
                value={currentTime}
                step={sliderStep}
                tapToSeek={true}
                thumbTintColor={thumbTintColor}
                hitSlop={styles.hitSlop}
                onSlidingStart={handleSlidingStart}
                onValueChange={handleValueChange}
                onSlidingComplete={handleSlidingComplete}
            />
            
            <View style={styles.barContentsEdge}>
                {DurationText}
            </View>
        </View>
    );
};

const arePropsEqual = (prevProps: SliderVODProps, nextProps: SliderVODProps): boolean => {
    return (
        prevProps.currentTime === nextProps.currentTime &&
        prevProps.duration === nextProps.duration &&
        prevProps.onSlidingStart === nextProps.onSlidingStart &&
        prevProps.onSlidingMove === nextProps.onSlidingMove &&
        prevProps.onSlidingComplete === nextProps.onSlidingComplete
    );
};

export const VODSlider = React.memo(VODSliderBase, arePropsEqual);
