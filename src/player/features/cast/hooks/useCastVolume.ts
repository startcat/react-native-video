import { useMemo } from 'react';
import { CastVolumeInfo } from '../types/types';
import { useCastState } from './useCastState';

export function useCastVolume(): CastVolumeInfo {
    const castState = useCastState();
    
    return useMemo(() => castState.volume, [
        castState.volume.level,
        castState.volume.isMuted,
        castState.volume.canControl
    ]);
}