/*
 *  FUNCIONES DEL DVR
 *  Comunes entre flavours
 *
 */

import { type useDvrPausedSecondsResults } from './useDvrPausedSeconds';
import { type ICommonData } from '../../types';

export interface handleDvrPausedDatumResults {
    duration: number | undefined;
    dvrTimeValue: number | undefined;
}

export const handleDvrPausedDatum = (isLive: boolean, dvrWindowSeconds: number, dvrPaused: useDvrPausedSecondsResults, dvrTimeValue?: number, onChangeCommonData?: (data: ICommonData) => void) => {
    
    const results: handleDvrPausedDatumResults = {
        duration: undefined,
        dvrTimeValue: undefined
    };

    if (typeof(dvrTimeValue) === 'number' && dvrPaused?.pausedDatum > 0 && dvrPaused?.pausedSeconds > 0){
        const moveDVRto = dvrTimeValue - dvrPaused.pausedSeconds;

        // Revisaremos si hay que hacer crecer la ventana de tiempo del directo
        if (typeof(dvrWindowSeconds) === 'number'){
            dvrWindowSeconds = dvrWindowSeconds + dvrPaused.pausedSeconds;
            results.duration = dvrWindowSeconds;

            if (isLive && onChangeCommonData){
                onChangeCommonData({
                    duration: dvrWindowSeconds
                });
            }
        }

        // Si nos detenemos tras volver al inicio de un programa en DVR, seguiremos viendo como nos alejamos del directo
        results.dvrTimeValue = moveDVRto;
    }

    return results;

}