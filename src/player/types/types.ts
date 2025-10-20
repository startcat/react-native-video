import React, { FunctionComponent } from "react";
import { type SubtitleStyle } from "../../types";

import * as Enums from "./enums";

import {
	type ICommonFlavourProps,
	type ICommonPlayerProps,
	type IPlayerProgress,
	type IPlayerProps,
	type IPlayerTimeMarkers,
} from "./newTypes";

import { PlayerContext } from "../core/context";

import { type IInnerPlayerEvents } from "./events";

import { type IPlayerCustomAudioComponents, type IPlayerCustomVideoComponents } from "./components";
import { CONTROL_ACTION } from "./enums";

// Define Headers locally to avoid circular dependency
export type Headers = Record<string, string>;

export interface IDrm {
	type?: Enums.DRM_TYPE;
	licenseServer?: string;
	headers?: Headers;
	contentId?: string;
	certificateUrl?: string;
	base64Certificate?: boolean;
	getLicense?: (
		spcBase64: string,
		contentId: string,
		licenseUrl: string,
		loadedLicenseUrl: string
	) => void;
	drmScheme?: string;
}

export interface ICommonData {
	time?: number;
	duration?: number;
	volume?: number;
	paused?: boolean;
	muted?: boolean;
	audioIndex?: number;
	subtitleIndex?: number;
	audioLabel?: string;
	subtitleLabel?: string;
	playbackRate?: number;
}

export interface IPreferencesCommonData {
	volume?: number;
	muted?: boolean;
	audioIndex?: number;
	subtitleIndex?: number;
	audioLabel?: string;
	subtitleLabel?: string;
	playbackRate?: number;
}

export interface IThumbnailMetadata {
	tileDuration: number;
	thumbnailDuration: number;
	url: string;
	width: number;
	height: number;
	imageWidth: number;
	imageHeight: number;
}

export interface IManifest {
	manifestURL: string;
	isExternal?: boolean;
	thumbnailTrackUrl?: string;
	thumbnailMetadata?: IThumbnailMetadata;
	type: Enums.STREAM_FORMAT_TYPE;
	dvr_window_minutes?: number;
	drmConfig?: {
		type: Enums.DRM_TYPE;
		licenseAcquisitionURL: string;
		certificateURL?: string;
	};
}

export interface IThumbnail {
	gridSecond: number;
	url: string;
	x: number;
	y: number;
	width: number;
	height: number;
	imageWidth: number;
	imageHeight: number;
	wrapperWidth: number;
	wrapperHeight: number;
}

export interface IMappedYoubora {
	[text: string]: string | number;
}

export interface IVideoSource {
	id?: number;
	title?: string;
	uri: string;
	type?: string;
	startPosition?: number;
	headers?: Headers;
	metadata?: {
		title?: string;
		subtitle?: string;
		description?: string;
		artist?: string;
		imageUri?: string;
	};
}

export interface IPlayerMenuData {
	type: Enums.PLAYER_MENU_DATA_TYPE;
	id?: number;
	index: number;
	code?: string;
	label: string;
}

export interface ILanguagesMapping {
	[code: string]: string;
}

// Cast types moved to /src/player/features/cast/types.ts for better organization
export interface ICastMetadata {
	id?: number;
	title?: string;
	subtitle?: string;
	description?: string;
	liveStartDate?: number;
	adTagUrl?: string;
	poster?: string;
	squaredPoster?: string;

	isOffline?: boolean;
	isLive?: boolean;
	hasNext?: boolean;

	startPosition?: number;
}

export interface ITimeMarkers {
	type: Enums.TIME_MARK_TYPE;
	start: number;
	end?: number;
	secondsToEnd?: number;
}

type YouboraCustomDimensions = {
	1?: string;
	2?: string;
	3?: string;
	4?: string;
	5?: string;
	6?: string;
	7?: string;
	8?: string;
	9?: string;
	10?: string;
};

type YouboraContent = {
	transactionCode?: string;
	id?: string;
	type?: string;
	title?: string;
	program?: string;
	isLive?: boolean;
	playbackType?: string;
	tvShow?: string;
	season?: string;
	episodeTitle?: string;
	channel?: string;
	customDimension?: YouboraCustomDimensions;
};

export type IYoubora = {
	accountCode: string;
	username?: string;
	content?: YouboraContent;
	offline?: boolean;
	userObfuscateIp?: boolean;
};

export type IYouboraSettingsFormat = Enums.YOUBORA_FORMAT;

export interface GetYouboraOptionsProps {
	data: IYoubora;
	format?: IYouboraSettingsFormat;
}

export interface LiveSeekableCastRange {
	isMovingWindow: boolean;
	isLiveDone: boolean;
	startTime: number;
	endTime: number;
}

/*
 *  Audio Player Events
 *  Para invocarlo desde distintos puntos de la app
 *
 */

export interface AudioPlayerEventProps {
	id: number;
	slug: string;
	collection?: string;
	type?: string;
	mediaType?: Enums.MEDIA_TYPE;
	media_format?: string;
	stream?: {
		id: number;
		mpd?: string;
		m3u8?: string;
		slug: string;
		title?: string;
		station?: number;
		mediaType: Enums.MEDIA_TYPE;
	};
	// Pensado para los falsos media (streams de directo cortados para simular un media)
	epgEntry?: any;
	// Campo extraData para incluir cosas que podamos necesitar según proyecto
	extraData?: any;
	isAutoNext?: boolean;
}

export interface AudioPlayerActionEventProps {
	action: Enums.CONTROL_ACTION;
	value?: boolean | number;
}

export interface AudioPlayerProgressEventProps {}

/*
 *  Props Componentes
 *
 */

export interface SeekableRange {
	start: number;
	end: number;
}

export interface IBasicProgram {
	id: string;
	title?: string;
	startDate: number;
	endDate: number;
	extraData?: any;
}

/**
 * Interfaz unificada de SliderValues que puede ser utilizada por todos los flavours
 * independientemente de si trabajan con contenido VOD o DVR.
 *
 * Propiedades básicas (siempre presentes):
 * - minimumValue, maximumValue, progress, percentProgress, canSeekToEnd
 *
 * Propiedades específicas de VOD (opcionales):
 * - duration: Duración total del contenido VOD
 *
 * Propiedades específicas de DVR (opcionales):
 * - liveEdge: Posición temporal del live edge
 * - percentLiveEdge: Porcentaje del live edge en el slider (0.0 - 1.0)
 * - progressDatum: Timestamp absoluto de la posición actual
 * - liveEdgeOffset: Segundos de retraso respecto al live edge
 * - isProgramLive: Indica si el programa actual está en directo
 */
export interface SliderValues {
	// Propiedades básicas (obligatorias)
	minimumValue: number;
	maximumValue: number;
	progress: number;
	percentProgress: number; // Porcentaje del slider (0.0 - 1.0)
	canSeekToEnd: boolean; // Indica si se puede hacer seek hasta el final

	// Propiedades específicas de VOD (opcionales)
	duration?: number; // Duración del media para contenido VOD

	// Propiedades específicas de DVR (opcionales)
	liveEdge?: number | null; // Posición temporal del live edge
	percentLiveEdge?: number; // Porcentaje del live edge (0.0 - 1.0)
	progressDatum?: number | null; // Timestamp absoluto del progress
	liveEdgeOffset?: number | null; // Segundos por detrás del live edge
	isProgramLive?: boolean; // Indica si el programa está en directo
	isLiveEdgePosition?: boolean; // Indica si la posición actual está en el live edge
}

export interface ProgressUpdateData extends SliderValues {
	isProgramLive?: boolean; // Indica si el programa está en directo
	isLiveEdgePosition?: boolean; // Si estamos en el edgeLive
	isPaused: boolean;
	isBuffering: boolean;
	playbackType?: Enums.DVR_PLAYBACK_TYPE;
	currentProgram?: IBasicProgram | null;
	windowCurrentSizeInSeconds?: number;
	canSeekToEnd: boolean; // Para VOD
}

export interface ButtonProps {
	id: Enums.CONTROL_ACTION;
	iconName?: string;
	value?: boolean | number;
	size?: Enums.BUTTON_SIZE;
	disabled?: boolean;
	accessibilityLabel?: string;
	children?: React.ReactNode;
	onPress?: (id: Enums.CONTROL_ACTION, value?: any) => void;
}

export interface TimeMarkButtonProps {
	title?: string;
	id?: Enums.CONTROL_ACTION;
	value?: boolean | number;
	disabled?: boolean;
	accessibilityLabel?: string;
	onPress?: (id: Enums.CONTROL_ACTION, value?: any) => void;
}

export interface TimeMarkExternalButtonProps {
	onPress?: () => void;
}

export interface NextButtonProps {
	onPress?: (id: Enums.CONTROL_ACTION, value?: any) => void;
}

export interface AirplayCastButtonProps {
	iconName?: string;
	disabled?: boolean;
	accessibilityLabel?: string;
	onPress?: (id: Enums.CONTROL_ACTION, value?: any) => void;
}

export interface LiveButtonProps {
	currentTime?: number;
	duration?: number;
	dvrTimeValue?: number;
	isDVR?: boolean;
	disabled?: boolean;
	isLiveEdgePosition?: boolean;
	accessibilityLabel?: string;
	onPress?: (id: Enums.CONTROL_ACTION, value?: any) => void;
}

export interface SkipButtonProps {
	id: Enums.CONTROL_ACTION.SKIP_INTRO | Enums.CONTROL_ACTION.SKIP_CREDITS;
	disabled?: boolean;
	accessibilityLabel?: string;
	currentTime?: number;
	onPress?: (id: Enums.CONTROL_ACTION, value?: any) => void;
}

export interface BackgroundPosterProps {
	poster?: string;
	children?: React.ReactNode;
}

export interface MenuItemProps {
	data: IPlayerMenuData;
	selected?: boolean;
	onPress?: (id: Enums.CONTROL_ACTION, value?: any) => void;
}

export interface HeaderMetadataProps {
	onPress?: (id: Enums.CONTROL_ACTION, value?: any) => void;
}

export interface MenuProps {
	menuData?: Array<IPlayerMenuData>;
	videoIndex?: number;
	audioIndex?: number;
	subtitleIndex?: number;
	speedRate?: number;
	onPress?: (id: CONTROL_ACTION, value?: any) => void;
	onClose?: () => void;
}

export interface SliderVODProps extends SliderValues {
	thumbnailsMetadata?: IThumbnailMetadata;
	onSlidingStart?: (value: number) => void;
	onSlidingMove?: (value: number) => void;
	onSlidingComplete?: (value: number) => void;
	avoidTexts?: boolean;
}

export interface SliderDVRProps extends SliderValues {
	thumbnailsMetadata?: IThumbnailMetadata;
	onSlidingStart?: (value: number) => void;
	onSlidingMove?: (value: number) => void;
	onSlidingComplete?: (value: number) => void;
	avoidTexts?: boolean;
}

export interface TimelineTextProps {
	value?: number | string;
	align?: "center" | "left" | "right";
	containerStyle?: any;
	textStyle?: any;
	category?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "s1" | "s2" | "p1" | "p2" | "c1" | "c2";
}

export interface ThumbnailCellProps {
	seconds: number;
	index?: number;
	active?: boolean;
	metadata: IThumbnailMetadata;
	cell_width?: number;
	offset?: number;
}

export interface ThumbnailsContainerProps {
	seconds?: number;
	metadata: IThumbnailMetadata;
	style?: any;
}

export interface TimelineProps {
	playerProgress?: IPlayerProgress;

	avoidThumbnails?: boolean;
	thumbnailsMetadata?: IThumbnailMetadata;

	// Components
	sliderVOD?: FunctionComponent<SliderVODProps>;
	sliderDVR?: FunctionComponent<SliderDVRProps>;

	// Events
	onSlidingStart?: (value: number) => void;
	onSlidingMove?: (value: number) => void;
	onSlidingComplete?: (value: number) => void;
}

export interface TimeMarksProps {
	playerProgress?: IPlayerProgress;
	playerTimeMarkers?: IPlayerTimeMarkers;
	style?: any;

	// Custom Components
	components?: IPlayerCustomVideoComponents;

	// Events
	onPress?: (id: CONTROL_ACTION, value?: any) => void;
}

export interface IAudioPlayerContent {
	current?: AudioPlayerEventProps | null;
	next?: AudioPlayerEventProps | null;
}

export interface ControlsBarProps extends ICommonPlayerProps {
	preloading?: boolean;
	isContentLoaded?: boolean;
	isChangingSource?: boolean;

	// Custom Components
	components?: IPlayerCustomVideoComponents;

	// Events
	events: IInnerPlayerEvents;
}

export interface ControlsProps extends ICommonPlayerProps {
	preloading?: boolean;
	thumbnailsMetadata?: IThumbnailMetadata;
	avoidTimelineThumbnails?: boolean;
	isContentLoaded?: boolean;
	isChangingSource?: boolean;

	// Custom Components
	components?: IPlayerCustomVideoComponents;

	//Events
	events: IInnerPlayerEvents;
}

export interface AudioControlsProps extends ICommonPlayerProps {
	preloading?: boolean;
	isContentLoaded?: boolean;
	speedRate?: number;
	extraData?: any;
	sleepTimer?: {
		isActive: boolean;
		remainingSeconds: number;
	};

	// Custom Components
	components?: IPlayerCustomAudioComponents;

	//Events
	events: IInnerPlayerEvents;
}

export interface OverlayProps extends ICommonPlayerProps {
	preloading?: boolean;
	thumbnailsMetadata?: IThumbnailMetadata;
	avoidTimelineThumbnails?: boolean;

	alwaysVisible?: boolean;
	isChangingSource?: boolean;

	isContentLoaded?: boolean;

	menuData?: Array<IPlayerMenuData>;
	videoIndex?: number;
	audioIndex?: number;
	subtitleIndex?: number;
	speedRate?: number;

	// Custom Components
	components?: IPlayerCustomVideoComponents;

	// Events
	events: IInnerPlayerEvents;
}

export interface AudioFlavourProps extends ICommonFlavourProps, ICommonPlayerProps {
	playerContext?: PlayerContext;
	languagesMapping?: ILanguagesMapping;

	// Extra data
	extraData?: any;

	// Style
	backgroundColor?: string;
	topDividerColor?: string;

	// Components
	controls?: FunctionComponent<AudioControlsProps>;
	components?: IPlayerCustomAudioComponents;
}

export interface AudioCastFlavourProps extends ICommonFlavourProps, ICommonPlayerProps {
	playerContext?: PlayerContext;
	languagesMapping?: ILanguagesMapping;

	// Extra data
	extraData?: any;

	// Style
	backgroundColor?: string;
	topDividerColor?: string;

	// Components
	controls?: FunctionComponent<AudioControlsProps>;
	components?: IPlayerCustomAudioComponents;
}

export interface NormalFlavourProps extends ICommonFlavourProps, ICommonPlayerProps {
	playerContext?: PlayerContext;
	languagesMapping?: ILanguagesMapping;
	avoidTimelineThumbnails?: boolean;

	// Custom Components
	components?: IPlayerCustomVideoComponents;
}

export interface CastFlavourProps extends ICommonFlavourProps, ICommonPlayerProps {
	playerContext?: PlayerContext;
	languagesMapping?: ILanguagesMapping;
	avoidTimelineThumbnails?: boolean;

	// Custom Components
	components?: IPlayerCustomVideoComponents;
}

export interface PlayerProps extends IPlayerProps {
	languagesMapping?: ILanguagesMapping;
	audioIndex?: number;
	subtitleIndex?: number;
	subtitleStyle?: SubtitleStyle;

	avoidTimelineThumbnails?: boolean;
	avoidRotation?: boolean;
	avoidDownloadsManagement?: boolean;

	// Custom Components
	components?: IPlayerCustomVideoComponents;
}

export interface AudioPlayerContentsDpo extends IPlayerProps {
	// Custom Components
	components?: IPlayerCustomAudioComponents;
}

export interface AudioPlayerProps {
	playerMaxHeight?: number;
	backgroundColor?: string;
	topDividerColor?: string;
	style?: any;

	// Components
	controls?: FunctionComponent<AudioControlsProps>;
	loader?: FunctionComponent;

	// Utils
	fetchContentData?: (data: AudioPlayerEventProps) => Promise<AudioPlayerContentsDpo | null>;
}

/*
	interface AudioPlayerContentsDpo {
		playlist: PlaylistItem[];
		playlistConfig?: PlaylistConfig;

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

		// Custom Components
		components?: IPlayerCustomAudioComponents;
	}
*/

/*
	interface AudioFlavourProps {
		playlistItem: PlaylistItem | null;

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

		languagesMapping?: ILanguagesMapping;

		// Extra data
		extraData?: any;

		// Style
		backgroundColor?: string;
		topDividerColor?: string;

		// Components
		controls?: FunctionComponent<AudioControlsProps>;
		components?: IPlayerCustomAudioComponents;
	}
*/
