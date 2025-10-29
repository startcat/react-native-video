import { Text } from '@ui-kitten/components';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { i18n } from '../../../../../locales';
import { type LiveButtonProps, CONTROL_ACTION } from '../../../../../types';
import { styles } from './styles';

const HAPTIC_OPTIONS = {
	enableVibrateFallback: true,
	ignoreAndroidSystemSettings: true,
};

const LiveButtonBase = ({
	isDVR,
	dvrTimeValue,
	duration,
	onPress: propOnPress,
	accessibilityLabel,
	disabled = false,
}: LiveButtonProps): React.ReactElement => {
	const [isBehindLive, setIsBehindLive] = useState<boolean>();

	useEffect(() => {
		if (!!isDVR && typeof dvrTimeValue === 'number' && typeof duration === 'number') {
			if (dvrTimeValue < duration && !isBehindLive) {
				setIsBehindLive(true);
			} else if (dvrTimeValue === duration && isBehindLive) {
				setIsBehindLive(false);
			}
		}
	}, [isDVR, dvrTimeValue, duration, isBehindLive]);

	const handlePress = useCallback(() => {
		ReactNativeHapticFeedback.trigger('impactLight', HAPTIC_OPTIONS);

		if (typeof propOnPress === 'function' && typeof duration === 'number') {
			propOnPress(CONTROL_ACTION.SEEK, duration);
		}
	}, [propOnPress, duration]);

	const containerStyle = useMemo(
		() => ({
			...styles.container,
			...(isBehindLive ? styles.asButton : {}),
		}),
		[isBehindLive]
	);

	const accessibilityLabelText = useMemo(
		() => accessibilityLabel || i18n.t('goToLive'),
		[accessibilityLabel]
	);

	if (isBehindLive) {
		return (
			<TouchableOpacity
				style={containerStyle}
				onPress={handlePress}
				accessible={true}
				accessibilityRole="button"
				accessibilityLabel={accessibilityLabelText}
				pressRetentionOffset={5}
				disabled={disabled}
			>
				<Text category="h5" style={styles.title}>
					{i18n.t('goToLive')}
				</Text>
			</TouchableOpacity>
		);
	} else {
		return (
			<View style={styles.container}>
				<Text category="h5" style={styles.title}>
					{i18n.t('video_live')}
				</Text>
			</View>
		);
	}
};

const arePropsEqual = (prevProps: LiveButtonProps, nextProps: LiveButtonProps): boolean => {
	return (
		prevProps.isDVR === nextProps.isDVR &&
		prevProps.dvrTimeValue === nextProps.dvrTimeValue &&
		prevProps.duration === nextProps.duration &&
		prevProps.onPress === nextProps.onPress &&
		prevProps.accessibilityLabel === nextProps.accessibilityLabel &&
		prevProps.disabled === nextProps.disabled
	);
};

export const LiveButton = React.memo(LiveButtonBase, arePropsEqual);
