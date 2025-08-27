import { useMemo } from 'react';
import { LoggerConfigBasic } from '../../logger/types';
import { useCastMedia } from './useCastMedia';

export function useCastProgress(config: LoggerConfigBasic = {}): { currentTime: number; duration: number | null; progress: number } {
    const media = useCastMedia(config);
    
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