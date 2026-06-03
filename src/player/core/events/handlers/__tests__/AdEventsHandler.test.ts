import { AdEventsHandler } from "../AdEventsHandler";

import type { OnReceiveAdEventData } from "../../../../../types/events";

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

const buildEvent = (event: string, data?: Record<string, unknown>): OnReceiveAdEventData =>
	({
		event,
		data,
	}) as unknown as OnReceiveAdEventData;

describe("AdEventsHandler", () => {
	let analyticsEvents: ReturnType<typeof buildAnalyticsEventsSpy>;
	let handler: AdEventsHandler;

	beforeEach(() => {
		analyticsEvents = buildAnalyticsEventsSpy();
		handler = new AdEventsHandler(analyticsEvents as any);
	});

	describe("emisión onAdProgress", () => {
		beforeEach(() => {
			// Arrancar un break + ad para tener contexto coherente.
			handler.handleAdEvent(
				buildEvent("AD_BREAK_STARTED", { adBreakId: "break-1", adCount: 1 })
			);
			handler.handleAdEvent(
				buildEvent("STARTED", {
					adId: "ad-1",
					duration: 15, // segundos (formato iOS-like al haberlo extractado de STARTED)
					position: 0,
				})
			);
			analyticsEvents.on.mockClear();
		});

		it("emite onAdProgress con shape iOS (currentTime/duration en segundos)", () => {
			handler.handleAdEvent(buildEvent("AD_PROGRESS", { currentTime: 3.5, duration: 15 }));

			const progressCalls = payloadsFor(analyticsEvents, "onAdProgress");
			expect(progressCalls).toHaveLength(1);
			expect(analyticsEvents.on).toHaveBeenCalledWith(
				"onAdProgress",
				expect.objectContaining({
					adId: "ad-1",
					adBreakId: "break-1",
					position: 3500,
					duration: 15000,
				})
			);
			expect(progressCalls[0]!.percentageWatched as number).toBeCloseTo(
				(3500 / 15000) * 100,
				2
			);
		});

		it("emite onAdProgress con shape Android (position/duration en ms como string)", () => {
			handler.handleAdEvent(
				buildEvent("AD_PROGRESS", { position: "7000", duration: "15000" })
			);

			expect(payloadsFor(analyticsEvents, "onAdProgress")).toHaveLength(1);
			expect(analyticsEvents.on).toHaveBeenCalledWith(
				"onAdProgress",
				expect.objectContaining({ position: 7000, duration: 15000 })
			);
		});

		it("aplica throttle de 250 ms entre emisiones", () => {
			let now = 1_000_000;
			jest.spyOn(Date, "now").mockImplementation(() => now);

			handler.handleAdEvent(buildEvent("AD_PROGRESS", { currentTime: 1, duration: 15 }));
			now += 100;
			handler.handleAdEvent(buildEvent("AD_PROGRESS", { currentTime: 1.1, duration: 15 }));
			now += 100;
			handler.handleAdEvent(buildEvent("AD_PROGRESS", { currentTime: 1.2, duration: 15 }));

			expect(payloadsFor(analyticsEvents, "onAdProgress")).toHaveLength(1);

			now += 100; // total 300ms desde la 1ª emisión
			handler.handleAdEvent(buildEvent("AD_PROGRESS", { currentTime: 1.3, duration: 15 }));

			expect(payloadsFor(analyticsEvents, "onAdProgress")).toHaveLength(2);

			(Date.now as jest.Mock).mockRestore();
		});

		it("suspende emisión durante PAUSED y la reanuda con RESUMED", () => {
			let now = 2_000_000;
			jest.spyOn(Date, "now").mockImplementation(() => now);

			handler.handleAdEvent(buildEvent("AD_PROGRESS", { currentTime: 1, duration: 15 }));
			expect(payloadsFor(analyticsEvents, "onAdProgress")).toHaveLength(1);

			handler.handleAdEvent(buildEvent("PAUSED"));

			now += 1000;
			handler.handleAdEvent(buildEvent("AD_PROGRESS", { currentTime: 1, duration: 15 }));
			now += 1000;
			handler.handleAdEvent(buildEvent("AD_PROGRESS", { currentTime: 1, duration: 15 }));

			expect(payloadsFor(analyticsEvents, "onAdProgress")).toHaveLength(1); // sigue en 1

			handler.handleAdEvent(buildEvent("RESUMED"));
			now += 1000;
			handler.handleAdEvent(buildEvent("AD_PROGRESS", { currentTime: 5, duration: 15 }));

			expect(payloadsFor(analyticsEvents, "onAdProgress")).toHaveLength(2);

			(Date.now as jest.Mock).mockRestore();
		});

		it("usa duración cacheada de STARTED si AD_PROGRESS no la trae", () => {
			let now = 3_000_000;
			jest.spyOn(Date, "now").mockImplementation(() => now);

			handler.handleAdEvent(buildEvent("AD_PROGRESS", { currentTime: 5 }));

			expect(analyticsEvents.on).toHaveBeenCalledWith(
				"onAdProgress",
				expect.objectContaining({ position: 5000, duration: 15000 })
			);

			(Date.now as jest.Mock).mockRestore();
		});

		it("no emite ticks para FIRST_QUARTILE / MIDPOINT / THIRD_QUARTILE", () => {
			handler.handleAdEvent(buildEvent("FIRST_QUARTILE"));
			handler.handleAdEvent(buildEvent("MIDPOINT"));
			handler.handleAdEvent(buildEvent("THIRD_QUARTILE"));

			expect(analyticsEvents.on).not.toHaveBeenCalledWith("onAdProgress", expect.anything());
		});
	});

	describe("isAdPlaying — fix de handleAdBreakEnded (regresión C.3)", () => {
		it("isAdPlaying se baja en AD_BREAK_ENDED aunque no haya habido COMPLETED", () => {
			handler.handleAdEvent(buildEvent("AD_BREAK_STARTED", { adBreakId: "break-1" }));
			handler.handleAdEvent(buildEvent("STARTED", { adId: "ad-1", duration: 10 }));

			expect(handler.getIsAdPlaying()).toBe(true);

			// Caso DAI/SSAI: AD_BREAK_ENDED llega sin COMPLETED previo.
			handler.handleAdEvent(buildEvent("AD_BREAK_ENDED"));

			expect(handler.getIsAdPlaying()).toBe(false);
		});

		it("isAdPlaying también se baja en COMPLETED (comportamiento existente)", () => {
			handler.handleAdEvent(buildEvent("AD_BREAK_STARTED", { adBreakId: "break-1" }));
			handler.handleAdEvent(buildEvent("STARTED", { adId: "ad-1", duration: 10 }));

			handler.handleAdEvent(buildEvent("COMPLETED"));

			expect(handler.getIsAdPlaying()).toBe(false);
		});

		it("isAdPlaying se baja en SKIPPED, ERROR y ALL_ADS_COMPLETED", () => {
			const startBreak = () => {
				handler.handleAdEvent(buildEvent("AD_BREAK_STARTED", { adBreakId: "b" }));
				handler.handleAdEvent(buildEvent("STARTED", { adId: "a", duration: 10 }));
			};

			startBreak();
			handler.handleAdEvent(buildEvent("SKIPPED"));
			expect(handler.getIsAdPlaying()).toBe(false);

			startBreak();
			handler.handleAdEvent(buildEvent("ERROR"));
			expect(handler.getIsAdPlaying()).toBe(false);

			startBreak();
			handler.handleAdEvent(buildEvent("ALL_ADS_COMPLETED"));
			expect(handler.getIsAdPlaying()).toBe(false);
		});
	});

	describe("ciclo de vida completo del break", () => {
		it("orquesta onAdBreakBegin → onAdBegin → onAdEnd → onAdBreakEnd", () => {
			handler.handleAdEvent(buildEvent("AD_BREAK_STARTED", { adBreakId: "b1", adCount: 1 }));
			handler.handleAdEvent(buildEvent("STARTED", { adId: "a1", duration: 10 }));
			handler.handleAdEvent(buildEvent("COMPLETED"));
			handler.handleAdEvent(buildEvent("AD_BREAK_ENDED"));

			expect(payloadsFor(analyticsEvents, "onAdBreakBegin")).toHaveLength(1);
			expect(payloadsFor(analyticsEvents, "onAdBegin")).toHaveLength(1);
			expect(payloadsFor(analyticsEvents, "onAdEnd")).toHaveLength(1);
			expect(payloadsFor(analyticsEvents, "onAdBreakEnd")).toHaveLength(1);
		});
	});
});
