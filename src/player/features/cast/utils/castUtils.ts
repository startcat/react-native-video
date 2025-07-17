import { CastSession } from "react-native-google-cast";
import { CastAction, CastConnectionInfo, CastErrorInfo, CastMediaInfo, CastState, CastTrackInfo, InternalCastState } from "../types/types";


// ✅ Estado inicial
export function createInitialCastState(): CastState {
    return {
        connection: {
            status: 'disconnected',
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
            availableTextTracks: []
        },
        volume: {
            level: 0.5,
            isMuted: false,
            canControl: false,
            stepInterval: 0.05
        },
        error: {
            hasError: false,
            errorCode: null,
            errorMessage: null,
            lastErrorTime: null
        },
        lastUpdate: Date.now()
    };
}

// ✅ Función para extraer información de tracks
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

// ✅ Función para extraer metadata del MediaInfo
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

// ✅ Reducer que procesa toda la data nativa de forma síncrona
export function castReducer(state: InternalCastState, action: CastAction): InternalCastState {
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

            // ✅ DEBUGGING
            // console.log('[CastReducer] SYNC_UPDATE:', {
            //     nativeMediaStatus: nativeMediaStatus ? {
            //         isPlaying: !!nativeMediaStatus.isPlaying,
            //         isPaused: !!nativeMediaStatus.isPaused,
            //         isIdle: !!nativeMediaStatus.isIdle,
            //         playerState: nativeMediaStatus.playerState,
            //     } : null,
            //     currentMediaState: {
            //         isPlaying: !!state.castState.media.isPlaying,
            //         isPaused: !!state.castState.media.isPaused,
            //         isIdle: !!state.castState.media.isIdle
            //     }
            // });

            // if (nativeMediaStatus) {
            //     console.log(`[CastReducer] FULL nativeMediaStatus: ${JSON.stringify(nativeMediaStatus)}`);
            // }

            // ✅ Procesar conexión
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
                            status: 'disconnected',
                            deviceName: null,
                            statusText: 'Desconectado'
                        };
                }
            })();

            // ✅ Procesar media (solo si tenemos conexión completa)
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
                
                // ✅ Normalizar playerState a mayúsculas para comparación
                const normalizedPlayerState = String(playerState || '').toUpperCase();

                // ✅ Lógica mejorada para currentTime - evitar saltos a 0
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
                // ✅ Progress sin alteraciones - preserva valores originales para DVR
                const progress = duration && duration > 0 ? currentTime / duration : 0;

                return {
                    url: mediaInfo?.contentId || null,
                    title: metadata.title,
                    subtitle: metadata.subtitle,
                    imageUrl: metadata.imageUrl,
                    isPlaying: normalizedPlayerState === 'PLAYING',
                    isPaused: normalizedPlayerState === 'PAUSED',
                    isBuffering: isBufferingState,
                    isIdle: normalizedPlayerState === 'IDLE',
                    currentTime,
                    duration,
                    seekableRange: {
                        start: nativeMediaStatus.liveSeekableRange?.startTime || 0,
                        end: nativeMediaStatus.liveSeekableRange?.endTime || 0
                    },
                    progress, // ✅ Valor original sin clamp
                    playbackRate: nativeMediaStatus.playbackRate || 1.0,
                    audioTrack: tracksInfo.audioTrack,
                    textTrack: tracksInfo.textTrack,
                    availableAudioTracks: tracksInfo.availableAudioTracks,
                    availableTextTracks: tracksInfo.availableTextTracks,
                    mediaTracks: tracksInfo.mediaTracks
                };
            })();

            // ✅ Procesar errores del MediaStatus
            const error: CastErrorInfo = (() => {
                if (nativeMediaStatus?.idleReason === 'ERROR') {
                    return {
                        hasError: true,
                        errorCode: 'MEDIA_ERROR',
                        errorMessage: 'Error en la reproducción del media',
                        lastErrorTime: Date.now()
                    };
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
                    error: {
                        hasError: true,
                        errorCode: action.payload.errorCode,
                        errorMessage: action.payload.errorMessage,
                        lastErrorTime: Date.now()
                    },
                    lastUpdate: Date.now()
                }
            };
        }

        case 'CLEAR_ERROR': {
            return {
                ...state,
                castState: {
                    ...state.castState,
                    error: {
                        hasError: false,
                        errorCode: null,
                        errorMessage: null,
                        lastErrorTime: null
                    },
                    lastUpdate: Date.now()
                }
            };
        }

        default:
            return state;
    }
}