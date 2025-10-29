// Timeline/wrapper.tsx - Corrección de SliderValues

import React, { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { type IThumbnailMetadata, type TimelineProps } from "../../../../types";
import { DVRSlider, VODSlider } from "./slider";
import { styles } from "./styles";
import { ThumbnailsContainer } from "./thumbnails";

const TimelineBase = ({
	playerProgress,
	sliderVOD,
	sliderDVR,
	avoidThumbnails = false,
	thumbnailsMetadata,
	onSlidingStart: propOnSlidingStart,
	onSlidingMove: propOnSlidingMove,
	onSlidingComplete: propOnSlidingComplete,
}: TimelineProps): React.ReactElement => {
	// Extract values from playerProgress
	const currentTime = playerProgress?.currentTime || 0;
	const duration = playerProgress?.duration;
	const isLive = playerProgress?.isLive || false;
	const isDVR = playerProgress?.isDVR || false;
	const sliderValues = playerProgress?.sliderValues;

	const [showThumbnails, setShowThumbnails] = useState<boolean>(false);
	const [sliderValueVOD, setSliderValueVOD] = useState<number | undefined>(currentTime);

	// Validar si tenemos sliderValues válidos
	const hasValidSliderValues = useMemo(() => {
		return (
			sliderValues &&
			typeof sliderValues.minimumValue === "number" &&
			typeof sliderValues.maximumValue === "number" &&
			typeof sliderValues.progress === "number" &&
			sliderValues.maximumValue > sliderValues.minimumValue
		);
	}, [sliderValues]);

	const handleSlidingStart = useCallback(
		(value: number) => {
			setShowThumbnails(true);
			setSliderValueVOD(value);

			if (typeof propOnSlidingStart === "function") {
				propOnSlidingStart(value);
			}
		},
		[propOnSlidingStart]
	);

	const handleSlidingMove = useCallback(
		(value: number) => {
			setSliderValueVOD(value);

			if (typeof propOnSlidingMove === "function") {
				propOnSlidingMove(value);
			}
		},
		[propOnSlidingMove]
	);

	const handleSlidingComplete = useCallback(
		(value: number) => {
			setShowThumbnails(false);

			if (typeof propOnSlidingComplete === "function") {
				propOnSlidingComplete(value);
			}
		},
		[propOnSlidingComplete]
	);

	// Crear SliderValues seguros para VOD
	const vodSliderValues = useMemo(() => {
		if (hasValidSliderValues) {
			return sliderValues!;
		}

		// Fallback solo si tenemos duración válida
		if (typeof duration === "number" && duration > 0) {
			return {
				minimumValue: 0,
				maximumValue: duration,
				progress: currentTime,
				percentProgress:
					duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0,
				canSeekToEnd: true,
				duration: duration,
				isLiveEdgePosition: false, // VOD nunca está en live edge
			};
		}

		return null;
	}, [hasValidSliderValues, sliderValues, duration, currentTime]);

	// Crear SliderValues seguros para DVR
	const dvrSliderValues = useMemo(() => {
		if (hasValidSliderValues && (sliderValues!.liveEdge !== undefined || isDVR)) {
			return sliderValues!;
		}

		return null;
	}, [hasValidSliderValues, sliderValues, isDVR]);

	// Componentes con SliderValues válidos
	const SliderVODComponent = useMemo(() => {
		if (!sliderVOD || !vodSliderValues) {
			return null;
		}

		return React.createElement(sliderVOD, {
			...vodSliderValues,
			thumbnailsMetadata,
			onSlidingStart: handleSlidingStart,
			onSlidingMove: handleSlidingMove,
			onSlidingComplete: handleSlidingComplete,
		});
	}, [
		sliderVOD,
		vodSliderValues,
		thumbnailsMetadata,
		handleSlidingStart,
		handleSlidingMove,
		handleSlidingComplete,
	]);

	const SliderDVRComponent = useMemo(() => {
		if (!sliderDVR || !dvrSliderValues) {
			return null;
		}

		return React.createElement(sliderDVR, {
			...dvrSliderValues,
			thumbnailsMetadata,
			onSlidingStart: handleSlidingStart,
			onSlidingMove: handleSlidingMove,
			onSlidingComplete: handleSlidingComplete,
		});
	}, [
		sliderDVR,
		dvrSliderValues,
		thumbnailsMetadata,
		handleSlidingStart,
		handleSlidingMove,
		handleSlidingComplete,
	]);

	// Componentes default solo si tenemos valores válidos
	const DefaultVODSlider = useMemo(() => {
		if (!vodSliderValues) {
			return null;
		}

		return (
			<VODSlider
				{...vodSliderValues}
				thumbnailsMetadata={thumbnailsMetadata}
				onSlidingStart={handleSlidingStart}
				onSlidingMove={handleSlidingMove}
				onSlidingComplete={handleSlidingComplete}
			/>
		);
	}, [
		vodSliderValues,
		thumbnailsMetadata,
		handleSlidingStart,
		handleSlidingMove,
		handleSlidingComplete,
	]);

	const DefaultDVRSlider = useMemo(() => {
		if (!dvrSliderValues) {
			return null;
		}

		return (
			<DVRSlider
				{...dvrSliderValues}
				onSlidingStart={handleSlidingStart}
				onSlidingMove={handleSlidingMove}
				onSlidingComplete={handleSlidingComplete}
			/>
		);
	}, [dvrSliderValues, handleSlidingStart, handleSlidingMove, handleSlidingComplete]);

	// Condiciones de renderizado mejoradas
	const showVODSlider = useMemo(
		() => !isLive && !isDVR && !!vodSliderValues,
		[isLive, isDVR, vodSliderValues]
	);
	const showDVRSlider = useMemo(
		() => (isLive || isDVR) && !!dvrSliderValues,
		[isLive, isDVR, dvrSliderValues]
	);

	const showThumbnailsContainer = useMemo(
		() => !avoidThumbnails && showThumbnails && !!thumbnailsMetadata,
		[avoidThumbnails, showThumbnails, thumbnailsMetadata]
	);

	// Componente ThumbnailsContainer memoizado
	const ThumbnailsComponent = useMemo(
		() =>
			showThumbnailsContainer ? (
				<ThumbnailsContainer
					seconds={sliderValueVOD}
					metadata={thumbnailsMetadata as IThumbnailMetadata}
				/>
			) : null,
		[showThumbnailsContainer, sliderValueVOD, thumbnailsMetadata]
	);

	return (
		<View style={styles.container}>
			<View style={styles.barSlider}>
				{showVODSlider && (SliderVODComponent || DefaultVODSlider)}
				{showDVRSlider && (SliderDVRComponent || DefaultDVRSlider)}
				{!showVODSlider && !showDVRSlider && (
					<View style={styles.placeholder}>
						{/* Placeholder o mensaje de carga si es necesario */}
					</View>
				)}
			</View>
			{ThumbnailsComponent}
		</View>
	);
};

export const Timeline = TimelineBase;
