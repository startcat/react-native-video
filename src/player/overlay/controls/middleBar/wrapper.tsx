import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { MediumButton, BigButton } from '../buttons';
import { CONTROL_ACTION } from '../../../types';
import { i18n } from 'locales';
import { styles } from './styles';

type Props = {
    paused?: boolean;
    isContentLoaded?: boolean;
    onPress?: (id: CONTROL_ACTION, value?: any) => void;
}

export const MiddleBar = (props: Props) => {

    const [isPaused, setIsPaused] = useState<boolean>(!!props?.paused);

    useEffect(() => {
        setIsPaused(!!props?.paused);

    }, [props?.paused]);

    const PlayToggleButton = () => (
        <BigButton
            id={CONTROL_ACTION.PAUSE}
            iconName={ (isPaused) ? 'play-circle-outline' : 'pause-circle-outline' }
            value={!isPaused}
            disabled={!props.isContentLoaded}
            accessibilityLabel={ (isPaused) ? i18n.t('accesibilidad_player_pause') : i18n.t('accesibilidad_player_play') }
            onPress={props?.onPress}
        />
    );

    const BackwardButton = () => (
        <MediumButton
            id={CONTROL_ACTION.BACKWARD}
            iconName='play-back-outline'
            value={15}
            disabled={!props.isContentLoaded}
            accessibilityLabel={ i18n.t('accesibilidad_player_backward') }
            onPress={props?.onPress}
        />
    );

    const ForwardButton = () => (
        <MediumButton
            id={CONTROL_ACTION.FORWARD}
            iconName='play-forward-outline'
            value={15}
            disabled={!props.isContentLoaded}
            accessibilityLabel={ i18n.t('accesibilidad_player_forward') }
            onPress={props?.onPress}
        />
    );

    return (
        <View style={styles.container}>
            <View style={styles.contents}>

                <BackwardButton />
                <PlayToggleButton />
                <ForwardButton />

            </View>
        </View>
    );

};
