/*
 * RetryManager - Gestión de reintentos con backoff exponencial
 * Extraído del QueueManager (SA-03) para reducir su complejidad
 *
 */

import { Logger } from "../../../logger";
import { LOG_TAGS } from "../../constants";

const TAG = LOG_TAGS.QUEUE_MANAGER;

// === TIPOS ===

export interface RetryConfig {
	maxRetries: number;
	retryDelayMs: number;
	maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
	maxRetries: 3,
	retryDelayMs: 2000,
	maxDelayMs: 60000,
};

// === CLASE ===

export class RetryManager {
	private retryTracker: Map<string, number> = new Map();
	private pendingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
	private config: RetryConfig;
	private logger: Logger;

	constructor(config?: Partial<RetryConfig>, logger?: Logger) {
		this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
		this.logger = logger || new Logger({ enabled: false });
	}

	/*
	 * Determina si una descarga debe reintentarse
	 *
	 * @param downloadId - ID de la descarga
	 * @param error - Error que causó el fallo
	 * @returns true si debe reintentarse
	 *
	 */

	shouldRetry(downloadId: string, error: unknown): boolean {
		// Si el error no es reintentable, no reintentar
		if (this.isNonRetryableError(error)) {
			return false;
		}

		// Verificar recomendación del servicio
		const errorObj = error as { isRetryable?: boolean };
		if (errorObj?.isRetryable === false) {
			return false;
		}

		// Verificar si quedan reintentos
		const currentRetries = this.retryTracker.get(downloadId) || 0;
		return currentRetries < this.config.maxRetries;
	}

	/*
	 * Programa un reintento con backoff exponencial
	 *
	 * @param downloadId - ID de la descarga
	 * @param onRetry - Callback a ejecutar cuando se cumpla el delay
	 *
	 */

	scheduleRetry(downloadId: string, onRetry: () => void): void {
		const currentRetries = this.retryTracker.get(downloadId) || 0;
		const retryCount = currentRetries + 1;

		// Actualizar contador
		this.retryTracker.set(downloadId, retryCount);

		// Calcular delay con backoff exponencial
		const delay = Math.min(
			this.config.retryDelayMs * Math.pow(2, retryCount - 1),
			this.config.maxDelayMs
		);

		this.logger.info(
			TAG,
			`Download failed, scheduling retry ${retryCount}/${this.config.maxRetries} in ${delay}ms: ${downloadId}`
		);

		// Cancelar timer previo si existe
		const existingTimer = this.pendingTimers.get(downloadId);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		// Programar reintento
		const timer = setTimeout(() => {
			this.pendingTimers.delete(downloadId);
			this.logger.info(
				TAG,
				`Retrying download (${retryCount}/${this.config.maxRetries}): ${downloadId}`
			);
			onRetry();
		}, delay);

		this.pendingTimers.set(downloadId, timer);
	}

	/*
	 * Obtiene el número de reintentos realizados para una descarga
	 *
	 */

	getRetryCount(downloadId: string): number {
		return this.retryTracker.get(downloadId) || 0;
	}

	/*
	 * Limpia los reintentos de una descarga específica
	 *
	 */

	clearRetries(downloadId: string): void {
		this.retryTracker.delete(downloadId);
		const timer = this.pendingTimers.get(downloadId);
		if (timer) {
			clearTimeout(timer);
			this.pendingTimers.delete(downloadId);
		}
	}

	/*
	 * Limpia todos los reintentos
	 *
	 */

	clearAll(): void {
		this.retryTracker.clear();
		this.pendingTimers.forEach(timer => clearTimeout(timer));
		this.pendingTimers.clear();
	}

	/*
	 * Determina si un error no es reintentable (debe fallar inmediatamente)
	 *
	 * @param error - Error a clasificar
	 * @returns true si el error NO debe reintentarse
	 *
	 */

	isNonRetryableError(error: unknown): boolean {
		if (!error) {
			return false;
		}

		const errorObj = error as { code?: string; errorCode?: string; message?: string };
		const errorCode = errorObj?.code || errorObj?.errorCode || "";
		// Handle both string errors and object errors with message property
		const errorMessage = typeof error === "string" ? error : errorObj?.message || "";

		// NO_SPACE_LEFT errors should not be retried
		if (errorCode === "NO_SPACE_LEFT" || errorCode === "DOWNLOAD_NO_SPACE") {
			return true;
		}

		// Check message for space-related errors and HTTP client errors (4xx)
		const lowerMessage = errorMessage.toLowerCase();
		if (
			lowerMessage.includes("no space left") ||
			lowerMessage.includes("no hay espacio") ||
			lowerMessage.includes("insufficient storage") ||
			lowerMessage.includes("disk full")
		) {
			return true;
		}

		// HTTP 4xx client errors should not be retried (resource doesn't exist, unauthorized, etc.)
		if (
			lowerMessage.includes("http 404") ||
			lowerMessage.includes("404") ||
			lowerMessage.includes("http 401") ||
			lowerMessage.includes("http 403") ||
			lowerMessage.includes("file not found") ||
			lowerMessage.includes("not found") ||
			lowerMessage.includes("unauthorized") ||
			lowerMessage.includes("forbidden")
		) {
			return true;
		}

		// Asset validation errors should not be retried (the asset is corrupted or incomplete)
		if (
			lowerMessage.includes("no playable tracks") ||
			lowerMessage.includes("asset validation failed") ||
			lowerMessage.includes("asset directory") ||
			lowerMessage.includes("asset size too small")
		) {
			return true;
		}

		return false;
	}

	/*
	 * Destruye el RetryManager, cancelando todos los timers pendientes
	 *
	 */

	destroy(): void {
		this.clearAll();
	}
}
