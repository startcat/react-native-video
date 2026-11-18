import { startTransition } from "react";

/**
 * Estado de React que el flavour normal actualiza en cada tick de `onProgress` (EITB-1892).
 *
 * En producción (ETB On 2.2.3, iOS) saltaba «Maximum update depth exceeded» desde
 * `handleOnProgress` → `setCurrentTime`, sobre todo con la app en segundo plano. React 19
 * cuenta los commits que terminan con trabajo pendiente en las lanes urgentes (Sync,
 * InputContinuous, Default) y lanza el error al pasar de 50; las actualizaciones en
 * transición no cuentan. No se ha encontrado un bucle real: esto es un endurecimiento.
 *
 * - `updateProgressState`: solo con la app activa y en transición. Para estado que solo
 *   pinta los controles (`currentTime`); quien lo use debe refrescarlo al volver a `active`.
 * - `scheduleProgressStateUpdate`: siempre, pero en transición. Para estado que también
 *   se resetea fuera del tick y no conviene congelar (`sliderValues`).
 *
 * Nada que necesite el valor en segundo plano (now-playing, analítica, guardado de
 * progreso) lee este estado: usan el evento o refs.
 */

/** Programa `update` con prioridad baja (transición de React). */
export function scheduleProgressStateUpdate(update: () => void): void {
	startTransition(update);
}

/**
 * Programa `update` en transición solo si la app está activa.
 * Devuelve `true` si lo ha programado.
 */
export function updateProgressState(
	appState: string | null | undefined,
	update: () => void
): boolean {
	if (appState !== "active") {
		return false;
	}
	scheduleProgressStateUpdate(update);
	return true;
}
