import { CastConnectionInfo } from '../types/types';
import { useCastState } from './useCastState';

export function useCastConnection(): CastConnectionInfo {
    const castState = useCastState();
    return castState.connection;
}