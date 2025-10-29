/*
 *  Handler específico para eventos de errores
 *
 */

import { PlayerError } from "../../../core/errors";
import { PlayerAnalyticsEvents } from "../../../features/analytics";

import type { OnVideoErrorData } from "../../../../specs/VideoNativeComponent";

export class ErrorEventsHandler {
	private analyticsEvents: PlayerAnalyticsEvents;

	constructor(analyticsEvents: PlayerAnalyticsEvents) {
		this.analyticsEvents = analyticsEvents;
	}

	handleError = (data: OnVideoErrorData) => {
		try {
			const errorType = this.categorizeError(data.error);

			switch (errorType) {
				case "network":
					this.analyticsEvents.onNetworkError({
						errorCode: data.error.code,
						errorMessage: data.error.localizedDescription,
						errorType: "network",
						isFatal: this.isErrorFatal(data.error),
						statusCode: this.extractStatusCode(data.error),
						url: this.extractUrl(data.error),
					});
					break;

				case "drm":
					this.analyticsEvents.onContentProtectionError({
						errorCode: data.error.code,
						errorMessage: data.error.localizedDescription,
						errorType: "drm",
						isFatal: this.isErrorFatal(data.error),
						drmType: this.extractDrmType(data.error),
					});
					break;

				case "stream":
					this.analyticsEvents.onStreamError({
						errorCode: data.error.code,
						errorMessage: data.error.localizedDescription,
						errorType: "playback",
						isFatal: this.isErrorFatal(data.error),
						streamUrl: this.extractStreamUrl(data.error),
						bitrate: this.extractBitrate(data.error),
					});
					break;

				default:
					this.analyticsEvents.onError({
						errorCode: data.error.code,
						errorMessage: data.error.localizedDescription,
						errorType: "other",
						isFatal: this.isErrorFatal(data.error),
					});
			}
		} catch (error) {
			throw new PlayerError("PLAYER_ERROR_PROCESSING_ERROR", { originalError: error });
		}
	};

	private categorizeError = (error: any): "network" | "drm" | "stream" | "other" => {
		const errorString = error.localizedDescription || error.description || "";

		if (errorString.includes("network") || errorString.includes("connection")) {
			return "network";
		}

		if (
			errorString.includes("drm") ||
			errorString.includes("license") ||
			errorString.includes("protection")
		) {
			return "drm";
		}

		if (
			errorString.includes("stream") ||
			errorString.includes("manifest") ||
			errorString.includes("codec")
		) {
			return "stream";
		}

		return "other";
	};

	private isErrorFatal = (error: any): boolean => {
		// Determinar si el error es fatal basándose en el código o tipo
		const fatalCodes = ["-1000", "-1001", "-1009", "-1200"];
		return fatalCodes.includes(String(error.code));
	};

	private extractStatusCode = (error: any): number | undefined => {
		// Extraer código de estado HTTP si está disponible
		return error.statusCode || error.httpStatusCode;
	};

	private extractUrl = (error: any): string | undefined => {
		// Extraer URL que causó el error
		return error.url || error.requestUrl;
	};

	private extractDrmType = (error: any): string | undefined => {
		// Extraer tipo de DRM del error
		return error.drmType || error.licenseType;
	};

	private extractStreamUrl = (error: any): string | undefined => {
		// Extraer URL del stream
		return error.streamUrl || error.manifestUrl;
	};

	private extractBitrate = (error: any): number | undefined => {
		// Extraer bitrate si está disponible
		return error.bitrate;
	};
}
