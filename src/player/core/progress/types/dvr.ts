import { type SliderValues } from '../../../types/types';
import { DVR_PLAYBACK_TYPE } from './enums';

import {
    type BaseProgressManagerOptions,
    type BaseUpdatePlayerData
} from './base';

export interface EPGErrorData {
    timestamp: number;
    error: any;
    retryCount: number;
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

export interface DVRUpdatePlayerData extends BaseUpdatePlayerData {
    // DVR puede tener propiedades adicionales específicas si es necesario
}

export interface DVRProgressManagerOptions extends BaseProgressManagerOptions {
    // Opciones específicas del DVR
    dvrWindowSeconds?: number;
    playbackType?: DVR_PLAYBACK_TYPE;
    getEPGProgramAt?: ((timestamp: number) => Promise<any>) | null;
    onModeChange?: ((data: ModeChangeData) => void) | null;
    onProgramChange?: ((data: ProgramChangeData) => void) | null;
    onEPGRequest?: ((timestamp: number) => void) | null;
    onEPGError?: ((data: EPGErrorData) => void) | null;
}

export interface DVRProgressUpdateData extends SliderValues {
    isPaused: boolean;
    isBuffering: boolean;
    isLiveEdgePosition: boolean;
    playbackType: DVR_PLAYBACK_TYPE;
    currentProgram: any | null;
    windowCurrentSizeInSeconds: number | null;
    canSeekToEnd: boolean;
}