/*
 *  Funciones de red para el módulo de descargas
 *
 */

import NetInfo from '@react-native-community/netinfo';
import type { NetworkState } from '../types/Downloads';

/*
 * Obtiene información sobre el estado de la red
 *
 * @param logPrefix - Prefijo para los mensajes de log
 * @returns Promise<NetworkState>
 * 
 */

export const getNetworkInfo = async (logPrefix: string = '[Downloads]'): Promise<NetworkState> => {
    /*
     *	"isConnected": true,
     *  "type": "wifi",
     *  "isInternetReachable": true,
     *  "isWifiEnabled": true
     *
     */

    try {
        const state = await NetInfo.fetch();
        console.log(`${logPrefix} getNetworkInfo - isConnected? ${state?.isConnected} (${state?.type})`);
        
        return {
            isConnected: !!state?.isConnected,
            isInternetReachable: !!state?.isInternetReachable,
            isWifiEnabled: !!state?.isWifiEnabled,
            type: state?.type || null
        };
    } catch (error) {
        // En caso de error, devolver un estado por defecto
        return {
            isConnected: true,
            isInternetReachable: false,
            isWifiEnabled: false,
            type: null
        };
    }
};