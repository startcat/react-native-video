/*
 *  Utilidades para gestionar la lista de descargas
 *
 */

import type { DownloadItem, SearchDownloadItem, NewDownloadItem } from '../types/Downloads';
import { DownloadStates } from '../types/Downloads';
import { saveStorage, readStorage } from './storage';
import { Platform } from 'react-native';

/*
 * Busca un elemento por su URI en la lista de descargas
 *
 * @param items - Lista de descargas
 * @param uri - URI a buscar
 * @param logPrefix - Prefijo para logs
 * @returns Promise<SearchDownloadItem | null> - Objeto con el elemento y su índice, o null si no se encuentra
 * 
 */

export const findItemBySrc = async (
    items: DownloadItem[],
    uri: string,
    logPrefix: string = '[Downloads]'
): Promise<SearchDownloadItem | null> => {
    try {
        if (!uri) {
            console.log(`${logPrefix} findItemBySrc: URI no proporcionada`);
            return null;
        }

        const foundItem = items.find(item => 
            item.offlineData?.source?.uri === uri || 
            encodeURI(item.offlineData?.source?.uri) === uri
        );

        const foundAtIndex = items.findIndex(item => 
            item.offlineData?.source?.uri === uri || 
            encodeURI(item.offlineData?.source?.uri) === uri
        );

        if (foundItem && foundAtIndex !== -1) {
            console.log(`${logPrefix} findItemBySrc: Encontrado elemento ${uri} en posición ${foundAtIndex}`);
            return {
                item: foundItem,
                index: foundAtIndex
            };
        } else {
            console.log(`${logPrefix} findItemBySrc: No se encontró elemento ${uri}`);
            return null;
        }
    } catch (error) {
        console.error(`${logPrefix} findItemBySrc error:`, error);
        return null;
    }
};

/*
 * Busca un elemento por su ID en la lista de descargas
 *
 * @param items - Lista de descargas
 * @param id - ID a buscar
 * @param logPrefix - Prefijo para logs
 * @returns Promise<SearchDownloadItem | null> - Objeto con el elemento y su índice, o null si no se encuentra
 * 
 */

export const findItemById = async (
    items: DownloadItem[],
    id: string,
    logPrefix: string = '[Downloads]'
): Promise<SearchDownloadItem | null> => {
    try {
        if (!id) {
            console.log(`${logPrefix} findItemById: ID no proporcionado`);
            return null;
        }

        const foundItem = items.find(item => item.offlineData?.source?.id === id);
        const foundAtIndex = items.findIndex(item => item.offlineData?.source?.id === id);

        if (foundItem && foundAtIndex !== -1) {
            console.log(`${logPrefix} findItemById: Encontrado elemento con ID ${id} en posición ${foundAtIndex}`);
            return {
                item: foundItem,
                index: foundAtIndex
            };
        } else {
            console.log(`${logPrefix} findItemById: No se encontró elemento con ID ${id}`);
            return null;
        }
    } catch (error) {
        console.error(`${logPrefix} findItemById error:`, error);
        return null;
    }
};

/*
 * Añade un elemento nuevo a la lista de descargas
 *
 * @param items - Lista de descargas actual
 * @param newItem - Nuevo elemento a añadir
 * @param userId - ID del usuario actual
 * @param isBinaryDownload - Indica si es una descarga binaria (mp3)
 * @param binaryDir - Directorio para descargas binarias
 * @param logPrefix - Prefijo para logs
 * @returns Promise<{updatedList: DownloadItem[], added: boolean, existingIndex?: number}> - Lista actualizada e información sobre la operación
 * 
 */

export const addItem = async (
    items: DownloadItem[],
    newItem: NewDownloadItem,
    userId: string,
    isBinaryDownload: boolean = false,
    binaryDir: string = '',
    logPrefix: string = '[Downloads]'
): Promise<{updatedList: DownloadItem[], added: boolean, existingIndex?: number}> => {
    try {
        // Verificar si ya existe el item
        const foundResult = await findItemBySrc(items, newItem.offlineData?.source?.uri, logPrefix);
        
        if (foundResult) {
            // Item ya existe, verificar si necesitamos añadir el ID de usuario
            if (!foundResult.item.offlineData?.session_ids?.includes(userId)) {
                console.log(`${logPrefix} addItem: Añadiendo usuario ${userId} a item existente`);
                
                if (!foundResult.item.offlineData.session_ids) {
                    foundResult.item.offlineData.session_ids = [];
                }
                
                foundResult.item.offlineData.session_ids.push(userId);
                items[foundResult.index] = foundResult.item;
                
                return {
                    updatedList: [...items],
                    added: false,
                    existingIndex: foundResult.index
                };
            }
            
            return {
                updatedList: items,
                added: false,
                existingIndex: foundResult.index
            };
        }

        // Crear un nuevo elemento
        const downloadItem: DownloadItem = {
            media: newItem.media,
            offlineData: {
                session_ids: [userId],
                source: newItem.offlineData.source,
                state: DownloadStates.RESTART,
                drm: newItem.offlineData.drm,
                isBinary: Platform.OS === 'android' && newItem.offlineData.source.drmScheme === 'mp3'
            }
        };

        // Si es una descarga binaria y tenemos la información necesaria, añadir la ruta del archivo
        if (isBinaryDownload && downloadItem.offlineData.isBinary && binaryDir) {
            downloadItem.offlineData.fileUri = `${binaryDir}/${newItem.offlineData.source.id}.mp3`;
        }

        console.log(`${logPrefix} addItem: Añadiendo nuevo item ${newItem.offlineData?.source?.title}`);
        
        // Añadir a la lista y guardar
        const newList = [...items, downloadItem];
        
        return {
            updatedList: newList,
            added: true
        };
    } catch (error) {
        console.error(`${logPrefix} addItem error:`, error);
        return {
            updatedList: items,
            added: false
        };
    }
};

/*
 * Elimina un elemento de la lista de descargas
 *
 * @param items - Lista de descargas actual
 * @param index - Índice del elemento a eliminar
 * @param logPrefix - Prefijo para logs
 * @returns Promise<DownloadItem[]> - Lista actualizada sin el elemento
 * 
 */

export const removeItem = async (
    items: DownloadItem[],
    index: number,
    logPrefix: string = '[Downloads]'
): Promise<DownloadItem[]> => {
    try {
        if (index < 0 || index >= items.length) {
            console.error(`${logPrefix} removeItem: Índice fuera de rango ${index}`);
            return items;
        }

        console.log(`${logPrefix} removeItem: Eliminando item en posición ${index}`);
        const newList = [...items];
        newList.splice(index, 1);
        
        return newList;
    } catch (error) {
        console.error(`${logPrefix} removeItem error:`, error);
        return items;
    }
};

/*
 * Actualiza un elemento en la lista de descargas
 *
 * @param items - Lista de descargas actual
 * @param index - Índice del elemento a actualizar
 * @param updatedItem - Elemento con las actualizaciones
 * @param logPrefix - Prefijo para logs
 * @returns Promise<DownloadItem[]> - Lista con el elemento actualizado
 * 
 */

export const updateItem = async (
    items: DownloadItem[],
    index: number,
    updatedItem: DownloadItem,
    logPrefix: string = '[Downloads]'
): Promise<DownloadItem[]> => {
    try {
        if (index < 0 || index >= items.length) {
            console.error(`${logPrefix} updateItem: Índice fuera de rango ${index}`);
            return items;
        }

        console.log(`${logPrefix} updateItem: Actualizando item en posición ${index}`);
        const newList = [...items];
        newList[index] = updatedItem;
        
        return newList;
    } catch (error) {
        console.error(`${logPrefix} updateItem error:`, error);
        return items;
    }
};

/*
 * Filtra la lista de descargas para un usuario específico
 *
 * @param items - Lista de descargas completa
 * @param userId - ID del usuario para filtrar
 * @param logPrefix - Prefijo para logs
 * @returns DownloadItem[] - Lista filtrada para el usuario
 * 
 */

export const filterItemsByUser = (
    items: DownloadItem[],
    userId: string,
    logPrefix: string = '[Downloads]'
): DownloadItem[] => {
    try {
        if (!userId) {
            console.log(`${logPrefix} filterItemsByUser: No se proporcionó ID de usuario, devolviendo lista completa`);
            return items;
        }

        const filteredItems = items.filter(item => 
            item.offlineData?.session_ids?.includes(userId)
        );
        
        console.log(`${logPrefix} filterItemsByUser: Encontrados ${filteredItems.length} elementos para usuario ${userId}`);
        return filteredItems;
    } catch (error) {
        console.error(`${logPrefix} filterItemsByUser error:`, error);
        return [];
    }
};

/*
 * Elimina todos los elementos de un usuario específico
 *
 * @param items - Lista de descargas actual
 * @param userId - ID del usuario cuyos elementos se eliminarán
 * @param logPrefix - Prefijo para logs
 * @returns Promise<DownloadItem[]> - Lista actualizada sin los elementos del usuario
 * 
 */

export const removeUserItems = async (
    items: DownloadItem[],
    userId: string,
    logPrefix: string = '[Downloads]'
): Promise<DownloadItem[]> => {
    try {
        if (!userId) {
            console.error(`${logPrefix} removeUserItems: No se proporcionó ID de usuario`);
            return items;
        }

        console.log(`${logPrefix} removeUserItems: Eliminando items del usuario ${userId}`);
        
        // Eliminar elementos que solo pertenecen a este usuario
        // y actualizar session_ids en elementos compartidos
        const updatedList = items.reduce((acc: DownloadItem[], item) => {
            if (!item.offlineData?.session_ids?.includes(userId)) {
                // El elemento no pertenece a este usuario, mantenerlo sin cambios
                acc.push(item);
                return acc;
            }
            
            // Si solo pertenece a este usuario, no incluirlo en la nueva lista
            if (item.offlineData.session_ids.length === 1) {
                return acc;
            }
            
            // Si pertenece a múltiples usuarios, actualizar session_ids
            const updatedItem = {...item};
            updatedItem.offlineData.session_ids = item.offlineData.session_ids.filter(id => id !== userId);
            acc.push(updatedItem);
            return acc;
        }, []);
        
        console.log(`${logPrefix} removeUserItems: Se eliminaron ${items.length - updatedList.length} items`);
        return updatedList;
    } catch (error) {
        console.error(`${logPrefix} removeUserItems error:`, error);
        return items;
    }
};

/*
 * Guarda la lista de descargas al almacenamiento
 *
 * @param items - Lista de descargas a guardar
 * @param logPrefix - Prefijo para logs
 * @returns Promise<boolean> - true si se guardó correctamente, false en caso contrario
 * 
 */

export const saveList = async (
    items: DownloadItem[],
    logPrefix: string = '[Downloads]'
): Promise<boolean> => {
    try {
        await saveStorage(items);
        console.log(`${logPrefix} saveList: Lista guardada con ${items.length} elementos`);
        return true;
    } catch (error) {
        console.error(`${logPrefix} saveList error:`, error);
        return false;
    }
};

/*
 * Carga la lista de descargas desde el almacenamiento
 *
 * @param logPrefix - Prefijo para logs
 * @returns Promise<DownloadItem[]> - Lista cargada desde el almacenamiento
 * 
 */

export const loadList = async (
    logPrefix: string = '[Downloads]'
): Promise<DownloadItem[]> => {
    return await readStorage(logPrefix);
};