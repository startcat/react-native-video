import React, { createElement, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import {
    TimeMarkButton
} from '../buttons';

import { 
    CONTROL_ACTION,
    TIME_MARK_TYPE,
    type TimeMarksProps
} from '../../../types';

const ANIMATION_SPEED = 150;

const TimeMarksComponent = ({
    playerProgress,
    timeMarkers,
    components,
    onPress: propOnPress,
    style
}: TimeMarksProps): React.ReactElement => {
    
    // Extract values from playerProgress
    const propCurrentTime = playerProgress?.currentTime || 0;
    const duration = playerProgress?.duration;
    
    // Safe timeMarkers with fallback
    const safeTimeMarkers = timeMarkers || [];
    
    // Extract components
    const {
        skipIntroButton,
        skipRecapButton,
        skipCreditsButton,
        nextButton
    } = components || {};

    const safeOnPress = useCallback((id: CONTROL_ACTION, value?: any) => {
        if (typeof propOnPress === 'function') {
            propOnPress(id, value);
        }
    }, [propOnPress]);

    const onPressSkipIntroExternalComponent = useCallback(() => {
        const timeEntry = safeTimeMarkers.find(item => item.type === TIME_MARK_TYPE.INTRO);
        if (timeEntry) {
            safeOnPress(CONTROL_ACTION.SEEK, timeEntry.end);
        }
    }, [safeTimeMarkers, safeOnPress]);

    const onPressSkipRecapExternalComponent = useCallback(() => {
        const timeEntry = safeTimeMarkers.find(item => item.type === TIME_MARK_TYPE.RECAP);
        if (timeEntry) {
            safeOnPress(CONTROL_ACTION.SEEK, timeEntry.end);
        }
    }, [safeTimeMarkers, safeOnPress]);

    const onPressSkipCreditsExternalComponent = useCallback(() => {
        safeOnPress(CONTROL_ACTION.NEXT);
    }, [safeOnPress]);

    const onPressSkipEpisodeExternalComponent = useCallback(() => {
        safeOnPress(CONTROL_ACTION.NEXT);
    }, [safeOnPress]);

    // Memoizamos el renderizado de los timeMarkers
    const renderedTimeMarkers = useMemo(() => {
        return safeTimeMarkers.map((item, index) => {
            // Verificamos si el marcador de tiempo debe mostrarse
            const shouldShowTimeMark = item && propCurrentTime && (
                (item.secondsToEnd && duration && (duration - propCurrentTime) >= item.secondsToEnd) ||
                (propCurrentTime >= item.start && (!item?.end || propCurrentTime <= item?.end))
            );

            if (!shouldShowTimeMark) {
                return null;
            }

            // Renderizado según el tipo de marcador
            if (item.type === TIME_MARK_TYPE.INTRO) {
                if (skipIntroButton) {
                    return createElement(skipIntroButton, { 
                        key: index,
                        onPress: onPressSkipIntroExternalComponent
                    });
                }
                
                return (
                    <TimeMarkButton
                        key={index}
                        title='Saltar intro'
                        value={item.end}
                        onPress={safeOnPress}
                    />
                );
            }

            if (item.type === TIME_MARK_TYPE.RECAP) {
                if (skipRecapButton) {
                    return createElement(skipRecapButton, { 
                        key: index,
                        onPress: onPressSkipRecapExternalComponent
                    });
                }
                
                return (
                    <TimeMarkButton
                        key={index}
                        title='Saltar resumen'
                        value={item.end}
                        onPress={safeOnPress}
                    />
                );
            }

            if (item.type === TIME_MARK_TYPE.CREDITS) {
                if (skipCreditsButton) {
                    return createElement(skipCreditsButton, { 
                        key: index,
                        onPress: onPressSkipCreditsExternalComponent
                    });
                }
                
                return (
                    <TimeMarkButton
                        key={index}
                        id={CONTROL_ACTION.NEXT}
                        title='Saltar créditos'
                        onPress={safeOnPress}
                    />
                );
            }

            if (item.type === TIME_MARK_TYPE.NEXT) {
                if (nextButton) {
                    return createElement(nextButton, { 
                        key: index,
                        onPress: onPressSkipEpisodeExternalComponent
                    });
                }
                
                return (
                    <TimeMarkButton
                        key={index}
                        id={CONTROL_ACTION.NEXT}
                        title='Saltar episodio'
                        onPress={safeOnPress}
                    />
                );
            }

            return null;
        });
    }, [
        propCurrentTime, 
        safeTimeMarkers, 
        duration, 
        safeOnPress, 
        skipIntroButton, 
        skipRecapButton, 
        skipCreditsButton, 
        nextButton,
        onPressSkipIntroExternalComponent,
        onPressSkipRecapExternalComponent,
        onPressSkipCreditsExternalComponent,
        onPressSkipEpisodeExternalComponent
    ]);

    return (
        <Animated.View 
            style={[styles.container, style]}
            entering={FadeIn.duration(ANIMATION_SPEED)}
            exiting={FadeOut.duration(ANIMATION_SPEED)}
        >
            {renderedTimeMarkers}
        </Animated.View>
    );
};

TimeMarksComponent.displayName = 'TimeMarks';

export const TimeMarks = React.memo(TimeMarksComponent);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginHorizontal: 12
    },
});