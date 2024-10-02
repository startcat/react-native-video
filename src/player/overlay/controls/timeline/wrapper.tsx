import React, { useEffect, useState, createElement } from 'react';
import { View } from 'react-native';

import { VODSlider, DVRSlider } from './slider';
import { ThumbnailsContainer } from './thumbnails';
import { 
    type IThumbnailMetadata,
    type TimelineProps
} from '../../../types';
import { styles } from './styles';

export function Timeline (props: TimelineProps): React.ReactElement {

    const [showThumbnails, setShowThumbnails] = useState<boolean>(false);
    const [avoidShowThumbnails, setAvoidShowThumbnails] = useState<boolean>(!!props.avoidThumbnails);
    const [thumbnailsMetadata, setThumbnailsMetadata] = useState<IThumbnailMetadata | undefined>(props?.thumbnailsMetadata);
    const [sliderValueVOD, setSliderValueVOD] = useState<number | undefined>(props?.currentTime);

    const isLive = !!props?.isLive;
    const isDVR = !!props?.isDVR;

    useEffect(() => {
        setSliderValueVOD(props?.currentTime);

    }, [props?.currentTime]);

    useEffect(() => {
        setThumbnailsMetadata(props?.thumbnailsMetadata);

    }, [props?.thumbnailsMetadata]);

    useEffect(() => {
        setAvoidShowThumbnails(!!props.avoidThumbnails);

    }, [props?.avoidThumbnails]);

    const onSlidingStart = (value: number) => {

        setShowThumbnails(true);
        setSliderValueVOD(value);

        if (props?.onSlidingStart){
            props?.onSlidingStart(value);
        }

    }

    const onSlidingMove = (value: number) => {

        setSliderValueVOD(value);
        
        if (props?.onSlidingMove){
            props?.onSlidingMove(value);
        }

    }

    const onSlidingComplete = (value: number) => {

        setShowThumbnails(false);

        if (props?.onSlidingComplete){
            props?.onSlidingComplete(value);
        }

    }

    const SliderVOD = props.sliderVOD ? createElement(props.sliderVOD, { 
        currentTime: props?.currentTime,
        duration: props?.duration,
        onSlidingStart: onSlidingStart,
        onSlidingMove: onSlidingMove,
        onSlidingComplete: onSlidingComplete
    }) : null;

    const SliderDVR = props.sliderDVR ? createElement(props.sliderDVR, { 
        value: props?.dvrTimeValue,
        liveLoadTime: props?.duration,
        onSlidingStart: onSlidingStart,
        onSlidingMove: onSlidingMove,
        onSlidingComplete: onSlidingComplete
    }) : null;

    return (
        <View style={styles.container}>

            <View style={styles.barSlider}>
                {
                    !isLive && SliderVOD ?
                        SliderVOD
                    : null
                }

                {
                    !isLive && !SliderVOD ?
                        <VODSlider
                            currentTime={props?.currentTime}
                            duration={props?.duration}
                            onSlidingStart={onSlidingStart}
                            onSlidingMove={onSlidingMove}
                            onSlidingComplete={onSlidingComplete}
                        />
                    : null
                }

                {
                    isDVR && SliderDVR ?
                        SliderDVR
                    : null
                }

                {
                    isDVR && !SliderDVR ?
                        <DVRSlider
                            value={props?.dvrTimeValue}
                            liveLoadTime={props?.duration}
                            onSlidingStart={onSlidingStart}
                            onSlidingMove={onSlidingMove}
                            onSlidingComplete={onSlidingComplete}
                        />
                    : null
                }
                
            </View>

            {
                !avoidShowThumbnails && showThumbnails && !!thumbnailsMetadata ?
                    <ThumbnailsContainer 
                        seconds={sliderValueVOD}
                        metadata={thumbnailsMetadata}
                    />
                : null
            }

        </View>
    );

};
