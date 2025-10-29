import { useCallback, useEffect, useRef, useState } from 'react';
import type { IDrm } from '../../../types';
import { MediaFlowManager } from '../MediaFlowManager';
import type {
	ExtendedVideoSource,
	MediaFlowConfig,
	MediaFlowEvents,
	MediaFlowState,
} from '../types';

export interface UseMediaFlowOptions {
	debugMode?: boolean;
	onSourceReady?: (source: ExtendedVideoSource, drm?: IDrm) => void;
	onStateChange?: (state: MediaFlowState) => void;
	onError?: (error: Error) => void;
}

export interface UseMediaFlowReturn {
	// Estado
	state: MediaFlowState | null;
	isInitialized: boolean;
	isLoading: boolean;
	error: Error | null;

	// Métodos
	initialize: (config: MediaFlowConfig) => Promise<void>;
	handleProgress: (data: any) => void;
	handleMediaEnd: () => void;
	pause: () => void;
	resume: () => void;

	// Suscripciones a eventos
	subscribe: <K extends keyof MediaFlowEvents>(
		event: K,
		handler: (data: MediaFlowEvents[K]) => void
	) => () => void;

	// Manager (para casos avanzados)
	manager: MediaFlowManager | null;
}

export function useMediaFlow(options: UseMediaFlowOptions = {}): UseMediaFlowReturn {
	const managerRef = useRef<MediaFlowManager | null>(null);
	const [state, setState] = useState<MediaFlowState | null>(null);
	const [isInitialized, setIsInitialized] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	// Crear el manager una sola vez
	useEffect(() => {
		if (!managerRef.current) {
			managerRef.current = new MediaFlowManager({
				debugMode: options.debugMode,
				onSourceReady: options.onSourceReady,
				onStateChange: newState => {
					setState(newState);
					options.onStateChange?.(newState);
				},
				onError: err => {
					setError(err);
					options.onError?.(err);
				},
			});
		}

		return () => {
			if (managerRef.current) {
				managerRef.current.dispose();
				managerRef.current = null;
			}
		};
	}, []); // Solo en mount/unmount

	// Inicializar el flujo
	const initialize = useCallback(async (config: MediaFlowConfig) => {
		if (!managerRef.current) {
			throw new Error('MediaFlowManager not initialized');
		}

		setIsLoading(true);
		setError(null);

		try {
			await managerRef.current.initialize(config);
			setIsInitialized(true);
		} catch (err) {
			setError(err as Error);
			throw err;
		} finally {
			setIsLoading(false);
		}
	}, []);

	// Métodos delegados
	const handleProgress = useCallback((data: any) => {
		managerRef.current?.handleProgress(data);
	}, []);

	const handleMediaEnd = useCallback(() => {
		managerRef.current?.handleMediaEnd();
	}, []);

	const pause = useCallback(() => {
		managerRef.current?.pause();
	}, []);

	const resume = useCallback(() => {
		managerRef.current?.resume();
	}, []);

	// Suscribirse a eventos
	const subscribe = useCallback(
		<K extends keyof MediaFlowEvents>(
			event: K,
			handler: (data: MediaFlowEvents[K]) => void
		): (() => void) => {
			if (!managerRef.current) {
				console.warn('MediaFlowManager not initialized, cannot subscribe to events');
				return () => {};
			}

			return managerRef.current.events.on(event, handler);
		},
		[]
	);

	return {
		// Estado
		state,
		isInitialized,
		isLoading,
		error,

		// Métodos
		initialize,
		handleProgress,
		handleMediaEnd,
		pause,
		resume,

		// Suscripciones
		subscribe,

		// Manager para casos avanzados
		manager: managerRef.current,
	};
}
