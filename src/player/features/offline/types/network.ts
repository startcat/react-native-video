import {
    type NetInfoCellularGeneration,
    type NetInfoState,
} from '@react-native-community/netinfo';

export enum NetworkEventType {
    CONNECTED = 'network:connected',
    DISCONNECTED = 'network:disconnected',
    TYPE_CHANGED = 'network:type_changed',
    WIFI_CONNECTED = 'network:wifi_connected',
    WIFI_DISCONNECTED = 'network:wifi_disconnected',
    CELLULAR_CONNECTED = 'network:cellular_connected',
    CELLULAR_DISCONNECTED = 'network:cellular_disconnected',
}

export interface NetworkStatus {
    isConnected: boolean;
    isWifi: boolean;
    isCellular: boolean;
    cellularGeneration?: NetInfoCellularGeneration;
    isInternetReachable: boolean;
    details?: NetInfoState;
}

export interface NetworkServiceConfig {
    checkIntervalMs?: number;
    enableLogging?: boolean;
    autoStart?: boolean;
}