import { CastVolumeInfo } from '../types/types';
import { useCastState } from './useCastState';

export function useCastVolume(): CastVolumeInfo {
    const castState = useCastState();
    return castState.volume;
}