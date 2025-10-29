import React, { createElement, useCallback, useMemo } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type ControlsProps, CONTROL_ACTION } from "../../../../types";
import { ControlsBottomBar } from "./bottomBar";
import { ControlsHeaderBar } from "./header";
import { ControlsMiddleBar } from "./middleBar";
import { styles } from "./styles";
import { Timeline } from "./timeline";
import { TimeMarks } from "./timeMarks";

const ANIMATION_SPEED = 150;

const ControlsBase = (props: ControlsProps): React.ReactElement => {
	const {
		playerMetadata,
		playerProgress,
		playerAnalytics,
		playerTimeMarkers,
		playerAds,
		preloading,
		isContentLoaded,
		isChangingSource,
		components,
		events,
	} = props;

	const insets = useSafeAreaInsets();

	const handlePress = useCallback(
		(id: CONTROL_ACTION, value?: any) => {
			if (typeof events?.onPress === "function") {
				events.onPress(id, value);
			}
		},
		[events?.onPress]
	);

	const commonProps = useMemo(
		() => ({
			playerMetadata,
			playerProgress,
			playerAnalytics,
			playerTimeMarkers,
			playerAds,
			preloading,
			isContentLoaded,
			isChangingSource,
			components,
			events: {
				...events,
				onPress: handlePress,
			},
		}),
		[
			playerMetadata,
			playerProgress,
			playerAnalytics,
			playerTimeMarkers,
			playerAds,
			preloading,
			isContentLoaded,
			isChangingSource,
			components,
			events,
			handlePress,
		]
	);

	const HeaderBar = useMemo(
		() =>
			components?.controlsHeaderBar
				? createElement(components.controlsHeaderBar, commonProps)
				: null,
		[components?.controlsHeaderBar, commonProps]
	);

	const MiddleBar = useMemo(
		() =>
			components?.controlsMiddleBar
				? createElement(components.controlsMiddleBar, commonProps)
				: null,
		[components?.controlsMiddleBar, commonProps]
	);

	const BottomBar = useMemo(
		() =>
			components?.controlsBottomBar
				? createElement(components.controlsBottomBar, commonProps)
				: null,
		[components?.controlsBottomBar, commonProps]
	);

	const bottomContainerStyle = useMemo(
		() => ({
			...styles.bottom,
			bottom: styles.bottom.bottom + (insets?.bottom || 0),
			left: styles.bottom.left + Math.max(insets.left || 0, insets.right || 0),
			right: styles.bottom.right + Math.max(insets.left || 0, insets.right || 0),
		}),
		[insets]
	);

	return (
		<Animated.View
			style={styles.container}
			entering={FadeIn.duration(ANIMATION_SPEED)}
			exiting={FadeOut.duration(ANIMATION_SPEED)}
		>
			<View style={styles.mask} />

			{MiddleBar || <ControlsMiddleBar {...commonProps} />}

			{HeaderBar || <ControlsHeaderBar {...commonProps} />}

			<View style={bottomContainerStyle}>
				{BottomBar || <ControlsBottomBar {...commonProps} />}

				<Timeline
					playerProgress={commonProps.playerProgress}
					thumbnailsMetadata={props.thumbnailsMetadata}
					avoidThumbnails={props.avoidTimelineThumbnails}
					sliderVOD={commonProps.components?.sliderVOD}
					sliderDVR={commonProps.components?.sliderDVR}
					onSlidingStart={commonProps.events?.onSlidingStart}
					onSlidingMove={commonProps.events?.onSlidingMove}
					onSlidingComplete={commonProps.events?.onSlidingComplete}
				/>

				<View style={styles.temporalButtonsBar}>
					<TimeMarks
						playerTimeMarkers={commonProps.playerTimeMarkers}
						playerProgress={commonProps.playerProgress}
						components={commonProps.components}
						onPress={handlePress}
					/>
				</View>
			</View>
		</Animated.View>
	);
};

export const Controls = React.memo(ControlsBase);
