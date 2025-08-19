import { useMemo } from 'react';
import { CastErrorInfo } from '../types/types';
import { useCastState } from './useCastState';

export function useCastError(): CastErrorInfo {
    const castState = useCastState();
    
    return useMemo(() => castState.error, [
        castState.error.errorCode,
        castState.error.errorMessage,
        castState.error.lastErrorTime
    ]);
}