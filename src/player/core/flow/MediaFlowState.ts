import type { IDrm } from '../../types';
import {
	MediaFlowStateType,
	MediaType,
	StateChangeReason,
	type ExtendedVideoSource,
	type MediaFlowState,
} from './types';

export class MediaFlowStateManager {
	private currentState: MediaFlowState;
	private stateHistory: MediaFlowState[] = [];
	private maxHistorySize = 10;

	constructor() {
		this.currentState = this.createInitialState();
	}

	/*
	 *  Obtener el estado actual
	 *
	 */

	getCurrentState(): MediaFlowState {
		return { ...this.currentState };
	}

	/*
	 *  Obtener el tipo de estado actual
	 *
	 */

	getCurrentStateType(): MediaFlowStateType {
		return this.currentState.type;
	}

	/*
	 *  Obtener el tipo de media actual
	 *
	 */

	getCurrentMediaType(): MediaType | null {
		return this.currentState.mediaType;
	}

	/*
	 *  Verificar si estamos en un estado específico
	 *
	 */

	isInState(state: MediaFlowStateType): boolean {
		return this.currentState.type === state;
	}

	/*
	 *  Verificar si el estado actual permite reproducción
	 *
	 */

	isPlaybackActive(): boolean {
		return (
			this.currentState.type === MediaFlowStateType.PLAYING_TUDUM ||
			this.currentState.type === MediaFlowStateType.PLAYING_CONTENT
		);
	}

	/*
	 *  Verificar si estamos reproduciendo tudum
	 *
	 */

	isPlayingTudum(): boolean {
		return this.currentState.type === MediaFlowStateType.PLAYING_TUDUM;
	}

	/*
	 *  Verificar si estamos reproduciendo contenido
	 *
	 */

	isPlayingContent(): boolean {
		return this.currentState.type === MediaFlowStateType.PLAYING_CONTENT;
	}

	/*
	 *  Verificar si estamos en transición
	 *
	 */

	isTransitioning(): boolean {
		return this.currentState.type === MediaFlowStateType.TRANSITIONING;
	}

	/*
	 *  Verificar si ya se reprodujo el tudum
	 *
	 */

	hasPlayedTudum(): boolean {
		return this.currentState.metadata.hasPlayedTudum;
	}

	/*
	 *  Transiciones de estado
	 *
	 */

	transitionTo(
		newStateType: MediaFlowStateType,
		options: {
			mediaType?: MediaType | null;
			source?: ExtendedVideoSource | null;
			drm?: IDrm;
			reason?: StateChangeReason;
			error?: Error;
			isAutoNext?: boolean;
			startPosition?: number;
		} = {}
	): MediaFlowState {
		// Validar transición
		if (!this.isValidTransition(this.currentState.type, newStateType)) {
			throw new Error(`Invalid transition from ${this.currentState.type} to ${newStateType}`);
		}

		// Guardar estado anterior
		this.addToHistory(this.currentState);

		// Crear nuevo estado
		const newState: MediaFlowState = {
			type: newStateType,
			mediaType:
				options.mediaType !== undefined ? options.mediaType : this.currentState.mediaType,
			source: options.source !== undefined ? options.source : this.currentState.source,
			drm: options.drm !== undefined ? options.drm : this.currentState.drm,
			metadata: {
				isAutoNext:
					options.isAutoNext !== undefined
						? options.isAutoNext
						: this.currentState.metadata.isAutoNext,
				hasPlayedTudum: this.calculateHasPlayedTudum(newStateType),
				startPosition:
					options.startPosition !== undefined
						? options.startPosition
						: this.currentState.metadata.startPosition,
				error: options.error,
			},
			timestamp: Date.now(),
		};

		this.currentState = newState;
		return this.getCurrentState();
	}

	/*
	 *  Métodos de transición específicos
	 *
	 */

	startPreparingTudum(source: ExtendedVideoSource, drm?: IDrm): MediaFlowState {
		return this.transitionTo(MediaFlowStateType.PREPARING_TUDUM, {
			mediaType: MediaType.TUDUM,
			source,
			drm,
			reason: StateChangeReason.INITIALIZATION,
		});
	}

	startPlayingTudum(): MediaFlowState {
		return this.transitionTo(MediaFlowStateType.PLAYING_TUDUM, {
			mediaType: MediaType.TUDUM,
		});
	}

	startTransitioning(reason: StateChangeReason): MediaFlowState {
		return this.transitionTo(MediaFlowStateType.TRANSITIONING, {
			reason,
		});
	}

	startPreparingContent(
		source: ExtendedVideoSource,
		drm?: IDrm,
		startPosition?: number
	): MediaFlowState {
		return this.transitionTo(MediaFlowStateType.PREPARING_CONTENT, {
			mediaType: MediaType.CONTENT,
			source,
			drm,
			startPosition,
		});
	}

	startPlayingContent(): MediaFlowState {
		return this.transitionTo(MediaFlowStateType.PLAYING_CONTENT, {
			mediaType: MediaType.CONTENT,
		});
	}

	setError(error: Error, mediaType: MediaType): MediaFlowState {
		return this.transitionTo(MediaFlowStateType.ERROR, {
			mediaType,
			error,
			reason: StateChangeReason.ERROR,
		});
	}

	setEnded(): MediaFlowState {
		return this.transitionTo(MediaFlowStateType.ENDED, {
			reason: StateChangeReason.MEDIA_END,
		});
	}

	/*
	 *  Resetear el estado
	 *
	 */

	reset(): void {
		this.currentState = this.createInitialState();
		this.stateHistory = [];
	}

	/*
	 *  Obtener historial de estados
	 *
	 */

	getStateHistory(): MediaFlowState[] {
		return [...this.stateHistory];
	}

	/*
	 *  Métodos privados
	 *
	 */

	private createInitialState(): MediaFlowState {
		return {
			type: MediaFlowStateType.IDLE,
			mediaType: null,
			source: null,
			metadata: {
				isAutoNext: false,
				hasPlayedTudum: false,
			},
			timestamp: Date.now(),
		};
	}

	private addToHistory(state: MediaFlowState): void {
		this.stateHistory.push(state);

		if (this.stateHistory.length > this.maxHistorySize) {
			this.stateHistory.shift();
		}
	}

	private calculateHasPlayedTudum(newStateType: MediaFlowStateType): boolean {
		// Si ya se reprodujo, mantener el flag
		if (this.currentState.metadata.hasPlayedTudum) {
			return true;
		}

		// Si estamos saliendo de PLAYING_TUDUM, marcar como reproducido
		if (
			this.currentState.type === MediaFlowStateType.PLAYING_TUDUM &&
			newStateType !== MediaFlowStateType.PLAYING_TUDUM
		) {
			return true;
		}

		return false;
	}

	private isValidTransition(from: MediaFlowStateType, to: MediaFlowStateType): boolean {
		// Definir transiciones válidas
		const validTransitions: Record<MediaFlowStateType, MediaFlowStateType[]> = {
			[MediaFlowStateType.IDLE]: [
				MediaFlowStateType.PREPARING_TUDUM,
				MediaFlowStateType.PREPARING_CONTENT,
				MediaFlowStateType.ERROR,
			],
			[MediaFlowStateType.PREPARING_TUDUM]: [
				MediaFlowStateType.PLAYING_TUDUM,
				MediaFlowStateType.TRANSITIONING,
				MediaFlowStateType.ERROR,
				MediaFlowStateType.PREPARING_CONTENT, // Skip tudum
			],
			[MediaFlowStateType.PLAYING_TUDUM]: [
				MediaFlowStateType.TRANSITIONING,
				MediaFlowStateType.ERROR,
				MediaFlowStateType.ENDED,
			],
			[MediaFlowStateType.TRANSITIONING]: [
				MediaFlowStateType.PREPARING_CONTENT,
				MediaFlowStateType.ERROR,
				MediaFlowStateType.IDLE,
			],
			[MediaFlowStateType.PREPARING_CONTENT]: [
				MediaFlowStateType.PLAYING_CONTENT,
				MediaFlowStateType.ERROR,
			],
			[MediaFlowStateType.PLAYING_CONTENT]: [
				MediaFlowStateType.ENDED,
				MediaFlowStateType.ERROR,
				MediaFlowStateType.TRANSITIONING, // Para auto-next
			],
			[MediaFlowStateType.ERROR]: [
				MediaFlowStateType.IDLE,
				MediaFlowStateType.PREPARING_CONTENT, // Retry
			],
			[MediaFlowStateType.ENDED]: [
				MediaFlowStateType.IDLE,
				MediaFlowStateType.PREPARING_TUDUM, // Next episode with tudum
				MediaFlowStateType.PREPARING_CONTENT, // Next episode without tudum
			],
		};

		return validTransitions[from]?.includes(to) || false;
	}
}
