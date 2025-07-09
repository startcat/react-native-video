# CastManager - CastManager.ts

Este documento describe la clase `CastManager`, el núcleo del sistema Cast que gestiona el estado, contenido y operaciones de reproducción en dispositivos Chromecast.

## Índice

- [Descripción General](#descripción-general)
- [Constructor](#constructor)
- [Propiedades](#propiedades)
- [Métodos Públicos](#métodos-públicos)
- [Métodos Privados](#métodos-privados)
- [Sistema de Eventos](#sistema-de-eventos)
- [Estados del Manager](#estados-del-manager)
- [Operaciones de Control](#operaciones-de-control)
- [Ejemplos de Uso](#ejemplos-de-uso)
- [Casos de Uso](#casos-de-uso)
- [Notas Técnicas](#notas-técnicas)

---

## Descripción General

`CastManager` es la clase principal que gestiona toda la funcionalidad Cast. Extiende `SimpleEventEmitter` para proporcionar un sistema de eventos robusto y maneja el estado completo de Cast, incluyendo conexión, carga de contenido, controles de reproducción y seguimiento de progreso.

### Importación

```typescript
import { CastManager } from './CastManager';
import type { 
    CastManagerConfig,
    CastMessageConfig,
    CastControlParams,
    CastManagerStatus,
    CastOperationResult
} from './types';
```

---

## Constructor

### `new CastManager(config?: CastManagerConfig)`

Crea una nueva instancia del gestor de Cast.

**Parámetros:**
| Parámetro | Tipo                | Obligatorio | Descripción                                    |
|-----------|---------------------|-------------|------------------------------------------------|
| `config`  | `CastManagerConfig` | ❌          | Configuración inicial del manager              |

**Características:**
- 🔧 **Configuración por defecto** combinada con configuración personalizada
- 📝 **Logging** de inicialización con configuración
- 🏗️ **CastMessageBuilder** integrado para construcción de mensajes
- 🎯 **Callbacks** opcionales para eventos

**Ejemplo:**
```typescript
// Constructor básico
const castManager = new CastManager();

// Constructor con configuración personalizada
const configuredManager = new CastManager({
    debugMode: true,
    loadTimeout: 10000,
    retryAttempts: 3,
    callbacks: {
        onStateChange: (newState, oldState) => {
            console.log(`Estado cambió de ${oldState} a ${newState}`);
        }
    }
});
```

---

## Propiedades

### Propiedades Privadas de Estado

| Propiedad           | Tipo                      | Descripción                                    |
|---------------------|---------------------------|------------------------------------------------|
| `state`             | `CastManagerState`        | Estado actual del manager                      |
| `config`            | `CastManagerConfig`       | Configuración del manager                      |
| `messageBuilder`    | `CastMessageBuilder`      | Constructor de mensajes Cast                   |
| `callbacks`         | `CastManagerCallbacks`    | Callbacks de eventos                           |

### Propiedades de Cast Nativo

| Propiedad           | Tipo                      | Descripción                                    |
|---------------------|---------------------------|------------------------------------------------|
| `castState`         | `CastState`               | Estado de Cast nativo                          |
| `castSession`       | `CastSession`             | Sesión de Cast activa                          |
| `castClient`        | `RemoteMediaClient`       | Cliente de media remoto                        |
| `castMediaStatus`   | `any`                     | Estado del media Cast                          |

### Propiedades de Estado Interno

| Propiedad           | Tipo                      | Descripción                                    |
|---------------------|---------------------------|------------------------------------------------|
| `currentContent`    | `CastContentInfo`         | Información del contenido actual               |
| `isLoading`         | `boolean`                 | Indica si está cargando contenido              |
| `isContentLoaded`   | `boolean`                 | Indica si hay contenido cargado                |
| `pendingOperations` | `PendingCastOperation[]`  | Cola de operaciones pendientes                 |
| `retryAttempts`     | `number`                  | Número de intentos de reintento                |

### Propiedades de Control

| Propiedad           | Tipo                      | Descripción                                    |
|---------------------|---------------------------|------------------------------------------------|
| `loadTimeout`       | `ReturnType<setTimeout>`  | Timeout para carga de contenido                |
| `progressInterval`  | `ReturnType<setInterval>` | Intervalo de seguimiento de progreso           |
| `eventListeners`    | `Map<string, any>`        | Mapa de listeners de eventos Cast              |

---

## Métodos Públicos

### `updateCastState(castState?, castSession?, castClient?, castMediaStatus?): void`

Actualiza el estado de Cast desde hooks externos.

**Parámetros:**
| Parámetro         | Tipo                | Obligatorio | Descripción                                    |
|-------------------|---------------------|-------------|------------------------------------------------|
| `castState`       | `CastState`         | ❌          | Estado de Cast nativo                          |
| `castSession`     | `CastSession`       | ❌          | Sesión de Cast activa                          |
| `castClient`      | `RemoteMediaClient` | ❌          | Cliente de media remoto                        |
| `castMediaStatus` | `any`               | ❌          | Estado del media Cast                          |

**Características:**
- 🔄 **Actualización de estado** interno basado en estado nativo
- ⚡ **Procesamiento automático** de operaciones pendientes
- 🎯 **Gestión de listeners** de eventos Cast
- 📡 **Emisión de eventos** de cambio de estado

**Ejemplo:**
```typescript
// Actualización desde hook de Cast
castManager.updateCastState(
    castState,
    castSession,
    remoteMediaClient,
    mediaStatus
);
```

### `loadContent(config: CastMessageConfig): Promise<CastOperationResult>`

Carga contenido en Cast.

**Parámetros:**
| Parámetro | Tipo                | Obligatorio | Descripción                                    |
|-----------|---------------------|-------------|------------------------------------------------|
| `config`  | `CastMessageConfig` | ✅          | Configuración del contenido a cargar           |

**Retorna:** `Promise<CastOperationResult>` - Resultado de la operación

**Características:**
- ✅ **Validación previa** de disponibilidad de Cast
- 🔄 **Detección de contenido duplicado** para evitar recargas
- ⏰ **Timeout configurable** para operaciones
- 🔄 **Sistema de reintentos** automático
- 📋 **Cola de operaciones** cuando Cast no está listo

**Ejemplo:**
```typescript
const result = await castManager.loadContent({
    source: { uri: 'https://example.com/video.m3u8' },
    manifest: manifestData,
    drm: drmConfig,
    metadata: {
        id: 'video-123',
        title: 'Mi Video',
        isLive: false,
        startPosition: 60
    }
});

if (result === CastOperationResult.SUCCESS) {
    console.log('Contenido cargado exitosamente');
}
```

### `executeControl(params: CastControlParams): Promise<CastOperationResult>`

Ejecuta comandos de control de reproducción.

**Parámetros:**
| Parámetro | Tipo                | Obligatorio | Descripción                                    |
|-----------|---------------------|-------------|------------------------------------------------|
| `params`  | `CastControlParams` | ✅          | Parámetros del comando de control              |

**Retorna:** `Promise<CastOperationResult>` - Resultado de la operación

**Comandos soportados:**
- ▶️ **PLAY** - Iniciar reproducción
- ⏸️ **PAUSE** - Pausar reproducción
- ⏩ **SEEK** - Buscar posición específica (requiere `seekTime`)
- 🔇 **MUTE** - Silenciar audio
- 🔊 **UNMUTE** - Restaurar audio
- 🔊 **VOLUME** - Cambiar volumen (requiere `volumeLevel`)
- ⏹️ **STOP** - Detener reproducción

**Ejemplo:**
```typescript
// Reproducir contenido
await castManager.executeControl({
    command: CastControlCommand.PLAY
});

// Buscar posición específica
await castManager.executeControl({
    command: CastControlCommand.SEEK,
    seekTime: 120 // 2 minutos
});

// Cambiar volumen
await castManager.executeControl({
    command: CastControlCommand.VOLUME,
    volumeLevel: 0.8 // 80%
});
```

### `getStatus(): CastManagerStatus`

Obtiene el estado actual completo del manager.

**Parámetros:** Ninguno

**Retorna:** `CastManagerStatus` - Estado completo del manager

**Propiedades del estado:**
| Propiedad         | Tipo               | Descripción                                    |
|-------------------|--------------------|------------------------------------------------|
| `state`           | `CastManagerState` | Estado actual del manager                      |
| `isConnected`     | `boolean`          | Indica si Cast está conectado                  |
| `isLoading`       | `boolean`          | Indica si está cargando contenido              |
| `isContentLoaded` | `boolean`          | Indica si hay contenido cargado                |
| `currentContent`  | `CastContentInfo`  | Información del contenido actual (copia)       |
| `castState`       | `CastState`        | Estado de Cast nativo                          |
| `hasSession`      | `boolean`          | Indica si hay sesión activa                    |
| `hasClient`       | `boolean`          | Indica si hay cliente disponible               |

**Ejemplo:**
```typescript
const status = castManager.getStatus();
console.log('Estado de Cast:', {
    estado: status.state,
    conectado: status.isConnected,
    cargando: status.isLoading,
    contenidoActual: status.currentContent?.title
});
```

### `getCurrentContent(): CastContentInfo | undefined`

Obtiene información del contenido actual.

**Parámetros:** Ninguno

**Retorna:** `CastContentInfo | undefined` - Información del contenido (copia segura)

**Ejemplo:**
```typescript
const content = castManager.getCurrentContent();
if (content) {
    console.log(`Reproduciendo: ${content.title}`);
    console.log(`Tipo: ${content.contentType}`);
    console.log(`En vivo: ${content.isLive}`);
}
```

### `getProgressInfo(): CastProgressInfo | undefined`

Obtiene información de progreso de reproducción.

**Parámetros:** Ninguno

**Retorna:** `CastProgressInfo | undefined` - Información de progreso

**Propiedades del progreso:**
| Propiedad      | Tipo      | Descripción                                    |
|----------------|-----------|------------------------------------------------|
| `currentTime`  | `number`  | Tiempo actual de reproducción (segundos)       |
| `duration`     | `number`  | Duración total del contenido (segundos)        |
| `isBuffering`  | `boolean` | Indica si está buffering                       |
| `isPaused`     | `boolean` | Indica si está pausado                         |
| `isMuted`      | `boolean` | Indica si está silenciado                      |
| `playbackRate` | `number`  | Velocidad de reproducción                      |
| `position`     | `number`  | Posición actual (alias de currentTime)         |

**Ejemplo:**
```typescript
const progress = castManager.getProgressInfo();
if (progress) {
    const percent = (progress.currentTime / progress.duration) * 100;
    console.log(`Progreso: ${percent.toFixed(1)}%`);
    console.log(`Tiempo: ${progress.currentTime}/${progress.duration}s`);
}
```

### `isSameContent(config: CastMessageConfig): boolean`

Verifica si el contenido dado es el mismo que el actual.

**Parámetros:**
| Parámetro | Tipo                | Obligatorio | Descripción                                    |
|-----------|---------------------|-------------|------------------------------------------------|
| `config`  | `CastMessageConfig` | ✅          | Configuración del contenido a comparar         |

**Retorna:** `boolean` - `true` si es el mismo contenido

**Características:**
- 🔍 **Comparación inteligente** usando `compareContent` de utilidades
- 🎯 **Evita recargas innecesarias** del mismo contenido

**Ejemplo:**
```typescript
if (!castManager.isSameContent(newContentConfig)) {
    await castManager.loadContent(newContentConfig);
} else {
    console.log('Mismo contenido, no se recarga');
}
```

### `clearCurrentContent(): void`

Limpia el contenido actual.

**Parámetros:** Ninguno

**Características:**
- 🗑️ **Limpieza completa** de información de contenido
- 🔄 **Reset de estado** de contenido cargado

**Ejemplo:**
```typescript
castManager.clearCurrentContent();
console.log('Contenido actual limpiado');
```

### `destroy(): void`

Destruye el manager y limpia recursos.

**Parámetros:** Ninguno

**Características:**
- 🧹 **Limpieza completa** de timeouts e intervalos
- 📡 **Remoción de listeners** de eventos
- 🗑️ **Liberación de recursos** y referencias
- 📝 **Logging** de destrucción

**Ejemplo:**
```typescript
// Al desmontar componente o salir de la aplicación
castManager.destroy();
```

---

## Métodos Privados

### Gestión de Estado

#### `updateInternalState(): void`
Actualiza el estado interno basado en el estado nativo de Cast.

#### `mapMediaStateToManagerState(mediaState: MediaPlayerState): CastManagerState`
Mapea estados de media player nativo a estados del manager.

#### `isCastReady(): boolean`
Verifica si Cast está listo para operaciones.

#### `emitStateChange(previousState: CastManagerState): void`
Emite eventos de cambio de estado.

### Gestión de Eventos

#### `manageEventListeners(): void`
Gestiona el registro/desregistro de listeners de eventos Cast.

#### `registerEventListeners(): void`
Registra listeners de eventos Cast nativos.

#### `clearEventListeners(): void`
Limpia todos los listeners de eventos Cast.

#### `emitEvent(event: CastManagerEvent, data?: any): void`
Emite eventos genericos del manager.

### Gestión de Operaciones

#### `processPendingOperations(): void`
Procesa operaciones en cola cuando Cast está disponible.

#### `queueOperation(type: string, config?: CastMessageConfig, value?: any): void`
Agrega operación a la cola de pendientes.

#### `updateCurrentContent(config: CastMessageConfig, castMessage: any): void`
Actualiza información del contenido actual después de carga exitosa.

### Gestión de Progreso

#### `startProgressTracking(): void`
Inicia el seguimiento automático de progreso de reproducción.

#### `clearProgressInterval(): void`
Limpia el intervalo de seguimiento de progreso.

### Gestión de Timeouts y Reintentos

#### `setupLoadTimeout(): void`
Configura timeout para operaciones de carga.

#### `clearLoadTimeout(): void`
Limpia timeout de carga activo.

#### `shouldRetry(): boolean`
Determina si debe intentar reintento basado en configuración.

#### `retryLoadContent(config: CastMessageConfig): Promise<CastOperationResult>`
Ejecuta reintento de carga con delay configurable.

### Utilidades

#### `setLoadingState(loading: boolean): void`
Establece el estado de carga y actualiza estado del manager.

#### `log(message: string, data?: any): void`
Sistema de logging condicional basado en modo debug.

#### `logError(message: string, error: any): void`
Sistema de logging de errores (siempre activo).

---

## Sistema de Eventos

El `CastManager` emite los siguientes eventos:

### Eventos Principales

| Evento                      | Datos                          | Descripción                                    |
|-----------------------------|--------------------------------|------------------------------------------------|
| `STATE_CHANGED`             | `{ state, previousState }`     | Cambio de estado del manager                   |
| `CONTENT_LOADING`           | `{ config }`                   | Inicio de carga de contenido                   |
| `CONTENT_LOADED`            | `{ content }`                  | Contenido cargado exitosamente                 |
| `CONTENT_LOAD_ERROR`        | `{ error }`                    | Error en carga de contenido                    |
| `TIME_UPDATE`               | `{ data: CastProgressInfo }`   | Actualización de progreso                      |
| `CONTROL_EXECUTED`          | `{ command, result }`          | Comando de control ejecutado                   |
| `CONTROL_ERROR`             | `{ command, error }`           | Error en comando de control                    |

### Ejemplo de Suscripción

```typescript
castManager.on(CastManagerEvent.STATE_CHANGED, (eventData) => {
    console.log('Estado cambió:', eventData.data);
});

castManager.on(CastManagerEvent.TIME_UPDATE, (eventData) => {
    const progress = eventData.data;
    console.log(`Progreso: ${progress.currentTime}/${progress.duration}s`);
});
```

---

## Estados del Manager

### `CastManagerState`

| Estado          | Descripción                                    |
|-----------------|------------------------------------------------|
| `DISCONNECTED`  | Cast desconectado                              |
| `CONNECTING`    | Conectando a Cast                              |
| `CONNECTED`     | Conectado pero sin contenido                   |
| `LOADING`       | Cargando contenido                             |
| `LOADED`        | Contenido cargado                              |
| `PLAYING`       | Reproduciendo contenido                        |
| `PAUSED`        | Contenido pausado                              |
| `BUFFERING`     | Buffering contenido                            |
| `ENDED`         | Reproducción terminada                         |
| `ERROR`         | Error en operación                             |

---

## Operaciones de Control

### `CastControlCommand`

| Comando   | Parámetros Adicionales    | Descripción                                    |
|-----------|---------------------------|------------------------------------------------|
| `PLAY`    | Ninguno                   | Iniciar/reanudar reproducción                  |
| `PAUSE`   | Ninguno                   | Pausar reproducción                            |
| `SEEK`    | `seekTime: number`        | Buscar posición específica (segundos)          |
| `MUTE`    | Ninguno                   | Silenciar audio                                |
| `UNMUTE`  | Ninguno                   | Restaurar audio                                |
| `VOLUME`  | `volumeLevel: number`     | Cambiar volumen (0.0 - 1.0)                   |
| `STOP`    | Ninguno                   | Detener reproducción completamente            |

---

## Ejemplos de Uso

### Ejemplo Básico de Gestión

```typescript
import { CastManager, CastControlCommand } from './cast';

// Crear manager
const castManager = new CastManager({
    debugMode: true,
    loadTimeout: 8000,
    callbacks: {
        onStateChange: (newState, oldState) => {
            console.log(`Cast: ${oldState} → ${newState}`);
        }
    }
});

// Suscribirse a eventos
castManager.on('TIME_UPDATE', (eventData) => {
    const { currentTime, duration } = eventData.data;
    updateProgressBar(currentTime, duration);
});

// Actualizar estado desde hook
useEffect(() => {
    castManager.updateCastState(castState, castSession, castClient, mediaStatus);
}, [castState, castSession, castClient, mediaStatus]);
```

### Ejemplo de Carga de Contenido

```typescript
const loadVideo = async () => {
    try {
        const result = await castManager.loadContent({
            source: { uri: videoUrl },
            manifest: manifestData,
            metadata: {
                id: 'video-abc123',
                title: 'Película Increíble',
                description: 'Una película de acción espectacular',
                poster: 'https://example.com/poster.jpg',
                isLive: false,
                startPosition: 300 // Comenzar en minuto 5
            }
        });

        switch (result) {
            case CastOperationResult.SUCCESS:
                console.log('Video cargado exitosamente');
                break;
            case CastOperationResult.PENDING:
                console.log('Carga en cola, Cast no disponible');
                break;
            case CastOperationResult.FAILED:
                console.log('Error cargando video');
                break;
        }
    } catch (error) {
        console.error('Error:', error);
    }
};
```

### Ejemplo de Controles de Reproducción

```typescript
const PlayerControls = () => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [volume, setVolume] = useState(1.0);

    // Reproducir/Pausar
    const togglePlayPause = async () => {
        const command = isPlaying ? CastControlCommand.PAUSE : CastControlCommand.PLAY;
        await castManager.executeControl({ command });
        setIsPlaying(!isPlaying);
    };

    // Buscar posición
    const seek = async (time: number) => {
        await castManager.executeControl({
            command: CastControlCommand.SEEK,
            seekTime: time
        });
    };

    // Cambiar volumen
    const changeVolume = async (newVolume: number) => {
        await castManager.executeControl({
            command: CastControlCommand.VOLUME,
            volumeLevel: newVolume
        });
        setVolume(newVolume);
    };

    // Actualizar progreso
    useEffect(() => {
        const handleTimeUpdate = (eventData) => {
            setCurrentTime(eventData.data.currentTime);
        };

        castManager.on('TIME_UPDATE', handleTimeUpdate);
        return () => castManager.off('TIME_UPDATE', handleTimeUpdate);
    }, []);

    return (
        <div>
            <button onClick={togglePlayPause}>
                {isPlaying ? 'Pausar' : 'Reproducir'}
            </button>
            <input 
                type="range" 
                min="0" 
                max="100" 
                value={volume * 100}
                onChange={(e) => changeVolume(Number(e.target.value) / 100)}
            />
            <div>Tiempo: {formatTime(currentTime)}</div>
        </div>
    );
};
```

### Ejemplo con Contenido en Vivo

```typescript
const loadLiveStream = async () => {
    const result = await castManager.loadContent({
        source: { uri: 'https://live.example.com/stream.m3u8' },
        manifest: liveManifest,
        metadata: {
            id: 'live-news',
            title: 'Noticias en Vivo',
            isLive: true,
            isDVR: true, // Permite navegación en contenido grabado
            liveStartDate: Date.now() - (2 * 60 * 60 * 1000) // Inició hace 2 horas
        }
    });

    if (result === CastOperationResult.SUCCESS) {
        console.log('Stream en vivo cargado');
        
        // Obtener información de progreso para contenido DVR
        const progress = castManager.getProgressInfo();
        if (progress) {
            console.log(`Posición en stream: ${progress.currentTime}s`);
        }
    }
};
```

### Ejemplo de Manejo de Estado Completo

```typescript
const CastStatusMonitor = () => {
    const [status, setStatus] = useState<CastManagerStatus>();

    useEffect(() => {
        const updateStatus = () => {
            setStatus(castManager.getStatus());
        };

        // Actualizar estado periódicamente
        const interval = setInterval(updateStatus, 1000);
        
        // Suscribirse a cambios de estado
        castManager.on('STATE_CHANGED', updateStatus);
        
        return () => {
            clearInterval(interval);
            castManager.off('STATE_CHANGED', updateStatus);
        };
    }, []);

    if (!status) return null;

    return (
        <div className="cast-status">
            <h3>Estado de Cast</h3>
            <div>Estado: {status.state}</div>
            <div>Conectado: {status.isConnected ? 'Sí' : 'No'}</div>
            <div>Cargando: {status.isLoading ? 'Sí' : 'No'}</div>
            
            {status.currentContent && (
                <div>
                    <h4>Contenido Actual</h4>
                    <div>Título: {status.currentContent.title}</div>
                    <div>Tipo: {status.currentContent.contentType}</div>
                    <div>En vivo: {status.currentContent.isLive ? 'Sí' : 'No'}</div>
                </div>
            )}
        </div>
    );
};
```

---

## Casos de Uso

### 1. **Reproductor de Video Básico**
```typescript
// Integración básica en reproductor
const useBasicCastPlayer = () => {
    const castManager = useRef(new CastManager()).current;

    const loadAndPlay = async (videoConfig) => {
        await castManager.loadContent(videoConfig);
        await castManager.executeControl({ command: CastControlCommand.PLAY });
    };

    return { castManager, loadAndPlay };
};
```

### 2. **Plataforma de Streaming con Lista de Reproducción**
```typescript
class PlaylistCastManager {
    private castManager: CastManager;
    private playlist: VideoConfig[] = [];
    private currentIndex = 0;

    constructor() {
        this.castManager = new CastManager({
            callbacks: {
                onStateChange: this.handleStateChange.bind(this)
            }
        });
    }

    async playNext() {
        if (this.currentIndex < this.playlist.length - 1) {
            this.currentIndex++;
            await this.loadCurrent();
        }
    }

    private async loadCurrent() {
        const config = this.playlist[this.currentIndex];
        await this.castManager.loadContent(config);
    }

    private handleStateChange(newState: CastManagerState) {
        if (newState === CastManagerState.ENDED) {
            this.playNext();
        }
    }
}
```

### 3. **Sistema de Analytics Integrado**
```typescript
const createAnalyticsCastManager = () => {
    const castManager = new CastManager({
        callbacks: {
            onStateChange: (newState, oldState) => {
                analytics.track('cast_state_change', {
                    from: oldState,
                    to: newState,
                    timestamp: Date.now()
                });
            }
        }
    });

    castManager.on('TIME_UPDATE', (eventData) => {
        const progress = eventData.data;
        analytics.track('cast_progress', {
            currentTime: progress.currentTime,
            duration: progress.duration,
            percentage: (progress.currentTime / progress.duration) * 100
        });
    });

    return castManager;
};
```

### 4. **Control Parental y Restricciones**
```typescript
class SecureCastManager {
    private castManager: CastManager;

    constructor(parentalSettings: ParentalSettings) {
        this.castManager = new CastManager();
    }

    async loadContent(config: CastMessageConfig) {
        // Verificar restricciones
        if (!this.isContentAllowed(config)) {
            throw new Error('Contenido restringido por control parental');
        }

        // Aplicar filtros de contenido
        const filteredConfig = this.applyContentFilters(config);
        return await this.castManager.loadContent(filteredConfig);
    }

    private isContentAllowed(config: CastMessageConfig): boolean {
        // Lógica de verificación de contenido
        return true;
    }
}
```

---

## Notas Técnicas

### Arquitectura y Diseño

1. **Patrón EventEmitter:**
   - Extiende `SimpleEventEmitter` para comunicación basada en eventos
   - Sistema de eventos tipado con `CastManagerEvent`
   - Callbacks opcionales para integración directa

2. **Gestión de Estado:**
   - Estado interno consistente con estado nativo de Cast
   - Mapeo automático de estados de media player
   - Seguimiento de contenido actual y progreso

3. **Sistema de Cola:**
   - Cola de operaciones pendientes cuando Cast no está disponible
   - Procesamiento automático cuando Cast se vuelve disponible
   - Prevención de operaciones duplicadas

4. **Manejo de Errores:**
   - Sistema de reintentos configurables
   - Timeouts para operaciones de larga duración
   - Logging estructurado para debugging

### Rendimiento y Optimización

- **Comparación inteligente** de contenido para evitar recargas
- **Limpieza automática** de recursos en destrucción
- **Seguimiento de progreso** optimizado con intervalos configurables
- **Event listeners** gestionados automáticamente

### Integración con React Native Google Cast

- **Compatible** con `react-native-google-cast`
- **Mapeo directo** de estados y tipos nativos
- **Gestión automática** de sesiones y clientes Cast
- **Soporte completo** para media controls nativos

### Seguridad y Confiabilidad

- **Validación de estado** antes de operaciones
- **Manejo seguro** de referencias nulas
- **Copia defensiva** de objetos de estado
- **Logging de errores** completo para diagnostico

La clase `CastManager` proporciona una interfaz robusta y completa para la gestión de Cast, con manejo de estado avanzado, sistema de eventos flexible y integración nativa optimizada.
