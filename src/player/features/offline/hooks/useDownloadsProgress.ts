/*
 * Hook para monitorear el progreso de descarga basado en downloadId o URI
 *
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlayerError } from "../../../core/errors";
import { queueManager } from "../managers/QueueManager";
import { DownloadItem, DownloadItemMetadata, DownloadStates, DownloadType } from "../types";
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
	// Memoizar cálculo de downloadId para evitar recalcular en cada render
	const downloadId = useMemo(() => {
		if (!downloadIdOrUri) {
			return "";
		}
		const isUri = isValidUri(downloadIdOrUri);
		return isUri ? generateDownloadIdFromUri(downloadIdOrUri) : downloadIdOrUri;
	}, [downloadIdOrUri]);

	// Estado principal del hook
	const [hookState, setHookState] = useState<UseDownloadsProgressReturn>(() =>
		createInitialState()
	);

	// Implementación de acciones (declaradas antes de getCurrentState)
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

	// Memoizar getCurrentState para evitar recrear la función en cada render
	// Solo se recrea cuando downloadId cambia
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
	}, [downloadId, pauseDownload, resumeDownload, cancelDownload, retryDownload]);

	// Actualizar estado cuando cambia el downloadId
	useEffect(() => {
		const newState = getCurrentState();
		setHookState(newState);
	}, [getCurrentState]);

	// Suscribirse a eventos de descarga (OPTIMIZADO + THROTTLEADO)
	// Usa subscribeToDownload que filtra eventos por downloadId específico
	// Throttle de 2s para eventos de progreso, inmediato para cambios de estado
	const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastStateRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		if (!downloadId) {
			return;
		}

		// Inicializar referencia al estado actual
		lastStateRef.current = hookState.state;

		const unsubscribe = queueManager.subscribeToDownload(downloadId, () => {
			const newState = getCurrentState();

			// Si el estado (DOWNLOADING, COMPLETED, FAILED, PAUSED, etc.) cambió,
			// actualizar INMEDIATAMENTE y cancelar cualquier throttle pendiente
			if (newState.state !== lastStateRef.current) {
				if (throttleTimeoutRef.current) {
					clearTimeout(throttleTimeoutRef.current);
					throttleTimeoutRef.current = null;
				}
				lastStateRef.current = newState.state;
				setHookState(newState);
				return;
			}

			// Solo cambió el progreso → throttlear con trailing timeout de 2s
			// Si ya hay un timeout pendiente, no hacer nada (el timeout existente
			// leerá getCurrentState() que siempre tiene datos frescos del QueueManager)
			if (!throttleTimeoutRef.current) {
				throttleTimeoutRef.current = setTimeout(() => {
					throttleTimeoutRef.current = null;
					setHookState(getCurrentState());
				}, 2000);
			}
		});

		return () => {
			unsubscribe();
			if (throttleTimeoutRef.current) {
				clearTimeout(throttleTimeoutRef.current);
				throttleTimeoutRef.current = null;
			}
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

function createMetadataFromDownloadItem(downloadItem: DownloadItem): DownloadItemMetadata | null {
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
