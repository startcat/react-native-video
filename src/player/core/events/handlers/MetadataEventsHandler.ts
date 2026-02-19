/*
 *  Handler específico para eventos de metadatos
 *
 */

import { PlayerAnalyticsEvents } from "@overon/react-native-overon-player-analytics-plugins";

import type { OnTimedMetadataData } from "../../../../specs/VideoNativeComponent";

import type { OnLoadData } from "../../../../types/events";

export class MetadataEventsHandler {
	private analyticsEvents: PlayerAnalyticsEvents;

	constructor(analyticsEvents: PlayerAnalyticsEvents) {
		this.analyticsEvents = analyticsEvents;
	}

	handleLoad = (data: OnLoadData) => {
		// Construir metadatos del contenido
		const metadata = {
			duration: data.duration * 1000, // Convertir a milisegundos
			naturalSize: data.naturalSize,
			audioTracks: data.audioTracks,
			textTracks: data.textTracks,
			videoTracks: data.videoTracks,
		};

		this.analyticsEvents.onMetadataLoaded({
			metadata,
		});
	};

	handleTimedMetadata = (data: OnTimedMetadataData) => {
		// Manejar metadatos temporales (captions, chapters, etc.)
		console.log("[MetadataEventsHandler] Timed metadata:", data.metadata);

		this.analyticsEvents.onMetadataUpdate({
			metadata: data.metadata,
		});
	};
}
