import { useMemo } from 'react';
import { LoggerConfigBasic } from '../../logger/types';
import { useCastManager } from './useCastManager';
import { useCastState } from './useCastState';

export function useCastReady(config: LoggerConfigBasic = {}): boolean {
    const { connection } = useCastState(config);
    const castManager = useCastManager(config);
    
    return useMemo(() => {
        return connection.status === 'connected' && castManager.state.canControl;
    }, [connection.status, castManager.state.canControl]);
}