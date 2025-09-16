import { useEffect, useRef } from 'react';
import { networkService } from '../services/network/NetworkService';
import { NetworkEventType, NetworkStatus } from '../types';

/*
 * Hook para detectar cambios específicos de red
 *
 */

export function useNetworkChange(eventType: NetworkEventType, callback: (status: NetworkStatus) => void) {
    
    const callbackRef = useRef(callback);
    
    // Actualizar ref sin causar re-renders
    useEffect(() => {
        callbackRef.current = callback;
    });
  
    useEffect(() => {
        const unsubscribe = networkService.subscribe(eventType, (status) => {
            callbackRef.current(status);
        });
  
        return unsubscribe;
    }, [eventType]);
}