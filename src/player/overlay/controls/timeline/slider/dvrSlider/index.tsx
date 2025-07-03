import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Platform, View } from 'react-native';
import { throttle } from 'lodash';
import { TimelineText } from '../../texts';
import Slider from '@react-native-community/slider';
import { parseToCounter } from '../../../../../utils/time';
import {
    type SliderDVRProps
} from '../../../../../types';

import { COLOR } from '../../../../../theme';
import { styles } from './styles';

const PLAYER_SLIDER_THROTTLE = 50;

const DVRSliderBase = ({
    minimumValue,
    maximumValue,
    progress,
    liveEdge,
    onSlidingStart: propOnSlidingStart,
    onSlidingMove: propOnSlidingMove,
    onSlidingComplete: propOnSlidingComplete
}: SliderDVRProps): React.ReactElement | null => {
    
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

    // Memoización de valores calculados
    const formatOffsetTime = useCallback(() => {
        if (
            typeof liveEdge === 'number' && 
            typeof progress === 'number' && 
            Math.abs(liveEdge - progress) > 30
        ) {
            return `- ${parseToCounter(Math.abs(liveEdge - progress))}`;
        }
        return '';
    }, [liveEdge, progress]);

    // Determinar si debemos renderizar el slider
    const shouldRenderSlider = useMemo(() => 
        typeof maximumValue === 'number' && 
        maximumValue > 0 && 
        typeof progress === 'number' && 
        isFinite(maximumValue)
    , [maximumValue, progress]);

    // Calcular el paso adecuado para el slider
    const sliderStep = useMemo(() => 
        maximumValue && maximumValue > 120 ? 20 : 1
    , [maximumValue]);

    // Componentes memoizados
    const CurrentTimeText = useMemo(() => 
        <TimelineText value={progress} />
    , [progress]);

    const OffsetTimeText = useMemo(() => 
        <TimelineText value={formatOffsetTime()} />
    , [formatOffsetTime]);

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
                minimumValue={minimumValue}
                maximumValue={maximumValue}
                minimumTrackTintColor={COLOR.theme.main}
                maximumTrackTintColor={'white'}
                value={progress}
                step={sliderStep}
                tapToSeek={true}
                thumbTintColor={thumbTintColor}
                hitSlop={styles.hitSlop}
                onSlidingStart={handleSlidingStart}
                onValueChange={handleValueChange}
                onSlidingComplete={handleSlidingComplete}
            />

            <View style={styles.barContentsEdge}>
                {OffsetTimeText}
            </View>
        </View>
    );
};

// Comparador personalizado para evitar renderizados innecesarios
const arePropsEqual = (prevProps: SliderDVRProps, nextProps: SliderDVRProps): boolean => {
    return (
        prevProps.minimumValue === nextProps.minimumValue &&
        prevProps.maximumValue === nextProps.maximumValue &&
        prevProps.progress === nextProps.progress &&
        prevProps.liveEdge === nextProps.liveEdge &&
        prevProps.onSlidingStart === nextProps.onSlidingStart &&
        prevProps.onSlidingMove === nextProps.onSlidingMove &&
        prevProps.onSlidingComplete === nextProps.onSlidingComplete
    );
};

export const DVRSlider = React.memo(DVRSliderBase, arePropsEqual);
