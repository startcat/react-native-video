import { type BaseProgressManagerOptions, type BaseSliderValues, type BaseUpdatePlayerData } from './base';

export interface VODUpdatePlayerData extends BaseUpdatePlayerData {
    // VOD puede tener propiedades adicionales específicas si es necesario
}

export interface VODProgressManagerOptions extends BaseProgressManagerOptions {
    // Opciones específicas del VOD
    autoSeekToEnd?: boolean;
    enableLooping?: boolean;
}

export interface VODSliderValues extends BaseSliderValues {
    duration: number | null;
}

export interface VODProgressUpdateData extends VODSliderValues {
    isPaused: boolean;
    isBuffering: boolean;
    isLiveEdgePosition: boolean;
    isProgramLive: boolean;
    canSeekToEnd: boolean;
}