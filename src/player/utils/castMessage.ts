import {
    type ICastMetadata,
    type IDrm,
    type IManifest,
    type IMappedYoubora,
    DRM_TYPE
} from '../types';

import { type CastMessage } from '../features/cast/types';

import { getAbsoluteUri } from './siteUrl';

const LOG_ENABLED = true;
const LOG_KEY = '[Cast Message]';



function log (message: string) {

    if (__DEV__ && LOG_ENABLED){
        console.log(`${LOG_KEY} ${message}`);

    }

}

export const getSourceMessageForCast = (uri:string, manifest: IManifest, drm?: IDrm, youbora?: IMappedYoubora, metadata?: ICastMetadata): CastMessage => {

    let messageMetadata = {},
        message = {};

    messageMetadata = {
        title: metadata?.title || '',
        subtitle: metadata?.subtitle || '',
        images: [],
        isLive: !!metadata?.isLive,
        licenseAcquisitionURL: (drm && drm.type === DRM_TYPE.WIDEVINE && drm?.licenseServer) ? getAbsoluteUri(drm?.licenseServer!) : null,
        progress: null
        // progress: (data?.type !== 'live') ? {
        //     id: data?.id,
        //     seriesId: !!data?.season_data ? data?.season_data?.season_id : undefined,
        //     nextEpisodeId: !!data?.season_data ? data?.season_data?.next_episode?.id : undefined,
        //     duration: data?.duration,
        //     profileId: session?.id(),
        //     watching_progress_interval: settings.watching_progress_interval(),
        //     watching_progress_archive_pending_seconds: settings.watching_progress_archive_pending_seconds(),
        //     endpoint: `${require('~/api/common').CAST_URL}/api/raw/v1/watching-progress`
        // } : null
    };

    if (metadata?.poster){
        // @ts-ignore
        messageMetadata.images.push({
            url: metadata.poster
        });
    }

    message = {
        mediaInfo: {
            contentId: uri,
            // Evitamos indicar el mime type
            //contentType: 'application/dash+xml',
            metadata: messageMetadata
        },
        customData: {
            streamStart: 0,
            isLive: !!metadata?.isLive,
            youbora: youbora,
            //vmapUrl: metadata?.adTagUrl,
            sourceDescription: {
                metadata: messageMetadata
            }
        },
        autoplay: true,
        startTime: metadata?.startPosition || undefined
    };

    log(`Cast Message ${JSON.stringify(message)}`);

    return message as CastMessage;

}
