import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_CONFIG, LIMITS } from '../constants';
import { storageService } from '../services/storage/StorageService';
import { StorageEventType } from '../types';

/*
 * Hook para información de almacenamiento según la interfaz del contexto
 * Proporciona valores directos y acciones para gestión de espacio
 * 
 */

export interface UseStorageInfoReturn {
    // Espacio
    totalSpace: number;                    // number (bytes)
    availableSpace: number;                // number (bytes)  
    usedSpace: number;                     // number (bytes)
    downloadSpace: number;                 // number (bytes)
  
    // Porcentajes
    usagePercentage: number;               // number (0-100)
    downloadPercentage: number;            // number (0-100)
  
    // Estado
    isLowSpace: boolean;                   // boolean
    spaceWarningLevel: 'none' | 'warning' | 'critical';
  
    // Configuración
    warningThreshold: number;              // number (0-1)
    minFreeSpaceMB: number;                // number
  
    // Acciones
    checkSpace: () => Promise<void>;
    cleanupTemp: () => Promise<{filesRemoved: number, spaceFreed: number}>;
    estimateSpaceNeeded: (downloadId?: string, type?: string, quality?: string) => Promise<number>;
  
    // Eventos
    onSpaceWarning: (callback: (level: string) => void) => () => void;
  
    // Directorios
    downloadDirectory: string;
    tempDirectory: string;
    subtitlesDirectory: string;
}

export function useStorageInfo(): UseStorageInfoReturn {
    // Estados del hook
    const [totalSpace, setTotalSpace] = useState<number>(0);
    const [availableSpace, setAvailableSpace] = useState<number>(0);
    const [usedSpace, setUsedSpace] = useState<number>(0);
    const [downloadSpace, setDownloadSpace] = useState<number>(0);
    const [usagePercentage, setUsagePercentage] = useState<number>(0);
    const [downloadPercentage, setDownloadPercentage] = useState<number>(0);
    const [isLowSpace, setIsLowSpace] = useState<boolean>(false);
    const [spaceWarningLevel, setSpaceWarningLevel] = useState<'none' | 'warning' | 'critical'>('none');
    
    // Configuración constante
    const warningThreshold = DEFAULT_CONFIG.STORAGE_WARNING_THRESHOLD;
    const minFreeSpaceMB = LIMITS.MIN_DISK_SPACE_MB;
    
    // Directorios constantes
    const downloadDirectory = storageService.getDownloadDirectory();
    const tempDirectory = storageService.getTempDirectory();
    const subtitlesDirectory = storageService.getSubtitlesDirectory();
    
    // Función para actualizar todos los valores
    const updateStorageInfo = useCallback(async () => {
        try {
            const [total, available, used, downloads, usagePercent, downloadPercent, lowSpace, warningLevel] = await Promise.all([
                storageService.getTotalSpace(),
                storageService.getAvailableSpace(),
                storageService.getUsedSpace(),
                storageService.getDownloadsFolderSize(),
                storageService.getUsagePercentage(),
                storageService.getDownloadPercentage(),
                storageService.isLowSpace(),
                storageService.getSpaceWarningLevel()
            ]);
            
            setTotalSpace(total);
            setAvailableSpace(available);
            setUsedSpace(used);
            setDownloadSpace(downloads);
            setUsagePercentage(usagePercent);
            setDownloadPercentage(downloadPercent);
            setIsLowSpace(lowSpace);
            setSpaceWarningLevel(warningLevel);
            
        } catch (error) {
            console.error('Error updating storage info:', error);
        }
    }, []);
    
    // Inicialización y suscripción a eventos
    useEffect(() => {
        const initializeStorage = async () => {
            // Inicializar StorageService
            await storageService.initialize();
            
            // Obtener información inicial
            await updateStorageInfo();
            
            // Iniciar monitoreo automático
            storageService.startMonitoring(60000); // Cada minuto
        };
        
        initializeStorage();
        
        // Suscribirse a eventos de almacenamiento
        const unsubscribeInfoUpdated = storageService.subscribe(
            StorageEventType.INFO_UPDATED,
            updateStorageInfo
        );
        
        const unsubscribeSpaceWarning = storageService.subscribe(
            StorageEventType.SPACE_WARNING,
            updateStorageInfo
        );
        
        const unsubscribeSpaceCritical = storageService.subscribe(
            StorageEventType.SPACE_CRITICAL,
            updateStorageInfo
        );
        
        const unsubscribeSpaceRecovered = storageService.subscribe(
            StorageEventType.SPACE_RECOVERED,
            updateStorageInfo
        );
        
        return () => {
            unsubscribeInfoUpdated();
            unsubscribeSpaceWarning();
            unsubscribeSpaceCritical();
            unsubscribeSpaceRecovered();
        };
    }, [updateStorageInfo]);
    
    // Acciones
    const checkSpace = useCallback(async (): Promise<void> => {
        await updateStorageInfo();
    }, [updateStorageInfo]);
    
    const cleanupTemp = useCallback(async (): Promise<{filesRemoved: number, spaceFreed: number}> => {
        const freedBytes = await storageService.cleanupOrphanedFiles();
        
        // Actualizar información después de la limpieza
        await updateStorageInfo();
        
        // Simular número de archivos eliminados (no disponible en StorageService actual)
        // En una implementación real, esto vendría del servicio
        const filesRemoved = freedBytes > 0 ? Math.floor(freedBytes / (1024 * 1024)) : 0; // Estimación
        
        return {
            filesRemoved,
            spaceFreed: freedBytes
        };
    }, [updateStorageInfo]);
    
    const estimateSpaceNeeded = useCallback(async (downloadId?: string, type?: string, quality?: string): Promise<number> => {
        return await storageService.estimateSpaceNeeded(downloadId, type, quality);
    }, []);
    
    // Eventos
    const onSpaceWarning = useCallback((callback: (level: string) => void) => {
        const unsubscribeWarning = storageService.subscribe(
            StorageEventType.SPACE_WARNING,
            () => callback('warning')
        );
        
        const unsubscribeCritical = storageService.subscribe(
            StorageEventType.SPACE_CRITICAL,
            () => callback('critical')
        );
        
        const unsubscribeRecovered = storageService.subscribe(
            StorageEventType.SPACE_RECOVERED,
            () => callback('none')
        );
        
        return () => {
            unsubscribeWarning();
            unsubscribeCritical();
            unsubscribeRecovered();
        };
    }, []);
    
    return {
        // Espacio
        totalSpace,
        availableSpace,
        usedSpace,
        downloadSpace,
        
        // Porcentajes
        usagePercentage,
        downloadPercentage,
        
        // Estado
        isLowSpace,
        spaceWarningLevel,
        
        // Configuración
        warningThreshold,
        minFreeSpaceMB,
        
        // Acciones
        checkSpace,
        cleanupTemp,
        estimateSpaceNeeded,
        
        // Eventos
        onSpaceWarning,
        
        // Directorios
        downloadDirectory,
        tempDirectory,
        subtitlesDirectory,
    };
}