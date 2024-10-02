import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Spinner } from '@ui-kitten/components';
import { SmallButton, AirplayButton, CastButton } from '../buttons';
import { CONTROL_ACTION } from '../../../types';
import { styles } from './styles';

const ANIMATION_SPEED = 150;

interface Props {
    preloading?: boolean;
    isContentLoaded?: boolean;
    onPress?: (id: CONTROL_ACTION, value?: any) => void;
}

export function ControlsHeaderBar (props: Props): React.ReactElement {

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
        <SmallButton
            id={CONTROL_ACTION.BACK}
            iconName='chevron-back-outline'
            onPress={onBack}
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
