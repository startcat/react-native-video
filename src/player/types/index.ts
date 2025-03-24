import { FunctionComponent } from 'react';

export enum STREAM_FORMAT_TYPE {
	DASH = 'dash',
	HLS = 'hls',
    MP3 = 'mp3'
}

export enum STREAM_TYPE {
	VOD = 'vod',
	LIVE = 'live',
}

export enum MEDIA_TYPE {
	AUDIO = 'audio',
	VIDEO = 'video',
}

export enum COLLECTION {
	MEDIA = 'media',
	STREAM = 'stream',
	SERIES = 'series',
}

export enum DRM_TYPE {
	WIDEVINE = 'widevine',
	PLAYREADY = 'playready',
    CLEARKEY = "clearkey",
	FAIRPLAY = 'fairplay',
}

export enum BUTTON_SIZE {
	SMALL = 'small',
	MEDIUM = 'medium',
    BIG = 'big',
}

export enum TIME_MARK_TYPE {
	INTRO = 'intro',
	RECAP = 'recap',
    CREDITS = 'credits',
    NEXT = 'next'
}

export enum CONTROL_ACTION {
    PAUSE = 'pause',
    BACK = 'back',
    AIRPLAY = 'airplay',
    CAST = 'cast',
    SKIP_INTRO = 'skipIntro',
    SKIP_CREDITS = 'skipCredits',
    SKIP_RECAP = 'skipRecap',
    NEXT = 'next',
    PREVIOUS = 'previous',
    MUTE = 'mute',
    MENU = 'menu',
    MENU_CLOSE = 'menuClose',
    SETTINGS_MENU = 'settingsMenu',
    VOLUME = 'volume',
    BACKWARD = 'backward',
    FORWARD = 'forward',
    SEEK = 'seek',
    SEEK_OVER_EPG = 'seekOverEpg',
    VIDEO_INDEX = 'videoIndex',
    AUDIO_INDEX = 'audioIndex',
    SUBTITLE_INDEX = 'subtitleIndex',
    SPEED_RATE = 'speedRate',
    CLOSE_NEXT_POPUP = 'closeNextPopup',
    CLOSE_AUDIO_PLAYER = 'closeAudioPlayer',
    HIDE_AUDIO_PLAYER = 'hideAudioPlayer',
    SLEEP = 'sleep',
    CANCEL_SLEEP = 'sleep_cancel'
}

export enum PLAYER_MENU_DATA_TYPE {
    VIDEO = 'video',
    AUDIO = 'audio',
    TEXT = 'text',
    RATE = 'rate'
}

export enum YOUBORA_FORMAT {
    MOBILE = 'mobile',
    CAST = 'cast'
}

export type Headers = Record<string, string>;

export interface IDrm {
    type?: DRM_TYPE;
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
	type: STREAM_FORMAT_TYPE;
	dvr_window_minutes?: number;
	drmConfig?: {
		type: DRM_TYPE;
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
    type: PLAYER_MENU_DATA_TYPE,
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
    type: TIME_MARK_TYPE;
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

export type IYouboraSettingsFormat = YOUBORA_FORMAT;

export interface GetYouboraOptionsProps {
    data: IYoubora,
	format?: IYouboraSettingsFormat
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
    media_type?: MEDIA_TYPE;
    media_format?: string;
    stream?: {
        id: number;
        mpd?: string;
        m3u8?: string;
        slug: string;
        title?: string;
        station?: number;
        media_type: MEDIA_TYPE,
    },
    // Pensado para los falsos media (streams de directo cortados para simular un media)
    epgEntry?: any;
    // Campo extraData para incluir cosas que podamos necesitar según proyecto
    extraData?: any;
}

export interface AudioPlayerActionEventProps {
    action: CONTROL_ACTION,
    value?: boolean | number;
}

export interface AudioPlayerProgressEventProps {

}



/*
 *  Props Componentes
 *
 */

export interface ButtonProps {
    id: CONTROL_ACTION;
    iconName?: string;
    value?: boolean | number;
    size?: BUTTON_SIZE;
    disabled?: boolean;
    accessibilityLabel?: string;
    children?: React.ReactNode;
    onPress?: (id: CONTROL_ACTION, value?: any) => void;
}

export interface TimeMarkButtonProps {
    title?: string;
    id?: CONTROL_ACTION;
    value?: boolean | number;
    disabled?: boolean;
    accessibilityLabel?: string;
    onPress?: (id: CONTROL_ACTION, value?: any) => void;
}

export interface TimeMarkExternalButtonProps {
    onPress?: () => void;
}

export interface NextButtonProps {
    onPress?: (id: CONTROL_ACTION, value?: any) => void;
}

export interface AirplayCastButtonProps {
    iconName?: string;
    disabled?: boolean;
    accessibilityLabel?: string;
    onPress?: (id: CONTROL_ACTION, value?: any) => void;
}

export interface LiveButtonProps {
    currentTime?: number;
    duration?: number;
    dvrTimeValue?: number;
    isDVR?: boolean;
    disabled?: boolean;
    accessibilityLabel?: string;
    onPress?: (id: CONTROL_ACTION, value?: any) => void;
}

export interface SkipButtonProps {
    id: CONTROL_ACTION.SKIP_INTRO | CONTROL_ACTION.SKIP_CREDITS;
    disabled?: boolean;
    accessibilityLabel?: string;
    currentTime?: number;
    onPress?: (id: CONTROL_ACTION, value?: any) => void;
}

export interface BackgroundPosterProps {
    poster?: string;
    children?: React.ReactNode;
}

export interface MenuItemProps {
    data: IPlayerMenuData;
    selected?: boolean;
    onPress?: (id: CONTROL_ACTION, value?:any) => void;
}

export interface HeaderMetadataProps {
    onPress?: (id: CONTROL_ACTION, value?:any) => void;
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

export interface SliderVODProps {
    currentTime?: number;
    duration?: number;
    onSlidingStart?: (value: number) => void;
    onSlidingMove?: (value: number) => void;
    onSlidingComplete?: (value: number) => void;
}

export interface SliderDVRProps {
    value?: number;
    liveLoadTime?: number;
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
    currentTime?: number;
    duration?: number;
    dvrTimeValue?: number;
    isLive?: boolean;
    isDVR?: boolean;
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
    currentTime?: number;
    duration?: number;
    timeMarkers?: Array<ITimeMarkers>;
    hasNext?: boolean;

    // Components
    nextButton?: FunctionComponent<NextButtonProps>;
    skipIntroButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    skipRecapButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    skipCreditsButton?: FunctionComponent<TimeMarkExternalButtonProps>;

    // Events
    onPress?: (id: CONTROL_ACTION, value?: any) => void;
}

export interface IAudioPlayerContent {
    current?: AudioPlayerEventProps | null;
    next?: AudioPlayerEventProps | null;
}

export interface ControlsBarProps {
    title?:string;
    currentTime?: number;
    dvrTimeValue?: number;
    duration?: number;
    paused?: boolean;
    muted?: boolean;
    volume?: number;
    preloading?: boolean;
    hasNext?: boolean;
    isLive?: boolean;
    isDVR?: boolean;
    isContentLoaded?: boolean;
    
    // Components
    headerMetadata?: FunctionComponent<HeaderMetadataProps>;
    nextButton?: FunctionComponent<NextButtonProps>;
    liveButton?: FunctionComponent<LiveButtonProps>;

    // Events
    onPress?: (id: CONTROL_ACTION, value?: any) => void;
    onSlidingStart?: (value: number) => void;
    onSlidingMove?: (value: number) => void;
    onSlidingComplete?: (value: number) => void;
}

export interface ControlsProps {
    title?:string;
    currentTime?: number;
    dvrTimeValue?: number;
    duration?: number;
    paused?: boolean;
    muted?: boolean;
    volume?: number;
    preloading?: boolean;
    hasNext?: boolean;
    thumbnailsMetadata?: IThumbnailMetadata;
    timeMarkers?: Array<ITimeMarkers>;
    isLive?: boolean;
    isDVR?: boolean;
    isContentLoaded?: boolean;

    // Components
    headerMetadata?: FunctionComponent<HeaderMetadataProps>;
    sliderVOD?: FunctionComponent<SliderVODProps>;
    sliderDVR?: FunctionComponent<SliderDVRProps>;
    controlsBottomBar?: FunctionComponent<ControlsBarProps>;
    controlsMiddleBar?: FunctionComponent<ControlsBarProps>;
    controlsHeaderBar?: FunctionComponent<ControlsBarProps>;
    nextButton?: FunctionComponent<NextButtonProps>;
    liveButton?: FunctionComponent<LiveButtonProps>;
    skipIntroButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    skipRecapButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    skipCreditsButton?: FunctionComponent<TimeMarkExternalButtonProps>;

    //Events
    onPress?: (id: CONTROL_ACTION, value?:any) => void;
    onSlidingStart?: (value: number) => void;
    onSlidingMove?: (value: number) => void;
    onSlidingComplete?: (value: number) => void;
}

export interface AudioControlsProps {
    title?:string;
    description?:string;
    currentTime?: number;
    dvrTimeValue?: number;
    duration?: number;
    paused?: boolean;
    muted?: boolean;
    volume?: number;
    preloading?: boolean;
    hasNext?: boolean;
    hasPrev?: boolean;
    isLive?: boolean;
    isDVR?: boolean;
    isContentLoaded?: boolean;
    speedRate?: number;
    extraData?: any;

    //Events
    onPress?: (id: CONTROL_ACTION, value?:any) => void;
    onSlidingStart?: (value: number) => void;
    onSlidingMove?: (value: number) => void;
    onSlidingComplete?: (value: number) => void;
}

export interface OverlayProps {
    title?:string;
    currentTime?: number;
    dvrTimeValue?: number;
    duration?: number;
    paused?: boolean;
    muted?: boolean;
    volume?: number;
    preloading?: boolean;
    hasNext?: boolean;
    thumbnailsMetadata?: IThumbnailMetadata;
    timeMarkers?: Array<ITimeMarkers>;
    
    alwaysVisible?: boolean;
    
    isLive?: boolean;
    isDVR?: boolean;
    isContentLoaded?: boolean;
    
    menuData?: Array<IPlayerMenuData>;
    videoIndex?: number;
    audioIndex?: number;
    subtitleIndex?: number;
    speedRate?: number;

    // Components
    mosca?: React.ReactElement;
    headerMetadata?: FunctionComponent<HeaderMetadataProps>;
    sliderVOD?: FunctionComponent<SliderVODProps>;
    sliderDVR?: FunctionComponent<SliderDVRProps>;
    controlsBottomBar?: FunctionComponent<ControlsBarProps>;
    controlsMiddleBar?: FunctionComponent<ControlsBarProps>;
    controlsHeaderBar?: FunctionComponent<ControlsBarProps>;
    nextButton?: FunctionComponent<NextButtonProps>;
    liveButton?: FunctionComponent<LiveButtonProps>;
    skipIntroButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    skipRecapButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    skipCreditsButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    menu?: FunctionComponent<MenuProps>;
    settingsMenu?: FunctionComponent<MenuProps>;

    // Events
    onPress?: (id: CONTROL_ACTION, value?:any) => void;
    onSlidingStart?: (value: number) => void;
    onSlidingMove?: (value: number) => void;
    onSlidingComplete?: (value: number) => void;
}

export interface AudioFlavourProps {
    id?:number;
    title?:string;
    subtitle?:string;
    description?:string;
    liveStartDate?:string;

    manifests?:Array<IManifest>,
    headers?: Headers;
    showExternalTudum?: boolean;
    youbora?: IYoubora;
    poster?: string;
    squaredPoster?: string;
    forcedDvrWindowMinutes?: number;

    playOffline?: boolean;
    multiSession?: boolean;
    isLive?: boolean;
    hasNext?: boolean;
    hasPrev?: boolean;

    paused?: boolean;
    muted?: boolean;
    volume?: number;

    currentTime?: number;
    languagesMapping?:ILanguagesMapping;
    mapHlsQualities?: boolean;

    // Extra data
    extraData?: any;

    // Style
    backgroundColor?: string;
    topDividerColor?: string;

    // Components
    controls?: FunctionComponent<AudioControlsProps>;

    // Utils
    watchingProgressInterval?: number;
    addContentProgress?: (currentTime: number, duration: number, id?:number) => void;
    getYouboraOptions?: (data: IYoubora, format?: IYouboraSettingsFormat) => IMappedYoubora;
    getTudumSource?: () => IVideoSource | null | undefined;

    // Events
    onChangeCommonData?: (data: ICommonData) => void;
    onNext?: () => void;
    onPrevious?: () => void;
    onClose?: () => void;
    onEnd?: () => void;
    onDVRChange?: (value: number, offset?: number, date?: Date) => void;
}

export interface AudioCastFlavourProps {
    id?:number;
    title?:string;
    subtitle?:string;
    description?:string;
    liveStartDate?:string;

    manifests?:Array<IManifest>,
    headers?: Headers;
    youbora?: IYoubora;
    poster?: string;
    squaredPoster?: string;
    forcedDvrWindowMinutes?: number;

    playOffline?: boolean;
    multiSession?: boolean;
    isLive?: boolean;
    hasNext?: boolean;
    hasPrev?: boolean;

    paused?: boolean;
    muted?: boolean;
    volume?: number;

    currentTime?: number;
    languagesMapping?:ILanguagesMapping;
    mapHlsQualities?: boolean;

    // Extra data
    extraData?: any;

    // Style
    backgroundColor?: string;
    topDividerColor?: string;

    // Components
    controls?: FunctionComponent<AudioControlsProps>;

    // Utils
    watchingProgressInterval?: number;
    addContentProgress?: (currentTime: number, duration: number, id?:number) => void;
    getYouboraOptions?: (data: IYoubora, format?: IYouboraSettingsFormat) => IMappedYoubora;

    // Events
    onChangeCommonData?: (data: ICommonData) => void;
    onNext?: () => void;
    onPrevious?: () => void;
    onClose?: () => void;
    onEnd?: () => void;
    onDVRChange?: (value: number, offset?: number, date?: Date) => void;
}

export interface NormalFlavourProps {
    id?:number;
    title?:string;
    subtitle?:string;
    description?:string;
    liveStartDate?:string;

    manifests?:Array<IManifest>,
    headers?: Headers;
    showExternalTudum?: boolean;
    youbora?: IYoubora;
    adTagUrl?: string;
    poster?: string;
    squaredPoster?: string;

    playOffline?: boolean;
    multiSession?: boolean;
    isLive?: boolean;
    hasNext?: boolean;

    paused?: boolean;
    muted?: boolean;
    volume?: number;

    currentTime?: number;
    audioIndex?: number;
    subtitleIndex?: number;
    languagesMapping?:ILanguagesMapping;
    mapHlsQualities?: boolean;

    timeMarkers?: Array<ITimeMarkers>;

    // Components
    mosca?: React.ReactElement;
    headerMetadata?: FunctionComponent<HeaderMetadataProps>;
    sliderVOD?: FunctionComponent<SliderVODProps>;
    sliderDVR?: FunctionComponent<SliderDVRProps>;
    controlsBottomBar?: FunctionComponent<ControlsBarProps>;
    controlsMiddleBar?: FunctionComponent<ControlsBarProps>;
    controlsHeaderBar?: FunctionComponent<ControlsBarProps>;
    nextButton?: FunctionComponent<NextButtonProps>;
    liveButton?: FunctionComponent<LiveButtonProps>;
    skipIntroButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    skipRecapButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    skipCreditsButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    menu?: FunctionComponent<MenuProps>;
    settingsMenu?: FunctionComponent<MenuProps>;

    // Utils
    getTudumManifest?: () => IManifest | null | undefined;
    getYouboraOptions?: (data: IYoubora, format?: IYouboraSettingsFormat) => IMappedYoubora;

    // Events
    onChangeCommonData?: (data: ICommonData) => void;
    onDVRChange?: (value: number, offset?: number, date?: Date) => void;
    onSeekOverEpg?: () => number | null;
    onPress?: (id: CONTROL_ACTION, value?:any) => void;
    onNext?: () => void;
    onEnd?: () => void;
}

export interface CastFlavourProps {
    id?:number;
    title?:string;
    subtitle?:string;
    description?:string;
    liveStartDate?:string;

    manifests?:Array<IManifest>,
    headers?: Headers;
    youbora?: IYoubora;
    adTagUrl?: string;
    poster?: string;
    squaredPoster?: string;

    isLive?: boolean;
    hasNext?: boolean;
    hasPrev?: boolean;

    paused?: boolean;
    muted?: boolean;
    volume?: number;

    currentTime?: number;
    audioIndex?: number;
    subtitleIndex?: number;
    languagesMapping?:ILanguagesMapping;
    mapHlsQualities?: boolean;

    timeMarkers?: Array<ITimeMarkers>;

    // Components
    mosca?: React.ReactElement;
    headerMetadata?: FunctionComponent<HeaderMetadataProps>;
    sliderVOD?: FunctionComponent<SliderVODProps>;
    sliderDVR?: FunctionComponent<SliderDVRProps>;
    controlsBottomBar?: FunctionComponent<ControlsBarProps>;
    controlsMiddleBar?: FunctionComponent<ControlsBarProps>;
    controlsHeaderBar?: FunctionComponent<ControlsBarProps>;
    nextButton?: FunctionComponent<NextButtonProps>;
    liveButton?: FunctionComponent<LiveButtonProps>;
    skipIntroButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    skipRecapButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    skipCreditsButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    menu?: FunctionComponent<MenuProps>;
    settingsMenu?: FunctionComponent<MenuProps>;

    // Utils
    getYouboraOptions?: (data: IYoubora, format?: IYouboraSettingsFormat) => IMappedYoubora;

    // Events
    onChangeCommonData?: (data: ICommonData) => void;
    onDVRChange?: (value: number, offset?: number, date?: Date) => void;
    onSeekOverEpg?: () => number | null;
    onPress?: (id: CONTROL_ACTION, value?:any) => void;
    onNext?: () => void;
    onEnd?: () => void;
}

export interface PlayerProps {
    id?:number,
    title?:string;
    subtitle?:string;
    description?:string;
    manifests?:Array<IManifest>,
    showExternalTudum?:boolean;

    youbora?: IYoubora;
    adTagUrl?: string;
    poster?: string;
    squaredPoster?: string;
    startPosition?: number;
    headers?: Headers;

    playOffline?: boolean;
    multiSession?: boolean;
    isLive?: boolean;
    liveStartDate?:string;
    hasNext?: boolean;
    timeMarkers?: Array<ITimeMarkers>;

    languagesMapping?:ILanguagesMapping;
    mapHlsQualities?: boolean;
    audioIndex?: number;
    subtitleIndex?: number;

    // Components
    mosca?: React.ReactElement;
    headerMetadata?: FunctionComponent<HeaderMetadataProps>;
    sliderVOD?: FunctionComponent<SliderVODProps>;
    sliderDVR?: FunctionComponent<SliderDVRProps>;
    controlsBottomBar?: FunctionComponent<ControlsBarProps>;
    controlsMiddleBar?: FunctionComponent<ControlsBarProps>;
    controlsHeaderBar?: FunctionComponent<ControlsBarProps>;
    nextButton?: FunctionComponent<NextButtonProps>;
    liveButton?: FunctionComponent<LiveButtonProps>;
    skipIntroButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    skipRecapButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    skipCreditsButton?: FunctionComponent<TimeMarkExternalButtonProps>;
    menu?: FunctionComponent<MenuProps>;
    settingsMenu?: FunctionComponent<MenuProps>;

    // Utils
    watchingProgressInterval?: number;
    addContentProgress?: (currentTime: number, duration: number, id?:number) => void;
    getTudumManifest?: () => IManifest | null | undefined;
    getYouboraOptions?: (data: IYoubora, format?: IYouboraSettingsFormat) => IMappedYoubora;

    // Events
    onError?: () => void;
    onNext?: () => void;
    onProgress?: (value: number, duration?: number) => void;
    onExit?: () => void;
    onEnd?: () => void;
    onChangeAudioIndex?: (index: number, label?: string) => void;
    onChangeSubtitleIndex?: (index: number, label?: string) => void;
    onDVRChange?: (value: number, offset?: number, date?: Date) => void;
    onSeekOverEpg?: () => number | null;
}

export interface AudioPlayerContentsDpo {
    collection: COLLECTION;
	id: number;
	slug: string;
	title: string;
    subtitle?: string
    description?: string;
	media_type?: MEDIA_TYPE;
    type?: STREAM_TYPE;
    startPosition?: number;
    showExternalTudum?: boolean;
    poster?: string;
    squaredPoster?: string;
    playOffline?: boolean;
    multiSession?: boolean;
    isLive?: boolean;
    hasNext?: boolean;
    hasPrev?: boolean;
    manifests?:Array<IManifest>,
    headers?: Headers;
    youbora?: IYoubora;
    extraData?: any;
    forcedDvrWindowMinutes?: number;

    // Utils
    watchingProgressInterval?: number;
    addContentProgress?: (currentTime: number, duration: number, id?:number) => void;
    getYouboraOptions?: (data: IYoubora, format?: IYouboraSettingsFormat) => IMappedYoubora;
    getTudumSource?: () => IVideoSource | null | undefined;

    // Events
    onError?: () => void;
    onExit?: () => void;
    onNext?: () => void;
    onPrevious?: () => void;
    onEnd?: () => void;
    onDVRChange?: (value: number, offset?: number, date?: Date) => void;
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