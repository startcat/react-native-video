import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventEmitter } from 'eventemitter3';
import { PlayerError } from '../../../../core/errors';
import { Logger, LogLevel } from '../../../logger';

import {
    BackupData,
    DownloadItem,
    DownloadStates,
    PersistedData,
    PersistenceConfig,
    PersistenceEventType,
    ProfileDownloadMapping
} from '../../types';

import {
    DEFAULT_CONFIG,
    LOG_TAGS,
} from '../../constants';

const TAG = LOG_TAGS.PERSISTENCE;

/*
 * Servicio singleton para gestión de persistencia
 *
 */

export class PersistenceService {
    
    private static instance: PersistenceService;
    private eventEmitter: EventEmitter;
    private config: Required<PersistenceConfig>;
    private currentLogger: Logger;
    private autoSaveInterval: ReturnType<typeof setTimeout> | null = null;
    private isDirty: boolean = false;
    private isSaving: boolean = false;
    private lastSaveTime: number = 0;
    private dataVersion: number = 1; // Versión actual del esquema de datos

    // Keys de AsyncStorage
    private readonly KEYS = {
        DOWNLOADS: '@downloads_state_v1',
        BACKUP: '@downloads_backup_v1',
        PROFILES: '@downloads_profiles_v1',
        METRICS: '@downloads_metrics_v1',
        CONFIG: '@downloads_config_v1',
        VERSION: '@downloads_version',
    };

    private constructor() {
        this.eventEmitter = new EventEmitter();

        this.config = {
            storageKey: DEFAULT_CONFIG.STORAGE_KEY,
            encryptionEnabled: false,
            compressionEnabled: true,
            autoSave: true,
            autoSaveInterval: DEFAULT_CONFIG.AUTO_SAVE_INTERVAL_MS,
        };

        this.currentLogger = new Logger({
            enabled: true,
            level: LogLevel.DEBUG,
            prefix: `📁 Persistence`,
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
    
    public static getInstance(): PersistenceService {
        if (!PersistenceService.instance) {
            PersistenceService.instance = new PersistenceService();
        }
        return PersistenceService.instance;
    }

    /*
     * Inicializa el servicio de persistencia
     *
     */

    public async initialize(config?: Partial<PersistenceConfig>): Promise<void> {
        // Actualizar configuración
        this.config = { ...this.config, ...config };

        this.currentLogger.info(TAG, 'Initializing PersistenceService', {
            encryptionEnabled: this.config.encryptionEnabled,
            compressionEnabled: this.config.compressionEnabled,
            autoSave: this.config.autoSave,
        });

        try {
            // Verificar versión de datos
            await this.checkDataVersion();

            // Iniciar auto-guardado si está habilitado
            if (this.config.autoSave) {
                this.startAutoSave();
            }

            this.currentLogger.info(TAG, 'PersistenceService initialized successfully');

        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to initialize PersistenceService', error);
            throw new PlayerError('STORAGE_ASYNC_001', {
                originalError: error,
                context: { service: 'PersistenceService' },
            });
        }
    }

    /*
     * Guarda el estado completo de las descargas
     *
     */

    public async saveDownloadState(downloads: Map<string, DownloadItem>): Promise<void> {
        if (this.isSaving) {
            this.currentLogger.debug(TAG, 'Save already in progress, skipping');
            return;
        }

        this.isSaving = true;
        this.eventEmitter.emit(PersistenceEventType.SAVE_STARTED);

        try {
            const data: PersistedData = {
                version: this.dataVersion,
                downloads: Array.from(downloads.entries()),
                queue: [], // Se actualizará desde QueueManager
                profileMappings: [], // Se actualizará desde ProfileManager
                config: {}, // Se actualizará desde el store
                metrics: {}, // Se actualizará desde el store
                timestamp: Date.now(),
            };

            // Generar checksum si está habilitado
            if (this.config.encryptionEnabled) {
                data.checksum = this.generateChecksum(data);
            }

            // Comprimir datos si está habilitado
            const serializedData = this.config.compressionEnabled 
                ? await this.compressData(data)
                : JSON.stringify(data);

            // Guardar en AsyncStorage
            await AsyncStorage.setItem(this.KEYS.DOWNLOADS, serializedData);

            // Crear backup
            await this.createBackup(data);

            this.lastSaveTime = Date.now();
            this.isDirty = false;

            this.currentLogger.debug(TAG, `Saved ${downloads.size} downloads`);
            this.eventEmitter.emit(PersistenceEventType.SAVE_COMPLETED, {
                itemCount: downloads.size,
                dataSize: serializedData.length,
            });

        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to save download state', error);
            this.eventEmitter.emit(PersistenceEventType.SAVE_FAILED, error);

            throw new PlayerError('STORAGE_ASYNC_002', {
                originalError: error,
                context: { 
                    downloadsCount: downloads.size,
                    service: 'PersistenceService',
                },
            });
            
        } finally {
            this.isSaving = false;
        }
    }

    /*
     * Carga el estado de las descargas
     *
     */

    public async loadDownloadState(): Promise<Map<string, DownloadItem>> {
        this.eventEmitter.emit(PersistenceEventType.LOAD_STARTED);

        try {
            const serializedData = await AsyncStorage.getItem(this.KEYS.DOWNLOADS);
            
            if (!serializedData) {
                this.currentLogger.info(TAG, 'No persisted data found');
                return new Map();
            }

            // Descomprimir si es necesario
            const data: PersistedData = this.config.compressionEnabled
                ? await this.decompressData(serializedData)
                : JSON.parse(serializedData);

            // Verificar checksum si está habilitado
            if (this.config.encryptionEnabled && data.checksum) {
                const isValid = this.verifyChecksum(data);
                if (!isValid) {
                    throw new Error('Data integrity check failed');
                }
            }

            // Migrar datos si es necesario
            const migratedData = await this.migrateDataIfNeeded(data);

            // Convertir array a Map
            const downloads = new Map<string, DownloadItem>(migratedData.downloads);

            this.currentLogger.info(TAG, `Loaded ${downloads.size} downloads`);
            this.eventEmitter.emit(PersistenceEventType.LOAD_COMPLETED, {
                itemCount: downloads.size,
            });

            return downloads;

        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to load download state', error);
            this.eventEmitter.emit(PersistenceEventType.LOAD_FAILED, error);

            // Intentar cargar desde backup
            return await this.loadFromBackup();
        }
    }

    /*
     * Actualiza un elemento de descarga específico
     *
     */

    public async updateDownloadItem(id: string, updates: Partial<DownloadItem>): Promise<void> {
        try {
            // Cargar estado actual
            const downloads = await this.loadDownloadState();
            
            const existing = downloads.get(id);

            if (!existing) {
                throw new Error(`Download item not found: ${id}`);
            }

            // Actualizar item
            const updated: DownloadItem = {
                ...existing,
                ...updates,
                offlineData: {
                    ...existing.offlineData,
                    ...(updates.offlineData || {}),
                },
            };

            downloads.set(id, updated);

            // Guardar estado actualizado
            await this.saveDownloadState(downloads);
            
            this.currentLogger.debug(TAG, `Updated download item: ${id}`);

        } catch (error) {
            this.currentLogger.error(TAG, `Failed to update download item: ${id}`, error);
            throw new PlayerError('STORAGE_ASYNC_002', {
                originalError: error,
                context: { downloadId: id },
            });
        }
    }

    /*
     * Elimina un elemento de descarga
     *
     */

    public async removeDownloadItem(id: string): Promise<void> {
        try {
            // Cargar estado actual
            const downloads = await this.loadDownloadState();
            
            if (!downloads.has(id)) {
                this.currentLogger.warn(TAG, `Download item not found: ${id}`);
                return;
            }

            // Eliminar item
            downloads.delete(id);

            // Guardar estado actualizado
            await this.saveDownloadState(downloads);
            
            this.currentLogger.debug(TAG, `Removed download item: ${id}`);

        } catch (error) {
            this.currentLogger.error(TAG, `Failed to remove download item: ${id}`, error);
            throw new PlayerError('STORAGE_ASYNC_004', {
                originalError: error,
                context: { downloadId: id },
            });
        }
    }

    /*
     * Guarda los mappings de perfiles
     *
     */

    public async saveProfileMappings(mappings: ProfileDownloadMapping[]): Promise<void> {
        try {
            const data = JSON.stringify({
                version: this.dataVersion,
                mappings,
                timestamp: Date.now(),
            });

            await AsyncStorage.setItem(this.KEYS.PROFILES, data);
            
            this.currentLogger.debug(TAG, `Saved ${mappings.length} profile mappings`);

        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to save profile mappings', error);
            throw new PlayerError('STORAGE_ASYNC_002', {
                originalError: error,
                context: { mappingsCount: mappings.length },
            });
        }
    }

    /*
     * Carga los mappings de perfiles
     *
     */
    
    public async loadProfileMappings(): Promise<ProfileDownloadMapping[]> {
        try {
            const data = await AsyncStorage.getItem(this.KEYS.PROFILES);
            
            if (!data) {
                return [];
            }

            const parsed = JSON.parse(data);
            return parsed.mappings || [];

        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to load profile mappings', error);
            return [];
        }
    }

    /*
     * Guarda métricas de descarga
     *
     */
    
    public async saveMetrics(metrics: any): Promise<void> {
        try {
            await AsyncStorage.setItem(this.KEYS.METRICS, JSON.stringify({
                ...metrics,
                lastUpdated: Date.now(),
            }));
            
            this.currentLogger.debug(TAG, 'Metrics saved');

        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to save metrics', error);
            // No lanzar error, las métricas no son críticas
        }
    }

    /*
     * Carga métricas de descarga
     *
     */

    public async loadMetrics(): Promise<any> {
        try {
            const data = await AsyncStorage.getItem(this.KEYS.METRICS);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to load metrics', error);
            // No lanzar error, las métricas no son críticas
            return {};
        }
    }

    /*
     * Guarda configuración
     *
     */

    public async saveConfig(config: any): Promise<void> {
        try {
            await AsyncStorage.setItem(this.KEYS.CONFIG, JSON.stringify(config));
            this.currentLogger.debug(TAG, 'Config saved');
        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to save config', error);
            throw new PlayerError('STORAGE_ASYNC_002', {
                originalError: error,
                context: { service: 'PersistenceService' },
            });
        }
    }

    /*
     * Carga configuración
     *
     */
    
    public async loadConfig(): Promise<any> {
        try {
            const data = await AsyncStorage.getItem(this.KEYS.CONFIG);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to load config', error);
            return {};
        }
    }

    /*
     * Limpia todos los datos persistidos
     *
     */

    public async clearAll(): Promise<void> {
        try {
            const keys = Object.values(this.KEYS);
            await AsyncStorage.multiRemove(keys);
            
            this.currentLogger.info(TAG, 'All persisted data cleared');
            
            // Resetear estado interno
            this.isDirty = false;
            this.lastSaveTime = 0;

        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to clear persisted data', error);
            throw new PlayerError('STORAGE_ASYNC_004', {
                originalError: error,
                context: { service: 'PersistenceService' },
            });
        }
    }

    /*
     * Exporta todos los datos para backup
     *
     */

    public async exportData(): Promise<string> {
        try {
            const downloads = await this.loadDownloadState();
            const profiles = await this.loadProfileMappings();
            const metrics = await this.loadMetrics();
            const config = await this.loadConfig();

            const exportData = {
                version: this.dataVersion,
                exportDate: Date.now(),
                downloads: Array.from(downloads.entries()),
                profiles,
                metrics,
                config,
            };

            const compressed = this.config.compressionEnabled
                ? await this.compressData(exportData)
                : JSON.stringify(exportData, null, 2);

            this.currentLogger.info(TAG, 'Data exported successfully');
            return compressed;

        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to export data', error);
            throw new PlayerError('STORAGE_ASYNC_003', {
                originalError: error,
                context: { service: 'PersistenceService' },
            });
        }
    }

    /*
     * Importa datos desde un backup
     *
     */

    public async importData(data: string): Promise<void> {
        this.eventEmitter.emit(PersistenceEventType.RESTORE_STARTED);

        try {
            const importData = this.config.compressionEnabled
                ? await this.decompressData(data)
                : JSON.parse(data);

            // Validar versión
            if (importData.version > this.dataVersion) {
                throw new Error(`Unsupported data version: ${importData.version}`);
            }

            // Migrar si es necesario
            const migratedData = await this.migrateDataIfNeeded(importData);

            // Restaurar datos
            const downloads = new Map<string, DownloadItem>(migratedData.downloads as Array<[string, DownloadItem]>);
            await this.saveDownloadState(downloads);

            if (migratedData.profiles) {
                await this.saveProfileMappings(migratedData.profiles);
            }

            if (migratedData.metrics) {
                await this.saveMetrics(migratedData.metrics);
            }

            if (migratedData.config) {
                await this.saveConfig(migratedData.config);
            }

            this.currentLogger.info(TAG, 'Data imported successfully');
            this.eventEmitter.emit(PersistenceEventType.RESTORE_COMPLETED, {
                itemCount: downloads.size,
            });

        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to import data', error);
            this.eventEmitter.emit(PersistenceEventType.RESTORE_FAILED, error);
            
            throw new PlayerError('STORAGE_ASYNC_003', {
                originalError: error,
                context: { service: 'PersistenceService' },
            });
        }
    }

    /*
     * Marca los datos como modificados (necesitan guardarse)
     *
     */
    
    public markAsDirty(): void {
        this.isDirty = true;
    }

    /*
     * Verifica la versión de los datos y migra si es necesario
     *
     */
    
    private async checkDataVersion(): Promise<void> {
        try {
            const versionStr = await AsyncStorage.getItem(this.KEYS.VERSION);
            const currentVersion = versionStr ? parseInt(versionStr, 10) : 0;

            if (currentVersion < this.dataVersion) {
                this.currentLogger.info(TAG, `Data version mismatch. Current: ${currentVersion}, Expected: ${this.dataVersion}`);
                // La migración se hará al cargar los datos
            }

            // Guardar versión actual
            await AsyncStorage.setItem(this.KEYS.VERSION, this.dataVersion.toString());

        } catch (error) {
            this.currentLogger.warn(TAG, 'Failed to check data version', error);
        }
    }

    /*
     * Migra datos si es necesario
     *
     */

    private async migrateDataIfNeeded(data: any): Promise<any> {
        if (data.version === this.dataVersion) {
            return data;
        }

        this.eventEmitter.emit(PersistenceEventType.MIGRATION_STARTED, {
            fromVersion: data.version,
            toVersion: this.dataVersion,
        });

        let migratedData = { ...data };

        try {
            // Aplicar migraciones secuencialmente
            if (data.version < 1) {
                // Migración de versión 0 a 1
                migratedData = this.migrateV0ToV1(migratedData);
            }

            // Futuras migraciones...
            // if (data.version < 2) {
            //     migratedData = this.migrateV1ToV2(migratedData);
            // }

            migratedData.version = this.dataVersion;

            this.eventEmitter.emit(PersistenceEventType.MIGRATION_COMPLETED);
            this.currentLogger.info(TAG, `Data migrated from v${data.version} to v${this.dataVersion}`);

            return migratedData;

        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to migrate data', error);
            throw error;
        }
    }

    /*
     * Migración de v0 a v1
     *
     */
    
    private migrateV0ToV1(data: any): any {
        // Implementar lógica de migración específica
        // Por ejemplo, añadir campos nuevos con valores por defecto
        
        if (data.downloads && Array.isArray(data.downloads)) {
            data.downloads = data.downloads.map(([id, item]: [string, any]) => {
                // Asegurar que todos los campos necesarios existen
                if (!item.offlineData.session_ids) {
                    item.offlineData.session_ids = [];
                }
                if (!item.offlineData.state) {
                    item.offlineData.state = DownloadStates.NOT_DOWNLOADED;
                }
                return [id, item];
            });
        }

        return data;
    }

    /*
     * Crea un backup de los datos
     *
     */

    private async createBackup(data: PersistedData): Promise<void> {
        try {
            const backupData: BackupData = {
                primary: data,
                backup: null,
                lastBackupTime: Date.now(),
            };

            // Obtener backup anterior si existe
            const existingBackup = await AsyncStorage.getItem(this.KEYS.BACKUP);
            if (existingBackup) {
                const parsed = JSON.parse(existingBackup);
                backupData.backup = parsed.primary; // El primary anterior se vuelve el backup
            }

            await AsyncStorage.setItem(this.KEYS.BACKUP, JSON.stringify(backupData));
            this.currentLogger.debug(TAG, 'Backup created');

        } catch (error) {
            this.currentLogger.warn(TAG, 'Failed to create backup', error);
            // No lanzar error, el backup no es crítico
        }
    }

    /*
     * Carga datos desde el backup
     *
     */

    private async loadFromBackup(): Promise<Map<string, DownloadItem>> {
        try {
            const backupStr = await AsyncStorage.getItem(this.KEYS.BACKUP);
            
            if (!backupStr) {
                this.currentLogger.warn(TAG, 'No backup found');
                return new Map();
            }

            const backupData: BackupData = JSON.parse(backupStr);
            const dataToRestore = backupData.primary || backupData.backup;

            if (!dataToRestore) {
                return new Map();
            }

            this.currentLogger.info(TAG, 'Loading from backup', {
                backupTime: new Date(backupData.lastBackupTime).toISOString(),
            });

            this.eventEmitter.emit(PersistenceEventType.DATA_CORRUPTED, {
                restoredFromBackup: true,
            });

            return new Map(dataToRestore.downloads);

        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to load from backup', error);
            return new Map();
        }
    }

    /*
     * Comprime datos (simulado, en React Native usar una librería como lz-string)
     *
     */
    
    private async compressData(data: any): Promise<string> {
        // En producción, usar una librería de compresión como lz-string
        // import LZString from 'lz-string';
        // return LZString.compressToUTF16(JSON.stringify(data));
        
        // Por ahora, solo stringificar
        return JSON.stringify(data);
    }

    /*
     * Descomprime datos
     *
     */

    private async decompressData(data: string): Promise<any> {
        // En producción, usar una librería de compresión
        // import LZString from 'lz-string';
        // const decompressed = LZString.decompressFromUTF16(data);
        // return JSON.parse(decompressed);
        
        // Por ahora, solo parsear
        return JSON.parse(data);
    }

    /*
     * Genera checksum para verificación de integridad
     *
     */

    private generateChecksum(data: any): string {
        // En producción, usar una función hash como SHA256
        // Por ahora, usar un checksum simple
        const str = JSON.stringify(data);
        let hash = 0;
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        return Math.abs(hash).toString(16);
    }

    /*
     * Verifica el checksum de los datos
     *
     */
    
    private verifyChecksum(data: PersistedData): boolean {
        if (!data.checksum) return true;

        const originalChecksum = data.checksum;
        const dataWithoutChecksum = { ...data };
        delete dataWithoutChecksum.checksum;

        const calculatedChecksum = this.generateChecksum(dataWithoutChecksum);
        
        return originalChecksum === calculatedChecksum;
    }

    /*
     * Inicia el auto-guardado
     *
     */
    
    private startAutoSave(): void {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }

        this.autoSaveInterval = setInterval(async () => {
            if (this.isDirty && !this.isSaving) {
                this.currentLogger.debug(TAG, 'Auto-save triggered');
                
                try {
                    // El auto-save debería ser llamado desde el store manager
                    // que tiene acceso al estado actual
                    this.eventEmitter.emit(PersistenceEventType.AUTO_SAVE);
                } catch (error) {
                    this.currentLogger.error(TAG, 'Auto-save failed', error);
                }
            }
        }, this.config.autoSaveInterval);

        this.currentLogger.info(TAG, `Auto-save enabled (every ${this.config.autoSaveInterval}ms)`);
    }

    /*
     * Detiene el auto-guardado
     *
     */
    
    private stopAutoSave(): void {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }

    /*
     * Obtiene estadísticas de persistencia
     *
     */

    public async getStats(): Promise<{
        totalItems: number;
        dataSize: number;
        lastSaveTime: number;
        hasBackup: boolean;
        isDirty: boolean;
    }> {
        try {
            const downloads = await AsyncStorage.getItem(this.KEYS.DOWNLOADS);
            const backup = await AsyncStorage.getItem(this.KEYS.BACKUP);

            return {
                totalItems: downloads ? JSON.parse(downloads).downloads?.length || 0 : 0,
                dataSize: downloads ? downloads.length : 0,
                lastSaveTime: this.lastSaveTime,
                hasBackup: !!backup,
                isDirty: this.isDirty,
            };
        } catch (error) {
            return {
                totalItems: 0,
                dataSize: 0,
                lastSaveTime: 0,
                hasBackup: false,
                isDirty: false,
            };
        }
    }

    /*
     * Suscribe a eventos del servicio
     *
     */
    
    public subscribe(event: PersistenceEventType | 'all', callback: (data: any) => void): () => void {
        if (event === 'all') {
            Object.values(PersistenceEventType).forEach((eventType) => {
                this.eventEmitter.on(eventType, callback);
            });

            return () => {
                Object.values(PersistenceEventType).forEach((eventType) => {
                    this.eventEmitter.off(eventType, callback);
                });
            };
        } else {
            this.eventEmitter.on(event, callback);
            return () => this.eventEmitter.off(event, callback);
        }
    }

    /*
     * Limpia recursos al destruir
     *
     */

    public destroy(): void {
        this.stopAutoSave();
        this.eventEmitter.removeAllListeners();
        this.currentLogger.info(TAG, 'PersistenceService destroyed');
    }
}

// Exportar instancia singleton
export const persistenceService = PersistenceService.getInstance();