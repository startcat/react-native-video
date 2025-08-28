import { Logger, LogLevel } from '../../../features/logger';

export interface SeekableRange {
    start: number;
    end: number;
}

export interface BaseUpdatePlayerData {
    currentTime: number;
    duration?: number;
    seekableRange: SeekableRange;
    isBuffering: boolean;
    isPaused: boolean;
}

export interface BaseProgressManagerOptions {
    // Callbacks comunes
    onProgressUpdate?: ((data: any) => void) | null;
    onSeekRequest?: ((playerTime: number) => void) | null;
    onValidationError?: ((error: string) => void) | null;
    
    // Estado inicial
    currentTime?: number;
    duration?: number;
    isPaused?: boolean;
    isBuffering?: boolean;

    // Logger
    logger?: Logger;
    loggerEnabled?: boolean;
    loggerLevel?: LogLevel;
}
