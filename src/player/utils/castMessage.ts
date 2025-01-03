import Config from 'react-native-config';
import { 
    IManifest, 
    IDrm,
    IMappedYoubora,
    ICastMetadata,
    DRM_TYPE 
} from '../types';

const LOG_ENABLED = true;
const LOG_KEY = '[Cast Message]';



function log (message: string) {

    if (__DEV__ && LOG_ENABLED){
        console.log(`${LOG_KEY} ${message}`);

    }

}

// Check Absolute or relative URI
const getAbsoluteUri = (uri: string): string => {

    if (uri && typeof(uri) === 'string' && uri?.match(/https?:\/\//gi)){
        return uri;

    } else if (uri && typeof(uri) === 'string'){
        return Config.SITE_URL + uri;

    } else {
        return uri;

    }

}

const addUriParam = (uri: string, param: string): string => {

    if (uri && typeof(uri) === 'string' && uri.match(/\?/gi)){
        return uri + '&' + param;

    } else if (uri && typeof(uri) === 'string' && !uri.match(/\?/gi)){
        return uri + '?' + param;

    } else {
        return uri;

    }

}

export const getSourceMessageForCast = (manifest: IManifest, drm?: IDrm, youbora?: IMappedYoubora, metadata?: ICastMetadata) => {

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
            contentId: addUriParam(getAbsoluteUri(manifest?.manifestURL), 'include_tudum=true'),
            contentType: 'application/dash+xml',
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
        startTime: metadata?.startPosition || 0
    };

    log(`Cast Message ${JSON.stringify(message)}`);

    return message;

}
