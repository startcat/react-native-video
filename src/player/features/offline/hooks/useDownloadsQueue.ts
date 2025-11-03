import { useCallback, useEffect, useState } from "react";
import { queueManager } from "../managers/QueueManager";
import { DownloadItem, DownloadStates } from "../types";
import { QueueStats } from "../types/queue";

/*
 * Hook para gestión de la cola de descargas según la interfaz del contexto
 * Proporciona estado de la cola, estadísticas y control completo
 *
 */

// Tipo auxiliar para acceder a propiedades internas del QueueManager
type QueueManagerWithEventEmitter = {
	eventEmitter: {
		on: (event: string, handler: (data: unknown) => void) => void;
		off: (event: string, handler: (data: unknown) => void) => void;
	};
};

export interface UseDownloadsQueueReturn {
	// Estado de la cola
	queue: DownloadItem[]; // DownloadItem[]
	queuePosition: Map<string, number>; // Map<id, number>
	isProcessing: boolean; // boolean
	isPaused: boolean; // boolean

	// Estadísticas
	stats: QueueStats; // QueueStats
	maxConcurrent: number; // number
	currentActive: number; // number

	// Control de cola
	pauseQueue: () => Promise<void>; // () => Promise<void>
	resumeQueue: () => Promise<void>; // () => Promise<void>
	clearQueue: () => Promise<void>; // () => Promise<void>
	reorderQueue: (newOrder: string[]) => Promise<void>; // (newOrder: string[]) => Promise<void>

	// Configuración
	setMaxConcurrent: (count: number) => void; // (count: number) => void

	// Filtros
	filterByState: (states: DownloadStates[]) => DownloadItem[]; // (states: DownloadStates[]) => DownloadItem[]
	filterByType: (type: string) => DownloadItem[]; // (type: string) => DownloadItem[]

	// Eventos
	onQueueChanged: (callback: (stats: QueueStats) => void) => () => void; // (callback: (stats: QueueStats) => void) => () => void
}

export function useDownloadsQueue(): UseDownloadsQueueReturn {
	// Estados del hook
	const [queue, setQueue] = useState<DownloadItem[]>([]);
	const [queuePosition, setQueuePosition] = useState<Map<string, number>>(new Map());
	const [stats, setStats] = useState<QueueStats>({
		total: 0,
		pending: 0,
		downloading: 0,
		paused: 0,
		completed: 0,
		failed: 0,
		isPaused: false,
		isProcessing: false,
	});
	const [maxConcurrent, setMaxConcurrentState] = useState<number>(3);
	const [currentActive, setCurrentActive] = useState<number>(0);

	// Función para actualizar todos los estados
	const updateQueueStates = useCallback(() => {
		try {
			const currentQueue = queueManager.getAllDownloads();
			const currentPositions = queueManager.getQueuePositions();
			const currentStats = queueManager.getQueueStats();

			setQueue(currentQueue);
			setQueuePosition(currentPositions);
			setStats(currentStats);
			setCurrentActive(currentStats.downloading);
		} catch (error) {
			console.error("Error updating queue states:", error);
		}
	}, []);

	// Inicialización y suscripciones
	useEffect(() => {
		const initializeQueue = async () => {
			// Inicializar QueueManager
			await queueManager.initialize();

			// Obtener estados iniciales
			updateQueueStates();
		};

		initializeQueue();

		// Suscribirse a todos los eventos de la cola
		const unsubscribeAll = queueManager.subscribe("all", () => {
			updateQueueStates();
		});

		// Suscribirse a eventos específicos del manager interno
		const managerWithEmitter = queueManager as unknown as QueueManagerWithEventEmitter;
		const eventEmitter = managerWithEmitter.eventEmitter;

		const handleMaxConcurrentChange = (data: unknown) => {
			const eventData = data as { maxConcurrent: number };
			setMaxConcurrentState(eventData.maxConcurrent);
		};

		eventEmitter.on("max_concurrent_changed", handleMaxConcurrentChange);

		return () => {
			unsubscribeAll();
			eventEmitter.off("max_concurrent_changed", handleMaxConcurrentChange);
		};
	}, [updateQueueStates]);

	// Control de cola
	const pauseQueue = useCallback(async (): Promise<void> => {
		queueManager.pauseAll();
		updateQueueStates();
	}, [updateQueueStates]);

	const resumeQueue = useCallback(async (): Promise<void> => {
		queueManager.resumeAll();
		updateQueueStates();
	}, [updateQueueStates]);

	const clearQueue = useCallback(async (): Promise<void> => {
		await queueManager.clearQueue();
		// El estado se actualizará automáticamente via evento
	}, []);

	const reorderQueue = useCallback(async (newOrder: string[]): Promise<void> => {
		await queueManager.reorderQueue(newOrder);
		// El estado se actualizará automáticamente via evento
	}, []);

	// Configuración
	const setMaxConcurrent = useCallback((count: number): void => {
		queueManager.setMaxConcurrent(count);
		// El estado se actualizará automáticamente via evento
	}, []);

	// Filtros
	const filterByState = useCallback((states: DownloadStates[]): DownloadItem[] => {
		return queueManager.filterByState(states);
	}, []);

	const filterByType = useCallback((type: string): DownloadItem[] => {
		return queueManager.filterByType(type);
	}, []);

	// Eventos
	const onQueueChanged = useCallback((callback: (stats: QueueStats) => void) => {
		return queueManager.subscribe("all", () => {
			const currentStats = queueManager.getQueueStats();
			callback(currentStats);
		});
	}, []);

	// Valores derivados del stats (ahora disponibles en QueueStats de types/queue.ts)
	const isProcessing = stats.isProcessing;
	const isPaused = stats.isPaused;

	return {
		// Estado de la cola
		queue,
		queuePosition,
		isProcessing,
		isPaused,

		// Estadísticas
		stats,
		maxConcurrent,
		currentActive,

		// Control de cola
		pauseQueue,
		resumeQueue,
		clearQueue,
		reorderQueue,

		// Configuración
		setMaxConcurrent,

		// Filtros
		filterByState,
		filterByType,

		// Eventos
		onQueueChanged,
	};
}
