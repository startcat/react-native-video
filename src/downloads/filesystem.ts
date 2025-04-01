/*
 * Funciones para gestionar operaciones del sistema de archivos
 */

import RNFS from 'react-native-fs';
import type { ReadDirItem } from '../types/Downloads';
import { Platform } from 'react-native';

const DOWNLOADS_DIR = (Platform.OS === 'ios') ? RNFS?.LibraryDirectoryPath : RNFS?.DocumentDirectoryPath + '/downloads';

/*
 *  Obtenemos el directorio para las descargas de binarios
 * 
 *  @param module - Modulo RNBackgroundDownloader
 *  @returns string - Directorio para las descargas de binarios
 * 
 */

export const getBinaryDownloadsDirectory = (module: any): string => {
    return (Platform.OS === 'ios') ? module.directories.documents : RNFS?.DocumentDirectoryPath + '/downloads';
};

/*
 *  Eliminamos un fichero de disco
 * 
 *  @param uri - URI del fichero
 * 
 */

export const removeUri = async (uri: string): Promise<void> => {
    try {
        await RNFS?.unlink(uri);
    } catch(ex){
        console.error('Error removing file:', ex);
    }
};

/*
 *  Lee el tamaño de un directorio de forma recursiva
 * 
 *  @param dir - Ruta del directorio
 *  @returns Promise<number> - Tamaño del directorio en bytes
 * 
 */

export const readDirectorySize = async (dir: string): Promise<number> => {
    if (!RNFS) {
        throw new Error('No react-native-fs module');
    }
    
    try {
        let dirSize = 0;
        const result: ReadDirItem[] = await RNFS.readDir(dir);
        
        for (const item of result) {
            if (item.isDirectory()) {
                const subDirSize = await readDirectorySize(item.path);
                if (typeof(subDirSize) === 'number') {
                    dirSize += subDirSize;
                }
            } else if (item.isFile()) {
                dirSize += item.size;
            }
        }
        
        return dirSize;
    } catch (err) {
        throw err;
    }
};

/*
 *  Obtiene el directorio de descargas de Apple en iOS
 * 
 *  @param dir - Directorio base para buscar
 *  @returns Promise<string> - Ruta del directorio de descargas de Apple o directorio base si no se encuentra
 * 
 */

export const getAppleDownloadsDirectory = async (dir: string): Promise<string> => {
    if (!RNFS) {
        throw new Error('No react-native-fs module');
    }
    
    try {
        let path = '';
        const result = await RNFS.readDir(dir);
        
        for (const item of result) {
            if (item.isDirectory() && item.name?.match(/com.apple.UserManagedAssets/gi)) {
                path = item.path;
            }
        }
        
        return path || dir;
    } catch (err) {
        throw err;
    }
};

/*
 *  Calcula el tamaño total del directorio de descargas según la plataforma
 * 
 *  @param downloadsDir - Directorio base de descargas
 *  @returns Promise<number> - Tamaño total en bytes
 * 
 */

export const calculateTotalDownloadsSize = async (): Promise<number> => {
    try {
        if (Platform.OS === 'ios') {
            const appleDir = await getAppleDownloadsDirectory(DOWNLOADS_DIR);
            if (appleDir !== DOWNLOADS_DIR) {
                return await readDirectorySize(appleDir);
            } else {
                return await readDirectorySize(DOWNLOADS_DIR);
            }
        } else {
            return await readDirectorySize(DOWNLOADS_DIR);
        }
    } catch (err) {
        console.error('Error calculating total downloads size:', err);
        return 0;
    }
};