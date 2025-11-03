import { useCallback, useEffect, useState } from "react";
import { queueManager } from "../managers/QueueManager";
import { networkService } from "../services/network/NetworkService";
import { DownloadEventType, NetworkPolicy, NetworkStatus } from "../types";

/*
 * Hook para estado de la red según la interfaz del contexto
 * Proporciona estado actual, configuración y control de descargas
 *
 */

// Tipo auxiliar para acceder a propiedades internas del NetworkService
type NetworkServiceWithEventEmitter = {
	eventEmitter: {
		on: (event: string, handler: (data: unknown) => void) => void;
		off: (event: string, handler: (data: unknown) => void) => void;
	};
};

export interface UseNetworkStatusReturn {
	// Estado actual
	isOnline: boolean;
	isWifi: boolean;
	isCellular: boolean;
	connectionType: "wifi" | "cellular" | "none";

	// Configuración
	allowCellular: boolean;
	requiresWifi: boolean;

	// Políticas
	setNetworkPolicy: (policy: NetworkPolicy) => void;

	// Eventos
	onNetworkChange: (callback: (status: NetworkStatus) => void) => () => void;

	// Estado de descargas
	downloadsAllowed: boolean;
	downloadsPausedByNetwork: boolean;

	// Acciones
	pauseOnCellular: () => Promise<void>;
	resumeOnWifi: () => Promise<void>;
}

export function useNetworkStatus(): UseNetworkStatusReturn {
	// Estados del hook
	const [status, setStatus] = useState<NetworkStatus>(() => networkService.getCurrentStatus());
	const [policy, setPolicy] = useState<NetworkPolicy>(() => networkService.getNetworkPolicy());
	const [downloadsAllowed, setDownloadsAllowed] = useState<boolean>(false);
	const [downloadsPausedByNetwork, setDownloadsPausedByNetwork] = useState<boolean>(false);

	// Función para actualizar estados derivados
	// NOTA: Sin dependencias porque siempre queremos la versión más reciente de los estados
	const updateDerivedStates = useCallback(() => {
		const allowed = networkService.areDownloadsAllowed();
		const paused = networkService.areDownloadsPausedByNetwork();

		setDownloadsAllowed(allowed);
		setDownloadsPausedByNetwork(paused);
	}, []);

	// Inicialización y suscripciones
	useEffect(() => {
		const initializeNetwork = async () => {
			// Inicializar NetworkService
			await networkService.initialize();

			// Obtener estados iniciales
			const currentStatus = await networkService.fetchNetworkStatus();
			const currentPolicy = networkService.getNetworkPolicy();

			setStatus(currentStatus);
			setPolicy(currentPolicy);
			updateDerivedStates();
		};

		initializeNetwork();

		// Suscribirse a cambios de estado de red
		const unsubscribeNetworkChanges = networkService.subscribe("all", newStatus => {
			setStatus(newStatus);
			updateDerivedStates();
		});

		// Suscribirse a cambios de política y descargas usando eventEmitter interno
		const serviceWithEmitter = networkService as unknown as NetworkServiceWithEventEmitter;
		const eventEmitter = serviceWithEmitter.eventEmitter;

		const handlePolicyChange = (data: unknown) => {
			const newPolicy = data as NetworkPolicy;
			setPolicy(newPolicy);
			updateDerivedStates();
		};

		const handleDownloadsChange = () => {
			// Forzar actualización de estados derivados
			updateDerivedStates();
		};

		// Eventos de política
		eventEmitter.on("policy_changed", handlePolicyChange);

		// Eventos de descargas pausadas/reanudadas por red
		eventEmitter.on("downloads_paused_cellular", handleDownloadsChange);
		eventEmitter.on("downloads_resumed_wifi", handleDownloadsChange);

		// Solo suscribirse a eventos relevantes de QueueManager
		// No necesitamos PROGRESS, solo cambios de estado que afecten downloadsAllowed
		const handleQueueChange = () => {
			updateDerivedStates();
		};

		// Suscribirse solo a eventos de cambio de estado (no progreso)
		const unsubscribeStarted = queueManager.subscribe(
			DownloadEventType.STARTED,
			handleQueueChange
		);
		const unsubscribePaused = queueManager.subscribe(
			DownloadEventType.PAUSED,
			handleQueueChange
		);
		const unsubscribeResumed = queueManager.subscribe(
			DownloadEventType.RESUMED,
			handleQueueChange
		);
		const unsubscribeCompleted = queueManager.subscribe(
			DownloadEventType.COMPLETED,
			handleQueueChange
		);
		const unsubscribeFailed = queueManager.subscribe(
			DownloadEventType.FAILED,
			handleQueueChange
		);
		const unsubscribeQueued = queueManager.subscribe(
			DownloadEventType.QUEUED,
			handleQueueChange
		);
		const unsubscribeRemoved = queueManager.subscribe(
			DownloadEventType.REMOVED,
			handleQueueChange
		);

		return () => {
			unsubscribeNetworkChanges();
			unsubscribeStarted();
			unsubscribePaused();
			unsubscribeResumed();
			unsubscribeCompleted();
			unsubscribeFailed();
			unsubscribeQueued();
			unsubscribeRemoved();
			eventEmitter.off("policy_changed", handlePolicyChange);
			eventEmitter.off("downloads_paused_cellular", handleDownloadsChange);
			eventEmitter.off("downloads_resumed_wifi", handleDownloadsChange);
		};
	}, [updateDerivedStates]);

	// Acciones
	const setNetworkPolicy = useCallback((newPolicy: NetworkPolicy) => {
		networkService.setNetworkPolicy(newPolicy);
		// El estado se actualizará automáticamente via evento
	}, []);

	const onNetworkChange = useCallback((callback: (status: NetworkStatus) => void) => {
		return networkService.subscribe("all", callback);
	}, []);

	const pauseOnCellular = useCallback(async (): Promise<void> => {
		await networkService.pauseOnCellular();
	}, []);

	const resumeOnWifi = useCallback(async (): Promise<void> => {
		await networkService.resumeOnWifi();
	}, []);

	// Valores derivados del estado
	// NOTA: Recalcular en cada render para asegurar valores actualizados
	const isOnline = status.isConnected && status.isInternetReachable;
	const connectionType = networkService.getConnectionType();

	return {
		// Estado actual
		isOnline,
		isWifi: status.isWifi,
		isCellular: status.isCellular,
		connectionType,

		// Configuración (desde policy)
		allowCellular: policy.allowCellular,
		requiresWifi: policy.requiresWifi,

		// Políticas
		setNetworkPolicy,

		// Eventos
		onNetworkChange,

		// Estado de descargas
		downloadsAllowed,
		downloadsPausedByNetwork,

		// Acciones
		pauseOnCellular,
		resumeOnWifi,
	};
}
