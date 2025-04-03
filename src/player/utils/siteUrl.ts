/*
 *  Site URL
 *  Obtenemos las rutas con el dominio de la aplicación
 * 
 */

import Config from 'react-native-config';

// Check Absolute or relative URI
export const getAbsoluteUri = (uri: string): string => {

    if (uri && typeof(uri) === 'string' && uri?.match(/https?:\/\//gi)){
        return uri;

    } else if (uri && typeof(uri) === 'string'){
        return Config.SITE_URL + uri;

    } else {
        return uri;

    }

}