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

	describe("handleBandwidthUpdate", () => {
		it("ignora el centinela -1 (no emite nada)", () => {
			handler.handleBandwidthUpdate({ bitrate: -1 } as OnBandwidthUpdateData);

			expect(analyticsEvents.onQualityChange).not.toHaveBeenCalled();
			expect(analyticsEvents.onBitrateChange).not.toHaveBeenCalled();
		});

		it("ignora 0 (no emite nada)", () => {
			handler.handleBandwidthUpdate({ bitrate: 0 } as OnBandwidthUpdateData);

			expect(analyticsEvents.onQualityChange).not.toHaveBeenCalled();
			expect(analyticsEvents.onBitrateChange).not.toHaveBeenCalled();
		});

		it("emite onBitrateChange y onQualityChange (con throughput) para un valor real", () => {
			handler.handleBandwidthUpdate({ bitrate: 3_000_000 } as OnBandwidthUpdateData);

			expect(analyticsEvents.onBitrateChange).toHaveBeenCalledTimes(1);
			expect(analyticsEvents.onBitrateChange).toHaveBeenCalledWith({
				bitrate: 3_000_000,
				previousBitrate: 0,
				adaptive: true,
			});

			expect(analyticsEvents.onQualityChange).toHaveBeenCalledTimes(1);
			expect(analyticsEvents.onQualityChange).toHaveBeenCalledWith(
				expect.objectContaining({
					quality: "3000000",
					bitrate: 3_000_000,
					throughput: 3_000_000, // throughput = ancho de banda medido
				})
			);
		});

		it("no re-emite onBitrateChange si el bitrate no cambia (dedup)", () => {
			handler.handleBandwidthUpdate({ bitrate: 3_000_000 } as OnBandwidthUpdateData);
			handler.handleBandwidthUpdate({ bitrate: 3_000_000 } as OnBandwidthUpdateData);

			expect(analyticsEvents.onBitrateChange).toHaveBeenCalledTimes(1);
			// onQualityChange sí se emite cada tick (lleva throughput actualizado)
			expect(analyticsEvents.onQualityChange).toHaveBeenCalledTimes(2);
		});
	});

	describe("handlePlaybackMetrics", () => {
		it("emite onQualityChange con throughput/bitrate/rendition y onResolutionChange", () => {
			handler.handlePlaybackMetrics({
				throughput: 5_000_000,
				bitrate: 4_200_000,
				framesPerSecond: 30,
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
					bitrate: 4_200_000,
					framesPerSecond: 30,
					droppedFrames: 2,
					totalBytes: 1_234_567,
					width: 1920,
					height: 1080,
				})
			);

			expect(analyticsEvents.onResolutionChange).toHaveBeenCalledTimes(1);
			expect(analyticsEvents.onResolutionChange).toHaveBeenCalledWith({
				width: 1920,
				height: 1080,
				previousWidth: 0,
				previousHeight: 0,
			});
		});

		it("propaga droppedFrames=0 (valor válido acumulativo)", () => {
			handler.handlePlaybackMetrics({
				throughput: 5_000_000,
				droppedFrames: 0,
			} as OnPlaybackMetricsData);

			expect(analyticsEvents.onQualityChange).toHaveBeenCalledTimes(1);
			expect(analyticsEvents.onQualityChange).toHaveBeenCalledWith(
				expect.objectContaining({ throughput: 5_000_000, droppedFrames: 0 })
			);
		});

		it("guarda centinelas/ceros: throughput=-1 y bitrate=0 no se propagan", () => {
			handler.handlePlaybackMetrics({
				throughput: -1,
				bitrate: 0,
				framesPerSecond: 0,
			} as OnPlaybackMetricsData);

			// Sin métrica útil → no emite
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

	describe("handleVideoTracks (sin regresión)", () => {
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
