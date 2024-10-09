import React, { createElement } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ControlsHeaderBar } from './header';
import { ControlsMiddleBar } from './middleBar';
import { Timeline } from './timeline';
import { ControlsBottomBar } from './bottomBar';
import { 
    type ControlsProps,
    CONTROL_ACTION 
} from '../../types';
import { styles } from './styles';

const ANIMATION_SPEED = 150;

export function Controls (props: ControlsProps): React.ReactElement {

    const insets = useSafeAreaInsets();

    const onPress = (id: CONTROL_ACTION, value?:any) => {

        if (props?.onPress){
            props?.onPress(id, value);
        }

    }

    const HeaderBar = props.controlsHeaderBar ? createElement(props.controlsHeaderBar, { 
        title: props.title,
        currentTime: props.currentTime,
        dvrTimeValue: props.dvrTimeValue,
        duration: props.duration,
        paused: props.paused,
        muted: props.muted,
        volume: props.volume,
        preloading: props.preloading,
        hasNext: props.hasNext,
        isLive: props.isLive,
        isDVR: props.isDVR,
        isContentLoaded: props.isContentLoaded,
        nextButton: props.nextButton,
        headerMetadata: props.headerMetadata,
        onPress: onPress,
        onSlidingStart: props.onSlidingStart,
        onSlidingMove: props.onSlidingMove,
        onSlidingComplete: props.onSlidingComplete

    }) : null;

    const MiddleBar = props.controlsMiddleBar ? createElement(props.controlsMiddleBar, { 
        title: props.title,
        currentTime: props.currentTime,
        dvrTimeValue: props.dvrTimeValue,
        duration: props.duration,
        paused: props.paused,
        muted: props.muted,
        volume: props.volume,
        preloading: props.preloading,
        hasNext: props.hasNext,
        isLive: props.isLive,
        isDVR: props.isDVR,
        isContentLoaded: props.isContentLoaded,
        nextButton: props.nextButton,
        headerMetadata: props.headerMetadata,
        onPress: onPress,
        onSlidingStart: props.onSlidingStart,
        onSlidingMove: props.onSlidingMove,
        onSlidingComplete: props.onSlidingComplete

    }) : null;

    const BottomBar = props.controlsBottomBar ? createElement(props.controlsBottomBar, { 
        title: props.title,
        currentTime: props.currentTime,
        dvrTimeValue: props.dvrTimeValue,
        duration: props.duration,
        paused: props.paused,
        muted: props.muted,
        volume: props.volume,
        preloading: props.preloading,
        hasNext: props.hasNext,
        isLive: props.isLive,
        isDVR: props.isDVR,
        isContentLoaded: props.isContentLoaded,
        nextButton: props.nextButton,
        headerMetadata: props.headerMetadata,
        onPress: onPress,
        onSlidingStart: props.onSlidingStart,
        onSlidingMove: props.onSlidingMove,
        onSlidingComplete: props.onSlidingComplete

    }) : null;

    return (
        <Animated.View 
            style={styles.container}
            entering={FadeIn.duration(ANIMATION_SPEED)}
            exiting={FadeOut.duration(ANIMATION_SPEED)}
        >

            <View style={styles.mask} />

            {
                MiddleBar ? MiddleBar :
                    <ControlsMiddleBar
                        paused={props?.paused}
                        isContentLoaded={props?.isContentLoaded}
                        onPress={onPress}
                    />
            }

            {
                HeaderBar ? HeaderBar :
                    <ControlsHeaderBar 
                        preloading={props?.preloading}
                        isContentLoaded={props?.isContentLoaded}
                        onPress={onPress}
                    />

            }

            <View style={{
                ...styles.bottom,
                bottom: styles.bottom.bottom + insets?.bottom,
                left: styles.bottom.left + Math.max(insets.left, insets.right),
                right: styles.bottom.right + Math.max(insets.left, insets.right)
            }}>

                {
                    BottomBar ? BottomBar :
                        <ControlsBottomBar 
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
                }

                <Timeline 
                    currentTime={props?.currentTime}
                    dvrTimeValue={props?.dvrTimeValue}
                    duration={props?.duration}
                    isLive={props?.isLive}
                    isDVR={props?.isDVR}
                    thumbnailsMetadata={props?.thumbnailsMetadata}

                    // Components
                    sliderVOD={props.sliderVOD}
                    sliderDVR={props.sliderDVR}

                    // Events
                    onSlidingStart={props?.onSlidingStart}
                    onSlidingMove={props?.onSlidingMove}
                    onSlidingComplete={props?.onSlidingComplete}
                />

            </View>

        </Animated.View>
    );

};
