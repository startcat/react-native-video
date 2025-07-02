/*
 *  Player Logical Props
 *
 */

import * as Enums from './enums';

import { 
    type IBasicProgram,
    type SliderValues,
    type IYoubora,
} from './index';

export interface IPlayerLiveValues {
    playbackType: Enums.DVR_PLAYBACK_TYPE;
    currentProgram: IBasicProgram | null;
    currentRealTime: number;
    isLiveEdgePosition: boolean;
    multiSession?: boolean;
    forcedDvrWindowMinutes?: number;
}

export interface IPlayerMetadata {
    id: number;
    slug: string;
    title: string;
    subtitle?: string
    description?: string;
    poster?: string;
    squaredPoster?: string;
}

export interface IPlayerInitialState {
    currentTime: number;
    duration?: number;
    isPaused?: boolean;
    isMuted?: boolean;
    volume?: number;
}
export interface IPlayerProgress {
    currentTime: number;
    duration?: number;
    isBuffering: boolean;
    isPaused: boolean;
    isLive: boolean;
    isDVR: boolean;
    isMuted: boolean;
    volume: number;
    hasNext: boolean;
    hasPrev: boolean;
    type?: Enums.STREAM_TYPE;
    mediaType?: Enums.MEDIA_TYPE;
    sliderValues?: SliderValues;
    liveValues?: IPlayerLiveValues;
}

export interface IPlayerAnalytics {
    youbora?: IYoubora;
}

export interface IPlayerAds {
    adTagUrl?: string;
}

export interface IPlayerTimeMarkers {
    
}

export interface ICommonPlayerProps {
    playerMetadata?: IPlayerMetadata;
    playerProgress?: IPlayerProgress;
    playerAnalytics?: IPlayerAnalytics;
    playerTimeMarkers?: IPlayerTimeMarkers;
    playerAds?: IPlayerAds;    
}