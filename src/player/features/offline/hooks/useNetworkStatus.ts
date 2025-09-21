import { useCallback, useEffect, useState } from 'react';
import { networkService } from '../services/network/NetworkService';
import { NetworkPolicy, NetworkStatus } from '../types';

/*
 * Hook para estado de la red según la interfaz del contexto
 * Proporciona estado actual, configuración y control de descargas
 * 
 */

export interface UseNetworkStatusReturn {
    // Estado actual
    isOnline: boolean;                 // boolean
    isWifi: boolean;                   // boolean
    isCellular: boolean;               // boolean
    connectionType: 'wifi' | 'cellular' | 'none';
  
    // Configuración
    allowCellular: boolean;            // boolean
    requiresWifi: boolean;             // boolean
  
    // Políticas
    setNetworkPolicy: (policy: NetworkPolicy) => void;
  
    // Eventos
    onNetworkChange: (callback: (status: NetworkStatus) => void) => () => void;
  
    // Estado de descargas
    downloadsAllowed: boolean;         // boolean
    downloadsPausedByNetwork: boolean; // boolean
  
    // Acciones
    pauseOnCellular: () => Promise<void>;
    resumeOnWifi: () => Promise<void>;
}

export function useNetworkStatus(): UseNetworkStatusReturn {
    
    // Estados del hook
    const [status, setStatus] = useState<NetworkStatus>(() => 
        networkService.getCurrentStatus()
    );
    const [policy, setPolicy] = useState<NetworkPolicy>(() => 
        networkService.getNetworkPolicy()
    );
    const [downloadsAllowed, setDownloadsAllowed] = useState<boolean>(false);
    const [downloadsPausedByNetwork, setDownloadsPausedByNetwork] = useState<boolean>(false);

    // Función para actualizar estados derivados
    const updateDerivedStates = useCallback(() => {
        const allowed = networkService.areDownloadsAllowed();
        const paused = networkService.areDownloadsPausedByNetwork();
        
        setDownloadsAllowed(allowed);
        setDownloadsPausedByNetwork(paused);
    }, []);

    // Inicialización y suscripciones
    useEffect(() => {
        const initializeNetwork = async () => {
            // Inicializar NetworkService
            await networkService.initialize();
            
            // Obtener estados iniciales
            const currentStatus = await networkService.fetchNetworkStatus();
            const currentPolicy = networkService.getNetworkPolicy();
            
            setStatus(currentStatus);
            setPolicy(currentPolicy);
            updateDerivedStates();
        };

        initializeNetwork();

        // Suscribirse a cambios de estado de red
        const unsubscribeNetworkChanges = networkService.subscribe('all', (newStatus) => {
            setStatus(newStatus);
            updateDerivedStates();
        });
        
        // Suscribirse a cambios de política (usando eventEmitter interno)
        const eventEmitter = (networkService as any).eventEmitter;
        
        const handlePolicyChange = (newPolicy: NetworkPolicy) => {
            setPolicy(newPolicy);
            updateDerivedStates();
        };
        
        const handleDownloadsChange = () => {
            updateDerivedStates();
        };
        
        eventEmitter.on('policy_changed', handlePolicyChange);
        eventEmitter.on('downloads_paused_cellular', handleDownloadsChange);
        eventEmitter.on('downloads_resumed_wifi', handleDownloadsChange);
        
        const unsubscribePolicyChanges = () => {
            eventEmitter.off('policy_changed', handlePolicyChange);
        };
        
        const unsubscribeDownloadsEvents = () => {
            eventEmitter.off('downloads_paused_cellular', handleDownloadsChange);
            eventEmitter.off('downloads_resumed_wifi', handleDownloadsChange);
        };

        return () => {
            unsubscribeNetworkChanges();
            unsubscribePolicyChanges();
            unsubscribeDownloadsEvents();
        };
    }, [updateDerivedStates]);

    // Acciones
    const setNetworkPolicy = useCallback((newPolicy: NetworkPolicy) => {
        networkService.setNetworkPolicy(newPolicy);
        // El estado se actualizará automáticamente via evento
    }, []);

    const onNetworkChange = useCallback((callback: (status: NetworkStatus) => void) => {
        return networkService.subscribe('all', callback);
    }, []);

    const pauseOnCellular = useCallback(async (): Promise<void> => {
        await networkService.pauseOnCellular();
    }, []);

    const resumeOnWifi = useCallback(async (): Promise<void> => {
        await networkService.resumeOnWifi();
    }, []);

    // Valores derivados del estado
    const isOnline = status.isConnected && status.isInternetReachable;
    const connectionType = networkService.getConnectionType();

    return {
        // Estado actual
        isOnline,
        isWifi: status.isWifi,
        isCellular: status.isCellular,
        connectionType,
        
        // Configuración (desde policy)
        allowCellular: policy.allowCellular,
        requiresWifi: policy.requiresWifi,
        
        // Políticas
        setNetworkPolicy,
        
        // Eventos
        onNetworkChange,
        
        // Estado de descargas
        downloadsAllowed,
        downloadsPausedByNetwork,
        
        // Acciones
        pauseOnCellular,
        resumeOnWifi,
    };
}