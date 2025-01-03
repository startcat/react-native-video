/*
 *  HLS
 *  Obtenemos las distintas calidades directamente del HLS
 * 
 */

import Config from 'react-native-config';
import { i18n } from '../locales';

import { 
    type IPlayerMenuData,
    PLAYER_MENU_DATA_TYPE
} from '../types';

// Check Absolute or relative URI
const getAbsoluteUri = (uri: string): string => {

    if (uri && typeof(uri) === 'string' && uri?.match(/https?:\/\//gi)){
        return encodeURI(uri);

    } else if (uri && typeof(uri) === 'string'){
        return encodeURI(Config.SITE_URL + uri);

    } else {
        return encodeURI(uri);

    }

}

const getSchemeDoc = async (url:string) => {

    const axios = require('axios').default;
    const scheme = await axios.get(url);
    
    return scheme?.data;

}

export const getHlsQualities = async (mainHls:string) => {

    let qualities:Array<IPlayerMenuData> = [];

    if (mainHls){
        const completeUrl = getAbsoluteUri(mainHls);

        const scheme = await getSchemeDoc(completeUrl);
        let baseUrl = completeUrl.substring(0, completeUrl.lastIndexOf('/') + 1);

        if (scheme && typeof(scheme) === 'string'){
            let entries = scheme.split('\n');

            qualities.push({
                type: PLAYER_MENU_DATA_TYPE.VIDEO,
                index: -1,
                code: completeUrl,
                label: i18n.t('player_quality_auto')
            });

            entries.forEach((item, index) => {

                if (item.startsWith("#EXT-X-STREAM-INF") && entries.length > (index)){

                    let resolution = item.substring(item.indexOf('RESOLUTION=') + 11);

                    if (resolution.length > 0 && resolution.indexOf(',')){
                        resolution = resolution.substring(0, resolution.indexOf(','));

                    }

                    qualities.push({
                        type: PLAYER_MENU_DATA_TYPE.VIDEO,
                        index: qualities.length,
                        code: `${baseUrl}${entries[index + 1]}`,
                        label: `${resolution.substring(resolution.indexOf('x') + 1)}p`
                    });

                }

            });

        }

    }

    console.log(`[HLS Qualities] ${JSON.stringify(qualities)}`);

    return qualities;

}