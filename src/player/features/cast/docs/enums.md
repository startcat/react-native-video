# Enums de Cast - Documentación

Este documento describe todos los enums disponibles en el sistema Cast, definidos en `types/enums.ts`. Estos enums proporcionan constantes tipadas para los diferentes estados, tipos y operaciones del sistema Cast.

## Índice

1. [CastManagerState](#castmanagerstate) - Estados del Cast Manager
2. [CastContentType](#castcontenttype) - Tipos de contenido
3. [CastOperationResult](#castoperationresult) - Resultados de operaciones
4. [CastControlCommand](#castcontrolcommand) - Comandos de control
5. [CastManagerEvent](#castmanagerevent) - Eventos del Cast Manager
6. [CastStreamType](#caststreamtype) - Tipos de stream

---

## CastManagerState

Enum que define los diferentes estados en los que puede encontrarse el Cast Manager durante su ciclo de vida.

### Valores

| Valor | String | Descripción |
|-------|--------|-------------|
| `NOT_CONNECTED` | `'notConnected'` | Cast está desconectado, no hay sesión activa |
| `CONNECTING` | `'connecting'` | Cast está en proceso de conexión |
| `CONNECTED` | `'connected'` | Cast está conectado y listo para operaciones |
| `LOADING` | `'loading'` | Cast está cargando contenido |
| `PLAYING` | `'playing'` | Cast está reproduciendo contenido |
| `PAUSED` | `'paused'` | Cast está pausado |
| `BUFFERING` | `'buffering'` | Cast está bufferizando contenido |
| `ERROR` | `'error'` | Cast ha encontrado un error |

---

## CastContentType

Enum que define los diferentes tipos de contenido que pueden ser reproducidos vía Cast.

### Valores

| Valor | String | Descripción |
|-------|--------|-------------|
| `VOD` | `'vod'` | Video on Demand - Contenido pregrabado |
| `LIVE` | `'live'` | Contenido en vivo sin capacidad de DVR |
| `DVR` | `'dvr'` | Contenido en vivo con capacidad de DVR |
| `TUDUM` | `'tudum'` | Contenido de tipo Tudum (intro/apresentación) |

---

## CastOperationResult

Enum que define los posibles resultados de las operaciones Cast asíncronas.

### Valores

| Valor | String | Descripción |
|-------|--------|-------------|
| `SUCCESS` | `'success'` | Operación completada exitosamente |
| `FAILED` | `'failed'` | Operación falló debido a un error |
| `PENDING` | `'pending'` | Operación está en progreso |
| `CANCELLED` | `'cancelled'` | Operación fue cancelada |

---

## CastControlCommand

Enum que define los comandos de control disponibles para el Cast.

### Valores

| Valor | String | Descripción |
|-------|--------|-------------|
| `PLAY` | `'play'` | Iniciar reproducción |
| `PAUSE` | `'pause'` | Pausar reproducción |
| `SEEK` | `'seek'` | Buscar posición específica |
| `MUTE` | `'mute'` | Silenciar audio |
| `UNMUTE` | `'unmute'` | Activar audio |
| `VOLUME` | `'volume'` | Ajustar volumen |
| `SKIP_FORWARD` | `'skip_forward'` | Saltar hacia adelante |
| `SKIP_BACKWARD` | `'skip_backward'` | Saltar hacia atrás |
| `STOP` | `'stop'` | Detener reproducción |

---

## CastManagerEvent

Enum que define los eventos que puede emitir el Cast Manager.

### Valores

| Valor | String | Descripción |
|-------|--------|-------------|
| `STATE_CHANGED` | `'state_changed'` | El estado del Cast Manager ha cambiado |
| `CONTENT_LOADED` | `'content_loaded'` | Contenido cargado exitosamente |
| `CONTENT_LOAD_ERROR` | `'content_load_error'` | Error al cargar contenido |
| `PLAYBACK_STARTED` | `'playback_started'` | Reproducción iniciada |
| `PLAYBACK_ENDED` | `'playback_ended'` | Reproducción finalizada |
| `PLAYBACK_ERROR` | `'playback_error'` | Error durante reproducción |
| `BUFFERING_CHANGED` | `'buffering_changed'` | Estado de buffering cambió |
| `TIME_UPDATE` | `'time_update'` | Actualización de tiempo de reproducción |
| `CONNECTION_CHANGED` | `'connection_changed'` | Estado de conexión cambió |

---

## CastStreamType

Enum que define los tipos de stream compatibles con Google Cast SDK.

### Valores

| Valor | String | Descripción |
|-------|--------|-------------|
| `BUFFERED` | `'buffered'` | Stream con buffer - contenido VOD |
| `LIVE` | `'live'` | Stream en vivo |
| `NONE` | `'none'` | Sin tipo específico |

---

## Notas de Implementación

### Consistencia con Google Cast SDK

Los enums `CastStreamType` están diseñados para ser compatibles con el Google Cast SDK:

```typescript
// Mapeo directo con Google Cast SDK
const castStreamType = isLive ? CastStreamType.LIVE : CastStreamType.BUFFERED;
```

### Uso en Interfaces

Estos enums se utilizan en las interfaces consolidadas:

```typescript
interface CastContentInfo {
    contentType: CastContentType;
    // ... otras propiedades
}

interface CastMediaInfo {
    streamType: CastStreamType;
    // ... otras propiedades
}
```

### Type Safety

Los enums proporcionan type safety y autocompletado:

```typescript
// ✅ Correcto
const state = CastManagerState.CONNECTED;

// ❌ Error de TypeScript
const state = 'connected'; // No es type-safe
```

### Debugging

Para debugging, puedes usar los valores string directamente:

```typescript
console.log(`Estado actual: ${CastManagerState.PLAYING}`); // "playing"
```

---

Los enums proporcionan una base sólida y type-safe para toda la funcionalidad Cast, asegurando consistencia y facilitando el mantenimiento del código.
