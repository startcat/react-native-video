import { type NetInfoCellularGeneration, type NetInfoState } from '@react-native-community/netinfo';

import { LogLevel } from '../../logger';

export interface NetworkServiceConfig {
	logEnabled?: boolean;
	logLevel?: LogLevel;
	disableAutoStart?: boolean;
}

export interface NetworkStatus {
	isConnected: boolean;
	isWifi: boolean;
	isCellular: boolean;
	cellularGeneration?: NetInfoCellularGeneration;
	isInternetReachable: boolean;
	details?: NetInfoState;
}

export interface NetworkPolicy {
	allowCellular: boolean; // Permite descargas por datos móviles
	requiresWifi: boolean; // Requiere WiFi obligatoriamente
	pauseOnCellular: boolean; // Pausa descargas al cambiar a celular
	resumeOnWifi: boolean; // Reanuda descargas al conectar WiFi
}

export type NetworkStatusCallback = (status: NetworkStatus) => void;

export enum NetworkEventType {
	CONNECTED = 'network:connected',
	DISCONNECTED = 'network:disconnected',
	TYPE_CHANGED = 'network:type_changed',
	WIFI_CONNECTED = 'network:wifi_connected',
	WIFI_DISCONNECTED = 'network:wifi_disconnected',
	CELLULAR_CONNECTED = 'network:cellular_connected',
	CELLULAR_DISCONNECTED = 'network:cellular_disconnected',
}
