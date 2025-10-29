// Clases principales
export { MediaFlowDecisionEngine } from './MediaFlowDecisionEngine';
export { MediaFlowEventBus } from './MediaFlowEventBus';
export { MediaFlowManager } from './MediaFlowManager';
export { MediaFlowStateManager } from './MediaFlowState';

// Tipos y enums
export {
	// Enums
	MediaFlowStateType,
	MediaType,
	StateChangeReason,
	type ExtendedVideoSource,
	type MediaFlowConfig,
	type MediaFlowEvents,
	// Interfaces
	type MediaFlowState,
} from './types';

// Re-exportar tipos específicos de otras clases si son necesarios
export type { DecisionContext, DecisionResult } from './MediaFlowDecisionEngine';

export type { MediaFlowManagerOptions } from './MediaFlowManager';
