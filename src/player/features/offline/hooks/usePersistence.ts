import { useCallback, useEffect, useState } from 'react';
import { persistenceService } from '../services/storage/PersistenceService';
import { DownloadItem, PersistenceEventType } from '../types';

/*
 * Hook para gestionar la persistencia de descargas
 *
 */

export function usePersistence() {
    
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [lastSaveTime, setLastSaveTime] = useState<number>(0);
    const [error, setError] = useState<Error | null>(null);
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        // Obtener estadísticas iniciales
        persistenceService.getStats().then(setStats);

        // Suscribirse a eventos
        const unsubscribeSave = persistenceService.subscribe(
            PersistenceEventType.SAVE_COMPLETED,
            (_data) => { // Prefijo con _ para indicar que no se usa
                setIsSaving(false);
                setLastSaveTime(Date.now());
                setError(null);
                // Actualizar stats
                persistenceService.getStats().then(setStats);
            }
        );

        const unsubscribeSaveFailed = persistenceService.subscribe(
            PersistenceEventType.SAVE_FAILED,
            (error) => {
                setIsSaving(false);
                setError(error);
            }
        );

        const unsubscribeLoad = persistenceService.subscribe(
            PersistenceEventType.LOAD_COMPLETED,
            () => {
                setIsLoading(false);
                setError(null);
            }
        );

        const unsubscribeLoadFailed = persistenceService.subscribe(
            PersistenceEventType.LOAD_FAILED,
            (error) => {
                setIsLoading(false);
                setError(error);
            }
        );

        return () => {
            unsubscribeSave();
            unsubscribeSaveFailed();
            unsubscribeLoad();
            unsubscribeLoadFailed();
        };
    }, []);

    const saveDownloads = useCallback(async (downloads: Map<string, DownloadItem>) => {
        setIsSaving(true);
        setError(null);
        
        try {
            await persistenceService.saveDownloadState(downloads);
        } catch (err) {
            setError(err as Error);
            throw err;
        }
    }, []);

    const loadDownloads = useCallback(async (): Promise<Map<string, DownloadItem>> => {
        setIsLoading(true);
        setError(null);
        
        try {
            const downloads = await persistenceService.loadDownloadState();
            return downloads;
        } catch (err) {
            setError(err as Error);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const clearAll = useCallback(async () => {
        setError(null);
        
        try {
            await persistenceService.clearAll();
            await persistenceService.getStats().then(setStats);
        } catch (err) {
            setError(err as Error);
            throw err;
        }
    }, []);

    const exportData = useCallback(async (): Promise<string> => {
        setError(null);
        
        try {
            return await persistenceService.exportData();
        } catch (err) {
            setError(err as Error);
            throw err;
        }
    }, []);

    const importData = useCallback(async (data: string) => {
        setError(null);
        
        try {
            await persistenceService.importData(data);
            await persistenceService.getStats().then(setStats);
        } catch (err) {
            setError(err as Error);
            throw err;
        }
    }, []);

    const markAsDirty = useCallback(() => {
        persistenceService.markAsDirty();
    }, []);

    return {
        // Estados
        isSaving,
        isLoading,
        lastSaveTime,
        error,
        stats,
        
        // Acciones
        saveDownloads,
        loadDownloads,
        clearAll,
        exportData,
        importData,
        markAsDirty,
    };
}
