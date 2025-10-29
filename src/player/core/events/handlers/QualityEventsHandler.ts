/*
 *  Handler específico para eventos de calidad
 *
 */

import { PlayerAnalyticsEvents } from "../../../features/analytics";

import type {
	OnBandwidthUpdateData,
	OnVideoAspectRatioData,
	OnVideoTracksData,
} from "../../../../specs/VideoNativeComponent";

export class QualityEventsHandler {
	private analyticsEvents: PlayerAnalyticsEvents;
	private currentBitrate = 0;
	private currentWidth = 0;
	private currentHeight = 0;
	private currentQuality = "";

	constructor(analyticsEvents: PlayerAnalyticsEvents) {
		this.analyticsEvents = analyticsEvents;
	}

	handleVideoTracks = (data: OnVideoTracksData) => {
		// Detectar cambios de calidad basados en las pistas de video
		const selectedTrack = data.videoTracks.find(track => track.selected);

		if (selectedTrack) {
			const newQuality = this.getQualityLabel(selectedTrack.width, selectedTrack.height);
			const newBitrate = selectedTrack.bitrate || 0;
			const newWidth = selectedTrack.width || 0;
			const newHeight = selectedTrack.height || 0;

			// Disparar evento de cambio de calidad
			if (newQuality !== this.currentQuality) {
				this.analyticsEvents.onQualityChange({
					quality: newQuality,
					height: newHeight,
					width: newWidth,
					bitrate: newBitrate,
				});
				this.currentQuality = newQuality;
			}

			// Disparar evento de cambio de bitrate
			if (newBitrate !== this.currentBitrate) {
				this.analyticsEvents.onBitrateChange({
					bitrate: newBitrate,
					previousBitrate: this.currentBitrate,
					adaptive: true,
				});
				this.currentBitrate = newBitrate;
			}

			// Disparar evento de cambio de resolución
			if (newWidth !== this.currentWidth || newHeight !== this.currentHeight) {
				this.analyticsEvents.onResolutionChange({
					width: newWidth,
					height: newHeight,
					previousWidth: this.currentWidth,
					previousHeight: this.currentHeight,
				});
				this.currentWidth = newWidth;
				this.currentHeight = newHeight;
			}
		}
	};

	handleBandwidthUpdate = (data: OnBandwidthUpdateData) => {
		// Actualizar información de ancho de banda
		console.log("[QualityEventsHandler] Bandwidth update:", data.bitrate);
	};

	handleAspectRatio = (data: OnVideoAspectRatioData) => {
		// Manejar cambios en la relación de aspecto
		console.log("[QualityEventsHandler] Aspect ratio change:", data.width, "x", data.height);
	};

	private getQualityLabel = (width?: number, height?: number): string => {
		if (!width || !height) return "Unknown";

		if (height >= 2160) return "4K";
		if (height >= 1440) return "1440p";
		if (height >= 1080) return "1080p";
		if (height >= 720) return "720p";
		if (height >= 480) return "480p";
		if (height >= 360) return "360p";
		return `${width}x${height}`;
	};

