import { useMemo } from 'react';
import { LoggerConfigBasic } from "../../logger";
import { CastErrorInfo } from '../types/types';
import { useCastState } from './useCastState';

export function useCastError(config: LoggerConfigBasic = {}): CastErrorInfo {
    const castState = useCastState(config);
    
    return useMemo(() => castState.error, [
        castState.error.errorCode,
        castState.error.errorMessage,
        castState.error.lastErrorTime
    ]);
}