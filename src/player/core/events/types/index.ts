import { VideoEventsAdapter } from "../VideoEventsAdapter";

import {
	PlayerAnalyticsEvents,
	type BaseError,
	type PlayerAnalyticsPlugin,
} from "@overon/react-native-overon-player-analytics-plugins";
import type { ReactVideoEvents } from "../../../../types";

export interface UseVideoAnalyticsProps {
	plugins?: PlayerAnalyticsPlugin[];
	onInternalError?: (error: BaseError) => void;
}

export interface UseVideoAnalyticsReturn {
	// Eventos para conectar con el componente Video
	videoEvents: ReactVideoEvents;

	// Métodos para control manual
	analyticsEvents: PlayerAnalyticsEvents;
	adapter: VideoEventsAdapter;

	// Utilidades
	getCurrentPosition: () => number;
	getDuration: () => number;
	isPlaying: () => boolean;
	isBuffering: () => boolean;
	isSeekInProgress: () => boolean;
	getSeekFromPosition: () => number | undefined;
	getSeekToPosition: () => number | undefined;
}
