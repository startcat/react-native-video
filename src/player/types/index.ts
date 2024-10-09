import { FunctionComponent } from 'react';

export enum STREAM_FORMAT_TYPE {
	DASH = 'dash',
	HLS = 'hls',
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

export enum CONTROL_ACTION {
    PAUSE = 'pause',
    BACK = 'back',
    AIRPLAY = 'airplay',
    CAST = 'cast',
    SKIP_INTRO = 'skipIntro',
    SKIP_CREDITS = 'skipCredits',
    SKIP_RECAP = 'skipRecap',
    NEXT = 'next',
    MUTE = 'mute',
    MENU = 'menu',
    MENU_CLOSE = 'menuClose',
    SETTINGS_MENU = 'settingsMenu',
    VOLUME = 'volume',
    BACKWARD = 'backward',
    FORWARD = 'forward',
    SEEK = 'seek',
    VIDEO_INDEX = 'videoIndex',
    AUDIO_INDEX = 'audioIndex',
    SUBTITLE_INDEX = 'subtitleIndex',
    SPEED_RATE = 'speedRate',
    CLOSE_NEXT_POPUP = 'closeNextPopup'
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
    type?: string
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

    isOffline?: boolean;
    isLive?: boolean;
    hasNext?: boolean;

    startPosition?: number;
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

export interface SkipButtonsProps {
    currentTime?: number;
    onPress?: (id: CONTROL_ACTION, value?:any) => void;
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
    style?: any;
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

export interface IAudioPlayerContent {
    current?: AudioPlayerEventProps,
    next?: AudioPlayerEventProps
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

    // Events
    onPress?: (id: CONTROL_ACTION, value?: any) => void;
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
    youbora?: IYoubora;
    poster?: string;

    playOffline?: boolean;
    isLive?: boolean;
    hasNext?: boolean;

    muted?: boolean;
    volume?: number;

    currentTime?: number;
    languagesMapping?:ILanguagesMapping;

    // Components

    // Utils
    getYouboraOptions?: (data: IYoubora, format?: IYouboraSettingsFormat) => IMappedYoubora;

    // Events
    onChangeCommonData?: (data: ICommonData) => void;
    onPress?: (id: CONTROL_ACTION, value?:any) => void;
    onNext?: () => void;
    onClose?: () => void;
}

export interface NormalFlavourProps {
    id?:number;
    title?:string;
    subtitle?:string;
    description?:string;
    liveStartDate?:string;

    manifests?:Array<IManifest>,
    showExternalTudum?: boolean;
    youbora?: IYoubora;
    adTagUrl?: string;
    poster?: string;

    playOffline?: boolean;
    isLive?: boolean;
    hasNext?: boolean;

    muted?: boolean;
    volume?: number;

    currentTime?: number;
    audioIndex?: number;
    subtitleIndex?: number;
    languagesMapping?:ILanguagesMapping;

    // Components
    mosca?: React.ReactElement;
    headerMetadata?: FunctionComponent<HeaderMetadataProps>;
    sliderVOD?: FunctionComponent<SliderVODProps>;
    sliderDVR?: FunctionComponent<SliderDVRProps>;
    controlsBottomBar?: FunctionComponent<ControlsBarProps>;
    controlsMiddleBar?: FunctionComponent<ControlsBarProps>;
    controlsHeaderBar?: FunctionComponent<ControlsBarProps>;
    nextButton?: FunctionComponent<NextButtonProps>;
    menu?: FunctionComponent<MenuProps>;
    settingsMenu?: FunctionComponent<MenuProps>;

    // Utils
    getTudumManifest?: () => IManifest | undefined;
    getYouboraOptions?: (data: IYoubora, format?: IYouboraSettingsFormat) => IMappedYoubora;

    // Events
    onChangeCommonData?: (data: ICommonData) => void;
    onPress?: (id: CONTROL_ACTION, value?:any) => void;
    onNext?: () => void;
    onClose?: () => void;
}

export interface CastFlavourProps {
    id?:number;
    title?:string;
    subtitle?:string;
    description?:string;
    liveStartDate?:string;

    manifests?:Array<IManifest>,
    youbora?: IYoubora;
    adTagUrl?: string;
    poster?: string;

    isLive?: boolean;
    hasNext?: boolean;

    muted?: boolean;
    volume?: number;

    currentTime?: number;
    audioIndex?: number;
    subtitleIndex?: number;
    languagesMapping?:ILanguagesMapping;

    // Components
    mosca?: React.ReactElement;
    headerMetadata?: FunctionComponent<HeaderMetadataProps>;
    sliderVOD?: FunctionComponent<SliderVODProps>;
    sliderDVR?: FunctionComponent<SliderDVRProps>;
    controlsBottomBar?: FunctionComponent<ControlsBarProps>;
    controlsMiddleBar?: FunctionComponent<ControlsBarProps>;
    controlsHeaderBar?: FunctionComponent<ControlsBarProps>;
    nextButton?: FunctionComponent<NextButtonProps>;
    menu?: FunctionComponent<MenuProps>;
    settingsMenu?: FunctionComponent<MenuProps>;

    // Utils
    getYouboraOptions?: (data: IYoubora, format?: IYouboraSettingsFormat) => IMappedYoubora;

    // Events
    onChangeCommonData?: (data: ICommonData) => void;
    onPress?: (id: CONTROL_ACTION, value?:any) => void;
    onNext?: () => void;
    onClose?: () => void;
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
    startPosition?: number;

    playOffline?: boolean;
    isLive?: boolean;
    liveStartDate?:string;
    hasNext?: boolean;

    languagesMapping?:ILanguagesMapping;

    // Components
    mosca?: React.ReactElement;
    headerMetadata?: FunctionComponent<HeaderMetadataProps>;
    sliderVOD?: FunctionComponent<SliderVODProps>;
    sliderDVR?: FunctionComponent<SliderDVRProps>;
    controlsBottomBar?: FunctionComponent<ControlsBarProps>;
    controlsMiddleBar?: FunctionComponent<ControlsBarProps>;
    controlsHeaderBar?: FunctionComponent<ControlsBarProps>;
    nextButton?: FunctionComponent<NextButtonProps>;
    menu?: FunctionComponent<MenuProps>;
    settingsMenu?: FunctionComponent<MenuProps>;

    // Utils
    watchingProgressInterval?: number;
    addContentProgress?: (currentTime: number, duration: number, id?:number) => null;
    getTudumManifest?: () => IManifest | undefined;
    getYouboraOptions?: (data: IYoubora, format?: IYouboraSettingsFormat) => IMappedYoubora;

    // Events
    onError?: () => void;
    onNext?: () => void;
    onProgress?: (value: number) => void;
    onExit?: () => void;
    onEnd?: () => void;
    onChangeAudioIndex?: (index: number, label?: string) => void;
    onChangeSubtitleIndex?: (index: number, label?: string) => void;
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
    poster?: string;
    isLive?: boolean;
}

export interface AudioPlayerProps {
    playerMaxHeight?: number;
    backgroundColor?: string;
    topDividerColor?: string;

    // Components


    // Utils
    fetchContentData?: (id?: number, slug?:string, type?:MEDIA_TYPE, collection?: COLLECTION) => AudioPlayerContentsDpo;
    watchingProgressInterval?: number;
    addContentProgress?: (currentTime: number, duration: number, id?:number) => null;
    getYouboraOptions?: (data: IYoubora, format?: IYouboraSettingsFormat) => IMappedYoubora;

    // Events
    onError?: () => void;
    onNext?: () => void;
    onProgress?: (value: number) => void;
    onExit?: () => void;
    onEnd?: () => void;
}