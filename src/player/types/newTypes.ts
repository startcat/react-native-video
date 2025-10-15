/*
 *  Player Logical Props
 *
 */

import { PlayerContext } from "../core/context";
import { type PlayerAnalyticsPlugin } from "../features/analytics/types";
import { type LoggerConfigBasic } from "../features/logger/types";
import * as Enums from "./enums";

import {
	type PlaylistConfig,
	type PlaylistItem,
	PlaylistItemType,
} from "../features/playlists/types";

import {
	type IBasicProgram,
	type IInnerPlayerEvents,
	type IPlayerHooks,
	type ITimeMarkers,
	type IYoubora,
	type SliderValues,
} from "./index";

import { type SubtitleStyle } from "../../types";

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
	subtitle?: string;
	description?: string;
	poster?: string;
	squaredPoster?: string;
	raw?: any;
	artist?: string;
}

export interface IPlayerInitialState {
	isPaused?: boolean;
	isMuted?: boolean;
	volume?: number;

	// Configuración inicial de pistas
	audioIndex?: number;
	subtitleIndex?: number;
	subtitleStyle?: SubtitleStyle;
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
	playlistItemType?: PlaylistItemType;
	playerContext?: PlayerContext;
	playerMetadata?: IPlayerMetadata;
	playerProgress?: IPlayerProgress;
	playerAnalytics?: IPlayerAnalytics;
	playerTimeMarkers?: IPlayerTimeMarkers;
	playerAds?: IPlayerAds;
}

export interface IPlayerFeatures {
	analyticsConfig?: PlayerAnalyticsPlugin[];
}

export interface IPlayerLogger {
	core?: LoggerConfigBasic;
	progressManager?: LoggerConfigBasic;
	cast?: LoggerConfigBasic;
	ads?: LoggerConfigBasic;
	analytics?: LoggerConfigBasic;
	offline?: LoggerConfigBasic;
	timeMarkers?: LoggerConfigBasic;
	tudum?: LoggerConfigBasic;
}

export interface IPlayerAndFlavourProps {
	// Initial State
	initialState?: IPlayerInitialState;

	// Hooks
	hooks?: IPlayerHooks;

	// Events
	events?: IInnerPlayerEvents;

	// Player Features
	features?: IPlayerFeatures;

	// Player Logger
	logger?: IPlayerLogger;
}

export interface IPlayerProps extends IPlayerAndFlavourProps {
	playlist: PlaylistItem[];
	playlistConfig?: PlaylistConfig;
}

export interface ICommonFlavourProps extends IPlayerAndFlavourProps {
	playlistItem: PlaylistItem | null;
}
