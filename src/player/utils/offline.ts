import { Downloads } from 'react-native-video';

export const getContentIdIsDownloaded = (id: number): boolean => {

    // En la parte nativa guardamos los ID como strings
    const downloadItem = Downloads.getItemById(id?.toString());

    console.log(`[Offline] getContentIdIsDownloaded (${id}): ${JSON.stringify(downloadItem)}`);

    return !!(downloadItem && downloadItem?.offlineData?.state === 'COMPLETED');

}
