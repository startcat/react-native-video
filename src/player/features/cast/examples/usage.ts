import {
    CastManager,
    CastManagerState,
    CastManagerStatus,
    CastMessageConfig,
    CastOperationResult,
    useCastManager
} from '../index';

// EJEMPLO 1: Uso básico con hook
export function ExampleBasicCastUsage() {
    const castManager = useCastManager({
        debugMode: true,
        callbacks: {
            onStateChange: (state, previousState) => {
                console.log(`Cast state changed: ${previousState} -> ${state}`);
            },
            onContentLoaded: (content) => {
                console.log('Content loaded:', content);
            },
            onContentLoadError: (error) => {
                console.error('Content load error:', error);
            }
        }
    });

    const loadVODContent = async () => {
        const config: CastMessageConfig = {
            source: {
                id: 1,
                uri: 'https://example.com/video.mp4',
                type: 'mp4',
                startPosition: 0
            },
            manifest: null,
            metadata: {
                id: 1,
                title: 'Mi Video',
                subtitle: 'Subtítulo del video',
                description: 'Descripción del video',
                poster: 'https://example.com/poster.jpg',
                isLive: false,
                isDVR: false,
                startPosition: 0
            }
        };

        const result = await castManager.loadContent(config);
        
        if (result === CastOperationResult.SUCCESS) {
            console.log('VOD content loaded successfully');
        } else {
            console.error('Failed to load VOD content');
        }
    };

    const loadLiveContent = async () => {
        const config: CastMessageConfig = {
            source: {
                id: 2,
                uri: 'https://example.com/live.m3u8',
                type: 'hls',
                startPosition: 0
            },
            manifest: {
                type: 'hls',
                manifestURL: 'https://example.com/live.m3u8'
            },
            metadata: {
                id: 2,
                title: 'Live Stream',
                subtitle: 'Streaming en vivo',
                description: 'Contenido en directo',
                poster: 'https://example.com/live-poster.jpg',
                isLive: true,
                isDVR: false,
                startPosition: 0
            }
        };

        const result = await castManager.loadContent(config);
        
        if (result === CastOperationResult.SUCCESS) {
            console.log('Live content loaded successfully');
        } else {
            console.error('Failed to load live content');
        }
    };

    const loadDVRContent = async () => {
        const config: CastMessageConfig = {
            source: {
                id: 3,
                uri: 'https://example.com/dvr.mpd',
                type: 'dash',
                startPosition: 0
            },
            manifest: {
                type: 'dash',
                manifestURL: 'https://example.com/dvr.mpd',
                dvr_window_minutes: 240
            },
            metadata: {
                id: 3,
                title: 'DVR Stream',
                subtitle: 'Stream con DVR',
                description: 'Contenido con capacidad de DVR',
                poster: 'https://example.com/dvr-poster.jpg',
                isLive: true,
                isDVR: true,
                startPosition: 7200 // 2 horas atrás
            }
        };

        const result = await castManager.loadContent(config);
        
        if (result === CastOperationResult.SUCCESS) {
            console.log('DVR content loaded successfully');
        } else {
            console.error('Failed to load DVR content');
        }
    };

    const handlePlayPause = async () => {
        if (castManager.status.state === CastManagerState.PLAYING) {
            await castManager.pause();
        } else {
            await castManager.play();
        }
    };

    const handleSeek = async (time: number) => {
        await castManager.seek(time);
    };

    const handleVolumeChange = async (volume: number) => {
        await castManager.setVolume(volume);
    };

    return {
        // Estado
        isConnected: castManager.status.isConnected,
        isLoading: castManager.status.isLoading,
        isContentLoaded: castManager.status.isContentLoaded,
        currentContent: castManager.currentContent,
        progressInfo: castManager.progressInfo,
        
        // Acciones
        loadVODContent,
        loadLiveContent,
        loadDVRContent,
        handlePlayPause,
        handleSeek,
        handleVolumeChange,
        
        // Controles
        play: castManager.play,
        pause: castManager.pause,
        seek: castManager.seek,
        mute: castManager.mute,
        unmute: castManager.unmute,
        setVolume: castManager.setVolume
    };
}

// EJEMPLO 2: Uso con clase CastManager directamente
export function ExampleDirectCastManager() {
    const [manager, setManager] = useState<CastManager | null>(null);
    const [status, setStatus] = useState<CastManagerStatus | null>(null);
    
    useEffect(() => {
        const castManager = new CastManager({
            debugMode: true,
            callbacks: {
                onStateChange: (state, previousState) => {
                    console.log(`Manager state changed: ${previousState} -> ${state}`);
                },
                onContentLoaded: (content) => {
                    console.log('Manager content loaded:', content);
                },
                onTimeUpdate: (currentTime, duration) => {
                    console.log(`Time update: ${currentTime}/${duration}`);
                }
            }
        });
        
        setManager(castManager);
        
        return () => {
            castManager.destroy();
        };
    }, []);
    
    // Actualizar estado de Cast manualmente
    useEffect(() => {
        if (manager) {
            // Aquí necesitarías obtener el estado de Cast desde hooks nativos
            // y pasarlo al manager con updateCastState()
            
            const interval = setInterval(() => {
                setStatus(manager.getStatus());
            }, 1000);
            
            return () => clearInterval(interval);
        }
    }, [manager]);
    
    const loadContent = async (config: CastMessageConfig) => {
        if (!manager) return;
        
        const result = await manager.loadContent(config);
        return result;
    };
    
    return {
        manager,
        status,
        loadContent
    };
}

// EJEMPLO 3: Uso con hooks específicos
export function ExampleSpecificCastHooks() {
    const { isConnected, isConnecting, statusText } = useCastConnectivity();
    const isReady = useCastReady();
    const progress = useCastProgress();
    const volume = useCastVolume();
    
    return {
        // Conectividad
        isConnected,
        isConnecting,
        statusText,
        isReady,
        
        // Progreso
        currentTime: progress.currentTime,
        duration: progress.duration,
        progress: progress.progress,
        isBuffering: progress.isBuffering,
        isPaused: progress.isPaused,
        
        // Volumen
        volume: volume.volume,
        isMuted: volume.isMuted,
        canControlVolume: volume.canControl
    };
}

// EJEMPLO 4: Comparación de contenido
export function ExampleContentComparison() {
    const { compareContent, isValidUrl } = useCastUtils();
    
    const checkContentChange = (current: CastContentInfo, newConfig: CastMessageConfig) => {
        const comparison = compareContent(current, newConfig);
        
        console.log('Content comparison:', {
            isSameContent: comparison.isSameContent,
            isSameUrl: comparison.isSameUrl,
            isSameStartPosition: comparison.isSameStartPosition,
            needsReload: comparison.needsReload,
            reason: comparison.reason
        });
        
        return comparison;
    };
    
    const validateUrl = (url: string) => {
        const valid = isValidUrl(url);
        console.log(`URL ${url} is ${valid ? 'valid' : 'invalid'}`);
        return valid;
    };
    
    return {
        checkContentChange,
        validateUrl
    };
}

// EJEMPLO 5: Manejo de errores avanzado
export function ExampleAdvancedErrorHandling() {
    const castManager = useCastManager({
        debugMode: true,
        retryAttempts: 3,
        retryDelay: 2000,
        loadTimeout: 10000,
        callbacks: {
            onStateChange: (state, previousState) => {
                // Manejar cambios de estado
                if (state === CastManagerState.ERROR) {
                    console.error('Cast manager entered error state');
                    handleCastError('Cast error state');
                }
            },
            onContentLoadError: (error, content) => {
                console.error('Content load error:', error);
                handleContentLoadError(error, content);
            },
            onPlaybackError: (error) => {
                console.error('Playback error:', error);
                handlePlaybackError(error);
            }
        }
    });
    
    const handleCastError = (error: string) => {
        // Implementar lógica de manejo de errores
        console.error('Handling cast error:', error);
        
        // Ejemplo: mostrar notificación al usuario
        showErrorNotification(error);
        
        // Ejemplo: intentar reconectar
        setTimeout(() => {
            if (!castManager.status.isConnected) {
                console.log('Attempting to reconnect...');
                // Lógica de reconexión
            }
        }, 5000);
    };
    
    const handleContentLoadError = (error: string, content?: CastContentInfo) => {
        console.error('Content load failed:', error, content);
        
        // Implementar lógica específica para errores de carga
        if (error.includes('timeout')) {
            console.log('Load timeout - trying again with longer timeout');
            // Reintentar con configuración diferente
        } else if (error.includes('network')) {
            console.log('Network error - checking connection');
            // Verificar conectividad
        }
    };
    
    const handlePlaybackError = (error: string) => {
        console.error('Playback failed:', error);
        
        // Implementar lógica específica para errores de reproducción
        if (error.includes('codec')) {
            console.log('Codec error - content may not be supported');
            showErrorNotification('Formato de contenido no soportado');
        }
    };
    
    const showErrorNotification = (message: string) => {
        // Implementar notificación de error al usuario
        console.log('Show error notification:', message);
    };
    
    return {
        castManager,
        handleCastError,
        handleContentLoadError,
        handlePlaybackError
    };
}

// EJEMPLO 6: Integración con progress managers existentes
export function ExampleProgressManagerIntegration() {
    const castManager = useCastManager({
        callbacks: {
            onTimeUpdate: (currentTime, duration) => {
                // Actualizar progress managers cuando cambie el tiempo
                updateProgressManagers(currentTime, duration);
            }
        }
    });
    
    const updateProgressManagers = (currentTime: number, duration: number) => {
        // Ejemplo de integración con VOD Progress Manager
        const vodProgressManager = getVODProgressManager();
        if (vodProgressManager) {
            vodProgressManager.updatePlayerData({
                currentTime,
                seekableRange: { start: 0, end: duration },
                duration,
                isBuffering: castManager.progressInfo?.isBuffering || false,
                isPaused: castManager.progressInfo?.isPaused || false
            });
        }
        
        // Ejemplo de integración con DVR Progress Manager
        const dvrProgressManager = getDVRProgressManager();
        if (dvrProgressManager) {
            dvrProgressManager.updatePlayerData({
                currentTime,
                duration,
                seekableRange: { start: 0, end: duration },
                isBuffering: castManager.progressInfo?.isBuffering || false,
                isPaused: castManager.progressInfo?.isPaused || false
            });
        }
    };
    
    const getVODProgressManager = () => {
        // Obtener referencia al VOD Progress Manager
        return null; // Implementar según tu estructura
    };
    
    const getDVRProgressManager = () => {
        // Obtener referencia al DVR Progress Manager
        return null; // Implementar según tu estructura
    };
    
    return {
        castManager,
        updateProgressManagers
    };
}

// EJEMPLO 7: Configuración personalizada
export function ExampleCustomConfiguration() {
    const customConfig = {
        debugMode: true,
        retryAttempts: 5,
        retryDelay: 1000,
        loadTimeout: 15000,
        enableAutoUpdate: true,
        autoUpdateInterval: 500,
        callbacks: {
            onStateChange: (state: CastManagerState, previousState: CastManagerState) => {
                console.log(`Custom callback - State: ${previousState} -> ${state}`);
            },
            onContentLoaded: (content: CastContentInfo) => {
                console.log(`Custom callback - Content loaded:`, content);
            },
            onTimeUpdate: (currentTime: number, duration: number) => {
                console.log(`Custom callback - Time: ${currentTime}/${duration}`);
            }
        }
    };
    
    const castManager = useCastManager(customConfig);
    
    return castManager;
}

// EJEMPLO 8: Migración desde código anterior
export function ExampleMigrationFromLegacyCode() {
    // ANTES: Código anterior con hooks nativos
    /*
    const castState = useCastState();
    const castSession = useCastSession();
    const castClient = useRemoteMediaClient();
    const castMediaStatus = useMediaStatus();
    const castStreamPosition = useStreamPosition(1);
    
    useEffect(() => {
        if (castState === CastState.CONNECTED && castClient && castMessage.current) {
            tryLoadMedia();
        }
    }, [castState, castClient]);
    */
    
    // AHORA: Código simplificado con nuevo sistema
    const castManager = useCastManager({
        debugMode: true,
        callbacks: {
            onStateChange: (state, previousState) => {
                // Reemplaza la lógica anterior de useEffect
                console.log(`State changed: ${previousState} -> ${state}`);
            },
            onContentLoaded: (content) => {
                // Reemplaza onMediaPlaybackStarted
                console.log('Content loaded:', content);
            },
            onTimeUpdate: (currentTime, duration) => {
                // Reemplaza useStreamPosition
                console.log(`Time update: ${currentTime}/${duration}`);
            }
        }
    });
    
    // ANTES: Función compleja prepareCastMessage
    /*
    const prepareCastMessage = (source: any, sourceDrm?: IDrm) => {
        // Lógica compleja para preparar mensaje...
        castMessage.current = getSourceMessageForCast(...);
        tryLoadMedia();
    };
    */
    
    // AHORA: Función simplificada
    const loadContentNew = async (source: any, metadata: any) => {
        const config: CastMessageConfig = {
            source,
            manifest: null, // o tu manifest
            metadata
        };
        
        const result = await castManager.loadContent(config);
        return result;
    };
    
    return {
        castManager,
        loadContentNew
    };
}

// UTILIDADES ADICIONALES
export const CastUtils = {
    // Crear configuración rápida para VOD
    createVODConfig: (id: number, title: string, uri: string, startPosition: number = 0): CastMessageConfig => ({
        source: {
            id,
            uri,
            type: uri.includes('.m3u8') ? 'hls' : 'mp4',
            startPosition
        },
        manifest: null,
        metadata: {
            id,
            title,
            isLive: false,
            isDVR: false,
            startPosition
        }
    }),
    
    // Crear configuración rápida para Live
    createLiveConfig: (id: number, title: string, uri: string, isDVR: boolean = false): CastMessageConfig => ({
        source: {
            id,
            uri,
            type: uri.includes('.m3u8') ? 'hls' : 'dash',
            startPosition: 0
        },
        manifest: {
            type: uri.includes('.m3u8') ? 'hls' : 'dash',
            manifestURL: uri,
            dvr_window_minutes: isDVR ? 240 : undefined
        },
        metadata: {
            id,
            title,
            isLive: true,
            isDVR,
            startPosition: 0
        }
    }),
    
    // Validar configuración
    validateConfig: (config: CastMessageConfig): boolean => {
        return !!(config.source && config.source.uri && config.metadata && config.metadata.id);
    }
};