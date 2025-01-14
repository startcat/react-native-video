import { default as Downloads } from '../../Downloads';

import { 
    type DownloadItem
} from '../../types';

export const getContentIdIsDownloaded = (id: number): boolean => {

    // En la parte nativa guardamos los ID como strings
    const downloadItem = Downloads.getItemById(id?.toString());

    console.log(`[Offline] getContentIdIsDownloaded (${id}): ${JSON.stringify(downloadItem)}`);

    return !!(downloadItem && downloadItem?.offlineData?.state === 'COMPLETED');

}

export const getContentIdIsBinary = (id: number): boolean => {

    // En la parte nativa guardamos los ID como strings
    const downloadItem = Downloads.getItemById(id?.toString());

    console.log(`[Offline] getContentIdIsBinary (${id}): ${JSON.stringify(downloadItem)}`);

    return !!(downloadItem && downloadItem?.offlineData?.isBinary);

}

export const getContentById = (id: number): DownloadItem | undefined => {

    // En la parte nativa guardamos los ID como strings
    const downloadItem = Downloads.getItemById(id?.toString());

    console.log(`[Offline] getContentById (${id}): ${JSON.stringify(downloadItem)}`);

    return downloadItem;

}