/*
 *  Utilidades para el módulo de descargas
 *
 */

/*
 * Formatea un tamaño en bytes a una representación legible (KB, MB, GB, etc.)
 *
 * @param bytes Tamaño en bytes
 * @param decimals Número de decimales a mostrar
 * @returns Cadena formateada con unidades
 * 
 */

export const formatBytes = (bytes: number = 0, decimals: number = 2): string => {
    let strSize: string = '0 Bytes';
    
    if (bytes === 0) {
        return strSize;
    } 

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    strSize = parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];

    return strSize;
};

/*
 * Muestra en consola la lista de descargas guardadas
 * 
 * @param logKey Prefijo para los mensajes de log
 * @param savedDownloads Lista de descargas guardadas
 * 
 */

export const listToConsole = (logKey: string, savedDownloads: any[]): void => {
    savedDownloads?.forEach(item => {
        console.log(`${logKey} --- [${item?.media?.collection}] ${item?.media?.slug}: ${item?.media?.title} ${JSON.stringify(item?.offlineData)}`);
    });
    
    console.log(`${logKey} Found ${savedDownloads?.length} items.`);
};