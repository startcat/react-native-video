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
    playerProgress,
    sliderVOD,
    sliderDVR,
    avoidThumbnails = false,
    thumbnailsMetadata,
    onSlidingStart: propOnSlidingStart,
    onSlidingMove: propOnSlidingMove,
    onSlidingComplete: propOnSlidingComplete
}: TimelineProps): React.ReactElement => {

    // Extract values from playerProgress
    const currentTime = playerProgress?.currentTime || 0;
    const duration = playerProgress?.duration;
    const dvrTimeValue = playerProgress?.liveValues?.currentRealTime;
    const isLive = playerProgress?.isLive || false;
    const isDVR = playerProgress?.isDVR || false;

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
    const SliderVODComponent = useMemo(() => {
        if (!sliderVOD) return null;
        
        const sliderValues = playerProgress?.sliderValues || {
            minimumValue: 0,
            maximumValue: duration || 0,
            progress: currentTime,
            canSeekToEnd: true
        };
        
        return React.createElement(sliderVOD, {
            ...sliderValues,
            thumbnailsMetadata,
            onSlidingStart: handleSlidingStart,
            onSlidingMove: handleSlidingMove,
            onSlidingComplete: handleSlidingComplete
        });
    }, [sliderVOD, playerProgress?.sliderValues, currentTime, duration, thumbnailsMetadata, handleSlidingStart, handleSlidingMove, handleSlidingComplete]);

    const SliderDVRComponent = useMemo(() => {
        if (!sliderDVR) return null;
        
        const dvrSliderValues = {
            minimumValue: 0,
            maximumValue: duration || 0,
            progress: dvrTimeValue || 0,
            canSeekToEnd: true,
            liveEdge: duration,
            isProgramLive: isLive
        };
        
        return React.createElement(sliderDVR, { 
            ...dvrSliderValues,
            thumbnailsMetadata,
            onSlidingStart: handleSlidingStart,
            onSlidingMove: handleSlidingMove,
            onSlidingComplete: handleSlidingComplete
        });
    }, [sliderDVR, dvrTimeValue, duration, isLive, thumbnailsMetadata, handleSlidingStart, handleSlidingMove, handleSlidingComplete]);

    // Componentes default memorizados
    const DefaultVODSlider = useMemo(() => {
        const sliderValues = playerProgress?.sliderValues || {
            minimumValue: 0,
            maximumValue: duration || 0,
            progress: currentTime,
            canSeekToEnd: true
        };
        
        return (
            <VODSlider
                {...sliderValues}
                thumbnailsMetadata={thumbnailsMetadata}
                onSlidingStart={handleSlidingStart}
                onSlidingMove={handleSlidingMove}
                onSlidingComplete={handleSlidingComplete}
            />
        );
    }, [playerProgress?.sliderValues, currentTime, duration, thumbnailsMetadata, handleSlidingStart, handleSlidingMove, handleSlidingComplete]);

    const DefaultDVRSlider = useMemo(() => {
        const dvrSliderValues = {
            minimumValue: 0,
            maximumValue: duration || 0,
            progress: dvrTimeValue || 0,
            canSeekToEnd: true,
            liveEdge: duration,
            isProgramLive: isLive
        };

        return (
            <DVRSlider
                {...dvrSliderValues}
                onSlidingStart={handleSlidingStart}
                onSlidingMove={handleSlidingMove}
                onSlidingComplete={handleSlidingComplete}
            />
        );
    }, [dvrTimeValue, duration, isLive, handleSlidingStart, handleSlidingMove, handleSlidingComplete]);

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
    // Compare playerProgress values
    const prevProgress = prevProps.playerProgress;
    const nextProgress = nextProps.playerProgress;
    
    const progressEqual = (
        prevProgress?.currentTime === nextProgress?.currentTime &&
        prevProgress?.duration === nextProgress?.duration &&
        prevProgress?.liveValues?.currentRealTime === nextProgress?.liveValues?.currentRealTime &&
        prevProgress?.isLive === nextProgress?.isLive &&
        prevProgress?.isDVR === nextProgress?.isDVR
    );
    
    return (
        progressEqual &&
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
