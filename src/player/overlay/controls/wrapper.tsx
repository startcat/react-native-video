import React, { createElement, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ControlsHeaderBar } from './header';
import { ControlsMiddleBar } from './middleBar';
import { Timeline } from './timeline';
import { ControlsBottomBar } from './bottomBar';
import { TimeMarks } from './timeMarks';
import { 
    type ControlsProps,
    CONTROL_ACTION 
} from '../../types';
import { styles } from './styles';

const ANIMATION_SPEED = 150;

const ControlsBase = ({
    title,
    currentTime,
    dvrTimeValue,
    duration,
    paused,
    muted,
    volume,
    preloading,
    hasNext,
    isLive,
    isDVR,
    isContentLoaded,
    nextButton,
    liveButton,
    headerMetadata,
    timeMarkers,
    thumbnailsMetadata,
    avoidTimelineThumbnails,
    controlsHeaderBar,
    controlsMiddleBar,
    controlsBottomBar,
    sliderVOD,
    sliderDVR,
    skipIntroButton,
    skipRecapButton,
    skipCreditsButton,
    onPress: propOnPress,
    onSlidingStart,
    onSlidingMove,
    onSlidingComplete
}: ControlsProps): React.ReactElement => {

    const insets = useSafeAreaInsets();

    const handlePress = useCallback((id: CONTROL_ACTION, value?: any) => {
        if (typeof propOnPress === 'function') {
            propOnPress(id, value);
        }
    }, [propOnPress]);

    const commonProps = useMemo(() => ({
        title,
        currentTime,
        dvrTimeValue,
        duration,
        paused,
        muted,
        volume,
        preloading,
        hasNext,
        isLive,
        isDVR,
        isContentLoaded,
        nextButton,
        liveButton,
        headerMetadata,
        onPress: handlePress,
        onSlidingStart,
        onSlidingMove,
        onSlidingComplete
    }), [
        title, currentTime, dvrTimeValue, duration, paused, muted, volume,
        preloading, hasNext, isLive, isDVR, isContentLoaded, nextButton,
        liveButton, headerMetadata, handlePress, onSlidingStart, onSlidingMove, onSlidingComplete
    ]);

    const HeaderBar = useMemo(() => 
        controlsHeaderBar ? createElement(controlsHeaderBar, commonProps) : null
    , [controlsHeaderBar, commonProps]);

    const MiddleBar = useMemo(() => 
        controlsMiddleBar ? createElement(controlsMiddleBar, commonProps) : null
    , [controlsMiddleBar, commonProps]);

    const BottomBar = useMemo(() => 
        controlsBottomBar ? createElement(controlsBottomBar, commonProps) : null
    , [controlsBottomBar, commonProps]);

    const bottomContainerStyle = useMemo(() => ({
        ...styles.bottom,
        bottom: styles.bottom.bottom + (insets?.bottom || 0),
        left: styles.bottom.left + Math.max(insets.left || 0, insets.right || 0),
        right: styles.bottom.right + Math.max(insets.left || 0, insets.right || 0)
    }), [insets]);

    return (
        <Animated.View 
            style={styles.container}
            entering={FadeIn.duration(ANIMATION_SPEED)}
            exiting={FadeOut.duration(ANIMATION_SPEED)}
        >
            <View style={styles.mask} />

            {MiddleBar || (
                <ControlsMiddleBar
                    paused={paused}
                    isContentLoaded={isContentLoaded}
                    onPress={handlePress}
                />
            )}

            {HeaderBar || (
                <ControlsHeaderBar 
                    preloading={preloading}
                    isContentLoaded={isContentLoaded}
                    onPress={handlePress}
                />
            )}

            <View style={bottomContainerStyle}>
                {BottomBar || (
                    <ControlsBottomBar 
                        currentTime={currentTime}
                        duration={duration}
                        dvrTimeValue={dvrTimeValue}
                        title={title}
                        muted={muted}
                        isLive={isLive}
                        isDVR={isDVR}
                        isContentLoaded={isContentLoaded}
                        hasNext={hasNext}
                        volume={volume}
                        liveButton={liveButton}
                        onPress={handlePress}
                    />
                )}

                <Timeline 
                    currentTime={currentTime}
                    dvrTimeValue={dvrTimeValue}
                    duration={duration}
                    isLive={isLive}
                    isDVR={isDVR}
                    thumbnailsMetadata={thumbnailsMetadata}
                    avoidThumbnails={avoidTimelineThumbnails}
                    sliderVOD={sliderVOD}
                    sliderDVR={sliderDVR}
                    onSlidingStart={onSlidingStart}
                    onSlidingMove={onSlidingMove}
                    onSlidingComplete={onSlidingComplete}
                />

                <View style={styles.temporalButtonsBar}>
                    <TimeMarks 
                        currentTime={currentTime}
                        duration={duration}
                        timeMarkers={timeMarkers}
                        hasNext={hasNext}
                        nextButton={nextButton}
                        skipIntroButton={skipIntroButton}
                        skipRecapButton={skipRecapButton}
                        skipCreditsButton={skipCreditsButton}
                        onPress={handlePress}
                    />
                </View>
            </View>
        </Animated.View>
    );
};

export const Controls = React.memo(ControlsBase);
