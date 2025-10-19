import { VideoEventsAdapter } from '../VideoEventsAdapter';

import type { ReactVideoEvents } from '../../../../types';
import type { PlayerError } from '../../errors';

import {
    PlayerAnalyticsEvents,
    type PlayerAnalyticsPlugin
} from '../../../features/analytics';

export interface UseVideoAnalyticsProps {
    plugins?: PlayerAnalyticsPlugin[];
    onInternalError?: (error: PlayerError) => void;
}

export interface UseVideoAnalyticsReturn {
    // Eventos para conectar con el componente Video
    videoEvents: ReactVideoEvents;
    
    // Métodos para control manual
    analyticsEvents: PlayerAnalyticsEvents;
    adapter: VideoEventsAdapter;
    
    // Utilidades (basadas en métodos disponibles en VideoEventsAdapter)
    getCurrentPosition: () => number;
    getDuration: () => number;
    isPlaying: () => boolean;
    isBuffering: () => boolean;
}