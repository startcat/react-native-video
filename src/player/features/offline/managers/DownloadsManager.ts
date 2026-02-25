/*
 * Gestor principal del sistema de descargas
 * Responsabilidades de ALTO NIVEL:
 * - API pública para hooks
 * - Coordinación entre managers (Queue, Config, Profile, Store)
 * - Inicialización del sistema completo
 * - Políticas globales (red, espacio, permisos)
 * - Gestión de errores a nivel sistema
 */

import { EventEmitter } from "eventemitter3";
import { PlayerError } from "../../../core/errors";
import { Logger } from "../../logger";
import { LOG_TAGS } from "../constants";
import { DEFAULT_CONFIG_MAIN_MANAGER, LOGGER_DEFAULTS } from "../defaultConfigs";
import { binaryDownloadService } from "../services/download/BinaryDownloadService";
import { downloadService } from "../services/download/DownloadService";
import { streamDownloadService } from "../services/download/StreamDownloadService";
import { networkService } from "../services/network/NetworkService";
import { storageService } from "../services/storage/StorageService";
import {
	BinaryDownloadTask,
	DownloadEventCallback,
	DownloadEventType,
	DownloadItem,
	DownloadsManagerConfig,
	DownloadsManagerState,
	DownloadStates,
	DownloadType,
	QueueStats,
	StreamDownloadTask,
} from "../types";
import { configManager } from "./ConfigManager";
import { nativeManager } from "./NativeManager";
import { profileManager } from "./ProfileManager";
import { queueManager } from "./QueueManager";

const TAG = LOG_TAGS.DOWNLOADS_MANAGER;

export class DownloadsManager {
	private static instance: DownloadsManager;
	private eventEmitter: EventEmitter;
	private config: DownloadsManagerConfig;
	private currentLogger: Logger;
	private state: DownloadsManagerState;
	private initPromise: Promise<void> | null = null;

	// Event unsubscribers para cleanup
	private eventUnsubscribers: (() => void)[] = [];

	// Cache de estadísticas para optimizar consultas frecuentes
	private lastStatsUpdate: number = 0;
	private cachedStats: QueueStats | null = null;
	private readonly STATS_CACHE_TTL = 500; // 500ms - Actualización frecuente para tiempo estimado

	private constructor() {
		this.eventEmitter = new EventEmitter();
		this.config = DEFAULT_CONFIG_MAIN_MANAGER;

		this.currentLogger = new Logger({
			...LOGGER_DEFAULTS,
			enabled: this.config.logEnabled,
			level: this.config.logLevel,
		});

		this.state = {
			isInitialized: false,
			isProcessing: false,
			isPaused: false,
			error: null,
			lastUpdated: Date.now(),
		};
	}

	public static getInstance(): DownloadsManager {
		if (!DownloadsManager.instance) {
			DownloadsManager.instance = new DownloadsManager();
		}
		return DownloadsManager.instance;
	}

	public async initialize(config?: Partial<DownloadsManagerConfig>): Promise<void> {
		if (this.state.isInitialized) {
			// Si ya está inicializado pero se pasa nueva config, aplicarla
			if (config) {
				this.updateConfig(config);
			}
			return;
		}

		// Si hay una inicialización en progreso, esperar a que termine
		if (this.initPromise) {
			return this.initPromise;
		}

		// Crear promesa que otras llamadas concurrentes pueden esperar
		this.initPromise = (async () => {
			try {
				// Actualizar configuración
				this.config = { ...this.config, ...config };
				this.currentLogger.updateConfig({
					enabled: this.config.logEnabled,
					level: this.config.logLevel,
				});

				this.currentLogger.info(
					TAG,
					`Initializing with maxConcurrentDownloads=${this.config.maxConcurrentDownloads}, autoStart=${this.config.autoStart}`
				);

				// Inicializar servicios del sistema
				await this.initializeSystemServices();

				// Configurar coordinación entre servicios
				this.setupServiceCoordination();

				// Configurar políticas globales
				this.setupGlobalPolicies();

				// Recuperar estado previo si persistencia está habilitada
				if (this.config.persistenceEnabled) {
					await this.restorePreviousState();
				}

				this.state.isInitialized = true;
				this.state.lastUpdated = Date.now();

				// Auto-iniciar procesamiento si está configurado
				if (this.config.autoStart) {
					await this.start();
				}

				this.currentLogger.info(TAG, "DownloadsManager initialized successfully");
			} catch (error) {
				this.state.error =
					error instanceof PlayerError
						? error
						: new PlayerError("DOWNLOAD_MANAGER_INITIALIZATION_FAILED", {
								originalError: error,
							});

				throw this.state.error;
			} finally {
				// Limpiar promesa pendiente
				this.initPromise = null;
			}
		})();

		return this.initPromise;
	}

	// updateConfig está definido más abajo en la sección "API Pública - Configuración"

	/*
	 * Inicialización del ecosistema completo de servicios
	 *
	 */

	private async initializeSystemServices(): Promise<void> {
		const initPromises: Promise<void>[] = [];

		// Inicializar ConfigManager (primero, ya que otros pueden depender de él)
		initPromises.push(
			configManager.initialize({
				logEnabled: this.config.logEnabled,
				logLevel: this.config.logLevel,
			})
		);

		// Inicializar ProfileManager si gestión de perfiles está habilitada
		if (this.config.profileManagementEnabled) {
			initPromises.push(
				profileManager.initialize({
					logEnabled: this.config.logEnabled,
					logLevel: this.config.logLevel,
					activeProfileRequired: this.config.activeProfileRequired,
				})
			);
		}

		// Inicializar QueueManager (antes del DownloadService)
		// COORDINAR autoProcess con autoStart para respetar configuración de inicio automático
		initPromises.push(
			queueManager.initialize({
				logEnabled: this.config.logEnabled,
				logLevel: this.config.logLevel,
				maxConcurrentDownloads: this.config.maxConcurrentDownloads,
				autoProcess: this.config.autoStart,
			})
		);

		// Inicializar DownloadService con configuración del manager
		initPromises.push(
			downloadService.initialize({
				logEnabled: this.config.logEnabled,
				logLevel: this.config.logLevel,
				enableBinaryDownloads: this.config.enableBinaryDownloads,
				enableStreamDownloads: this.config.enableStreamDownloads,
				eventBridgeEnabled: true,
				autoInitializeStrategies: true,
				maxConcurrentDownloads: this.config.maxConcurrentDownloads,
			})
		);

		// Inicializar NetworkService si monitoreo está habilitado
		if (this.config.networkMonitoringEnabled) {
			initPromises.push(
				networkService.initialize({
					logEnabled: this.config.logEnabled,
					logLevel: this.config.logLevel,
				})
			);
		}

		// Inicializar StorageService si monitoreo está habilitado
		if (this.config.storageMonitoringEnabled) {
			initPromises.push(
				storageService.initialize({
					logEnabled: this.config.logEnabled,
					logLevel: this.config.logLevel,
				})
			);
		}

		const results = await Promise.allSettled(initPromises);

		// Log de fallos no críticos
		const serviceNames = [
			"ConfigManager",
			...(this.config.profileManagementEnabled ? ["ProfileManager"] : []),
			"QueueManager",
			"DownloadService",
			...(this.config.networkMonitoringEnabled ? ["NetworkService"] : []),
			...(this.config.storageMonitoringEnabled ? ["StorageService"] : []),
		];

		results.forEach((result, index) => {
			if (result.status === "rejected") {
				this.currentLogger.error(
					TAG,
					`Failed to initialize ${serviceNames[index]}`,
					result.reason
				);
			}
		});

		this.currentLogger.debug(TAG, "System services and managers initialized");
	}

	/*
	 * Configuración de la coordinación entre servicios
	 *
	 */

	private setupServiceCoordination(): void {
		// Coordinar con QueueManager para eventos de cola
		// Suscribirse a cada evento individualmente para capturar el tipo de evento
		Object.values(DownloadEventType).forEach(eventType => {
			const unsubscriber = queueManager.subscribe(eventType, data => {
				this.handleQueueEvent(eventType, data);
			});
			this.eventUnsubscribers.push(unsubscriber);
		});

		// Coordinar con ConfigManager para cambios de configuración
		const configUnsubscriber = configManager.subscribe("all", data => {
			this.handleConfigEvent(data);
			this.setupGlobalPolicies();
		});
		this.eventUnsubscribers.push(configUnsubscriber);

		// Coordinar con ProfileManager si está habilitado
		if (this.config.profileManagementEnabled) {
			const profileUnsubscriber = profileManager.subscribe("all", data => {
				this.handleProfileEvent(data);
			});
			this.eventUnsubscribers.push(profileUnsubscriber);
		}

		// Nota: Suscripción a DownloadService deshabilitada - eventos fluyen directamente
		// desde NativeManager/BinaryDownloadService -> QueueManager -> DownloadsManager

		// Coordinar con NetworkService para políticas de red
		if (this.config.networkMonitoringEnabled) {
			const networkUnsubscriber = networkService.subscribe("all", networkData => {
				this.handleNetworkEvent(networkData);
			});
			this.eventUnsubscribers.push(networkUnsubscriber);
		}

		// Coordinar con StorageService para políticas de espacio
		if (this.config.storageMonitoringEnabled) {
			const storageUnsubscriber = storageService.subscribe("all", storageData => {
				this.handleStorageEvent(storageData);
			});
			this.eventUnsubscribers.push(storageUnsubscriber);
		}

		this.currentLogger.debug(TAG, "Service coordination configured");
	}

	/*
	 * Configuración de políticas globales del sistema
	 *
	 */

	private setupGlobalPolicies(): void {
		// Configurar límites de concurrencia en QueueManager
		queueManager.setMaxConcurrent(this.config.maxConcurrentDownloads);

		// Configurar políticas de red basadas en ConfigManager
		const downloadsConfig = configManager.getConfig();
		const wifiOnly = downloadsConfig.download_just_wifi;
		const allowCellular = !wifiOnly;

		// Propagar política de red a los servicios de descarga
		streamDownloadService.setNetworkPolicy(wifiOnly, allowCellular);
		binaryDownloadService.setNetworkPolicy(wifiOnly, allowCellular);
		networkService.setNetworkPolicy({ requiresWifi: wifiOnly, allowCellular });

		this.currentLogger.debug(
			TAG,
			`Network policy applied: WiFi only=${wifiOnly}, cellular allowed=${allowCellular}`
		);

		// Nota: QueueManager no tiene setRetryPolicy, los reintentos se manejan internamente
		// basado en config.maxRetries durante la inicialización

		// Integrar con ProfileManager para filtrado de contenido
		if (this.config.profileManagementEnabled) {
			const activeProfile = profileManager.getActiveProfile();
			if (activeProfile) {
				this.currentLogger.debug(
					TAG,
					`Active profile: ${activeProfile.id} ${activeProfile.name}`
				);
			}
		}

		this.currentLogger.debug(TAG, "Global policies configured with managers integration");
	}

	/*
	 * Manejo de eventos de los managers (coordinación de alto nivel)
	 *
	 */

	private handleQueueEvent(eventType: DownloadEventType, data: unknown): void {
		try {
			const eventData = data as Record<string, unknown>;

			// Emisión única para hooks (sin prefijo "queue:" — verificado que nadie lo consume)
			this.eventEmitter.emit(eventType, {
				...eventData,
				timestamp: Date.now(),
			});

			this.invalidateStatsCache();
			this.state.lastUpdated = Date.now();
		} catch (error) {
			this.currentLogger.error(TAG, "Error handling queue event", error);
		}
	}

	private handleConfigEvent(data: unknown): void {
		try {
			const eventData = data as {
				type?: string;
				property?: string;
				newValue?: unknown;
				[key: string]: unknown;
			};
			// Los cambios de configuración pueden requerir aplicar nuevas políticas
			this.setupGlobalPolicies();

			// Si cambió download_just_wifi, pausar o reanudar descargas activas según corresponda
			if (eventData.property === "download_just_wifi") {
				const wifiOnly = eventData.newValue as boolean;
				if (wifiOnly && !networkService.isWifiConnected() && networkService.isOnline()) {
					this.currentLogger.info(
						TAG,
						"WiFi-only enabled while on cellular: pausing active downloads"
					);
					this.pauseAll().catch(error => {
						this.currentLogger.error(
							TAG,
							"Failed to pause downloads on policy change",
							error
						);
					});
				} else if (!wifiOnly) {
					if (this.state.isPaused) {
						this.currentLogger.info(
							TAG,
							"WiFi-only disabled: resuming paused downloads"
						);
						this.resumeAll().catch(error => {
							this.currentLogger.error(
								TAG,
								"Failed to resume downloads on policy change",
								error
							);
						});
					} else {
						// Downloads may be stuck in QUEUED because they were added while
						// WiFi-only was active (canDownloadNow() returned false).
						// isPaused is false so resumeAll won't help — force queue processing.
						this.currentLogger.info(
							TAG,
							"WiFi-only disabled: restarting queue processing for pending downloads"
						);
						queueManager.start();
					}
				}
			}

			this.eventEmitter.emit("config:" + (eventData.type || "unknown"), {
				...eventData,
				timestamp: Date.now(),
				managerState: this.getState(),
			});

			this.currentLogger.info(TAG, "Configuration changed, policies updated");
		} catch (error) {
			this.currentLogger.error(TAG, "Error handling config event", error);
		}
	}

	private handleProfileEvent(data: unknown): void {
		try {
			const eventData = data as { type?: string; [key: string]: unknown };
			// Los cambios de perfil pueden afectar qué descargas son visibles
			this.eventEmitter.emit("profile:" + (eventData.type || "unknown"), {
				...eventData,
				timestamp: Date.now(),
				managerState: this.getState(),
			});

			this.invalidateStatsCache();
			this.currentLogger.info(TAG, "Profile changed");
		} catch (error) {
			this.currentLogger.error(TAG, "Error handling profile event", error);
		}
	}

	/*
	 * Manejo de eventos de red (políticas globales)
	 *
	 */

	private handleNetworkEvent(networkData: unknown): void {
		const { isConnected } = networkData as { isConnected: boolean };

		// Política global: pausar descargas si se perdió conectividad
		if (!isConnected && this.state.isProcessing) {
			this.currentLogger.info(TAG, "Network lost - implementing global pause policy");
			this.pauseAll().catch(error => {
				this.currentLogger.error(TAG, "Failed to apply network pause policy", error);
			});
		}

		// Política global: pausar descargas si conectado pero en red no permitida (ej: cellular con WiFi-only)
		else if (isConnected && !networkService.canDownload() && this.state.isProcessing) {
			this.currentLogger.info(
				TAG,
				"Network restricted (e.g. cellular with WiFi-only) - pausing downloads"
			);
			this.pauseAll().catch(error => {
				this.currentLogger.error(
					TAG,
					"Failed to apply network restriction pause policy",
					error
				);
			});
		}

		// Política global: reanudar descargas cuando vuelve la conectividad adecuada
		else if (isConnected && !this.state.isPaused && networkService.canDownload()) {
			this.currentLogger.info(TAG, "Network restored - implementing global resume policy");
			this.resumeAll().catch(error => {
				this.currentLogger.error(TAG, "Failed to apply network resume policy", error);
			});
		}

		// Propagar evento para hooks
		this.eventEmitter.emit("network:change", {
			networkData,
			timestamp: Date.now(),
			policyApplied: true,
		});
	}

	/*
	 * Manejo de eventos de almacenamiento (políticas globales)
	 *
	 */

	private handleStorageEvent(storageData: unknown): void {
		if (!storageData || typeof storageData !== "object") {
			return;
		}

		const { isLowSpace, criticalSpace } = storageData as {
			isLowSpace?: boolean;
			criticalSpace?: boolean;
		};

		// Política global: pausar descargas si hay poco espacio
		if ((isLowSpace || criticalSpace) && this.state.isProcessing) {
			this.currentLogger.warn(TAG, "Low storage detected - implementing global pause policy");
			this.pauseAll().catch(error => {
				this.currentLogger.error(TAG, "Failed to apply storage pause policy", error);
			});
		}

		// Propagar evento para hooks
		this.eventEmitter.emit("storage:change", {
			storageData,
			timestamp: Date.now(),
			policyApplied: true,
		});
	}

	/*
	 * API Pública - Gestión de descargas de alto nivel
	 *
	 */

	public async addDownload(
		task: BinaryDownloadTask | StreamDownloadTask,
		type: DownloadType
	): Promise<string> {
		if (!this.state.isInitialized) {
			throw new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE");
		}

		try {
			// Verificar que el tipo de descarga esté habilitado
			if (!downloadService.isTypeEnabled(type)) {
				throw new PlayerError("DOWNLOAD_FAILED", {
					taskId: task.id,
					downloadType: type,
					message: `Download type ${type} is not enabled. ${type === DownloadType.BINARY ? "BINARY_DOWNLOADS_DISABLED" : "STREAM_DOWNLOADS_DISABLED"}`,
				});
			}

			// Verificar políticas globales antes de agregar
			await this.validateGlobalPolicies(task, type);

			// Determinar URI según el tipo de descarga
			const uri =
				type === DownloadType.BINARY
					? (task as BinaryDownloadTask).url
					: (task as StreamDownloadTask).manifestUrl;

			// Crear DownloadItem y añadir a la cola
			// El QueueManager respetará maxConcurrentDownloads y autoProcess
			const downloadItem: DownloadItem = {
				id: task.id,
				title: task.title || task.id,
				type,
				state: DownloadStates.QUEUED,
				uri,
				profileIds: profileManager.getActiveProfileId()
					? [profileManager.getActiveProfileId()!]
					: [],
				stats: {
					bytesDownloaded: 0,
					totalBytes: 0,
					progressPercent: 0,
					retryCount: 0,
				},
			};

			await queueManager.addDownloadItem(downloadItem);
			this.currentLogger.info(
				TAG,
				`Download queued (autoStart ${this.config.autoStart ? "enabled" : "disabled"}): ${task.id} (${type})`
			);
			return task.id;
		} catch (error) {
			// Propagar PlayerError de servicios/managers directamente
			if (error instanceof PlayerError) {
				throw error;
			}
			// Solo envolver errores no tipados
			throw new PlayerError("DOWNLOAD_MANAGER_ADD_FAILED", {
				originalError: error,
				taskId: task.id,
			});
		}
	}

	/*
	 * Inicia una descarga inmediatamente, ignorando la configuración autoStart.
	 * Este método es usado internamente por QueueManager cuando una descarga
	 * ya fue aprobada para iniciar.
	 */
	public async startDownloadNow(
		task: BinaryDownloadTask | StreamDownloadTask,
		type: DownloadType
	): Promise<string> {
		if (!this.state.isInitialized) {
			throw new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE");
		}

		try {
			// Verificar políticas globales antes de iniciar
			await this.validateGlobalPolicies(task, type);

			// Iniciar descarga directamente, ignorando autoStart
			await downloadService.startDownload(task, type);

			this.currentLogger.info(TAG, `Download started immediately: ${task.id} (${type})`);

			return task.id;
		} catch (error) {
			if (error instanceof PlayerError) {
				throw error;
			}
			throw new PlayerError("DOWNLOAD_MANAGER_START_FAILED", {
				originalError: error,
				taskId: task.id,
			});
		}
	}

	public async removeDownload(downloadId: string): Promise<void> {
		this.currentLogger.debug(TAG, `removeDownload called for: ${downloadId}`);
		try {
			// Obtener el item completo desde QueueManager para verificar estado
			this.currentLogger.debug(TAG, `Getting download item for: ${downloadId}`);
			const downloadItem = queueManager.getDownload(downloadId);

			// IMPORTANTE: Aunque no esté en QueueManager, intentar limpiar en todos los niveles
			// Esto maneja casos donde la descarga falló antes de ser registrada completamente
			// o donde hay residuos de descargas anteriores
			const downloadType = downloadItem?.type || DownloadType.STREAM;
			const downloadState = downloadItem?.state;

			if (downloadItem) {
				this.currentLogger.debug(
					TAG,
					`Download ${downloadId}: type=${downloadType}, state=${downloadState}`
				);
			} else {
				this.currentLogger.warn(
					TAG,
					`Download ${downloadId} not found in queue, attempting cleanup anyway`
				);
			}

			// Determinar si debemos intentar cancelar en el servicio de descargas
			// Solo si está en progreso, en cola o pausada
			const shouldCancelInService =
				downloadItem &&
				(downloadState === DownloadStates.DOWNLOADING ||
					downloadState === DownloadStates.QUEUED ||
					downloadState === DownloadStates.PAUSED ||
					downloadState === DownloadStates.PREPARING);

			if (shouldCancelInService) {
				// Cancelar descarga activa usando el servicio
				this.currentLogger.debug(
					TAG,
					`Cancelling active download via service: ${downloadId} (${downloadType})`
				);
				try {
					await downloadService.cancelDownload(downloadId, downloadType);
					this.currentLogger.debug(TAG, `Download cancelled via service: ${downloadId}`);
				} catch (serviceError) {
					// Si falla la cancelación en el servicio, continuar con la limpieza
					this.currentLogger.warn(
						TAG,
						`Service cancellation failed for ${downloadId}, continuing cleanup:`,
						serviceError
					);
				}
			} else if (downloadItem) {
				// Para descargas completadas o fallidas
				this.currentLogger.debug(
					TAG,
					`Skipping service cancellation for ${downloadState} download: ${downloadId}`
				);

				// Para descargas binarias completadas, eliminar el archivo físico manualmente
				if (
					downloadType === DownloadType.BINARY &&
					downloadState === DownloadStates.COMPLETED
				) {
					try {
						const binariesDir = storageService.getBinariesDirectory();
						const filePath = `${binariesDir}/${downloadId}`;
						const deleted = await storageService.deleteFile(filePath);
						if (deleted) {
							this.currentLogger.info(
								TAG,
								`Deleted completed binary file: ${filePath}`
							);
						} else {
							this.currentLogger.warn(
								TAG,
								`Binary file not found or already deleted: ${filePath}`
							);
						}
					} catch (error) {
						this.currentLogger.warn(
							TAG,
							`Error deleting binary file for ${downloadId}:`,
							error
						);
						// No lanzar error, continuar con la eliminación de la cola
					}
				}
			}

			// SIEMPRE intentar limpiar en el módulo nativo, incluso si no está en QueueManager
			// Esto elimina residuos de descargas que fallaron o quedaron en estado inconsistente
			try {
				await nativeManager.removeDownload(downloadId);
				this.currentLogger.debug(TAG, `Native module cleanup completed: ${downloadId}`);
			} catch (nativeError) {
				// Si falla en nativo (ej: no existe), es OK - continuamos con la limpieza local
				this.currentLogger.debug(
					TAG,
					`Native removal failed (may not exist): ${downloadId}`,
					nativeError
				);
			}

			// Remover de la cola si existe
			// Usamos forceRemoveDownload para asegurar eliminación completa sin depender de perfiles
			if (downloadItem) {
				this.currentLogger.debug(TAG, `Force removing from queue: ${downloadId}`);
				try {
					await queueManager.forceRemoveDownload(downloadId);
					this.currentLogger.debug(TAG, `Force removed from queue: ${downloadId}`);
				} catch (queueError) {
					// Si falla la eliminación de la cola, loguear pero no fallar
					// Puede fallar si el item ya fue eliminado por otro proceso
					this.currentLogger.warn(
						TAG,
						`Queue force removal failed for ${downloadId} (may already be removed):`,
						queueError
					);
				}
			}

			this.currentLogger.info(
				TAG,
				`Download removal completed: ${downloadId} (type=${downloadType}, state=${downloadState || "unknown"})`
			);
		} catch (error) {
			this.currentLogger.error(TAG, `Error removing download ${downloadId}:`, error);
			// Propagar PlayerError de servicios/managers directamente
			if (error instanceof PlayerError) {
				throw error;
			}
			// Solo envolver errores no tipados
			throw new PlayerError("DOWNLOAD_MANAGER_REMOVE_FAILED", {
				originalError: error,
				downloadId,
			});
		}
	}

	public async pauseDownload(downloadId: string): Promise<void> {
		try {
			// Obtener el tipo de descarga desde QueueManager
			const downloadType = queueManager.getDownloadType(downloadId);
			if (!downloadType) {
				throw new PlayerError("DOWNLOAD_QUEUE_ITEM_NOT_FOUND", { downloadId });
			}

			// Pausar descarga usando el tipo correcto
			await downloadService.pauseDownload(downloadId, downloadType);

			this.currentLogger.info(
				TAG,
				`Download paused via manager: ${downloadId} (${downloadType})`
			);
		} catch (error) {
			// Propagar PlayerError de servicios/managers directamente
			if (error instanceof PlayerError) {
				throw error;
			}
			// Solo envolver errores no tipados
			throw new PlayerError("DOWNLOAD_MANAGER_PAUSE_FAILED", {
				originalError: error,
				downloadId,
			});
		}
	}

	public async resumeDownload(downloadId: string): Promise<void> {
		try {
			// Obtener el tipo de descarga desde QueueManager
			const downloadType = queueManager.getDownloadType(downloadId);
			if (!downloadType) {
				throw new PlayerError("DOWNLOAD_QUEUE_ITEM_NOT_FOUND", { downloadId });
			}

			// STREAMS: Reanudar normalmente
			if (downloadType === DownloadType.STREAM) {
				await downloadService.resumeDownload(downloadId, downloadType);
				this.currentLogger.info(TAG, `Stream download resumed: ${downloadId}`);
				return;
			}

			// BINARIOS: Recrear como descarga nueva (limitación de react-native-background-downloader)
			// NO llamar a downloadService.resumeDownload() - ir directo al flujo de recreación
			this.currentLogger.info(
				TAG,
				`Binary download will be recreated (no partial resume support): ${downloadId}`
			);

			// 1. Obtener datos de la descarga pausada desde QueueManager
			const downloadItem = queueManager.getDownload(downloadId);
			if (!downloadItem) {
				throw new PlayerError("DOWNLOAD_QUEUE_ITEM_NOT_FOUND", { downloadId });
			}

			// 2. Guardar datos necesarios para recrear
			const savedData = {
				id: downloadItem.id,
				title: downloadItem.title,
				uri: downloadItem.uri,
				media: downloadItem.media,
				licenseExpirationDate: downloadItem.licenseExpirationDate,
				drm: downloadItem.drm,
				drmScheme: downloadItem.drmScheme,
				subtitles: downloadItem.subtitles,
			};

			this.currentLogger.debug(TAG, `Saved download data for recreation: ${downloadId}`);

			// 3. Eliminar la descarga antigua (sigue el flujo completo de removeDownload)
			await this.removeDownload(downloadId);
			this.currentLogger.debug(TAG, `Old download removed: ${downloadId}`);

			// 4. Recrear DownloadItem para QueueManager (con perfil activo)
			const activeProfileId = profileManager.getActiveProfileId();
			const profileIds = activeProfileId ? [activeProfileId] : [];

			const newDownloadItem: DownloadItem = {
				id: savedData.id,
				type: DownloadType.BINARY,
				title: savedData.title,
				uri: savedData.uri,
				media: savedData.media,
				licenseExpirationDate: savedData.licenseExpirationDate,
				drm: savedData.drm,
				drmScheme: savedData.drmScheme,
				subtitles: savedData.subtitles,
				profileIds,
				state: DownloadStates.QUEUED,
				stats: {
					progressPercent: 0,
					bytesDownloaded: 0,
					totalBytes: 0,
					retryCount: 0,
				},
			};

			// 5. Agregar al QueueManager primero (esto lo agrega a la cola y persiste)
			await queueManager.addDownloadItem(newDownloadItem);
			this.currentLogger.debug(TAG, `Download re-added to queue: ${downloadId}`);

			// 6. Crear BinaryDownloadTask para iniciar descarga
			const binariesDir = storageService.getBinariesDirectory();
			const binaryTask: BinaryDownloadTask = {
				id: savedData.id, // Mantener el ID original
				url: savedData.uri,
				destination: `${binariesDir}/${savedData.id}`,
				title: savedData.title,
				headers: {},
				resumable: true,
			};

			// 7. Iniciar la descarga (esto la ejecuta físicamente)
			const newDownloadId = await this.addDownload(binaryTask, DownloadType.BINARY);

			this.currentLogger.info(
				TAG,
				`Binary download recreated: ${downloadId} → ${newDownloadId}`
			);
		} catch (error) {
			// Propagar PlayerError de servicios/managers directamente
			if (error instanceof PlayerError) {
				throw error;
			}
			// Solo envolver errores no tipados
			throw new PlayerError("DOWNLOAD_MANAGER_RESUME_FAILED", {
				originalError: error,
				downloadId,
			});
		}
	}

	/*
	 * API Pública - Control masivo
	 *
	 */

	public async pauseAll(): Promise<void> {
		if (!this.state.isInitialized) {
			throw new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE");
		}

		try {
			this.state.isPaused = true;
			this.state.lastUpdated = Date.now();

			// Collect active binary downloads BEFORE pauseAll changes their states to PAUSED
			const activeBinaryDownloads = this.getDownloads().filter(
				item =>
					item.state === DownloadStates.DOWNLOADING && item.type === DownloadType.BINARY
			);

			// Coordinar con QueueManager para pausar todas las descargas
			// This now also transitions individual DOWNLOADING states to PAUSED
			queueManager.pauseAll();

			// Pausar descargas binarias activas a través del DownloadService
			for (const download of activeBinaryDownloads) {
				try {
					await downloadService.pauseDownload(download.id, download.type);
					this.currentLogger.debug(TAG, `Paused binary download: ${download.id}`);
				} catch (error) {
					this.currentLogger.warn(
						TAG,
						`Failed to pause binary download ${download.id}`,
						error
					);
				}
			}

			// Pausar explícitamente el procesamiento nativo (para streams)
			await nativeManager.stopDownloadProcessing();

			this.eventEmitter.emit("downloads:paused_all", {
				timestamp: Date.now(),
				systemState: await this.getSystemState(),
			});

			this.currentLogger.info(TAG, "All downloads paused via manager");
		} catch (error) {
			this.state.isPaused = false;
			// Propagar PlayerError de servicios/managers directamente
			if (error instanceof PlayerError) {
				throw error;
			}
			// Solo envolver errores no tipados
			throw new PlayerError("DOWNLOAD_MANAGER_PAUSE_ALL_FAILED", { originalError: error });
		}
	}

	public async resumeAll(): Promise<void> {
		if (!this.state.isInitialized) {
			throw new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE");
		}

		try {
			this.state.isPaused = false;
			this.state.lastUpdated = Date.now();

			// Limpiar descargas huérfanas antes de reanudar
			// Esto resetea descargas que quedaron en DOWNLOADING tras reiniciar la app
			await queueManager.forceCleanupOrphanedDownloads();

			// Inicializar procesamiento del QueueManager si no se había iniciado automáticamente
			if (!this.config.autoStart) {
				this.currentLogger.info(
					TAG,
					"Manually starting queue processing (autoStart was disabled)"
				);
				queueManager.start();
			}

			// Reanudar todas las descargas pausadas a través del QueueManager
			await queueManager.resumeAll();

			// Reanudar/recrear todas las descargas pausadas (streams y binarios)
			// Para binarios, this.resumeDownload aplicará el flujo de recreación
			const pausedDownloads = this.getDownloads().filter(
				item => item.state === DownloadStates.PAUSED
			);

			for (const download of pausedDownloads) {
				try {
					await this.resumeDownload(download.id);
					this.currentLogger.debug(
						TAG,
						`Resumed/recreated download: ${download.id} (${download.type})`
					);
				} catch (error) {
					this.currentLogger.warn(
						TAG,
						`Failed to resume/recreate download ${download.id}`,
						error
					);
				}
			}

			// Iniciar explícitamente el procesamiento nativo (para streams)
			await nativeManager.startDownloadProcessing();

			this.eventEmitter.emit("downloads:resumed_all", {
				timestamp: Date.now(),
				systemState: await this.getSystemState(),
			});

			this.currentLogger.info(TAG, "All downloads resumed via manager");
		} catch (error) {
			// Propagar PlayerError de servicios/managers directamente
			if (error instanceof PlayerError) {
				throw error;
			}
			// Solo envolver errores no tipados
			throw new PlayerError("DOWNLOAD_MANAGER_RESUME_ALL_FAILED", { originalError: error });
		}
	}

	/*
	 * Limpia descargas huérfanas que quedaron en estado DOWNLOADING
	 * Útil cuando la app se reinicia y las descargas quedan atascadas
	 *
	 */

	public async cleanupOrphanedDownloads(): Promise<number> {
		if (!this.state.isInitialized) {
			throw new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE");
		}

		try {
			const remainingDownloading = await queueManager.forceCleanupOrphanedDownloads();
			this.currentLogger.info(
				TAG,
				`Orphaned downloads cleaned, ${remainingDownloading} still downloading`
			);
			return remainingDownloading;
		} catch (error) {
			if (error instanceof PlayerError) {
				throw error;
			}
			throw new PlayerError("DOWNLOAD_FAILED", { originalError: error });
		}
	}

	public async clearCompleted(): Promise<void> {
		await queueManager.cleanupCompleted();
		this.currentLogger.info(TAG, "Completed downloads cleared");
	}

	public async clearFailed(): Promise<void> {
		await queueManager.clearFailed();
		this.currentLogger.info(TAG, "Failed downloads cleared");
	}

	/*
	 * API Pública - Estado y estadísticas
	 *
	 */

	public getDownloads(): DownloadItem[] {
		if (!this.state.isInitialized) {
			return [];
		}

		// Obtener todas las descargas del QueueManager
		let downloads = queueManager.getAllDownloads();

		// Filtrar por perfil si está habilitado
		if (this.config.profileManagementEnabled) {
			downloads = profileManager.filterByActiveProfile(downloads);
		}

		return downloads;
	}

	/*
	 * Obtiene una descarga individual por ID
	 * Aplica filtrado por perfil si está habilitado
	 *
	 */

	public getDownload(downloadId: string): DownloadItem | null {
		if (!this.state.isInitialized) {
			return null;
		}

		// Obtener la descarga del QueueManager
		const download = queueManager.getDownload(downloadId);

		if (!download) {
			return null;
		}

		// Aplicar filtrado por perfil si está habilitado
		if (this.config.profileManagementEnabled) {
			const shouldShow = profileManager.shouldShowContent(download);
			if (!shouldShow) {
				return null; // No mostrar si no pertenece al perfil activo
			}
		}

		return download;
	}

	public getActiveDownloads(): DownloadItem[] {
		return this.getDownloads().filter(
			item =>
				item.state === DownloadStates.DOWNLOADING || item.state === DownloadStates.PREPARING
		);
	}

	public getQueuedDownloads(): DownloadItem[] {
		return this.getDownloads().filter(item => item.state === DownloadStates.QUEUED);
	}

	public getCompletedDownloads(): DownloadItem[] {
		return this.getDownloads().filter(item => item.state === DownloadStates.COMPLETED);
	}

	public getFailedDownloads(): DownloadItem[] {
		return this.getDownloads().filter(item => item.state === DownloadStates.FAILED);
	}

	public getQueueStats(): QueueStats {
		// Usar cache si es reciente
		if (this.cachedStats && Date.now() - this.lastStatsUpdate < this.STATS_CACHE_TTL) {
			return this.cachedStats;
		}

		if (!this.state.isInitialized) {
			return {
				total: 0,
				pending: 0,
				downloading: 0,
				paused: 0,
				completed: 0,
				failed: 0,
				isPaused: this.state.isPaused,
				isProcessing: this.state.isProcessing,
				// Propiedades opcionales para compatibilidad
				active: 0,
				queued: 0,
				totalBytesDownloaded: 0,
				totalBytesRemaining: 0,
				averageSpeed: 0,
				estimatedTimeRemaining: 0,
			};
		}

		// Obtener estadísticas desde QueueManager (fuente de verdad)
		const queueStats = queueManager.getQueueStats();

		// QueueManager ya calcula correctamente averageSpeed desde los eventos nativos
		// No sobrescribir con cálculos derivados de DownloadService
		this.cachedStats = {
			...queueStats,
			// averageSpeed ya viene correcto desde queueStats
		};

		this.lastStatsUpdate = Date.now();
		return this.cachedStats;
	}

	/*
	 * API Pública - Control del sistema
	 *
	 */

	public async start(): Promise<void> {
		if (!this.state.isInitialized) {
			throw new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE");
		}

		this.state.isProcessing = true;
		this.state.isPaused = false;
		this.state.lastUpdated = Date.now();

		// Coordinar con QueueManager para iniciar procesamiento
		this.currentLogger.info(TAG, "Starting queue processing (via start() method)");
		queueManager.start();

		// Iniciar explícitamente el procesamiento nativo
		await nativeManager.startDownloadProcessing();

		this.eventEmitter.emit("system:started", {
			timestamp: Date.now(),
			systemState: await this.getSystemState(),
		});

		this.currentLogger.info(TAG, "DownloadsManager started");
	}

	public async stop(): Promise<void> {
		this.state.isProcessing = false;
		this.state.lastUpdated = Date.now();

		// Pausar todas las descargas activas
		await this.pauseAll();

		this.eventEmitter.emit("system:stopped", {
			timestamp: Date.now(),
			systemState: await this.getSystemState(),
		});

		this.currentLogger.info(TAG, "DownloadsManager stopped");
	}

	/*
	 * API Pública - Configuración
	 *
	 */

	public updateConfig(newConfig: Partial<DownloadsManagerConfig>): void {
		const previousAutoStart = this.config.autoStart;
		this.config = { ...this.config, ...newConfig };

		// Propagar cambios relevantes a QueueManager
		queueManager.updateConfig({
			autoProcess: this.config.autoStart,
			maxConcurrentDownloads: this.config.maxConcurrentDownloads,
		});

		// Propagar cambios de enable/disable a DownloadService
		if (newConfig.enableBinaryDownloads !== undefined) {
			if (newConfig.enableBinaryDownloads) {
				downloadService.enableDownloadType(DownloadType.BINARY);
			} else {
				downloadService.disableDownloadType(DownloadType.BINARY);
			}
		}
		if (newConfig.enableStreamDownloads !== undefined) {
			if (newConfig.enableStreamDownloads) {
				downloadService.enableDownloadType(DownloadType.STREAM);
			} else {
				downloadService.disableDownloadType(DownloadType.STREAM);
			}
		}

		// Si autoStart cambió de false a true, iniciar procesamiento
		if (!previousAutoStart && this.config.autoStart) {
			this.currentLogger.info(TAG, "autoStart enabled, starting processing");
			this.start().catch(err => {
				this.currentLogger.error(TAG, "Failed to start after config update", err);
			});
		}

		this.eventEmitter.emit("config:updated", {
			config: this.config,
			timestamp: Date.now(),
		});

		this.currentLogger.info(TAG, "Configuration updated");
	}

	public getConfig(): DownloadsManagerConfig {
		return { ...this.config };
	}

	/*
	 * API Pública - Sistema de eventos
	 *
	 */

	public subscribe(
		event: DownloadEventType | "all" | string,
		callback: DownloadEventCallback
	): () => void {
		this.eventEmitter.on(event, callback);
		return () => this.eventEmitter.off(event, callback);
	}

	/*
	 * API Pública - Estado del sistema
	 *
	 */

	public getState(): DownloadsManagerState {
		return { ...this.state };
	}

	public async getSystemState() {
		return {
			manager: this.getState(),
			stats: this.getQueueStats(),
			config: this.getConfig(),
			services: {
				download: downloadService.getConfig(),
				network: this.config.networkMonitoringEnabled
					? networkService.getCurrentStatus()
					: null,
				storage: this.config.storageMonitoringEnabled
					? await storageService.getStorageInfo()
					: null,
			},
		};
	}

	public isInitialized(): boolean {
		return this.state.isInitialized;
	}

	public isProcessing(): boolean {
		// Calcular dinámicamente si hay descargas activas
		// en lugar de usar un flag estático que puede quedar desactualizado
		const stats = queueManager.getQueueStats();
		return stats.downloading > 0;
	}

	public isPaused(): boolean {
		// Obtener estado real del QueueManager
		const stats = queueManager.getQueueStats();
		return stats.isPaused;
	}

	/*
	 * Utilidades privadas
	 *
	 */

	private async validateGlobalPolicies(
		task: BinaryDownloadTask | StreamDownloadTask,
		_type: DownloadType
	): Promise<void> {
		// Validar espacio disponible
		if (this.config.storageMonitoringEnabled) {
			const isLowSpace = await storageService.isLowSpace();
			if (isLowSpace) {
				throw new PlayerError("DOWNLOAD_NO_SPACE", { taskId: task.id });
			}
		}

		// Validar conectividad
		if (this.config.networkMonitoringEnabled) {
			const networkStatus = networkService.getCurrentStatus();
			if (!networkStatus.isConnected) {
				throw new PlayerError("NETWORK_CONNECTION_001", { taskId: task.id });
			}
		}

		// Validar límites de concurrencia
		const stats = this.getQueueStats();
		const activeCount = stats.active ?? stats.downloading ?? 0;
		if (activeCount >= this.config.maxConcurrentDownloads) {
			// No lanzar error, sino encolar
			this.currentLogger.info(TAG, `Download queued due to concurrency limit: ${task.id}`);
		}
	}

	private async restorePreviousState(): Promise<void> {
		// Limpiar descargas fallidas sin progreso (evita contaminar la cola)
		const downloads = queueManager.getAllDownloads();
		const failedWithoutProgress = downloads.filter(
			item =>
				item.state === DownloadStates.FAILED &&
				item.stats.bytesDownloaded === 0 &&
				item.stats.totalBytes === 0
		);

		if (failedWithoutProgress.length > 0) {
			this.currentLogger.info(
				TAG,
				`Cleaning ${failedWithoutProgress.length} failed downloads without progress`
			);

			for (const item of failedWithoutProgress) {
				try {
					await queueManager.removeDownload(item.id);
					this.currentLogger.debug(TAG, `Removed failed download: ${item.id}`);
				} catch (error) {
					this.currentLogger.warn(TAG, `Failed to remove ${item.id}:`, error);
				}
			}
		}

		this.currentLogger.debug(TAG, "Previous state restored");
	}

	private invalidateStatsCache(): void {
		this.cachedStats = null;
		this.lastStatsUpdate = 0;
	}

	/*
	 * Limpieza de recursos
	 *
	 */

	public destroy(): void {
		// Parar el sistema
		this.stop().catch(error => {
			this.currentLogger.error(TAG, "Error stopping system during destroy", error);
		});

		// Limpiar suscripciones
		this.eventUnsubscribers.forEach(unsubscriber => {
			try {
				unsubscriber();
			} catch (error) {
				this.currentLogger.warn(TAG, "Error unsubscribing during destroy", error);
			}
		});
		this.eventUnsubscribers = [];

		// Limpiar eventos propios
		this.eventEmitter.removeAllListeners();

		// Reset estado
		this.state.isInitialized = false;
		this.invalidateStatsCache();

		this.currentLogger.info(TAG, "DownloadsManager destroyed");
	}
}

// Export singleton instance
export const downloadsManager = DownloadsManager.getInstance();
