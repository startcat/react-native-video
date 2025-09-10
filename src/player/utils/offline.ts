import { default as Downloads } from '../../Downloads';

import { 
    type DownloadItem
} from '../../types';

import { PlayerError } from '../core/errors';

export const getContentIdIsDownloaded = (id: number): boolean => {

    if (id == null || id === undefined) {
        throw new PlayerError('DOWNLOAD_INVALID_CONTENT_ID', { 
            providedId: id 
        });
    }

    if (!Downloads) {
        throw new PlayerError('DOWNLOAD_MODULE_UNAVAILABLE', { 
            operation: 'getContentIdIsDownloaded' 
        });
    }

    let downloadItem: DownloadItem | undefined;
    try {
        // En la parte nativa guardamos los ID como strings
        downloadItem = Downloads.getItemById(id.toString());
    } catch (error) {
        throw new PlayerError('DOWNLOAD_CONTENT_ACCESS_FAILED', { 
            contentId: id,
            operation: 'getItemById',
            originalError: error 
        });
    }

    console.log(`[Offline] getContentIdIsDownloaded (${id}): ${JSON.stringify(downloadItem?.offlineData)}`);

    return !!(downloadItem && downloadItem?.offlineData?.state === 'COMPLETED');

}

export const getContentIdIsBinary = (id: number): boolean => {

    if (id == null || id === undefined) {
        throw new PlayerError('DOWNLOAD_INVALID_CONTENT_ID', { 
            providedId: id 
        });
    }

    if (!Downloads) {
        throw new PlayerError('DOWNLOAD_MODULE_UNAVAILABLE', { 
            operation: 'getContentIdIsBinary' 
        });
    }

    let downloadItem: DownloadItem | undefined;
    try {
        // En la parte nativa guardamos los ID como strings
        downloadItem = Downloads.getItemById(id.toString());
    } catch (error) {
        throw new PlayerError('DOWNLOAD_CONTENT_ACCESS_FAILED', { 
            contentId: id,
            operation: 'getItemById',
            originalError: error 
        });
    }

    console.log(`[Offline] getContentIdIsBinary (${id}): ${JSON.stringify(downloadItem?.offlineData)}`);

    return !!(downloadItem && downloadItem?.offlineData?.isBinary);

}

export const getContentById = (id: number): DownloadItem | undefined => {

    if (id == null || id === undefined) {
        throw new PlayerError('DOWNLOAD_INVALID_CONTENT_ID', { 
            providedId: id 
        });
    }

    if (!Downloads) {
        throw new PlayerError('DOWNLOAD_MODULE_UNAVAILABLE', { 
            operation: 'getContentById' 
        });
    }

    let downloadItem: DownloadItem | undefined;
    try {
        // En la parte nativa guardamos los ID como strings
        downloadItem = Downloads.getItemById(id.toString());
    } catch (error) {
        throw new PlayerError('DOWNLOAD_CONTENT_ACCESS_FAILED', { 
            contentId: id,
            operation: 'getItemById',
            originalError: error 
        });
    }

    console.log(`[Offline] getContentById (${id}): ${JSON.stringify(downloadItem?.offlineData)}`);

    return downloadItem;

}