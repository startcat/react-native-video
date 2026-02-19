# Especificación Técnica: Migrar códigos de error de PlayerError a createAnalyticsError/createHandlerError

> Generado a partir de task.md el 2026-02-19

## Resumen

Reemplazar el uso de `PlayerError` en los archivos del sistema de analytics y sus handlers por las factories de errores del paquete externo (`createAnalyticsError` y `createHandlerError`), y resolver el impacto en el tipo del callback `onInternalError`.

---

## 1. Alcance

### Módulos afectados

**Directos:**

- `src/player/core/events/VideoEventsAdapter.ts` — usa `PlayerError` para inicialización
- `src/player/core/events/hooks/useVideoAnalytics.ts` — usa `PlayerError` para ~20 códigos de handler
- `src/player/core/events/types/index.ts` — define `onInternalError?: (error: PlayerError) => void`
- `src/player/flavours/audio/index.tsx` — `handleOnInternalError` tipado como `(error: PlayerError)` (línea 1089)
- `src/player/flavours/normal/index.tsx` — `handleOnInternalError` tipado como `(error: PlayerError)` (línea 1907)

**Descartados (usan `PlayerError` para errores NO-analytics):**

- `src/player/core/events/handlers/ErrorEventsHandler.ts` — usa `PLAYER_ERROR_PROCESSING_ERROR` (error propio, no del mapeo)
- `src/player/core/events/handlers/PlaybackEventsHandler.ts` — usa `PLAYER_SEEK_TRACKING_ERROR` (error propio, no del mapeo)

**Indirectos:**

- Cualquier consumidor del hook `useVideoAnalytics` que maneje `onInternalError` — el tipo del error recibido puede cambiar según la decisión de API

### Dependencias impactadas

**Externas (nueva fuente de errores):**

- `@overon/react-native-overon-player-analytics-plugins@^0.2.0` — exporta `createAnalyticsError`, `createHandlerError`
- `@overon/react-native-overon-errors@^0.1.1` — exporta `BaseError` (clase base de los errores del paquete externo)

**Internas (dejan de usarse para errores de analytics):**

- `src/player/core/errors` — `PlayerError` deja de usarse en los archivos migrados (para errores de analytics; puede mantenerse para otros errores no relacionados)

### Archivos de configuración

- Ninguno

---

## 2. Contratos

### Cambios en API pública

| Elemento                                                  | Tipo de cambio                  | Antes                          | Después                                                       |
| --------------------------------------------------------- | ------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| `onInternalError` en `UseVideoAnalyticsProps`             | **Decisión pendiente** (ver §4) | `(error: PlayerError) => void` | Opción A: sin cambio / Opción B: `(error: BaseError) => void` |
| Errores lanzados internamente por `PlayerAnalyticsEvents` | Fuente cambia                   | `PlayerError`                  | `BaseError` (vía `createAnalyticsError`)                      |
| Errores lanzados internamente por handlers                | Fuente cambia                   | `PlayerError`                  | `BaseError` (vía `createHandlerError`)                        |

### Decisión de API: tipo de `onInternalError`

**Opción A — Mantener `PlayerError` (recomendada para esta tarea):**

El hook `useVideoAnalytics` envuelve el error externo en un `PlayerError` antes de llamar al callback. Preserva la API pública sin breaking change. Desventaja: introduce una capa de wrapping que se eliminará en una tarea futura.

```typescript
// En useVideoAnalytics.ts, al capturar un error del paquete externo:
onInternalError?.(
	new PlayerError("PLAYER_EVENT_HANDLER_INITIALIZATION_FAILED", {
		originalError: error,
	})
);
```

**Opción B — Cambiar a `BaseError` (más limpio, breaking change):**

Actualizar el tipo del callback a `(error: BaseError) => void`. Requiere que los consumidores del hook actualicen sus handlers.

```typescript
// En types/index.ts:
import type { BaseError } from "@overon/react-native-overon-player-analytics-plugins";
onInternalError?: (error: BaseError) => void;
```

**Decisión adoptada en este spec: Opción B** — la migración es el momento correcto para limpiar el tipo. Los consumidores del hook son internos al repositorio y controlados. El wrapping de la Opción A introduce deuda técnica inmediata.

### Mapeo de errores

#### Analytics (createAnalyticsError)

| PlayerError (actual)                      | createAnalyticsError (nuevo) | Contexto                     |
| ----------------------------------------- | ---------------------------- | ---------------------------- |
| `PLAYER_ANALYTICS_PLUGIN_CREATION_FAILED` | `PLUGIN_CREATION_FAILED`     | `{ pluginName }`             |
| `PLAYER_ANALYTICS_PLUGIN_EXECUTION_ERROR` | `PLUGIN_EXECUTION_ERROR`     | `{ pluginName, methodName }` |
| `PLAYER_ANALYTICS_PLUGIN_DESTROY_ERROR`   | `PLUGIN_DESTROY_ERROR`       | `{ pluginName }`             |

#### Handlers (createHandlerError)

| PlayerError (actual)                                 | createHandlerError (nuevo)      |
| ---------------------------------------------------- | ------------------------------- |
| `PLAYER_EVENT_HANDLER_INITIALIZATION_FAILED`         | `INITIALIZATION_FAILED`         |
| `PLAYER_EVENT_HANDLER_LOAD_START_FAILED`             | `LOAD_START_FAILED`             |
| `PLAYER_EVENT_HANDLER_LOAD_FAILED`                   | `LOAD_FAILED`                   |
| `PLAYER_EVENT_HANDLER_PROGRESS_FAILED`               | `PROGRESS_FAILED`               |
| `PLAYER_EVENT_HANDLER_PLAYBACK_STATE_CHANGED_FAILED` | `PLAYBACK_STATE_CHANGED_FAILED` |
| `PLAYER_EVENT_HANDLER_BUFFER_FAILED`                 | `BUFFER_FAILED`                 |
| `PLAYER_EVENT_HANDLER_SEEK_FAILED`                   | `SEEK_FAILED`                   |
| `PLAYER_EVENT_HANDLER_PLAYBACK_RATE_CHANGE_FAILED`   | `PLAYBACK_RATE_CHANGE_FAILED`   |
| `PLAYER_EVENT_HANDLER_VOLUME_CHANGE_FAILED`          | `VOLUME_CHANGE_FAILED`          |
| `PLAYER_EVENT_HANDLER_END_FAILED`                    | `END_FAILED`                    |
| `PLAYER_EVENT_HANDLER_ERROR_FAILED`                  | `ERROR_FAILED`                  |
| `PLAYER_EVENT_HANDLER_RECEIVE_AD_EVENT_FAILED`       | `RECEIVE_AD_EVENT_FAILED`       |
| `PLAYER_EVENT_HANDLER_AUDIO_TRACKS_FAILED`           | `AUDIO_TRACKS_FAILED`           |
| `PLAYER_EVENT_HANDLER_TEXT_TRACKS_FAILED`            | `TEXT_TRACKS_FAILED`            |
| `PLAYER_EVENT_HANDLER_VIDEO_TRACKS_FAILED`           | `VIDEO_TRACKS_FAILED`           |
| `PLAYER_EVENT_HANDLER_BANDWIDTH_UPDATE_FAILED`       | `BANDWIDTH_UPDATE_FAILED`       |
| `PLAYER_EVENT_HANDLER_ASPECT_RATIO_FAILED`           | `ASPECT_RATIO_FAILED`           |
| `PLAYER_EVENT_HANDLER_TIMED_METADATA_FAILED`         | `TIMED_METADATA_FAILED`         |
| `PLAYER_EVENT_HANDLER_READY_FOR_DISPLAY_FAILED`      | `READY_FOR_DISPLAY_FAILED`      |
| `PLAYER_EVENT_HANDLER_AUDIO_BECOMING_NOISY_FAILED`   | `AUDIO_BECOMING_NOISY_FAILED`   |
| `PLAYER_EVENT_HANDLER_IDLE_FAILED`                   | `IDLE_FAILED`                   |

### Cambios en tipos/interfaces

**`UseVideoAnalyticsProps.onInternalError` (Opción B):**

```typescript
// Antes (src/player/core/events/types/index.ts):
import type { PlayerError } from "../../errors";
onInternalError?: (error: PlayerError) => void;

// Después:
import type { BaseError } from "@overon/react-native-overon-player-analytics-plugins";
onInternalError?: (error: BaseError) => void;
```

### Cambios en eventos/callbacks

- `onInternalError`: el tipo del error recibido cambia de `PlayerError` a `BaseError` (si se adopta Opción B)

---

## 3. Flujo de datos

### Estado global afectado

Ninguno — cambio en el tipo de errores lanzados, sin efecto en estado de runtime.

### Persistencia

- Sin impacto

### Comunicación entre módulos

- `useVideoAnalytics` → consumidor: el callback `onInternalError` recibirá `BaseError` en lugar de `PlayerError`. `BaseError` extiende `Error` nativo, por lo que el comportamiento de `instanceof Error` se preserva.

---

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change                                                                                                                           | Severidad | Mitigación                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `onInternalError` recibe `BaseError` en lugar de `PlayerError` (Opción B)                                                                 | Media     | Los consumidores son internos al repo — se pueden actualizar en la misma tarea. Si hay consumidores externos, usar Opción A temporalmente |
| `VideoEventsAdapter.ts` puede usar `PlayerError` para errores no-analytics — eliminar el import prematuramente rompería esos usos         | Alta      | Verificar con grep antes de eliminar el import de `PlayerError`                                                                           |
| Los handlers `ErrorEventsHandler` y `PlaybackEventsHandler` usan `PlayerError` — verificar si es para errores de analytics o de otro tipo | Media     | Verificar con grep antes de implementar                                                                                                   |

### Impacto en rendimiento

- Ninguno — cambio en la construcción de objetos de error, sin impacto en el hot path

### Casos edge problemáticos

- **`VideoEventsAdapter.ts`**: el task.md indica que usa `PlayerError` para `INITIALIZATION_FAILED`, pero también puede tener otros usos no relacionados con analytics. Si se elimina el import de `PlayerError` sin verificar, se romperán esos usos.
- **Handlers con `PlayerError` mixto**: `ErrorEventsHandler` y `PlaybackEventsHandler` importan `PlayerError` — puede ser para errores de analytics o para errores propios del handler. Requiere verificación antes de implementar.
- **`PLAYER_SEEK_TRACKING_ERROR`** en `PlaybackEventsHandler`: este código no está en el mapeo del task.md — es un error propio del handler, no de analytics. El import de `PlayerError` debe mantenerse para este caso.

---

## 5. Estrategias

### Testing

- **Unitarios**: no aplica (sin suite de tests)
- **Integración**: no aplica
- **E2E**: no aplica
- **Manual**: `yarn tsc --noEmit` sin nuevos errores; `grep -n "PLAYER_ANALYTICS_PLUGIN\|PLAYER_EVENT_HANDLER" src/player/core/events/` sin resultados

### Rollback

1. `git revert HEAD` o `git checkout -- <archivos modificados>`
2. Verificar que `yarn tsc --noEmit` sigue pasando

### Migración de datos

- **¿Necesaria?**: No
- **Estrategia**: N/A
- **Reversible**: Sí

---

## 6. Complejidad estimada

- **Nivel**: Media
- **Justificación**: ~21 sustituciones de código de error en 2-3 archivos principales, más la decisión de tipo en `onInternalError`. El riesgo está en no eliminar `PlayerError` donde aún se necesita para errores no-analytics.
- **Tiempo estimado**: 30-60 minutos

---

## 7. Preguntas sin resolver

### Técnicas

- [x] **¿Usa `VideoEventsAdapter.ts` `PlayerError` para algo más allá de `INITIALIZATION_FAILED`?** ✅ Solo 2 instancias, ambas `PLAYER_EVENT_HANDLER_INITIALIZATION_FAILED` — el import puede eliminarse completamente
- [x] **¿Usan los handlers `PlayerError` para errores no-analytics?** ✅ Sí: `ErrorEventsHandler` usa `PLAYER_ERROR_PROCESSING_ERROR` y `PlaybackEventsHandler` usa `PLAYER_SEEK_TRACKING_ERROR` — ambos quedan fuera del scope
- [x] **¿Hay consumidores externos de `onInternalError`?** ✅ Sí: `flavours/audio/index.tsx:1089` y `flavours/normal/index.tsx:1907` tipifican `handleOnInternalError` como `(error: PlayerError)` — deben actualizarse si se adopta Opción B
- [x] **¿`createHandlerError` y `createAnalyticsError` exportados desde el índice principal?** ✅ Sí: exportados vía `export * from "./errors"` → `export * from "./types"` en el paquete externo

### De negocio

- No aplica.

### De rendimiento

- No aplica.

---

## Aprobación

- [ ] Spec revisado
- [ ] Decisión sobre `onInternalError` (Opción A vs B) confirmada
- [ ] Listo para verificación de baseline
