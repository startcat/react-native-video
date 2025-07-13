import { useCastMedia } from './useCastMedia';

export function useCastPlaying(): boolean {
    const media = useCastMedia();
    return media.isPlaying;
}