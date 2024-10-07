import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '../buttons';
import { 
    CONTROL_ACTION,
    BUTTON_SIZE,
    type ControlsBarProps
} from '../../../types';
import { i18n } from '../../../locales';
import { styles } from './styles';

export function ControlsMiddleBar (props: ControlsBarProps): React.ReactElement {

    const [isPaused, setIsPaused] = useState<boolean>(!!props?.paused);

    useEffect(() => {
        setIsPaused(!!props?.paused);

    }, [props?.paused]);

    const PlayToggleButton = () => (
        <Button
            id={CONTROL_ACTION.PAUSE}
            size={BUTTON_SIZE.BIG}
            iconName={ (isPaused) ? 'play-circle-outline' : 'pause-circle-outline' }
            value={!isPaused}
            disabled={!props.isContentLoaded}
            accessibilityLabel={ (isPaused) ? i18n.t('accesibilidad_player_pause') : i18n.t('accesibilidad_player_play') }
            onPress={props?.onPress}
        />
    );

    const BackwardButton = () => (
        <Button
            id={CONTROL_ACTION.BACKWARD}
            size={BUTTON_SIZE.MEDIUM}
            iconName='play-back-outline'
            value={15}
            disabled={!props.isContentLoaded}
            accessibilityLabel={ i18n.t('accesibilidad_player_backward') }
            onPress={props?.onPress}
        />
    );

    const ForwardButton = () => (
        <Button
            id={CONTROL_ACTION.FORWARD}
            size={BUTTON_SIZE.MEDIUM}
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
