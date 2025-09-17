/*
 * Servicio singleton para contexto de perfil en el módulo de descargas
 * NO gestiona perfiles, solo mantiene el contexto del perfil activo
 * 
 */

import { EventEmitter } from 'eventemitter3';
import { PlayerError } from '../../../core/errors';
import { Logger, LogLevel } from '../../logger';

import {
    ProfileContext,
    ProfileEventType,
    ProfileManagerConfig,
    ProfileStatusCallback,
} from '../types';

import { LOG_TAGS } from "../constants";

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

        this.config = {
            logEnabled: true,
            logLevel: LogLevel.DEBUG,
            enableProfileFiltering: true,
        };

        this.currentLogger = new Logger({
            enabled: this.config.logEnabled,
            level: this.config.logLevel,
            prefix: LOG_TAGS.MAIN,
            useColors: true,
            includeLevelName: false,
            includeTimestamp: true,
            includeInstanceId: true,
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
            this.currentLogger.info(TAG, 'ProfileManager already initialized');
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
            this.currentLogger.info(TAG, 'Profile context manager initialized');

        } catch (error) {
            throw new PlayerError('DOWNLOAD_PROFILE_MANAGER_INITIALIZATION_FAILED', { 
                originalError: error
            });
        }
    }

    /*
     * Establece el perfil activo (llamado desde la aplicación principal)
     *
     */

    public setActiveProfile(profile: ProfileContext | null): void {
        if (!this.isInitialized) {
            throw new PlayerError('DOWNLOAD_PROFILE_MANAGER_NOT_INITIALIZED');
        }

        const previousProfile = this.currentProfile;
        this.currentProfile = profile;

        // Emitir eventos
        if (previousProfile && previousProfile.id !== profile?.id) {
            this.eventEmitter.emit(ProfileEventType.PROFILE_CHANGED, {
                previous: previousProfile,
                current: profile
            });
        }

        if (profile) {
            this.currentLogger.info(TAG, `Active profile set: ${profile.id} - ${profile.name}`);
        } else {
            this.currentLogger.info(TAG, 'No active profile (guest mode)');
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
     *
     */

    public shouldShowContent(contentProfileId?: string | null): boolean {
        if (!this.config.enableProfileFiltering) {
            return true; // Si el filtrado está deshabilitado, mostrar todo
        }

        const activeProfileId = this.getActiveProfileId();
        
        // Si no hay perfil activo, solo mostrar contenido sin perfil asignado
        if (!activeProfileId) {
            return !contentProfileId;
        }

        // Si hay perfil activo, mostrar solo contenido de ese perfil o contenido sin perfil
        return !contentProfileId || contentProfileId === activeProfileId;
    }

    /*
     * Filtra una lista de elementos por perfil activo
     *
     */

    public filterByActiveProfile<T extends { profileId?: string | null }>(items: T[]): T[] {
        if (!this.config.enableProfileFiltering) {
            return items; // Si el filtrado está deshabilitado, devolver todo
        }

        return items.filter(item => this.shouldShowContent(item.profileId));
    }

    /*
     * Suscribe a cambios de perfil
     *
     */

    public subscribe(event: ProfileEventType, callback: ProfileStatusCallback): () => void {
        this.eventEmitter.on(event, callback);
        return () => this.eventEmitter.off(event, callback);
    }

    /*
     * Habilita o deshabilita el filtrado por perfil
     *
     */

    public setProfileFiltering(enabled: boolean): void {
        this.config.enableProfileFiltering = enabled;
        
        if (enabled) {
            this.currentLogger.info(TAG, 'Profile filtering enabled');
        } else {
            this.currentLogger.info(TAG, 'Profile filtering disabled - showing all content');
        }

        // Emitir evento de cambio de filtrado
        this.eventEmitter.emit(ProfileEventType.FILTERING_CHANGED, { enabled });
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
        this.currentLogger.info(TAG, 'ProfileManager destroyed');
    }
}

// Exportar instancia singleton
export const profileManager = ProfileManager.getInstance();