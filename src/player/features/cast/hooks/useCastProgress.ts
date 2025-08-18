import { useMemo } from 'react';
import { useCastMedia } from './useCastMedia';

export function useCastProgress(): { currentTime: number; duration: number | null; progress: number } {
    const media = useCastMedia();
    
    return useMemo(() => ({
        currentTime: media.currentTime,
        duration: media.duration || media.seekableRange?.end || null,
        progress: media.progress
    }), [
        media.currentTime,
        media.duration,
        media.seekableRange?.end,
        media.progress
    ]);
}