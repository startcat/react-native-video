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
import { downloadService } from "../services/download/DownloadService";
import { networkService } from "../services/network/NetworkService";
import { storageService } from "../services/storage/StorageService";
import {
  BinaryDownloadTask,
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
import { profileManager } from "./ProfileManager";
import { queueManager } from "./QueueManager";

const TAG = LOG_TAGS.DOWNLOADS_MANAGER;

export class DownloadsManager {
  private static instance: DownloadsManager;
  private eventEmitter: EventEmitter;
  private config: DownloadsManagerConfig;
  private currentLogger: Logger;
  private state: DownloadsManagerState;

  // Event unsubscribers para cleanup
  private eventUnsubscribers: (() => void)[] = [];

  // Cache de estadísticas para optimizar consultas frecuentes
  private lastStatsUpdate: number = 0;
  private cachedStats: QueueStats | null = null;
  private readonly STATS_CACHE_TTL = 2000; // 2 segundos

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
      this.currentLogger.info(TAG, "DownloadsManager already initialized");
      return;
    }

    try {
      // Actualizar configuración
      this.config = { ...this.config, ...config };
      this.currentLogger.updateConfig({
        enabled: this.config.logEnabled,
        level: this.config.logLevel,
      });

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
          : new PlayerError("DOWNLOAD_BINARY_SERVICE_INITIALIZATION_FAILED", {
              originalError: error,
            });

      throw this.state.error;
    }
  }

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
        })
      );
    }

    // Inicializar QueueManager (antes del DownloadService)
    initPromises.push(
      queueManager.initialize({
        logEnabled: this.config.logEnabled,
        logLevel: this.config.logLevel,
        maxConcurrentDownloads: this.config.maxConcurrentDownloads,
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
        this.currentLogger.error(TAG, `Failed to initialize ${serviceNames[index]}`, result.reason);
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
    const queueUnsubscriber = queueManager.subscribe("all", data => {
      this.handleQueueEvent(data);
    });
    this.eventUnsubscribers.push(queueUnsubscriber);

    // Coordinar con ConfigManager para cambios de configuración
    const configUnsubscriber = configManager.subscribe("all", data => {
      this.handleConfigEvent(data);
    });
    this.eventUnsubscribers.push(configUnsubscriber);

    // Coordinar con ProfileManager si está habilitado
    if (this.config.profileManagementEnabled) {
      const profileUnsubscriber = profileManager.subscribe("all", data => {
        this.handleProfileEvent(data);
      });
      this.eventUnsubscribers.push(profileUnsubscriber);
    }

    // Coordinar con DownloadService para eventos de descargas
    const downloadUnsubscriber = downloadService.subscribe("all", async data => {
      await this.handleDownloadEvent(data);
    });
    this.eventUnsubscribers.push(downloadUnsubscriber);

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
    if (downloadsConfig.download_just_wifi) {
      // Aplicar política de solo WiFi
      this.currentLogger.debug(TAG, "WiFi-only policy enabled");
    }

    // Nota: QueueManager no tiene setRetryPolicy, los reintentos se manejan internamente
    // basado en config.maxRetries durante la inicialización

    // Integrar con ProfileManager para filtrado de contenido
    if (this.config.profileManagementEnabled) {
      const activeProfile = profileManager.getActiveProfile();
      if (activeProfile) {
        this.currentLogger.debug(TAG, `Active profile: ${activeProfile.id} ${activeProfile.name}`);
      }
    }

    this.currentLogger.debug(TAG, "Global policies configured with managers integration");
  }

  /*
   * Manejo de eventos de los managers (coordinación de alto nivel)
   *
   */

  private handleQueueEvent(data: any): void {
    try {
      // Los eventos de cola se propagan directamente ya que son de alto nivel
      this.eventEmitter.emit("queue:" + (data.type || "unknown"), {
        ...data,
        timestamp: Date.now(),
        managerState: this.getState(),
      });

      this.invalidateStatsCache();
      this.state.lastUpdated = Date.now();
    } catch (error) {
      this.currentLogger.error(TAG, "Error handling queue event", error);
    }
  }

  private handleConfigEvent(data: any): void {
    try {
      // Los cambios de configuración pueden requerir aplicar nuevas políticas
      this.setupGlobalPolicies();

      this.eventEmitter.emit("config:" + (data.type || "unknown"), {
        ...data,
        timestamp: Date.now(),
        managerState: this.getState(),
      });

      this.currentLogger.info(TAG, "Configuration changed, policies updated");
    } catch (error) {
      this.currentLogger.error(TAG, "Error handling config event", error);
    }
  }

  private handleProfileEvent(data: any): void {
    try {
      // Los cambios de perfil pueden afectar qué descargas son visibles
      this.eventEmitter.emit("profile:" + (data.type || "unknown"), {
        ...data,
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
   * Manejo de eventos de descarga (coordinación de alto nivel)
   *
   */

  private async handleDownloadEvent(data: any): Promise<void> {
    try {
      const { type, sourceType, ...eventData } = data;

      // Invalidar cache de estadísticas cuando hay cambios
      this.invalidateStatsCache();

      // Aplicar políticas globales según el evento
      this.applyGlobalPolicies(type, eventData);

      // Propagar evento enriquecido para hooks
      this.eventEmitter.emit(type, {
        ...eventData,
        sourceType,
        timestamp: Date.now(),
        systemState: await this.getSystemState(),
      });

      // Eventos específicos del manager
      this.eventEmitter.emit("downloads:change", {
        eventType: type,
        data: eventData,
        stats: this.getQueueStats(),
      });

      this.state.lastUpdated = Date.now();
    } catch (error) {
      this.currentLogger.error(TAG, "Error handling download event", error);
    }
  }

  /*
   * Manejo de eventos de red (políticas globales)
   *
   */

  private handleNetworkEvent(networkData: any): void {
    const { isConnected } = networkData;

    // Política global: pausar descargas si se perdió conectividad
    if (!isConnected && this.state.isProcessing) {
      this.currentLogger.info(TAG, "Network lost - implementing global pause policy");
      this.pauseAll().catch(error => {
        this.currentLogger.error(TAG, "Failed to apply network pause policy", error);
      });
    }

    // Política global: reanudar descargas cuando vuelve la conectividad
    else if (isConnected && !this.state.isPaused) {
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

  private handleStorageEvent(storageData: any): void {
    const { isLowSpace, criticalSpace } = storageData;

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
   * Aplicación de políticas globales
   *
   */

  private applyGlobalPolicies(eventType: string, eventData: any): void {
    // Política de reintentos automáticos
    if (this.config.autoRetryEnabled && eventType === DownloadEventType.FAILED) {
      this.handleAutoRetry(eventData);
    }

    // Política de límite de descargas concurrentes
    if (eventType === DownloadEventType.STARTED) {
      this.enforceGlobalLimits();
    }
  }

  /*
   * Manejo de reintentos automáticos
   *
   */

  private handleAutoRetry(failedEventData: any): void {
    const { taskId, retryCount = 0 } = failedEventData;

    if (retryCount < this.config.maxRetryAttempts) {
      const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff

      setTimeout(() => {
        this.currentLogger.info(TAG, `Auto-retry attempt ${retryCount + 1} for ${taskId}`);
        // TODO: Implementar lógica de reintento cuando esté disponible el QueueManager
      }, delay);
    }
  }

  /*
   * Aplicación de límites globales
   *
   */

  private enforceGlobalLimits(): void {
    const stats = this.getQueueStats();

    if (stats.active > this.config.maxConcurrentDownloads) {
      this.currentLogger.warn(
        TAG,
        `Active downloads (${stats.active}) exceed limit (${this.config.maxConcurrentDownloads})`
      );
      // TODO: Implementar pausa selectiva cuando esté disponible el QueueManager
    }
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
      // Verificar políticas globales antes de agregar
      await this.validateGlobalPolicies(task, type);

      // Delegar la descarga específica al DownloadService
      await downloadService.startDownload(task, type);

      this.currentLogger.info(TAG, `Download added via manager: ${task.id} (${type})`);

      return task.id;
    } catch (error) {
      throw error instanceof PlayerError
        ? error
        : new PlayerError("DOWNLOAD_FAILED", {
            originalError: error,
            taskId: task.id,
          });
    }
  }

  public async removeDownload(downloadId: string): Promise<void> {
    try {
      // Obtener el tipo de descarga desde QueueManager
      const downloadType = queueManager.getDownloadType(downloadId);
      if (!downloadType) {
        throw new PlayerError("DOWNLOAD_QUEUE_ITEM_NOT_FOUND", { downloadId });
      }

      // Cancelar descarga usando el tipo correcto
      await downloadService.cancelDownload(downloadId, downloadType);

      // Remover de la cola
      await queueManager.removeDownload(downloadId);

      this.currentLogger.info(TAG, `Download removed via manager: ${downloadId} (${downloadType})`);
    } catch (error) {
      throw error instanceof PlayerError
        ? error
        : new PlayerError("DOWNLOAD_FAILED", {
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

      this.currentLogger.info(TAG, `Download paused via manager: ${downloadId} (${downloadType})`);
    } catch (error) {
      throw error instanceof PlayerError
        ? error
        : new PlayerError("DOWNLOAD_FAILED", {
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

      // Reanudar descarga usando el tipo correcto
      await downloadService.resumeDownload(downloadId, downloadType);

      this.currentLogger.info(TAG, `Download resumed via manager: ${downloadId} (${downloadType})`);
    } catch (error) {
      throw error instanceof PlayerError
        ? error
        : new PlayerError("DOWNLOAD_FAILED", {
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

      // TODO: Implementar pausa masiva cuando esté disponible el QueueManager
      // Por ahora, usar el DownloadService directamente

      this.eventEmitter.emit("downloads:paused_all", {
        timestamp: Date.now(),
        systemState: await this.getSystemState(),
      });

      this.currentLogger.info(TAG, "All downloads paused via manager");
    } catch (error) {
      this.state.isPaused = false;
      throw new PlayerError("DOWNLOAD_FAILED", { originalError: error });
    }
  }

  public async resumeAll(): Promise<void> {
    if (!this.state.isInitialized) {
      throw new PlayerError("DOWNLOAD_MODULE_UNAVAILABLE");
    }

    try {
      this.state.isPaused = false;
      this.state.lastUpdated = Date.now();

      // TODO: Implementar reanudación masiva cuando esté disponible el QueueManager

      this.eventEmitter.emit("downloads:resumed_all", {
        timestamp: Date.now(),
        systemState: await this.getSystemState(),
      });

      this.currentLogger.info(TAG, "All downloads resumed via manager");
    } catch (error) {
      throw new PlayerError("DOWNLOAD_FAILED", { originalError: error });
    }
  }

  public async clearCompleted(): Promise<void> {
    // TODO: Implementar cuando esté disponible la persistencia
    this.currentLogger.info(TAG, "Completed downloads cleared");
  }

  public async clearFailed(): Promise<void> {
    // TODO: Implementar cuando esté disponible la persistencia
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

  public getActiveDownloads(): DownloadItem[] {
    return this.getDownloads().filter(
      item => item.state === DownloadStates.DOWNLOADING || item.state === DownloadStates.PREPARING
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
        active: 0,
        queued: 0,
        completed: 0,
        failed: 0,
        paused: 0,
        totalBytesDownloaded: 0,
        totalBytesRemaining: 0,
        averageSpeed: 0,
        estimatedTimeRemaining: 0,
      };
    }

    // Obtener estadísticas desde QueueManager (fuente de verdad)
    const queueStats = queueManager.getStats();

    // Combinar con estadísticas del DownloadService para velocidades
    const unifiedStats = downloadService.getUnifiedStats();

    this.cachedStats = {
      ...queueStats,
      averageSpeed: unifiedStats.combined.averageSpeed,
      // Las estadísticas del QueueManager ya incluyen los totales de bytes
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
    this.config = { ...this.config, ...newConfig };

    // Propagar cambios de configuración a servicios
    if (
      newConfig.enableBinaryDownloads !== undefined ||
      newConfig.enableStreamDownloads !== undefined
    ) {
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
    callback: (data: any) => void
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
        network: this.config.networkMonitoringEnabled ? networkService.getCurrentStatus() : null,
        storage: this.config.storageMonitoringEnabled ? await storageService.getStorageInfo() : null,
      },
    };
  }

  public isInitialized(): boolean {
    return this.state.isInitialized;
  }

  public isProcessing(): boolean {
    return this.state.isProcessing;
  }

  public isPaused(): boolean {
    return this.state.isPaused;
  }

  /*
   * Utilidades privadas
   *
   */

  private async validateGlobalPolicies(
    task: BinaryDownloadTask | StreamDownloadTask,
    type: DownloadType
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
    if (stats.active >= this.config.maxConcurrentDownloads) {
      // No lanzar error, sino encolar
      this.currentLogger.info(TAG, `Download queued due to concurrency limit: ${task.id}`);
    }
  }

  private async restorePreviousState(): Promise<void> {
    // TODO: Implementar cuando esté disponible la persistencia
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
