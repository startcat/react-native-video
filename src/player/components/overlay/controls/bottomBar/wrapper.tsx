import { Text } from "@ui-kitten/components";
import React, { useCallback, useMemo } from "react";
import { View } from "react-native";
import { playlistsManager } from "../../../../features/playlists";
import { BUTTON_SIZE, CONTROL_ACTION, type ControlsBarProps } from "../../../../types";
import { Button, LiveButton } from "../buttons";
import { styles } from "./styles";

const ControlsBottomBarBase = ({
	playerMetadata,
	playerProgress,
	components,
	events,
	isContentLoaded = false,
}: ControlsBarProps): React.ReactElement => {
	// Extract values from playerProgress and playerMetadata
	const title = playerMetadata?.title;
	const muted = playerProgress?.isMuted ?? false;
	const volume = playerProgress?.volume;

	// Calculate hasNext using playlistsManager (only recalculates when itemId changes)
	const hasNext = useMemo(() => {
		const nextItem = playlistsManager.getNextItem();
		return nextItem !== null;
	}, [playerMetadata?.id]); // Recalculate only when the current item changes

	const isLive = playerProgress?.isLive ?? false;
	const isDVR = playerProgress?.isDVR ?? false;
	const currentTime = playerProgress?.currentTime;
	const duration = playerProgress?.duration;
	const dvrTimeValue = playerProgress?.currentTime; // For DVR, currentTime represents the DVR position

	// Extract custom components
	const liveButton = components?.liveButton;

	// Extract events
	const onPress = events?.onPress;

	const handlePress = useCallback(
		(id: CONTROL_ACTION, value?: any) => {
			if (onPress) {
				onPress(id, value);
			}
		},
		[onPress]
	);

	const LiveButtonProp = useMemo(
		() =>
			liveButton
				? React.createElement(liveButton, {
						currentTime,
						duration,
						dvrTimeValue,
						isDVR,
						disabled: !isContentLoaded,
						isLiveEdgePosition: playerProgress?.sliderValues?.isLiveEdgePosition,
						onPress,
					})
				: null,
		[liveButton, currentTime, duration, dvrTimeValue, isDVR, isContentLoaded, onPress]
	);

	const MenuButton = useMemo(
		() => (
			<Button
				id={CONTROL_ACTION.MENU}
				size={BUTTON_SIZE.SMALL}
				iconName="chatbox-ellipses-outline"
				disabled={!isContentLoaded}
				onPress={handlePress}
			/>
		),
		[isContentLoaded, handlePress]
	);

	const SettingsMenuButton = useMemo(
		() => (
			<Button
				id={CONTROL_ACTION.SETTINGS_MENU}
				size={BUTTON_SIZE.SMALL}
				iconName="settings-outline"
				disabled={!isContentLoaded}
				onPress={handlePress}
			/>
		),
		[isContentLoaded, handlePress]
	);

	const MuteButton = useMemo(
		() => (
			<Button
				id={CONTROL_ACTION.MUTE}
				size={BUTTON_SIZE.SMALL}
				iconName={muted ? "volume-mute-outline" : "volume-high-outline"}
				value={!muted}
				onPress={handlePress}
			/>
		),
		[muted, handlePress]
	);

	const VolumeButton = useMemo(
		() => (
			<Button
				id={CONTROL_ACTION.VOLUME}
				size={BUTTON_SIZE.SMALL}
				iconName="volume-high-outline"
				value={volume}
				onPress={handlePress}
			/>
		),
		[volume, handlePress]
	);

	const NextButton = useMemo(
		() => (
			<Button
				id={CONTROL_ACTION.NEXT}
				size={BUTTON_SIZE.SMALL}
				iconName="play-skip-forward-outline"
				disabled={!isContentLoaded}
				onPress={handlePress}
			/>
		),
		[isContentLoaded, handlePress]
	);

	const RestartButton = useMemo(
		() => (
			<Button
				id={CONTROL_ACTION.SEEK}
				size={BUTTON_SIZE.SMALL}
				iconName="refresh-outline"
				value={0}
				disabled={!isContentLoaded}
				onPress={handlePress}
			/>
		),
		[isContentLoaded, handlePress]
	);

	const DefaultLiveButton = useMemo(
		() => (
			<LiveButton
				currentTime={currentTime}
				duration={duration}
				dvrTimeValue={dvrTimeValue}
				isDVR={isDVR}
				disabled={!isContentLoaded}
				onPress={onPress}
			/>
		),
		[currentTime, duration, dvrTimeValue, isDVR, isContentLoaded, onPress]
	);

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
					<Text category="h4" style={styles.title} ellipsizeMode="tail" numberOfLines={1}>
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
		prevProps.playerMetadata?.title === nextProps.playerMetadata?.title &&
		prevProps.playerProgress?.isMuted === nextProps.playerProgress?.isMuted &&
		prevProps.playerProgress?.volume === nextProps.playerProgress?.volume &&
		prevProps.playerProgress?.isLive === nextProps.playerProgress?.isLive &&
		prevProps.playerProgress?.isDVR === nextProps.playerProgress?.isDVR &&
		prevProps.playerProgress?.currentTime === nextProps.playerProgress?.currentTime &&
		prevProps.playerProgress?.duration === nextProps.playerProgress?.duration &&
		prevProps.isContentLoaded === nextProps.isContentLoaded &&
		prevProps.components?.liveButton === nextProps.components?.liveButton &&
		prevProps.events?.onPress === nextProps.events?.onPress
	);
};

export const ControlsBottomBar = React.memo(ControlsBottomBarBase, arePropsEqual);
