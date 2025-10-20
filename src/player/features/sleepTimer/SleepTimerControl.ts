/*
 * SleepTimerControl - Control estático del sleep timer global
 *
 * Permite activar, desactivar y consultar el estado de un timer que pausará
 * automáticamente la reproducción cuando llegue a cero.
 *
 * NO requiere referencias al player - funciona de forma global usando MediaSession
 *
 */

import { NativeModules } from "react-native";

const { VideoSleepTimerModule } = NativeModules;

export interface SleepTimerStatus {
	isActive: boolean;
	remainingSeconds: number;
	isFinishCurrentMode: boolean; // true = pausa al finalizar episodio actual
}

export class SleepTimerControl {
	/*
	 * Activa el sleep timer con los segundos especificados
	 * Si ya existe un timer activo, lo reinicia con el nuevo valor
	 *
	 * @param seconds - Segundos hasta que se pause la reproducción
	 *
	 */

	static activateSleepTimer(seconds: number): void {
		if (seconds <= 0) {
			console.warn("[SleepTimer] Invalid seconds value:", seconds);
			return;
		}

		if (!VideoSleepTimerModule) {
			console.error("[SleepTimer] VideoSleepTimerModule not available");
			return;
		}

		console.log(`🔔 [SleepTimer] Activating sleep timer for ${seconds} seconds`);
		VideoSleepTimerModule.activateSleepTimer(seconds);
	}

	/*
	 * Activa el sleep timer en modo "Finalizar episodio actual"
	 * La reproducción se pausará cuando el media actual llegue a su fin
	 * Evita el auto-advance al siguiente item de la playlist
	 *
	 */

	static activateFinishCurrentTimer(): void {
		if (!VideoSleepTimerModule) {
			console.error("[SleepTimer] VideoSleepTimerModule not available");
			return;
		}

		console.log("🔔 [SleepTimer] Activating finish-current-episode mode");
		VideoSleepTimerModule.activateFinishCurrentTimer();
	}

	/*
	 * Cancela el sleep timer activo
	 *
	 */

	static cancelSleepTimer(): void {
		if (!VideoSleepTimerModule) {
			console.error("[SleepTimer] VideoSleepTimerModule not available");
			return;
		}

		console.log("🔔 [SleepTimer] Canceling sleep timer");
		VideoSleepTimerModule.cancelSleepTimer();
	}

	/*
	 * Obtiene el estado actual del sleep timer
	 * @returns Promise con el estado del timer (isActive y remainingSeconds)
	 *
	 */

	static async getSleepTimerStatus(): Promise<SleepTimerStatus> {
		if (!VideoSleepTimerModule) {
			console.error("[SleepTimer] VideoSleepTimerModule not available");
			return { isActive: false, remainingSeconds: 0, isFinishCurrentMode: false };
		}

		try {
			const status = await VideoSleepTimerModule.getSleepTimerStatus();
			return status as SleepTimerStatus;
		} catch (error) {
			console.error("[SleepTimer] Error getting sleep timer status:", error);
			return { isActive: false, remainingSeconds: 0, isFinishCurrentMode: false };
		}
	}
}
