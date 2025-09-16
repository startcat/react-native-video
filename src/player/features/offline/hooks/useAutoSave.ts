import { useEffect, useRef, useState } from 'react';
import { persistenceService } from '../services/storage/PersistenceService';
import { DownloadItem } from '../types';

/*
 * Hook para auto-guardado
 *
 */

export function useAutoSave(
    getData: () => Map<string, DownloadItem>,
    interval: number = 30000,
    enabled: boolean = true
) {
    const [lastAutoSave, setLastAutoSave] = useState<number>(0);
    const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!enabled) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }

        const autoSave = async () => {
            try {
                const data = getData();

                if (data.size > 0) {
                    await persistenceService.saveDownloadState(data);
                    setLastAutoSave(Date.now());
                }

            } catch (error) {
                console.error('Auto-save failed:', error);
            }
        };

        intervalRef.current = setInterval(autoSave, interval);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [getData, interval, enabled]);

    return { lastAutoSave };
}