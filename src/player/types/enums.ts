/*
 *  Enums
 *
 */

export enum STREAM_FORMAT_TYPE {
    DASH = 'dash',
    HLS = 'hls',
    MP3 = 'mp3',
    MP4 = 'mp4',
    OTHER = 'other'
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
    LIVE = 'goToLive',
    LIVE_START_PROGRAM = 'goToLiveStartProgram',
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

export enum DVR_PLAYBACK_TYPE {
    WINDOW = 'window',
    PROGRAM = 'program',
    PLAYLIST = 'playlist'
}