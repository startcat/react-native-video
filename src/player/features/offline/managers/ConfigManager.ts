/*
 * Singleton que gestiona la configuración de descargas con persistencia,
 * validación y eventos reactivos usando PersistenceService.
 *
 */

import { EventEmitter } from "eventemitter3";
import { PlayerError } from "../../../core/errors";
import { Logger, LogLevel } from "../../logger";
import { LOG_TAGS } from "../constants";
import { DEFAULT_CONFIG_MANAGER, LOGGER_DEFAULTS } from "../defaultConfigs";
import { persistenceService } from "../services/storage/PersistenceService";
import {
	ConfigDownloads,
	ConfigEventCallback,
	ConfigEventType,
	ConfigManagerConfig,
	ConfigResetEvent,
	ConfigUpdateEvent,
	ConfigValidationFailedEvent,
} from "../types";

const TAG = LOG_TAGS.CONFIG_MANAGER;

// Configuración por defecto
const DEFAULT_CONFIG: ConfigDownloads = {
	logEnabled: true,
	logLevel: LogLevel.INFO,
	download_just_wifi: true,
	max_concurrent_downloads: 3,
	activeProfileRequired: true,
	auto_resume_on_network: true,
	streamQuality: "auto",
	storage_warning_threshold: 0.85, // 85%
	min_free_space_mb: 200,
	retry_attempts: 3,
	retry_delay_ms: 5000,
};

export class ConfigManager {
	private static instance: ConfigManager;
	private eventEmitter: EventEmitter;
	private config: ConfigManagerConfig;
	private currentLogger: Logger;
	private isInitialized: boolean = false;
	private currentDownloadsConfig: ConfigDownloads;
	// REMOVIDO: autoSaveTimer ya que no usamos auto-save periódico
	private pendingSave: boolean = false;
	private saveTimeout: ReturnType<typeof setTimeout> | null = null;
	private readonly DEBOUNCE_DELAY = 500;

	private constructor() {
		// Configuración por defecto del manager
		this.config = DEFAULT_CONFIG_MANAGER;

		// Logger setup
		this.currentLogger = new Logger({
			...LOGGER_DEFAULTS,
			enabled: this.config.logEnabled,
			level: this.config.logLevel,
		});

		this.eventEmitter = new EventEmitter();
		this.currentDownloadsConfig = { ...DEFAULT_CONFIG };
	}

	public static getInstance(): ConfigManager {
		if (!ConfigManager.instance) {
			ConfigManager.instance = new ConfigManager();
		}
		return ConfigManager.instance;
	}

	public async initialize(config?: Partial<ConfigManagerConfig>): Promise<void> {
		if (this.isInitialized) {
			this.currentLogger.warn(TAG, "ConfigManager already initialized");
			return;
		}

		try {
			// Actualizar configuración del manager
			if (config) {
				this.config = { ...this.config, ...config };
				this.currentLogger.updateConfig({
					enabled: this.config.logEnabled,
					level: this.config.logLevel,
				});
			}

			// Cargar configuración persistida usando PersistenceService
			await this.loadPersistedConfig();

			// REMOVIDO: Auto-save ya que persistimos inmediatamente en cada cambio
			// No necesitamos guardar cada 2000ms si ya guardamos cuando hay cambios reales

			this.isInitialized = true;
			this.currentLogger.info(TAG, "ConfigManager initialized successfully");

			// Emitir evento de carga
			this.eventEmitter.emit("config_loaded", {
				config: this.currentDownloadsConfig,
			});
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to initialize ConfigManager", error);
			throw new PlayerError("CONFIG_MANAGER_INITIALIZATION_FAILED", {
				originalError: error,
			});
		}
	}

	/*
	 * Obtiene la configuración actual de descargas
	 *
	 */

	public getConfig(): ConfigDownloads {
		return { ...this.currentDownloadsConfig };
	}

	/*
	 * Actualiza una propiedad específica de configuración
	 *
	 */

	public async updateConfig<K extends keyof ConfigDownloads>(
		property: K,
		value: ConfigDownloads[K]
	): Promise<void> {
		if (!this.isInitialized) {
			throw new PlayerError("CONFIG_MANAGER_NOT_INITIALIZED");
		}

		try {
			// Validar el nuevo valor si está habilitado
			if (this.config.validateOnUpdate) {
				this.validateConfigValue(property, value);
			}

			const oldValue = this.currentDownloadsConfig[property];

			// Solo actualizar si el valor es diferente
			if (JSON.stringify(oldValue) === JSON.stringify(value)) {
				return;
			}

			// Actualizar configuración
			this.currentDownloadsConfig = {
				...this.currentDownloadsConfig,
				[property]: value,
			};

			// Persistir cambios inmediatamente
			await this.persistConfig();

			// Emitir evento de actualización
			const updateEvent: ConfigUpdateEvent = {
				property,
				oldValue,
				newValue: value,
				config: this.currentDownloadsConfig,
			};

			this.eventEmitter.emit("config_updated", updateEvent);

			this.currentLogger.debug(TAG, `Config updated: ${property}`, {
				oldValue,
				newValue: value,
			});
		} catch (error) {
			this.currentLogger.error(TAG, `Failed to update config property: ${property}`, error);
			throw new PlayerError("CONFIG_UPDATE_FAILED", {
				originalError: error,
				property,
				value,
			});
		}
	}

	/*
	 * Actualiza múltiples propiedades de configuración
	 *
	 */

	public async updateMultipleConfig(updates: Partial<ConfigDownloads>): Promise<void> {
		if (!this.isInitialized) {
			throw new PlayerError("CONFIG_MANAGER_NOT_INITIALIZED");
		}

		try {
			const oldConfig = { ...this.currentDownloadsConfig };
			let hasChanges = false;

			// Validar todos los cambios primero
			if (this.config.validateOnUpdate) {
				for (const [property, value] of Object.entries(updates)) {
					this.validateConfigValue(property as keyof ConfigDownloads, value);
				}
			}

			// Aplicar cambios
			const newConfig = { ...this.currentDownloadsConfig };

			for (const [property, value] of Object.entries(updates)) {
				const key = property as keyof ConfigDownloads;
				if (JSON.stringify(newConfig[key]) !== JSON.stringify(value)) {
					(newConfig as any)[key] = value;
					hasChanges = true;
				}
			}

			if (!hasChanges) {
				return;
			}

			// Aplicar la nueva configuración
			this.currentDownloadsConfig = newConfig;

			// Persistir cambios usando PersistenceService optimizado
			await this.persistConfig();

			// Emitir evento de actualización múltiple
			const updateEvent: ConfigUpdateEvent = {
				property: "multiple",
				oldValue: oldConfig,
				newValue: this.currentDownloadsConfig,
				config: this.currentDownloadsConfig,
			};

			this.eventEmitter.emit("config_updated", updateEvent);

			this.currentLogger.debug(TAG, "Multiple config properties updated", {
				updatedProperties: Object.keys(updates),
				oldConfig,
				newConfig: this.currentDownloadsConfig,
			});
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to update multiple config properties", error);
			throw new PlayerError("CONFIG_MULTIPLE_UPDATE_FAILED", {
				originalError: error,
				updates,
			});
		}
	}

	/*
	 * Limpia la configuración persistida (usar con precaución)
	 *
	 */

	public async clearPersistedConfig(): Promise<void> {
		if (!this.isInitialized) {
			throw new PlayerError("CONFIG_MANAGER_NOT_INITIALIZED");
		}

		try {
			// Limpiar configuración persistida
			await persistenceService.clearDownloadsConfig();

			// Resetear a configuración por defecto
			const oldConfig = { ...this.currentDownloadsConfig };
			this.currentDownloadsConfig = { ...DEFAULT_CONFIG };

			// Emitir evento
			this.eventEmitter.emit("config_reset", {
				oldConfig,
				newConfig: this.currentDownloadsConfig,
				reason: "cleared_persistence",
			});

			this.currentLogger.info(TAG, "Persisted configuration cleared and reset to defaults");
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to clear persisted configuration", error);
			throw new PlayerError("CONFIG_RESET_FAILED", {
				originalError: error,
				operation: "clearPersistedConfig",
			});
		}
	}

	/*
	 * Resetea la configuración a valores por defecto
	 *
	 */

	public async resetToDefaults(): Promise<void> {
		if (!this.isInitialized) {
			throw new PlayerError("CONFIG_MANAGER_NOT_INITIALIZED");
		}

		try {
			const oldConfig = { ...this.currentDownloadsConfig };
			this.currentDownloadsConfig = { ...DEFAULT_CONFIG };

			// Persistir cambios
			await this.persistConfig();

			// Emitir evento de reset
			const resetEvent: ConfigResetEvent = {
				oldConfig,
				newConfig: this.currentDownloadsConfig,
			};

			this.eventEmitter.emit("config_reset", resetEvent);

			this.currentLogger.info(TAG, "Configuration reset to defaults");
		} catch (error) {
			this.currentLogger.error(TAG, "Failed to reset configuration", error);
			throw new PlayerError("CONFIG_RESET_FAILED", {
				originalError: error,
			});
		}
	}

	/*
	 * Métodos de conveniencia para propiedades comunes
	 *
	 */

	public async updateStreamQuality(
		quality: "auto" | "low" | "medium" | "high" | "max"
	): Promise<void> {
		await this.updateConfig("streamQuality", quality);
	}

	public async updateNetworkPolicy(wifiOnly: boolean): Promise<void> {
		await this.updateConfig("download_just_wifi", wifiOnly);
	}

	public async updateConcurrentLimit(limit: number): Promise<void> {
		await this.updateConfig("max_concurrent_downloads", limit);
	}

	public async updateAutoResume(enabled: boolean): Promise<void> {
		await this.updateConfig("auto_resume_on_network", enabled);
	}

	public async updateStorageThreshold(threshold: number): Promise<void> {
		await this.updateConfig("storage_warning_threshold", threshold);
	}

	/*
	 * Sistema de eventos
	 *
	 */

	public subscribe(event: ConfigEventType | "all", callback: ConfigEventCallback): () => void {
		if (event === "all") {
			const events: ConfigEventType[] = [
				"config_updated",
				"config_reset",
				"config_loaded",
				"config_validation_failed",
				"config_saved",
			];

			events.forEach(eventType => {
				this.eventEmitter.on(eventType, callback);
			});

			return () => {
				events.forEach(eventType => {
					this.eventEmitter.off(eventType, callback);
				});
			};
		} else {
			this.eventEmitter.on(event, callback);
			return () => this.eventEmitter.off(event, callback);
		}
	}

	/*
	 * Obtiene la configuración por defecto
	 *
	 */

	public static getDefaultConfig(): ConfigDownloads {
		return { ...DEFAULT_CONFIG };
	}

	/*
	 * Validación de valores de configuración
	 *
	 */

	private validateConfigValue<K extends keyof ConfigDownloads>(
		property: K,
		value: ConfigDownloads[K]
	): void {
		try {
			switch (property) {
				case "logEnabled":
				case "download_just_wifi":
				case "activeProfileRequired":
				case "auto_resume_on_network":
					if (typeof value !== "boolean") {
						throw new Error(`${property} must be boolean, got ${typeof value}`);
					}
					break;

				case "logLevel":
					if (!Object.values(LogLevel).includes(value as LogLevel)) {
						throw new Error(`Invalid log level: ${value}`);
					}
					break;

				case "max_concurrent_downloads":
					const concurrent = value as number;
					if (!Number.isInteger(concurrent) || concurrent < 1 || concurrent > 10) {
						throw new Error("max_concurrent_downloads must be integer between 1-10");
					}
					break;

				case "streamQuality":
					const validQualities = ["auto", "low", "medium", "high", "max"];
					if (!validQualities.includes(value as string)) {
						throw new Error(
							`Invalid stream quality: ${value}. Valid values: ${validQualities.join(", ")}`
						);
					}
					break;

				case "storage_warning_threshold":
					const threshold = value as number;
					if (typeof threshold !== "number" || threshold < 0 || threshold > 1) {
						throw new Error("storage_warning_threshold must be number between 0-1");
					}
					break;

				case "min_free_space_mb":
					const space = value as number;
					if (!Number.isInteger(space) || space < 0 || space > 10000) {
						throw new Error("min_free_space_mb must be integer between 0-10000 MB");
					}
					break;

				case "retry_attempts":
					const attempts = value as number;
					if (!Number.isInteger(attempts) || attempts < 0 || attempts > 10) {
						throw new Error("retry_attempts must be integer between 0-10");
					}
					break;

				case "retry_delay_ms":
					const delay = value as number;
					if (!Number.isInteger(delay) || delay < 1000 || delay > 60000) {
						throw new Error("retry_delay_ms must be integer between 1000-60000 ms");
					}
					break;

				default:
					// Para propiedades no validadas, pasar sin validación
					break;
			}
		} catch (error) {
			// Emitir evento de fallo de validación
			const validationEvent: ConfigValidationFailedEvent = {
				property,
				value,
				error: error as Error,
			};

			this.eventEmitter.emit("config_validation_failed", validationEvent);

			throw new PlayerError("CONFIG_VALIDATION_FAILED", {
				property,
				value,
				originalError: error,
			});
		}
	}

	/*
	 * Carga configuración persistida usando PersistenceService
	 *
	 */

	private async loadPersistedConfig(): Promise<void> {
		try {
			const persistedConfig = await this.loadConfigFromPersistence();

			if (persistedConfig) {
				// Combinar con valores por defecto para propiedades faltantes
				this.currentDownloadsConfig = {
					...DEFAULT_CONFIG,
					...persistedConfig,
				};

				this.currentLogger.debug(TAG, "Configuration loaded from persistence", {
					loadedProperties: Object.keys(persistedConfig),
				});
			} else {
				this.currentLogger.debug(TAG, "No persisted configuration found, using defaults");
				this.currentDownloadsConfig = { ...DEFAULT_CONFIG };
			}
		} catch (error) {
			this.currentLogger.warn(
				TAG,
				"Failed to load persisted configuration, using defaults",
				error
			);
			this.currentDownloadsConfig = { ...DEFAULT_CONFIG };
		}
	}

	/*
	 * Carga configuración desde PersistenceService
	 *
	 */

	private async loadConfigFromPersistence(): Promise<ConfigDownloads | null> {
		try {
			const persistedConfig = await persistenceService.loadDownloadsConfig();

			if (persistedConfig) {
				this.currentLogger.debug(TAG, "Configuration loaded from PersistenceService", {
					loadedProperties: Object.keys(persistedConfig),
				});
				return persistedConfig;
			} else {
				this.currentLogger.debug(
					TAG,
					"No persisted configuration found, will use defaults"
				);
				return null;
			}
		} catch (error) {
			this.currentLogger.warn(TAG, "Error loading config from PersistenceService", error);
			return null;
		}
	}

	/*
	 * Guarda configuración en PersistenceService
	 *
	 */

	private async saveConfigToPersistence(): Promise<void> {
		try {
			await persistenceService.saveDownloadsConfig(this.currentDownloadsConfig);

			this.currentLogger.debug(TAG, "Configuration saved to PersistenceService successfully");
		} catch (error) {
			this.currentLogger.error(TAG, "Error saving config to PersistenceService", error);
			throw error;
		}
	}

	/*
	 * Persiste configuración usando PersistenceService
	 *
	 */

	private async persistConfig(): Promise<void> {
		if (this.pendingSave) {
			return;
		}

		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}

		this.saveTimeout = setTimeout(async () => {
			try {
				await this.saveConfigToPersistence();
				this.pendingSave = false;
				this.saveTimeout = null;
				this.currentLogger.debug(TAG, "Configuration persisted successfully (debounced)");
			} catch (error) {
				this.pendingSave = false;
				this.saveTimeout = null;
				this.currentLogger.error(TAG, "Failed to persist configuration", error);
				throw new PlayerError("CONFIG_SAVE_FAILED", {
					originalError: error,
				});
			}
		}, this.DEBOUNCE_DELAY);
	}

	// REMOVIDO: setupAutoSave() ya que no usamos auto-save periódico

	public destroy(): void {
		// Limpiar debounce timer
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}

		// Persistir cambios pendientes antes del destroy
		if (this.pendingSave) {
			this.saveConfigToPersistence().catch(error => {
				this.currentLogger.warn(TAG, "Failed to save pending config during destroy", error);
			});
		}

		// Remover listeners
		this.eventEmitter.removeAllListeners();

		// Reset estado
		this.isInitialized = false;
		this.pendingSave = false;
		this.currentDownloadsConfig = { ...DEFAULT_CONFIG };

		this.currentLogger.info(TAG, "ConfigManager destroyed");
	}
}

// Export singleton instance
export const configManager = ConfigManager.getInstance();
