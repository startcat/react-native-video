# Constantes Cast - constants.ts

Este documento describe todas las constantes de configuración disponibles en el archivo `constants.ts` para el sistema Cast.

## Índice

- [Configuración Principal](#configuración-principal)
- [Timeouts y Reintentos](#timeouts-y-reintentos)
- [Tolerancias y Comparación](#tolerancias-y-comparación)
- [Mapeos de Estados y Tipos](#mapeos-de-estados-y-tipos)
- [Mensajes y Logging](#mensajes-y-logging)
- [Configuración de Contenido](#configuración-de-contenido)
- [Configuración de Reproducción](#configuración-de-reproducción)
- [Configuración de Eventos](#configuración-de-eventos)
- [Configuración de Desarrollo](#configuración-de-desarrollo)

---

## Configuración Principal

### `DEFAULT_CAST_CONFIG`

Configuración por defecto del Cast Manager.

| Propiedad      | Tipo      | Valor | Descripción                                    |
|----------------|-----------|-------|------------------------------------------------|
| `retryAttempts`| `number`  | `3`   | Número de intentos de reintento                |
| `retryDelay`   | `number`  | `2000`| Retraso entre reintentos (ms)                 |
| `loadTimeout`  | `number`  | `10000`| Timeout para carga de contenido (ms)         |
| `debugMode`    | `boolean` | `true`| Habilita modo de depuración                   |

**Ejemplo:**
```typescript
import { DEFAULT_CAST_CONFIG } from './constants';

const config = {
  ...DEFAULT_CAST_CONFIG,
  retryAttempts: 5, // Personalizar reintentos
};
```

### `DEFAULT_MESSAGE_CONFIG`

Configuración por defecto para mensajes Cast.

| Propiedad             | Tipo      | Valor     | Descripción                                    |
|-----------------------|-----------|-----------|------------------------------------------------|
| `enableYoubora`       | `boolean` | `true`    | Habilita integración con Youbora              |
| `enableAds`           | `boolean` | `true`    | Habilita soporte para anuncios                |
| `defaultStartPosition`| `number`  | `0`       | Posición de inicio por defecto (segundos)     |
| `contentIdPrefix`     | `string`  | `'cast_'` | Prefijo para IDs de contenido                  |
| `debugMode`           | `boolean` | `true`    | Habilita modo de depuración                   |

---

## Timeouts y Reintentos

### `CAST_TIMEOUTS`

Timeouts para operaciones Cast específicas.

| Propiedad       | Tipo     | Valor  | Descripción                                    |
|-----------------|----------|--------|------------------------------------------------|
| `LOAD_MEDIA`    | `number` | `10000`| Timeout para carga de media (ms)              |
| `CONNECT`       | `number` | `5000` | Timeout para conexión (ms)                    |
| `CONTROL_ACTION`| `number` | `3000` | Timeout para acciones de control (ms)         |
| `STATE_CHANGE`  | `number` | `2000` | Timeout para cambios de estado (ms)           |
| `RETRY_DELAY`   | `number` | `2000` | Retraso entre reintentos (ms)                 |

### `RETRY_CONFIG`

Configuración avanzada de reintentos.

| Propiedad         | Tipo     | Valor   | Descripción                                    |
|-------------------|----------|---------|------------------------------------------------|
| `MAX_ATTEMPTS`    | `number` | `3`     | Máximo número de intentos                      |
| `INITIAL_DELAY`   | `number` | `1000`  | Retraso inicial (ms)                           |
| `EXPONENTIAL_BASE`| `number` | `2`     | Base para crecimiento exponencial             |
| `MAX_DELAY`       | `number` | `10000` | Retraso máximo (ms)                            |

**Ejemplo:**
```typescript
import { RETRY_CONFIG } from './constants';

// Cálculo de retraso exponencial
const delay = Math.min(
  RETRY_CONFIG.INITIAL_DELAY * Math.pow(RETRY_CONFIG.EXPONENTIAL_BASE, attempt),
  RETRY_CONFIG.MAX_DELAY
);
```

---

## Tolerancias y Comparación

### `CONTENT_COMPARISON_TOLERANCE`

Tolerancias para comparación de contenido.

| Propiedad            | Tipo     | Valor | Descripción                                    |
|----------------------|----------|-------|------------------------------------------------|
| `TIME_DIFFERENCE`    | `number` | `5`   | Diferencia máxima de tiempo (segundos)        |
| `POSITION_DIFFERENCE`| `number` | `0.1` | Diferencia máxima de posición (porcentaje)    |

### `POSITION_CONFIG`

Configuración de posición y seek.

| Propiedad           | Tipo     | Valor  | Descripción                                    |
|---------------------|----------|--------|------------------------------------------------|
| `SEEK_TOLERANCE`    | `number` | `1`    | Tolerancia para seek (segundos)               |
| `LIVE_EDGE_TOLERANCE`| `number` | `30`   | Tolerancia para borde en vivo (segundos)      |
| `DVR_WINDOW_DEFAULT`| `number` | `3600` | Ventana DVR por defecto (segundos)            |

---

## Mapeos de Estados y Tipos

### `CAST_STATE_MAPPING`

Mapeo de estados de Cast nativo a estados del manager.

| Estado Nativo         | Estado Manager                        | Descripción                          |
|-----------------------|---------------------------------------|--------------------------------------|
| `'NOT_CONNECTED'`     | `CastManagerState.NOT_CONNECTED`      | No conectado                         |
| `'NO_DEVICES_AVAILABLE'`| `CastManagerState.NOT_CONNECTED`    | Sin dispositivos disponibles        |
| `'CONNECTING'`        | `CastManagerState.CONNECTING`        | Conectando                           |
| `'CONNECTED'`         | `CastManagerState.CONNECTED`         | Conectado                            |

### `CONTENT_TYPE_MAPPING`

Mapeo de tipos de contenido.

| Clave   | Valor                      | Descripción                              |
|---------|----------------------------|------------------------------------------|
| `vod`   | `CastContentType.VOD`      | Video bajo demanda                       |
| `live`  | `CastContentType.LIVE`     | Transmisión en vivo                      |
| `dvr`   | `CastContentType.DVR`      | Transmisión en vivo con DVR              |
| `tudum` | `CastContentType.TUDUM`    | Contenido tipo Tudum                     |

**Ejemplo:**
```typescript
import { CONTENT_TYPE_MAPPING } from './constants';

const contentType = CONTENT_TYPE_MAPPING.live; // CastContentType.LIVE
```

---

## Mensajes y Logging

### `CAST_ERROR_MESSAGES`

Mensajes de error estándar en castellano.

| Clave                | Valor                                        | Descripción                              |
|----------------------|----------------------------------------------|------------------------------------------|
| `NO_CONNECTION`      | `'No hay conexión Cast disponible'`         | Sin conexión Cast                        |
| `LOAD_FAILED`        | `'Error al cargar el contenido en Cast'`    | Error de carga                           |
| `INVALID_SOURCE`     | `'Fuente de contenido no válida'`           | Source inválido                          |
| `TIMEOUT`            | `'Tiempo de espera agotado'`                | Timeout                                  |
| `DEVICE_NOT_READY`   | `'Dispositivo Cast no está listo'`          | Dispositivo no listo                     |
| `UNSUPPORTED_CONTENT`| `'Tipo de contenido no soportado'`          | Contenido no soportado                   |
| `NETWORK_ERROR`      | `'Error de red'`                             | Error de conectividad                    |
| `UNKNOWN_ERROR`      | `'Error desconocido'`                       | Error no identificado                    |

### `CAST_LOG_EVENTS`

Eventos de logging para trazabilidad.

| Clave                  | Valor                            | Descripción                              |
|------------------------|----------------------------------|------------------------------------------|
| `STATE_CHANGE`         | `'Cast state changed'`           | Cambio de estado                         |
| `CONTENT_LOAD_START`   | `'Content load started'`         | Inicio de carga de contenido             |
| `CONTENT_LOAD_SUCCESS` | `'Content loaded successfully'`  | Carga exitosa                            |
| `CONTENT_LOAD_ERROR`   | `'Content load failed'`          | Error en carga                           |
| `PLAYBACK_START`       | `'Playback started'`             | Inicio de reproducción                   |
| `PLAYBACK_END`         | `'Playback ended'`               | Fin de reproducción                      |
| `CONTROL_ACTION`       | `'Control action executed'`      | Acción de control ejecutada              |
| `CONNECTION_CHANGE`    | `'Connection changed'`           | Cambio de conexión                       |
| `ERROR`                | `'Cast error occurred'`          | Error ocurrido                           |

### `LOG_PREFIX`

Prefijo para logs del sistema Cast.

| Constante    | Valor               | Descripción                              |
|--------------|---------------------|------------------------------------------|
| `LOG_PREFIX` | `'[Cast Manager]'`  | Prefijo para identificar logs Cast       |

**Ejemplo:**
```typescript
import { LOG_PREFIX, CAST_LOG_EVENTS } from './constants';

console.log(`${LOG_PREFIX} ${CAST_LOG_EVENTS.STATE_CHANGE}: ${newState}`);
// "[Cast Manager] Cast state changed: CONNECTED"
```

---

## Configuración de Contenido

### `SUPPORTED_MIME_TYPES`

Tipos MIME soportados por el sistema Cast.

| Formato | Tipo MIME                    | Descripción                              |
|---------|------------------------------|------------------------------------------|
| `HLS`   | `'application/x-mpegurl'`    | HTTP Live Streaming                      |
| `DASH`  | `'application/dash+xml'`     | Dynamic Adaptive Streaming over HTTP    |
| `MP3`   | `'audio/mpeg'`               | Audio MPEG                               |
| `MP4`   | `'video/mp4'`                | Video MP4                                |
| `WEBM`  | `'video/webm'`               | Video WebM                               |

### `METADATA_CONFIG`

Configuración de metadata para contenido.

| Propiedad               | Tipo     | Valor  | Descripción                                    |
|-------------------------|----------|--------|------------------------------------------------|
| `MAX_TITLE_LENGTH`      | `number` | `200`  | Longitud máxima del título                     |
| `MAX_DESCRIPTION_LENGTH`| `number` | `500`  | Longitud máxima de la descripción              |
| `DEFAULT_POSTER`        | `string` | `''`   | Poster por defecto                             |
| `IMAGE_TIMEOUT`         | `number` | `5000` | Timeout para carga de imágenes (ms)           |

**Ejemplo:**
```typescript
import { SUPPORTED_MIME_TYPES, METADATA_CONFIG } from './constants';

const contentType = SUPPORTED_MIME_TYPES.HLS; // 'application/x-mpegurl'
const maxTitle = METADATA_CONFIG.MAX_TITLE_LENGTH; // 200
```

---

## Configuración de Reproducción

### `BUFFER_CONFIG`

Configuración de buffer para reproducción.

| Propiedad        | Tipo     | Valor | Descripción                                    |
|------------------|----------|-------|------------------------------------------------|
| `MIN_BUFFER_TIME`| `number` | `2`   | Tiempo mínimo de buffer (segundos)            |
| `MAX_BUFFER_TIME`| `number` | `10`  | Tiempo máximo de buffer (segundos)            |
| `BUFFER_TOLERANCE`| `number`| `0.5` | Tolerancia del buffer (segundos)              |

---

## Configuración de Eventos

### `EVENT_CONFIG`

Configuración para el manejo de eventos.

| Propiedad        | Tipo     | Valor | Descripción                                    |
|------------------|----------|-------|------------------------------------------------|
| `DEBOUNCE_TIME`  | `number` | `100` | Tiempo de debounce (ms)                        |
| `THROTTLE_TIME`  | `number` | `500` | Tiempo de throttle (ms)                        |
| `MAX_EVENT_QUEUE`| `number` | `100` | Máximo número de eventos en cola               |

**Ejemplo:**
```typescript
import { EVENT_CONFIG } from './constants';
import { debounce } from '../utils/castUtils';

const debouncedHandler = debounce(handleEvent, EVENT_CONFIG.DEBOUNCE_TIME);
```

---

## Configuración de Desarrollo

### `DEBUG_CONFIG`

Configuración para depuración y desarrollo.

| Propiedad            | Tipo      | Valor  | Descripción                                    |
|----------------------|-----------|--------|------------------------------------------------|
| `VERBOSE_LOGGING`    | `boolean` | `true` | Habilita logging detallado                     |
| `LOG_EVENTS`         | `boolean` | `true` | Habilita logging de eventos                    |
| `LOG_STATE_CHANGES`  | `boolean` | `true` | Habilita logging de cambios de estado         |
| `LOG_CONTENT_CHANGES`| `boolean` | `true` | Habilita logging de cambios de contenido      |
| `LOG_ERRORS`         | `boolean` | `true` | Habilita logging de errores                   |

**Ejemplo:**
```typescript
import { DEBUG_CONFIG } from './constants';

if (DEBUG_CONFIG.VERBOSE_LOGGING) {
  console.log('Información detallada de depuración');
}
```

---

## Notas de Uso

### Importaciones

El archivo importa enums desde la estructura consolidada:

```typescript
import { CastContentType, CastManagerState } from './types/enums';
```

### Casos de Uso Comunes

1. **Configuración de timeouts:**
   ```typescript
   import { CAST_TIMEOUTS } from './constants';
   
   const loadPromise = Promise.race([
     loadContent(),
     timeout(CAST_TIMEOUTS.LOAD_MEDIA)
   ]);
   ```

2. **Manejo de errores:**
   ```typescript
   import { CAST_ERROR_MESSAGES } from './constants';
   
   throw new Error(CAST_ERROR_MESSAGES.NO_CONNECTION);
   ```

3. **Validación de contenido:**
   ```typescript
   import { SUPPORTED_MIME_TYPES, METADATA_CONFIG } from './constants';
   
   const isValidMimeType = Object.values(SUPPORTED_MIME_TYPES).includes(mimeType);
   const isValidTitle = title.length <= METADATA_CONFIG.MAX_TITLE_LENGTH;
   ```

4. **Configuración de reintentos:**
   ```typescript
   import { RETRY_CONFIG } from './constants';
   
   for (let attempt = 0; attempt < RETRY_CONFIG.MAX_ATTEMPTS; attempt++) {
     try {
       await operation();
       break;
     } catch (error) {
       if (attempt === RETRY_CONFIG.MAX_ATTEMPTS - 1) throw error;
       await delay(RETRY_CONFIG.INITIAL_DELAY * Math.pow(RETRY_CONFIG.EXPONENTIAL_BASE, attempt));
     }
   }
   ```

### Características de las Constantes

- **Inmutables:** Todas las constantes usan `as const` para inmutabilidad
- **Tipadas:** TypeScript proporciona autocompletado y verificación de tipos
- **Organizadas:** Agrupadas por funcionalidad para fácil mantenimiento
- **Documentadas:** Cada grupo tiene comentarios explicativos
- **Configurables:** Valores separados del código para fácil personalización

Estas constantes proporcionan una configuración centralizada y consistente para todo el sistema Cast, facilitando el mantenimiento y la personalización del comportamiento del reproductor.
