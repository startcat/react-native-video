import { QualityEventsHandler } from "../QualityEventsHandler";

import type {
	OnBandwidthUpdateData,
	OnPlaybackMetricsData,
	OnVideoTracksData,
} from "../../../../../specs/VideoNativeComponent";

// El paquete externo solo se importa por tipos; en el test lo mockeamos para
// inyectar un objeto con los métodos que el handler invoca.
jest.mock(
	"@overon/react-native-overon-player-analytics-plugins",
	() => ({ PlayerAnalyticsEvents: jest.fn() }),
	{ virtual: true }
);

function buildAnalyticsEventsSpy() {
	return {
		onQualityChange: jest.fn(),
		onBitrateChange: jest.fn(),
		onResolutionChange: jest.fn(),
	};
}

describe("QualityEventsHandler — QoE telemetry (PLAYER-200)", () => {
	let analyticsEvents: ReturnType<typeof buildAnalyticsEventsSpy>;
	let handler: QualityEventsHandler;

	beforeEach(() => {
		analyticsEvents = buildAnalyticsEventsSpy();
		// El spy sólo implementa los métodos que el handler invoca; el cast evita
		// reconstruir el tipo completo de PlayerAnalyticsEvents en el test.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		handler = new QualityEventsHandler(analyticsEvents as any);
	});

	describe("handleBandwidthUpdate (no-op tras PLAYER-200)", () => {
		it("no emite nada: el `bitrate` del evento de bandwidth es ancho de banda de red, no media bitrate", () => {
			handler.handleBandwidthUpdate({ bitrate: 262_750_784 } as OnBandwidthUpdateData);
			handler.handleBandwidthUpdate({ bitrate: 3_000_000 } as OnBandwidthUpdateData);
			handler.handleBandwidthUpdate({ bitrate: -1 } as OnBandwidthUpdateData);

			expect(analyticsEvents.onQualityChange).not.toHaveBeenCalled();
			expect(analyticsEvents.onBitrateChange).not.toHaveBeenCalled();
			expect(analyticsEvents.onResolutionChange).not.toHaveBeenCalled();
		});
	});

	describe("handlePlaybackMetrics", () => {
		it("publica throughput/fps/droppedFrames/rendition pero NO bitrate (el `bitrate` del evento es ancho de banda)", () => {
			handler.handlePlaybackMetrics({
				throughput: 5_000_000,
				bitrate: 262_750_784, // estimación del BandwidthMeter — NO media bitrate
				framesPerSecond: 25,
				droppedFrames: 2,
				totalBytesTransferred: 1_234_567,
				width: 1920,
				height: 1080,
			} as OnPlaybackMetricsData);

			expect(analyticsEvents.onQualityChange).toHaveBeenCalledTimes(1);
			const payload = analyticsEvents.onQualityChange.mock.calls[0][0];
			expect(payload).toEqual(
				expect.objectContaining({
					quality: "1080p",
					rendition: "1080p",
					throughput: 5_000_000,
					framesPerSecond: 25,
					droppedFrames: 2,
					totalBytes: 1_234_567,
					width: 1920,
					height: 1080,
				})
			);
			// CLAVE del fix: el bitrate del evento NO se propaga (es ancho de banda,
			// no bitrate de medio; el bitrate real lo fija handleVideoTracks).
			expect(payload.bitrate).toBeUndefined();

			expect(analyticsEvents.onResolutionChange).toHaveBeenCalledTimes(1);
			expect(analyticsEvents.onResolutionChange).toHaveBeenCalledWith({
				width: 1920,
				height: 1080,
				previousWidth: 0,
				previousHeight: 0,
			});
		});

		it("sin resolución, NO fija quality/rendition (preserva la última rendición conocida, sin placeholder)", () => {
			handler.handlePlaybackMetrics({
				throughput: 5_000_000,
				framesPerSecond: 25,
			} as OnPlaybackMetricsData);

			expect(analyticsEvents.onQualityChange).toHaveBeenCalledTimes(1);
			const payload = analyticsEvents.onQualityChange.mock.calls[0][0];
			expect(payload.throughput).toBe(5_000_000);
			expect(payload.framesPerSecond).toBe(25);
			expect(payload.quality).toBeUndefined();
			expect(payload.rendition).toBeUndefined();
			expect(analyticsEvents.onResolutionChange).not.toHaveBeenCalled();
		});

		it("throughput cae al `bitrate` (estimación suavizada) si el campo throughput es inválido", () => {
			handler.handlePlaybackMetrics({
				throughput: -1,
				bitrate: 8_000_000,
			} as OnPlaybackMetricsData);

			const payload = analyticsEvents.onQualityChange.mock.calls[0][0];
			expect(payload.throughput).toBe(8_000_000);
			expect(payload.bitrate).toBeUndefined();
		});

		it("propaga droppedFrames=0 (valor válido acumulativo)", () => {
			handler.handlePlaybackMetrics({
				throughput: 5_000_000,
				droppedFrames: 0,
			} as OnPlaybackMetricsData);

			expect(analyticsEvents.onQualityChange).toHaveBeenCalledWith(
				expect.objectContaining({ throughput: 5_000_000, droppedFrames: 0 })
			);
		});

		it("guarda centinelas/ceros: throughput=-1, bitrate=0, fps=0 y sin resolución → no emite", () => {
			handler.handlePlaybackMetrics({
				throughput: -1,
				bitrate: 0,
				framesPerSecond: 0,
			} as OnPlaybackMetricsData);

			expect(analyticsEvents.onQualityChange).not.toHaveBeenCalled();
			expect(analyticsEvents.onResolutionChange).not.toHaveBeenCalled();
		});

		it("no emite onResolutionChange si la resolución no cambia", () => {
			const data = {
				throughput: 5_000_000,
				width: 1280,
				height: 720,
			} as OnPlaybackMetricsData;
			handler.handlePlaybackMetrics(data);
			handler.handlePlaybackMetrics(data);

			expect(analyticsEvents.onResolutionChange).toHaveBeenCalledTimes(1);
			expect(analyticsEvents.onQualityChange).toHaveBeenCalledTimes(2);
		});
	});

	describe("handleVideoTracks (fuente del bitrate real de la rendición — sin regresión)", () => {
		it("emite quality/bitrate/resolution para la pista seleccionada", () => {
			handler.handleVideoTracks({
				videoTracks: [
					{ index: 0, width: 1920, height: 1080, bitrate: 5_000_000, selected: true },
				],
			} as OnVideoTracksData);

			expect(analyticsEvents.onQualityChange).toHaveBeenCalledWith({
				quality: "1080p",
				height: 1080,
				width: 1920,
				bitrate: 5_000_000,
			});
			expect(analyticsEvents.onBitrateChange).toHaveBeenCalledWith({
				bitrate: 5_000_000,
				previousBitrate: 0,
				adaptive: true,
			});
			expect(analyticsEvents.onResolutionChange).toHaveBeenCalledWith({
				width: 1920,
				height: 1080,
				previousWidth: 0,
				previousHeight: 0,
			});
		});
	});
});
