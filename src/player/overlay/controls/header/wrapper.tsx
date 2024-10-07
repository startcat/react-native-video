import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Spinner } from '@ui-kitten/components';
import { Button, AirplayButton, CastButton } from '../buttons';
import { 
    CONTROL_ACTION,
    BUTTON_SIZE,
    type ControlsBarProps
} from '../../../types';
import { styles } from './styles';

const ANIMATION_SPEED = 150;

export function ControlsHeaderBar (props: ControlsBarProps): React.ReactElement {

    const [isPreloading, setIsPreloading] = useState<boolean>(!!props?.preloading);

    const navigation = useNavigation();
    const insets = useSafeAreaInsets();

    useEffect(() => {
        setIsPreloading(!!props?.preloading);

    }, [props.preloading]);

    const onBack = () => {
        navigation.goBack();

    }

    const BackButton = () => (
        <Button
            id={CONTROL_ACTION.BACK}
            iconName='chevron-back-outline'
            onPress={onBack}
            size={BUTTON_SIZE.SMALL}
        />
    );

    const Loader = () => (
        <Animated.View 
            style={styles.loader}
            entering={FadeIn.duration(ANIMATION_SPEED)}
            exiting={FadeOut.duration(ANIMATION_SPEED)}
        >
            <Spinner />
        </Animated.View>
    );

    return (
        <View style={{
            ...styles.container,
            top: styles.container.top + insets?.top,
            left: styles.container.left + Math.max(insets.left, insets.right),
            right: styles.container.right + Math.max(insets.left, insets.right)
        }}>

            <View style={styles.left}>
                <BackButton />

            </View>

            <View style={styles.right}>

                {
                    isPreloading ?
                        <Loader />
                    : null
                }

                {
                    Platform.OS === 'ios' ?
                        <AirplayButton />
                    : null
                }
                
                <CastButton />

            </View>
        </View>
    );

};
