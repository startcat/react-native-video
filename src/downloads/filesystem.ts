/*
 * Funciones para gestionar operaciones del sistema de archivos
 */

import RNFS from 'react-native-fs';
import type { ReadDirItem } from '../types/Downloads';

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