import { Text } from '@ui-kitten/components';
import React, { useCallback, useMemo } from 'react';
import { TouchableOpacity } from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { type TimeMarkButtonProps, CONTROL_ACTION } from '../../../../../types';
import { styles } from './styles';

const HAPTIC_OPTIONS = {
	enableVibrateFallback: true,
	ignoreAndroidSystemSettings: true,
};

const TimeMarkButtonComponent = ({
	id,
	value,
	title,
	onPress: propOnPress,
	accessibilityLabel,
	disabled = false,
}: TimeMarkButtonProps): React.ReactElement => {
	// Memoizamos el estilo del contenedor
	const containerStyle = useMemo(
		() => ({
			...styles.container,
			...styles.asButton,
		}),
		[]
	);

	// Manejador de eventos con useCallback
	const handlePress = useCallback(() => {
		ReactNativeHapticFeedback.trigger('impactLight', HAPTIC_OPTIONS);

		if (typeof propOnPress === 'function') {
			propOnPress(id || CONTROL_ACTION.SEEK, value);
		}
	}, [propOnPress, id, value]);

	return (
		<TouchableOpacity
			style={containerStyle}
			onPress={handlePress}
			accessible={true}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			pressRetentionOffset={5}
			disabled={disabled}
		>
			<Text category="h5" style={styles.title}>
				{title}
			</Text>
		</TouchableOpacity>
	);
};

TimeMarkButtonComponent.displayName = 'TimeMarkButton';

export const TimeMarkButton = React.memo(TimeMarkButtonComponent);
