import React, { FunctionComponent } from 'react';
import { type SubtitleStyle } from '../../types';

import * as Enums from './enums';

import {
    type IPlayerInitialState,
    type IPlayerProgress,
    type ICommonPlayerProps,
    type IPlayerTimeMarkers
} from './newTypes';

import { 
    type IPlayerEvents,
    type IInnerPlayerEvents
} from './events';

import { 
    type IPlayerHooks,
} from './hooks';

import {
    type IPlayerCustomAudioComponents,
    type IPlayerCustomVideoComponents
} from './components';
import { CONTROL_ACTION } from './enums';

// Define Headers locally to avoid circular dependency
export type Headers = Record<string, string>;



export interface IDrm {
    type?: Enums.DRM_TYPE;
    licenseServer?: string;
    headers?: Headers;
    contentId?: string;
    certificateUrl?: string;
    base64Certificate?: boolean;
    getLicense?: (spcBase64: string, contentId: string, licenseUrl: string, loadedLicenseUrl: string) => void;
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
    id?: number,
    title?: string,
    uri: string,
    type?: string,
    startPosition?: number;
    headers?: Headers;
    metadata?: {
        title?: string;
        subtitle?: string;
        description?: string;
        artist?: string;
        imageUri?: string;
    }
}

export interface IPlayerMenuData {
    type: Enums.PLAYER_MENU_DATA_TYPE,
    id?: number;
    index: number,
    code?: string,
    label: string
}

export interface ILanguagesMapping {
    [code: string]: string;
}

export interface ICastMetadata {
    id?:number;
    title?:string;
    subtitle?:string;
    description?:string;
    liveStartDate?:string;
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
}

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
}

export type IYoubora = {
	accountCode: string;
	username?: string;
	content?: YouboraContent;
	offline?: boolean;
	userObfuscateIp?: boolean;
}

export type IYouboraSettingsFormat = Enums.YOUBORA_FORMAT;

export interface GetYouboraOptionsProps {
    data: IYoubora,
	format?: IYouboraSettingsFormat
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
        mediaType: Enums.MEDIA_TYPE,
    },
    // Pensado para los falsos media (streams de directo cortados para simular un media)
    epgEntry?: any;
    // Campo extraData para incluir cosas que podamos necesitar según proyecto
    extraData?: any;
}

export interface AudioPlayerActionEventProps {
    action: Enums.CONTROL_ACTION,
    value?: boolean | number;
}

export interface AudioPlayerProgressEventProps {

}



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
}

export interface SliderValues {
    minimumValue: number;
    maximumValue: number;
    progress: number;
    canSeekToEnd: boolean;
    liveEdge?: number; // Usado en modo PLAYLIST para mostrar el límite real
    isProgramLive?: boolean; // Indica si el programa está en directo
}

export interface ProgressUpdateData extends SliderValues {
    isLiveEdgePosition: boolean;
    isPaused: boolean;
    isBuffering: boolean;
    playbackType?: Enums.DVR_PLAYBACK_TYPE;
    currentProgram?: IBasicProgram | null;
    currentRealTime?: number;
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
    onPress?: (id: Enums.CONTROL_ACTION, value?:any) => void;
}

export interface HeaderMetadataProps {
    onPress?: (id: Enums.CONTROL_ACTION, value?:any) => void;
}

export interface MenuProps {
    menuData?: Array<IPlayerMenuData>;
    videoIndex?: number;
    audioIndex?: number;
    subtitleIndex?: number;
    speedRate?: number;
    onPress?: (id: CONTROL_ACTION, value?:any) => void;
    onClose?: () => void;
}

export interface SliderVODProps extends SliderValues {
    thumbnailsMetadata?: IThumbnailMetadata;
    onSlidingStart?: (value: number) => void;
    onSlidingMove?: (value: number) => void;
    onSlidingComplete?: (value: number) => void;
}

export interface SliderDVRProps extends SliderValues {
    thumbnailsMetadata?: IThumbnailMetadata;
    onSlidingStart?: (value: number) => void;
    onSlidingMove?: (value: number) => void;
    onSlidingComplete?: (value: number) => void;
}

export interface TimelineTextProps {
    value?: number | string;
    align?: 'center' | 'left' | 'right';
    containerStyle?: any;
    textStyle?:any;
    category?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 's1' | 's2' | 'p1' | 'p2' | 'c1' | 'c2';
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
    style?:any;

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

export interface ControlsProps extends ICommonPlayerProps{
    preloading?: boolean;
    thumbnailsMetadata?: IThumbnailMetadata;
    timeMarkers?: Array<ITimeMarkers>;
    avoidTimelineThumbnails?: boolean;
    isContentLoaded?: boolean;
    isChangingSource?: boolean;

    // Custom Components
    components?: IPlayerCustomVideoComponents;

    //Events
    events: IInnerPlayerEvents;
}

export interface AudioControlsProps extends ICommonPlayerProps{
    preloading?: boolean;
    isContentLoaded?: boolean;
    speedRate?: number;
    extraData?: any;

    //Events
    events: IInnerPlayerEvents;
}

export interface OverlayProps extends ICommonPlayerProps {
    preloading?: boolean;
    thumbnailsMetadata?: IThumbnailMetadata;
    timeMarkers?: Array<ITimeMarkers>;
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

export interface AudioFlavourProps extends ICommonPlayerProps {
    liveStartDate?:string;
    manifests?:Array<IManifest>,
    headers?: Headers;
    showExternalTudum?: boolean;
    playOffline?: boolean;
    languagesMapping?:ILanguagesMapping;

    // Extra data
    extraData?: any;

    // Style
    backgroundColor?: string;
    topDividerColor?: string;

    // Initial State
    initialState?: IPlayerInitialState;

    // Components
    controls?: FunctionComponent<AudioControlsProps>;

    // Hooks
    hooks?: IPlayerHooks;

    // Events
    events: IInnerPlayerEvents;
}

export interface AudioCastFlavourProps extends ICommonPlayerProps {
    liveStartDate?:string;
    manifests?:Array<IManifest>,
    headers?: Headers;
    playOffline?: boolean;

    languagesMapping?:ILanguagesMapping;

    // Extra data
    extraData?: any;

    // Style
    backgroundColor?: string;
    topDividerColor?: string;

    // Initial State
    initialState?: IPlayerInitialState;

    // Components
    controls?: FunctionComponent<AudioControlsProps>;

    // Hooks
    hooks?: IPlayerHooks;

    // Events
    events: IInnerPlayerEvents;
}

export interface NormalFlavourProps extends ICommonPlayerProps {
    liveStartDate?:string;
    manifests?:Array<IManifest>,
    headers?: Headers;
    showExternalTudum?: boolean;
    playOffline?: boolean;

    audioIndex?: number;
    subtitleIndex?: number;
    languagesMapping?:ILanguagesMapping;
    subtitleStyle?: SubtitleStyle;

    timeMarkers?: Array<ITimeMarkers>;
    avoidTimelineThumbnails?: boolean;

    // Initial State
    initialState?: IPlayerInitialState;

    // Custom Components
    components?: IPlayerCustomVideoComponents;

    // Hooks
    hooks?: IPlayerHooks;

    // Events
    events: IInnerPlayerEvents;
}

export interface CastFlavourProps extends ICommonPlayerProps {
    liveStartDate?:string;

    manifests?:Array<IManifest>,
    headers?: Headers;

    audioIndex?: number;
    subtitleIndex?: number;
    languagesMapping?:ILanguagesMapping;

    timeMarkers?: Array<ITimeMarkers>;
    avoidTimelineThumbnails?: boolean;

    // Initial State
    initialState?: IPlayerInitialState;

    // Custom Components
    components?: IPlayerCustomVideoComponents;

    // Hooks
    hooks?: IPlayerHooks;

    // Events
    events: IInnerPlayerEvents;
}

export interface PlayerProps extends ICommonPlayerProps {
    manifests?:Array<IManifest>,
    showExternalTudum?:boolean;
    headers?: Headers;
    playOffline?: boolean;
    liveStartDate?:string;
    timeMarkers?: Array<ITimeMarkers>;

    languagesMapping?:ILanguagesMapping;
    audioIndex?: number;
    subtitleIndex?: number;
    subtitleStyle?: SubtitleStyle;

    avoidTimelineThumbnails?: boolean;
    avoidRotation?: boolean;
    avoidDownloadsManagement?: boolean;

    // Initial State
    initialState?: IPlayerInitialState;

    // Custom Components
    components?: IPlayerCustomVideoComponents;

    // Hooks
    hooks?: IPlayerHooks;

    // Events
    events: IPlayerEvents;
}

export interface AudioPlayerContentsDpo extends ICommonPlayerProps {
    collection: Enums.COLLECTION;
    showExternalTudum?: boolean;
    playOffline?: boolean;
    manifests?:Array<IManifest>,
    headers?: Headers;
    extraData?: any;

    // Initial State
    initialState?: IPlayerInitialState;

    // Custom Components
    components?: IPlayerCustomAudioComponents;

    // Hooks
    hooks?: IPlayerHooks;

    // Events
    events?: IPlayerEvents;
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