# Hooks de Estado Cast - useCastState.ts

Este documento describe el funcionamiento y uso de los hooks relacionados con el estado de Cast disponibles en el archivo `hooks/useCastState.ts`.

## Índice

1. [useCastState](#usecaststate) - Hook principal para gestión de estado Cast
2. [useCastConnectivity](#usecastconnectivity) - Hook para información de conectividad
3. [useCastReady](#usecastready) - Hook para verificar si Cast está listo
4. [useCastProgress](#usecastprogress) - Hook para información de progreso
5. [useCastVolume](#usecastvolume) - Hook para información de volumen

---

## useCastState

Hook principal para gestionar el estado de Cast de forma reactiva, proporcionando información completa sobre el estado actual del Cast.

### Sintaxis

```typescript
const castState = useCastState(options?);
```

### Parámetros

El hook acepta un objeto de configuración opcional:

| Propiedad | Tipo | Obligatorio | Por Defecto | Descripción |
|-----------|------|-------------|-------------|-------------|
| `debugMode` | `boolean` | ❌ | `true` | Activa logs de debug en consola |
| `onConnectionChange` | `(status: CastConnectionInfo['status']) => void` | ❌ | `undefined` | Callback cuando cambia el estado de conexión |
| `onMediaChange` | `(media: CastMediaInfo) => void` | ❌ | `undefined` | Callback cuando cambia el estado del media |
| `onError` | `(error: CastErrorInfo) => void` | ❌ | `undefined` | Callback cuando ocurre un error |
| `onAudioTrackChange` | `(track: CastTrackInfo \| null) => void` | ❌ | `undefined` | Callback cuando cambia la pista de audio |
| `onTextTrackChange` | `(track: CastTrackInfo \| null) => void` | ❌ | `undefined` | Callback cuando cambia la pista de subtítulos |

### Valor de Retorno

Retorna un objeto `CastStateCustom` con las siguientes propiedades:

#### Información de Conexión

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `connection.status` | `'connected' \| 'connecting' \| 'notConnected'` | Estado de la conexión Cast |
| `connection.deviceName` | `string \| null` | Nombre del dispositivo Cast |
| `connection.statusText` | `string` | Texto descriptivo del estado |

#### Información de Media

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `media.url` | `string \| null` | URL del contenido actual |
| `media.title` | `string \| null` | Título del contenido |
| `media.subtitle` | `string \| null` | Subtítulo del contenido |
| `media.imageUrl` | `string \| null` | URL de la imagen |
| `media.isPlaying` | `boolean` | Indica si está reproduciendo |
| `media.isPaused` | `boolean` | Indica si está pausado |
| `media.isBuffering` | `boolean` | Indica si está bufferizando |
| `media.isIdle` | `boolean` | Indica si está inactivo |
| `media.currentTime` | `number` | Tiempo actual en segundos |
| `media.duration` | `number \| null` | Duración total en segundos |
| `media.progress` | `number` | Progreso de reproducción |
| `media.seekableRange` | `{ start: number; end: number } \| null` | Rango navegable |
| `media.playbackRate` | `number` | Velocidad de reproducción |
| `media.audioTrack` | `CastTrackInfo \| null` | Pista de audio activa |
| `media.textTrack` | `CastTrackInfo \| null` | Pista de texto activa |
| `media.availableAudioTracks` | `CastTrackInfo[]` | Pistas de audio disponibles |
| `media.availableTextTracks` | `CastTrackInfo[]` | Pistas de texto disponibles |

#### Información de Volumen

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `volume.level` | `number` | Nivel de volumen (0-1) |
| `volume.isMuted` | `boolean` | Indica si está silenciado |

#### Información de Error

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `error.hasError` | `boolean` | Indica si hay un error |
| `error.errorCode` | `string \| null` | Código del error |
| `error.errorMessage` | `string \| null` | Mensaje del error |
| `error.lastErrorTime` | `number \| null` | Timestamp del último error |

#### Metadatos

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `lastUpdate` | `number` | Timestamp de la última actualización |

### Ejemplo de Uso

```typescript
import { useCastState } from '@/features/cast';

function MyCastComponent() {
    const castState = useCastState({
        debugMode: true,
        onConnectionChange: (status) => {
            console.log('Cast connection changed:', status);
        },
        onMediaChange: (media) => {
            console.log('Media changed:', media.title);
        },
        onAudioTrackChange: (track) => {
            console.log('Audio track changed:', track?.name);
        }
    });

    return (
        <div>
            <p>Estado: {castState.connection.status}</p>
            <p>Dispositivo: {castState.connection.deviceName || 'Ninguno'}</p>
            <p>Reproduciendo: {castState.media.title || 'Sin contenido'}</p>
            <p>Tiempo: {castState.media.currentTime}s / {castState.media.duration}s</p>
            <p>Volumen: {Math.round(castState.volume.level * 100)}%</p>
        </div>
    );
}
```

---

## CastTrackInfo Interface

Interface que describe la información de pistas de audio y subtítulos.

### Estructura

```typescript
interface CastTrackInfo {
    id: number;
    name: string | null;
    language: string | null;
    type: 'AUDIO' | 'TEXT' | 'VIDEO';
}
```

### Propiedades

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `id` | `number` | Identificador único de la pista |
| `name` | `string \| null` | Nombre descriptivo de la pista |
| `language` | `string \| null` | Código de idioma (ej: 'es', 'en') |
| `type` | `'AUDIO' \| 'TEXT' \| 'VIDEO'` | Tipo de pista |

---

## Arquitectura del Hook

### Integración con Hooks Nativos

El hook `useCastState` utiliza múltiples hooks nativos de `react-native-google-cast`:

| Hook Nativo | Propósito |
|-------------|----------|
| `useNativeCastState` | Estado general de Cast |
| `useCastSession` | Información de la sesión activa |
| `useRemoteMediaClient` | Cliente para controles de media |
| `useMediaStatus` | Estado del contenido multimedia |
| `useStreamPosition` | Posición actual del stream (actualizada cada segundo) |

### Sistema de Reducer

Utiliza un reducer (`castReducer`) para sincronizar todos los estados nativos en un estado unificado:

```typescript
type CastAction = 
    | { type: 'SYNC_UPDATE'; payload: { /* datos nativos */ } }
    | { type: 'UPDATE_VOLUME'; payload: { level: number; isMuted: boolean } }
    | { type: 'SET_ERROR'; payload: { errorCode: string; errorMessage: string } }
    | { type: 'CLEAR_ERROR' };
```

---

## Callbacks Disponibles

### onConnectionChange

Se ejecuta cuando cambia el estado de conexión Cast.

```typescript
onConnectionChange: (status: 'connected' | 'connecting' | 'notConnected') => void
```

### onMediaChange

Se ejecuta cuando cambia el estado del contenido multimedia.

```typescript
onMediaChange: (media: CastMediaInfo) => void
```

**Triggers:**
- Cambio de URL del contenido
- Cambio de estado de reproducción (play/pause)
- Cambio de título o metadatos

### onAudioTrackChange

Se ejecuta cuando cambia la pista de audio activa.

```typescript
onAudioTrackChange: (track: CastTrackInfo | null) => void
```

### onTextTrackChange

Se ejecuta cuando cambia la pista de subtítulos activa.

```typescript
onTextTrackChange: (track: CastTrackInfo | null) => void
```

### onError

Se ejecuta cuando ocurre un error en Cast.

```typescript
onError: (error: CastErrorInfo) => void
```

---

## Optimizaciones y Performance

### Sincronización Unificada

**Un Solo useEffect:**
Todos los hooks nativos se sincronizan en un único `useEffect` para evitar múltiples renders:

```typescript
useEffect(() => {
    dispatch({
        type: 'SYNC_UPDATE',
        payload: {
            nativeCastState,
            nativeSession,
            nativeClient,
            nativeMediaStatus,
            nativeStreamPosition
        }
    });
}, [nativeCastState, nativeSession, nativeClient, nativeMediaStatus, nativeStreamPosition]);
```

### Referencias Estables

**Callbacks con useRef:**
Los callbacks se mantienen en referencias para evitar dependencias circulares:

```typescript
const callbacksRef = useRef({ onConnectionChange, onMediaChange, onError });
```

### Detección de Cambios Inteligente

Solo ejecuta callbacks cuando hay cambios reales en las propiedades relevantes:

```typescript
// Solo callback si cambió la conexión
if (currentState.connection.status !== prevState.connection.status) {
    callbacks.onConnectionChange(currentState.connection.status);
}
```

---

## Notas Importantes

### Estados de Cast Manager

Los hooks utilizan el enum `CastManagerState` con los siguientes valores:

- `NOT_CONNECTED` - Cast desconectado
- `CONNECTING` - Cast conectando
- `CONNECTED` - Cast conectado
- `LOADING` - Cargando contenido
- `PLAYING` - Reproduciendo
- `PAUSED` - Pausado
- `BUFFERING` - Bufferizando
- `ERROR` - Error

### Debug y Troubleshooting

**Modo Debug:**
Cuando `debugMode: true`, el hook emite logs detallados:

```typescript
const castState = useCastState({ debugMode: true });
```

**Información de Debug:**
- Cambios de estado de conexión
- Actualizaciones de media y progreso
- Cambios de pistas de audio/subtítulos
- Errores y su contexto
- Timestamps de actualizaciones

### Cleanup y Memory Management

**Cleanup Automático:**
```typescript
useEffect(() => {
    return () => { isMountedRef.current = false; };
}, []);
```

**Prevención de Memory Leaks:**
- Referencias limpiadas automáticamente al desmontar
- Callbacks protegidos contra componentes desmontados
- Estado interno optimizado para garbage collection

### Integración con useCastManager

El hook `useCastState` es utilizado internamente por `useCastManager` para proporcionar estado reactivo:

```typescript
// En useCastManager
const castState = useCastState();

// Acceso a propiedades específicas
const isConnected = castState.connection.status === 'connected';
const currentMedia = castState.media;
const volumeLevel = castState.volume.level;
```

### Cambios Recientes y Arquitectura

**Optimizaciones Principales:**

1. **Eliminación del parámetro `enableStreamPosition`**: El seguimiento de posición del stream ahora está siempre habilitado, controlado internamente por `streamPositionInterval`.

2. **Sistema de Referencias para Callbacks**: Los callbacks se capturan en `useRef` para evitar dependencias circulares y re-renders innecesarios:
   ```typescript
   const onStateChangeRef = useRef(onStateChange);
   const onConnectionChangeRef = useRef(onConnectionChange);
   ```

3. **Detección Inteligente de Cambios**: Solo actualiza el estado cuando hay cambios significativos:
   ```typescript
   const hasStateChange = (
       newState.castState !== previousState.castState ||
       newState.hasSession !== previousState.hasSession ||
       newState.managerState !== previousState.managerState
   );
   ```

4. **Callback de Conexión Mejorado**: Ahora incluye el estado anterior:
   ```typescript
   onConnectionChange: (isConnected: boolean, previousConnected: boolean) => void
   ```

**Beneficios de la Arquitectura Optimizada:**
- Elimina bucles infinitos de actualización
- Reduce renders innecesarios en componentes padre
- Mejora la estabilidad del estado Cast
- Proporciona mejor debugging y trazabilidad
- Mantiene la compatibilidad con el API existente

### Dependencias

Estos hooks dependen de:
- `react-native-google-cast` para funcionalidad nativa
- Tipos consolidados en `../types`
- Constantes y utilidades del directorio Cast

---

## Ejemplos Completos

### Componente Completo de Cast

```typescript
import { 
    useCastState, 
    useCastProgress, 
    useCastVolume,
    useCastReady 
} from '@/features/cast';

function CompleteCastPlayer() {
    const isReady = useCastReady();
    const castState = useCastState({ debugMode: true });
    const progress = useCastProgress(isReady);
    const volume = useCastVolume();
    
    if (!isReady) {
        return <div>Cast no disponible</div>;
    }
    
    return (
        <div className="cast-player">
            <h3>{castState.managerState}</h3>
            
            {/* Progress Bar */}
            <div className="progress">
                <div style={{ width: `${progress.progress * 100}%` }} />
            </div>
            
            {/* Volume Control */}
            <div className="volume">
                Vol: {Math.round(volume.level * 100)}%
                {volume.muted && ' (Silenciado)'}
            </div>
            
            {/* Status */}
            <div className="status">
                {progress.isBuffering ? 'Cargando...' : 
                 progress.isPaused ? 'Pausado' : 'Reproduciendo'}
            </div>
        </div>
    );
}
```
