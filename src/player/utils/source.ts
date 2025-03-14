import Config from 'react-native-config';
import { Platform } from 'react-native';
import { 
    IManifest, 
    STREAM_FORMAT_TYPE, 
    DRM_TYPE 
} from '../types';

import qs from 'qs';

const LOG_ENABLED = true;
const LOG_KEY = '[Video Player Source]';



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

const subtractMinutesFromDate = (date: Date, min: number): Date => { 
    
    try {
        date.setMinutes(date.getMinutes() - min); 

    } catch(ex:any){
        console.log(ex.message);
    }
    
    return date;

}

const addLiveTimestamp = (uri: string, subtractMinutes: number): string => {

    let fromDate = new Date();

    if (!uri || typeof(uri) !== 'string'){
        return uri;

    }

    if (subtractMinutes){
        fromDate = subtractMinutesFromDate(fromDate, subtractMinutes);

        log(`DVR fromDate ${fromDate.toLocaleTimeString()}`);

        // Redondeamos hacia abajo para que todas las peticiones en intervalos de 1h, usen el mismo querystring
        fromDate.setMinutes(fromDate.getMinutes() - (fromDate.getMinutes() % 60));
        fromDate.setMilliseconds(0);
        fromDate.setSeconds(0);
        
        log(`DVR fromDate after 60 min round ${fromDate.toLocaleTimeString()}`);

    }

    const timestamp = Math.floor(fromDate.getTime() / 1000);

    if (uri.indexOf('?') > -1){
        uri = `${uri.substring(0, uri.indexOf('?'))}?start=${timestamp}`;

    } else {
        uri = `${uri}?start=${timestamp}`;

    }

    return uri;

}

export const getBestManifest = (manifests: Array<IManifest>, isCasting?: boolean): IManifest | undefined => {

    let manifest: IManifest | undefined;

    if (Array.isArray(manifests) && manifests?.length > 0){

        manifest = manifests?.find(item => {

            if (Platform.OS === 'ios' && !!item.drmConfig && !isCasting){
                return item.type === STREAM_FORMAT_TYPE.HLS && item.drmConfig.type === DRM_TYPE.FAIRPLAY;

            } else if (Platform.OS === 'ios' && !isCasting){
                return item.type === STREAM_FORMAT_TYPE.HLS;

            } else if (Platform.OS === 'android' && !!item.drmConfig){
                return item.type === STREAM_FORMAT_TYPE.DASH && item.drmConfig.type === DRM_TYPE.WIDEVINE;

            } else if (Platform.OS === 'android'){
                return item.type === STREAM_FORMAT_TYPE.DASH;

            }

        });

        if (!manifest){
            manifest = manifests[0];
            
        }

    }

    log(`best manifest: ${JSON.stringify(manifest)}`);

    return manifest;

}

export const getManifestSourceType = (manifest: IManifest): string | undefined => {

    let type: string | undefined;

    if (manifest?.manifestURL?.includes('.mpd')){
        type = 'mpd';

    } else if (manifest?.manifestURL?.includes('.m3u8')){
        type = 'm3u8';
        
    } else if (manifest?.manifestURL?.includes('.mp3')){
        type = 'mp3';

    } else {
        type = (Platform.OS === 'ios') ? 'm3u8' : 'mpd';

    }

    log(`type: ${type}`);

    return type;

}

export const getVideoSourceUri = (manifest: IManifest, dvrWindowMinutes?: number): string => {

    let uri = getAbsoluteUri(manifest?.manifestURL),
        hasStartParam = false,
        hasEndParam = false;

    if (typeof(uri) === 'string' && uri?.indexOf('?') > 0){
        const queryString = uri.substring(uri.indexOf('?') + 1);
        const params = qs.parse(queryString);

        hasStartParam = !!params.start;
        hasEndParam = !!params.end;

        if (hasStartParam && hasEndParam && params.start === params.end){
            
            if (typeof(dvrWindowMinutes) === 'number'){
                // @ts-ignore
                params.end = parseInt(params.start, 10) + (dvrWindowMinutes * 60);

            } else {
                delete params.end;

            }

            const newQueryString = qs.stringify(params, { addQueryPrefix: true });
            uri = uri.split("?")[0] + newQueryString;
        }

    }
    
    if (typeof(dvrWindowMinutes) === 'number' && !hasStartParam){
        uri = addLiveTimestamp(uri, dvrWindowMinutes);
    }

    log(`uri: ${uri}`);

    return uri;

}
