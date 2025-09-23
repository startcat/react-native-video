/*
 * Hook para monitorear el progreso de descarga basado en downloadId o URI
 *
 */

import { useCallback, useEffect, useState } from "react";
import { PlayerError } from "../../../core/errors";
import { queueManager } from "../managers/QueueManager";
import { DownloadEventType, DownloadItemMetadata, DownloadStates, DownloadType } from "../types";
import { calculateRemainingTime, generateDownloadIdFromUri, isValidUri } from "../utils";

interface UseDownloadsProgressReturn {
	// Progreso actual
	progress: number; // (0-100)
	bytesDownloaded: number;
	totalBytes: number;

	// Performance
	speed: number; // (bytes/sec)
	remainingTime: number; // (seconds)
	elapsedTime: number; // (seconds)

	// Estado
	state: DownloadStates;
	error: PlayerError | null;
	retryCount: number;

	// Acciones específicas
	pause: () => Promise<void>;
	resume: () => Promise<void>;
	cancel: () => Promise<void>;
	retry: () => Promise<void>;

	// Metadata
	metadata: DownloadItemMetadata | null;
	startTime: number | null;
	completionTime: number | null;
	downloadType: DownloadType;
	isActive: boolean;
	canPause: boolean;
	canResume: boolean;
	canRetry: boolean;

	// DRM
	drmLicenseStatus: "pending" | "acquired" | "expired" | "none";

	// Red y calidad
	networkType?: "wifi" | "cellular";
	streamQuality?: "auto" | "low" | "medium" | "high" | "max";
}

/*
 * Hook para monitorear el progreso de descarga
 * Acepta downloadId directo o URI (convierte automáticamente a downloadId)
 *
 * @param downloadIdOrUri - downloadId directo o URI del contenido
 * @returns Estado y progreso
 *
 */

export function useDownloadsProgress(
	downloadIdOrUri: string | null | undefined
): UseDownloadsProgressReturn {
	// Determinar si es downloadId directo o URI
	const isUri = downloadIdOrUri ? isValidUri(downloadIdOrUri) : false;
	const downloadId = downloadIdOrUri
		? isUri
			? generateDownloadIdFromUri(downloadIdOrUri)
			: downloadIdOrUri
		: "";

	// Estado principal del hook
	const [hookState, setHookState] = useState<UseDownloadsProgressReturn>(() =>
		createInitialState()
	);

	// Función para obtener el estado actual del download
	const getCurrentState = useCallback((): UseDownloadsProgressReturn => {
		if (!downloadId) {
			return createInitialState();
		}

		// Buscar en la cola de descargas
		const downloadItem = queueManager.getDownload(downloadId);

		if (!downloadItem) {
			return createNotDownloadedState();
		}

		// Construir estado basado en el DownloadItem existente
		const stats = downloadItem.stats || {};
		const state = downloadItem.state;

		// Calcular tiempos
		const startTime = stats.startedAt || null;
		const completionTime = stats.downloadedAt || null;
		const elapsedTime = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

		// Calcular capacidades de acción
		const canPause = state === DownloadStates.DOWNLOADING;
		const canResume = state === DownloadStates.PAUSED;
		const canRetry = state === DownloadStates.FAILED;
		const isActive = [
			DownloadStates.DOWNLOADING,
			DownloadStates.QUEUED,
			DownloadStates.PREPARING,
		].includes(state);

		return {
			// Progreso actual
			progress: stats.progressPercent || 0,
			bytesDownloaded: stats.bytesDownloaded || 0,
			totalBytes: stats.totalBytes || 0,

			// Performance
			speed: stats.downloadSpeed || 0,
			remainingTime: calculateRemainingTime(stats),
			elapsedTime,

			// Estado
			state,
			error: state === DownloadStates.FAILED ? stats.error || null : null,
			retryCount: stats.retryCount || 0,

			// Acciones específicas (implementadas más abajo)
			pause: () => pauseDownload(downloadId),
			resume: () => resumeDownload(downloadId),
			cancel: () => cancelDownload(downloadId),
			retry: () => retryDownload(downloadId),

			// Metadata
			metadata: createMetadataFromDownloadItem(downloadItem),
			startTime,
			completionTime,
			downloadType: downloadItem.type || DownloadType.BINARY,
			isActive,
			canPause,
			canResume,
			canRetry,

			// DRM
			drmLicenseStatus: stats.drmLicenseStatus || "none",

			// Red y calidad
			networkType: stats.networkType,
			streamQuality: stats.streamQuality,
		};
	}, [downloadId]);

	// Implementación de acciones
	const pauseDownload = useCallback(async (id: string) => {
		try {
			await queueManager.pauseDownload(id);
		} catch (error) {
			console.error("Failed to pause download:", error);
		}
	}, []);

	const resumeDownload = useCallback(async (id: string) => {
		try {
			await queueManager.resumeDownload(id);
		} catch (error) {
			console.error("Failed to resume download:", error);
		}
	}, []);

	const cancelDownload = useCallback(async (id: string) => {
		try {
			await queueManager.removeDownload(id);
		} catch (error) {
			console.error("Failed to cancel download:", error);
		}
	}, []);

	const retryDownload = useCallback(async (id: string) => {
		try {
			// Obtener el item actual
			const item = queueManager.getDownload(id);
			if (item && item.state === DownloadStates.FAILED) {
				// Cambiar estado a QUEUED para reintentarlo
				await queueManager.resumeDownload(id);
			}
		} catch (error) {
			console.error("Failed to retry download:", error);
		}
	}, []);

	// Actualizar estado cuando cambia el downloadId
	useEffect(() => {
		const newState = getCurrentState();
		setHookState(newState);
	}, [getCurrentState]);

	// Suscribirse a eventos de descarga
	useEffect(() => {
		if (!downloadId) return;

		const handleDownloadEvent = (eventData: any) => {
			// Solo procesar eventos relacionados con nuestro downloadId
			if (eventData.downloadId === downloadId) {
				setHookState(getCurrentState());
			}
		};

		// Suscribirse a todos los eventos relevantes
		const unsubscribeProgress = queueManager.subscribe(
			DownloadEventType.PROGRESS,
			handleDownloadEvent
		);
		const unsubscribeStarted = queueManager.subscribe(
			DownloadEventType.STARTED,
			handleDownloadEvent
		);
		const unsubscribeCompleted = queueManager.subscribe(
			DownloadEventType.COMPLETED,
			handleDownloadEvent
		);
		const unsubscribeFailed = queueManager.subscribe(
			DownloadEventType.FAILED,
			handleDownloadEvent
		);
		const unsubscribePaused = queueManager.subscribe(
			DownloadEventType.PAUSED,
			handleDownloadEvent
		);
		const unsubscribeResumed = queueManager.subscribe(
			DownloadEventType.RESUMED,
			handleDownloadEvent
		);
		const unsubscribeQueued = queueManager.subscribe(
			DownloadEventType.QUEUED,
			handleDownloadEvent
		);
		const unsubscribeRemoved = queueManager.subscribe(
			DownloadEventType.REMOVED,
			handleDownloadEvent
		);

		return () => {
			unsubscribeProgress();
			unsubscribeStarted();
			unsubscribeCompleted();
			unsubscribeFailed();
			unsubscribePaused();
			unsubscribeResumed();
			unsubscribeQueued();
			unsubscribeRemoved();
		};
	}, [downloadId, getCurrentState]);

	return hookState;
}

/*
 * FUNCIONES AUXILIARES
 *
 */

function createInitialState(): UseDownloadsProgressReturn {
	const noopAsync = async () => {};

	return {
		// Progreso actual
		progress: 0,
		bytesDownloaded: 0,
		totalBytes: 0,

		// Performance
		speed: 0,
		remainingTime: 0,
		elapsedTime: 0,

		// Estado
		state: DownloadStates.NOT_DOWNLOADED,
		error: null,
		retryCount: 0,

		// Acciones específicas (no-op para estado inicial)
		pause: noopAsync,
		resume: noopAsync,
		cancel: noopAsync,
		retry: noopAsync,

		// Metadata
		metadata: null,
		startTime: null,
		completionTime: null,
		downloadType: DownloadType.BINARY,
		isActive: false,
		canPause: false,
		canResume: false,
		canRetry: false,

		// DRM
		drmLicenseStatus: "none",

		// Red y calidad
		networkType: undefined,
		streamQuality: undefined,
	};
}

function createNotDownloadedState(): UseDownloadsProgressReturn {
	const noopAsync = async () => {};

	return {
		// Progreso actual
		progress: 0,
		bytesDownloaded: 0,
		totalBytes: 0,

		// Performance
		speed: 0,
		remainingTime: 0,
		elapsedTime: 0,

		// Estado - NOT_DOWNLOADED cuando no existe en la cola
		state: DownloadStates.NOT_DOWNLOADED,
		error: null,
		retryCount: 0,

		// Acciones específicas (no-op para contenido no descargado)
		pause: noopAsync,
		resume: noopAsync,
		cancel: noopAsync,
		retry: noopAsync,

		// Metadata
		metadata: null,
		startTime: null,
		completionTime: null,
		downloadType: DownloadType.BINARY,
		isActive: false,
		canPause: false,
		canResume: false,
		canRetry: false,

		// DRM
		drmLicenseStatus: "none",

		// Red y calidad
		networkType: undefined,
		streamQuality: undefined,
	};
}

/*
 * Crea un objeto DownloadItemMetadata a partir de un DownloadItem
 *
 * @param downloadItem - Item de descarga del cual extraer metadata
 * @returns Metadata estructurada o null si no hay suficiente información
 *
 */

function createMetadataFromDownloadItem(downloadItem: any): DownloadItemMetadata | null {
	if (!downloadItem || !downloadItem.id) {
		return null;
	}

	return {
		// Identificación
		id: downloadItem.id,
		title: downloadItem.title || "",
		uri: downloadItem.uri || "",

		// Metadata
		media: downloadItem.media,
		licenseExpirationDate: downloadItem.licenseExpirationDate,

		// Perfiles asociados
		profileIds: downloadItem.profileIds || [],

		// Configuración DRM
		drm: downloadItem.drm,
		drmScheme: downloadItem.drmScheme,

		// Estado y archivos
		state: downloadItem.state,
		fileUri: downloadItem.fileUri,
	};
}
