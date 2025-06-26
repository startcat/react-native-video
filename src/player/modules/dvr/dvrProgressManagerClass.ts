export interface SeekableRange {
    start: number;
    end: number;
}

export interface Program {
    id: string;
    title?: string;
    startDate: number;
    endDate: number;
}

export interface SliderValues {
    minimumValue: number;
    maximumValue: number;
    progress: number;
    canSeekToEnd: boolean;
    liveEdge?: number; // Usado en modo EPG
}

export interface ProgramChangeData {
    previousProgram: Program | null;
    currentProgram: Program | null;
}

export interface ModeChangeData {
    isEPGMode: boolean;
    program: Program | null;
}

export interface ProgressUpdateData {
    minimumValue: number;
    maximumValue: number;
    progress: number;
    canSeekToEnd: boolean;
    isLiveEdgePosition: boolean;
    isPaused: boolean;
    isBuffering: boolean;
    isEPGMode: boolean;
    currentProgram: Program | null;
    currentRealTime: number;
}

export interface UpdatePlayerData {
    currentTime: number;
    seekableRange: SeekableRange;
    isBuffering: boolean;
    isPaused: boolean;
}

export interface DVRProgressManagerData {
    dvrWindowSeconds?: number;
    currentTime?: number;
    isPaused?: boolean;
    isBuffering?: boolean;
    isEPGMode?: boolean;

    // EPG Provider
    getEPGProgramAt?: (timestamp:number) => Program | null;
    getEPGNextProgram?: (program:Program) => Program | null;

    // Callbacks
    onModeChange?: (data:ModeChangeData) => void;
    onProgramChange?: (data:ProgramChangeData) => void;
    onProgressUpdate?: (data:ProgressUpdateData) => void;
    onSeekRequest?: (playerTime:number) => void;
}

export class DVRProgressManager {

    private _initialTimeWindowSeconds:number;
    private _currentTimeWindowSeconds:number;
    private _currentTime:number;
    private _seekableRange:SeekableRange;
    private _liveEdgeReference:number;

    private _pauseStartTime:number;
    private _totalPauseTime:number;

    private _isPaused:boolean = false;
    private _isBuffering:boolean = false;
    private _isLiveEdgePosition:boolean = false;
    private _isEPGMode:boolean = false;

    private _currentProgram:Program | null = null;

    private _getEPGProgramAt?: (timestamp:number) => Program | null;
    private _getEPGNextProgram?: (program:Program) => Program | null;

    private _onProgramChange?: (data:ProgramChangeData) => void;
    private _onModeChange?: (data:ModeChangeData) => void;
    private _onProgressUpdate?: (data:ProgressUpdateData) => void;
    private _onSeekRequest?: (playerTime:number) => void;
    
    constructor(options:DVRProgressManagerData = {}) {

        // Configuración inicial
        this._initialTimeWindowSeconds = options.dvrWindowSeconds || 3600; // Ventana de tiempo en segundos (1 hora por defecto)
        this._currentTimeWindowSeconds = this._initialTimeWindowSeconds;
      
        // Estado del reproductor
        this._currentTime = options.currentTime || 0;
        this._seekableRange = { start: 0, end: 0 };
        this._isLiveEdgePosition = true;
        this._isPaused = options.isPaused || false;
        this._isBuffering = options.isBuffering || false;
      
        // Control de tiempo para pausas/buffering
        this._pauseStartTime = 0;
        this._totalPauseTime = 0;
      
        // Modo EPG
        this._isEPGMode = options.isEPGMode || false;
        this._currentProgram = null;
      
        // Callbacks
        this._onProgramChange = options.onProgramChange || undefined;
        this._onModeChange = options.onModeChange || undefined;
        this._onProgressUpdate = options.onProgressUpdate || undefined;
        this._onSeekRequest = options.onSeekRequest || undefined;
      
        // EPG provider
        this._getEPGProgramAt = options.getEPGProgramAt || undefined;
        this._getEPGNextProgram = options.getEPGNextProgram || undefined;
      
        // Referencia de tiempo inicial (timestamp del edge live inicial)
        this._liveEdgeReference = Date.now();

        if (options.currentTime && this._seekableRange.end > 0) {
            this._updateLiveStatus();
        }
        
    }
  
    /*
     *  Actualiza los datos del reproductor
     * 
     */

    updatePlayerData(data:UpdatePlayerData) {
        const { currentTime, seekableRange, isBuffering, isPaused } = data;
      
        this._currentTime = currentTime || 0;
        this._seekableRange = seekableRange || this._seekableRange;
      
        // Manejar cambios de estado de pausa/buffering
        this._handlePlaybackStateChange(isPaused, isBuffering);
      
        // Actualizar ventana de tiempo si hay pausas/buffering
        this._updateTimeWindow();
      
        // Determinar si estamos en vivo
        this._updateLiveStatus();
      
        // Si estamos en modo EPG, verificar cambios de programa
        if (this._isEPGMode) {
            this._checkProgramChange();
        }
      
        // Emitir actualización
        this._emitProgressUpdate();
    }
  
    /*
     *  Obtiene los valores calculados para el slider
     * 
     */
    
    getSliderValues(): SliderValues {

        if (this._isEPGMode) {
            return this._getEPGSliderValues();

        } else {
            return this._getDVRSliderValues();
        }


    }
  
    /*
     *  Activar/desactivar modo EPG
     * 
     */
    
    setEPGMode(enabled:boolean, program:Program | null = null) {
        this._isEPGMode = enabled;
      
        if (enabled && this._getEPGProgramAt) {
            // Obtener programa actual si no se proporciona
            if (!program) {
                const currentRealTime = this._getCurrentRealTime();
                this._currentProgram = this._getEPGProgramAt(currentRealTime);
            } else {
                this._currentProgram = program;
            }
        } else {
            this._currentProgram = null;
        }
      
        if (this._onModeChange){
            this._onModeChange({ isEPGMode: this._isEPGMode, program: this._currentProgram });
        }

        this._emitProgressUpdate();
    }
  
    /*
     *  Ir al edge live
     * 
     */

    goToLive() {
        this._isLiveEdgePosition = true;
        this._totalPauseTime = 0;
        this._currentTimeWindowSeconds = this._initialTimeWindowSeconds;
      
        // En modo DVR, ir al final del rango seekable
        if (!this._isEPGMode) {
            const targetTime = this._seekableRange.end;
            this._seekTo(targetTime);

        } else {
            // En modo EPG, ir al tiempo actual real
            const currentRealTime = this._getCurrentRealTime();
            this._seekToRealTime(currentRealTime);

        }
    }
  
    /*
     *  Ir a una hora específica (timestamp)
     * 
     */

    goToTime(timestamp:number) {
        this._isLiveEdgePosition = false;
      
        if (this._isEPGMode) {
            this._seekToRealTime(timestamp);

        } else {
            // Convertir timestamp a tiempo del reproductor
            const targetTime = this._timestampToPlayerTime(timestamp);
            this._seekTo(targetTime);

        }
    }
  
    /*
     *  Avanzar tiempo determinado (en segundos)
     * 
     */

    skipForward(seconds:number) {
        const newTime = this._currentTime + seconds;
        this._seekTo(newTime);
    }
  
    /*
     *  Retroceder tiempo determinado (en segundos)
     * 
     */

    skipBackward(seconds:number) {
        const newTime = Math.max(0, this._currentTime - seconds);
        this._seekTo(newTime);
    }
  
    /*
     *  Buscar a una posición específica del slider (0-1)
     * 
     */

    seekToProgress(progress: number) {
        const sliderValues = this.getSliderValues();
        const range = sliderValues.maximumValue - sliderValues.minimumValue;
        const targetValue = sliderValues.minimumValue + (range * progress);
      
        // Actualizar estado live según la posición
        const tolerance = 0.95; // 95% del slider
        this._isLiveEdgePosition = progress >= tolerance;
      
        if (this._isEPGMode) {
            this._seekToRealTime(targetValue);
        } else {
            this._seekTo(targetValue);
        }
    }
  
    /*
     *  Obtener información del programa actual
     * 
     */

    getCurrentProgramInfo() {
        if (!this._getEPGProgramAt) return null;
      
        const currentRealTime = this._getCurrentRealTime();
        return this._getEPGProgramAt(currentRealTime);
    }
  
    // MÉTODOS PRIVADOS

    _isValidState(): boolean {
        return this._seekableRange !== null && 
               this._seekableRange.end > 0 && 
               this._currentTime >= 0;
    }
  
    _handlePlaybackStateChange(isPaused: boolean, isBuffering: boolean) {
        const wasStalled = this._isPaused || this._isBuffering;
        const isStalled = isPaused || isBuffering;
      
        if (!wasStalled && isStalled) {
            this._pauseStartTime = Date.now();

        } else if (wasStalled && !isStalled) {
            if (this._pauseStartTime > 0) {
                this._totalPauseTime += Date.now() - this._pauseStartTime;
                this._pauseStartTime = 0;
            }
        }
      
        this._isPaused = isPaused;
        this._isBuffering = isBuffering;
    }
  
    _updateTimeWindow() {
        // Calcular tiempo total de pausa/buffering incluyendo pausa actual
        let totalPause = this._totalPauseTime;

        if (this._pauseStartTime) {
            totalPause += Date.now() - this._pauseStartTime;
        }
      
        // Expandir ventana de tiempo
        this._currentTimeWindowSeconds = this._initialTimeWindowSeconds + (totalPause / 1000);
    }
  
    _updateLiveStatus() {
        if (!this._isValidState()) return;

        // Considerar que estamos en vivo si estamos cerca del final del rango seekable
        const tolerance = 10; // 10 segundos de tolerancia
        this._isLiveEdgePosition = (this._seekableRange.end - this._currentTime) <= tolerance;
    }
  
    _checkProgramChange() {
        if (!this._getEPGNextProgram || !this._currentProgram) return;
      
        const currentRealTime = this._getCurrentRealTime();
      
        if (currentRealTime >= this._currentProgram.endDate) {
            const nextProgram = this._getEPGNextProgram(this._currentProgram);
        
            if (nextProgram) {
                const previousProgram = this._currentProgram;
                this._currentProgram = nextProgram;
    
                if (this._onProgramChange){
                    this._onProgramChange({
                        previousProgram: previousProgram,
                        currentProgram: nextProgram
                    });
                }
            }
        }
    }
  
    _getDVRSliderValues(): SliderValues {
        const now = Date.now();
        const liveEdge = this._liveEdgeReference + (now - this._liveEdgeReference);
        const windowStart = liveEdge - (this._currentTimeWindowSeconds * 1000);
      
        return {
            minimumValue: windowStart,
            maximumValue: liveEdge,
            progress: this._getCurrentRealTime(),
            canSeekToEnd: true
        };
    }
  
    _getEPGSliderValues(): SliderValues {
        if (!this._currentProgram) {
            return this._getDVRSliderValues();
        }
      
        const now = Date.now();
        const programStart = this._currentProgram.startDate;
        const programEnd = this._currentProgram.endDate;
        const currentRealTime = this._getCurrentRealTime();
      
        // Si el programa está en directo, limitar el máximo al tiempo actual
        const effectiveEnd = Math.min(programEnd, now);
      
        return {
            minimumValue: programStart,
            maximumValue: programEnd,
            progress: currentRealTime,
            canSeekToEnd: programEnd <= now, // Solo se puede ir al final si el programa ya terminó
            liveEdge: effectiveEnd // Límite real para seeking
        };
    }
  
    _getCurrentRealTime(): number {
        
        // Validar que tenemos datos válidos
        if (!this._seekableRange || this._seekableRange.end <= 0) {
            return Date.now(); // Fallback seguro
        }
        
        const timeSinceLiveReference = this._seekableRange.end - this._currentTime;
        
        // Proteger contra valores negativos extremos
        const calculatedTime = Date.now() - (timeSinceLiveReference * 1000);
        return Math.max(calculatedTime, this._liveEdgeReference - (this._currentTimeWindowSeconds * 1000));

    }
  
    _timestampToPlayerTime(timestamp:number) {
        const timeDiff = (Date.now() - timestamp) / 1000;
        return this._seekableRange.end - timeDiff;
    }
  
    _seekTo(playerTime:number) {
        // Aquí invocarías el método seek del reproductor
        // player.seek(playerTime);
      
        // Por ahora solo emitimos el evento
        this._emitSeekRequest(playerTime);
    }
  
    _seekToRealTime(timestamp:number) {
        const playerTime = this._timestampToPlayerTime(timestamp);
        this._seekTo(playerTime);
    }
  
    _emitProgressUpdate() {
        const sliderValues = this.getSliderValues();
      
        if (this._onProgressUpdate){
            this._onProgressUpdate({
                ...sliderValues,
                isLiveEdgePosition: this._isLiveEdgePosition,
                isPaused: this._isPaused,
                isBuffering: this._isBuffering,
                isEPGMode: this._isEPGMode,
                currentProgram: this._currentProgram,
                currentRealTime: this._getCurrentRealTime()
            });
        }
    }
  
    _emitSeekRequest(playerTime:number) {
        // Callback para que el componente padre ejecute el seek
        if (this._onSeekRequest) {
            this._onSeekRequest(playerTime);
        }
    }
  
    // MÉTODOS PÚBLICOS ADICIONALES
  
    /*
     *  Resetear el gestor a estado inicial
     * 
     */

    reset() {
        this._currentTimeWindowSeconds = this._initialTimeWindowSeconds;
        this._totalPauseTime = 0;
        this._pauseStartTime = 0;
        this._isLiveEdgePosition = true;
        this._liveEdgeReference = Date.now();
        this.setEPGMode(false, null);
    }
  
    /*
     *  Obtener estadísticas actuales
     * 
     */

    getStats() {
        return {
            initialTimeWindowSeconds: this._initialTimeWindowSeconds,
            currentTimeWindowSeconds: this._currentTimeWindowSeconds,
            totalPauseTime: this._totalPauseTime / 1000, // en segundos
            isLiveEdgePosition: this._isLiveEdgePosition,
            isEPGMode: this._isEPGMode,
            currentProgram: this._currentProgram
        };
    }

    // ATRIBUTOS PÚBLICOS
    
    get currentTimeWindowSeconds() {
        return this._currentTimeWindowSeconds;
    }

    get totalPauseTime() {
        return this._totalPauseTime;
    }

    get isLiveEdgePosition() {
        return this._isLiveEdgePosition;
    }

    get isEPGMode() {
        return this._isEPGMode;
    }

    get currentProgram() {
        return this._currentProgram;
    }

}