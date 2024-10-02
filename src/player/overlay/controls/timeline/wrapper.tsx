import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { VODSlider, DVRSlider } from './slider';
import { ThumbnailsContainer } from './thumbnails';
import { IThumbnailMetadata } from '../../../types';
import { styles } from './styles';

interface Props {
    currentTime?: number;
    duration?: number;
    dvrTimeValue?: number;
    isLive?: boolean;
    isDVR?: boolean;
    avoidThumbnails?: boolean;
    thumbnailsMetadata?: IThumbnailMetadata;

    // Components
    sliderVOD?: React.ReactElement;
    sliderDVR?: React.ReactElement;

    // Events
    onSlidingStart?: (value: number) => void;
    onSlidingMove?: (value: number) => void;
    onSlidingComplete?: (value: number) => void;
}

export const Timeline = (props: Props) => {

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

    //const SliderVOD = props?.sliderVOD || VODSlider;

    // const SliderVOD = (props?.sliderVOD) ? {
    //     type: props?.sliderVOD,
    //     props: {
    //         currentTime: props?.currentTime,
    //         duration: props?.duration,
    //         onSlidingStart: onSlidingStart,
    //         onSlidingMove: onSlidingMove,
    //         onSlidingComplete: onSlidingComplete
    //     }
    // } : null;

    const SliderVOD = (props?.sliderVOD) ? props.sliderVOD : null;

    return (
        <View style={styles.container}>

            <View style={styles.barSlider}>
                {
                    !isLive ?
                        <SliderVOD 
                            currentTime={props?.currentTime}
                            duration={props?.duration}
                            onSlidingStart={onSlidingStart}
                            onSlidingMove={onSlidingMove}
                            onSlidingComplete={onSlidingComplete}
                        />
                        // <VODSlider
                        //     currentTime={props?.currentTime}
                        //     duration={props?.duration}
                        //     onSlidingStart={onSlidingStart}
                        //     onSlidingMove={onSlidingMove}
                        //     onSlidingComplete={onSlidingComplete}
                        // />
                    : null
                }

                {
                    isDVR ?
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
