/*
 *  Funciones de actualización para el módulo de descargas
 *
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DownloadItem } from '../types';

// Constante para la clave de versiones antiguas
const DOWNLOADS_OLDKEY = 'off_downloads';

/*
 * Refactoriza entradas de versiones anteriores de la aplicación a la estructura actual.
 *
 * @param saveRefListFn - Función para guardar la lista actualizada
 * @param savedDownloads - Lista de descargas existentes
 * @param logPrefix - Prefijo para los mensajes de log
 * @returns Promise<void>
 * 
 */

export const refactorOldEntries = async (
    saveRefListFn: () => Promise<DownloadItem[]>,
    savedDownloads: DownloadItem[],
    logPrefix: string = '[Downloads]'
): Promise<void> => {
    const avoidMediaFields = ['offlineData', 'theme'];

    try {
        const result = await AsyncStorage.getItem(DOWNLOADS_OLDKEY);

        if (typeof(result) === 'string') {
            const oldDownloads = JSON.parse(result);

            if (Array.isArray(oldDownloads) && oldDownloads?.length > 0) {
                for (const oldItem of oldDownloads) {
                    const newItem: DownloadItem = {
                        media: {},
                        offlineData: {
                            session_ids: [...oldItem?.offlineData?.profiles],
                            source: oldItem?.offlineData?.source,
                            state: oldItem?.offlineData?.state,
                            drm: oldItem?.offlineData?.drm,
                            percent: oldItem?.offlineData?.percent || 0
                        }
                    };

                    for (const key in oldItem) {
                        if (!avoidMediaFields.includes(key)) {
                            newItem.media[key] = oldItem[key];
                        }
                    }

                    savedDownloads.push(newItem);
                }

                try {
                    await saveRefListFn();
                    await AsyncStorage.removeItem(DOWNLOADS_OLDKEY);
                } catch (ex: any) {
                    console.log(`${logPrefix} refactorOldEntries error: ${ex?.message}`);
                }
            }
        }
    } catch (error: any) {
        console.log(`${logPrefix} refactorOldEntries error: ${error?.message}`);
    }
};