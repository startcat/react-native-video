/*
 * Tipos para ProgressManagerUnified
 *
 * Define las interfaces y tipos necesarios para la fachada unificada
 * de gestión de progreso (VOD + DVR).
 *
 */

import { type Logger, type LogLevel } from "../../../features/logger";
import { type SliderValues } from "../../../types/types";
import { type SeekableRange } from "./base";
import { type EPGErrorData, type ModeChangeData, type ProgramChangeData } from "./dvr";
import { type DVR_PLAYBACK_TYPE } from "./enums";

// === CONFIGURACIÓN ===

/*
 * Configuración para VOD manager
 *
 */

export interface ProgressManagerUnifiedVODConfig {
	/** Callback cuando cambia el progreso */
	onProgressUpdate?: ((data: any) => void) | null;

	/** Estado inicial */
	currentTime?: number;
	duration?: number;
	isPaused?: boolean;
	isBuffering?: boolean;

	/** Opciones específicas VOD */
	autoSeekToEnd?: boolean;
	enableLooping?: boolean;
}

/*
 * Configuración para DVR manager
 *
 */

export interface ProgressManagerUnifiedDVRConfig {
	/** Callback cuando cambia el modo DVR */
	onModeChange?: ((data: ModeChangeData) => void) | null;

	/** Callback cuando cambia el programa */
	onProgramChange?: ((data: ProgramChangeData) => void) | null;

	/** Callback cuando cambia el progreso */
	onProgressUpdate?: ((data: any) => void) | null;

	/** Callback cuando se solicita EPG */
	onEPGRequest?: ((timestamp: number) => void) | null;

	/** Callback cuando hay error de EPG */
	onEPGError?: ((data: EPGErrorData) => void) | null;

	/** Función para obtener programa EPG en un timestamp */
	getEPGProgramAt?: ((timestamp: number) => Promise<any>) | null;

	/** Estado inicial */
	currentTime?: number;
	duration?: number;
	isPaused?: boolean;
	isBuffering?: boolean;

	/** Opciones específicas DVR */
	dvrWindowSeconds?: number;
	playbackType?: DVR_PLAYBACK_TYPE;
}

/*
 * Configuración completa del ProgressManagerUnified
 *
 */

export interface ProgressManagerUnifiedConfig {
	/** Configuración para VOD manager */
	vod?: ProgressManagerUnifiedVODConfig;

	/** Configuración para DVR manager */
	dvr?: ProgressManagerUnifiedDVRConfig;

	/** Tipo de contenido inicial */
	initialContentType?: "vod" | "live";

	/** Logger compartido */
	logger?: Logger;
	loggerEnabled?: boolean;
	loggerLevel?: LogLevel;
}

// === DATOS DEL REPRODUCTOR ===

/*
 * Datos de progreso del reproductor (unificado para VOD y DVR)
 *
 */

export interface ProgressManagerUnifiedPlayerData {
	/** Tiempo actual en segundos */
	currentTime: number;

	/** Duración total en segundos (opcional para DVR) */
	duration?: number;

	/** Rango seekable (para DVR, opcional para VOD) */
	seekableRange?: SeekableRange;

	/** Si el reproductor está pausado */
	isPaused?: boolean;

	/** Si el reproductor está buffering */
	isBuffering?: boolean;
}

/*
 * Datos de carga de contenido
 *
 */

export interface ProgressManagerUnifiedContentLoadData {
	/** Duración del contenido */
	duration: number;

	/** Si es contenido en vivo */
	isLive: boolean;

	/** Rango seekable para DVR (opcional) */
	seekableRange?: SeekableRange;

	/** URL del EPG (opcional) */
	epgUrl?: string;
}

// === INTERFACE PRINCIPAL ===

/*
 * Interface del ProgressManagerUnified
 *
 * Fachada que proporciona un único punto de interacción para la gestión
 * de progreso, abstrayendo VOD y DVR managers.
 *
 */

export interface IProgressManagerUnified {
	// === CONFIGURACIÓN ===

	/**
	 * Inicializa el manager con la configuración necesaria
	 * @param config Configuración para VOD y DVR managers
	 */
	initialize(config: ProgressManagerUnifiedConfig): void;

	/**
	 * Cambia el tipo de contenido (VOD <-> DVR)
	 * @param contentType Tipo de contenido actual
	 */
	setContentType(contentType: "vod" | "live"): void;

	// === ACTUALIZACIÓN DE DATOS ===

	/**
	 * Actualiza los datos del reproductor
	 * Delega automáticamente al manager apropiado
	 * @param data Datos de progreso del reproductor
	 */
	updatePlayerData(data: ProgressManagerUnifiedPlayerData): Promise<void>;

	/**
	 * Actualiza el estado de pausa
	 * @param isPaused Si el reproductor está pausado
	 */
	updatePausedState(isPaused: boolean): void;

	/**
	 * Notifica que el contenido ha cargado
	 * @param data Datos de carga (duración, seekableRange, etc.)
	 */
	onContentLoaded(data: ProgressManagerUnifiedContentLoadData): void;

	// === OBTENCIÓN DE VALORES ===

	/**
	 * Obtiene los valores actuales del slider
	 * Funciona tanto para VOD como DVR
	 */
	getSliderValues(): SliderValues;

	/**
	 * Obtiene el tiempo actual de reproducción
	 * Para VOD: tiempo absoluto
	 * Para DVR: tiempo relativo a la ventana DVR
	 */
	getCurrentTime(): number;

	/**
	 * Obtiene la duración total
	 * Para VOD: duración del video
	 * Para DVR: tamaño de la ventana DVR
	 */
	getDuration(): number;

	/**
	 * Verifica si el contenido actual es live/DVR
	 */
	isLiveContent(): boolean;

	/**
	 * Verifica si estamos en el edge (live) del stream DVR
	 */
	isAtLiveEdge(): boolean;

	// === OPERACIONES DE SEEK ===

	/**
	 * Convierte un valor del slider a tiempo de seek
	 * @param sliderValue Valor del slider (0-1 o tiempo absoluto)
	 * @returns Tiempo de seek validado
	 */
	sliderValueToSeekTime(sliderValue: number): number;

	/**
	 * Valida un tiempo de seek según las restricciones del contenido
	 * @param time Tiempo objetivo
	 * @returns Tiempo validado dentro de los límites permitidos
	 */
	validateSeekTime(time: number): number;

	/**
	 * Calcula el tiempo para saltar adelante/atrás
	 * @param direction 'forward' o 'backward'
	 * @param seconds Segundos a saltar (por defecto 10)
	 */
	calculateSkipTime(direction: "forward" | "backward", seconds?: number): number;

	// === CALLBACKS DVR (solo para contenido live) ===

	/**
	 * Registra callback para cambios de modo DVR
	 * @param callback Función a llamar cuando cambia el modo
	 */
	onDVRModeChange(callback: (mode: DVR_PLAYBACK_TYPE) => void): void;

	/**
	 * Registra callback para cambios de programa DVR
	 * @param callback Función a llamar cuando cambia el programa
	 */
	onDVRProgramChange(callback: (program: any | null) => void): void;

	// === GESTIÓN DE PROGRAMAS DVR ===

	/**
	 * Obtiene el programa actual (solo DVR)
	 * @returns Programa actual o null si no hay o es VOD
	 */
	getCurrentProgram(): Promise<any | null>;

	/**
	 * Obtiene todos los programas disponibles (solo DVR)
	 * @returns Array de programas o vacío si es VOD
	 */
	getAvailablePrograms(): any[];

	/**
	 * Salta a un programa específico (solo DVR)
	 * @param programId ID del programa
	 * @returns Tiempo de seek para ir al programa
	 */
	seekToProgram(programId: string): number | null;

	// === MÉTODOS ADICIONALES ===

	/**
	 * Inicia el seguimiento manual de seek (DVR)
	 */
	startManualSeeking(): void;

	/**
	 * Finaliza el seguimiento manual de seek (DVR)
	 */
	endManualSeeking(): void;

	/**
	 * Navega al edge en vivo (solo DVR)
	 * @returns Tiempo de seek para ir al live edge
	 */
	goToLive(): number | null;

	/**
	 * Establece el tipo de reproducción DVR
	 * @param playbackType Tipo de reproducción
	 */
	setPlaybackType(playbackType: DVR_PLAYBACK_TYPE): void;

	/**
	 * Obtiene estadísticas del manager activo
	 */
	getStats(): any;

	// === LIFECYCLE ===

	/**
	 * Resetea el estado del manager
	 * Útil al cambiar de contenido
	 */
	reset(): void;

	/**
	 * Limpia recursos y callbacks
	 */
	dispose(): void;
}
