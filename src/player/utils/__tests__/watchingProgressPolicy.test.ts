import { shouldReportWatchingProgress } from "../watchingProgressPolicy";

/**
 * Watching progress del flavour de vídeo — JOYF-428 (antes JOYF-421).
 *
 * `Player.tsx` solo arrancaba su intervalo de `addContentProgress` si al montar ya
 * conocía la duración (`playerProgress.duration`). Ninguna app la pasa al montar, así que
 * en vídeo nunca se guardaba el progreso y "Seguir viendo" no avanzaba. El reporte sale
 * ahora de cada progreso del contenido, limitado por `watchingProgressInterval`.
 */
const base = {
	hasHook: true,
	intervalMs: 3000,
	now: 10_000,
	lastReportAt: 0,
	lastReportedTime: undefined,
	currentTime: 42,
	duration: 600,
	isPaused: false,
	isLive: false,
	isCasting: false,
	isPlayingAd: false,
};

describe("watchingProgressPolicy — shouldReportWatchingProgress", () => {
	it("reporta en el primer progreso con duración válida", () => {
		expect(shouldReportWatchingProgress(base)).toBe(true);
	});

	it("no vuelve a reportar hasta que pasa el intervalo", () => {
		expect(shouldReportWatchingProgress({ ...base, lastReportAt: 8000 })).toBe(false);
		expect(shouldReportWatchingProgress({ ...base, lastReportAt: 7000 })).toBe(true);
	});

	it("no reporta sin el hook o con un intervalo 0 o indefinido", () => {
		expect(shouldReportWatchingProgress({ ...base, hasHook: false })).toBe(false);
		expect(shouldReportWatchingProgress({ ...base, intervalMs: 0 })).toBe(false);
		expect(shouldReportWatchingProgress({ ...base, intervalMs: undefined })).toBe(false);
	});

	it("no reporta sin una duración válida (carga, anuncios)", () => {
		expect(shouldReportWatchingProgress({ ...base, duration: 0 })).toBe(false);
		expect(shouldReportWatchingProgress({ ...base, duration: undefined })).toBe(false);
		expect(shouldReportWatchingProgress({ ...base, duration: NaN })).toBe(false);
	});

	it("no reporta en pausa, en directo, en Chromecast ni durante un anuncio", () => {
		expect(shouldReportWatchingProgress({ ...base, isPaused: true })).toBe(false);
		expect(shouldReportWatchingProgress({ ...base, isLive: true })).toBe(false);
		expect(shouldReportWatchingProgress({ ...base, isCasting: true })).toBe(false);
		expect(shouldReportWatchingProgress({ ...base, isPlayingAd: true })).toBe(false);
	});

	it("no repite la misma posición si el tiempo no ha avanzado (pausa desde el sistema)", () => {
		expect(shouldReportWatchingProgress({ ...base, lastReportedTime: 42 })).toBe(false);
		expect(shouldReportWatchingProgress({ ...base, lastReportedTime: 39 })).toBe(true);
	});
});
