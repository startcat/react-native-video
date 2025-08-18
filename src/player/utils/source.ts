import { Platform } from 'react-native';
import {
    DRM_TYPE,
    IManifest,
    STREAM_FORMAT_TYPE
} from '../types';
import { getAbsoluteUri } from './siteUrl';

import qs from 'qs';

const LOG_ENABLED = false;
const LOG_KEY = '[Video Player Source]';



function log (message: string) {

    if (__DEV__ && LOG_ENABLED){
        console.log(`${LOG_KEY} ${message}`);

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

export const getMinutesFromTimestamp = (timestamp: number): number => {
    
    const timestampDate = new Date(timestamp * 1000);
    const currentDate = new Date();
    
    // Calculate difference in milliseconds
    const diffMs = currentDate.getTime() - timestampDate.getTime();
    
    // Convert to minutes and round down
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    log(`timestampDate from ${timestamp}: ${timestampDate.toLocaleTimeString()}`);
    log(`Minutes from timestamp: ${diffMinutes}`);
    
    return diffMinutes;

}

const addLiveTimestamp = (uri: string, subtractMinutes: number, liveStartProgramTimestamp?: number): string => {

    const isLiveProgramStartingPoint = typeof(liveStartProgramTimestamp) === 'number' && liveStartProgramTimestamp > 0;
    let fromDate = new Date();

    if (!uri || typeof(uri) !== 'string'){
        return uri;

    }

    if (isLiveProgramStartingPoint){
        fromDate = new Date(liveStartProgramTimestamp * 1000);
        log(`DVR fromDate ${fromDate.toLocaleTimeString()} from timestamp ${liveStartProgramTimestamp}`);

    } else if (subtractMinutes){
        fromDate = subtractMinutesFromDate(fromDate, subtractMinutes);
        log(`DVR fromDate ${fromDate.toLocaleTimeString()} from subtractMinutes ${subtractMinutes}`);

    }

    const timestamp = Math.floor(fromDate.getTime() / 1000);

    if (uri.indexOf('?') > -1){
        uri = `${uri.substring(0, uri.indexOf('?'))}?start=${timestamp}`;

    } else {
        uri = `${uri}?start=${timestamp}`;

    }

    if (isLiveProgramStartingPoint){
        uri += `&start-tag=true`;
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

            } else if ((Platform.OS === 'android' || isCasting) && !!item.drmConfig){
                return item.type === STREAM_FORMAT_TYPE.DASH && item.drmConfig.type === DRM_TYPE.WIDEVINE;

            } else if (Platform.OS === 'android' || isCasting){
                return item.type === STREAM_FORMAT_TYPE.DASH;

            }

            return undefined;

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

    } else if (manifest?.manifestURL?.includes('.mp4')){
        type = 'mp4';

    } else {
        type = (Platform.OS === 'ios') ? 'm3u8' : 'mpd';

    }

    log(`type: ${type}`);

    return type;

}

export const getVideoSourceUri = (manifest: IManifest, dvrWindowMinutes?: number, liveStartProgramTimestamp?: number): string => {

    let uri = getAbsoluteUri(manifest?.manifestURL),
        hasStartParam = false,
        hasEndParam = false,
        tempLiveStartProgramTimestamp;

    if (typeof(uri) === 'string' && uri?.indexOf('?') > 0){
        const queryString = uri.substring(uri.indexOf('?') + 1);
        const params = qs.parse(queryString);

        hasStartParam = !!params.start;
        hasEndParam = !!params.end;

        if (hasStartParam && hasEndParam && params.start === params.end){
            
            if (typeof(dvrWindowMinutes) === 'number' && dvrWindowMinutes > 0){
                // @ts-ignore
                params.end = parseInt(params.start, 10) + (dvrWindowMinutes * 60);

            } else {
                delete params.end;

            }

            const newQueryString = qs.stringify(params, { addQueryPrefix: true });
            uri = uri.split("?")[0] + newQueryString;
        }

    }
    
    if (typeof(dvrWindowMinutes) === 'number' && dvrWindowMinutes > 0 && !hasStartParam){

        if (typeof(liveStartProgramTimestamp) === 'number' && liveStartProgramTimestamp > 0){
            const minutes = getMinutesFromTimestamp(liveStartProgramTimestamp);

            // Revisamos que la ventana de DVR no sea inferior que el timestamp de inicio del programa
            if (minutes < dvrWindowMinutes){
                tempLiveStartProgramTimestamp = liveStartProgramTimestamp;
            }
            
        }

        uri = addLiveTimestamp(uri, dvrWindowMinutes, tempLiveStartProgramTimestamp);
    }

    log(`uri: ${uri}`);

    return uri;

}

export const getMinutesSinceStart = (uri: string): number => {

    const queryString = uri.substring(uri.indexOf('?') + 1);
    const params = qs.parse(queryString);

    const hasStartParam = !!params.start;

    if (!hasStartParam) return 0;

    const startTimestamp = typeof(params.start) === 'string' && parseInt(params.start, 10);

    if (!startTimestamp || isNaN(startTimestamp)) return 0;

    const currentTimestamp = Math.floor(Date.now() / 1000); // Timestamp actual en segundos
    const differenceInMinutes = Math.floor((currentTimestamp - startTimestamp) / 60); // Convertimos a minutos

    log(`getMinutesSinceStart: ${differenceInMinutes}`);

    return differenceInMinutes;

}
