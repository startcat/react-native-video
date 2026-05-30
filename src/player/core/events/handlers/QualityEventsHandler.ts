/*
 *  Handler específico para eventos de calidad
 *
 */

import { PlayerAnalyticsEvents } from "@overon/react-native-overon-player-analytics-plugins";

import type {
	OnBandwidthUpdateData,
	OnPlaybackMetricsData,
	OnVideoAspectRatioData,
	OnVideoTracksData,
} from "../../../../specs/VideoNativeComponent";

/**
 * PLAYER-200 — QoE telemetry forwarded to analytics.
 *
 * El paquete `@overon/react-native-overon-player-analytics-plugins` instalado
 * (0.3.x) tipa `QualityChangeParams` sólo con `quality/width/height/bitrate`,
 * pero el dispatcher reenvía el objeto VERBATIM a cada plugin
 * (`dispatchToPlugins(..., [params])`), por lo que los campos QoE adicionales
 * (`throughput`, `rendition`, `framesPerSecond`, `droppedFrames`, `totalBytes`)
 * llegan intactos al pump de Youbora en runtime. Definimos aquí el superconjunto
 * estructural (alineado con el contrato 0.5.x) y casteamos en el límite de
 * dispatch para no perder telemetría ni romper el typecheck contra 0.3.x.
 */
type QualityChangePayload = {
	quality: string;
	width?: number;
	height?: number;
	bitrate?: number;
	throughput?: number;
	framesPerSecond?: number;
	droppedFrames?: number;
	totalBytes?: number;
	rendition?: string;
};

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
		// La medición de ancho de banda del player. NPAW/Youbora la usa como
		// `throughput` (igual que el adaptador del framework: throughput = el valor
		// de ancho de banda medido). Guardamos el centinela `-1`/`<= 0` (Android
		// emite `-1` cuando el BandwidthMeter aún no tiene una estimación válida):
		// en ese caso NO emitimos nada para no contaminar las métricas con ceros.
		const bandwidth = data.bitrate;
		if (typeof bandwidth !== "number" || bandwidth <= 0) {
			return;
		}

		// onBitrateChange sólo cuando el bitrate medido cambia (dedup), como hace
		// handleVideoTracks.
		if (bandwidth !== this.currentBitrate) {
			this.analyticsEvents.onBitrateChange({
				bitrate: bandwidth,
				previousBitrate: this.currentBitrate,
				adaptive: true,
			});
			this.currentBitrate = bandwidth;
		}

		// onQualityChange con throughput = el ancho de banda medido (mapeo del
		// framework). `quality` es requerido; usamos String(bandwidth) cuando no
		// disponemos de una etiqueta de resolución.
		const quality = this.getQualityLabel(data.width, data.height);
		this.emitQualityChange({
			quality: quality !== "Unknown" ? quality : String(bandwidth),
			bitrate: bandwidth,
			throughput: bandwidth,
			...(this.isValid(data.width) ? { width: data.width } : {}),
			...(this.isValid(data.height) ? { height: data.height } : {}),
		});
	};

	handlePlaybackMetrics = (data: OnPlaybackMetricsData) => {
		// Métricas QoE de reproducción (PLAYER-195/200). Cada campo es opcional y
		// puede venir como centinela (`-1`) o `0` "desconocido"; sólo propagamos
		// los que aportan información real. Reflejo del `onPlaybackMetrics` del
		// adaptador del framework, adaptado al estado de instancia.
		const { throughput, bitrate, framesPerSecond, droppedFrames, width, height } = data;

		const payload: QualityChangePayload = { quality: "metrics" };

		if (this.isValid(bitrate) && bitrate > 0) {
			payload.bitrate = bitrate;
		}
		if (this.isValid(throughput) && throughput > 0) {
			payload.throughput = throughput;
		}
		if (this.isValid(framesPerSecond) && framesPerSecond > 0) {
			payload.framesPerSecond = framesPerSecond;
		}
		// droppedFrames es acumulativo: 0 es un valor válido (sin descartes).
		if (this.isValid(droppedFrames)) {
			payload.droppedFrames = droppedFrames;
		}
		if (this.isValid(data.totalBytesTransferred) && data.totalBytesTransferred > 0) {
			payload.totalBytes = data.totalBytesTransferred;
		}

		// Resolución/rendición derivadas del width×height de la rendición
		// seleccionada (reutiliza getQualityLabel).
		const hasResolution =
			this.isValid(width) && this.isValid(height) && width > 0 && height > 0;
		if (hasResolution) {
			const rendition = this.getQualityLabel(width, height);
			payload.quality = rendition !== "Unknown" ? rendition : payload.quality;
			payload.rendition = rendition !== "Unknown" ? rendition : `${width}x${height}`;
			payload.width = width;
			payload.height = height;
		}

		// Si no hay ninguna métrica útil, no emitimos.
		const hasMetric =
			payload.bitrate !== undefined ||
			payload.throughput !== undefined ||
			payload.framesPerSecond !== undefined ||
			payload.droppedFrames !== undefined ||
			payload.totalBytes !== undefined ||
			payload.rendition !== undefined;
		if (!hasMetric) {
			return;
		}

		this.emitQualityChange(payload);

		// onResolutionChange cuando width/height presentes y cambiaron.
		if (hasResolution && (width !== this.currentWidth || height !== this.currentHeight)) {
			this.analyticsEvents.onResolutionChange({
				width,
				height,
				previousWidth: this.currentWidth,
				previousHeight: this.currentHeight,
			});
			this.currentWidth = width;
			this.currentHeight = height;
		}
	};

	handleAspectRatio = (data: OnVideoAspectRatioData) => {
		// Manejar cambios en la relación de aspecto
		console.log("[QualityEventsHandler] Aspect ratio change:", data.width, "x", data.height);
	};

	private isValid = (value: number | undefined): value is number =>
		typeof value === "number" && Number.isFinite(value) && value >= 0;

	/**
	 * Emite `onQualityChange` con el superconjunto de campos QoE. El paquete
	 * instalado tipa el método más estrecho, pero reenvía el objeto verbatim al
	 * pump, así que casteamos en este único punto para preservar la telemetría.
	 */
	private emitQualityChange = (payload: QualityChangePayload) => {
		this.analyticsEvents.onQualityChange(
			payload as Parameters<PlayerAnalyticsEvents["onQualityChange"]>[0]
		);
	};

	private getQualityLabel = (width?: number, height?: number): string => {
		if (!width || !height) {
			return "Unknown";
		}

		if (height >= 2160) {
			return "4K";
		}
		if (height >= 1440) {
			return "1440p";
		}
		if (height >= 1080) {
			return "1080p";
		}
		if (height >= 720) {
			return "720p";
		}
		if (height >= 480) {
			return "480p";
		}
		if (height >= 360) {
			return "360p";
		}
		return `${width}x${height}`;
	};
}
