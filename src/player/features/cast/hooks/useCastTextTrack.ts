import { CastTrackInfo } from '../types/types';
import { useCastMedia } from './useCastMedia';

export function useCastTextTrack(): CastTrackInfo | null {
    const media = useCastMedia();
    return media.textTrack;
}