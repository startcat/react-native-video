/*
 *  Sistema de eventos de analytics para el reproductor
 *
 */

import {
    type AdBeginParams,
    type AdBreakBeginParams,
    type AdBreakEndParams,
    type AdEndParams,
    type AdPauseParams,
    type AdResumeParams,
    type AdSkipParams,
    type AudioTrackChangeParams,
    type BitrateChangeParams,
    type ContentProtectionErrorParams,
    type DurationChangeParams,
    type ErrorParams,
    type MetadataParams,
    type MuteChangeParams,
    type NetworkErrorParams,
    type PlaybackRateChangeParams,
    type PlayerPlugin,
    type PositionChangeParams,
    type PositionUpdateParams,
    type ProgressParams,
    type QualityChangeParams,
    type ResolutionChangeParams,
    type SeekEndParams,
    type StopParams,
    type StreamErrorParams,
    type SubtitleShowParams,
    type SubtitleTrackChangeParams,
    type VolumeChangeParams
} from './types';

const TAG = "[PlayerAnalyticsEvents]";

export class PlayerAnalyticsEvents {
    private plugins: Array<PlayerPlugin>;

    constructor() {
        console.log(`${TAG} constructor`);
        this.plugins = [];
    }

    addPlugin(plugin: PlayerPlugin) {
        console.log(`${TAG} addPlugin ${plugin.name} v${plugin.version}`);
        this.plugins.push(plugin);
    }

    removePlugin(pluginName: string) {
        const index = this.plugins.findIndex(plugin => plugin.name === pluginName);
        if (index !== -1) {
            this.plugins.splice(index, 1);
            console.log(`${TAG} removePlugin ${pluginName}`);
        }
    }

    /*
    * Eventos de Sesión y Lifecycle
    *
    */

    onSourceChange() {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onSourceChange?.();
            } catch (ex) {
                console.error(`${TAG} onSourceChange error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onCreatePlaybackSession() {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onCreatePlaybackSession?.();
            } catch (ex) {
                console.error(`${TAG} onCreatePlaybackSession error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onMetadataLoaded(params: MetadataParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onMetadataLoaded?.(params);
            } catch (ex) {
                console.error(`${TAG} onMetadataLoaded error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onMetadataUpdate(params: MetadataParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onMetadataUpdate?.(params);
            } catch (ex) {
                console.error(`${TAG} onMetadataUpdate error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onDurationChange(params: DurationChangeParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onDurationChange?.(params);
            } catch (ex) {
                console.error(`${TAG} onDurationChange error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onPlay() {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onPlay?.();
            } catch (ex) {
                console.error(`${TAG} onPlay error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onPause() {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onPause?.();
            } catch (ex) {
                console.error(`${TAG} onPause error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onEnd() {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onEnd?.();
            } catch (ex) {
                console.error(`${TAG} onEnd error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onStop(params: StopParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onStop?.(params);
            } catch (ex) {
                console.error(`${TAG} onStop error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onBufferStart() {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onBufferStart?.();
            } catch (ex) {
                console.error(`${TAG} onBufferStart error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onBufferStop() {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onBufferStop?.();
            } catch (ex) {
                console.error(`${TAG} onBufferStop error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onSeekStart() {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onSeekStart?.();
            } catch (ex) {
                console.error(`${TAG} onSeekStart error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onSeekEnd(params: SeekEndParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onSeekEnd?.(params);
            } catch (ex) {
                console.error(`${TAG} onSeekEnd error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onPositionChange(params: PositionChangeParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onPositionChange?.(params);
            } catch (ex) {
                console.error(`${TAG} onPositionChange error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onPositionUpdate(params: PositionUpdateParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onPositionUpdate?.(params);
            } catch (ex) {
                console.error(`${TAG} onPositionUpdate error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onProgress(params: ProgressParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onProgress?.(params);
            } catch (ex) {
                console.error(`${TAG} onProgress error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onPlaybackRateChange(params: PlaybackRateChangeParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onPlaybackRateChange?.(params);
            } catch (ex) {
                console.error(`${TAG} onPlaybackRateChange error in ${plugin.name}: ${ex}`);
            }
        });
    }

    /*
     * Eventos de Publicidad
     *
     */

    onAdBegin(params: AdBeginParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onAdBegin?.(params);
            } catch (ex) {
                console.error(`${TAG} onAdBegin error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onAdEnd(params: AdEndParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onAdEnd?.(params);
            } catch (ex) {
                console.error(`${TAG} onAdEnd error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onAdPause(params: AdPauseParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onAdPause?.(params);
            } catch (ex) {
                console.error(`${TAG} onAdPause error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onAdResume(params: AdResumeParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onAdResume?.(params);
            } catch (ex) {
                console.error(`${TAG} onAdResume error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onAdSkip(params: AdSkipParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onAdSkip?.(params);
            } catch (ex) {
                console.error(`${TAG} onAdSkip error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onAdBreakBegin(params: AdBreakBeginParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onAdBreakBegin?.(params);
            } catch (ex) {
                console.error(`${TAG} onAdBreakBegin error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onAdBreakEnd(params: AdBreakEndParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onAdBreakEnd?.(params);
            } catch (ex) {
                console.error(`${TAG} onAdBreakEnd error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onContentResume() {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onContentResume?.();
            } catch (ex) {
                console.error(`${TAG} onContentResume error in ${plugin.name}: ${ex}`);
            }
        });
    }

    /*
     * Eventos de Audio y Subtítulos
     *
     */

    onAudioTrackChange(params: AudioTrackChangeParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onAudioTrackChange?.(params);
            } catch (ex) {
                console.error(`${TAG} onAudioTrackChange error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onVolumeChange(params: VolumeChangeParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onVolumeChange?.(params);
            } catch (ex) {
                console.error(`${TAG} onVolumeChange error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onMuteChange(params: MuteChangeParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onMuteChange?.(params);
            } catch (ex) {
                console.error(`${TAG} onMuteChange error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onSubtitleTrackChange(params: SubtitleTrackChangeParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onSubtitleTrackChange?.(params);
            } catch (ex) {
                console.error(`${TAG} onSubtitleTrackChange error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onSubtitleShow(params: SubtitleShowParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onSubtitleShow?.(params);
            } catch (ex) {
                console.error(`${TAG} onSubtitleShow error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onSubtitleHide() {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onSubtitleHide?.();
            } catch (ex) {
                console.error(`${TAG} onSubtitleHide error in ${plugin.name}: ${ex}`);
            }
        });
    }

    /*
     * Eventos de Calidad
     *
     */

    onQualityChange(params: QualityChangeParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onQualityChange?.(params);
            } catch (ex) {
                console.error(`${TAG} onQualityChange error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onBitrateChange(params: BitrateChangeParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onBitrateChange?.(params);
            } catch (ex) {
                console.error(`${TAG} onBitrateChange error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onResolutionChange(params: ResolutionChangeParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onResolutionChange?.(params);
            } catch (ex) {
                console.error(`${TAG} onResolutionChange error in ${plugin.name}: ${ex}`);
            }
        });
    }

    /*
     * Eventos de Errores
     *
     */

    onError(params: ErrorParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onError?.(params);
            } catch (ex) {
                console.error(`${TAG} onError error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onNetworkError(params: NetworkErrorParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onNetworkError?.(params);
            } catch (ex) {
                console.error(`${TAG} onNetworkError error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onStreamError(params: StreamErrorParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onStreamError?.(params);
            } catch (ex) {
                console.error(`${TAG} onStreamError error in ${plugin.name}: ${ex}`);
            }
        });
    }

    onContentProtectionError(params: ContentProtectionErrorParams) {
        this.plugins.forEach((plugin) => {
            try {
                plugin.onContentProtectionError?.(params);
            } catch (ex) {
                console.error(`${TAG} onContentProtectionError error in ${plugin.name}: ${ex}`);
            }
        });
    }

    /*
     * Limpieza
     *
     */

    destroy() {
        this.plugins.forEach((plugin) => {
            try {
                plugin.destroy();
            } catch (ex) {
                console.error(`${TAG} destroy error in ${plugin.name}: ${ex}`);
            }
        });
        this.plugins = [];
    }
}