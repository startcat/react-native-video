/**
 * Duración del VOD en `handleOnProgress` del flavour normal (EITB-1844).
 *
 * Mientras el `VodProgressManager` no tiene duración (no ha llegado `onLoad`, que en
 * Android puede no dispararse tras un pre-roll de IMA), se elige por prioridad:
 *
 *   1. la del consumidor, `props.playerProgress.duration`: viene de la API, es la real
 *      y no crece con el buffer;
 *   2. `seekableDuration`, solo cuando ya se puede confiar en ella (tras `onLoad` o tras
 *      el anuncio): antes puede ser la duración del propio anuncio, y en VOD con
 *      buffering incremental crece 1 s por segundo.
 *
 * Todo va en SEGUNDOS, como `e.currentTime`, `e.seekableDuration`,
 * `IPlayerProgress.duration` y `events.onProgress`. Antes la del consumidor se dividía
 * entre 1000 como si llegara en ms: GUAU y ETB On pasan la de la API en segundos y el
 * slider quedaba en 2,308 s para un episodio de 2308 s.
 */

export type VodDurationSource = "current" | "prop" | "seekable" | "none";

export interface ResolveVodDurationInput {
	/** Duración que ya tiene el VodProgressManager (s); 0 si aún no tiene. */
	currentDuration: number;
	/** `props.playerProgress.duration` (s). */
	propDuration?: number;
	/** `e.seekableDuration` del onProgress (s). */
	seekableDuration?: number;
	/** Ya ha llegado `onLoad` o ha terminado el anuncio. */
	canTrustSeekable: boolean;
}

const isPositiveFinite = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && value > 0;

export function resolveVodDuration({
	currentDuration,
	propDuration,
	seekableDuration,
	canTrustSeekable,
}: ResolveVodDurationInput): { duration: number; source: VodDurationSource } {
	if (isPositiveFinite(currentDuration)) {
		return { duration: currentDuration, source: "current" };
	}

	if (isPositiveFinite(propDuration)) {
		return { duration: propDuration, source: "prop" };
	}

	if (canTrustSeekable && isPositiveFinite(seekableDuration)) {
		return { duration: seekableDuration, source: "seekable" };
	}

	return { duration: 0, source: "none" };
}
