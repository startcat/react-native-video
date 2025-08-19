/*
 *  Estado del Cast Manager
 * 
 */

export enum CastManagerState {
    NOT_CONNECTED = 'notConnected',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    LOADING = 'loading',
    PLAYING = 'playing',
    PAUSED = 'paused',
    BUFFERING = 'buffering',
    ERROR = 'error'
}

/*
 *  Tipos de contenido para Cast
 *
 */

export enum CastContentType {
    VOD = 'vod',
    LIVE = 'live',
    DVR = 'dvr',
    TUDUM = 'tudum'
}

/*
 *  Resultado de operaciones Cast
 *
 */

export enum CastOperationResult {
    SUCCESS = 'success',
    FAILED = 'failed',
    PENDING = 'pending',
    CANCELLED = 'cancelled'
}

/*
 *  Comandos de control Cast
 *
 */

export enum CastControlCommand {
    PLAY = 'play',
    PAUSE = 'pause',
    SEEK = 'seek',
    MUTE = 'mute',
    UNMUTE = 'unmute',
    VOLUME = 'volume',
    SKIP_FORWARD = 'skip_forward',
    SKIP_BACKWARD = 'skip_backward',
    STOP = 'stop',
    SET_AUDIO_TRACK = 'set_audio_track',
    SET_SUBTITLE_TRACK = 'set_subtitle_track'
}

/*
 *  Eventos del Cast Manager
 *
 */

export enum CastManagerEvent {
    STATE_CHANGED = 'state_changed',
    CONTENT_LOADED = 'content_loaded',
    CONTENT_LOAD_ERROR = 'content_load_error',
    PLAYBACK_STARTED = 'playback_started',
    PLAYBACK_ENDED = 'playback_ended',
    PLAYBACK_ERROR = 'playback_error',
    BUFFERING_CHANGED = 'buffering_changed',
    TIME_UPDATE = 'time_update',
    CONNECTION_CHANGED = 'connection_changed'
}

export enum CastStreamType {
    BUFFERED = 'buffered',
    LIVE = 'live',
    NONE = 'none'
}