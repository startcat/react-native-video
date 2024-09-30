/*
 *  Check tipo de conexión al reproducir videos
 *  Aquí validaremos si el usuario limita la reproducción a WIFI o no
 *
 */

import { NetInfoStateType } from "@react-native-community/netinfo";

export const getCanPlayOnline = (connectionType?: NetInfoStateType, isConnected?: boolean ): boolean => {

    console.log(`[Connection Type] ${connectionType} - isConnected ${!!isConnected}`);

    return !!isConnected;

}