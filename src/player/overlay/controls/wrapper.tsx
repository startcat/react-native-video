import React, { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { HeaderBar } from './header';
import { MiddleBar } from './middleBar';
import { Timeline } from './timeline';
import { BottomBar } from './bottomBar';
import { 
    type IThumbnailMetadata,
    CONTROL_ACTION 
} from '../../types';
import { styles } from './styles';

interface Props {
    title?:string;
    currentTime?: number;
    dvrTimeValue?: number;
    duration?: number;
    paused?: boolean;
    muted?: boolean;
    volume?: number;
    preloading?: boolean;
    hasNext?: boolean;
    thumbnailsMetadata?: IThumbnailMetadata;
    isLive?: boolean;
    isDVR?: boolean;
    isContentLoaded?: boolean;

    // Components
    mosca?: React.ReactElement | React.ReactNode
    controlsHeaderMetadata?: React.ReactElement | React.ReactNode;
    sliderVOD?: React.ReactElement;
    sliderDVR?: React.ReactElement;

    onPress?: (id: CONTROL_ACTION, value?:any) => void;
    onSlidingStart?: (value: number) => void;
    onSlidingMove?: (value: number) => void;
    onSlidingComplete?: (value: number) => void;
}

const ANIMATION_SPEED = 150;

export const Controls = (props: Props) => {

    const [avoidThumbnails, setAvoidThumbnails] = useState<boolean>(false);
    const insets = useSafeAreaInsets();

    const onPress = (id: CONTROL_ACTION, value?:any) => {

        if (props?.onPress){
            props?.onPress(id, value);
        }

    }

    return (
        <Animated.View 
            style={styles.container}
            entering={FadeIn.duration(ANIMATION_SPEED)}
            exiting={FadeOut.duration(ANIMATION_SPEED)}
        >

            <View style={styles.mask} />

            {
                props?.controlsHeaderMetadata ?
                    <View style={{
                        ...styles.floatingHeader,
                        top: styles.floatingHeader.top + insets?.top,
                        left: styles.floatingHeader.left + Math.max(insets.left, insets.right),
                    }}>
                        { props?.controlsHeaderMetadata }
                    </View>
                : null
            }

            <MiddleBar
                paused={props?.paused}
                isContentLoaded={props?.isContentLoaded}
                onPress={onPress}
            />

            <HeaderBar 
                preloading={props?.preloading}
                isContentLoaded={props?.isContentLoaded}
                onPress={onPress}
            />

            <View style={{
                ...styles.bottom,
                bottom: styles.bottom.bottom + insets?.bottom,
                left: styles.bottom.left + Math.max(insets.left, insets.right),
                right: styles.bottom.right + Math.max(insets.left, insets.right)
            }}>

                <BottomBar 
                    currentTime={props?.currentTime}
                    duration={props?.duration}
                    dvrTimeValue={props?.dvrTimeValue}
                    title={props?.title}
                    muted={props?.muted}
                    isLive={props?.isLive}
                    isDVR={props?.isDVR}
                    isContentLoaded={props?.isContentLoaded}
                    hasNext={props?.hasNext}
                    volume={props?.volume}
                    onPress={onPress}
                />

                <Timeline 
                    currentTime={props?.currentTime}
                    dvrTimeValue={props?.dvrTimeValue}
                    duration={props?.duration}
                    isLive={props?.isLive}
                    isDVR={props?.isDVR}
                    thumbnailsMetadata={props?.thumbnailsMetadata}
                    avoidThumbnails={avoidThumbnails}
                    onSlidingStart={props?.onSlidingStart}
                    onSlidingMove={props?.onSlidingMove}
                    onSlidingComplete={props?.onSlidingComplete}
                />

            </View>

        </Animated.View>
    );

};
