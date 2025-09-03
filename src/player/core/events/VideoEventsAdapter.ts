/*
 *  Adaptador principal que conecta eventos del Video con PlayerAnalyticsEvents
 *
 */

import { PlayerAnalyticsEvents } from '../../features/analytics';
import { mapVideoErrorToPlayerError, PlayerError } from '../errors';

import type {
    OnAudioTracksData,
    OnBandwidthUpdateData,
    OnBufferData,
    OnLoadStartData,
    OnPlaybackRateChangeData,
    OnPlaybackStateChangedData,
    OnProgressData,
    OnSeekData,
    OnTimedMetadataData,
    OnVideoAspectRatioData,
    OnVideoErrorData,
    OnVideoTracksData,
    OnVolumeChangeData
} from '../../../specs/VideoNativeComponent';

import type {
    OnLoadData,
    OnReceiveAdEventData,
    OnTextTracksData
} from '../../../types/events';

import { AdEventsHandler } from './handlers/AdEventsHandler';
import { ErrorEventsHandler } from './handlers/ErrorEventsHandler';
import { MetadataEventsHandler } from './handlers/MetadataEventsHandler';
import { PlaybackEventsHandler } from './handlers/PlaybackEventsHandler';
import { QualityEventsHandler } from './handlers/QualityEventsHandler';
import { TrackEventsHandler } from './handlers/TrackEventsHandler';

export class VideoEventsAdapter {

    private analyticsEvents: PlayerAnalyticsEvents;
    private playbackHandler: PlaybackEventsHandler;
    private adHandler: AdEventsHandler;
    private qualityHandler: QualityEventsHandler;
    private errorHandler: ErrorEventsHandler;
    private trackHandler: TrackEventsHandler;
    private metadataHandler: MetadataEventsHandler;

    // Estado interno para tracking
    private isPlaying = false;
    private isBuffering = false;
    private currentPosition = 0;
    private duration = 0;
    private currentPlaybackRate = 1.0;
    private currentVolume = 1.0;
    private isMuted = false;
    private isSessionActive = false;

    constructor(analyticsEvents: PlayerAnalyticsEvents) {
        this.analyticsEvents = analyticsEvents;
        
        // Inicializar handlers
        this.playbackHandler = new PlaybackEventsHandler(analyticsEvents);
        this.adHandler = new AdEventsHandler(analyticsEvents);
        this.qualityHandler = new QualityEventsHandler(analyticsEvents);
        this.errorHandler = new ErrorEventsHandler(analyticsEvents);
        this.trackHandler = new TrackEventsHandler(analyticsEvents);
        this.metadataHandler = new MetadataEventsHandler(analyticsEvents);
    }

    /*
     * Métodos principales para conectar con el Video component
     */

    onLoadStart = (data: OnLoadStartData) => {
        if (!this.isSessionActive) {
            this.analyticsEvents.onCreatePlaybackSession();
            this.isSessionActive = true;
        }
        this.analyticsEvents.onSourceChange();
    };

    onLoad = (data: OnLoadData) => {
        this.duration = data.duration * 1000; // Convertir a milisegundos
        this.currentPosition = data.currentTime * 1000;
        
        this.metadataHandler.handleLoad(data);
        this.trackHandler.handleTracksLoad(data);
        
        this.analyticsEvents.onDurationChange({
            duration: this.duration,
            previousDuration: 0
        });
    };

    onProgress = (data: OnProgressData) => {
        const positionMs = data.currentTime * 1000;
        const durationMs = data.seekableDuration * 1000;
        
        this.playbackHandler.handleProgress(data, positionMs, durationMs);
        
        // Actualizar posición interna
        this.currentPosition = positionMs;
        if (durationMs > this.duration) {
            this.duration = durationMs;
        }
    };

    onPlaybackStateChanged = (data: OnPlaybackStateChangedData) => {
        this.playbackHandler.handlePlaybackStateChange(data, this.isPlaying);
        this.isPlaying = data.isPlaying;
    };

    onBuffer = (data: OnBufferData) => {
        this.playbackHandler.handleBuffer(data, this.isBuffering);
        this.isBuffering = data.isBuffering;
    };

    onSeek = (data: OnSeekData) => {
        this.playbackHandler.handleSeek(data, this.currentPosition);
        this.currentPosition = data.currentTime * 1000;
    };

    onPlaybackRateChange = (data: OnPlaybackRateChangeData) => {
        this.analyticsEvents.onPlaybackRateChange({
            rate: data.playbackRate,
            previousRate: this.currentPlaybackRate
        });
        this.currentPlaybackRate = data.playbackRate;
    };

    onVolumeChange = (data: OnVolumeChangeData) => {
        this.trackHandler.handleVolumeChange(data, this.currentVolume, this.isMuted);
        this.currentVolume = data.volume;
        this.isMuted = data.volume === 0;
    };

    onEnd = () => {
        this.analyticsEvents.onEnd();
        this.isPlaying = false;
        this.isSessionActive = false;
    };

    onError = (data: OnVideoErrorData | PlayerError) => {
        let playerError: PlayerError;
        
        // Si ya es un PlayerError, usarlo directamente
        if (data instanceof PlayerError) {
            playerError = data;
        } else {
            // Si es OnVideoErrorData, procesarlo
            playerError = mapVideoErrorToPlayerError(data);
        }
        
        this.errorHandler.handleError(playerError);
    };

    onReceiveAdEvent = (data: OnReceiveAdEventData) => {
        this.adHandler.handleAdEvent(data);
    };

    onAudioTracks = (data: OnAudioTracksData) => {
        this.trackHandler.handleAudioTracks(data);
    };

    onTextTracks = (data: OnTextTracksData) => {
        this.trackHandler.handleTextTracks(data);
    };

    onVideoTracks = (data: OnVideoTracksData) => {
        this.qualityHandler.handleVideoTracks(data);
    };

    onBandwidthUpdate = (data: OnBandwidthUpdateData) => {
        this.qualityHandler.handleBandwidthUpdate(data);
    };

    onAspectRatio = (data: OnVideoAspectRatioData) => {
        this.qualityHandler.handleAspectRatio(data);
    };

    onTimedMetadata = (data: OnTimedMetadataData) => {
        this.metadataHandler.handleTimedMetadata(data);
    };

    onReadyForDisplay = () => {
        // El contenido está listo para mostrar
        this.analyticsEvents.onBufferStop();
    };

    /*
     * Métodos de estado de aplicación
     *
     */

    onApplicationForeground = () => {
        this.analyticsEvents.onApplicationForeground();
    };

    onApplicationBackground = () => {
        this.analyticsEvents.onApplicationBackground();
    };

    onApplicationActive = () => {
        this.analyticsEvents.onApplicationActive();
    };

    onApplicationInactive = () => {
        this.analyticsEvents.onApplicationInactive();
    };

    /*
     * Getters para acceso al estado interno
     *
     */

    getCurrentPosition = () => this.currentPosition;
    getDuration = () => this.duration;
    getIsPlaying = () => this.isPlaying;
    getIsBuffering = () => this.isBuffering;
    getCurrentPlaybackRate = () => this.currentPlaybackRate;
    getCurrentVolume = () => this.currentVolume;
    getIsMuted = () => this.isMuted;

    /*
     * Limpieza
     *
     */

    destroy = () => {
        this.isSessionActive = false;
        this.analyticsEvents.destroy();
    };
}