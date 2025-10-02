/*
 * Servicio singleton unificado para gestión de descargas
 * Implementa patrón Strategy + Factory para soportar múltiples tipos de descarga
 * Interfaz unificada para BinaryDownloadService y StreamDownloadService
 *
 */

import { EventEmitter } from "eventemitter3";
import { PlayerError } from "../../../../core/errors";
import { Logger } from "../../../logger";
import { LOG_TAGS } from "../../constants";
import { DEFAULT_CONFIG_DOWNLOAD_SERVICE, LOGGER_DEFAULTS } from "../../defaultConfigs";
import {
	ActiveBinaryDownload,
	ActiveStreamDownload,
	BinaryDownloadTask,
	DownloadEventType,
	DownloadServiceConfig,
	DownloadStrategy,
	DownloadStrategyFactory,
	DownloadType,
	StreamDownloadTask,
	ValidationResult,
} from "../../types";
import { BinaryDownloadService } from "./BinaryDownloadService";
import { StreamDownloadService } from "./StreamDownloadService";

const TAG = LOG_TAGS.DOWNLOAD_SERVICE;

// Implementación de la Strategy para descargas binarias
class BinaryDownloadStrategy implements DownloadStrategy {
	private service: BinaryDownloadService;

	constructor() {
		this.service = BinaryDownloadService.getInstance();
	}

	async initialize(config?: any): Promise<void> {
		return this.service.initialize(config);
	}

	async startDownload(task: BinaryDownloadTask): Promise<void> {
		return this.service.startDownload(task);
	}

	async pauseDownload(downloadId: string): Promise<void> {
		return this.service.pauseDownload(downloadId);
	}

	async resumeDownload(downloadId: string): Promise<void> {
		return this.service.resumeDownload(downloadId);
	}

	async cancelDownload(downloadId: string): Promise<void> {
		return this.service.cancelDownload(downloadId);
	}

	getDownloadState(downloadId: string): ActiveBinaryDownload | null {
		return this.service.getDownloadState(downloadId);
	}

	getAllActiveDownloads(): ActiveBinaryDownload[] {
		return this.service.getAllActiveDownloads();
	}

	getStats() {
		return this.service.getStats();
	}

	subscribe(event: DownloadEventType | "all", callback: (data: any) => void): () => void {
		return this.service.subscribe(event, callback);
	}

	destroy(): void {
		return this.service.destroy();
	}
}

// Implementación de la Strategy para descargas de streams
class StreamDownloadStrategy implements DownloadStrategy {
	private service: StreamDownloadService;

	constructor() {
		this.service = StreamDownloadService.getInstance();
	}

	async initialize(config?: any): Promise<void> {
		return this.service.initialize(config);
	}

	async startDownload(task: StreamDownloadTask): Promise<void> {
		return this.service.startDownload(task);
	}

	async pauseDownload(downloadId: string): Promise<void> {
		return this.service.pauseDownload(downloadId);
	}

	async resumeDownload(downloadId: string): Promise<void> {
		return this.service.resumeDownload(downloadId);
	}

	async cancelDownload(downloadId: string): Promise<void> {
		return this.service.cancelDownload(downloadId);
	}

	getDownloadState(downloadId: string): ActiveStreamDownload | null {
		return this.service.getDownloadState(downloadId);
	}

	getAllActiveDownloads(): ActiveStreamDownload[] {
		return this.service.getAllActiveDownloads();
	}

	getStats() {
		return this.service.getStats();
	}

	subscribe(event: DownloadEventType | "all", callback: (data: any) => void): () => void {
		return this.service.subscribe(event, callback);
	}

	destroy(): void {
		return this.service.destroy();
	}
}

// Factory para crear estrategias
class DefaultDownloadStrategyFactory implements DownloadStrategyFactory {
	private strategies: Map<DownloadType, DownloadStrategy> = new Map();

	createStrategy(type: DownloadType): DownloadStrategy {
		if (!this.strategies.has(type)) {
			switch (type) {
				case DownloadType.BINARY:
					this.strategies.set(type, new BinaryDownloadStrategy());
					break;
				case DownloadType.STREAM:
					this.strategies.set(type, new StreamDownloadStrategy());
					break;
				default:
					throw new PlayerError("DOWNLOAD_INVALID_CONTENT_ID", {
						message: `Unsupported download type: ${type}`,
					});
			}
		}
		return this.strategies.get(type)!;
	}

	destroyStrategy(type: DownloadType): void {
		const strategy = this.strategies.get(type);
		if (strategy) {
			strategy.destroy();
			this.strategies.delete(type);
		}
	}

	destroyAll(): void {
		for (const [, strategy] of this.strategies) {
			strategy.destroy();
		}
		this.strategies.clear();
	}
}

export class DownloadService {
	private static instance: DownloadService;
	private eventEmitter: EventEmitter;
	private config: DownloadServiceConfig;
	private currentLogger: Logger;
	private isInitialized: boolean = false;
	private initPromise: Promise<void> | null = null;
	private strategyFactory: DownloadStrategyFactory;
	private eventUnsubscribers: Map<DownloadType, () => void> = new Map();

	private constructor() {
		this.eventEmitter = new EventEmitter();
		this.config = DEFAULT_CONFIG_DOWNLOAD_SERVICE;
		this.currentLogger = new Logger({
			...LOGGER_DEFAULTS,
			enabled: this.config.logEnabled,
			level: this.config.logLevel,
		});
		this.strategyFactory = new DefaultDownloadStrategyFactory();
	}

	public static getInstance(): DownloadService {
		if (!DownloadService.instance) {
			DownloadService.instance = new DownloadService();
		}
		return DownloadService.instance;
	}

	public async initialize(config?: Partial<DownloadServiceConfig>): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		// Si hay una inicialización en progreso, esperar a que termine
		if (this.initPromise) {
			return this.initPromise;
		}

		// Crear promesa que otras llamadas concurrentes pueden esperar
		this.initPromise = (async () => {
			// Actualizar configuración
			this.config = { ...this.config, ...config };
			this.currentLogger.updateConfig({
				enabled: this.config.logEnabled,
				level: this.config.logLevel,
			});

			try {
				// Inicializar estrategias si está habilitado
				if (this.config.autoInitializeStrategies) {
					await this.initializeStrategies();
				}

				// Configurar bridge de eventos si está habilitado
				if (this.config.eventBridgeEnabled) {
					this.setupEventBridge();
				}

				this.isInitialized = true;
				this.currentLogger.info(TAG, "DownloadService initialized with strategy pattern");
			} catch (error) {
				throw new PlayerError("DOWNLOAD_BINARY_SERVICE_INITIALIZATION_FAILED", {
					originalError: error,
				});
			} finally {
				// Limpiar promesa pendiente
				this.initPromise = null;
			}
		})();

		return this.initPromise;
	}

	/*
	 * Inicialización de estrategias según configuración
	 *
	 */

	private async initializeStrategies(): Promise<void> {
		const initPromises: Promise<void>[] = [];

		if (this.config.enableBinaryDownloads) {
			try {
				const binaryStrategy = this.strategyFactory.createStrategy(DownloadType.BINARY);
				initPromises.push(binaryStrategy.initialize());
				this.currentLogger.debug(TAG, "Binary download strategy initialized");
			} catch (error) {
				this.currentLogger.error(TAG, "Failed to initialize binary strategy", error);
			}
		}

		if (this.config.enableStreamDownloads) {
			try {
				const streamStrategy = this.strategyFactory.createStrategy(DownloadType.STREAM);
				initPromises.push(streamStrategy.initialize());
				this.currentLogger.debug(TAG, "Stream download strategy initialized");
			} catch (error) {
				this.currentLogger.error(TAG, "Failed to initialize stream strategy", error);
			}
		}

		await Promise.allSettled(initPromises);
	}

	/*
	 * Configuración del bridge de eventos unificado
	 *
	 */

	private setupEventBridge(): void {
		// Configurar bridge para eventos de binarios si está habilitado
		if (this.config.enableBinaryDownloads) {
			try {
				const binaryStrategy = this.strategyFactory.createStrategy(DownloadType.BINARY);
				const binaryUnsubscriber = binaryStrategy.subscribe("all", (data: any) => {
					this.eventEmitter.emit("binary:" + (data.type || "unknown"), {
						...data,
						sourceType: DownloadType.BINARY,
					});
					// También emitir evento genérico
					this.eventEmitter.emit(data.type || "unknown", {
						...data,
						sourceType: DownloadType.BINARY,
					});
				});
				this.eventUnsubscribers.set(DownloadType.BINARY, binaryUnsubscriber);
			} catch (error) {
				this.currentLogger.warn(TAG, "Failed to setup binary event bridge", error);
			}
		}

		// Configurar bridge para eventos de streams si está habilitado
		if (this.config.enableStreamDownloads) {
			try {
				const streamStrategy = this.strategyFactory.createStrategy(DownloadType.STREAM);
				const streamUnsubscriber = streamStrategy.subscribe("all", (data: any) => {
					this.eventEmitter.emit("stream:" + (data.type || "unknown"), {
						...data,
						sourceType: DownloadType.STREAM,
					});
					// También emitir evento genérico
					this.eventEmitter.emit(data.type || "unknown", {
						...data,
						sourceType: DownloadType.STREAM,
					});
				});
				this.eventUnsubscribers.set(DownloadType.STREAM, streamUnsubscriber);
			} catch (error) {
				this.currentLogger.warn(TAG, "Failed to setup stream event bridge", error);
			}
		}

		this.currentLogger.debug(TAG, "Event bridge configured");
	}

	/*
	 * API Pública - Gestión unificada de descargas
	 *
	 */

	public async startDownload(
		task: BinaryDownloadTask | StreamDownloadTask,
		type: DownloadType
	): Promise<void> {
		if (!this.isInitialized) {
			throw new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE");
		}

		// Validar que el tipo esté habilitado
		if (!this.isTypeEnabled(type)) {
			throw new PlayerError("DOWNLOAD_INVALID_CONTENT_ID", {
				message: `Download type ${type} is not enabled`,
			});
		}

		try {
			const strategy = this.strategyFactory.createStrategy(type);
			await strategy.startDownload(task);

			this.currentLogger.info(TAG, `Download started via ${type} strategy: ${task.id}`);
		} catch (error) {
			throw new PlayerError("DOWNLOAD_FAILED", {
				originalError: error,
				taskId: task.id,
				downloadType: type,
			});
		}
	}

	public async pauseDownload(downloadId: string, type: DownloadType): Promise<void> {
		if (!this.isTypeEnabled(type)) {
			throw new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE", {
				message: `Download type ${type} is not enabled`,
			});
		}

		try {
			const strategy = this.strategyFactory.createStrategy(type);
			await strategy.pauseDownload(downloadId);

			this.currentLogger.info(TAG, `Download paused via ${type} strategy: ${downloadId}`);
		} catch (error) {
			throw new PlayerError("DOWNLOAD_FAILED", {
				originalError: error,
				downloadId,
				downloadType: type,
			});
		}
	}

	public async resumeDownload(downloadId: string, type: DownloadType): Promise<void> {
		if (!this.isTypeEnabled(type)) {
			throw new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE", {
				message: `Download type ${type} is not enabled`,
			});
		}

		try {
			const strategy = this.strategyFactory.createStrategy(type);
			await strategy.resumeDownload(downloadId);

			this.currentLogger.info(TAG, `Download resumed via ${type} strategy: ${downloadId}`);
		} catch (error) {
			throw new PlayerError("DOWNLOAD_FAILED", {
				originalError: error,
				downloadId,
				downloadType: type,
			});
		}
	}

	public async cancelDownload(downloadId: string, type: DownloadType): Promise<void> {
		if (!this.isTypeEnabled(type)) {
			throw new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE", {
				message: `Download type ${type} is not enabled`,
			});
		}

		try {
			const strategy = this.strategyFactory.createStrategy(type);
			await strategy.cancelDownload(downloadId);

			this.currentLogger.info(TAG, `Download cancelled via ${type} strategy: ${downloadId}`);
		} catch (error) {
			throw new PlayerError("DOWNLOAD_FAILED", {
				originalError: error,
				downloadId,
				downloadType: type,
			});
		}
	}

	/*
	 * API Pública - Consultas unificadas
	 *
	 */

	public getDownloadState(
		downloadId: string,
		type: DownloadType
	): ActiveBinaryDownload | ActiveStreamDownload | null {
		if (!this.isTypeEnabled(type)) {
			return null;
		}

		try {
			const strategy = this.strategyFactory.createStrategy(type);
			return strategy.getDownloadState(downloadId);
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to get download state: ${downloadId}`, error);
			return null;
		}
	}

	public getAllActiveDownloads(): Array<ActiveBinaryDownload | ActiveStreamDownload> {
		const allDownloads: Array<ActiveBinaryDownload | ActiveStreamDownload> = [];

		// Obtener descargas binarias si están habilitadas
		if (this.config.enableBinaryDownloads) {
			try {
				const binaryStrategy = this.strategyFactory.createStrategy(DownloadType.BINARY);
				allDownloads.push(...binaryStrategy.getAllActiveDownloads());
			} catch (error) {
				this.currentLogger.warn(TAG, "Failed to get binary downloads", error);
			}
		}

		// Obtener descargas de streams si están habilitadas
		if (this.config.enableStreamDownloads) {
			try {
				const streamStrategy = this.strategyFactory.createStrategy(DownloadType.STREAM);
				allDownloads.push(...streamStrategy.getAllActiveDownloads());
			} catch (error) {
				this.currentLogger.warn(TAG, "Failed to get stream downloads", error);
			}
		}

		return allDownloads;
	}

	public getUnifiedStats() {
		const stats = {
			binary: null as any,
			stream: null as any,
			combined: {
				totalActiveDownloads: 0,
				totalQueuedDownloads: 0,
				totalBytesDownloaded: 0,
				averageSpeed: 0,
			},
		};

		// Obtener estadísticas de binarios
		if (this.config.enableBinaryDownloads) {
			try {
				const binaryStrategy = this.strategyFactory.createStrategy(DownloadType.BINARY);
				stats.binary = binaryStrategy.getStats();
				stats.combined.totalActiveDownloads += stats.binary.activeDownloads || 0;
				stats.combined.totalQueuedDownloads += stats.binary.queuedDownloads || 0;
				stats.combined.totalBytesDownloaded += stats.binary.totalDownloaded || 0;
			} catch (error) {
				this.currentLogger.warn(TAG, "Failed to get binary stats", error);
			}
		}

		// Obtener estadísticas de streams
		if (this.config.enableStreamDownloads) {
			try {
				const streamStrategy = this.strategyFactory.createStrategy(DownloadType.STREAM);
				stats.stream = streamStrategy.getStats();
				stats.combined.totalActiveDownloads += stats.stream.activeDownloads || 0;
				stats.combined.totalQueuedDownloads += stats.stream.queuedDownloads || 0;
				stats.combined.totalBytesDownloaded += stats.stream.totalDownloaded || 0;
			} catch (error) {
				this.currentLogger.warn(TAG, "Failed to get stream stats", error);
			}
		}

		// Calcular velocidad promedio combinada
		const binarySpeed = stats.binary?.averageSpeed || 0;
		const streamSpeed = stats.stream?.averageSpeed || 0;
		const activeStrategies = (stats.binary ? 1 : 0) + (stats.stream ? 1 : 0);
		stats.combined.averageSpeed =
			activeStrategies > 0 ? (binarySpeed + streamSpeed) / activeStrategies : 0;

		return stats;
	}

	/*
	 * API Pública - Sistema de eventos unificado
	 *
	 */

	public subscribe(
		event: DownloadEventType | "all" | string,
		callback: (data: any) => void
	): () => void {
		this.eventEmitter.on(event, callback);
		return () => this.eventEmitter.off(event, callback);
	}

	/*
	 * API Pública - Configuración y utilidades
	 *
	 */

	public enableDownloadType(type: DownloadType): void {
		if (type === DownloadType.BINARY) {
			this.config.enableBinaryDownloads = true;
		} else if (type === DownloadType.STREAM) {
			this.config.enableStreamDownloads = true;
		}
		this.currentLogger.info(TAG, `Download type ${type} enabled`);
	}

	public disableDownloadType(type: DownloadType): void {
		if (type === DownloadType.BINARY) {
			this.config.enableBinaryDownloads = false;
		} else if (type === DownloadType.STREAM) {
			this.config.enableStreamDownloads = false;
		}

		// Limpiar estrategia si existe
		try {
			const factory = this.strategyFactory as DefaultDownloadStrategyFactory;
			factory.destroyStrategy(type);
		} catch (error) {
			this.currentLogger.warn(TAG, `Failed to destroy ${type} strategy`, error);
		}

		this.currentLogger.info(TAG, `Download type ${type} disabled`);
	}

	public isTypeEnabled(type: DownloadType): boolean {
		return type === DownloadType.BINARY
			? this.config.enableBinaryDownloads
			: this.config.enableStreamDownloads;
	}

	public getConfig(): DownloadServiceConfig {
		return { ...this.config };
	}

	/*
	 * Validación de tareas unificada
	 *
	 */

	public validateDownloadTask(
		task: BinaryDownloadTask | StreamDownloadTask,
		type: DownloadType
	): ValidationResult {
		const errors: string[] = [];

		// Validación común
		if (!task.id || task.id.trim().length === 0) {
			errors.push("Task ID is required");
		}

		// Validación específica por tipo
		if (type === DownloadType.BINARY) {
			const binaryTask = task as BinaryDownloadTask;
			if (!binaryTask.url || !this.isValidUrl(binaryTask.url)) {
				errors.push("Valid URL is required for binary download");
			}
			if (!binaryTask.destination || binaryTask.destination.trim().length === 0) {
				errors.push("Destination path is required for binary download");
			}
		} else if (type === DownloadType.STREAM) {
			const streamTask = task as StreamDownloadTask;
			if (!streamTask.title || streamTask.title.trim().length === 0) {
				errors.push("Title is required for stream download");
			}
			if (!streamTask.manifestUrl || !this.isValidManifestUrl(streamTask.manifestUrl)) {
				errors.push("Valid manifest URL is required for stream download");
			}
			if (!streamTask.config) {
				errors.push("Stream configuration is required");
			}
		}

		return {
			isValid: errors.length === 0,
			errors: errors.length > 0 ? errors : undefined,
		};
	}

	/*
	 * Utilidades privadas
	 *
	 */

	private isValidUrl(url: string): boolean {
		// Usar regex para evitar bug de React Native con new URL()
		return /^https?:\/\//.test(url.trim());
	}

	private isValidManifestUrl(url: string): boolean {
		// Usar regex para evitar bug de React Native con new URL()
		const isHttps = /^https?:\/\//.test(url.trim());
		const isManifest = url.includes(".m3u8") || url.includes(".mpd");
		return isHttps && isManifest;
	}

	/*
	 * Limpieza de recursos
	 *
	 */

	public destroy(): void {
		// Desuscribir eventos
		this.eventUnsubscribers.forEach(unsubscriber => {
			try {
				unsubscriber();
			} catch (error) {
				this.currentLogger.warn(TAG, "Error unsubscribing from events", error);
			}
		});
		this.eventUnsubscribers.clear();

		// Destruir todas las estrategias
		const factory = this.strategyFactory as DefaultDownloadStrategyFactory;
		factory.destroyAll();

		this.eventEmitter.removeAllListeners();
		this.isInitialized = false;

		this.currentLogger.info(TAG, "DownloadService destroyed");
	}
}

// Exportar instancia singleton
export const downloadService = DownloadService.getInstance();
