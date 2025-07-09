import { CONTENT_COMPARISON_TOLERANCE } from '../constants';
import {
    CastContentInfo,
    CastMessageConfig,
    ContentComparisonResult
} from '../types';
import * as enums from '../types/enums';

/*
 *  Valida si una URL es válida para Cast
 *
 */

export function isValidUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
        return false;
    }
}

/*
 *  Genera un ID único para contenido Cast
 *
 */

export function generateContentId(source: any, metadata: any): string {
    // Usar ID del metadata si existe
    if (metadata.id) {
        return `cast_${metadata.id}`;
    }
    
    // Generar ID basado en URL
    const urlHash = hashString(source.uri);
    const timestamp = Date.now();
    
    return `cast_${urlHash}_${timestamp}`;
}

/*
 *  Compara contenido actual con nuevo contenido
 *
 */

export function compareContent(
    current: CastContentInfo, 
    newConfig: CastMessageConfig
): ContentComparisonResult {
    const result: ContentComparisonResult = {
        isSameContent: false,
        isSameUrl: false,
        isSameStartPosition: false,
        needsReload: true
    };
    
    // Comparar URLs
    result.isSameUrl = normalizeUrl(current.contentUrl) === normalizeUrl(newConfig.source.uri);
    
    // Comparar posición de inicio
    const currentStartPos = current.startPosition || 0;
    const newStartPos = newConfig.metadata.startPosition || 0;
    result.isSameStartPosition = Math.abs(currentStartPos - newStartPos) <= CONTENT_COMPARISON_TOLERANCE.TIME_DIFFERENCE;
    
    // Comparar tipo de contenido
    const currentType = getContentTypeFromInfo(current);
    const newType = getContentTypeFromMetadata(newConfig.metadata);
    const isSameType = currentType === newType;
    
    // Determinar si es el mismo contenido
    result.isSameContent = result.isSameUrl && isSameType;
    
    // Determinar si necesita recarga
    result.needsReload = !result.isSameContent || !result.isSameStartPosition;
    
    // Agregar razón si no es el mismo contenido
    if (!result.isSameContent) {
        if (!result.isSameUrl) {
            result.reason = 'Different URL';
        } else if (!isSameType) {
            result.reason = 'Different content type';
        }
    } else if (!result.isSameStartPosition) {
        result.reason = 'Different start position';
    }
    
    return result;
}

/*
 *  Formatea duración en segundos a formato legible
 *
 */

export function formatDuration(seconds: number): string {
    if (seconds < 0) return '00:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

/*
 *  Formatea tiempo en segundos a formato legible (alias de formatDuration)
 *
 */

export function formatTime(seconds: number): string {
    return formatDuration(seconds);
}

/*
 *  Normaliza URL para comparación
 *
 */

export function normalizeUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        
        // Remover parámetros que no afectan el contenido
        const paramsToRemove = ['start', 'timestamp', '_ts', 'cache'];
        paramsToRemove.forEach(param => {
            urlObj.searchParams.delete(param);
        });
        
        return urlObj.toString();
    } catch {
        return url;
    }
}

/*
 *  Obtiene tipo de contenido desde CastContentInfo
 *
 */

export function getContentTypeFromInfo(content: CastContentInfo): enums.CastContentType {
    if (content.isLive) {
        return content.isDVR ? enums.CastContentType.DVR : enums.CastContentType.LIVE;
    }
    return enums.CastContentType.VOD;
}

/*
 *  Obtiene tipo de contenido desde metadata
 *
 */

export function getContentTypeFromMetadata(metadata: any): enums.CastContentType {
    if (metadata.isLive) {
        return metadata.isDVR ? enums.CastContentType.DVR : enums.CastContentType.LIVE;
    }
    return enums.CastContentType.VOD;
}

/*
 *  Genera hash simple de un string
 *
 */

export function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
}

/*
 *  Valida si un objeto es un source válido
 *
 */

export function isValidSource(source: any): boolean {
    return source && 
           typeof source === 'object' && 
           typeof source.uri === 'string' && 
           source.uri.length > 0 &&
           isValidUrl(source.uri);
}

/*
 *  Valida si metadata es válida
 *
 */

export function isValidMetadata(metadata: any): boolean {
    return metadata && 
           typeof metadata === 'object' &&
           (metadata.id !== undefined || metadata.title !== undefined);
}

/*
 *  Extrae información de progreso desde media status
 *
 */

export function extractProgressInfo(mediaStatus: any): {
    currentTime: number;
    duration: number;
    progress: number;
    isBuffering: boolean;
    isPaused: boolean;
} {
    const currentTime = mediaStatus?.currentTime || 0;
    const duration = mediaStatus?.mediaInfo?.streamDuration || 0;
    const progress = duration > 0 ? currentTime / duration : 0;
    
    return {
        currentTime,
        duration,
        progress,
        isBuffering: mediaStatus?.playerState === 'BUFFERING' || mediaStatus?.playerState === 'LOADING',
        isPaused: mediaStatus?.playerState === 'PAUSED'
    };
}

/*
 *  Convierte tiempo en formato HH:MM:SS a segundos
 *
 */

export function timeStringToSeconds(timeString: string): number {
    const parts = timeString.split(':');
    let seconds = 0;
    
    if (parts.length === 3) {
        // HH:MM:SS
        seconds = parseInt(parts[0] || '0') * 3600 + parseInt(parts[1] || '0') * 60 + parseInt(parts[2] || '0');
    } else if (parts.length === 2) {
        // MM:SS
        seconds = parseInt(parts[0] || '0') * 60 + parseInt(parts[1] || '0');
    } else if (parts.length === 1) {
        // SS
        seconds = parseInt(parts[0] || '0');
    }
    
    return isNaN(seconds) ? 0 : seconds;
}

/*
 *  Obtiene información de estado legible
 *
 */

export function getReadableState(state: string): string {
    const stateMap: { [key: string]: string } = {
        'IDLE': 'Inactivo',
        'PLAYING': 'Reproduciendo',
        'PAUSED': 'Pausado',
        'BUFFERING': 'Cargando',
        'LOADING': 'Cargando',
        'UNKNOWN': 'Desconocido'
    };
    
    return stateMap[state] || state;
}

/*
 *  Verifica si un estado indica reproducción activa
 *
 */

export function isActivePlayback(state: string): boolean {
    return state === 'PLAYING' || state === 'BUFFERING' || state === 'LOADING';
}

/*
 *  Verifica si un estado indica contenido pausado
 *
 */

export function isPausedPlayback(state: string): boolean {
    return state === 'PAUSED';
}

/*
 *  Verifica si un estado indica buffering
 *
 */

export function isBufferingPlayback(state: string): boolean {
    return state === 'BUFFERING' || state === 'LOADING';
}

/*
 *  Obtiene información de conectividad Cast
 *
 */

export function getCastConnectivityInfo(castState: string): {
    isConnected: boolean;
    isConnecting: boolean;
    isDisconnected: boolean;
    statusText: string;
} {
    const isConnected = castState === 'CONNECTED';
    const isConnecting = castState === 'CONNECTING';
    const isDisconnected = castState === 'NOT_CONNECTED' || castState === 'NO_DEVICES_AVAILABLE';
    
    let statusText = 'Desconocido';
    if (isConnected) statusText = 'Conectado';
    else if (isConnecting) statusText = 'Conectando';
    else if (isDisconnected) statusText = 'Desconectado';
    
    return {
        isConnected,
        isConnecting,
        isDisconnected,
        statusText
    };
}

/*
 *  Calcula porcentaje de progreso
 *
 */

export function calculateProgress(currentTime: number, duration: number): number {
    if (duration <= 0) return 0;
    return Math.min(Math.max(currentTime / duration, 0), 1);
}

/*
 *  Calcula tiempo restante
 *
 */

export function calculateRemainingTime(currentTime: number, duration: number): number {
    if (duration <= 0) return 0;
    return Math.max(duration - currentTime, 0);
}

/*
 *  Verifica si dos tiempos son aproximadamente iguales
 *
 */

export function timesAreEqual(time1: number, time2: number, tolerance: number = 1): boolean {
    return Math.abs(time1 - time2) <= tolerance;
}

/*
 *  Clamp value between min and max
 *
 */

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/*
 *  Debounce function
 *
 */

export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout>;
    
    return function executedFunction(...args: Parameters<T>) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/*
 *  Throttle function
 *
 */

export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    
    return function executedFunction(...args: Parameters<T>) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}