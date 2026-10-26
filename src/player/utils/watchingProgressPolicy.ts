/**
 * Cuándo reporta `Player.tsx` el progreso de visionado (`hooks.addContentProgress`) en el
 * flavour de vídeo (JOYF-428, antes JOYF-421).
 *
 * Antes había un intervalo que solo arrancaba si al montar ya se conocía
 * `playerProgress.duration`. Ninguna app la pasa al montar, así que en vídeo nunca se
 * guardaba el progreso. Ahora el reporte sale de cada progreso del contenido que llega por
 * `onChangeCommonData`, con el mismo contrato que `audioPlayerBar`:
 *
 *   - `addContentProgress(currentTime, duration)`, en segundos;
 *   - como mucho uno por `watchingProgressInterval` (ms) y el primero en el primer
 *     progreso con duración válida;
 *   - nunca en pausa, en directo, en Chromecast ni durante un anuncio;
 *   - nunca con la misma posición que el último reporte: cubre las pausas que llegan desde
 *     el sistema (notificación, llamada) sin pasar por los controles.
 */

export interface WatchingProgressInput {
	/** La app ha pasado `hooks.addContentProgress`. */
	hasHook: boolean;
	/** `hooks.watchingProgressInterval` (ms). */
	intervalMs?: number;
	/** Marca de tiempo actual (ms). */
	now: number;
	/** Marca de tiempo del último reporte (ms); 0 si aún no ha habido ninguno. */
	lastReportAt: number;
	/** Posición del último reporte (s). */
	lastReportedTime?: number;
	/** Posición actual (s). */
	currentTime: number;
	/** Duración del contenido (s). */
	duration?: number;
	isPaused: boolean;
	isLive: boolean;
	isCasting: boolean;
	isPlayingAd: boolean;
}

const isPositiveFinite = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && value > 0;

export function shouldReportWatchingProgress({
	hasHook,
	intervalMs,
	now,
	lastReportAt,
	lastReportedTime,
	currentTime,
	duration,
	isPaused,
	isLive,
	isCasting,
	isPlayingAd,
}: WatchingProgressInput): boolean {
	if (!hasHook || !isPositiveFinite(intervalMs) || !isPositiveFinite(duration)) {
		return false;
	}

	if (isPaused || isLive || isCasting || isPlayingAd) {
		return false;
	}

	if (lastReportedTime !== undefined && currentTime === lastReportedTime) {
		return false;
	}

	return now - lastReportAt >= intervalMs;
}
