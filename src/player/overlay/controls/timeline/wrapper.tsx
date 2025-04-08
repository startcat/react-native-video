import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { VODSlider, DVRSlider } from './slider';
import { ThumbnailsContainer } from './thumbnails';
import { 
    type IThumbnailMetadata,
    type TimelineProps
} from '../../../types';
import { styles } from './styles';

const TimelineBase = ({
    currentTime,
    duration,
    dvrTimeValue,
    isLive = false,
    isDVR = false,
    sliderVOD,
    sliderDVR,
    avoidThumbnails = false,
    thumbnailsMetadata,
    onSlidingStart: propOnSlidingStart,
    onSlidingMove: propOnSlidingMove,
    onSlidingComplete: propOnSlidingComplete
}: TimelineProps): React.ReactElement => {

    const [showThumbnails, setShowThumbnails] = useState<boolean>(false);
    const [sliderValueVOD, setSliderValueVOD] = useState<number | undefined>(currentTime);

    const handleSlidingStart = useCallback((value: number) => {
        setShowThumbnails(true);
        setSliderValueVOD(value);

        if (typeof propOnSlidingStart === 'function') {
            propOnSlidingStart(value);
        }
    }, [propOnSlidingStart]);

    const handleSlidingMove = useCallback((value: number) => {
        setSliderValueVOD(value);
        
        if (typeof propOnSlidingMove === 'function') {
            propOnSlidingMove(value);
        }
    }, [propOnSlidingMove]);

    const handleSlidingComplete = useCallback((value: number) => {
        setShowThumbnails(false);

        if (typeof propOnSlidingComplete === 'function') {
            propOnSlidingComplete(value);
        }
    }, [propOnSlidingComplete]);

    // Componentes creados con createElement memorizados
    const SliderVODComponent = useMemo(() => 
        sliderVOD ? React.createElement(sliderVOD, { 
            currentTime,
            duration,
            thumbnailsMetadata,
            onSlidingStart: handleSlidingStart,
            onSlidingMove: handleSlidingMove,
            onSlidingComplete: handleSlidingComplete
        }) : null
    , [sliderVOD, currentTime, duration, handleSlidingStart, handleSlidingMove, handleSlidingComplete]);

    const SliderDVRComponent = useMemo(() => 
        sliderDVR ? React.createElement(sliderDVR, { 
            value: dvrTimeValue,
            liveLoadTime: duration,
            thumbnailsMetadata,
            onSlidingStart: handleSlidingStart,
            onSlidingMove: handleSlidingMove,
            onSlidingComplete: handleSlidingComplete
        }) : null
    , [sliderDVR, dvrTimeValue, duration, handleSlidingStart, handleSlidingMove, handleSlidingComplete]);

    // Componentes default memorizados
    const DefaultVODSlider = useMemo(() => (
        <VODSlider
            currentTime={currentTime}
            duration={duration}
            onSlidingStart={handleSlidingStart}
            onSlidingMove={handleSlidingMove}
            onSlidingComplete={handleSlidingComplete}
        />
    ), [currentTime, duration, handleSlidingStart, handleSlidingMove, handleSlidingComplete]);

    const DefaultDVRSlider = useMemo(() => (
        <DVRSlider
            value={dvrTimeValue}
            liveLoadTime={duration}
            onSlidingStart={handleSlidingStart}
            onSlidingMove={handleSlidingMove}
            onSlidingComplete={handleSlidingComplete}
        />
    ), [dvrTimeValue, duration, handleSlidingStart, handleSlidingMove, handleSlidingComplete]);

    // Condiciones memorizadas para renderizado condicional
    const showVODSlider = useMemo(() => !isLive, [isLive]);
    const showDVRSlider = useMemo(() => isDVR, [isDVR]);
    const showThumbnailsContainer = useMemo(() => 
        !avoidThumbnails && showThumbnails && !!thumbnailsMetadata,
    [avoidThumbnails, showThumbnails, thumbnailsMetadata]);

    // Componente ThumbnailsContainer memoizado
    const ThumbnailsComponent = useMemo(() => 
        showThumbnailsContainer ? (
            <ThumbnailsContainer 
                seconds={sliderValueVOD}
                metadata={thumbnailsMetadata as IThumbnailMetadata}
            />
        ) : null
    , [showThumbnailsContainer, sliderValueVOD, thumbnailsMetadata]);

    return (
        <View style={styles.container}>
            <View style={styles.barSlider}>
                {showVODSlider && SliderVODComponent}
                {showVODSlider && !SliderVODComponent && DefaultVODSlider}
                {showDVRSlider && !showVODSlider && SliderDVRComponent}
                {showDVRSlider && !showVODSlider && !SliderDVRComponent && DefaultDVRSlider}
            </View>
            {ThumbnailsComponent}
        </View>
    );
};

// Comparador personalizado para evitar renderizados innecesarios
const arePropsEqual = (prevProps: TimelineProps, nextProps: TimelineProps): boolean => {
    return (
        prevProps.currentTime === nextProps.currentTime &&
        prevProps.duration === nextProps.duration &&
        prevProps.dvrTimeValue === nextProps.dvrTimeValue &&
        prevProps.isLive === nextProps.isLive &&
        prevProps.isDVR === nextProps.isDVR &&
        prevProps.sliderVOD === nextProps.sliderVOD &&
        prevProps.sliderDVR === nextProps.sliderDVR &&
        prevProps.avoidThumbnails === nextProps.avoidThumbnails &&
        prevProps.thumbnailsMetadata === nextProps.thumbnailsMetadata &&
        prevProps.onSlidingStart === nextProps.onSlidingStart &&
        prevProps.onSlidingMove === nextProps.onSlidingMove &&
        prevProps.onSlidingComplete === nextProps.onSlidingComplete
    );
};

export const Timeline = React.memo(TimelineBase, arePropsEqual);
