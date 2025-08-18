# Utilidades Cast - castUtils.ts

Este documento describe las utilidades disponibles en el archivo `castUtils.ts` para el manejo y procesamiento de contenido Cast.

## Índice

- [Validación](#validación)
- [Comparación de Contenido](#comparación-de-contenido)
- [Formateo de Tiempo](#formateo-de-tiempo)
- [Tipo de Contenido](#tipo-de-contenido)
- [Estado del Reproductor](#estado-del-reproductor)
- [Información de Progreso](#información-de-progreso)
- [Conectividad Cast](#conectividad-cast)
- [Cálculos](#cálculos)
- [Utilidades Generales](#utilidades-generales)
- [Control de Flujo](#control-de-flujo)

---

## Validación

### `isValidUrl(url: string): boolean`

Valida si una URL es válida para Cast.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                        |
|-----------|----------|-------------|------------------------------------|
| `url`     | `string` | ✅          | URL a validar                      |

**Retorna:** `boolean` - `true` si la URL es válida (HTTP/HTTPS), `false` en caso contrario

**Ejemplo:**
```typescript
const isValid = isValidUrl('https://example.com/video.mp4'); // true
const isInvalid = isValidUrl('invalid-url'); // false
```

### `isValidSource(source: any): boolean`

Valida si un objeto es un source válido.

**Parámetros:**
| Parámetro | Tipo  | Obligatorio | Descripción                     |
|-----------|-------|-------------|---------------------------------|
| `source`  | `any` | ✅          | Objeto source a validar         |

**Retorna:** `boolean` - `true` si el source es válido

### `isValidMetadata(metadata: any): boolean`

Valida si metadata es válida.

**Parámetros:**
| Parámetro  | Tipo  | Obligatorio | Descripción                     |
|------------|-------|-------------|---------------------------------|
| `metadata` | `any` | ✅          | Objeto metadata a validar       |

**Retorna:** `boolean` - `true` si la metadata es válida

---

## Comparación de Contenido

### `compareContent(current: CastContentInfo, newConfig: CastMessageConfig): ContentComparisonResult`

Compara contenido actual con nuevo contenido para determinar si necesita recarga.

**Parámetros:**
| Parámetro   | Tipo                   | Obligatorio | Descripción                           |
|-------------|------------------------|-------------|---------------------------------------|
| `current`   | `CastContentInfo`      | ✅          | Información del contenido actual      |
| `newConfig` | `CastMessageConfig`    | ✅          | Configuración del nuevo contenido     |

**Retorna:** `ContentComparisonResult` con las siguientes propiedades:
| Propiedad           | Tipo      | Descripción                                    |
|---------------------|-----------|------------------------------------------------|
| `isSameContent`     | `boolean` | Si es el mismo contenido                       |
| `isSameUrl`         | `boolean` | Si es la misma URL                             |
| `isSameStartPosition` | `boolean` | Si es la misma posición de inicio            |
| `needsReload`       | `boolean` | Si necesita recarga                            |
| `reason?`           | `string`  | Razón de la diferencia (opcional)              |

**Ejemplo:**
```typescript
const result = compareContent(currentContent, newConfig);
if (result.needsReload) {
  console.log(`Recarga necesaria: ${result.reason}`);
}
```

### `normalizeUrl(url: string): string`

Normaliza URL para comparación removiendo parámetros que no afectan el contenido.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                     |
|-----------|----------|-------------|---------------------------------|
| `url`     | `string` | ✅          | URL a normalizar                |

**Retorna:** `string` - URL normalizada

---

## Formateo de Tiempo

### `formatDuration(seconds: number): string`

Formatea duración en segundos a formato legible.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                     |
|-----------|----------|-------------|---------------------------------|
| `seconds` | `number` | ✅          | Duración en segundos            |

**Retorna:** `string` - Tiempo formateado (MM:SS o HH:MM:SS)

**Ejemplo:**
```typescript
formatDuration(125); // "02:05"
formatDuration(3665); // "01:01:05"
```

### `formatTime(seconds: number): string`

Alias de `formatDuration`. Formatea tiempo en segundos a formato legible.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                     |
|-----------|----------|-------------|---------------------------------|
| `seconds` | `number` | ✅          | Tiempo en segundos              |

**Retorna:** `string` - Tiempo formateado

### `timeStringToSeconds(timeString: string): number`

Convierte tiempo en formato HH:MM:SS a segundos.

**Parámetros:**
| Parámetro    | Tipo     | Obligatorio | Descripción                           |
|--------------|----------|-------------|---------------------------------------|
| `timeString` | `string` | ✅          | Tiempo en formato HH:MM:SS, MM:SS o SS |

**Retorna:** `number` - Tiempo en segundos

**Ejemplo:**
```typescript
timeStringToSeconds("01:30:25"); // 5425
timeStringToSeconds("05:30"); // 330
timeStringToSeconds("45"); // 45
```

---

## Tipo de Contenido

### `getContentTypeFromInfo(content: CastContentInfo): enums.CastContentType`

Obtiene tipo de contenido desde CastContentInfo.

**Parámetros:**
| Parámetro | Tipo              | Obligatorio | Descripción                     |
|-----------|-------------------|-------------|---------------------------------|
| `content` | `CastContentInfo` | ✅          | Información del contenido       |

**Retorna:** `enums.CastContentType` - Tipo de contenido (VOD, LIVE, DVR)

### `getContentTypeFromMetadata(metadata: any): enums.CastContentType`

Obtiene tipo de contenido desde metadata.

**Parámetros:**
| Parámetro  | Tipo  | Obligatorio | Descripción                     |
|------------|-------|-------------|---------------------------------|
| `metadata` | `any` | ✅          | Metadata del contenido          |

**Retorna:** `enums.CastContentType` - Tipo de contenido (VOD, LIVE, DVR)

---

## Estado del Reproductor

### `getReadableState(state: string): string`

Obtiene información de estado legible en castellano.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                     |
|-----------|----------|-------------|---------------------------------|
| `state`   | `string` | ✅          | Estado del reproductor          |

**Retorna:** `string` - Estado en castellano

**Ejemplo:**
```typescript
getReadableState('PLAYING'); // "Reproduciendo"
getReadableState('PAUSED'); // "Pausado"
getReadableState('BUFFERING'); // "Cargando"
```

### `isActivePlayback(state: string): boolean`

Verifica si un estado indica reproducción activa.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                     |
|-----------|----------|-------------|---------------------------------|
| `state`   | `string` | ✅          | Estado del reproductor          |

**Retorna:** `boolean` - `true` si está reproduciendo activamente

### `isPausedPlayback(state: string): boolean`

Verifica si un estado indica contenido pausado.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                     |
|-----------|----------|-------------|---------------------------------|
| `state`   | `string` | ✅          | Estado del reproductor          |

**Retorna:** `boolean` - `true` si está pausado

### `isBufferingPlayback(state: string): boolean`

Verifica si un estado indica buffering.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                     |
|-----------|----------|-------------|---------------------------------|
| `state`   | `string` | ✅          | Estado del reproductor          |

**Retorna:** `boolean` - `true` si está cargando/buffering

---

## Información de Progreso

### `extractProgressInfo(mediaStatus: any): object`

Extrae información de progreso desde media status.

**Parámetros:**
| Parámetro     | Tipo  | Obligatorio | Descripción                     |
|---------------|-------|-------------|---------------------------------|
| `mediaStatus` | `any` | ✅          | Estado de media del Cast        |

**Retorna:** Objeto con:
| Propiedad     | Tipo      | Descripción                          |
|---------------|-----------|--------------------------------------|
| `currentTime` | `number`  | Tiempo actual en segundos            |
| `duration`    | `number`  | Duración total en segundos           |
| `progress`    | `number`  | Progreso como decimal (0-1)          |
| `isBuffering` | `boolean` | Si está cargando                     |
| `isPaused`    | `boolean` | Si está pausado                      |

---

## Conectividad Cast

### `getCastConnectivityInfo(castState: string): object`

Obtiene información de conectividad Cast.

**Parámetros:**
| Parámetro   | Tipo     | Obligatorio | Descripción                     |
|-------------|----------|-------------|---------------------------------|
| `castState` | `string` | ✅          | Estado de conectividad Cast     |

**Retorna:** Objeto con:
| Propiedad       | Tipo      | Descripción                          |
|-----------------|-----------|--------------------------------------|
| `isConnected`   | `boolean` | Si está conectado                    |
| `isConnecting`  | `boolean` | Si está conectando                   |
| `isDisconnected`| `boolean` | Si está desconectado                 |
| `statusText`    | `string`  | Texto descriptivo del estado         |

**Ejemplo:**
```typescript
const info = getCastConnectivityInfo('CONNECTED');
// { isConnected: true, isConnecting: false, isDisconnected: false, statusText: 'Conectado' }
```

---

## Cálculos

### `calculateProgress(currentTime: number, duration: number): number`

Calcula porcentaje de progreso.

**Parámetros:**
| Parámetro     | Tipo     | Obligatorio | Descripción                     |
|---------------|----------|-------------|---------------------------------|
| `currentTime` | `number` | ✅          | Tiempo actual en segundos       |
| `duration`    | `number` | ✅          | Duración total en segundos      |

**Retorna:** `number` - Progreso como decimal entre 0 y 1

### `calculateRemainingTime(currentTime: number, duration: number): number`

Calcula tiempo restante.

**Parámetros:**
| Parámetro     | Tipo     | Obligatorio | Descripción                     |
|---------------|----------|-------------|---------------------------------|
| `currentTime` | `number` | ✅          | Tiempo actual en segundos       |
| `duration`    | `number` | ✅          | Duración total en segundos      |

**Retorna:** `number` - Tiempo restante en segundos

### `timesAreEqual(time1: number, time2: number, tolerance?: number): boolean`

Verifica si dos tiempos son aproximadamente iguales.

**Parámetros:**
| Parámetro   | Tipo     | Obligatorio | Descripción                           |
|-------------|----------|-------------|---------------------------------------|
| `time1`     | `number` | ✅          | Primer tiempo                         |
| `time2`     | `number` | ✅          | Segundo tiempo                        |
| `tolerance` | `number` | ❌          | Tolerancia en segundos (por defecto: 1) |

**Retorna:** `boolean` - `true` si los tiempos son aproximadamente iguales

---

## Utilidades Generales

### `clamp(value: number, min: number, max: number): number`

Restringe un valor entre un mínimo y máximo.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                     |
|-----------|----------|-------------|---------------------------------|
| `value`   | `number` | ✅          | Valor a restringir              |
| `min`     | `number` | ✅          | Valor mínimo                    |
| `max`     | `number` | ✅          | Valor máximo                    |

**Retorna:** `number` - Valor restringido entre min y max

**Ejemplo:**
```typescript
clamp(15, 0, 10); // 10
clamp(-5, 0, 10); // 0
clamp(5, 0, 10); // 5
```

---

## Control de Flujo

### `debounce<T>(func: T, wait: number): (...args: Parameters<T>) => void`

Función debounce que retrasa la ejecución hasta que hayan pasado los milisegundos especificados.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                              |
|-----------|----------|-------------|------------------------------------------|
| `func`    | `T`      | ✅          | Función a ejecutar con debounce          |
| `wait`    | `number` | ✅          | Tiempo de espera en milisegundos         |

**Retorna:** Función debounced

**Ejemplo:**
```typescript
const debouncedSearch = debounce((query: string) => {
  console.log('Searching:', query);
}, 300);

debouncedSearch('hello'); // Se ejecutará después de 300ms
```

### `throttle<T>(func: T, limit: number): (...args: Parameters<T>) => void`

Función throttle que limita la ejecución a una vez por período especificado.

**Parámetros:**
| Parámetro | Tipo     | Obligatorio | Descripción                              |
|-----------|----------|-------------|------------------------------------------|
| `func`    | `T`      | ✅          | Función a ejecutar con throttle          |
| `limit`   | `number` | ✅          | Límite de tiempo en milisegundos         |

**Retorna:** Función throttled

**Ejemplo:**
```typescript
const throttledHandler = throttle((event) => {
  console.log('Handling event:', event);
}, 100);

// Se ejecutará máximo una vez cada 100ms
throttledHandler(event1);
throttledHandler(event2);
```

---

## Notas de Uso

### Tipos Importados

El archivo importa los siguientes tipos desde el sistema consolidado:

```typescript
import { CONTENT_COMPARISON_TOLERANCE } from '../constants';
import {
    CastContentInfo,
    CastMessageConfig,
    ContentComparisonResult
} from '../types';
import * as enums from '../types/enums';
```

### Constantes

- `CONTENT_COMPARISON_TOLERANCE`: Tolerancias para comparación de contenido
- `enums.CastContentType`: Enum para tipos de contenido (VOD, LIVE, DVR)

### Casos de Uso Comunes

1. **Validación de contenido:**
   ```typescript
   if (isValidUrl(source.uri) && isValidSource(source)) {
     // Proceder con Cast
   }
   ```

2. **Comparación antes de cambio:**
   ```typescript
   const comparison = compareContent(currentContent, newConfig);
   if (!comparison.needsReload) {
     // Continuar reproducción actual
   }
   ```

3. **Formateo de tiempo para UI:**
   ```typescript
   const timeDisplay = formatDuration(currentTime);
   const progressPercent = calculateProgress(currentTime, duration) * 100;
   ```

4. **Control de eventos:**
   ```typescript
   const debouncedSeek = debounce(seekTo, 500);
   const throttledProgress = throttle(updateProgress, 1000);
   ```

Estas utilidades proporcionan una base sólida para el manejo de contenido Cast, validación, formateo y control de flujo en aplicaciones React Native.
