import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_CONFIG, LIMITS } from "../constants";
import { storageService } from "../services/storage/StorageService";
import { StorageEventType } from "../types";

/*
 * Hook para información de almacenamiento según la interfaz del contexto
 * Proporciona valores directos y acciones para gestión de espacio
 *
 */

export interface UseStorageInfoReturn {
	// Espacio
	totalSpace: number; // number (bytes)
	availableSpace: number; // number (bytes)
	usedSpace: number; // number (bytes)
	downloadSpace: number; // number (bytes)

	// Porcentajes
	usagePercentage: number; // number (0-100)
	downloadPercentage: number; // number (0-100)

	// Estado
	isLowSpace: boolean; // boolean
	spaceWarningLevel: "none" | "warning" | "critical";

	// Configuración
	warningThreshold: number; // number (0-1)
	minFreeSpaceMB: number; // number

	// Acciones
	checkSpace: () => Promise<void>;
	cleanupTemp: () => Promise<{ filesRemoved: number; spaceFreed: number }>;
	estimateSpaceNeeded: (downloadId?: string, type?: string, quality?: string) => Promise<number>;

	// Eventos
	onSpaceWarning: (callback: (level: string) => void) => () => void;

	// Directorios
	downloadDirectory: string;
	tempDirectory: string;
	subtitlesDirectory: string;
}

export function useStorageInfo(): UseStorageInfoReturn {
	// Estados del hook
	const [totalSpace, setTotalSpace] = useState<number>(0);
	const [availableSpace, setAvailableSpace] = useState<number>(0);
	const [usedSpace, setUsedSpace] = useState<number>(0);
	const [downloadSpace, setDownloadSpace] = useState<number>(0);
	const [usagePercentage, setUsagePercentage] = useState<number>(0);
	const [downloadPercentage, setDownloadPercentage] = useState<number>(0);
	const [isLowSpace, setIsLowSpace] = useState<boolean>(false);
	const [spaceWarningLevel, setSpaceWarningLevel] = useState<"none" | "warning" | "critical">(
		"none"
	);

	// Configuración constante
	const warningThreshold = DEFAULT_CONFIG.STORAGE_WARNING_THRESHOLD;
	const minFreeSpaceMB = LIMITS.MIN_DISK_SPACE_MB;

	// Directorios constantes
	const downloadDirectory = storageService.getDownloadDirectory();
	const tempDirectory = storageService.getTempDirectory();
	const subtitlesDirectory = storageService.getSubtitlesDirectory();

	// Debounce para evitar llamadas excesivas
	const updateTimerRef = useRef<NodeJS.Timeout | null>(null);
	const isUpdatingRef = useRef<boolean>(false);
	const pendingUpdatePromiseRef = useRef<Promise<void> | null>(null);

	// Función para actualizar todos los valores con debounce
	// Usamos useRef para mantener la función estable y evitar re-suscripciones
	const updateStorageInfoRef = useRef<() => Promise<void>>();

	updateStorageInfoRef.current = async () => {
		// Si ya hay una actualización en progreso, cancelar el timer anterior
		if (updateTimerRef.current) {
			clearTimeout(updateTimerRef.current);
		}

		// Crear promesa que otras llamadas concurrentes pueden esperar
		const updatePromise = (async () => {
			// Si ya hay una actualización en progreso, cancelar el timer anterior
			if (updateTimerRef.current) {
				clearTimeout(updateTimerRef.current);
			}

			// Si ya está actualizando, programar para después
			if (isUpdatingRef.current) {
				updateTimerRef.current = setTimeout(() => {
					updateStorageInfoRef.current?.();
				}, 500);
				return;
			}

			try {
				isUpdatingRef.current = true;

				// Single call to getStorageInfo() (cached 30s) + derived calculations
				const info = await storageService.getStorageInfo();
				const usagePercent = info.totalSpace > 0 ? Math.round((info.usedSpace / info.totalSpace) * 100) : 0;
				const downloadPercent = info.totalSpace > 0 ? Math.round((info.downloadsFolderSize / info.totalSpace) * 100) : 0;
				const lowSpace = await storageService.isLowSpace();
				const warningLevel = await storageService.getSpaceWarningLevel();

				setTotalSpace(info.totalSpace);
				setAvailableSpace(info.availableSpace);
				setUsedSpace(info.usedSpace);
				setDownloadSpace(info.downloadsFolderSize);
				setUsagePercentage(usagePercent);
				setDownloadPercentage(downloadPercent);
				setIsLowSpace(lowSpace);
				setSpaceWarningLevel(warningLevel);
			} catch (error) {
				console.error("Error updating storage info:", error);
			} finally {
				isUpdatingRef.current = false;
			}
		})();

		pendingUpdatePromiseRef.current = updatePromise;
		return updatePromise;
	};

	// Inicialización y suscripción a eventos
	// IMPORTANTE: Sin dependencias para evitar re-suscripciones
	useEffect(() => {
		const initializeStorage = async () => {
			// NOTA: No llamar a initialize() aquí - ya se inicializa en DownloadsManager
			// Solo obtener información inicial y configurar suscripciones
			await updateStorageInfoRef.current?.();

			// Iniciar monitoreo automático
			storageService.startMonitoring(120000); // Cada 2 minutos
		};

		initializeStorage();

		// Suscribirse a eventos de almacenamiento usando la ref
		const unsubscribeInfoUpdated = storageService.subscribe(StorageEventType.INFO_UPDATED, () =>
			updateStorageInfoRef.current?.()
		);

		const unsubscribeSpaceWarning = storageService.subscribe(
			StorageEventType.SPACE_WARNING,
			() => updateStorageInfoRef.current?.()
		);

		const unsubscribeSpaceCritical = storageService.subscribe(
			StorageEventType.SPACE_CRITICAL,
			() => updateStorageInfoRef.current?.()
		);

		const unsubscribeSpaceRecovered = storageService.subscribe(
			StorageEventType.SPACE_RECOVERED,
			() => updateStorageInfoRef.current?.()
		);

		return () => {
			// Limpiar timer si existe
			if (updateTimerRef.current) {
				clearTimeout(updateTimerRef.current);
			}

			unsubscribeInfoUpdated();
			unsubscribeSpaceWarning();
			unsubscribeSpaceCritical();
			unsubscribeSpaceRecovered();
		};
	}, []);

	// Acciones
	const checkSpace = useCallback(async (): Promise<void> => {
		await updateStorageInfoRef.current?.();
	}, []);

	const cleanupTemp = useCallback(async (): Promise<{
		filesRemoved: number;
		spaceFreed: number;
	}> => {
		const freedBytes = await storageService.cleanupOrphanedFiles();

		// Actualizar información después de la limpieza
		await updateStorageInfoRef.current?.();

		// Simular número de archivos eliminados (no disponible en StorageService actual)
		// En una implementación real, esto vendría del servicio
		const filesRemoved = freedBytes > 0 ? Math.floor(freedBytes / (1024 * 1024)) : 0; // Estimación

		return {
			filesRemoved,
			spaceFreed: freedBytes,
		};
	}, []);

	const estimateSpaceNeeded = useCallback(
		async (downloadId?: string, type?: string, quality?: string): Promise<number> => {
			return await storageService.estimateSpaceNeeded(downloadId, type, quality);
		},
		[]
	);

	// Eventos
	const onSpaceWarning = useCallback((callback: (level: string) => void) => {
		const unsubscribeWarning = storageService.subscribe(StorageEventType.SPACE_WARNING, () =>
			callback("warning")
		);

		const unsubscribeCritical = storageService.subscribe(StorageEventType.SPACE_CRITICAL, () =>
			callback("critical")
		);

		const unsubscribeRecovered = storageService.subscribe(
			StorageEventType.SPACE_RECOVERED,
			() => callback("none")
		);

		return () => {
			unsubscribeWarning();
			unsubscribeCritical();
			unsubscribeRecovered();
		};
	}, []);

	return {
		// Espacio
		totalSpace,
		availableSpace,
		usedSpace,
		downloadSpace,

		// Porcentajes
		usagePercentage,
		downloadPercentage,

		// Estado
		isLowSpace,
		spaceWarningLevel,

		// Configuración
		warningThreshold,
		minFreeSpaceMB,

		// Acciones
		checkSpace,
		cleanupTemp,
		estimateSpaceNeeded,

		// Eventos
		onSpaceWarning,

		// Directorios
		downloadDirectory,
		tempDirectory,
		subtitlesDirectory,
	};
}
