import { PlaybackEventsHandler } from "../PlaybackEventsHandler";

import type { OnProgressData } from "../../../../../specs/VideoNativeComponent";

// El paquete externo solo se importa por tipos; en el test mockeamos la clase
// para inyectar un objeto con los métodos que el handler invoca.
jest.mock(
	"@overon/react-native-overon-player-analytics-plugins",
	() => ({ PlayerAnalyticsEvents: jest.fn() }),
	{ virtual: true }
);

function buildAnalyticsEventsSpy() {
	return {
		onPositionUpdate: jest.fn(),
		onProgress: jest.fn(),
		onSeekStart: jest.fn(),
		onSeekEnd: jest.fn(),
		onPositionChange: jest.fn(),
		onPlay: jest.fn(),
		onPause: jest.fn(),
		onBufferStart: jest.fn(),
		onBufferStop: jest.fn(),
		onStop: jest.fn(),
	};
}

function buildProgressData(currentTime: number, seekableDuration: number): OnProgressData {
	return {
		currentTime,
		seekableDuration,
		playableDuration: seekableDuration,
	} as OnProgressData;
}

describe("PlaybackEventsHandler — gate ad/media", () => {
	let analyticsEvents: ReturnType<typeof buildAnalyticsEventsSpy>;
	let handler: PlaybackEventsHandler;

	beforeEach(() => {
		analyticsEvents = buildAnalyticsEventsSpy();
		handler = new PlaybackEventsHandler(analyticsEvents as any);
	});

	describe("isAdActive=false (default)", () => {
		it("emite onPositionUpdate y onProgress", () => {
			handler.handleProgress(buildProgressData(10, 100), 10000, 100000);

			expect(analyticsEvents.onPositionUpdate).toHaveBeenCalledTimes(1);
			expect(analyticsEvents.onPositionUpdate).toHaveBeenCalledWith({
				position: 10000,
				duration: 100000,
				bufferedPosition: 100 * 1000,
			});
			expect(analyticsEvents.onProgress).toHaveBeenCalledTimes(1);
			expect(analyticsEvents.onProgress).toHaveBeenCalledWith({
				position: 10000,
				duration: 100000,
				percentageWatched: 10,
			});
		});

		it("calcula percentageWatched=0 cuando duration es 0", () => {
			handler.handleProgress(buildProgressData(5, 0), 5000, 0);

			expect(analyticsEvents.onProgress).toHaveBeenCalledWith(
				expect.objectContaining({ percentageWatched: 0 })
			);
		});
	});

	describe("isAdActive=true", () => {
		it("NO emite onPositionUpdate ni onProgress durante un ad", () => {
			handler.handleProgress(buildProgressData(10, 100), 10000, 100000, true);

			expect(analyticsEvents.onPositionUpdate).not.toHaveBeenCalled();
			expect(analyticsEvents.onProgress).not.toHaveBeenCalled();
		});

		it("ticks repetidos durante el break siguen sin emitir", () => {
			handler.handleProgress(buildProgressData(10, 100), 10000, 100000, true);
			handler.handleProgress(buildProgressData(11, 100), 11000, 100000, true);
			handler.handleProgress(buildProgressData(12, 100), 12000, 100000, true);

			expect(analyticsEvents.onPositionUpdate).not.toHaveBeenCalled();
			expect(analyticsEvents.onProgress).not.toHaveBeenCalled();
		});
	});

	describe("transición ad → contenido", () => {
		it("vuelve a emitir cuando isAdActive cambia a false", () => {
			handler.handleProgress(buildProgressData(10, 100), 10000, 100000, true);
			expect(analyticsEvents.onProgress).not.toHaveBeenCalled();

			handler.handleProgress(buildProgressData(11, 100), 11000, 100000, false);
			expect(analyticsEvents.onProgress).toHaveBeenCalledTimes(1);
		});
	});
});
