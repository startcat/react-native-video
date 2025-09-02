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

### Sistema de Errores PlayerError

El sistema Cast utiliza errores estructurados con la clase `PlayerError` en lugar de strings genéricos.

| Código | Valor | Descripción | Cuándo se usa |
|--------|-------|-------------|---------------|
| `CAST_DEVICE_NOT_FOUND` (601) | No hay dispositivo Cast disponible | Al intentar conectar sin dispositivos |
| `CAST_CONNECTION_FAILED` (602) | Falló la conexión al dispositivo Cast | Problemas de red/conexión |
| `CAST_PLAYBACK_INTERRUPTED` (603) | Reproducción Cast interrumpida | Errores durante reproducción |
| `CAST_INVALID_SOURCE` (604) | URI de fuente inválida o faltante | Validación de contenido |
| `CAST_INVALID_MANIFEST` (605) | Manifest inválido o faltante | Validación de contenido |
| `CAST_INVALID_METADATA` (606) | Metadata inválida o faltante | Validación de contenido |
| `CAST_MESSAGE_BUILD_FAILED` (607) | Error al construir mensaje Cast | Construcción de mensaje |
| `CAST_NOT_READY` (608) | Dispositivo no listo para operación | Validación de estado |
| `CAST_OPERATION_FAILED` (609) | Operación Cast falló | Errores generales de operación |

**Estado:** ✅ **Implementado y en uso** - Sistema unificado de errores con contexto detallado.

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

### `LOGGER_CONFIG`

Configuración del Logger integrado para el sistema Cast.

| Propiedad | Tipo | Valor | Descripción |
|-----------|------|-------|-------------|
| `prefix` | `string` | `'📡 Cast Feature'` | Prefijo identificativo con emoji para logs Cast |
| `enabled` | `boolean` | `true` | Habilita/deshabilita logging por defecto |
| `level` | `LogLevel` | `LogLevel.DEBUG` | Nivel de logging usando enum LogLevel |

**Estado:** ✅ **Utilizado activamente** en `CastMessageBuilder.ts` y `useCastManager.ts`

**Características del Logger integrado:**
- ✅ **Prefijo visual:** Emoji 📡 para identificar logs Cast
- ✅ **Niveles tipados:** Usa enum LogLevel en lugar de strings
- ✅ **Timestamps automáticos:** Incluye timestamp en cada log
- ✅ **Instance ID:** Soporte para múltiples instancias
- ✅ **Colores en consola:** Mejora la legibilidad

**Ejemplo:**
```typescript
import { LOGGER_CONFIG } from './constants';
import { Logger, LogLevel } from '../../logger';

// En CastMessageBuilder
this.playerLogger = new Logger({
    enabled: config.enabled ?? LOGGER_CONFIG.enabled,
    prefix: LOGGER_CONFIG.prefix,
    level: config.level ?? LOGGER_CONFIG.level,
    useColors: true,
    includeLevelName: false,
    includeTimestamp: true,
    includeInstanceId: true,
}, this.instanceId);
```

### `LOG_PREFIX`

Prefijo para logs del sistema Cast (legacy).

| Constante    | Valor               | Descripción                              |
|--------------|---------------------|------------------------------------------|
| `LOG_PREFIX` | `'[Cast Manager]'`  | Prefijo para identificar logs Cast (legacy) |

**Estado:** ⚠️ **Deprecado** - Reemplazado por LOGGER_CONFIG.prefix

**Ejemplo:**
```typescript
import { LOG_PREFIX } from './constants';

// En CastMessageBuilder con ComponentLogger
this.currentLogger?.debug(`Building Cast message for ${contentType}`);
this.currentLogger?.info(`Cast message constructed successfully`);
this.currentLogger?.warn(`Missing metadata, using defaults`);
this.currentLogger?.error(`Failed to build Cast message: ${error}`);
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
