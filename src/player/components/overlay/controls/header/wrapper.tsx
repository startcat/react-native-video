import React, { useCallback, useMemo } from 'react';
import { Platform, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Spinner } from '@ui-kitten/components';
import { Button } from '../buttons';
import AirplayButton from '../buttons/airplay';
import CastButton from '../buttons/cast';
import { CONTROL_ACTION, BUTTON_SIZE, type ControlsBarProps } from "../../../../types";
import { styles } from './styles';

const ANIMATION_SPEED = 150;

const ControlsHeaderBarBase = ({
	playerProgress,
	playerMetadata,
	components,
	events,
	preloading = false,
	isContentLoaded = false,
	isChangingSource = false,
}: ControlsBarProps): React.ReactElement => {
	const navigation = useNavigation();
	const insets = useSafeAreaInsets();

	// Extract values from structured props
	const isPreloading = playerProgress?.isBuffering ?? preloading;
	const headerMetadata = components?.headerMetadata;
	const onPress = events?.onPress;
	const onExit = events?.onExit;

	const handleBack = useCallback(() => {
		if (typeof onExit === 'function') {
			onExit();
		} else {
			navigation.goBack();
		}
	}, [navigation, onExit]);

	const BackButton = useMemo(
		() => (
			<Button
				id={CONTROL_ACTION.BACK}
				iconName="chevron-back-outline"
				onPress={handleBack}
				size={BUTTON_SIZE.SMALL}
			/>
		),
		[handleBack]
	);

	const Loader = useMemo(
		() => (
			<Animated.View
				style={styles.loader}
				entering={FadeIn.duration(ANIMATION_SPEED)}
				exiting={FadeOut.duration(ANIMATION_SPEED)}
			>
				<Spinner />
			</Animated.View>
		),
		[]
	);

	const HeaderMetadataComponent = useMemo(
		() => (headerMetadata ? React.createElement(headerMetadata, { onPress }) : null),
		[headerMetadata, onPress]
	);

	const containerStyle = useMemo(
		() => ({
			...styles.container,
			top: styles.container.top + (insets?.top || 0),
			left: styles.container.left + Math.max(insets.left || 0, insets.right || 0),
			right: styles.container.right + Math.max(insets.left || 0, insets.right || 0),
		}),
		[insets]
	);

	const showIosComponent = useMemo(() => Platform.OS === 'ios', []);

	return (
		<View style={containerStyle}>
			{HeaderMetadataComponent}

			<View style={styles.left}>{BackButton}</View>

			<View style={styles.right}>
				{isPreloading && Loader}
				{showIosComponent && <AirplayButton />}
				<CastButton />
			</View>
		</View>
	);
};

// Comparador personalizado para evitar renderizados innecesarios
const arePropsEqual = (prevProps: ControlsBarProps, nextProps: ControlsBarProps): boolean => {
	return (
		prevProps.playerProgress?.isBuffering === nextProps.playerProgress?.isBuffering &&
		prevProps.preloading === nextProps.preloading &&
		prevProps.components?.headerMetadata === nextProps.components?.headerMetadata &&
		prevProps.events?.onPress === nextProps.events?.onPress &&
		prevProps.events?.onExit === nextProps.events?.onExit
	);
};

// Exportamos el componente memoizado con el nombre ControlsHeaderBar
export const ControlsHeaderBar = React.memo(ControlsHeaderBarBase, arePropsEqual);
