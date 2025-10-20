/*
 * SleepTimerControl - Control estático del sleep timer del player nativo
 *
 * Permite activar, desactivar y consultar el estado de un timer que pausará
 * automáticamente la reproducción cuando llegue a cero.
 *
 */

import { NativeModules, findNodeHandle } from "react-native";

const { RCTVideoManager } = NativeModules;

export interface SleepTimerStatus {
	isActive: boolean;
	remainingSeconds: number;
}

export class SleepTimerControl {
	/*
	 * Activa el sleep timer con los segundos especificados
	 * Si ya existe un timer activo, lo reinicia con el nuevo valor
	 *
	 * @param videoRef - Referencia al componente Video nativo
	 * @param seconds - Segundos hasta que se pause la reproducción
	 *
	 */

	static activateSleepTimer(videoRef: any, seconds: number): void {
		if (!videoRef || seconds <= 0) {
			console.warn("[SleepTimer] Invalid videoRef or seconds value");
			return;
		}

		const handle = findNodeHandle(videoRef);
		if (!handle) {
			console.warn("[SleepTimer] Could not find node handle for video ref");
			return;
		}

		console.log(`[SleepTimer] Activating sleep timer for ${seconds} seconds`);
		RCTVideoManager.activateSleepTimer(handle, seconds);
	}

	/*
	 * Cancela el sleep timer activo
	 *
	 * @param videoRef - Referencia al componente Video nativo
	 *
	 */

	static cancelSleepTimer(videoRef: any): void {
		if (!videoRef) {
			console.warn("[SleepTimer] Invalid videoRef");
			return;
		}

		const handle = findNodeHandle(videoRef);
		if (!handle) {
			console.warn("[SleepTimer] Could not find node handle for video ref");
			return;
		}

		console.log("[SleepTimer] Canceling sleep timer");
		RCTVideoManager.cancelSleepTimer(handle);
	}

	/*
	 * Obtiene el estado actual del sleep timer
	 *
	 * @param videoRef - Referencia al componente Video nativo
	 * @returns Promise con el estado del timer (isActive y remainingSeconds)
	 *
	 */

	static async getSleepTimerStatus(videoRef: any): Promise<SleepTimerStatus> {
		if (!videoRef) {
			console.warn("[SleepTimer] Invalid videoRef");
			return { isActive: false, remainingSeconds: 0 };
		}

		const handle = findNodeHandle(videoRef);
		if (!handle) {
			console.warn("[SleepTimer] Could not find node handle for video ref");
			return { isActive: false, remainingSeconds: 0 };
		}

		try {
			const status = await RCTVideoManager.getSleepTimerStatus(handle);
			return status as SleepTimerStatus;
		} catch (error) {
			console.error("[SleepTimer] Error getting sleep timer status:", error);
			return { isActive: false, remainingSeconds: 0 };
		}
	}
}
