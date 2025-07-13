import { CastTrackInfo } from '../types/types';
import { useCastMedia } from './useCastMedia';

export function useCastTracks(): {
    audioTrack: CastTrackInfo | null;
    textTrack: CastTrackInfo | null;
    availableAudioTracks: CastTrackInfo[];
    availableTextTracks: CastTrackInfo[];
} {
    const media = useCastMedia();
    return {
        audioTrack: media.audioTrack,
        textTrack: media.textTrack,
        availableAudioTracks: media.availableAudioTracks,
        availableTextTracks: media.availableTextTracks
    };
}