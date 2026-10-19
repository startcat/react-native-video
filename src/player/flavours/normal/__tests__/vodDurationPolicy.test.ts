import { resolveVodDuration } from "../vodDurationPolicy";

/**
 * Duración del VOD en `handleOnProgress` — EITB-1844.
 *
 * Todo el player trabaja en segundos (`e.currentTime`, `e.seekableDuration`,
 * `IPlayerProgress.duration`, `events.onProgress`). La duración del consumidor se
 * dividía entre 1000 como si llegara en ms: GUAU pasa la de la API (2308 s) y, tras un
 * pre-roll en Android (sin `onLoad`), el slider quedaba en 2,308 s y el continue watching
 * no se guardaba.
 */
describe("vodDurationPolicy — resolveVodDuration", () => {
	it("conserva la duración que ya tiene el VodProgressManager", () => {
		expect(
			resolveVodDuration({
				currentDuration: 2300,
				propDuration: 9999,
				seekableDuration: 1200,
				canTrustSeekable: true,
			})
		).toEqual({ duration: 2300, source: "current" });
	});

	it("usa la duración del consumidor en segundos, sin dividirla (EITB-1844)", () => {
		expect(
			resolveVodDuration({
				currentDuration: 0,
				propDuration: 2308,
				seekableDuration: 30,
				canTrustSeekable: true,
			})
		).toEqual({ duration: 2308, source: "prop" });
	});

	it("prefiere la duración del consumidor aunque el anuncio no haya terminado", () => {
		expect(
			resolveVodDuration({
				currentDuration: 0,
				propDuration: 2308,
				seekableDuration: 22,
				canTrustSeekable: false,
			})
		).toEqual({ duration: 2308, source: "prop" });
	});

	it("sin duración del consumidor, cae a seekableDuration si ya se puede confiar en ella", () => {
		expect(
			resolveVodDuration({
				currentDuration: 0,
				propDuration: undefined,
				seekableDuration: 1500,
				canTrustSeekable: true,
			})
		).toEqual({ duration: 1500, source: "seekable" });
	});

	it("no usa seekableDuration antes de onLoad o del fin del anuncio: puede ser la del anuncio", () => {
		expect(
			resolveVodDuration({
				currentDuration: 0,
				propDuration: 0,
				seekableDuration: 22,
				canTrustSeekable: false,
			})
		).toEqual({ duration: 0, source: "none" });
	});

	it("ignora duraciones del consumidor no válidas", () => {
		for (const propDuration of [NaN, -5, Infinity]) {
			expect(
				resolveVodDuration({
					currentDuration: 0,
					propDuration,
					seekableDuration: 1500,
					canTrustSeekable: true,
				})
			).toEqual({ duration: 1500, source: "seekable" });
		}
	});
});
