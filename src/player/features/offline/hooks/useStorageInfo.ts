import { useCallback, useEffect, useState } from 'react';
import { storageService } from '../services/storage/StorageService';
import { StorageEventType, StorageInfo, StorageInfoHookConfig } from '../types';

/*
 * Hook para consultar el estado del almacenamiento
 *
 */

export function useStorageInfo(config?: Partial<StorageInfoHookConfig>) {
    
    const [error, setError] = useState<Error | null>(null);
    const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
    
    useEffect(() => {
        async function init() {
            await storageService.initialize(config);

            if (config?.monitoringInterval) {
                storageService.startMonitoring(config.monitoringInterval);
            }
            
            // Obtener información inicial tras inicializar el servicio
            storageService.getStorageInfo().then(setStorageInfo);
        }

        init();

        // Suscribirse a eventos
        const unsubscribeStorageInfoUpdated = storageService.subscribe(
            StorageEventType.INFO_UPDATED,
            (data: StorageInfo) => {
                setStorageInfo(data);
                setError(null);
            }
        );

        return () => {
            unsubscribeStorageInfoUpdated();
        };
    }, []);

    const getStorageInfo = useCallback(async () => {
        setError(null);
        
        try {
            return await storageService.getStorageInfo();
        } catch (err) {
            setError(err as Error);
            throw err;
        }
    }, []);

    const getTotalSpace = useCallback(async () => {
        setError(null);
        
        try {
            return await storageService.getTotalSpace();
        } catch (err) {
            setError(err as Error);
            throw err;
        }
    }, []);

    const getUsedSpace = useCallback(async () => {
        setError(null);
        
        try {
            return await storageService.getUsedSpace();
        } catch (err) {
            setError(err as Error);
            throw err;
        }
    }, []);

    const getAvailableSpace = useCallback(async () => {
        setError(null);
        
        try {
            return await storageService.getAvailableSpace();
        } catch (err) {
            setError(err as Error);
            throw err;
        }
    }, []);

    const getDownloadsFolderSize = useCallback(async () => {
        setError(null);
        
        try {
            return await storageService.getDownloadsFolderSize();
        } catch (err) {
            setError(err as Error);
            throw err;
        }
    }, []);

    const getTempFolderSize = useCallback(async () => {
        setError(null);
        
        try {
            return await storageService.getTempFolderSize();
        } catch (err) {
            setError(err as Error);
            throw err;
        }
    }, []);

    const hasEnoughSpace = useCallback(async (requiredSpace: number) => {
        setError(null);
        
        try {
            return await storageService.hasEnoughSpace(requiredSpace);
        } catch (err) {
            setError(err as Error);
            throw err;
        }
    }, []);

    return {
        // Estados
        error,
        storageInfo,
        
        // Acciones
        getStorageInfo,
        getTotalSpace,
        getUsedSpace,
        getAvailableSpace,
        getDownloadsFolderSize,
        getTempFolderSize,
        hasEnoughSpace,
    };
}