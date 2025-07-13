import { useCastState } from './useCastState';

export function useCastReady(): boolean {
    const { connection, media } = useCastState();
    return connection.status === 'connected' && !media.isIdle;
}