import React, { createElement, useCallback, useMemo } from "react";
import { StyleSheet } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { TimeMarkButton } from "../buttons";

import {
	CONTROL_ACTION,
	TIME_MARK_TYPE,
	type ITimeMarkers,
	type TimeMarksProps,
} from "../../../../types";

const ANIMATION_SPEED = 150;

// Componente individual memorizado para cada time marker
interface TimeMarkItemProps {
	item: ITimeMarkers;
	skipIntroButton?: React.ComponentType<any>;
	skipRecapButton?: React.ComponentType<any>;
	skipCreditsButton?: React.ComponentType<any>;
	nextButton?: React.ComponentType<any>;
	onPressSkipIntro: () => void;
	onPressSkipRecap: () => void;
	onPressSkipCredits: () => void;
	onPressSkipEpisode: () => void;
	safeOnPress: (id: CONTROL_ACTION, value?: any) => void;
}

const TimeMarkItem = React.memo<TimeMarkItemProps>(
	({
		item,
		skipIntroButton,
		skipRecapButton,
		skipCreditsButton,
		nextButton,
		onPressSkipIntro,
		onPressSkipRecap,
		onPressSkipCredits,
		onPressSkipEpisode,
		safeOnPress,
	}) => {
		// Renderizado según el tipo de marcador
		if (item.type === TIME_MARK_TYPE.INTRO) {
			if (skipIntroButton) {
				return createElement(skipIntroButton, {
					onPress: onPressSkipIntro,
				});
			}

			return <TimeMarkButton title="Saltar intro" value={item.end} onPress={safeOnPress} />;
		}

		if (item.type === TIME_MARK_TYPE.RECAP) {
			if (skipRecapButton) {
				return createElement(skipRecapButton, {
					onPress: onPressSkipRecap,
				});
			}

			return <TimeMarkButton title="Saltar resumen" value={item.end} onPress={safeOnPress} />;
		}

		if (item.type === TIME_MARK_TYPE.CREDITS) {
			if (skipCreditsButton) {
				return createElement(skipCreditsButton, {
					onPress: onPressSkipCredits,
				});
			}

			return (
				<TimeMarkButton
					id={CONTROL_ACTION.NEXT}
					title="Saltar créditos"
					onPress={safeOnPress}
				/>
			);
		}

		if (item.type === TIME_MARK_TYPE.NEXT) {
			if (nextButton) {
				return createElement(nextButton, {
					onPress: onPressSkipEpisode,
				});
			}

			return (
				<TimeMarkButton
					id={CONTROL_ACTION.NEXT}
					title="Saltar episodio"
					onPress={safeOnPress}
				/>
			);
		}

		return null;
	}
);

TimeMarkItem.displayName = "TimeMarkItem";

const TimeMarksComponent = ({
	playerProgress,
	playerTimeMarkers,
	components,
	onPress: propOnPress,
	style,
}: TimeMarksProps): React.ReactElement => {
	// Extract values from playerProgress
	const propCurrentTime = playerProgress?.currentTime || 0;
	const duration = playerProgress?.duration;

	// Safe timeMarkers with fallback
	const safeTimeMarkers = playerTimeMarkers?.timeMarkers || [];

	// Extract components
	const { skipIntroButton, skipRecapButton, skipCreditsButton, nextButton } = components || {};

	const safeOnPress = useCallback(
		(id: CONTROL_ACTION, value?: any) => {
			if (typeof propOnPress === "function") {
				propOnPress(id, value);
			}
		},
		[propOnPress]
	);

	const onPressSkipIntroExternalComponent = useCallback(() => {
		const timeEntry = safeTimeMarkers.find(
			(item: ITimeMarkers) => item.type === TIME_MARK_TYPE.INTRO
		);
		if (timeEntry) {
			safeOnPress(CONTROL_ACTION.SEEK, timeEntry.end);
		}
	}, [safeTimeMarkers, safeOnPress]);

	const onPressSkipRecapExternalComponent = useCallback(() => {
		const timeEntry = safeTimeMarkers.find(
			(item: ITimeMarkers) => item.type === TIME_MARK_TYPE.RECAP
		);
		if (timeEntry) {
			safeOnPress(CONTROL_ACTION.SEEK, timeEntry.end);
		}
	}, [safeTimeMarkers, safeOnPress]);

	const onPressSkipCreditsExternalComponent = useCallback(() => {
		safeOnPress(CONTROL_ACTION.NEXT);
	}, [safeOnPress]);

	const onPressSkipEpisodeExternalComponent = useCallback(() => {
		safeOnPress(CONTROL_ACTION.NEXT);
	}, [safeOnPress]);

	// Nivel 1: Filtrar qué time markers están activos (cambia con propCurrentTime)
	const activeTimeMarkers = useMemo(() => {
		return safeTimeMarkers.filter((item: ITimeMarkers) => {
			return (
				item &&
				propCurrentTime &&
				((item.secondsToEnd &&
					duration &&
					duration - propCurrentTime >= item.secondsToEnd) ||
					(propCurrentTime >= item.start && (!item?.end || propCurrentTime <= item?.end)))
			);
		});
	}, [propCurrentTime, safeTimeMarkers, duration]);

	// Nivel 2: Renderizar cada botón individual de forma memorizada
	// Solo se recalcula si cambian los componentes o callbacks, NO con propCurrentTime
	const renderedTimeMarkers = useMemo(() => {
		return activeTimeMarkers.map((item: ITimeMarkers) => {
			// Key estable basada en el tipo y rango de tiempo, no en el índice
			const key = `${item.type}-${item.start}-${item.end ?? "end"}`;

			return (
				<TimeMarkItem
					key={key}
					item={item}
					skipIntroButton={skipIntroButton}
					skipRecapButton={skipRecapButton}
					skipCreditsButton={skipCreditsButton}
					nextButton={nextButton}
					onPressSkipIntro={onPressSkipIntroExternalComponent}
					onPressSkipRecap={onPressSkipRecapExternalComponent}
					onPressSkipCredits={onPressSkipCreditsExternalComponent}
					onPressSkipEpisode={onPressSkipEpisodeExternalComponent}
					safeOnPress={safeOnPress}
				/>
			);
		});
	}, [
		activeTimeMarkers,
		safeOnPress,
		skipIntroButton,
		skipRecapButton,
		skipCreditsButton,
		nextButton,
		onPressSkipIntroExternalComponent,
		onPressSkipRecapExternalComponent,
		onPressSkipCreditsExternalComponent,
		onPressSkipEpisodeExternalComponent,
	]);

	return (
		<Animated.View
			style={[styles.container, style]}
			entering={FadeIn.duration(ANIMATION_SPEED)}
			exiting={FadeOut.duration(ANIMATION_SPEED)}
		>
			{renderedTimeMarkers}
		</Animated.View>
	);
};

TimeMarksComponent.displayName = "TimeMarks";

export const TimeMarks = React.memo(TimeMarksComponent);

const styles = StyleSheet.create({
	container: {
		flex: 1,
		flexDirection: "row",
		justifyContent: "flex-end",
		marginHorizontal: 12,
	},
});
