import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventEmitter } from 'eventemitter3';
import { PlayerError } from '../../../../core/errors';
import { Logger } from '../../../logger';
import { LOG_TAGS } from '../../constants';
import { DEFAULT_CONFIG_PERSISTENCE, LOGGER_DEFAULTS } from '../../defaultConfigs';
import {
    BackupData,
    ConfigDownloads,
    DownloadItem,
    DownloadStates,
    DownloadType,
    PersistedData,
    PersistenceConfig,
    PersistenceEventType,
    ProfileDownloadMapping
} from '../../types';

const TAG = LOG_TAGS.PERSISTENCE;

/*
 * Servicio singleton para gestión de persistencia
 *
 */

export class PersistenceService {
    
    private static instance: PersistenceService;
    private eventEmitter: EventEmitter;
    private config: PersistenceConfig;
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

        this.config = DEFAULT_CONFIG_PERSISTENCE;

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

        this.currentLogger.updateConfig({
            enabled: this.config.logEnabled,
            level: this.config.logLevel,
        });

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

            // Actualizar item con nueva estructura
            const updated: DownloadItem = {
                ...existing,
                ...updates,
                // Merge stats properly
                stats: {
                    ...existing.stats,
                    ...(updates.stats || {}),
                },
                // Merge profileIds properly (should be array)
                profileIds: updates.profileIds !== undefined 
                    ? updates.profileIds 
                    : existing.profileIds,
                // Merge subtitles properly
                subtitles: updates.subtitles !== undefined 
                    ? updates.subtitles 
                    : existing.subtitles,
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
     * Actualiza configuración de descargas parcialmente
     */
    
    public async updateDownloadsConfig(updates: Partial<ConfigDownloads>): Promise<ConfigDownloads> {
        try {
            // Cargar configuración actual
            const currentConfig = await this.loadDownloadsConfig();
            
            if (!currentConfig) {
                throw new Error('No existing config found to update');
            }

            // Aplicar actualizaciones
            const updatedConfig: ConfigDownloads = {
                ...currentConfig,
                ...updates
            };

            // Guardar configuración actualizada
            await this.saveDownloadsConfig(updatedConfig);

            this.currentLogger.debug(TAG, 'Downloads config updated', {
                updatedProperties: Object.keys(updates)
            });

            return updatedConfig;

        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to update downloads config', error);
            throw new PlayerError('STORAGE_ASYNC_002', {
                originalError: error,
                context: { 
                    service: 'PersistenceService',
                    operation: 'updateDownloadsConfig',
                    updates
                },
            });
        }
    }

    /*
     * Elimina la configuración de descargas persistida
     */
    
    public async clearDownloadsConfig(): Promise<void> {
        try {
            await AsyncStorage.removeItem(this.KEYS.CONFIG);
            
            this.currentLogger.debug(TAG, 'Downloads config cleared');

        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to clear downloads config', error);
            throw new PlayerError('STORAGE_ASYNC_004', {
                originalError: error,
                context: { 
                    service: 'PersistenceService',
                    operation: 'clearDownloadsConfig'
                },
            });
        }
    }

    /*
     * Guarda métricas de descarga
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
     * Guarda configuración de descargas
     */

    public async saveDownloadsConfig(config: ConfigDownloads): Promise<void> {
        try {
            const configData = {
                version: this.dataVersion,
                config,
                timestamp: Date.now(),
                checksum: this.config.encryptionEnabled ? this.generateChecksum(config) : undefined
            };

            const serializedData = this.config.compressionEnabled 
                ? await this.compressData(configData)
                : JSON.stringify(configData);

            await AsyncStorage.setItem(this.KEYS.CONFIG, serializedData);
            
            this.currentLogger.debug(TAG, 'Downloads config saved', {
                properties: Object.keys(config)
            });

            this.eventEmitter.emit(PersistenceEventType.SAVE_COMPLETED, {
                type: 'config',
                dataSize: serializedData.length
            });

        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to save downloads config', error);
            throw new PlayerError('STORAGE_ASYNC_002', {
                originalError: error,
                context: { 
                    service: 'PersistenceService',
                    operation: 'saveDownloadsConfig'
                },
            });
        }
    }

    /*
     * Actualiza el progreso de una descarga específica (método optimizado para QueueManager)
     *
     */

    public async updateDownloadProgress(downloadId: string, progress: number, bytesDownloaded?: number, totalBytes?: number): Promise<void> {
        try {
            const downloads = await this.loadDownloadState();
            const item = downloads.get(downloadId);
            
            if (!item) {
                throw new Error(`Download item not found: ${downloadId}`);
            }

            // Actualizar solo las estadísticas de progreso
            item.stats.progressPercent = Math.max(0, Math.min(100, progress));
            if (bytesDownloaded !== undefined) {
                item.stats.bytesDownloaded = bytesDownloaded;
            }
            if (totalBytes !== undefined) {
                item.stats.totalBytes = totalBytes;
            }

            downloads.set(downloadId, item);

            // Persistir solo en cambios importantes (cada 10%) para optimizar performance
            if (progress % 10 === 0 || progress === 100) {
                await this.saveDownloadState(downloads);
            } else {
                // Solo marcar como dirty para auto-save
                this.markAsDirty();
            }
            
        } catch (error) {
            this.currentLogger.error(TAG, `Failed to update download progress: ${downloadId}`, error);
            throw new PlayerError('STORAGE_ASYNC_002', {
                originalError: error,
                context: { downloadId, progress },
            });
        }
    }

    /*
     * Actualiza el estado de una descarga específica (método optimizado para QueueManager)
     *
     */

    public async updateDownloadState(downloadId: string, state: DownloadStates, fileUri?: string): Promise<void> {
        try {
            const downloads = await this.loadDownloadState();
            const item = downloads.get(downloadId);
            
            if (!item) {
                throw new Error(`Download item not found: ${downloadId}`);
            }

            // Actualizar estado
            item.state = state;
            
            if (fileUri) {
                item.fileUri = fileUri;
            }
            
            // Actualizar timestamps según el estado
            if (state === DownloadStates.DOWNLOADING && !item.stats.startedAt) {
                item.stats.startedAt = Date.now();
            } else if (state === DownloadStates.COMPLETED) {
                item.stats.downloadedAt = Date.now();
                item.stats.progressPercent = 100;
            }

            downloads.set(downloadId, item);
            
            // Siempre persistir cambios de estado (son críticos)
            await this.saveDownloadState(downloads);
            
        } catch (error) {
            this.currentLogger.error(TAG, `Failed to update download state: ${downloadId}`, error);
            throw new PlayerError('STORAGE_ASYNC_002', {
                originalError: error,
                context: { downloadId, state },
            });
        }
    }
    /*
     * Carga configuración de descargas
     */
    
    public async loadDownloadsConfig(): Promise<ConfigDownloads | null> {
        this.eventEmitter.emit(PersistenceEventType.LOAD_STARTED, { type: 'config' });

        try {
            const serializedData = await AsyncStorage.getItem(this.KEYS.CONFIG);
            
            if (!serializedData) {
                this.currentLogger.debug(TAG, 'No persisted downloads config found');
                return null;
            }

            // Descomprimir si es necesario
            const data = this.config.compressionEnabled
                ? await this.decompressData(serializedData)
                : JSON.parse(serializedData);

            // Verificar si es el formato nuevo con metadata
            let config: ConfigDownloads;
            
            if (data.version && data.config) {
                // Formato nuevo con metadata
                config = data.config;
                
                // Verificar checksum si está habilitado
                if (this.config.encryptionEnabled && data.checksum) {
                    const isValid = this.generateChecksum(config) === data.checksum;
                    if (!isValid) {
                        throw new Error('Config data integrity check failed');
                    }
                }
            } else {
                // Formato legacy - asumir que data ES la configuración
                config = data as ConfigDownloads;
            }

            this.currentLogger.debug(TAG, 'Downloads config loaded', {
                properties: Object.keys(config),
                hasMetadata: !!(data.version && data.config)
            });

            this.eventEmitter.emit(PersistenceEventType.LOAD_COMPLETED, {
                type: 'config'
            });

            return config;

        } catch (error) {
            this.currentLogger.error(TAG, 'Failed to load downloads config', error);
            this.eventEmitter.emit(PersistenceEventType.LOAD_FAILED, { 
                type: 'config',
                error 
            });
            
            // No lanzar error - devolver null para usar defaults
            return null;
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
            const config = await this.loadDownloadsConfig();

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
                await this.saveDownloadsConfig(migratedData.config);
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
     * Migración de v0 a v1 - De estructura antigua a nueva arquitectura
     *
     */
    
    private migrateV0ToV1(data: any): any {
        // Migrar de estructura antigua (offlineData) a nueva estructura
        
        if (data.downloads && Array.isArray(data.downloads)) {
            data.downloads = data.downloads.map(([id, item]: [string, any]) => {
                
                // Si el item ya tiene la nueva estructura, no migrar
                if (item.profileIds !== undefined && item.stats !== undefined) {
                    return [id, item];
                }
                
                // Migrar de estructura antigua a nueva
                const migratedItem: DownloadItem = {
                    // Campos básicos
                    id: item.offlineData?.source?.id || id,
                    type: item.offlineData?.isBinary ? DownloadType.BINARY : DownloadType.STREAM,
                    title: item.offlineData?.source?.title || 'Unknown',
                    uri: item.offlineData?.source?.uri || '',
                    
                    // Metadata
                    media: item.media || undefined,
                    licenseExpirationDate: item.licenseExpirationDate || undefined,
                    
                    // Perfiles - migrar de profileId single a profileIds array
                    profileIds: item.profileId ? [item.profileId] : [],
                    
                    // DRM
                    drm: item.offlineData?.drm || undefined,
                    drmScheme: item.offlineData?.source?.drmScheme || undefined,
                    
                    // Estado
                    state: item.offlineData?.state || DownloadStates.NOT_DOWNLOADED,
                    fileUri: item.offlineData?.fileUri || undefined,
                    
                    // Estadísticas - migrar de offlineData a stats
                    stats: {
                        progressPercent: item.offlineData?.percent || 0,
                        bytesDownloaded: 0,
                        totalBytes: 0,
                        downloadSpeed: undefined,
                        remainingTime: undefined,
                        networkType: undefined,
                        streamQuality: undefined,
                        segmentsTotal: undefined,
                        segmentsCompleted: undefined,
                        drmLicenseStatus: 'none',
                        startedAt: item.offlineData?.startedAt || undefined,
                        downloadedAt: item.offlineData?.downloadedAt || undefined,
                        error: undefined,
                        retryCount: item.retryCount || 0,
                    },
                    
                    // Subtítulos (nuevo campo)
                    subtitles: [],
                };
                
                return [id, migratedItem];
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