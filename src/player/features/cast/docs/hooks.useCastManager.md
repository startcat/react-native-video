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
const manager = useCastManager(callbacks?: CastManagerCallbacks, messageBuilderConfig?: MessageBuilderConfig): CastManager
```

### Parámetros

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `callbacks` | `CastManagerCallbacks` | ❌ | Callbacks para eventos del manager |
| `messageBuilderConfig` | `MessageBuilderConfig` | ❌ | Configuración del constructor de mensajes |

#### MessageBuilderConfig

| Propiedad | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `enableYoubora` | `boolean` | ❌ | Habilita integración con Youbora |
| `enableAds` | `boolean` | ❌ | Habilita soporte para anuncios |
| `defaultStartPosition` | `number` | ❌ | Posición inicial por defecto |
| `debugMode` | `boolean` | ❌ | Habilita logs detallados |

**Nota:** El hook se actualiza automáticamente basándose en eventos nativos del Cast, eliminando la necesidad de polling manual.

#### CastManagerCallbacks

| Callback | Tipo | Descripción |
|----------|------|-------------|
| `onContentLoaded` | `(contentInfo: CastContentInfo) => void` | Contenido cargado exitosamente |
| `onContentLoadError` | `(error: string, contentInfo: CastContentInfo) => void` | Error al cargar contenido |
| `onPlaybackStarted` | `() => void` | Reproducción iniciada |
| `onPlaybackEnded` | `() => void` | Reproducción finalizada |
| `onSeekCompleted` | `(newPosition: number) => void` | Seek completado |
| `onVolumeChanged` | `(level: number, isMuted: boolean) => void` | Volumen cambiado |

### Valor de Retorno

El hook retorna un objeto `CastManager` con las siguientes propiedades:

#### Estado

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `state` | `CastManagerState` | Estado interno del manager |
| `state.isLoading` | `boolean` | Indica si está cargando contenido |
| `state.lastError` | `string \| null` | Último error ocurrido |
| `state.lastAction` | `string \| null` | Última acción ejecutada |
| `state.canControl` | `boolean` | Indica si se pueden ejecutar controles |

#### Acciones Principales

| Método | Tipo | Descripción |
|--------|------|-------------|
| `loadContent` | `(content: CastContentInfo) => Promise<boolean>` | Cargar contenido para Cast |
| `clearContent` | `() => Promise<boolean>` | Limpiar contenido actual |

#### Controles de Reproducción

| Método | Tipo | Descripción |
|--------|------|-------------|
| `play` | `() => Promise<boolean>` | Iniciar reproducción |
| `pause` | `() => Promise<boolean>` | Pausar reproducción |
| `seek` | `(position: number) => Promise<boolean>` | Buscar posición específica |
| `skipForward` | `(seconds?: number) => Promise<boolean>` | Saltar hacia adelante |
| `skipBackward` | `(seconds?: number) => Promise<boolean>` | Saltar hacia atrás |
| `stop` | `() => Promise<boolean>` | Detener reproducción |

#### Controles de Audio

| Método | Tipo | Descripción |
|--------|------|-------------|
| `mute` | `() => Promise<boolean>` | Silenciar audio |
| `unmute` | `() => Promise<boolean>` | Activar audio |
| `setVolume` | `(level: number) => Promise<boolean>` | Establecer volumen (0-1) |

#### Controles de Pistas

| Método | Tipo | Descripción |
|--------|------|-------------|
| `setAudioTrack` | `(trackId: number) => Promise<boolean>` | Cambiar pista de audio |
| `setSubtitleTrack` | `(trackId: number) => Promise<boolean>` | Cambiar pista de subtítulos |
| `setActiveTrackIds` | `(trackIds: number[]) => Promise<boolean>` | Establecer pistas activas |
| `disableSubtitles` | `() => Promise<boolean>` | Desactivar todos los subtítulos |

#### Utilidades

| Método | Tipo | Descripción |
|--------|------|-------------|
| `updateMessageBuilderConfig` | `(newConfig: any) => void` | Actualizar configuración del constructor de mensajes |

### Ejemplo de Uso

```typescript
import { useCastManager } from '@/features/cast';

const CastPlayer = () => {
    const castManager = useCastManager({
        onContentLoaded: (content) => {
            console.log('Contenido cargado:', content.metadata.title);
        },
        onPlaybackStarted: () => {
            console.log('Reproducción iniciada');
        },
        onSeekCompleted: (newPosition) => {
            console.log(`Seek completado: ${newPosition}s`);
        }
    }, {
        debugMode: true,
        enableYoubora: true
    });

    const handleLoadContent = async () => {
        const content = {
            source: { uri: 'https://example.com/video.m3u8' },
            manifest: {},
            metadata: {
                id: 'video-123',
                title: 'Mi Video',
                subtitle: 'Descripción del video'
            }
        };

        const success = await castManager.loadContent(content);
        if (success) {
            await castManager.play();
        }
    };

    const handleSetAudioTrack = async () => {
        await castManager.setAudioTrack(1);
    };

    const handleSetSubtitleTrack = async () => {
        await castManager.setSubtitleTrack(0);
    };

    const handleDisableSubtitles = async () => {
        await castManager.disableSubtitles();
    };

    return (
        <View>
            <Text>Cargando: {castManager.state.isLoading ? 'Sí' : 'No'}</Text>
            <Text>Último error: {castManager.state.lastError || 'Ninguno'}</Text>
            
            <Button title="Cargar Contenido" onPress={handleLoadContent} />
            <Button title="Play" onPress={castManager.play} />
            <Button title="Pause" onPress={castManager.pause} />
            <Button title="Cambiar Audio" onPress={handleSetAudioTrack} />
            <Button title="Desactivar Subtítulos" onPress={handleDisableSubtitles} />
        </View>
    );
};
```

---

## CastContentInfo Interface

Interface principal para definir el contenido a cargar en Cast.

### Estructura

```typescript
interface CastContentInfo {
    source: {
        uri: string;
    };
    manifest: any;
    drm?: any;
    youbora?: any;
    metadata: {
        id: string;
        title?: string;
        subtitle?: string;
        description?: string;
        poster?: string;
        squaredPoster?: string;
        liveStartDate?: string;
        adTagUrl?: string;
        hasNext?: boolean;
        isLive?: boolean;
        isDVR?: boolean;
        startPosition?: number;
    };
}
```

### Propiedades

| Propiedad | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `source.uri` | `string` | ✅ | URL del contenido multimedia |
| `manifest` | `any` | ✅ | Datos del manifest |
| `drm` | `any` | ❌ | Configuración DRM |
| `youbora` | `any` | ❌ | Configuración Youbora |
| `metadata.id` | `string` | ✅ | Identificador único del contenido |
| `metadata.title` | `string` | ❌ | Título del contenido |
| `metadata.subtitle` | `string` | ❌ | Subtítulo o descripción corta |
| `metadata.description` | `string` | ❌ | Descripción detallada |
| `metadata.poster` | `string` | ❌ | URL de la imagen de portada |
| `metadata.isLive` | `boolean` | ❌ | Indica si es contenido en vivo |
| `metadata.isDVR` | `boolean` | ❌ | Indica si soporta DVR |
| `metadata.startPosition` | `number` | ❌ | Posición inicial en segundos |

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

        const success = await cast.loadContent(videoConfig);
        if (success) {
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

## Arquitectura y Optimizaciones

### Diseño del Hook

**Integración Nativa:**
- Utiliza hooks nativos de `react-native-google-cast` (`useCastState`, `useCastSession`, `useRemoteMediaClient`)
- Actualización automática basada en eventos nativos del Cast
- Sin polling manual ni intervalos innecesarios

**Gestión de Estado:**
- Estado interno reactivo con `useState`
- Referencias estables con `useRef` para callbacks y configuraciones
- Validación automática de disponibilidad de Cast antes de operaciones

**CastMessageBuilder Integrado:**
- Constructor de mensajes automático para contenido Cast
- Configuración personalizable para Youbora, anuncios y debug
- Reutilización de instancia para mejor rendimiento

### Manejo de Errores

**Validación de Estado:**
- Verificación automática de conexión Cast antes de operaciones
- Logging detallado de errores con contexto
- Estado de error accesible en `state.lastError`

**Callbacks de Error:**
- `onContentLoadError` para errores de carga
- Información detallada del error y contenido afectado

### Performance y Estabilidad

**Referencias Estables:**
- Callbacks memoizados con `useRef` para evitar re-renders
- Instancia única de `CastMessageBuilder` reutilizada
- Estado interno optimizado para cambios mínimos

**Operaciones Asíncronas:**
- Todas las operaciones retornan `Promise<boolean>`
- Gestión de estado de carga automática
- Prevención de operaciones concurrentes

El hook `useCastManager` proporciona una interfaz completa y optimizada para todas las operaciones Cast, con integración nativa y manejo robusto de errores.
