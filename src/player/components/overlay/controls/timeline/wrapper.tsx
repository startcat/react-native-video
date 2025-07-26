// Timeline/wrapper.tsx - Corrección de SliderValues

import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import {
    type IThumbnailMetadata,
    type TimelineProps
} from '../../../../types';
import { DVRSlider, VODSlider } from './slider';
import { styles } from './styles';
import { ThumbnailsContainer } from './thumbnails';

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
    const isLive = playerProgress?.isLive || false;
    const isDVR = playerProgress?.isDVR || false;
    const sliderValues = playerProgress?.sliderValues;

    const [showThumbnails, setShowThumbnails] = useState<boolean>(false);
    const [sliderValueVOD, setSliderValueVOD] = useState<number | undefined>(currentTime);

    // Validar si tenemos sliderValues válidos
    const hasValidSliderValues = useMemo(() => {
        return sliderValues && 
               typeof sliderValues.minimumValue === 'number' && 
               typeof sliderValues.maximumValue === 'number' && 
               typeof sliderValues.progress === 'number' &&
               sliderValues.maximumValue > sliderValues.minimumValue;
    }, [sliderValues]);

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

    // Crear SliderValues seguros para VOD
    const vodSliderValues = useMemo(() => {
        if (hasValidSliderValues) {
            return sliderValues!;
        }
        
        // Fallback solo si tenemos duración válida
        if (typeof duration === 'number' && duration > 0) {
            return {
                minimumValue: 0,
                maximumValue: duration,
                progress: currentTime,
                percentProgress: duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0,
                canSeekToEnd: true,
                duration: duration,
                isLiveEdgePosition: false // VOD nunca está en live edge
            };
        }
        
        return null;
    }, [hasValidSliderValues, sliderValues, duration, currentTime]);

    // Crear SliderValues seguros para DVR
    const dvrSliderValues = useMemo(() => {
        if (hasValidSliderValues && (sliderValues!.liveEdge !== undefined || isDVR)) {
            return sliderValues!;
        }
        
        return null;
    }, [hasValidSliderValues, sliderValues, isDVR]);

    // Componentes con SliderValues válidos
    const SliderVODComponent = useMemo(() => {
        if (!sliderVOD || !vodSliderValues) return null;
        
        return React.createElement(sliderVOD, {
            ...vodSliderValues,
            thumbnailsMetadata,
            onSlidingStart: handleSlidingStart,
            onSlidingMove: handleSlidingMove,
            onSlidingComplete: handleSlidingComplete
        });
    }, [sliderVOD, vodSliderValues, thumbnailsMetadata, handleSlidingStart, handleSlidingMove, handleSlidingComplete]);

    const SliderDVRComponent = useMemo(() => {
        if (!sliderDVR || !dvrSliderValues) return null;
        
        return React.createElement(sliderDVR, { 
            ...dvrSliderValues,
            thumbnailsMetadata,
            onSlidingStart: handleSlidingStart,
            onSlidingMove: handleSlidingMove,
            onSlidingComplete: handleSlidingComplete
        });
    }, [sliderDVR, dvrSliderValues, thumbnailsMetadata, handleSlidingStart, handleSlidingMove, handleSlidingComplete]);

    // Componentes default solo si tenemos valores válidos
    const DefaultVODSlider = useMemo(() => {
        if (!vodSliderValues) {
            console.warn('[Timeline] VOD Slider not rendered - invalid slider values', {
                hasValidSliderValues,
                duration,
                currentTime,
                sliderValuesAvailable: !!sliderValues
            });
            return null;
        }
        
        return (
            <VODSlider
                {...vodSliderValues}
                thumbnailsMetadata={thumbnailsMetadata}
                onSlidingStart={handleSlidingStart}
                onSlidingMove={handleSlidingMove}
                onSlidingComplete={handleSlidingComplete}
            />
        );
    }, [vodSliderValues, thumbnailsMetadata, handleSlidingStart, handleSlidingMove, handleSlidingComplete, hasValidSliderValues, duration, currentTime, sliderValues]);

    const DefaultDVRSlider = useMemo(() => {
        if (!dvrSliderValues) {
            console.warn('[Timeline] DVR Slider not rendered - invalid slider values', {
                hasValidSliderValues,
                isDVR,
                hasLiveEdge: sliderValues?.liveEdge !== undefined,
                sliderValuesAvailable: !!sliderValues
            });
            return null;
        }

        return (
            <DVRSlider
                {...dvrSliderValues}
                onSlidingStart={handleSlidingStart}
                onSlidingMove={handleSlidingMove}
                onSlidingComplete={handleSlidingComplete}
            />
        );
    }, [dvrSliderValues, handleSlidingStart, handleSlidingMove, handleSlidingComplete, hasValidSliderValues, isDVR, sliderValues]);

    // Condiciones de renderizado mejoradas
    const showVODSlider = useMemo(() => !isLive && !isDVR && !!vodSliderValues, [isLive, isDVR, vodSliderValues]);
    const showDVRSlider = useMemo(() => (isLive || isDVR) && !!dvrSliderValues, [isLive, isDVR, dvrSliderValues]);
    
    const showThumbnailsContainer = useMemo(() => 
        !avoidThumbnails && showThumbnails && !!thumbnailsMetadata,
    [avoidThumbnails, showThumbnails, thumbnailsMetadata]);

    // Log de debug para tracking
    console.log('[Timeline] Render decision:', {
        showVODSlider,
        showDVRSlider,
        hasValidSliderValues,
        isLive,
        isDVR,
        vodSliderValuesAvailable: !!vodSliderValues,
        dvrSliderValuesAvailable: !!dvrSliderValues
    });

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
                {showVODSlider && (SliderVODComponent || DefaultVODSlider)}
                {showDVRSlider && (SliderDVRComponent || DefaultDVRSlider)}
                {!showVODSlider && !showDVRSlider && (
                    <View style={{ height: 20, justifyContent: 'center', alignItems: 'center' }}>
                        {/* Placeholder o mensaje de carga si es necesario */}
                    </View>
                )}
            </View>
            {ThumbnailsComponent}
        </View>
    );
};

// Comparador mejorado
const arePropsEqual = (prevProps: TimelineProps, nextProps: TimelineProps): boolean => {
    const prevProgress = prevProps.playerProgress;
    const nextProgress = nextProps.playerProgress;
    
    const progressEqual = (
        prevProgress?.currentTime === nextProgress?.currentTime &&
        prevProgress?.duration === nextProgress?.duration &&
        prevProgress?.isLive === nextProgress?.isLive &&
        prevProgress?.isDVR === nextProgress?.isDVR &&
        // Comparación profunda de sliderValues
        JSON.stringify(prevProgress?.sliderValues) === JSON.stringify(nextProgress?.sliderValues)
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