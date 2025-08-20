# Constantes Cast - constants.ts

Este documento describe todas las constantes de configuración disponibles en el archivo `constants.ts` para el sistema Cast.

## Índice

- [Configuración Principal](#configuración-principal)
- [Mensajes y Logging](#mensajes-y-logging)
- [Configuración de Contenido](#configuración-de-contenido)
- [Notas de Uso](#notas-de-uso)

---

## Configuración Principal

### `DEFAULT_CAST_CONFIG`

Configuración por defecto del Cast Manager.

| Propiedad                | Tipo      | Valor | Descripción                                    |
|--------------------------|-----------|-------|-------------------------------------------------|
| `retryAttempts`          | `number`  | `3`   | Número de intentos de reintento                |
| `retryDelay`             | `number`  | `2000`| Retraso entre reintentos (ms)                 |
| `loadTimeout`            | `number`  | `10000`| Timeout para carga de contenido (ms)         |
| `debugMode`              | `boolean` | `true`| Habilita modo de depuración                   |
| `streamPositionInterval` | `number`  | `1`   | Intervalo de actualización de posición (s)    |
| `initializationDelay`    | `number`  | `200` | Retraso de inicialización (ms)                |

**Ejemplo:**
```typescript
import { DEFAULT_CAST_CONFIG } from './constants';

// Usado en useCastState
const castState = useCastState({
    debugMode: DEFAULT_CAST_CONFIG.debugMode,
    // otros callbacks...
});

// Configuración personalizada
const config = {
  ...DEFAULT_CAST_CONFIG,
  retryAttempts: 5, // Personalizar reintentos
};
```

### `DEFAULT_MESSAGE_CONFIG`

Configuración por defecto para mensajes Cast.

| Propiedad             | Tipo      | Valor | Descripción                                    |
|-----------------------|-----------|-------|------------------------------------------------|
| `enableYoubora`       | `boolean` | `true`| Habilita integración con Youbora              |
| `enableAds`           | `boolean` | `true`| Habilita soporte para anuncios                |
| `defaultStartPosition`| `number`  | `0`   | Posición de inicio por defecto (segundos)     |
| `debugMode`           | `boolean` | `true`| Habilita modo de depuración                   |

**Ejemplo:**
```typescript
import { DEFAULT_MESSAGE_CONFIG } from './constants';

// Usado en CastMessageBuilder
const builder = new CastMessageBuilder({
    ...DEFAULT_MESSAGE_CONFIG,
    enableAds: false // Deshabilitar anuncios
});
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

**Estado:** ❌ **No utilizado actualmente** - Disponible para uso futuro en manejo de errores.

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

**Estado:** ❌ **No utilizado actualmente** - Disponible para uso futuro en sistema de logging.

### `LOG_PREFIX`

Prefijo para logs del sistema Cast.

| Constante    | Valor               | Descripción                              |
|--------------|---------------------|------------------------------------------|
| `LOG_PREFIX` | `'[Cast Manager]'`  | Prefijo para identificar logs Cast       |

**Estado:** ✅ **Utilizado activamente** en `CastMessageBuilder.ts`

**Ejemplo:**
```typescript
import { LOG_PREFIX } from './constants';

// En CastMessageBuilder
private log(message: string, data?: any): void {
    if (this.debugMode) {
        console.log(`${LOG_PREFIX} ${LOG_KEY} ${message}`);
    }
}
```

---

## Configuración de Contenido

### `SUPPORTED_MIME_TYPES`

Tipos MIME soportados por el sistema Cast.

| Formato | Tipo MIME                    | Descripción                              |
|---------|------------------------------|------------------------------------------|
| `HLS`   | `'application/x-mpegurl'`    | HTTP Live Streaming                      |
| `DASH`  | `'application/dash+xml'`     | Dynamic Adaptive Streaming over HTTP    |
| `MP3`   | `'audio/mp3'`                | Audio MP3                                |
| `MP4`   | `'video/mp4'`                | Video MP4                                |
| `WEBM`  | `'video/webm'`               | Video WebM                               |

**Estado:** ✅ **Utilizado activamente** en `CastMessageBuilder.ts`

### `METADATA_CONFIG`

Configuración de metadata para contenido.

| Propiedad               | Tipo     | Valor  | Descripción                                    |
|-------------------------|----------|--------|------------------------------------------------|
| `MAX_TITLE_LENGTH`      | `number` | `200`  | Longitud máxima del título                     |
| `MAX_DESCRIPTION_LENGTH`| `number` | `500`  | Longitud máxima de la descripción              |
| `DEFAULT_POSTER`        | `string` | `''`   | Poster por defecto                             |

**Estado:** ✅ **Utilizado activamente** en `CastMessageBuilder.ts`

**Ejemplo:**
```typescript
import { SUPPORTED_MIME_TYPES, METADATA_CONFIG } from './constants';

// En CastMessageBuilder
private buildMetadata(metadata: CastContentMetadata): CastContentMetadata {
    return {
        title: this.truncateString(metadata.title || 'Sin título', METADATA_CONFIG.MAX_TITLE_LENGTH),
        description: this.truncateString(metadata.description || '', METADATA_CONFIG.MAX_DESCRIPTION_LENGTH),
        poster: metadata.poster || METADATA_CONFIG.DEFAULT_POSTER,
        // ...
    };
}
```


---

## Notas de Uso

### Estado Actual del Archivo

**Constantes Activamente Usadas:**
- ✅ `DEFAULT_CAST_CONFIG` - Usado en `useCastState.ts`
- ✅ `DEFAULT_MESSAGE_CONFIG` - Usado en `CastMessageBuilder.ts`
- ✅ `LOG_PREFIX` - Usado en `CastMessageBuilder.ts`
- ✅ `SUPPORTED_MIME_TYPES` - Usado en `CastMessageBuilder.ts`
- ✅ `METADATA_CONFIG` - Usado en `CastMessageBuilder.ts`

**Constantes No Usadas (Disponibles para Uso Futuro):**
- ❌ `CAST_ERROR_MESSAGES` - Para manejo de errores
- ❌ `CAST_LOG_EVENTS` - Para sistema de logging

### Casos de Uso Actuales

1. **Configuración de hooks:**
   ```typescript
   import { DEFAULT_CAST_CONFIG } from './constants';
   
   const castState = useCastState({
       debugMode: DEFAULT_CAST_CONFIG.debugMode,
       // callbacks...
   });
   ```

2. **Construcción de mensajes Cast:**
   ```typescript
   import { DEFAULT_MESSAGE_CONFIG, SUPPORTED_MIME_TYPES } from './constants';
   
   const builder = new CastMessageBuilder(DEFAULT_MESSAGE_CONFIG);
   const mimeType = SUPPORTED_MIME_TYPES.HLS;
   ```

3. **Validación de metadata:**
   ```typescript
   import { METADATA_CONFIG } from './constants';
   
   const isValidTitle = title.length <= METADATA_CONFIG.MAX_TITLE_LENGTH;
   ```

### Limpieza Reciente

Se han eliminado las siguientes constantes no utilizadas:
- `CAST_TIMEOUTS`
- `CONTENT_COMPARISON_TOLERANCE`
- `CAST_STATE_MAPPING`
- `CONTENT_TYPE_MAPPING`
- `RETRY_CONFIG`
- `BUFFER_CONFIG`
- `POSITION_CONFIG`
- `EVENT_CONFIG`
- `DEBUG_CONFIG`

### Características de las Constantes

- **Inmutables:** Todas las constantes usan `as const` para inmutabilidad
- **Tipadas:** TypeScript proporciona autocompletado y verificación de tipos
- **Organizadas:** Agrupadas por funcionalidad para fácil mantenimiento
- **Documentadas:** Cada grupo tiene comentarios explicativos
- **Optimizadas:** Solo se mantienen las constantes que se usan activamente

Estas constantes proporcionan una configuración centralizada y consistente para el sistema Cast, manteniendo solo los valores que se utilizan realmente en el código.
