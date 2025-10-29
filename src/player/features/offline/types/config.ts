import { LogLevel } from "../../logger";

export interface ConfigDownloads {
	logEnabled: boolean;
	logLevel: LogLevel;
	download_just_wifi?: boolean;
	max_concurrent_downloads?: number;
	activeProfileRequired: boolean; // Si es true, se requiere un perfil activo para poder descargar
	auto_resume_on_network?: boolean;
	streamQuality?: "auto" | "low" | "medium" | "high" | "max";
	storage_warning_threshold?: number; // 0-1 percentage
	min_free_space_mb?: number;
	retry_attempts?: number;
	retry_delay_ms?: number;
}

// Interfaz de configuración del servicio
export interface ConfigManagerConfig {
	logEnabled: boolean;
	logLevel: LogLevel;
	validateOnUpdate?: boolean;
}

// Eventos de configuración
export interface ConfigUpdateEvent {
	property: keyof ConfigDownloads | "multiple";
	oldValue: any;
	newValue: any;
	config: ConfigDownloads;
}

export interface ConfigResetEvent {
	oldConfig: ConfigDownloads;
	newConfig: ConfigDownloads;
}

export interface ConfigValidationFailedEvent {
	property: keyof ConfigDownloads;
	value: any;
	error: Error;
}

// Tipos de eventos
export type ConfigEventType =
	| "config_updated"
	| "config_reset"
	| "config_loaded"
	| "config_validation_failed"
	| "config_saved";

export type ConfigEventCallback = (data: any) => void;
