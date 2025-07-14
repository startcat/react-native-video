import { useMemo } from 'react';
import { useCastMedia } from './useCastMedia';

export function useCastPlaying(): boolean {
    const media = useCastMedia();
    
    return useMemo(() => media.isPlaying, [media.isPlaying]);
}