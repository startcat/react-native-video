import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DownloadItem } from '../types/Downloads';

// Clave única para el almacenamiento de descargas
const DOWNLOADS_KEY = 'off_downloads_v2';

/*
 * Lee los datos de descargas almacenados
 *
 * @param logPrefix - Prefijo para los mensajes de log
 * @returns Promise<DownloadItem[]> - Array de items de descarga o array vacío si no hay datos
 * 
 */

export const readStorage = async (logPrefix: string = '[Downloads]'): Promise<DownloadItem[]> => {
    try {
        const jsonValue = await AsyncStorage.getItem(DOWNLOADS_KEY);
        if (!jsonValue) {
            console.log(`${logPrefix} No se encontraron datos en storage`);
            return [];
        }
        
        const parsedValue = JSON.parse(jsonValue);
        console.log(`${logPrefix} Datos leídos de storage: ${parsedValue.length} items`);
        return Array.isArray(parsedValue) ? parsedValue : [];
    } catch (error) {
        console.error(`${logPrefix} Error al leer storage:`, error);
        return [];
    }
};

/*
 * Guarda los datos de descargas
 *
 * @param items - Array de items de descarga para guardar
 * @param logPrefix - Prefijo para los mensajes de log
 * @returns Promise<boolean> - true si la operación fue exitosa, false si hubo error
 * 
 */

export const saveStorage = async (
    items: DownloadItem[], 
    logPrefix: string = '[Downloads]'
): Promise<boolean> => {
    try {
        if (!Array.isArray(items)) {
            console.error(`${logPrefix} Error al guardar: los datos no son un array`);
            return false;
        }

        const jsonValue = JSON.stringify(items);
        await AsyncStorage.setItem(DOWNLOADS_KEY, jsonValue);
        console.log(`${logPrefix} Datos guardados en storage: ${items.length} items`);
        return true;
    } catch (error) {
        console.error(`${logPrefix} Error al guardar storage:`, error);
        return false;
    }
};