import { type SliderValues } from '../../../types/types';
import { type BaseProgressManagerOptions, type BaseUpdatePlayerData } from './base';

export interface VODUpdatePlayerData extends BaseUpdatePlayerData {
	// VOD puede tener propiedades adicionales específicas si es necesario
}

export interface VODProgressManagerOptions extends BaseProgressManagerOptions {
	// Opciones específicas del VOD
	autoSeekToEnd?: boolean;
	enableLooping?: boolean;
}

export interface VODProgressUpdateData extends SliderValues {
	isPaused: boolean;
	isBuffering: boolean;
	isLiveEdgePosition: boolean;
	isProgramLive: boolean;
	canSeekToEnd: boolean;
}
