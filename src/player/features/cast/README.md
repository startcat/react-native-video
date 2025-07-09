# Sistema Cast - Documentación

## Descripción

Sistema modular y desacoplado para gestionar Cast en el reproductor de audio/video. Proporciona una API simple y consistente para cargar contenido, controlar reproducción y manejar estado de Cast.

## Estructura del Sistema

```
/src/player/features/cast/
├── types.ts                    # Tipos
├── constants.ts                # Constantes y configuración
├── CastManager.ts              # Clase principal de gestión
├── CastMessageBuilder.ts       # Constructor de mensajes Cast
├── docs/                       # Documentación
├── types/                      # Tipos segmentados y enums
├── hooks/
│   ├── useCastState.ts         # Hook para estado de Cast
│   └── useCastManager.ts       # Hook principal de gestión
├── utils/
│   └── castUtils.ts            # Utilidades Cast
│   └── simpleEventEmitter.ts   # Sistema de eventos
└── index.ts                    # Exports principales
```

## 📚 Documentación Detallada

Cada componente del sistema Cast tiene su documentación completa en castellano:

### 🏗️ Clases Principales
- **[CastManager](./docs/class.castManager.md)** - Clase núcleo del sistema Cast
  - 9 métodos públicos, 19 métodos privados
  - Gestión de estado, eventos, controles y operaciones asíncronas
  - Ejemplos completos y casos de uso avanzados

- **[CastMessageBuilder](./docs/class.castMessageBuilder.md)** - Constructor de mensajes Cast
  - Validación, construcción y configuración de mensajes
  - Soporte para VOD, Live, DVR, DRM y Analytics
  - Manejo de errores y configuración personalizable

### 🔧 Utilidades y Helpers
- **[CastUtils](./docs/utils.castUtils.md)** - Funciones de utilidad Cast
  - 25+ funciones organizadas por categorías
  - Validación, comparación, formateo y controles
  - Ejemplos prácticos y casos de uso

- **[SimpleEventEmitter](./docs/utils.simpleEventEmitter.md)** - Sistema de eventos personalizado
  - 13 métodos públicos documentados
  - Compatibilidad con EventEmitter estándar
  - Protección contra memory leaks y concurrencia

### ⚙️ Configuración y Constantes
- **[Constants](./docs/constants.md)** - Constantes y configuración del sistema
  - 14 grupos de constantes documentados
  - Timeouts, tolerancias, mapeos y configuraciones
  - Ejemplos de uso y casos comunes

### 🎣 Hooks de React
- **[useCastManager](./docs/hooks.useCastManager.md)** - Hook principal de gestión Cast
  - Hook principal + 3 hooks auxiliares
  - Configuración completa con callbacks
  - Ejemplos de integración y control completo

> **💡 Tip:** Toda la documentación incluye tablas organizadas, ejemplos funcionales, casos de uso reales y notas técnicas para facilitar la implementación y mantenimiento.

## Características Principales

### ✅ Gestión Centralizada
- Una sola clase `CastManager` que maneja todo el estado de Cast
- Desacoplado de la lógica de AudioCastFlavour
- API consistente para todas las operaciones

### ✅ Hooks Reactivos
- `useCastManager` - Hook principal con todas las funcionalidades
- `useCastState` - Hook para estado de conexión Cast
- `useCastProgress` - Hook para progreso de reproducción
- `useCastVolume` - Hook para control de volumen

### ✅ Comparación de Contenido
- Detecta automáticamente si el contenido es el mismo
- Evita recargas innecesarias
- Validación de URLs y metadatos

### ✅ Manejo de Errores
- Sistema de reintentos configurable
- Timeouts personalizables
- Callbacks específicos para diferentes tipos de errores

### ✅ Soporte Completo de Contenido
- VOD (Video on Demand)
- Live Streaming
- DVR (Digital Video Recorder)
- Tudum (contenido de introducción)

## Instalación y Uso

### 1. Uso Básico con Hook

```typescript
import { useCastManager, CastMessageConfig } from '../features/cast';

function MyComponent() {
    const castManager = useCastManager({
        debugMode: true,
        callbacks: {
            onStateChange: (state, previousState) => {
                console.log(`Cast state: ${previousState} -> ${state}`);
            },
            onContentLoaded: (content) => {
                console.log('Content loaded:', content);
            }
        }
    });

    const loadContent = async () => {
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
                isLive: false,
                isDVR: false,
                startPosition: 0
            }
        };

        const result = await castManager.loadContent(config);
        console.log('Load result:', result);
    };

    return (
        <View>
            <Text>Cast Status: {castManager.status.state}</Text>
            <Button onPress={loadContent} title="Load Content" />
            <Button onPress={castManager.play} title="Play" />
            <Button onPress={castManager.pause} title="Pause" />
        </View>
    );
}
```

### 2. Integración con AudioCastFlavour

```typescript
import { useCastManager, CastMessageConfig } from '../features/cast';

export function AudioCastFlavour(props: AudioCastFlavourProps) {
    const castManager = useCastManager({
        debugMode: true,
        callbacks: {
            onStateChange: (state, previousState) => {
                // Actualizar estados locales
                if (state === CastManagerState.LOADING) {
                    setIsLoadingContent(true);
                } else if (state === CastManagerState.PLAYING) {
                    setIsContentLoaded(true);
                    setIsLoadingContent(false);
                }
            },
            onTimeUpdate: (currentTime, duration) => {
                setCurrentTime(currentTime);
                // Actualizar progress managers
                updateProgressManagers(currentTime, duration);
            }
        }
    });

    const setCastSource = async (data?: onSourceChangedProps) => {
        const config: CastMessageConfig = {
            source: data?.source || sourceRef.current?.playerSource,
            manifest: sourceRef.current?.currentManifest,
            drm: data?.drm || sourceRef.current?.playerSourceDrm,
            metadata: {
                id: props.playerMetadata?.id,
                title: props.playerMetadata?.title,
                isLive: !!props.playerProgress?.isLive,
                isDVR: sourceRef.current?.isDVR,
                startPosition: calculateStartPosition()
            }
        };

        const result = await castManager.loadContent(config);
        // Manejar resultado...
    };

    // Resto del componente...
}
```

### 3. Configuración Avanzada

```typescript
const castManager = useCastManager({
    debugMode: true,
    retryAttempts: 3,
    retryDelay: 2000,
    loadTimeout: 10000,
    enableAutoUpdate: true,
    autoUpdateInterval: 1000,
    callbacks: {
        onStateChange: (state, previousState) => {
            // Manejar cambios de estado
        },
        onContentLoaded: (content) => {
            // Contenido cargado exitosamente
        },
        onContentLoadError: (error, content) => {
            // Error al cargar contenido
        },
        onPlaybackError: (error) => {
            // Error durante reproducción
        },
        onTimeUpdate: (currentTime, duration) => {
            // Actualización de progreso
        }
    }
});
```

## API Reference

### CastManager

#### Métodos Principales

```typescript
// Cargar contenido
loadContent(config: CastMessageConfig): Promise<CastOperationResult>

// Controles de reproducción
play(): Promise<CastOperationResult>
pause(): Promise<CastOperationResult>
seek(time: number): Promise<CastOperationResult>
skipForward(seconds: number): Promise<CastOperationResult>
skipBackward(seconds: number): Promise<CastOperationResult>

// Controles de audio
mute(): Promise<CastOperationResult>
unmute(): Promise<CastOperationResult>
setVolume(volume: number): Promise<CastOperationResult>

// Utilidades
getStatus(): CastManagerStatus
getCurrentContent(): CastContentInfo | undefined
getProgressInfo(): CastProgressInfo | undefined
isSameContent(config: CastMessageConfig): boolean
```

### Hooks Disponibles

```typescript
// Hook principal
useCastManager(config?: UseCastManagerConfig): CastManagerHookResult

// Hook de estado
useCastState(config?: UseCastStateConfig): CastStateInfo

// Hooks específicos
useCastConnectivity(): ConnectivityInfo
useCastReady(): boolean
useCastProgress(): ProgressInfo
useCastVolume(): VolumeInfo
```

### Tipos Principales

```typescript
// Configuración de mensaje Cast
interface CastMessageConfig {
    source: IVideoSource;
    manifest: any;
    drm?: IDrm;
    youbora?: IMappedYoubora;
    metadata: CastContentMetadata;
}

// Estado del manager
interface CastManagerStatus {
    state: CastManagerState;
    isConnected: boolean;
    isLoading: boolean;
    isContentLoaded: boolean;
    currentContent?: CastContentInfo;
    error?: string;
}

// Información de contenido
interface CastContentInfo {
    contentId: string;
    contentUrl: string;
    title?: string;
    isLive: boolean;
    isDVR: boolean;
    contentType: CastContentType;
    startPosition: number;
    duration?: number;
    currentTime?: number;
}
```

## Migración desde Código Anterior

### Antes
```typescript
// Lógica compleja con hooks nativos
const castState = useCastState();
const castClient = useRemoteMediaClient();
const [castMessage, setCastMessage] = useState();

useEffect(() => {
    if (castState === CastState.CONNECTED && castClient && castMessage) {
        tryLoadMedia();
    }
}, [castState, castClient, castMessage]);

const prepareCastMessage = (source, drm) => {
    // Lógica compleja...
    const message = getSourceMessageForCast(source.uri, manifest, drm, youbora, metadata);
    setCastMessage(message);
};
```

### Ahora
```typescript
// Lógica simplificada con nuevo sistema
const castManager = useCastManager({
    callbacks: {
        onStateChange: (state) => {
            // Reemplaza useEffect de estado
        },
        onContentLoaded: (content) => {
            // Reemplaza onMediaPlaybackStarted
        }
    }
});

const loadContent = async (source, metadata) => {
    const config = { source, manifest, metadata };
    const result = await castManager.loadContent(config);
    return result;
};
```

## Ejemplos Prácticos

### Cargar Contenido VOD
```typescript
const loadVOD = async () => {
    const config = CastUtils.createVODConfig(
        1, 
        'Mi Video', 
        'https://example.com/video.mp4', 
        120 // empezar en 2 minutos
    );
    
    const result = await castManager.loadContent(config);
    return result;
};
```

### Cargar Contenido Live
```typescript
const loadLive = async () => {
    const config = CastUtils.createLiveConfig(
        2, 
        'Live Stream', 
        'https://example.com/live.m3u8',
        true // con DVR
    );
    
    const result = await castManager.loadContent(config);
    return result;
};
```

### Manejo de Errores
```typescript
const castManager = useCastManager({
    callbacks: {
        onContentLoadError: (error, content) => {
            console.error('Error loading content:', error);
            
            if (error.includes('timeout')) {
                // Reintentar con timeout mayor
                reloadWithExtendedTimeout();
            } else if (error.includes('network')) {
                // Mostrar error de red
                showNetworkError();
            }
        }
    }
});
```

## Debugging y Logging

### Habilitar Debug Mode
```typescript
const castManager = useCastManager({
    debugMode: true, // Habilita logs detallados
    callbacks: {
        onStateChange: (state, previousState) => {
            console.log(`[DEBUG] State: ${previousState} -> ${state}`);
        }
    }
});
```

### Logs Automáticos
El sistema incluye logging automático para:
- Cambios de estado
- Carga de contenido
- Errores y reintentos
- Comparaciones de contenido
- Timeouts y timeouts

## Mejores Prácticas

### 1. Validación de Contenido
```typescript
const isValid = CastUtils.validateConfig(config);
if (!isValid) {
    console.error('Invalid config:', config);
    return;
}
```

### 2. Manejo de Estado
```typescript
// Verificar estado antes de realizar acciones
if (castManager.isReady()) {
    await castManager.loadContent(config);
} else {
    console.log('Cast not ready, operation will be queued');
}
```

### 3. Limpieza de Recursos
```typescript
useEffect(() => {
    return () => {
        castManager.clearContent();
    };
}, []);
```

### 4. Comparación de Contenido
```typescript
// Evitar recargas innecesarias
if (!castManager.isSameContent(config)) {
    await castManager.loadContent(config);
} else {
    console.log('Same content, skipping reload');
}
```

## Troubleshooting

### Problemas Comunes

1. **Cast no se conecta**
   - Verificar que el dispositivo Cast esté en la misma red
   - Comprobar que los hooks nativos estén funcionando

2. **Contenido no carga**
   - Verificar que la URL sea válida
   - Comprobar que el formato sea soportado por Cast
   - Revisar logs de error para detalles específicos

3. **Seek no funciona**
   - Para contenido Live, verificar que tenga DVR habilitado
   - Comprobar que el tiempo de seek esté dentro del rango válido

4. **Problemas de sincronización**
   - Verificar que los callbacks se estén ejecutando correctamente
   - Comprobar que el autoUpdate esté habilitado

### Debug Checklist

- [ ] `debugMode: true` habilitado
- [ ] Logs de estado de Cast en consola
- [ ] Verificar que hooks nativos funcionen
- [ ] Comprobar configuración de red
- [ ] Validar URLs de contenido
- [ ] Revisar timeouts y reintentos

## 📖 Índice de Documentación Completa

### 📋 Referencia Rápida
| Componente | Descripción | Enlace |
|------------|-------------|--------|
| **CastManager** | Clase principal del sistema Cast | [Ver documentación](./docs/class.castManager.md) |
| **CastMessageBuilder** | Constructor de mensajes Cast | [Ver documentación](./docs/class.castMessageBuilder.md) |
| **useCastManager** | Hook principal de gestión | [Ver documentación](./docs/hooks.useCastManager.md) |
| **CastUtils** | Funciones de utilidad | [Ver documentación](./docs/utils.castUtils.md) |
| **SimpleEventEmitter** | Sistema de eventos | [Ver documentación](./docs/utils.simpleEventEmitter.md) |
| **Constants** | Configuración y constantes | [Ver documentación](./docs/constants.md) |

### 🎯 Por Caso de Uso
- **Empezar rápido:** [useCastManager Hook](./docs/hooks.useCastManager.md)
- **Gestión avanzada:** [CastManager Class](./docs/class.castManager.md)
- **Construcción de mensajes:** [CastMessageBuilder](./docs/class.castMessageBuilder.md)
- **Utilidades y helpers:** [CastUtils](./docs/utils.castUtils.md)
- **Configuración del sistema:** [Constants](./docs/constants.md)
- **Sistema de eventos:** [SimpleEventEmitter](./docs/utils.simpleEventEmitter.md)

## Conclusión

Este sistema Cast proporciona una solución completa y fácil de mantener para gestionar Cast en tu aplicación. Con una API consistente, manejo robusto de errores y hooks reactivos, simplifica significativamente el trabajo con Cast mientras mantiene toda la funcionalidad necesaria.

**🚀 Para empezar:**
1. Revisa el [Hook principal useCastManager](./docs/hooks.useCastManager.md) para integración rápida
2. Consulta [CastManager](./docs/class.castManager.md) para funcionalidad avanzada
3. Explora [CastUtils](./docs/utils.castUtils.md) para utilidades específicas

**📚 Toda la documentación está en castellano** con ejemplos funcionales, tablas organizadas y casos de uso reales para facilitar la implementación y el mantenimiento del código.