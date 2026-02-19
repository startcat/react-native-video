/*
 * Puente de eventos nativos para el sistema de descargas offline
 * Traduce eventos de NativeManager y BinaryDownloadService a callbacks tipados
 *
 */

import { Logger } from "../../../logger";
import { DownloadEventType, DownloadStates } from "../../types";

const TAG = "[NativeEventBridge]";

/*
 * Datos de progreso normalizados que el bridge entrega al QueueManager
 */
export interface NativeProgressData {
	percent: number;
	bytesDownloaded: number;
	totalBytes: number;
	speed: number;
	remainingTime?: number;
}

/*
 * Callbacks que el QueueManager implementa para recibir eventos traducidos
 */
export interface EventBridgeCallbacks {
	onProgress: (downloadId: string, progressData: NativeProgressData) => void;
	onCompleted: (downloadId: string, fileUri?: string, fileSize?: number) => void;
	onFailed: (
		downloadId: string,
		error: { code: string; message: string; timestamp: number }
	) => void;
	onStateChanged: (
		downloadId: string,
		state: DownloadStates,
		rawState: string,
		extraData?: Record<string, unknown>
	) => void;
}

/*
 * Dependencias inyectadas — interfaces mínimas para facilitar testing
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SubscribeFn = (event: any, callback: (data?: any) => void) => () => void;

export interface EventBridgeDependencies {
	nativeManager: {
		subscribe: SubscribeFn;
	};
	binaryDownloadService: {
		subscribe: SubscribeFn;
	};
	isBeingRemoved: (downloadId: string) => boolean;
	hasDownload: (downloadId: string) => boolean;
	isPaused: () => boolean;
}

export class NativeEventBridge {
	private deps: EventBridgeDependencies;
	private callbacks: EventBridgeCallbacks;
	private logger: Logger;
	private unsubscribeFunctions: Array<() => void> = [];

	constructor(deps: EventBridgeDependencies, callbacks: EventBridgeCallbacks, logger: Logger) {
		this.deps = deps;
		this.callbacks = callbacks;
		this.logger = logger;
	}

	/*
	 * Suscribe a todos los eventos nativos y binarios
	 */
	setup(): void {
		// NativeManager events
		this.unsubscribeFunctions.push(
			this.deps.nativeManager.subscribe("download_progress", (data: unknown) => {
				this.handleNativeProgress(data);
			})
		);

		this.unsubscribeFunctions.push(
			this.deps.nativeManager.subscribe("download_state_changed", (data: unknown) => {
				this.handleNativeStateChanged(data);
			})
		);

		this.unsubscribeFunctions.push(
			this.deps.nativeManager.subscribe("download_completed", (data: unknown) => {
				this.handleNativeCompleted(data);
			})
		);

		this.unsubscribeFunctions.push(
			this.deps.nativeManager.subscribe("download_error", (data: unknown) => {
				this.handleNativeError(data);
			})
		);

		// BinaryDownloadService events
		this.unsubscribeFunctions.push(
			this.deps.binaryDownloadService.subscribe(
				DownloadEventType.PROGRESS,
				(data: unknown) => {
					this.handleBinaryProgress(data);
				}
			)
		);

		this.unsubscribeFunctions.push(
			this.deps.binaryDownloadService.subscribe(
				DownloadEventType.COMPLETED,
				(data: unknown) => {
					this.handleBinaryCompleted(data);
				}
			)
		);

		this.unsubscribeFunctions.push(
			this.deps.binaryDownloadService.subscribe(DownloadEventType.FAILED, (data: unknown) => {
				this.handleBinaryFailed(data);
			})
		);

		this.logger.debug(TAG, "Native and binary event listeners configured");
	}

	/*
	 * Desuscribe todos los event listeners
	 */
	teardown(): void {
		for (const unsubscribe of this.unsubscribeFunctions) {
			unsubscribe();
		}
		this.unsubscribeFunctions = [];
		this.logger.debug(TAG, "All event listeners removed");
	}

	/*
	 * Mapea estados nativos a estados internos
	 */
	mapNativeStateToInternal(nativeState: string): DownloadStates {
		switch (nativeState.toUpperCase()) {
			case "DOWNLOADING":
			case "ACTIVE":
				return DownloadStates.DOWNLOADING;
			case "QUEUED":
			case "PENDING":
				return DownloadStates.QUEUED;
			case "PAUSED":
			case "STOPPED":
				return DownloadStates.PAUSED;
			case "COMPLETED":
				return DownloadStates.COMPLETED;
			case "FAILED":
			case "ERROR":
				return DownloadStates.FAILED;
			default:
				return DownloadStates.QUEUED;
		}
	}

	/*
	 * Handlers para eventos de NativeManager
	 */

	private handleNativeProgress(data: unknown): void {
		// Ignorar eventos de progreso cuando el sistema está pausado globalmente
		if (this.deps.isPaused()) {
			return;
		}

		const eventData = data as {
			downloadId: string;
			percent: number;
			speed?: number;
			remainingTime?: number;
			bytesDownloaded?: number;
			totalBytes?: number;
			[key: string]: unknown;
		};
		const { downloadId } = eventData;

		if (!downloadId || !this.deps.hasDownload(downloadId)) {
			return;
		}

		if (this.deps.isBeingRemoved(downloadId)) {
			return;
		}

		this.callbacks.onProgress(downloadId, {
			percent: eventData.percent ?? 0,
			bytesDownloaded: eventData.bytesDownloaded ?? 0,
			totalBytes: eventData.totalBytes ?? 0,
			speed: eventData.speed ?? 0,
			remainingTime: eventData.remainingTime,
		});
	}

	private handleNativeStateChanged(data: unknown): void {
		const eventData = data as { downloadId: string; state: string; [key: string]: unknown };
		const { downloadId, state } = eventData;

		if (!downloadId) {
			this.logger.warn(TAG, "Received state change event without downloadId");
			return;
		}

		const mappedState = this.mapNativeStateToInternal(state);

		// Pasar extraData para que el QueueManager pueda acceder a campos adicionales (ej: error)
		const extraData = Object.fromEntries(
			Object.entries(eventData).filter(([key]) => key !== "downloadId" && key !== "state")
		);

		this.callbacks.onStateChanged(
			downloadId,
			mappedState,
			state,
			extraData as Record<string, unknown>
		);
	}

	private handleNativeCompleted(data: unknown): void {
		const eventData = data as {
			downloadId: string;
			fileUri?: string;
			fileSize?: number;
			path?: string;
			[key: string]: unknown;
		};
		const { downloadId } = eventData;

		if (!downloadId) {
			this.logger.warn(TAG, "Received completed event without downloadId");
			return;
		}

		this.callbacks.onCompleted(
			downloadId,
			eventData.fileUri || eventData.path,
			eventData.fileSize
		);
	}

	private handleNativeError(data: unknown): void {
		const eventData = data as {
			downloadId?: string;
			id?: string;
			error?: { code?: string; message?: string } | string;
			errorCode?: string;
			errorMessage?: string;
		};

		const downloadId = eventData.downloadId || eventData.id;
		if (!downloadId) {
			this.logger.warn(TAG, "Received error event without downloadId", eventData);
			return;
		}

		// Extraer código y mensaje de error de formatos variados
		let errorCode = "UNKNOWN";
		let errorMessage = "Download failed";

		if (typeof eventData.error === "object" && eventData.error) {
			errorCode = eventData.error.code || eventData.errorCode || "UNKNOWN";
			errorMessage = eventData.error.message || eventData.errorMessage || "Download failed";
		} else if (typeof eventData.error === "string") {
			errorMessage = eventData.error;
			errorCode = eventData.errorCode || "UNKNOWN";
		} else {
			errorCode = eventData.errorCode || "UNKNOWN";
			errorMessage = eventData.errorMessage || "Download failed";
		}

		this.callbacks.onFailed(downloadId, {
			code: errorCode,
			message: errorMessage,
			timestamp: Date.now(),
		});
	}

	/*
	 * Handlers para eventos de BinaryDownloadService
	 */

	private handleBinaryProgress(data: unknown): void {
		// Ignorar eventos de progreso cuando el sistema está pausado globalmente
		if (this.deps.isPaused()) {
			return;
		}

		const progressData = data as {
			taskId: string;
			percent: number;
			bytesWritten?: number;
			bytesDownloaded?: number;
			totalBytes: number;
			downloadSpeed?: number;
			speed?: number;
		};

		const downloadId = progressData.taskId;
		if (!downloadId || !this.deps.hasDownload(downloadId)) {
			return;
		}

		if (this.deps.isBeingRemoved(downloadId)) {
			return;
		}

		// Normalizar campos: BinaryDownloadService usa bytesWritten, NativeManager usa bytesDownloaded
		const percent = progressData.percent ?? 0;
		const bytesDownloaded = progressData.bytesWritten ?? progressData.bytesDownloaded ?? 0;
		const speed = progressData.downloadSpeed ?? progressData.speed ?? 0;

		this.callbacks.onProgress(downloadId, {
			percent,
			bytesDownloaded,
			totalBytes: progressData.totalBytes ?? 0,
			speed,
		});
	}

	private handleBinaryCompleted(data: unknown): void {
		const completedData = data as { taskId: string; fileUri?: string; fileSize?: number };

		if (!completedData.taskId) {
			this.logger.warn(TAG, "Received binary completed event without taskId");
			return;
		}

		this.callbacks.onCompleted(
			completedData.taskId,
			completedData.fileUri,
			completedData.fileSize
		);
	}

	private handleBinaryFailed(data: unknown): void {
		const errorData = data as { taskId: string; error?: string; errorCode?: string };

		if (!errorData.taskId) {
			this.logger.warn(TAG, "Received binary error event without taskId");
			return;
		}

		this.callbacks.onFailed(errorData.taskId, {
			code: errorData.errorCode || "UNKNOWN",
			message: errorData.error || "Binary download failed",
			timestamp: Date.now(),
		});
	}
}
