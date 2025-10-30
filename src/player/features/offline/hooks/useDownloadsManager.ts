/*
 * Hook principal unificado del sistema de descargas
 * Proporciona una API completa para gestión de descargas binarias y streams
 *
 * Basado en el DownloadsManager que orquesta todos los servicios y managers
 *
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlayerError } from "../../../core/errors";
import { downloadsManager } from "../managers/DownloadsManager";
import { profileManager } from "../managers/ProfileManager";
import { queueManager } from "../managers/QueueManager";
import { storageService } from "../services/storage/StorageService";
import {
	BinaryDownloadTask,
	DownloadEventType,
	DownloadItem,
	DownloadsManagerConfig,
	DownloadStates,
	DownloadType,
	QueueStats,
	StreamDownloadTask,
	UsableDownloadItem,
} from "../types";
import { ensureDownloadId, isValidUri } from "../utils/downloadsUtils";

// Tipos específicos del hook
interface UseDownloadsManagerOptions {
	autoInit?: boolean;
	config?: Partial<DownloadsManagerConfig>;
	onError?: (error: PlayerError) => void;
	onDownloadStarted?: (downloadId: string) => void;
	onDownloadCompleted?: (downloadId: string) => void;
	onDownloadFailed?: (downloadId: string, error: PlayerError) => void;
}

interface UseDownloadsManagerReturn {
	// Estado
	downloads: DownloadItem[];
	activeDownloads: DownloadItem[];
	queuedDownloads: DownloadItem[];
	completedDownloads: DownloadItem[];
	failedDownloads: DownloadItem[];

	// Estadísticas globales
	queueStats: QueueStats;
	totalProgress: number;
	globalSpeed: number;

	// Acciones principales
	addDownload: (item: UsableDownloadItem) => Promise<string>;
	removeDownload: (id: string) => Promise<void>;
	pauseDownload: (id: string) => Promise<void>;
	resumeDownload: (id: string) => Promise<void>;
	cancelDownload: (id: string) => Promise<void>;

	// Acciones masivas
	clearCompleted: () => Promise<void>;
	clearFailed: () => Promise<void>;
	pauseAll: () => Promise<void>;
	resumeAll: () => Promise<void>;

	// Estado del sistema
	isInitialized: boolean;
	isProcessing: boolean;
	isPaused: boolean;
	error: PlayerError | null;
}

/*
 * Hook principal del sistema de descargas
 *
 * @param options Opciones de configuración del hook
 * @returns API completa del sistema de descargas
 *
 */

export function useDownloadsManager(
	options: UseDownloadsManagerOptions = {}
): UseDownloadsManagerReturn {
	const {
		autoInit = true,
		config,
		onError,
		onDownloadStarted,
		onDownloadCompleted,
		onDownloadFailed,
	} = options;

	// Estado local del hook
	const [downloads, setDownloads] = useState<DownloadItem[]>([]);
	const [queueStats, setQueueStats] = useState<QueueStats>({
		total: 0,
		pending: 0,
		downloading: 0,
		paused: 0,
		completed: 0,
		failed: 0,
		isPaused: false,
		isProcessing: false,
		// Propiedades opcionales para compatibilidad
		active: 0,
		queued: 0,
		totalBytesDownloaded: 0,
		totalBytesRemaining: 0,
		averageSpeed: 0,
		estimatedTimeRemaining: 0,
	});
	const [isInitialized, setIsInitialized] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [isPaused, setIsPaused] = useState(false);
	const [error, setError] = useState<PlayerError | null>(null);

	// Inicialización automática
	useEffect(() => {
		if (autoInit && !isInitialized) {
			initializeManager();
		}
	}, [autoInit, isInitialized]);

	const initializeManager = useCallback(async () => {
		try {
			await downloadsManager.initialize(config);
			updateState();
			setIsInitialized(true);
			setError(null);
		} catch (err) {
			const caughtError =
				err instanceof PlayerError
					? err
					: new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE", { originalError: err });
			setError(caughtError);
			onError?.(caughtError);
		}
	}, [config, onError]);

	// Función de ordenamiento de descargas
	const sortDownloads = useCallback((items: DownloadItem[]): DownloadItem[] => {
		// Definir prioridad de estados
		const statePriority: Record<DownloadStates, number> = {
			// Activas (prioridad 1)
			[DownloadStates.DOWNLOADING]: 1,
			[DownloadStates.PREPARING]: 1,
			// En cola (prioridad 2)
			[DownloadStates.QUEUED]: 2,
			[DownloadStates.PAUSED]: 2,
			[DownloadStates.WAITING_FOR_NETWORK]: 2,
			// Fallidas (prioridad 3)
			[DownloadStates.FAILED]: 3,
			// Completadas (prioridad 4)
			[DownloadStates.COMPLETED]: 4,
			// Otros estados (prioridad 5)
			[DownloadStates.RESTART]: 5,
			[DownloadStates.RESTARTING]: 5,
			[DownloadStates.REMOVING]: 5,
			[DownloadStates.STOPPED]: 5,
			[DownloadStates.NOT_DOWNLOADED]: 5,
		};

		return [...items].sort((a, b) => {
			// 1. Ordenar por prioridad de estado
			const priorityA = statePriority[a.state] || 5;
			const priorityB = statePriority[b.state] || 5;

			if (priorityA !== priorityB) {
				return priorityA - priorityB;
			}

			// 2. Dentro del mismo grupo, ordenar por fecha de inserción (más reciente primero)
			const timeA = a.stats.startedAt || 0;
			const timeB = b.stats.startedAt || 0;

			return timeB - timeA; // Descendente: más reciente primero
		});
	}, []);

	// Actualizar estado desde el manager
	const updateState = useCallback(() => {
		if (downloadsManager.isInitialized()) {
			const newDownloads = downloadsManager.getDownloads();
			const newQueueStats = downloadsManager.getQueueStats();

			// console.log(
			// 	`[useDownloadsManager] updateState - downloads: ${newDownloads.length}, averageSpeed: ${newQueueStats.averageSpeed}`
			// );

			// Ordenar descargas antes de actualizar el estado
			const sortedDownloads = sortDownloads(newDownloads);

			setDownloads(sortedDownloads);
			setQueueStats(newQueueStats);
			setIsProcessing(downloadsManager.isProcessing());
			setIsPaused(downloadsManager.isPaused());
		}
	}, [sortDownloads]);

	// Suscripción a eventos del sistema
	useEffect(() => {
		if (!downloadsManager.isInitialized()) {
			return;
		}

		const unsubscribers: (() => void)[] = [];

		// Eventos de sistema
		unsubscribers.push(
			downloadsManager.subscribe("system:started", () => {
				updateState();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe("system:stopped", () => {
				updateState();
			})
		);

		// Eventos de descarga
		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.STARTED, (data: any) => {
				updateState();
				onDownloadStarted?.(data.taskId);
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.COMPLETED, (data: any) => {
				updateState();
				onDownloadCompleted?.(data.taskId);
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.FAILED, (data: any) => {
				updateState();
				onDownloadFailed?.(data.taskId, data.error);
			})
		);

		// Eventos de progreso y cambios
		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.PROGRESS, () => {
				updateState();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe("downloads:change", () => {
				updateState();
			})
		);

		// Evento de eliminación (crítico para actualizar UI inmediatamente)
		unsubscribers.push(
			downloadsManager.subscribe(DownloadEventType.REMOVED, () => {
				updateState();
			})
		);

		// Eventos de red y almacenamiento que pueden afectar el estado
		unsubscribers.push(
			downloadsManager.subscribe("network:change", () => {
				updateState();
			})
		);

		unsubscribers.push(
			downloadsManager.subscribe("storage:change", () => {
				updateState();
			})
		);

		// Eventos de perfil (crítico para actualizar filtrado cuando cambia perfil activo)
		unsubscribers.push(
			downloadsManager.subscribe("profile:profile_changed", () => {
				updateState();
			})
		);

		return () => {
			unsubscribers.forEach(unsubscriber => unsubscriber());
		};
	}, [isInitialized, updateState, onDownloadStarted, onDownloadCompleted, onDownloadFailed]);

	// Derivar listas filtradas
	const activeDownloads = useMemo(
		() =>
			downloads.filter(
				(item: DownloadItem) =>
					item.state === DownloadStates.DOWNLOADING ||
					item.state === DownloadStates.PREPARING
			),
		[downloads]
	);

	const queuedDownloads = useMemo(
		() => downloads.filter((item: DownloadItem) => item.state === DownloadStates.QUEUED),
		[downloads]
	);

	const completedDownloads = useMemo(
		() => downloads.filter((item: DownloadItem) => item.state === DownloadStates.COMPLETED),
		[downloads]
	);

	const failedDownloads = useMemo(
		() => downloads.filter((item: DownloadItem) => item.state === DownloadStates.FAILED),
		[downloads]
	);

	// Calcular progreso total (solo de descargas activas: downloading, preparing, queued)
	const totalProgress = useMemo(() => {
		// Filtrar solo descargas activas (no completadas ni fallidas)
		const activeItems = downloads.filter(
			(item: DownloadItem) =>
				item.state === DownloadStates.DOWNLOADING ||
				item.state === DownloadStates.PREPARING ||
				item.state === DownloadStates.QUEUED ||
				item.state === DownloadStates.PAUSED
		);

		// Si no hay descargas activas, progreso es 0
		if (activeItems.length === 0) {
			return 0;
		}

		const totalProgressSum = activeItems.reduce((sum: number, download: DownloadItem) => {
			const progress = download.stats?.progressPercent || 0;
			return sum + progress;
		}, 0);

		const avgProgress = Math.round(totalProgressSum / activeItems.length);
		return avgProgress;
	}, [downloads]);

	// Velocidad global
	const globalSpeed = useMemo(() => {
		const speed = queueStats.averageSpeed ?? 0;
		return speed;
	}, [queueStats.averageSpeed]);

	// API de acciones principales
	const addDownload = useCallback(
		async (item: UsableDownloadItem): Promise<string> => {
			try {
				// 1. Validar URI
				if (!isValidUri(item.uri)) {
					throw new PlayerError("DOWNLOAD_FAILED", {
						downloadId: item.id,
						title: item.title,
						message: `Invalid download URI: ${item.uri}`,
					});
				}

				// 2. Asegurar que el item tenga ID (generar desde URI si no tiene)
				const itemWithId = ensureDownloadId(item);

				// 3. Verificar si se puede descargar según perfil activo
				if (!profileManager.canDownload()) {
					throw new PlayerError("DOWNLOAD_FAILED", {
						downloadId: itemWithId.id,
						title: itemWithId.title,
						message: "No active profile available for downloads",
					});
				}

				// 4. Verificar que no exista ya la descarga
				const existingDownload = queueManager.getDownload(itemWithId.id);
				if (existingDownload) {
					return itemWithId.id;
				}

				// 5. Obtener el perfil activo y asignarlo
				const activeProfileId = profileManager.getActiveProfileId();
				const profileIds = activeProfileId ? [activeProfileId] : [];

				// 6. Crear DownloadItem completo con perfil asignado
				const downloadItem: DownloadItem = {
					...itemWithId,
					profileIds,
					state: DownloadStates.QUEUED,
					stats: {
						progressPercent: 0,
						bytesDownloaded: 0,
						totalBytes: 0,
						retryCount: 0,
					},
				};

				// 7. Agregar el DownloadItem completo al QueueManager
				const downloadId = await queueManager.addDownloadItem(downloadItem);

				// 8. Crear tareas específicas según el tipo para el DownloadsManager
				let task: BinaryDownloadTask | StreamDownloadTask;

				if (itemWithId.type === DownloadType.BINARY) {
					// Usar ruta absoluta del directorio de binarios
					const binariesDir = storageService.getBinariesDirectory();
					task = {
						id: itemWithId.id,
						url: itemWithId.uri,
						destination: `${binariesDir}/${itemWithId.id}`,
						headers: {},
						resumable: true,
					} as BinaryDownloadTask;
				} else if (itemWithId.type === DownloadType.STREAM) {
					task = {
						id: itemWithId.id,
						manifestUrl: itemWithId.uri,
						title: itemWithId.title,
						headers: itemWithId.headers, // Pasar headers para autenticación
						config: {
							type: itemWithId.uri.includes(".m3u8") ? "HLS" : "DASH",
							quality: "auto",
							drm: itemWithId.drm,
						},
					} as StreamDownloadTask;
				} else {
					throw new PlayerError("DOWNLOAD_FAILED", {
						downloadType: itemWithId.type,
						downloadId: itemWithId.id,
						message: `Invalid download type: ${itemWithId.type}`,
					});
				}

				console.log(
					`[useDownloadsManager] Download task created: ${itemWithId.title} (${itemWithId.id}) ${JSON.stringify(task)}`
				);

				// 9. Iniciar la descarga a través del DownloadsManager
				console.log(
					`[useDownloadsManager] About to call downloadsManager.addDownload for: ${itemWithId.id}`
				);
				await downloadsManager.addDownload(task, itemWithId.type);

				console.log(
					`[useDownloadsManager] Download task added to manager: ${itemWithId.title} (${itemWithId.id}) ${JSON.stringify(task)}`
				);

				updateState();
				return downloadId;
			} catch (err) {
				const caughtError =
					err instanceof PlayerError
						? err
						: new PlayerError("DOWNLOAD_FAILED", {
								originalError: err,
								downloadId: item.id || "unknown",
								title: item.title,
							});
				setError(caughtError);
				onError?.(caughtError);
				throw caughtError;
			}
		},
		[updateState, onError]
	);

	const removeDownload = useCallback(
		async (id: string): Promise<void> => {
			console.log(`[useDownloadsManager] removeDownload called for: ${id}`);
			try {
				console.log(
					`[useDownloadsManager] Calling downloadsManager.removeDownload for: ${id}`
				);
				await downloadsManager.removeDownload(id);
				console.log(
					`[useDownloadsManager] downloadsManager.removeDownload completed for: ${id}`
				);
				updateState();
				console.log(`[useDownloadsManager] State updated after removing: ${id}`);
			} catch (err) {
				console.error(`[useDownloadsManager] Error removing download ${id}:`, err);
				const caughtError =
					err instanceof PlayerError
						? err
						: new PlayerError("DOWNLOAD_FAILED", {
								originalError: err,
								downloadId: id,
							});
				setError(caughtError);
				onError?.(caughtError);
				throw caughtError;
			}
		},
		[updateState, onError]
	);

	const pauseDownload = useCallback(
		async (id: string): Promise<void> => {
			try {
				await downloadsManager.pauseDownload(id);
				updateState();
			} catch (err) {
				const caughtError =
					err instanceof PlayerError
						? err
						: new PlayerError("DOWNLOAD_FAILED", {
								originalError: err,
								downloadId: id,
							});
				setError(caughtError);
				onError?.(caughtError);
				throw caughtError;
			}
		},
		[updateState, onError]
	);

	const resumeDownload = useCallback(
		async (id: string): Promise<void> => {
			try {
				await downloadsManager.resumeDownload(id);
				updateState();
			} catch (err) {
				const caughtError =
					err instanceof PlayerError
						? err
						: new PlayerError("DOWNLOAD_FAILED", {
								originalError: err,
								downloadId: id,
							});
				setError(caughtError);
				onError?.(caughtError);
				throw caughtError;
			}
		},
		[updateState, onError]
	);

	// cancelDownload es igual que removeDownload en este contexto
	const cancelDownload = useCallback(
		async (id: string): Promise<void> => {
			return removeDownload(id);
		},
		[removeDownload]
	);

	// API de acciones masivas
	const clearCompleted = useCallback(async (): Promise<void> => {
		try {
			await downloadsManager.clearCompleted();
			updateState();
		} catch (err) {
			const caughtError =
				err instanceof PlayerError
					? err
					: new PlayerError("DOWNLOAD_FAILED", { originalError: err });
			setError(caughtError);
			onError?.(caughtError);
			throw caughtError;
		}
	}, [updateState, onError]);

	const clearFailed = useCallback(async (): Promise<void> => {
		try {
			await downloadsManager.clearFailed();
			updateState();
		} catch (err) {
			const caughtError =
				err instanceof PlayerError
					? err
					: new PlayerError("DOWNLOAD_FAILED", { originalError: err });
			setError(caughtError);
			onError?.(caughtError);
			throw caughtError;
		}
	}, [updateState, onError]);

	const pauseAll = useCallback(async (): Promise<void> => {
		try {
			await downloadsManager.pauseAll();
			updateState();
		} catch (err) {
			const caughtError =
				err instanceof PlayerError
					? err
					: new PlayerError("DOWNLOAD_FAILED", { originalError: err });
			setError(caughtError);
			onError?.(caughtError);
			throw caughtError;
		}
	}, [updateState, onError]);

	const resumeAll = useCallback(async (): Promise<void> => {
		try {
			await downloadsManager.resumeAll();
			updateState();
		} catch (err) {
			const caughtError =
				err instanceof PlayerError
					? err
					: new PlayerError("DOWNLOAD_FAILED", { originalError: err });
			setError(caughtError);
			onError?.(caughtError);
			throw caughtError;
		}
	}, [updateState, onError]);

	return {
		// Estado
		downloads,
		activeDownloads,
		queuedDownloads,
		completedDownloads,
		failedDownloads,

		// Estadísticas globales
		queueStats,
		totalProgress,
		globalSpeed,

		// Acciones principales
		addDownload,
		removeDownload,
		pauseDownload,
		resumeDownload,
		cancelDownload,

		// Acciones masivas
		clearCompleted,
		clearFailed,
		pauseAll,
		resumeAll,

		// Estado del sistema
		isInitialized,
		isProcessing,
		isPaused,
		error,
	};
}
