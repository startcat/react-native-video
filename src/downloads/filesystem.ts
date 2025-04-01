/*
 * Funciones para gestionar operaciones del sistema de archivos
 */

import RNFS from 'react-native-fs';
import type { ReadDirItem } from '../types/Downloads';

/**
 * Lee el tamaño de un directorio de forma recursiva
 * 
 * @param dir - Ruta del directorio
 * @returns Promise<number> - Tamaño del directorio en bytes
 */
export const readDirectorySize = (dir: string): Promise<number> => {
    return new Promise((resolve, reject) => {
        let dirSize = 0;

        if (!RNFS){
            reject('No react-native-fs module');
        }

        RNFS?.readDir(dir).then(async (result: ReadDirItem[]): Promise<void> => {
            for (const item of result) {
                if (item.isDirectory()){
                    await readDirectorySize(item.path).then(size => {
                        if (typeof(size) === 'number'){
                            dirSize = size + dirSize;
                        }
                    });
                } else if (item.isFile()){
                    dirSize = dirSize + item.size;
                }
            }

            resolve(dirSize);
        }).catch((err: any) => {
            reject(err);
        });
    });
};