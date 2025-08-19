import { useMemo } from 'react';
import { useCastConnection } from './useCastConnection';

export function useCastConnected(): boolean {
    const connection = useCastConnection();

    const isConnected = useMemo(() => {
        return connection.status === 'connected';
    }, [connection.status]);
    
    return isConnected;
}