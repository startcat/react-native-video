import { CastErrorInfo } from '../types/types';
import { useCastState } from './useCastState';

export function useCastError(): CastErrorInfo {
    const castState = useCastState();
    return castState.error;
}