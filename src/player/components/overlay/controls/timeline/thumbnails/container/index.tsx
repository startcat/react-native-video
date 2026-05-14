import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, PixelRatio } from "react-native";
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

// Cap de memoria del bitmap del sprite. Android aloca el bitmap a
// view-size × density² × 4. Sin cap, un sprite 3200×1710 en density 2.75
// produce ~165MB → Canvas tira `trying to draw too large bitmap`.
const MAX_BITMAP_BYTES = 32 * 1024 * 1024;
const DEVICE_PIXEL_RATIO = PixelRatio.get();

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
				let cellWidth = imageAspectRatio * e.nativeEvent.layout.height;
				let containerHeight = e.nativeEvent.layout.height;

				// Cap de memoria: si el sprite + density haría que el bitmap
				// del FastImage supere el cap de Canvas (Android), achicamos
				// cellWidth Y container_height proporcionalmente para mantener
				// el aspect ratio del tile sin offsets desalineados.
				const proportion = cellWidth / metadata.width;
				const estBitmapBytes =
					proportion * metadata.imageWidth * DEVICE_PIXEL_RATIO *
					proportion * metadata.imageHeight * DEVICE_PIXEL_RATIO * 4;
				if (estBitmapBytes > MAX_BITMAP_BYTES) {
					const safeProportion = Math.sqrt(
						MAX_BITMAP_BYTES /
							(metadata.imageWidth *
								metadata.imageHeight *
								DEVICE_PIXEL_RATIO *
								DEVICE_PIXEL_RATIO *
								4)
					);
					cellWidth = Math.floor(safeProportion * metadata.width);
					containerHeight = Math.max(1, Math.floor(cellWidth / imageAspectRatio));
				}

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
					container_height: containerHeight,
					cellWidth,
					offset,
				});
			}
		},
		[viewProps, metadata]
	);

	const containerStyle = useMemo(
		() => [
			styles.container,
			// Cuando el cap de memoria recorta cellWidth, también recortamos la
			// altura del strip para mantener el aspect ratio del tile sin huecos
			// vertical. La 1ª pasada del onLayout calcula el cap; la 2ª (post-
			// override) converge.
			viewProps?.container_height ? { height: viewProps.container_height } : null,
			style,
		],
		[style, viewProps?.container_height]
	);

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
