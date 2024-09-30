import { RESMedia } from '../../../api/domain/media/media.entity';
import { RESStream } from '../../../api/domain/stream/stream.entity';
import { Enum } from '../../../api/types';

import { 
    IManifest
} from '../types';

import {
    getBestManifest,
    getVideoSourceUri
} from './source';

import { useSettingsStore } from 'store';



/*
 *  Validación para comprobar si necesitamos mostrar el Tudum externo
 *  Solo para Normal Flavour
 *
 *  Si no hay anuncios, no es un directo y no empezamos en un punto intermedio
 *  Solo con conexión
 * 
 */

export const getMustShowExternalTudum = (data: RESMedia | RESStream, canPlayOnline: boolean, startPosition?:number): boolean => {

    const settings = useSettingsStore.getState();

    const isLive = data?.type === Enum.STREAM_TYPE.LIVE;
    const hasAds = !!data?.vmap?.url;
    const hasStartPosition = typeof(startPosition) === 'number' && startPosition > 0;
    const hasTudumSettings = !!settings?.tudum();

    console.log(`[Tudum Settings] ${JSON.stringify(settings?.tudum())}`);

    return (hasTudumSettings && !isLive && !hasAds && !hasStartPosition && canPlayOnline);

}

export const getTudumManifest = () => {

    const settings = useSettingsStore.getState();

    if (settings?.tudum()){
        // Cogemos el manifest adecuado
        return getBestManifest(settings?.tudum());

    } else {
        return null;

    }

}

export const getTudumPlayerSource = (manifests:Array<IManifest>) => {

    // Cogemos el manifest adecuado
    let currentManifest = getBestManifest(manifests);

    // Montamos el Source para el player
    return {
        uri: getVideoSourceUri(currentManifest!),
    };

}

