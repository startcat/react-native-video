/*
 *  Funciones de red para el módulo de descargas
 *
 */

import NetInfo from '@react-native-community/netinfo';
import type { NetworkState } from '../types';

// Almacena el estado de la red actual
let networkState: NetworkState;

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

    return new Promise((resolve) => {
        NetInfo.fetch().then((state: any) => {
            console.log(`${logPrefix} getNetworkInfo - isConnected? ${state?.isConnected} (${state?.type})`);
            
            networkState = {
                isConnected: state?.isConnected,
                isInternetReachable: state?.isInternetReachable,
                isWifiEnabled: state?.isWifiEnabled,
                type: state?.type
            };

            resolve(networkState);

        }).catch(() => {

            resolve({
                isConnected: true,
                isInternetReachable: false,
                isWifiEnabled: false,
                type: null
            });

        });
    });
};