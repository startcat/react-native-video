import { useCastConnection } from './useCastConnection';

export function useCastConnected(): boolean {
    const connection = useCastConnection();
    return connection.status === 'connected';
}