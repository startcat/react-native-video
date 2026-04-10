/*
 *  Player Logical Props
 *
 */

import { type PlayerAnalyticsPlugin } from "@overon/react-native-overon-player-analytics-plugins";
import { PlayerContext } from "../core/context";
import { type LoggerConfigBasic } from "../features/logger/types";
import * as Enums from "./enums";

import {
	type IBasicProgram,
	type IInnerPlayerEvents,
	type IPlayerHooks,
	type ITimeMarkers,
	type IYoubora,
	type SliderValues,
} from "./index";

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
	/**
	 * BCP-47 language code for the IMA SDK UI (e.g. "es", "eu", "en").
	 *
	 * Forces the language of the IMA-rendered ad UI (countdown, "Skip Ad"
	 * button label, "Learn More" CTA, "Advertisement" tag, AdChoices
	 * tooltip, error messages) regardless of the device locale.
	 *
	 * NOTE: IMA only supports a finite set of languages. Passing a code
	 * that is not in the supported list will silently fall back to the
	 * SDK default. Euskera (`eu`) is NOT supported by the IMA SDK — use
	 * `es` if you want the ad UI in Spanish on Basque devices.
	 *
	 * When omitted, iOS falls back to the device preferred language and
	 * Android falls back to the default `ImaSdkSettings` locale. This
	 * preserves the legacy behaviour for existing consumers.
	 *
	 * The value is read once when the IMA ads loader is created. Changing
	 * it on a player that is already playing an ad will NOT apply to the
	 * current ad — only to subsequent ad requests.
	 *
	 * Only applies to local playback. Ignored by cast flavours.
	 */
	language?: string;
}

export interface IPlayerTimeMarkers {
	timeMarkers?: Array<ITimeMarkers>;
}

export interface ICommonPlayerProps {
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

export interface ICommonFlavourProps {
	// Initial State
	initialState?: IPlayerInitialState;

	// Hooks
	hooks?: IPlayerHooks;

	// Events
	events: IInnerPlayerEvents;

	// Player Features
	features?: IPlayerFeatures;

	// Player Logger
	logger?: IPlayerLogger;
}
