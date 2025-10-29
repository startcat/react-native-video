import { useEffect, useState } from "react";
import { MediaFlowStateType, MediaType } from "../types";
import type { UseMediaFlowReturn } from "./useMediaFlow";

export interface FlowStateInfo {
	// Estados booleanos
	isIdle: boolean;
	isPreparingTudum: boolean;
	isPlayingTudum: boolean;
	isTransitioning: boolean;
	isPreparingContent: boolean;
	isPlayingContent: boolean;
	isError: boolean;
	isEnded: boolean;

	// Estados agregados
	isPlaying: boolean;
	isPreparing: boolean;
	isActive: boolean;

	// Información adicional
	currentMediaType: MediaType | null;
	currentStateType: MediaFlowStateType;
	hasPlayedTudum: boolean;
	isAutoNext: boolean;
	error?: Error;
}

/*
 *  Hook que proporciona información simplificada del estado del flujo
 *
 */

export function useFlowState(mediaFlow: UseMediaFlowReturn): FlowStateInfo {
	const [stateInfo, setStateInfo] = useState<FlowStateInfo>(getInitialStateInfo());

	useEffect(() => {
		// Actualizar estado inicial si ya existe
		if (mediaFlow.state) {
			setStateInfo(mapStateToInfo(mediaFlow.state));
		}

		// Suscribirse a cambios de estado
		const unsubscribe = mediaFlow.subscribe("state:change", ({ current }) => {
			setStateInfo(mapStateToInfo(current));
		});

		return unsubscribe;
	}, [mediaFlow]);

	return stateInfo;
}

/*
 *  Obtener estado inicial
 *
 */

function getInitialStateInfo(): FlowStateInfo {
	return {
		// Estados booleanos
		isIdle: true,
		isPreparingTudum: false,
		isPlayingTudum: false,
		isTransitioning: false,
		isPreparingContent: false,
		isPlayingContent: false,
		isError: false,
		isEnded: false,

		// Estados agregados
		isPlaying: false,
		isPreparing: false,
		isActive: false,

		// Información adicional
		currentMediaType: null,
		currentStateType: MediaFlowStateType.IDLE,
		hasPlayedTudum: false,
		isAutoNext: false,
	};
}

/*
 *  Mapear estado del flujo a información simplificada
 *
 */
function mapStateToInfo(state: any): FlowStateInfo {
	const stateType = state.type as MediaFlowStateType;

	return {
		// Estados booleanos
		isIdle: stateType === MediaFlowStateType.IDLE,
		isPreparingTudum: stateType === MediaFlowStateType.PREPARING_TUDUM,
		isPlayingTudum: stateType === MediaFlowStateType.PLAYING_TUDUM,
		isTransitioning: stateType === MediaFlowStateType.TRANSITIONING,
		isPreparingContent: stateType === MediaFlowStateType.PREPARING_CONTENT,
		isPlayingContent: stateType === MediaFlowStateType.PLAYING_CONTENT,
		isError: stateType === MediaFlowStateType.ERROR,
		isEnded: stateType === MediaFlowStateType.ENDED,

		// Estados agregados
		isPlaying:
			stateType === MediaFlowStateType.PLAYING_TUDUM ||
			stateType === MediaFlowStateType.PLAYING_CONTENT,
		isPreparing:
			stateType === MediaFlowStateType.PREPARING_TUDUM ||
			stateType === MediaFlowStateType.PREPARING_CONTENT,
		isActive:
			stateType !== MediaFlowStateType.IDLE &&
			stateType !== MediaFlowStateType.ERROR &&
			stateType !== MediaFlowStateType.ENDED,

		// Información adicional
		currentMediaType: state.mediaType,
		currentStateType: stateType,
		hasPlayedTudum: state.metadata?.hasPlayedTudum || false,
		isAutoNext: state.metadata?.isAutoNext || false,
		error: state.metadata?.error,
	};
}

/*
 *  Hook helper para verificar estados específicos
 *
 */

export function useIsFlowState(
	mediaFlow: UseMediaFlowReturn,
	...states: MediaFlowStateType[]
): boolean {
	const [isInState, setIsInState] = useState(false);

	useEffect(() => {
		// Verificar estado inicial
		if (mediaFlow.state) {
			setIsInState(states.includes(mediaFlow.state.type));
		}

		// Suscribirse a cambios
		const unsubscribe = mediaFlow.subscribe("state:change", ({ current }) => {
			setIsInState(states.includes(current.type));
		});

		return unsubscribe;
	}, [mediaFlow, ...states]);

	return isInState;
}
