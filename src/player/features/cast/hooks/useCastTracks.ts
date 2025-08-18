import { useMemo } from 'react';
import { CastTrackInfo } from '../types/types';
import { useCastMedia } from './useCastMedia';

export function useCastTracks(): {
    audioTrack: CastTrackInfo | null;
    textTrack: CastTrackInfo | null;
    availableAudioTracks: CastTrackInfo[];
    availableTextTracks: CastTrackInfo[];
} {
    const media = useCastMedia();
    
    return useMemo(() => ({
        audioTrack: media.audioTrack,
        textTrack: media.textTrack,
        availableAudioTracks: media.availableAudioTracks,
        availableTextTracks: media.availableTextTracks
    }), [
        media.audioTrack?.id,
        media.textTrack?.id,
        media.availableAudioTracks.length,
        media.availableTextTracks.length
    ]);
}