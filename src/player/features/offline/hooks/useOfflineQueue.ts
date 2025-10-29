import { useCallback, useEffect, useState } from "react";
import { queueManager } from "../managers/QueueManager";
import { networkService } from "../services/network/NetworkService";
import { DownloadItem, DownloadStates } from "../types";

/*
 * Hook para gestionar cola offline según nueva arquitectura
 *
 */

export function useOfflineQueue() {
	const [queue, setQueue] = useState<DownloadItem[]>(() => queueManager.getAllDownloads());

	const [queuePositions, setQueuePositions] = useState<Map<string, number>>(new Map());
	const [isProcessing, setIsProcessing] = useState(false);
	const [isPaused, setIsPaused] = useState(false);

	const addToQueue = useCallback(async (downloadItem: DownloadItem) => {
		try {
			const downloadId = await queueManager.addDownloadItem(downloadItem);
			setQueue(queueManager.getAllDownloads());
			setQueuePositions(queueManager.getQueuePositions());
			return downloadId;
		} catch (error) {
			console.error("Failed to add download to queue:", error);
			throw error;
		}
	}, []);

	const clearQueue = useCallback(async () => {
		try {
			await queueManager.clearQueue();
			setQueue([]);
			setQueuePositions(new Map());
		} catch (error) {
			console.error("Failed to clear queue:", error);
			throw error;
		}
	}, []);

	const pauseQueue = useCallback(() => {
		queueManager.pauseAll();
		setIsPaused(true);
	}, []);

	const resumeQueue = useCallback(() => {
		queueManager.resumeAll();
		setIsPaused(false);
	}, []);

	const reorderQueue = useCallback(async (newOrder: string[]) => {
		try {
			await queueManager.reorderQueue(newOrder);
			setQueue(queueManager.getAllDownloads());
			setQueuePositions(queueManager.getQueuePositions());
		} catch (error) {
			console.error("Failed to reorder queue:", error);
			throw error;
		}
	}, []);

	const filterByState = useCallback((states: DownloadStates[]) => {
		return queueManager.filterByState(states);
	}, []);

	const filterByType = useCallback((type: string) => {
		return queueManager.filterByType(type);
	}, []);

	const getStats = useCallback(() => {
		return queueManager.getQueueStats();
	}, []);

	useEffect(() => {
		// Suscribirse a eventos de QueueManager
		const handleQueueEvent = (eventData: any) => {
			setQueue(queueManager.getAllDownloads());
			setQueuePositions(queueManager.getQueuePositions());
		};

		// Suscribirse a todos los eventos de cola
		const unsubscribeQueue = queueManager.subscribe("all", handleQueueEvent);

		// NetworkService solo para eventos de conectividad
		const handleNetworkChange = (networkStatus: any) => {
			// Actualizar estado de procesamiento basado en conectividad
			const canProcess = networkService.areDownloadsAllowed();
			setIsProcessing(canProcess && !isPaused);

			console.log("Network changed, downloads allowed:", canProcess);
		};

		const unsubscribeNetwork = networkService.subscribe("all", handleNetworkChange);

		return () => {
			unsubscribeQueue();
			unsubscribeNetwork();
		};
	}, [isPaused]);

	return {
		// Estado de cola
		queue,
		queuePositions,
		isProcessing,
		isPaused,

		// Estadísticas
		stats: getStats(),
		maxConcurrent: 3, // TODO: Get from config
		currentActive: queue.filter(item => item.state === DownloadStates.DOWNLOADING).length,

		// Control de cola
		addToQueue,
		clearQueue,
		pauseQueue,
		resumeQueue,
		reorderQueue,

		// Configuración
		setMaxConcurrent: (count: number) => queueManager.setMaxConcurrent(count),

		// Filtros
		filterByState,
		filterByType,

		// Métricas básicas
		queueSize: queue.length,
		pendingCount: queue.filter(item => item.state === DownloadStates.QUEUED).length,
		completedCount: queue.filter(item => item.state === DownloadStates.COMPLETED).length,
		failedCount: queue.filter(item => item.state === DownloadStates.FAILED).length,
	};
}
