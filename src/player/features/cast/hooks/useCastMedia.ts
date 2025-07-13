import { CastMediaInfo } from '../types/types';
import { useCastState } from './useCastState';

export function useCastMedia(): CastMediaInfo {
    const castState = useCastState();
    return castState.media;
}