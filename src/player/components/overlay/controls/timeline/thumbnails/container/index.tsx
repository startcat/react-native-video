import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { type ThumbnailsContainerProps } from "../../../../../../../types";
import { ThumbnailCell } from "../cell";
import { styles } from "./styles";

type InnerViewProps = {
	sideNumberOfCells: number;
	numberOfCells: number;
	container_width: number;
	container_height: number;
	cellWidth: number;
	offset?: number;
};

const ANIMATION_SPEED = 150;

const ThumbnailsContainerBase = ({
	seconds,
	metadata,
	style,
}: ThumbnailsContainerProps): React.ReactElement => {
	const [secondsArray, setSecondsArray] = useState<Array<number>>([]);
	const [viewProps, setViewProps] = useState<InnerViewProps>();

	const generateSecondsArrayList = useCallback(() => {
		if (
			viewProps?.sideNumberOfCells &&
			viewProps.sideNumberOfCells > 0 &&
			metadata?.thumbnailDuration &&
			typeof seconds === "number"
		) {
			const secondsArr: Array<number> = [];

			// Celdas de la izquierda
			for (let index = Math.ceil(viewProps.sideNumberOfCells); index > 0; index--) {
				secondsArr.push(seconds - index * metadata.thumbnailDuration);
			}

			// Celda principal
			secondsArr.push(seconds);

			// Celdas de la derecha
			for (let index = 1; index <= Math.ceil(viewProps.sideNumberOfCells); index++) {
				secondsArr.push(seconds + index * metadata.thumbnailDuration);
			}

			console.log(`[Thumbnails Container] secondsArr ${JSON.stringify(secondsArr)}`);
			setSecondsArray(secondsArr);
		} else {
			console.log("[Thumbnails Container] secondsArr nothing");
		}
	}, [seconds, viewProps, metadata]);

	useEffect(() => {
		generateSecondsArrayList();
	}, [generateSecondsArrayList]);

	const onLayout = useCallback(
		(e: LayoutChangeEvent) => {
			if (
				!viewProps ||
				(e.nativeEvent?.layout?.width &&
					viewProps.container_width !== e.nativeEvent.layout.width)
			) {
				const imageAspectRatio = metadata.width / metadata.height;
				const cellWidth = imageAspectRatio * e.nativeEvent.layout.height;

				const sideNumberOfCells = (e.nativeEvent.layout.width - cellWidth) / 2 / cellWidth;
				const numberOfCells = 2 * Math.ceil(sideNumberOfCells) + 1;

				let offset = (e.nativeEvent.layout.width - numberOfCells * cellWidth) / 2;

				if (offset > 0) {
					offset = -1 * offset;
				}

				setViewProps({
					sideNumberOfCells,
					numberOfCells,
					container_width: e.nativeEvent.layout.width,
					container_height: e.nativeEvent.layout.height,
					cellWidth,
					offset,
				});
			}
		},
		[viewProps, metadata]
	);

	const containerStyle = useMemo(() => [styles.container, style], [style]);

	const shouldRenderCells = useMemo(
		() => viewProps?.numberOfCells && viewProps.numberOfCells > 0 && secondsArray?.length > 0,
		[viewProps, secondsArray]
	);

	const midIndex = useMemo(
		() => (shouldRenderCells ? Math.trunc(secondsArray.length / 2) : -1),
		[shouldRenderCells, secondsArray]
	);

	return (
		<Animated.View
			style={containerStyle}
			onLayout={onLayout}
			entering={FadeIn.duration(ANIMATION_SPEED)}
			exiting={FadeOut.duration(ANIMATION_SPEED)}
		>
			{shouldRenderCells &&
				secondsArray.map((item, index) => (
					<ThumbnailCell
						key={index}
						seconds={item}
						index={index}
						active={index === midIndex}
						metadata={metadata}
						cell_width={viewProps?.cellWidth}
						offset={viewProps?.offset}
					/>
				))}
		</Animated.View>
	);
};

const arePropsEqual = (
	prevProps: ThumbnailsContainerProps,
	nextProps: ThumbnailsContainerProps
): boolean => {
	return (
		prevProps.seconds === nextProps.seconds &&
		prevProps.metadata === nextProps.metadata &&
		prevProps.style === nextProps.style
	);
};

export const ThumbnailsContainer = React.memo(ThumbnailsContainerBase, arePropsEqual);
