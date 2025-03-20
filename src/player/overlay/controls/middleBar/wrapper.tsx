import React, { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { Button } from '../buttons';
import { 
    CONTROL_ACTION,
    BUTTON_SIZE,
    type ControlsBarProps
} from '../../../types';
import { i18n } from '../../../locales';
import { styles } from './styles';

const ControlsMiddleBarBase = ({ 
    paused = false,
    isContentLoaded = false,
    onPress
}: ControlsBarProps): React.ReactElement => {
    
    // Manejo seguro de la función onPress
    const handlePress = useCallback((id: CONTROL_ACTION, value?: any) => {
        if (typeof onPress === 'function') {
            onPress(id, value);
        }
    }, [onPress]);

    // Memoiza los textos de accesibilidad para evitar cálculos repetidos
    const accessibilityLabels = useMemo(() => ({
        play: i18n.t('accesibilidad_player_play'),
        pause: i18n.t('accesibilidad_player_pause'),
        backward: i18n.t('accesibilidad_player_backward'),
        forward: i18n.t('accesibilidad_player_forward')
    }), []);

    // Memoiza el componente del botón de reproducción/pausa
    const PlayToggleButton = useMemo(() => (
        <Button
            id={CONTROL_ACTION.PAUSE}
            size={BUTTON_SIZE.BIG}
            iconName={paused ? 'play-circle-outline' : 'pause-circle-outline'}
            value={!paused}
            disabled={!isContentLoaded}
            accessibilityLabel={paused ? accessibilityLabels.play : accessibilityLabels.pause}
            onPress={handlePress}
        />
    ), [paused, isContentLoaded, accessibilityLabels, handlePress]);

    // Memoiza el componente del botón de retroceso
    const BackwardButton = useMemo(() => (
        <Button
            id={CONTROL_ACTION.BACKWARD}
            size={BUTTON_SIZE.MEDIUM}
            iconName='play-back-outline'
            value={15}
            disabled={!isContentLoaded}
            accessibilityLabel={accessibilityLabels.backward}
            onPress={handlePress}
        />
    ), [isContentLoaded, accessibilityLabels, handlePress]);

    // Memoiza el componente del botón de avance
    const ForwardButton = useMemo(() => (
        <Button
            id={CONTROL_ACTION.FORWARD}
            size={BUTTON_SIZE.MEDIUM}
            iconName='play-forward-outline'
            value={15}
            disabled={!isContentLoaded}
            accessibilityLabel={accessibilityLabels.forward}
            onPress={handlePress}
        />
    ), [isContentLoaded, accessibilityLabels, handlePress]);

    return (
        <View style={styles.container}>
            <View style={styles.contents}>
                {BackwardButton}
                {PlayToggleButton}
                {ForwardButton}
            </View>
        </View>
    );
};

// Comparador personalizado para evitar renderizados innecesarios
const arePropsEqual = (prevProps: ControlsBarProps, nextProps: ControlsBarProps): boolean => {
    return (
        prevProps.paused === nextProps.paused &&
        prevProps.isContentLoaded === nextProps.isContentLoaded &&
        prevProps.onPress === nextProps.onPress
    );
};

// Exportamos el componente memoizado con el nombre ControlsMiddleBar
export const ControlsMiddleBar = React.memo(ControlsMiddleBarBase, arePropsEqual);
