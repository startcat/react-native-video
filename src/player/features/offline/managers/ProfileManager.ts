/*
 * Servicio singleton para contexto de perfil en el módulo de descargas
 * NO gestiona perfiles, solo mantiene el contexto del perfil activo
 *
 */

import { EventEmitter } from "eventemitter3";
import { PlayerError } from "../../../core/errors";
import { Logger } from "../../logger";
import { LOG_TAGS } from "../constants";
import { DEFAULT_CONFIG_PROFILE, LOGGER_DEFAULTS } from "../defaultConfigs";
import { DownloadItem, ProfileContext, ProfileEventType, ProfileManagerConfig } from "../types";

const TAG = LOG_TAGS.PROFILE_MANAGER;

export class ProfileManager {
	private static instance: ProfileManager;
	private eventEmitter: EventEmitter;
	private currentProfile: ProfileContext | null = null;
	private isInitialized: boolean = false;
	private config: ProfileManagerConfig;
	private currentLogger: Logger;

	private constructor() {
		this.eventEmitter = new EventEmitter();

		this.config = DEFAULT_CONFIG_PROFILE;

		this.currentLogger = new Logger({
			...LOGGER_DEFAULTS,
			enabled: this.config.logEnabled,
			level: this.config.logLevel,
		});
	}

	/*
	 * Obtiene la instancia singleton del servicio
	 *
	 */

	public static getInstance(): ProfileManager {
		if (!ProfileManager.instance) {
			ProfileManager.instance = new ProfileManager();
		}
		return ProfileManager.instance;
	}

	/*
	 * Inicializa el servicio de contexto de perfil
	 *
	 */

	public async initialize(config?: Partial<ProfileManagerConfig>): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		// Actualizar configuración
		this.config = { ...this.config, ...config };

		this.currentLogger.updateConfig({
			enabled: this.config.logEnabled,
			level: this.config.logLevel,
		});

		try {
			this.isInitialized = true;
			this.currentLogger.info(TAG, "Profile context manager initialized");
		} catch (error) {
			throw new PlayerError("DOWNLOAD_PROFILE_MANAGER_INITIALIZATION_FAILED", {
				originalError: error,
			});
		}
	}

	/*
	 * Establece el perfil activo (llamado desde la aplicación principal)
	 *
	 */

	public setActiveProfile(profile: ProfileContext | null): void {
		if (!this.isInitialized) {
			throw new PlayerError("DOWNLOAD_PROFILE_MANAGER_NOT_INITIALIZED");
		}

		const previousProfile = this.currentProfile;
		this.currentProfile = profile;

		// Emitir eventos
		if (previousProfile && previousProfile.id !== profile?.id) {
			this.eventEmitter.emit(ProfileEventType.PROFILE_CHANGED, {
				previous: previousProfile,
				current: profile,
			});
		}

		if (profile) {
			this.currentLogger.info(TAG, `Active profile set: ${profile.id} - ${profile.name}`);
		} else {
			this.currentLogger.info(TAG, "No active profile (guest mode)");
		}
	}

	/*
	 * Obtiene el perfil actualmente activo
	 *
	 */

	public getActiveProfile(): ProfileContext | null {
		return this.currentProfile ? { ...this.currentProfile } : null;
	}

	/*
	 * Verifica si hay un perfil activo
	 *
	 */

	public hasActiveProfile(): boolean {
		return this.currentProfile !== null;
	}

	/*
	 * Obtiene el ID del perfil activo (null si no hay perfil)
	 *
	 */

	public getActiveProfileId(): string | null {
		return this.currentProfile?.id || null;
	}

	/*
	 * Verifica si el perfil activo es un perfil infantil
	 *
	 */

	public isChildProfile(): boolean {
		return this.currentProfile?.isChild || false;
	}

	/*
	 * Verifica si un contenido debe mostrarse para el perfil activo
	 * Sigue las reglas del contexto: Array vacío = disponible para todos
	 *
	 */

	public shouldShowContent(downloadItem: DownloadItem): boolean {
		if (!this.config.enableProfileFiltering) {
			return true; // Si el filtrado está deshabilitado, mostrar todo
		}

		const activeProfileId = this.getActiveProfileId();

		// Si array vacío = disponible para todos los perfiles
		if (downloadItem.profileIds.length === 0) {
			return true;
		}

		// Si no hay perfil activo, no mostrar contenido restringido
		if (!activeProfileId) {
			return false;
		}

		// Mostrar solo si el perfil activo está en la lista
		return downloadItem.profileIds.includes(activeProfileId);
	}

	/*
	 * Verifica si se puede realizar una descarga según las reglas de perfil
	 *
	 */

	public canDownload(): boolean {
		if (!this.isInitialized) {
			throw new PlayerError("DOWNLOAD_PROFILE_MANAGER_NOT_INITIALIZED");
		}

		// Si se requiere perfil activo pero no hay ninguno
		if (this.config.activeProfileRequired && !this.hasActiveProfile()) {
			return false;
		}

		// Si hay perfil activo, permitir descarga solo si el contenido pertenece al perfil activo
		return true;
	}

	/*
	 * Verifica si se puede descargar un contenido específico
	 *
	 */

	public canDownloadContent(downloadItem: DownloadItem): boolean {
		if (!this.canDownload()) {
			return false;
		}

		// Aplicar filtrado de contenido si está habilitado
		return this.shouldShowContent(downloadItem);
	}

	/*
	 * Filtra una lista de descargas por perfil activo
	 *
	 */

	public filterByActiveProfile(items: DownloadItem[]): DownloadItem[] {
		if (!this.config.enableProfileFiltering) {
			return items; // Si el filtrado está deshabilitado, devolver todo
		}

		return items.filter(item => this.shouldShowContent(item));
	}

	/*
	 * Suscribe a cambios de perfil
	 *
	 */

	public subscribe(event: ProfileEventType | "all", callback: (data: any) => void): () => void {
		if (event === "all") {
			Object.values(ProfileEventType).forEach(eventType => {
				this.eventEmitter.on(eventType, callback);
			});

			return () => {
				Object.values(ProfileEventType).forEach(eventType => {
					this.eventEmitter.off(eventType, callback);
				});
			};
		} else {
			this.eventEmitter.on(event, callback);
			return () => this.eventEmitter.off(event, callback);
		}
	}

	/*
	 * Habilita o deshabilita el filtrado por perfil
	 *
	 */

	public setProfileFiltering(enabled: boolean): void {
		this.config.enableProfileFiltering = enabled;

		if (enabled) {
			this.currentLogger.info(TAG, "Profile filtering enabled");
		} else {
			this.currentLogger.info(TAG, "Profile filtering disabled - showing all content");
		}

		// Emitir evento de cambio de filtrado
		this.eventEmitter.emit(ProfileEventType.FILTERING_CHANGED, { enabled });
	}

	/*
	 * Habilita o deshabilita la requerimiento de perfil activo para descargar
	 *
	 */

	public setActiveProfileRequired(required: boolean): void {
		this.config.activeProfileRequired = required;

		if (required) {
			this.currentLogger.info(TAG, "Active profile now required for downloads");
		} else {
			this.currentLogger.info(TAG, "Active profile no longer required for downloads");
		}

		// Emitir evento de cambio de configuración
		this.eventEmitter.emit(ProfileEventType.CONFIG_CHANGED, {
			activeProfileRequired: required,
		});
	}

	/*
	 * Obtiene estadísticas del contexto actual
	 *
	 */

	public getContextStats() {
		return {
			hasActiveProfile: this.hasActiveProfile(),
			activeProfileId: this.getActiveProfileId(),
			activeProfileName: this.currentProfile?.name || null,
			isChildProfile: this.isChildProfile(),
			filteringEnabled: this.config.enableProfileFiltering,
			activeProfileRequired: this.config.activeProfileRequired,
		};
	}

	/*
	 * Limpia recursos al destruir
	 *
	 */

	public destroy(): void {
		this.eventEmitter.removeAllListeners();
		this.currentProfile = null;
		this.isInitialized = false;
		this.currentLogger.info(TAG, "ProfileManager destroyed");
	}
}

// Exportar instancia singleton
export const profileManager = ProfileManager.getInstance();
