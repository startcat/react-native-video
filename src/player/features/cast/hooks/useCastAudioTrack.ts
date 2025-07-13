import { CastTrackInfo } from '../types/types';
import { useCastMedia } from './useCastMedia';

export function useCastAudioTrack(): CastTrackInfo | null {
    const media = useCastMedia();
    return media.audioTrack;
}