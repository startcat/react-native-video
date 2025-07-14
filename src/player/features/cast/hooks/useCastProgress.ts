import { useCastMedia } from './useCastMedia';

export function useCastProgress(): { currentTime: number; duration: number | null; progress: number } {
    const media = useCastMedia();
    return {
        currentTime: media.currentTime,
        duration: media.duration || media.seekableRange?.end || null,
        progress: media.progress
    };
}