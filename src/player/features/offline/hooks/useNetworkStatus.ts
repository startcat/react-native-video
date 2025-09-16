import { useCallback, useEffect, useState } from 'react';
import { networkService } from '../services/network/NetworkService';
import { NetworkStatus } from '../types';

/*
 * Hook para monitorear el estado de la red
 *
 */

export function useNetworkStatus() {
    
    const [status, setStatus] = useState<NetworkStatus>(() => 
        networkService.getCurrentStatus()
    );

    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Obtener estado inicial
        const fetchInitialStatus = async () => {
            const currentStatus = await networkService.fetchNetworkStatus();
            setStatus(currentStatus);
            setIsLoading(false);
        };

        fetchInitialStatus();

        // Suscribirse a todos los cambios
        const unsubscribe = networkService.subscribe('all', (newStatus) => {
            setStatus(newStatus);
        });

        return unsubscribe;
    }, []);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        const newStatus = await networkService.fetchNetworkStatus();
        setStatus(newStatus);
        setIsLoading(false);
    }, []);

    return {
        ...status,
        isLoading,
        refresh,
        canDownload: (wifiOnly: boolean = false) => networkService.canDownload(wifiOnly),
        cellularQuality: networkService.getCellularQuality(),
    };
}