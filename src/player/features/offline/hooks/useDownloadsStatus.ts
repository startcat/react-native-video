/*
 * Hook ligero para estado del sistema de descargas (sin suscripción a PROGRESS)
 *
 * Proporciona solo estado del sistema y acciones masivas/individuales.
 * NO se suscribe a eventos PROGRESS, evitando re-renders frecuentes
 * en componentes que solo necesitan controlar descargas (pausar/reanudar).
 *
 * Usar en lugar de useDownloadsManager cuando NO se necesita:
 * - Lista de descargas
 * - Estadísticas de progreso (totalProgress, globalSpeed, queueStats)
 *
 */

import { useCallback, useEffect, useState } from "react";
import { PlayerError } from "../../../core/errors";
import { downloadsManager } from "../managers/DownloadsManager";
import { DownloadEventType } from "../types";

export interface UseDownloadsStatusReturn {
	// Estado del sistema (sin datos de progreso)
	isInitialized: boolean;
	isProcessing: boolean;
	isPaused: boolean;

	// Acciones masivas
	pauseAll: () => Promise<void>;
	resumeAll: () => Promise<void>;

	// Acciones individuales
	pauseDownload: (id: string) => Promise<void>;
	resumeDownload: (id: string) => Promise<void>;

	// Error
	error: PlayerError | null;
}

interface UseDownloadsStatusOptions {
	autoInit?: boolean;
}

/*
 * Hook ligero del sistema de descargas — solo estado y acciones
 *
 * @param options Opciones de configuración
 * @returns Estado del sistema y acciones (sin progreso)
 *
 */

export function useDownloadsStatus(
	options: UseDownloadsStatusOptions = {}
): UseDownloadsStatusReturn {
	const { autoInit = true } = options;

	const [isInitialized, setIsInitialized] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [isPaused, setIsPaused] = useState(false);
	const [error, setError] = useState<PlayerError | null>(null);

	// Actualizar estado desde el manager (solo flags de estado, sin descargas ni stats)
	const updateStatus = useCallback(() => {
		if (downloadsManager.isInitialized()) {
			setIsProcessing(downloadsManager.isProcessing());
			setIsPaused(downloadsManager.isPaused());
		}
	}, []);

	// Inicialización
	useEffect(() => {
		if (autoInit && !isInitialized) {
			const init = async () => {
				try {
					await downloadsManager.initialize();
					updateStatus();
					setIsInitialized(true);
					setError(null);
				} catch (err) {
					const caughtError =
						err instanceof PlayerError
							? err
							: new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE", { originalError: err });
					setError(caughtError);
				}
			};
			init();
		}
	}, [autoInit, isInitialized, updateStatus]);

	// Suscripción a eventos de estado (NO PROGRESS)
	useEffect(() => {
		if (!downloadsManager.isInitialized()) {
			return;
		}

		const unsubscribers: (() => void)[] = [];

		// Eventos de sistema
		unsubscribers.push(
			downloadsManager.subscribe("system:started", () => {
				updateStatus();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe("system:stopped", () => {
				updateStatus();
			})
		);

		// Eventos de descarga que cambian isProcessing/isPaused
		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.STARTED, () => {
				updateStatus();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.COMPLETED, () => {
				updateStatus();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.FAILED, () => {
				updateStatus();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.PAUSED, () => {
				updateStatus();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.RESUMED, () => {
				updateStatus();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.STATE_CHANGE, () => {
				updateStatus();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.REMOVED, () => {
				updateStatus();
			})
		);

		return () => {
			unsubscribers.forEach(unsubscriber => unsubscriber());
		};
	}, [isInitialized, updateStatus]);

	// Acciones masivas
	const pauseAll = useCallback(async (): Promise<void> => {
		try {
			await downloadsManager.pauseAll();
			updateStatus();
		} catch (err) {
			const caughtError =
				err instanceof PlayerError
					? err
					: new PlayerError("DOWNLOAD_FAILED", { originalError: err });
			setError(caughtError);
			throw caughtError;
		}
	}, [updateStatus]);

	const resumeAll = useCallback(async (): Promise<void> => {
		try {
			await downloadsManager.resumeAll();
			updateStatus();
		} catch (err) {
			const caughtError =
				err instanceof PlayerError
					? err
					: new PlayerError("DOWNLOAD_FAILED", { originalError: err });
			setError(caughtError);
			throw caughtError;
		}
	}, [updateStatus]);

	// Acciones individuales
	const pauseDownload = useCallback(
		async (id: string): Promise<void> => {
			try {
				await downloadsManager.pauseDownload(id);
				updateStatus();
			} catch (err) {
				const caughtError =
					err instanceof PlayerError
						? err
						: new PlayerError("DOWNLOAD_FAILED", { originalError: err, downloadId: id });
				setError(caughtError);
				throw caughtError;
			}
		},
		[updateStatus]
	);

	const resumeDownload = useCallback(
		async (id: string): Promise<void> => {
			try {
				await downloadsManager.resumeDownload(id);
				updateStatus();
			} catch (err) {
				const caughtError =
					err instanceof PlayerError
						? err
						: new PlayerError("DOWNLOAD_FAILED", { originalError: err, downloadId: id });
				setError(caughtError);
				throw caughtError;
			}
		},
		[updateStatus]
	);

	return {
		isInitialized,
		isProcessing,
		isPaused,
		pauseAll,
		resumeAll,
		pauseDownload,
		resumeDownload,
		error,
	};
}
