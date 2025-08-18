/*
 *  Player Logical Props
 *
 */

import { type PlayerAnalyticsPlugin } from '../features/analytics/types';
import * as Enums from './enums';

import {
    type IBasicProgram,
    type ITimeMarkers,
    type IYoubora,
    type SliderValues
} from './index';

export interface IPlayerLiveValues {
    playbackType: Enums.DVR_PLAYBACK_TYPE;
    currentProgram?: IBasicProgram | null;
    currentRealTime?: number;
    isLiveEdgePosition?: boolean;
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
    startPosition: number;
    duration?: number;
    isPaused?: boolean;
    isMuted?: boolean;
    volume?: number;
}
export interface IPlayerProgress {
    currentTime?: number;
    duration?: number;
    isBuffering?: boolean;
    isContentLoaded?: boolean;
    isChangingSource?: boolean;
    isPaused?: boolean;
    isLive?: boolean;
    isDVR?: boolean;
    isMuted?: boolean;
    volume?: number;
    hasNext?: boolean;
    hasPrev?: boolean;
    type?: Enums.STREAM_TYPE;
    mediaType?: Enums.MEDIA_TYPE;
    sliderValues?: SliderValues;
    liveValues?: IPlayerLiveValues;
    currentProgram?: IBasicProgram | null;
}

export interface IPlayerAnalytics {
    youbora?: IYoubora;
}

export interface IPlayerAds {
    adTagUrl?: string;
}

export interface IPlayerTimeMarkers {
    timeMarkers?: Array<ITimeMarkers>;
}

export interface ICommonPlayerProps {
    playerMetadata?: IPlayerMetadata;
    playerProgress?: IPlayerProgress;
    playerAnalytics?: IPlayerAnalytics;
    playerTimeMarkers?: IPlayerTimeMarkers;
    playerAds?: IPlayerAds;    
}

export interface IPlayerFeatures {
    analyticsConfig?: PlayerAnalyticsPlugin[];
}
