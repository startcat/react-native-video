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
}

export interface BaseSliderValues {
    minimumValue: number;
    maximumValue: number;
    progress: number;
    percentProgress: number;
    canSeekToEnd: boolean;
}