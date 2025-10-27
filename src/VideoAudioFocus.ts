import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
	`The package 'react-native-video' doesn't seem to be linked. Make sure: \n\n` +
	Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
	'- You rebuilt the app after installing the package\n' +
	'- You are not using Expo Go\n';

const VideoAudioFocusModule = NativeModules.VideoAudioFocusModule
	? NativeModules.VideoAudioFocusModule
	: new Proxy(
			{},
			{
				get() {
					throw new Error(LINKING_ERROR);
				},
			}
	  );

export interface AudioFocusState {
	hasAudioFocus: boolean;
}

export interface AudioFocusRequestResult {
	granted: boolean;
	hasAudioFocus: boolean;
}

export interface AudioFocusAbandonResult {
	success: boolean;
	hasAudioFocus: boolean;
}

/**
 * Módulo para gestión manual de Audio Focus en Android
 * 
 * Permite controlar manualmente cuándo solicitar y abandonar el audio focus,
 * útil para escenarios como Android Auto/CarPlay donde el sistema ya gestiona el audio focus.
 */
export class VideoAudioFocus {
	/**
	 * Obtiene el estado actual del audio focus de un player
	 * 
	 * @param viewTag - Tag del componente Video (obtenido con findNodeHandle)
	 * @returns Promise con el estado del audio focus
	 * 
	 * @example
	 * ```typescript
	 * const videoRef = useRef<Video>(null);
	 * 
	 * const checkAudioFocus = async () => {
	 *   const tag = findNodeHandle(videoRef.current);
	 *   if (tag) {
	 *     const state = await VideoAudioFocus.getAudioFocusState(tag);
	 *     console.log('Has audio focus:', state.hasAudioFocus);
	 *   }
	 * };
	 * ```
	 */
	static async getAudioFocusState(viewTag: number): Promise<AudioFocusState> {
		if (Platform.OS !== 'android') {
			// iOS no usa audio focus, siempre retorna true
			return { hasAudioFocus: true };
		}

		return VideoAudioFocusModule.getAudioFocusState(viewTag);
	}

	/**
	 * Solicita audio focus manualmente para un player
	 * 
	 * @param viewTag - Tag del componente Video (obtenido con findNodeHandle)
	 * @returns Promise con el resultado de la solicitud
	 * 
	 * @example
	 * ```typescript
	 * const videoRef = useRef<Video>(null);
	 * 
	 * const requestFocus = async () => {
	 *   const tag = findNodeHandle(videoRef.current);
	 *   if (tag) {
	 *     const result = await VideoAudioFocus.requestAudioFocus(tag);
	 *     if (result.granted) {
	 *       console.log('Audio focus granted');
	 *     } else {
	 *       console.log('Audio focus denied');
	 *     }
	 *   }
	 * };
	 * ```
	 */
	static async requestAudioFocus(viewTag: number): Promise<AudioFocusRequestResult> {
		if (Platform.OS !== 'android') {
			// iOS no usa audio focus
			return { granted: true, hasAudioFocus: true };
		}

		return VideoAudioFocusModule.requestAudioFocus(viewTag);
	}

	/**
	 * Abandona el audio focus manualmente para un player
	 * 
	 * @param viewTag - Tag del componente Video (obtenido con findNodeHandle)
	 * @returns Promise con el resultado de la operación
	 * 
	 * @example
	 * ```typescript
	 * const videoRef = useRef<Video>(null);
	 * 
	 * const abandonFocus = async () => {
	 *   const tag = findNodeHandle(videoRef.current);
	 *   if (tag) {
	 *     const result = await VideoAudioFocus.abandonAudioFocus(tag);
	 *     console.log('Audio focus abandoned:', result.success);
	 *   }
	 * };
	 * ```
	 */
	static async abandonAudioFocus(viewTag: number): Promise<AudioFocusAbandonResult> {
		if (Platform.OS !== 'android') {
			// iOS no usa audio focus
			return { success: true, hasAudioFocus: false };
		}

		return VideoAudioFocusModule.abandonAudioFocus(viewTag);
	}
}

export default VideoAudioFocus;
