/*
 *  Interfaz de eventos para el reproductor
 *  Gestiona los plugins de analytics
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
    type PlayerAnalyticsPlugin,
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

import { PlayerError } from "../../core/errors";
import { LOG_PREFIX } from './constants';

export class PlayerAnalyticsEvents {
    private plugins: Array<PlayerAnalyticsPlugin>;

    constructor() {
        console.log(`${LOG_PREFIX} constructor`);
        this.plugins = [];
    }

    addPlugin(plugin: PlayerAnalyticsPlugin) {
        console.log(`${LOG_PREFIX} addPlugin ${plugin.name} v${plugin.version}`);
        this.plugins.push(plugin);
    }

    removePlugin(pluginName: string) {
        const index = this.plugins.findIndex(plugin => plugin.name === pluginName);
        if (index !== -1) {
            this.plugins.splice(index, 1);
            console.log(`${LOG_PREFIX} removePlugin ${pluginName}`);
        }
    }

    /*
     *  Gestión de Sesión y Lifecycle
     *
     */

    onSourceChange() {
        this.executePluginMethod('onSourceChange');
    }

    onCreatePlaybackSession() {
        this.executePluginMethod('onCreatePlaybackSession');
    }

    onMetadataLoaded(params: MetadataParams) {
        this.executePluginMethod('onMetadataLoaded', params);
    }

    onMetadataUpdate(params: MetadataParams) {
        this.executePluginMethod('onMetadataUpdate', params);
    }

    onDurationChange(params: DurationChangeParams) {
        this.executePluginMethod('onDurationChange', params);
    }

    /*
     *  Control de Reproducción
     *
     */

    onPlay() {
        this.executePluginMethod('onPlay');
    }

    onPause() {
        this.executePluginMethod('onPause');
    }

    onEnd() {
        this.executePluginMethod('onEnd');
    }

    onStop(params: StopParams = {}) {
        this.executePluginMethod('onStop', params);
    }

    /*
     *  Buffering
     *
     */

    onBufferStart() {
        this.executePluginMethod('onBufferStart');
    }

    onBufferStop() {
        this.executePluginMethod('onBufferStop');
    }

    /*
     *  Navegación
     *
     */

    onSeekStart() {
        this.executePluginMethod('onSeekStart');
    }

    onSeekEnd(params: SeekEndParams) {
        this.executePluginMethod('onSeekEnd', params);
    }

    onPositionChange(params: PositionChangeParams) {
        this.executePluginMethod('onPositionChange', params);
    }

    onPositionUpdate(params: PositionUpdateParams) {
        this.executePluginMethod('onPositionUpdate', params);
    }

    onProgress(params: ProgressParams) {
        this.executePluginMethod('onProgress', params);
    }

    onPlaybackRateChange(params: PlaybackRateChangeParams) {
        this.executePluginMethod('onPlaybackRateChange', params);
    }

    /*
     *  Publicidad
     *
     */

    onAdBegin(params: AdBeginParams) {
        this.executePluginMethod('onAdBegin', params);
    }

    onAdEnd(params: AdEndParams) {
        this.executePluginMethod('onAdEnd', params);
    }

    onAdPause(params: AdPauseParams) {
        this.executePluginMethod('onAdPause', params);
    }

    onAdResume(params: AdResumeParams) {
        this.executePluginMethod('onAdResume', params);
    }

    onAdSkip(params: AdSkipParams) {
        this.executePluginMethod('onAdSkip', params);
    }

    onAdBreakBegin(params: AdBreakBeginParams) {
        this.executePluginMethod('onAdBreakBegin', params);
    }

    onAdBreakEnd(params: AdBreakEndParams) {
        this.executePluginMethod('onAdBreakEnd', params);
    }

    onContentResume() {
        this.executePluginMethod('onContentResume');
    }

    /*
     *  Errores
     *
     */

    onError(params: ErrorParams) {
        this.executePluginMethod('onError', params);
    }

    onContentProtectionError(params: ContentProtectionErrorParams) {
        this.executePluginMethod('onContentProtectionError', params);
    }

    onNetworkError(params: NetworkErrorParams) {
        this.executePluginMethod('onNetworkError', params);
    }

    onStreamError(params: StreamErrorParams) {
        this.executePluginMethod('onStreamError', params);
    }

    /*
     *  Audio y Subtítulos
     *
     */

    onAudioTrackChange(params: AudioTrackChangeParams) {
        this.executePluginMethod('onAudioTrackChange', params);
    }

    onVolumeChange(params: VolumeChangeParams) {
        this.executePluginMethod('onVolumeChange', params);
    }

    onMuteChange(params: MuteChangeParams) {
        this.executePluginMethod('onMuteChange', params);
    }

    onSubtitleTrackChange(params: SubtitleTrackChangeParams) {
        this.executePluginMethod('onSubtitleTrackChange', params);
    }

    onSubtitleShow(params: SubtitleShowParams) {
        this.executePluginMethod('onSubtitleShow', params);
    }

    onSubtitleHide() {
        this.executePluginMethod('onSubtitleHide');
    }

    /*
     *  Calidad
     *
     */

    onQualityChange(params: QualityChangeParams) {
        this.executePluginMethod('onQualityChange', params);
    }

    onBitrateChange(params: BitrateChangeParams) {
        this.executePluginMethod('onBitrateChange', params);
    }

    onResolutionChange(params: ResolutionChangeParams) {
        this.executePluginMethod('onResolutionChange', params);
    }

    /*
     *  Estado de Aplicación
     *
     */

    onApplicationForeground() {
        this.executePluginMethod('onApplicationForeground');
    }

    onApplicationBackground() {
        this.executePluginMethod('onApplicationBackground');
    }

    onApplicationActive() {
        this.executePluginMethod('onApplicationActive');
    }

    onApplicationInactive() {
        this.executePluginMethod('onApplicationInactive');
    }

    /*
     *  Métodos de utilidad
     *
     */

    private executePluginMethod(methodName: string, ...args: any[]) {
        this.plugins.forEach((plugin) => {
            try {
                const method = (plugin as any)[methodName];
                if (typeof method === 'function') {
                    method.apply(plugin, args);
                }
            } catch (ex) {
                console.error(`${LOG_PREFIX} ${methodName} error: ${ex}`);
                throw new PlayerError('PLAYER_ANALYTICS_PLUGIN_EXECUTION_ERROR', { pluginName: plugin.name, originalError: ex });
            }
        });
    }

    getPlugins(): PlayerAnalyticsPlugin[] {
        return [...this.plugins];
    }
    
    getPlugin(name: string): PlayerAnalyticsPlugin | undefined {
        return this.plugins.find(plugin => plugin.name === name);
    }
    
    hasPlugin(name: string): boolean {
        return this.plugins.some(plugin => plugin.name === name);
    }
    
    getPluginCount(): number {
        return this.plugins.length;
    }

    /*
     *  Limpieza
     *
     */

    destroy() {
        this.plugins.forEach((plugin) => {
            try {
                plugin.destroy();
            } catch (ex) {
                console.error(`${LOG_PREFIX} destroy error in ${plugin.name}: ${ex}`);
                throw new PlayerError('PLAYER_ANALYTICS_PLUGIN_DESTROY_ERROR', { pluginName: plugin.name, originalError: ex });
            }
        });
        this.plugins = [];
    }
}