export enum STREAM_FORMAT_TYPE {
	DASH = 'dash',
	HLS = 'hls',
}

export enum DRM_TYPE {
	WIDEVINE = 'widevine',
	PLAYREADY = 'playready',
    CLEARKEY = "clearkey",
	FAIRPLAY = 'fairplay',
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
    SPEED_RATE = 'speedRate'
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
    volume?: number;
    muted?: boolean;
    audioIndex?: number;
    subtitleIndex?: number;
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