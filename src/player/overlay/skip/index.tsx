import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SkipButton } from '../controls/buttons';
import { 
    type SkipButtonsProps,
    CONTROL_ACTION 
} from '../../types';
import { styles } from './styles';

const ANIMATION_SPEED = 150;

export function SkipButtons (props: SkipButtonsProps): React.ReactElement {

    const insets = useSafeAreaInsets();

    return (
        <Animated.View 
            style={{
                ...styles.container,
                bottom: styles.container.bottom + insets?.bottom,
                left: styles.container.left + insets?.left,
            }}
            entering={FadeIn.duration(ANIMATION_SPEED)}
            exiting={FadeOut.duration(ANIMATION_SPEED)}
        >
            <SkipButton 
                id={CONTROL_ACTION.SKIP_INTRO}
                onPress={props?.onPress}
            />

            <SkipButton 
                id={CONTROL_ACTION.SKIP_CREDITS}
                onPress={props?.onPress}
            />
        </Animated.View>
    );

};
