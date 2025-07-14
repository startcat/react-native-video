import { useMemo } from 'react';
import { CastTrackInfo } from '../types/types';
import { useCastMedia } from './useCastMedia';

export function useCastTextTrack(): CastTrackInfo | null {
    const media = useCastMedia();
    
    return useMemo(() => media.textTrack, [media.textTrack?.id]);
}