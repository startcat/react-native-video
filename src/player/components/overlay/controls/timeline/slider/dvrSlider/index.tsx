import Slider from "@react-native-community/slider";
import { throttle } from "lodash";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { type SliderDVRProps } from "../../../../../../types";
import { parseToCounter } from "../../../../../../utils/time";
import { TimelineText } from "../../texts";

import { COLOR } from "../../../../../../theme";
import { styles } from "./styles";

const PLAYER_SLIDER_THROTTLE = 50;

const DVRSliderBase = ({
	minimumValue,
	maximumValue,
	progress,
	liveEdge,
	onSlidingStart: propOnSlidingStart,
	onSlidingMove: propOnSlidingMove,
	onSlidingComplete: propOnSlidingComplete,
}: SliderDVRProps): React.ReactElement | null => {
	console.log(
		`[DVRSlider] RENDER min=${minimumValue?.toFixed(0)} max=${maximumValue?.toFixed(0)} progress=${progress?.toFixed(1)} liveEdge=${liveEdge?.toFixed(0)}`
	);
	const [thumbTintColor, setThumbTintColor] = useState<string>(
		Platform.OS === "android" ? COLOR.theme.main : "transparent"
	);

	const isDraggingRef = useRef<boolean>(false);

	const handleDragThrottled = useRef(
		throttle((value: number) => {
			if (typeof propOnSlidingMove === "function") {
				propOnSlidingMove(value);
			}
		}, PLAYER_SLIDER_THROTTLE)
	).current;

	useEffect(() => {
		return () => {
			handleDragThrottled.cancel();
		};
	}, [handleDragThrottled]);

	const handleSlidingStart = useCallback(
		(value: number) => {
			isDraggingRef.current = true;
			setThumbTintColor("white");

			if (typeof propOnSlidingStart === "function") {
				propOnSlidingStart(value);
			}
		},
		[propOnSlidingStart]
	);

	const handleSlidingComplete = useCallback(
		(value: number) => {
			isDraggingRef.current = false;
			setThumbTintColor(Platform.OS === "android" ? COLOR.theme.main : "transparent");

			if (typeof propOnSlidingComplete === "function") {
				propOnSlidingComplete(value);
			}
		},
		[propOnSlidingComplete]
	);

	const handleValueChange = useCallback(
		(value: number) => {
			handleDragThrottled(value);
		},
		[handleDragThrottled]
	);

	// Memoización de valores calculados
	const formatOffsetTime = useCallback(() => {
		if (
			typeof liveEdge === "number" &&
			typeof progress === "number" &&
			Math.abs(liveEdge - progress) > 30
		) {
			return `- ${parseToCounter(Math.abs(liveEdge - progress))}`;
		}
		return "";
	}, [liveEdge, progress]);

	// Determinar si debemos renderizar el slider
	const shouldRenderSlider = useMemo(
		() =>
			typeof maximumValue === "number" &&
			maximumValue > 0 &&
			typeof progress === "number" &&
			isFinite(maximumValue),
		[maximumValue, progress]
	);

	// Calcular el paso adecuado para el slider
	const sliderStep = useMemo(() => (maximumValue && maximumValue > 120 ? 20 : 1), [maximumValue]);

	// Componentes memoizados
	const CurrentTimeText = useMemo(() => <TimelineText value={progress} />, [progress]);

	const OffsetTimeText = useMemo(
		() => <TimelineText value={formatOffsetTime()} />,
		[formatOffsetTime]
	);

	if (!shouldRenderSlider) {
		return null;
	}

	return (
		<View style={styles.container}>
			<View style={styles.barContentsEdge}>{CurrentTimeText}</View>

			<Slider
				style={styles.slider}
				minimumValue={minimumValue}
				maximumValue={maximumValue}
				minimumTrackTintColor={COLOR.theme.main}
				maximumTrackTintColor={"white"}
				value={progress}
				step={sliderStep}
				tapToSeek={true}
				thumbTintColor={thumbTintColor}
				hitSlop={styles.hitSlop}
				onSlidingStart={handleSlidingStart}
				onValueChange={handleValueChange}
				onSlidingComplete={handleSlidingComplete}
			/>

			<View style={styles.barContentsEdge}>{OffsetTimeText}</View>
		</View>
	);
};

// Comparador personalizado para evitar renderizados innecesarios
const arePropsEqual = (prevProps: SliderDVRProps, nextProps: SliderDVRProps): boolean => {
	const equal =
		prevProps.minimumValue === nextProps.minimumValue &&
		prevProps.maximumValue === nextProps.maximumValue &&
		prevProps.progress === nextProps.progress &&
		prevProps.liveEdge === nextProps.liveEdge &&
		prevProps.onSlidingStart === nextProps.onSlidingStart &&
		prevProps.onSlidingMove === nextProps.onSlidingMove &&
		prevProps.onSlidingComplete === nextProps.onSlidingComplete;
	console.log(
		`[DVRSlider] arePropsEqual=${equal} | prev: min=${prevProps.minimumValue?.toFixed(0)} max=${prevProps.maximumValue?.toFixed(0)} progress=${prevProps.progress?.toFixed(1)} | next: min=${nextProps.minimumValue?.toFixed(0)} max=${nextProps.maximumValue?.toFixed(0)} progress=${nextProps.progress?.toFixed(1)}`
	);
	return equal;
};

export const DVRSlider = React.memo(DVRSliderBase, arePropsEqual);
