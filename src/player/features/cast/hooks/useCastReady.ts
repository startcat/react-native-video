import { useCastManager } from './useCastManager';
import { useCastState } from './useCastState';

export function useCastReady(): boolean {
    const { connection } = useCastState();
    const castManager = useCastManager();
    return connection.status === 'connected' && castManager.state.canControl;
}