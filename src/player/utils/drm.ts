import Config from 'react-native-config';
import { IManifest, IDrm, DRM_TYPE } from '../types';

const LOG_ENABLED = true;
const LOG_KEY = '[Video Player DRM]';



function log (message: string) {

    if (__DEV__ && LOG_ENABLED){
        console.log(`${LOG_KEY} ${message}`);

    }

}

// Check Absolute or relative URI
function getAbsoluteUri(uri: string){

    if (uri && typeof(uri) === 'string' && uri?.match(/https?:\/\//gi)){
        return uri;

    } else if (uri && typeof(uri) === 'string'){
        return Config.SITE_URL + uri;

    } else {
        return uri;

    }

}

export const getDRM = (manifest: IManifest): IDrm | undefined => {

    let drm;

    if (manifest?.drmConfig?.type === DRM_TYPE.FAIRPLAY){
        drm = {
            type: DRM_TYPE.FAIRPLAY,
            licenseServer: getAbsoluteUri(manifest?.drmConfig?.licenseAcquisitionURL),
            certificateUrl: manifest?.drmConfig?.certificateURL,
            drmScheme: DRM_TYPE.FAIRPLAY,
        };

    } else if (manifest?.drmConfig?.type === DRM_TYPE.WIDEVINE){
        drm = {
            type: DRM_TYPE.WIDEVINE,
            licenseServer: getAbsoluteUri(manifest?.drmConfig?.licenseAcquisitionURL),
            drmScheme: DRM_TYPE.WIDEVINE
        };

    } else if (manifest?.drmConfig?.type === DRM_TYPE.PLAYREADY){
        drm = {
            type: DRM_TYPE.PLAYREADY,
            licenseServer: getAbsoluteUri(manifest?.drmConfig?.licenseAcquisitionURL),
            drmScheme: DRM_TYPE.PLAYREADY
        };

    }

    log(`DRM: ${JSON.stringify(drm)}`);

    return drm;

}

/*
 *  Al descargar contenidos, queremos que el DRM dure alrededor de 1 mes en lugar de 1 día o pocas horas.
 *  Para ello, lo pedimos con un flag que nos aumenta la fecha de caducidad en servidor
 *
 */

export const setOfflineExpirationDate = (drm: IDrm | undefined): IDrm | undefined => {

    let newDrm: IDrm,
        licenseServer: string = "";

    if (drm){

        if (drm?.licenseServer && drm?.licenseServer?.includes('?')){
            licenseServer = `${drm?.licenseServer}&offline=true`;

        } else if (drm?.licenseServer && !drm?.licenseServer?.includes('?')){
            licenseServer += `${drm?.licenseServer}?offline=true`;

        }

        newDrm = {
            type: drm.type,
            headers: drm.headers,
            licenseServer: licenseServer,
            contentId: drm.contentId,
            certificateUrl: drm.certificateUrl,
            base64Certificate: drm.base64Certificate,
            getLicense: drm.getLicense
        };

        log(`DRM with expiration: ${JSON.stringify(newDrm)}`);

        return newDrm;

    } else {
        return undefined;

    }

}
