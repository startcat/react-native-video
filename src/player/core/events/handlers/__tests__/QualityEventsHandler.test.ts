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
		on: jest.fn(),
	};
}

// Helper: devuelve los payloads de las llamadas a `on(event, payload)` cuya
// clave de evento coincide, en orden de emisión.
function payloadsFor(
	spy: ReturnType<typeof buildAnalyticsEventsSpy>,
	event: string
): Array<Record<string, unknown>> {
	return spy.on.mock.calls
		.filter(call => call[0] === event)
		.map(call => call[1] as Record<string, unknown>);
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

			expect(analyticsEvents.on).not.toHaveBeenCalledWith(
				"onQualityChange",
				expect.anything()
			);
			expect(analyticsEvents.on).not.toHaveBeenCalledWith(
				"onBitrateChange",
				expect.anything()
			);
			expect(analyticsEvents.on).not.toHaveBeenCalledWith(
				"onResolutionChange",
				expect.anything()
			);
		});
	});

	describe("handlePlaybackMetrics", () => {
		it("publica bitrate(medio)/throughput/fps/droppedFrames/rendition como campos distintos", () => {
			handler.handlePlaybackMetrics({
				bitrate: 4_200_000, // videoFormat.bitrate — bitrate de MEDIO de la rendición
				throughput: 220_000_000, // ancho de banda de RED (campo separado)
				framesPerSecond: 25,
				droppedFrames: 2,
				totalBytesTransferred: 1_234_567,
				width: 1920,
				height: 1080,
			} as OnPlaybackMetricsData);

			const qualityCalls = payloadsFor(analyticsEvents, "onQualityChange");
			expect(qualityCalls).toHaveLength(1);
			const payload = qualityCalls[0]!;
			expect(payload).toEqual(
				expect.objectContaining({
					quality: "1080p",
					rendition: "1080p",
					framesPerSecond: 25,
					droppedFrames: 2,
					totalBytes: 1_234_567,
					width: 1920,
					height: 1080,
				})
			);
			// CLAVE del fix: bitrate (medio) y throughput (red) son valores DISTINTOS.
			expect(payload.bitrate).toBe(4_200_000);
			expect(payload.throughput).toBe(220_000_000);

			expect(payloadsFor(analyticsEvents, "onResolutionChange")).toHaveLength(1);
			expect(analyticsEvents.on).toHaveBeenCalledWith("onResolutionChange", {
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

			const qualityCalls = payloadsFor(analyticsEvents, "onQualityChange");
			expect(qualityCalls).toHaveLength(1);
			const payload = qualityCalls[0]!;
			expect(payload.throughput).toBe(5_000_000);
			expect(payload.framesPerSecond).toBe(25);
			expect(payload.quality).toBeUndefined();
			expect(payload.rendition).toBeUndefined();
			expect(analyticsEvents.on).not.toHaveBeenCalledWith(
				"onResolutionChange",
				expect.anything()
			);
		});

		it("PLAYER-201: tras una rendición con resolución, un tick métrico sin resolución re-envía la última rendición", () => {
			// Primer tick con resolución → fija y cachea "1080p".
			handler.handlePlaybackMetrics({
				bitrate: 9_800_000,
				width: 1920,
				height: 1080,
			} as OnPlaybackMetricsData);
			// Segundo tick SIN resolución (caso Android) → debe re-enviar "1080p", no null.
			handler.handlePlaybackMetrics({
				throughput: 5_000_000,
			} as OnPlaybackMetricsData);

			const qualityCalls = payloadsFor(analyticsEvents, "onQualityChange");
			const second = qualityCalls[1]!;
			expect(second.rendition).toBe("1080p");
			expect(second.quality).toBe("1080p");
			expect(second.throughput).toBe(5_000_000);
		});

		it("emite bitrate de medio aunque throughput no sea válido (campos independientes)", () => {
			handler.handlePlaybackMetrics({
				bitrate: 4_200_000,
				throughput: -1,
			} as OnPlaybackMetricsData);

			const payload = payloadsFor(analyticsEvents, "onQualityChange")[0]!;
			expect(payload.bitrate).toBe(4_200_000);
			expect(payload.throughput).toBeUndefined();
		});

		it("propaga droppedFrames=0 (valor válido acumulativo)", () => {
			handler.handlePlaybackMetrics({
				throughput: 5_000_000,
				droppedFrames: 0,
			} as OnPlaybackMetricsData);

			expect(analyticsEvents.on).toHaveBeenCalledWith(
				"onQualityChange",
				expect.objectContaining({ throughput: 5_000_000, droppedFrames: 0 })
			);
		});

		it("guarda centinelas/ceros: throughput=-1, bitrate=0, fps=0 y sin resolución → no emite", () => {
			handler.handlePlaybackMetrics({
				throughput: -1,
				bitrate: 0,
				framesPerSecond: 0,
			} as OnPlaybackMetricsData);

			expect(analyticsEvents.on).not.toHaveBeenCalledWith(
				"onQualityChange",
				expect.anything()
			);
			expect(analyticsEvents.on).not.toHaveBeenCalledWith(
				"onResolutionChange",
				expect.anything()
			);
		});

		it("no emite onResolutionChange si la resolución no cambia", () => {
			const data = {
				throughput: 5_000_000,
				width: 1280,
				height: 720,
			} as OnPlaybackMetricsData;
			handler.handlePlaybackMetrics(data);
			handler.handlePlaybackMetrics(data);

			expect(payloadsFor(analyticsEvents, "onResolutionChange")).toHaveLength(1);
			expect(payloadsFor(analyticsEvents, "onQualityChange")).toHaveLength(2);
		});
	});

	describe("handleVideoTracks (fuente del bitrate real de la rendición — sin regresión)", () => {
		it("emite quality/bitrate/resolution para la pista seleccionada", () => {
			handler.handleVideoTracks({
				videoTracks: [
					{ index: 0, width: 1920, height: 1080, bitrate: 5_000_000, selected: true },
				],
			} as OnVideoTracksData);

			expect(analyticsEvents.on).toHaveBeenCalledWith("onQualityChange", {
				quality: "1080p",
				height: 1080,
				width: 1920,
				bitrate: 5_000_000,
			});
			expect(analyticsEvents.on).toHaveBeenCalledWith("onBitrateChange", {
				bitrate: 5_000_000,
				previousBitrate: 0,
				adaptive: true,
			});
			expect(analyticsEvents.on).toHaveBeenCalledWith("onResolutionChange", {
				width: 1920,
				height: 1080,
				previousWidth: 0,
				previousHeight: 0,
			});
		});
	});
});
