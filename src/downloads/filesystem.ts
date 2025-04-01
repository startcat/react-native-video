/*
 * Funciones para gestionar operaciones del sistema de archivos
 */

import RNFS from 'react-native-fs';
import type { ReadDirItem } from '../types/Downloads';
import { Platform } from 'react-native';

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

export const calculateTotalDownloadsSize = async (downloadsDir: string): Promise<number> => {
    try {
        if (Platform.OS === 'ios') {
            const appleDir = await getAppleDownloadsDirectory(downloadsDir);
            if (appleDir !== downloadsDir) {
                return await readDirectorySize(appleDir);
            } else {
                return await readDirectorySize(downloadsDir);
            }
        } else {
            return await readDirectorySize(downloadsDir);
        }
    } catch (err) {
        console.error('Error calculating total downloads size:', err);
        return 0;
    }
};