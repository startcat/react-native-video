# Hook useCastManager - Documentación

Este documento describe el funcionamiento del hook principal `useCastManager` del sistema Cast, ubicado en `hooks/useCastManager.ts`.

## Índice

1. [useCastManager](#usecastmanager) - Hook principal
2. [useSimpleCastManager](#usesimplecastmanager) - Hook simplificado
3. [useCastManagerStatus](#usecastmanagerstatus) - Solo estado
4. [useCastManagerProgress](#usecastmanagerprogress) - Solo progreso
5. [Ejemplos de uso](#ejemplos-de-uso)

---

## useCastManager

Hook principal para gestionar todas las operaciones Cast. Proporciona control completo sobre la conexión, carga de contenido, reproducción y monitoreo.

### Sintaxis

```typescript
const manager = useCastManager(config?: UseCastManagerConfig): CastManagerHookResult
```

### Parámetros

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `config` | `UseCastManagerConfig` | ❌ | Configuración opcional del hook |

#### UseCastManagerConfig

| Propiedad | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `callbacks` | `CastManagerCallbacks` | ❌ | Callbacks para eventos del manager |
| `retryAttempts` | `number` | ❌ | Intentos de reintento en operaciones |
| `retryDelay` | `number` | ❌ | Delay entre reintentos en ms |
| `loadTimeout` | `number` | ❌ | Timeout para carga de contenido |
| `debugMode` | `boolean` | ❌ | Habilita logs detallados |

**Nota:** Los parámetros `enableAutoUpdate` y `autoUpdateInterval` han sido eliminados para optimizar el rendimiento y evitar loops infinitos. El hook ahora se actualiza automáticamente basándose en eventos nativos del Cast.

#### CastManagerCallbacks

| Callback | Tipo | Descripción |
|----------|------|-------------|
| `onStateChange` | `(state, previousState) => void` | Cambio de estado del manager |
| `onContentLoaded` | `(content) => void` | Contenido cargado exitosamente |
| `onContentLoadError` | `(error, content?) => void` | Error al cargar contenido |
| `onPlaybackStarted` | `() => void` | Reproducción iniciada |
| `onPlaybackEnded` | `() => void` | Reproducción finalizada |
| `onPlaybackError` | `(error) => void` | Error durante reproducción |
| `onBufferingChange` | `(isBuffering) => void` | Cambio en estado de buffering |
| `onTimeUpdate` | `(currentTime, duration) => void` | Actualización de tiempo |

### Valor de Retorno

El hook retorna un objeto `CastManagerHookResult` con las siguientes propiedades:

#### Estado

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `status` | `CastManagerStatus` | Estado actual del Cast Manager |
| `currentContent` | `CastContentInfo?` | Información del contenido actual |
| `progressInfo` | `CastProgressInfo?` | Información de progreso de reproducción |

#### Acciones Principales

| Método | Tipo | Descripción |
|--------|------|-------------|
| `loadContent` | `(config) => Promise<CastOperationResult>` | Cargar contenido para Cast |
| `clearContent` | `() => void` | Limpiar contenido actual |

#### Controles de Reproducción

| Método | Tipo | Descripción |
|--------|------|-------------|
| `play` | `() => Promise<CastOperationResult>` | Iniciar reproducción |
| `pause` | `() => Promise<CastOperationResult>` | Pausar reproducción |
| `seek` | `(time: number) => Promise<CastOperationResult>` | Buscar posición específica |
| `skipForward` | `(seconds: number) => Promise<CastOperationResult>` | Saltar hacia adelante |
| `skipBackward` | `(seconds: number) => Promise<CastOperationResult>` | Saltar hacia atrás |

#### Controles de Audio

| Método | Tipo | Descripción |
|--------|------|-------------|
| `mute` | `() => Promise<CastOperationResult>` | Silenciar audio |
| `unmute` | `() => Promise<CastOperationResult>` | Activar audio |
| `setVolume` | `(volume: number) => Promise<CastOperationResult>` | Establecer volumen (0-1) |

#### Controles de Pistas

| Método | Tipo | Descripción |
|--------|------|-------------|
| `setAudioTrack` | `(trackIndex: number) => Promise<CastOperationResult>` | Cambiar pista de audio |
| `setSubtitleTrack` | `(trackIndex: number) => Promise<CastOperationResult>` | Cambiar pista de subtítulos |
| `disableSubtitles` | `() => Promise<CastOperationResult>` | Desactivar todos los subtítulos |

#### Utilidades

| Método | Tipo | Descripción |
|--------|------|-------------|
| `isSameContent` | `(config) => boolean` | Verificar si es el mismo contenido |
| `isContentLoaded` | `() => boolean` | Verificar si hay contenido cargado |
| `isReady` | `() => boolean` | Verificar si Cast está listo |
| `manager` | `CastManager` | Instancia del CastManager |

### Ejemplo de Uso

```typescript
import { useCastManager } from '@/features/cast';

const CastPlayer = () => {
    const {
        status,
        currentContent,
        progressInfo,
        loadContent,
        clearContent,
        play,
        pause,
        seek,
        stop,
        mute,
        unmute,
        setVolume,
        setAudioTrack,
        setSubtitleTrack,
        disableSubtitles,
        isReady
    } = useCastManager({
        debugMode: true,
        callbacks: {
            onStateChange: (state, previousState) => {
                console.log(`Estado: ${previousState} -> ${state}`);
            },
            onContentLoaded: (content) => {
                console.log('Contenido cargado:', content.title);
            },
            onTimeUpdate: (currentTime, duration) => {
                console.log(`Progreso: ${currentTime}/${duration}s`);
            }
        }
    });

    const handleLoadContent = async () => {
        const config = {
            source: { uri: 'video-url' },
            manifest: {},
            metadata: {
                title: 'Mi Video',
                subtitle: 'Descripción'
            }
        };

        const result = await loadContent(config);
        if (result === CastOperationResult.SUCCESS) {
            await play();
        }
    };

    const handleSetAudioTrack = async () => {
        await setAudioTrack(1);
    };

    const handleSetSubtitleTrack = async () => {
        await setSubtitleTrack(0);
    };

    const handleDisableSubtitles = async () => {
        await disableSubtitles();
    };

    return (
        <View>
            <Text>Estado: {castManager.status.state}</Text>
            <Text>Conectado: {castManager.status.isConnected ? 'Sí' : 'No'}</Text>
            
            {castManager.currentContent && (
                <Text>Reproduciendo: {castManager.currentContent.title}</Text>
            )}
            
            <Button title="Cargar Contenido" onPress={handleLoadContent} />
            <Button title="Play" onPress={castManager.play} />
            <Button title="Pause" onPress={castManager.pause} />
        </View>
    );
};
```

---

## useSimpleCastManager

Hook simplificado para casos básicos donde solo necesitas funcionalidad esencial.

### Sintaxis

```typescript
const simple = useSimpleCastManager(): SimpleCastManager
```

### Valor de Retorno

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `isConnected` | `boolean` | Si Cast está conectado |
| `isLoading` | `boolean` | Si está cargando contenido |
| `currentContent` | `CastContentInfo?` | Contenido actual |
| `loadContent` | `(config) => Promise<CastOperationResult>` | Cargar contenido |
| `play` | `() => Promise<CastOperationResult>` | Reproducir |
| `pause` | `() => Promise<CastOperationResult>` | Pausar |

### Ejemplo

```typescript
const simple = useSimpleCastManager();

if (simple.isConnected) {
    await simple.loadContent(config);
    await simple.play();
}
```

---

## useCastManagerStatus

Hook para obtener solo el estado del Cast Manager sin funcionalidad adicional.

### Sintaxis

```typescript
const status = useCastManagerStatus(): CastManagerStatus
```

### CastManagerStatus

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `state` | `CastManagerState` | Estado actual del manager |
| `isConnected` | `boolean` | Si está conectado |
| `isLoading` | `boolean` | Si está cargando |
| `isContentLoaded` | `boolean` | Si hay contenido cargado |
| `hasSession` | `boolean` | Si hay sesión activa |
| `hasClient` | `boolean` | Si hay cliente conectado |
| `error` | `string?` | Error actual si existe |

---

## useCastManagerProgress

Hook para obtener solo información de progreso de reproducción.

### Sintaxis

```typescript
const progress = useCastManagerProgress(): CastProgressInfo | undefined
```

### CastProgressInfo

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `currentTime` | `number` | Tiempo actual en segundos |
| `duration` | `number` | Duración total en segundos |
| `isBuffering` | `boolean` | Si está bufferizando |
| `isPaused` | `boolean` | Si está pausado |
| `isMuted` | `boolean` | Si está silenciado |
| `playbackRate` | `number` | Velocidad de reproducción |
| `position` | `number` | Posición normalizada (0-1) |

---

## Ejemplos de Uso

### Control Completo de Reproducción

```typescript
const VideoPlayer = () => {
    const cast = useCastManager({
        debugMode: true,
        callbacks: {
            onStateChange: (state) => {
                if (state === CastManagerState.CONNECTED) {
                    setShowCastControls(true);
                }
            }
        }
    });

    const handleSeek = (seconds: number) => {
        cast.seek(seconds);
    };

    const handleVolumeChange = (volume: number) => {
        cast.setVolume(volume);
    };

    return (
        <CastControlsView
            status={cast.status}
            progress={cast.progressInfo}
            onPlay={cast.play}
            onPause={cast.pause}
            onSeek={handleSeek}
            onVolumeChange={handleVolumeChange}
        />
    );
};
```

### Monitoreo de Estado

```typescript
const CastStatusMonitor = () => {
    const status = useCastManagerStatus();
    const progress = useCastManagerProgress();

    return (
        <View>
            <Text>Estado: {status.state}</Text>
            <Text>Conectado: {status.isConnected}</Text>
            {progress && (
                <ProgressBar
                    current={progress.currentTime}
                    total={progress.duration}
                />
            )}
        </View>
    );
};
```

### Integración Completa

```typescript
const CastEnabledPlayer = () => {
    const cast = useCastManager({
        callbacks: {
            onContentLoaded: (content) => {
                analytics.track('cast_content_loaded', {
                    title: content.title,
                    duration: content.duration
                });
            },
            onPlaybackError: (error) => {
                showErrorToast(error);
            }
        }
    });

    const loadAndPlay = async (videoConfig) => {
        if (!cast.isReady()) {
            alert('Cast no está listo');
            return;
        }

        const result = await cast.loadContent(videoConfig);
        if (result === CastOperationResult.SUCCESS) {
            await cast.play();
        }
    };

    return (
        <CastPlayerUI
            manager={cast}
            onLoadContent={loadAndPlay}
        />
    );
};
```

## Optimizaciones y Arquitectura

### Cambios Recientes

**Eliminación de Polling Redundante:**
- Se removieron `enableAutoUpdate` y `autoUpdateInterval` para evitar loops infinitos
- El sistema ahora depende exclusivamente de eventos nativos del Cast Manager
- Mejor rendimiento y eliminación de condiciones de carrera

**Callbacks Optimizados:**
- Uso de `useRef` para callbacks para evitar dependencias circulares
- Memoización mejorada de configuraciones para prevenir re-renders innecesarios
- Detección de cambios simplificada con hash de estado

**Gestión de Estado Mejorada:**
- Callbacks ahora incluyen tanto el estado actual como el anterior para mejor trazabilidad
- Manejo robusto de transiciones de estado (LOADING → PLAYING)
- Corrección de bugs relacionados con `streamPosition` vs `currentTime`

### Debug y Troubleshooting

Cuando `debugMode` está habilitado, el hook emite logs detallados que incluyen:
- Cambios de estado del manager
- Eventos de carga de contenido
- Actualizaciones de progreso
- Resultados de operaciones
- Transiciones de estado internas

### Performance

El hook está altamente optimizado para evitar re-renders innecesarios:
- Usa `useMemo` para callbacks memoizados
- Los estados se actualizan solo cuando hay cambios reales detectados
- Las referencias al manager son estables
- Sin polling innecesario que compita con eventos nativos

Los hooks `useCastManager` proporcionan una interfaz completa y fácil de usar para todas las operaciones Cast, desde control básico hasta funcionalidad avanzada con monitoreo detallado.
