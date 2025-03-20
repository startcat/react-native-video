import React, { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { Button, LiveButton } from '../buttons';
import { Text } from '@ui-kitten/components';
import { 
    CONTROL_ACTION,
    BUTTON_SIZE,
    type ControlsBarProps
} from '../../../types';
import { styles } from './styles';

const ControlsBottomBarBase = ({ 
    title,
    muted = false,
    hasNext = false,
    volume,
    isLive = false,
    isDVR = false,
    liveButton,
    currentTime,
    duration,
    dvrTimeValue,
    isContentLoaded = false,
    onPress
}: ControlsBarProps): React.ReactElement => {

    const handlePress = useCallback((id: CONTROL_ACTION, value?: any) => {
        if (typeof onPress === 'function') {
            onPress(id, value);
        }
    }, [onPress]);

    const LiveButtonProp = useMemo(() => 
        liveButton ? React.createElement(liveButton, { 
            currentTime,
            duration,
            dvrTimeValue,
            isDVR,
            disabled: !isContentLoaded,
            onPress
        }) : null
    , [liveButton, currentTime, duration, dvrTimeValue, isDVR, isContentLoaded, onPress]);

    const MenuButton = useMemo(() => (
        <Button
            id={CONTROL_ACTION.MENU}
            size={BUTTON_SIZE.SMALL}
            iconName='chatbox-ellipses-outline'
            disabled={!isContentLoaded}
            onPress={handlePress}
        />
    ), [isContentLoaded, handlePress]);

    const SettingsMenuButton = useMemo(() => (
        <Button
            id={CONTROL_ACTION.SETTINGS_MENU}
            size={BUTTON_SIZE.SMALL}
            iconName='settings-outline'
            disabled={!isContentLoaded}
            onPress={handlePress}
        />
    ), [isContentLoaded, handlePress]);

    const MuteButton = useMemo(() => (
        <Button
            id={CONTROL_ACTION.MUTE}
            size={BUTTON_SIZE.SMALL}
            iconName={muted ? 'volume-mute-outline' : 'volume-high-outline'}
            value={!muted}
            onPress={handlePress}
        />
    ), [muted, handlePress]);

    const VolumeButton = useMemo(() => (
        <Button
            id={CONTROL_ACTION.VOLUME}
            size={BUTTON_SIZE.SMALL}
            iconName='volume-high-outline'
            value={volume}
            onPress={handlePress}
        />
    ), [volume, handlePress]);

    const NextButton = useMemo(() => (
        <Button
            id={CONTROL_ACTION.NEXT}
            size={BUTTON_SIZE.SMALL}
            iconName='play-skip-forward-outline'
            disabled={!isContentLoaded}
            onPress={handlePress}
        />
    ), [isContentLoaded, handlePress]);

    const RestartButton = useMemo(() => (
        <Button
            id={CONTROL_ACTION.SEEK}
            size={BUTTON_SIZE.SMALL}
            iconName='refresh-outline'
            value={0}
            disabled={!isContentLoaded}
            onPress={handlePress}
        />
    ), [isContentLoaded, handlePress]);

    const DefaultLiveButton = useMemo(() => (
        <LiveButton 
            currentTime={currentTime}
            duration={duration}
            dvrTimeValue={dvrTimeValue}
            isDVR={isDVR}
            disabled={!isContentLoaded}
            onPress={onPress} 
        />
    ), [currentTime, duration, dvrTimeValue, isDVR, isContentLoaded, onPress]);

    // Memoizar condiciones lógicas para renderizado condicional
    const showLiveControls = useMemo(() => isLive, [isLive]);
    const showRestartButton = useMemo(() => !isLive || isDVR, [isLive, isDVR]);
    const showMenuButtons = useMemo(() => !isLive, [isLive]);

    return (
        <View style={styles.container}>
            <View style={styles.left}>
                {showMenuButtons && (
                    <>
                        {MenuButton}
                        {SettingsMenuButton}
                    </>
                )}
                {MuteButton}
            </View>

            <View style={styles.middle}>
                {title && (
                    <Text 
                        category='h4' 
                        style={styles.title} 
                        ellipsizeMode='tail' 
                        numberOfLines={1}
                    >
                        {title}
                    </Text>
                )}
            </View>

            <View style={styles.right}>
                {showRestartButton && RestartButton}
                {hasNext && NextButton}
                {showLiveControls && LiveButtonProp}
                {showLiveControls && !LiveButtonProp && DefaultLiveButton}
            </View>
        </View>
    );
};

// Comparador personalizado para evitar renderizados innecesarios
const arePropsEqual = (prevProps: ControlsBarProps, nextProps: ControlsBarProps): boolean => {
    return (
        prevProps.title === nextProps.title &&
        prevProps.muted === nextProps.muted &&
        prevProps.hasNext === nextProps.hasNext &&
        prevProps.volume === nextProps.volume &&
        prevProps.isLive === nextProps.isLive &&
        prevProps.isDVR === nextProps.isDVR &&
        prevProps.currentTime === nextProps.currentTime &&
        prevProps.duration === nextProps.duration &&
        prevProps.dvrTimeValue === nextProps.dvrTimeValue &&
        prevProps.isContentLoaded === nextProps.isContentLoaded &&
        prevProps.liveButton === nextProps.liveButton &&
        prevProps.onPress === nextProps.onPress
    );
};

export const ControlsBottomBar = React.memo(ControlsBottomBarBase, arePropsEqual);
