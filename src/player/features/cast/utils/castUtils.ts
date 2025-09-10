import { CastSession } from "react-native-google-cast";
import { PlayerError } from "../../../core/errors";
import { ComponentLogger } from '../../logger';
import { CastAction, CastConnectionInfo, CastMediaInfo, CastStateCustom, CastTrackInfo, InternalCastState } from "../types/types";
import { validateHookStateChange } from "./validations";

// Estado inicial
export function createInitialCastState(): CastStateCustom {
    return {
        connection: {
            status: 'notConnected',
            deviceName: null,
            statusText: 'Desconectado'
        },
        media: {
            url: null,
            title: null,
            subtitle: null,
            imageUrl: null,
            isPlaying: false,
            isPaused: false,
            isBuffering: false,
            isIdle: true,
            currentTime: 0,
            duration: null,
            seekableRange: null,
            progress: 0,
            playbackRate: 1.0,
            audioTrack: null,
            textTrack: null,
            availableAudioTracks: [],
            availableTextTracks: [],
            mediaTracks: []
        },
        volume: {
            level: 0.5,
            isMuted: false
        },
        error: null,
        lastUpdate: Date.now()
    };
}

// Función para extraer información de tracks
export function extractTracksInfo(mediaStatus: any) {
    if (!mediaStatus || !mediaStatus.mediaInfo) {
        return {
            audioTrack: null,
            textTrack: null,
            availableAudioTracks: [],
            availableTextTracks: []
        };
    }

    const mediaInfo = mediaStatus.mediaInfo;
    const activeTracks = mediaStatus.activeTrackIds || [];
    const mediaTracks = mediaInfo.mediaTracks || [];

    // Procesar todas las pistas disponibles
    const audioTracks: CastTrackInfo[] = [];
    const textTracks: CastTrackInfo[] = [];
    let activeAudioTrack: CastTrackInfo | null = null;
    let activeTextTrack: CastTrackInfo | null = null;

    mediaTracks.forEach((track: any) => {
        const trackInfo: CastTrackInfo = {
            id: track.trackId,
            name: track.name || track.language || `Track ${track.trackId}`,
            language: track.language || null,
            type: track.type?.toUpperCase() || 'UNKNOWN'
        };

        const isActive = activeTracks.includes(track.trackId);

        switch (track.type?.toUpperCase()) {
            case 'AUDIO':
                audioTracks.push(trackInfo);
                if (isActive) {
                    activeAudioTrack = trackInfo;
                }
                break;
            case 'TEXT':
                textTracks.push(trackInfo);
                if (isActive) {
                    activeTextTrack = trackInfo;
                }
                break;
        }
    });

    return {
        audioTrack: activeAudioTrack,
        textTrack: activeTextTrack,
        availableAudioTracks: audioTracks,
        availableTextTracks: textTracks,
        mediaTracks: mediaTracks
    };
}

// Función para extraer metadata del MediaInfo
export function extractMediaMetadata(mediaInfo: any) {
    if (!mediaInfo || !mediaInfo.metadata) {
        return {
            title: null,
            subtitle: null,
            imageUrl: null
        };
    }

    const metadata = mediaInfo.metadata;
    
    return {
        title: metadata.title || metadata.movieTitle || null,
        subtitle: metadata.subtitle || metadata.artist || metadata.albumArtist || null,
        imageUrl: metadata.images?.[0]?.url || null
    };
}

export async function getVolume(session: CastSession): Promise<{ level: number; isMuted: boolean }> {
    
    if (session){
        const volume = await session.getVolume();
        const isMuted = await session.isMute();
        return {
            level: volume,
            isMuted: isMuted
        };
    }

    return {
        level: 0,
        isMuted: false
    };
}

// Reducer que procesa toda la data nativa de forma síncrona
export function castReducer(state: InternalCastState, action: CastAction): InternalCastState {
    const currentLogger: ComponentLogger | null | undefined = state.logger;
    switch (action.type) {
        case 'SYNC_UPDATE': {
            const { payload } = action;
            const {
                nativeCastState,
                nativeSession,
                nativeClient,
                nativeMediaStatus,
                nativeStreamPosition
            } = payload;

            // if (nativeMediaStatus) {
            //     currentLogger?.temp(`FULL nativeMediaStatus: ${JSON.stringify(nativeMediaStatus)}`);
            // }

            // Procesar conexión
            const connection: CastConnectionInfo = (() => {
                const castStateStr = String(nativeCastState || 'NOT_CONNECTED').toUpperCase();

                switch (castStateStr) {
                    case 'CONNECTED':
                        return {
                            status: 'connected',
                            deviceName: nativeSession?.deviceName || 'Dispositivo Cast',
                            statusText: `Conectado a ${nativeSession?.deviceName || 'dispositivo'}`
                        };
                    case 'CONNECTING':
                        return {
                            status: 'connecting',
                            deviceName: null,
                            statusText: 'Conectando...'
                        };
                    default:
                        return {
                            status: 'notConnected',
                            deviceName: null,
                            statusText: 'Desconectado'
                        };
                }
            })();

            // Procesar media (solo si tenemos conexión completa)
            const media: CastMediaInfo = (() => {
                const hasValidConnection = connection.status === 'connected' && nativeSession && nativeClient;
                
                if (!hasValidConnection || !nativeMediaStatus) {
                    return {
                        url: null,
                        title: null,
                        subtitle: null,
                        imageUrl: null,
                        isPlaying: false,
                        isPaused: false,
                        isBuffering: false,
                        isIdle: true,
                        currentTime: 0,
                        duration: null,
                        seekableRange: null,
                        progress: 0,
                        playbackRate: 1.0,
                        audioTrack: null,
                        textTrack: null,
                        availableAudioTracks: [],
                        availableTextTracks: [],
                        mediaTracks: []
                    };
                }

                const playerState = nativeMediaStatus.playerState;
                const mediaInfo = nativeMediaStatus.mediaInfo;
                const metadata = extractMediaMetadata(mediaInfo);
                const tracksInfo = extractTracksInfo(nativeMediaStatus);
                
                // Normalizar playerState a mayúsculas para comparación
                const normalizedPlayerState = String(playerState || '').toUpperCase();

                // Lógica mejorada para currentTime - evitar saltos a 0
                let currentTime = nativeStreamPosition || 0;
                
                // Si recibimos 0 pero tenemos una posición válida previa Y estamos buffering/loading
                // mantener la posición previa para evitar saltos visuales en DASH/DVR
                const isBufferingState = normalizedPlayerState === 'BUFFERING' || normalizedPlayerState === 'LOADING';
                const shouldPreservePosition = (
                    currentTime === 0 && 
                    state.lastValidPosition > 0 && 
                    isBufferingState &&
                    // Solo preservar si la diferencia de tiempo es pequeña (< 5 segundos desde la última actualización)
                    (Date.now() - state.castState.lastUpdate) < 5000
                );
                
                if (shouldPreservePosition) {
                    currentTime = state.lastValidPosition;
                }
                
                const duration = mediaInfo?.streamDuration || null;
                
                // Para Live DVR, usar seekableRange.end como duración si streamDuration es inválida
                const effectiveDuration = (() => {
                    // Si tenemos una duración válida del stream, usarla
                    if (duration && duration > 0) {
                        return duration;
                    }
                    
                    // Para Live DVR, usar el endTime del seekableRange como duración
                    const seekableEnd = nativeMediaStatus.liveSeekableRange?.endTime;
                    if (seekableEnd && seekableEnd > 0) {
                        return seekableEnd;
                    }
                    
                    // Preservar duración previa si existe y es válida
                    const prevDuration = state.castState.media?.duration;
                    if (prevDuration && prevDuration > 0) {
                        return prevDuration;
                    }
                    
                    return null;
                })();

                // Progress sin alteraciones - preserva valores originales para DVR
                const progress = effectiveDuration && effectiveDuration > 0 ? currentTime / effectiveDuration : 0;

                const result = {
                    url: mediaInfo?.contentId || null,
                    title: metadata.title,
                    subtitle: metadata.subtitle,
                    imageUrl: metadata.imageUrl,
                    isPlaying: normalizedPlayerState === 'PLAYING',
                    isPaused: normalizedPlayerState === 'PAUSED',
                    isBuffering: isBufferingState,
                    isIdle: normalizedPlayerState === 'IDLE',
                    currentTime,
                    duration: effectiveDuration,
                    seekableRange: {
                        start: nativeMediaStatus.liveSeekableRange?.startTime || 0,
                        end: nativeMediaStatus.liveSeekableRange?.endTime || 0
                    },
                    progress,
                    playbackRate: nativeMediaStatus.playbackRate || 1.0,
                    audioTrack: tracksInfo.audioTrack,
                    textTrack: tracksInfo.textTrack,
                    availableAudioTracks: tracksInfo.availableAudioTracks,
                    availableTextTracks: tracksInfo.availableTextTracks,
                    mediaTracks: tracksInfo.mediaTracks
                };

                currentLogger?.debug(`Media result - seekableRange: ${JSON.stringify(result.seekableRange)}, currentTime: ${result.currentTime}, duration: ${result.duration}`);
                currentLogger?.debug(`Media result: ${JSON.stringify(result)}`);

                return result;
            })();

            // Procesar errores del MediaStatus
            const error: PlayerError | null = (() => {
                if (nativeMediaStatus?.idleReason === 'ERROR') {
                    return new PlayerError("PLAYER_CAST_PLAYBACK_INTERRUPTED", {
                        idleReason: nativeMediaStatus.idleReason
                    });
                }
                
                // Mantener error previo si no hay nuevo estado
                return state.castState.error;
            })();

            // Actualizar lastValidPosition si tenemos una posición real y válida
            const newLastValidPosition = (
                media.currentTime > 0 && 
                !media.isBuffering && 
                media.isPlaying
            ) ? media.currentTime : state.lastValidPosition;

            const connectionHasChanged = validateHookStateChange('castState - connection', state.castState.connection, connection);
            const mediaHasChanged = validateHookStateChange('castState - media', state.castState.media, media);
            const errorHasChanged = validateHookStateChange('castState - error', state.castState.error, error);
            
            if (connectionHasChanged || mediaHasChanged || errorHasChanged) {
                return {
                    castState: {
                        ...state.castState,
                        connection,
                        media,
                        error,
                        lastUpdate: Date.now()
                    },
                    lastValidPosition: newLastValidPosition,
                    updateSequence: state.updateSequence + 1,
                };
            } else {
                return state;

            }
        }

        case 'UPDATE_VOLUME': {
            return {
                ...state,
                castState: {
                    ...state.castState,
                    volume: {
                        ...state.castState.volume,
                        ...action.payload
                    },
                    lastUpdate: Date.now()
                }
            };
        }

        case 'SET_ERROR': {
            return {
                ...state,
                castState: {
                    ...state.castState,
                    error: action.payload,
                    lastUpdate: Date.now()
                }
            };
        }

        case 'CLEAR_ERROR': {
            return {
                ...state,
                castState: {
                    ...state.castState,
                    error: null,
                    lastUpdate: Date.now()
                }
            };
        }

        case 'UPDATE_LOGGER': {
            return {
                ...state,
                logger: action.payload.logger
            };
        }

        default:
            return state;
    }
}