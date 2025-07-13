import { DVR_PLAYBACK_TYPE } from './enums';

export interface SeekableRange {
    start: number;
    end: number;
}

export interface ProgramChangeData {
    previousProgram: any | null; // IBasicProgram
    currentProgram: any | null;
}

export interface ModeChangeData {
    previousType: DVR_PLAYBACK_TYPE;
    playbackType: DVR_PLAYBACK_TYPE;
    program: any | null;
}

export interface UpdatePlayerData {
    currentTime: number;
    duration?: number;
    seekableRange: SeekableRange;
    isBuffering: boolean;
    isPaused: boolean;
}