# Tarea 03: Migrar códigos de error de PlayerError a createAnalyticsError

## Objetivo

Reemplazar el uso de `PlayerError` (sistema de errores interno del player) por `createAnalyticsError` y `createHandlerError` del paquete externo `@overon/react-native-overon-player-analytics-plugins` en todos los archivos del sistema de analytics y sus handlers.

## Contexto

### Sistema de errores actual (interno)

Los archivos de analytics y handlers usan `PlayerError` con códigos específicos:

```typescript
import { PlayerError } from "../../core/errors";

// En PlayerAnalyticsEvents.ts (interno):
throw new PlayerError("PLAYER_ANALYTICS_PLUGIN_CREATION_FAILED", { pluginName, originalError });
throw new PlayerError("PLAYER_ANALYTICS_PLUGIN_EXECUTION_ERROR", { pluginName, originalError });
throw new PlayerError("PLAYER_ANALYTICS_PLUGIN_DESTROY_ERROR", { pluginName, originalError });

// En useVideoAnalytics.ts:
throw new PlayerError("PLAYER_EVENT_HANDLER_INITIALIZATION_FAILED", { originalError });
throw new PlayerError("PLAYER_EVENT_HANDLER_LOAD_START_FAILED", { originalError });
throw new PlayerError("PLAYER_EVENT_HANDLER_LOAD_FAILED", { originalError });
// ... (18 códigos de error de handlers)

// En VideoEventsAdapter.ts:
throw new PlayerError("PLAYER_EVENT_HANDLER_INITIALIZATION_FAILED");
```

### Sistema de errores del paquete externo

El paquete externo tiene dos factories de errores:

```typescript
import { createAnalyticsError, createHandlerError } from "@overon/react-native-overon-player-analytics-plugins";

// createAnalyticsError — para errores del sistema de plugins:
createAnalyticsError("PLUGIN_CREATION_FAILED", { context: { pluginName }, originalError });
createAnalyticsError("PLUGIN_EXECUTION_ERROR", { context: { pluginName, methodName }, originalError });
createAnalyticsError("PLUGIN_DESTROY_ERROR", { context: { pluginName }, originalError });

// createHandlerError — para errores de handlers de eventos:
createHandlerError("INITIALIZATION_FAILED", { originalError });
createHandlerError("LOAD_START_FAILED", { originalError });
createHandlerError("LOAD_FAILED", { originalError });
createHandlerError("PROGRESS_FAILED", { originalError });
// ... etc.
```

## Mapeo de códigos de error

### Errores de analytics (PlayerError → createAnalyticsError)

| Código PlayerError (actual) | Código createAnalyticsError (nuevo) | Archivo |
|---|---|---|
| `PLAYER_ANALYTICS_PLUGIN_CREATION_FAILED` | `PLUGIN_CREATION_FAILED` | `VideoEventsAdapter.ts`, handlers |
| `PLAYER_ANALYTICS_PLUGIN_EXECUTION_ERROR` | `PLUGIN_EXECUTION_ERROR` | handlers |
| `PLAYER_ANALYTICS_PLUGIN_DESTROY_ERROR` | `PLUGIN_DESTROY_ERROR` | handlers |

### Errores de handlers (PlayerError → createHandlerError)

| Código PlayerError (actual) | Código createHandlerError (nuevo) | Archivo |
|---|---|---|
| `PLAYER_EVENT_HANDLER_INITIALIZATION_FAILED` | `INITIALIZATION_FAILED` | `VideoEventsAdapter.ts`, `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_LOAD_START_FAILED` | `LOAD_START_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_LOAD_FAILED` | `LOAD_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_PROGRESS_FAILED` | `PROGRESS_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_PLAYBACK_STATE_CHANGED_FAILED` | `PLAYBACK_STATE_CHANGED_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_BUFFER_FAILED` | `BUFFER_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_SEEK_FAILED` | `SEEK_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_PLAYBACK_RATE_CHANGE_FAILED` | `PLAYBACK_RATE_CHANGE_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_VOLUME_CHANGE_FAILED` | `VOLUME_CHANGE_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_END_FAILED` | `END_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_ERROR_FAILED` | `ERROR_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_RECEIVE_AD_EVENT_FAILED` | `RECEIVE_AD_EVENT_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_AUDIO_TRACKS_FAILED` | `AUDIO_TRACKS_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_TEXT_TRACKS_FAILED` | `TEXT_TRACKS_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_VIDEO_TRACKS_FAILED` | `VIDEO_TRACKS_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_BANDWIDTH_UPDATE_FAILED` | `BANDWIDTH_UPDATE_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_ASPECT_RATIO_FAILED` | `ASPECT_RATIO_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_TIMED_METADATA_FAILED` | `TIMED_METADATA_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_READY_FOR_DISPLAY_FAILED` | `READY_FOR_DISPLAY_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_AUDIO_BECOMING_NOISY_FAILED` | `AUDIO_BECOMING_NOISY_FAILED` | `useVideoAnalytics.ts` |
| `PLAYER_EVENT_HANDLER_IDLE_FAILED` | `IDLE_FAILED` | `useVideoAnalytics.ts` |

## Archivos a modificar

### 1. `src/player/core/events/VideoEventsAdapter.ts`

- Eliminar import de `PlayerError` (si solo se usa para analytics)
- Añadir import de `createHandlerError` y/o `createAnalyticsError`
- Reemplazar `new PlayerError("PLAYER_EVENT_HANDLER_INITIALIZATION_FAILED")` por `createHandlerError("INITIALIZATION_FAILED")`

**Atención:** Verificar si `PlayerError` se usa también para errores no-analytics en este archivo. Si es así, mantener el import de `PlayerError` solo para esos casos.

### 2. `src/player/core/events/hooks/useVideoAnalytics.ts`

- Eliminar import de `PlayerError`
- Añadir import de `createHandlerError` desde el paquete externo
- Reemplazar todos los `new PlayerError("PLAYER_EVENT_HANDLER_*")` por `createHandlerError("*")`

**Nota sobre `onInternalError`:** El callback `onInternalError` recibe actualmente un `PlayerError`. Después de la migración recibirá un `BaseError` (del paquete `@overon/react-native-overon-errors`). Verificar si el tipo del callback necesita actualizarse en `UseVideoAnalyticsProps`.

### 3. `src/player/core/events/handlers/*.ts` (6 handlers)

Para cada handler, verificar si usa `PlayerError` para errores de analytics y reemplazar por `createAnalyticsError` o `createHandlerError` según corresponda.

## Consideración importante: tipo de onInternalError

El hook `useVideoAnalytics` tiene:
```typescript
interface UseVideoAnalyticsProps {
  plugins?: PlayerAnalyticsPlugin[];
  onInternalError?: (error: PlayerError) => void;
}
```

Después de la migración, los errores lanzados serán `BaseError` (de `@overon/react-native-overon-errors`), no `PlayerError`. Hay dos opciones:

**Opción A (recomendada):** Mantener `PlayerError` en el tipo del callback pero hacer que `useVideoAnalytics` envuelva el error externo en un `PlayerError` antes de llamar al callback. Esto preserva la API pública del hook.

**Opción B:** Cambiar el tipo del callback a `BaseError | PlayerError` o `Error`. Esto rompe la API pública pero es más limpio.

Decidir cuál opción aplicar durante `/spec` y documentarlo.

## Verificación

### Antes de implementar (`/verify`)

```bash
# Ver todos los usos de PlayerError en archivos de analytics/events
grep -n "PlayerError" \
  src/player/core/events/VideoEventsAdapter.ts \
  src/player/core/events/hooks/useVideoAnalytics.ts \
  src/player/core/events/handlers/*.ts
```

### Después de implementar

```bash
# Verificar que no quedan PlayerError en los archivos migrados
grep -n "PLAYER_ANALYTICS_PLUGIN\|PLAYER_EVENT_HANDLER" \
  src/player/core/events/VideoEventsAdapter.ts \
  src/player/core/events/hooks/useVideoAnalytics.ts \
  src/player/core/events/handlers/*.ts

# TypeScript check
yarn tsc --noEmit
```

## Criterios de aceptación

- [ ] `VideoEventsAdapter.ts` usa `createHandlerError` para errores de inicialización
- [ ] `useVideoAnalytics.ts` usa `createHandlerError` para todos los errores de handlers
- [ ] Los 6 handlers usan `createAnalyticsError` o `createHandlerError` según corresponda
- [ ] La decisión sobre el tipo de `onInternalError` está documentada e implementada
- [ ] `yarn tsc --noEmit` pasa sin errores
- [ ] Los códigos de error del sistema `PlayerError` relacionados con analytics pueden eliminarse en una tarea futura de limpieza del sistema de errores del player

## Notas

- Los códigos `PLAYER_ANALYTICS_PLUGIN_*` y `PLAYER_EVENT_HANDLER_*` en `PLAYER_ERROR_DEFINITIONS` del sistema de errores interno pueden quedar obsoletos tras esta migración. No eliminarlos en esta tarea — se hará en una tarea de limpieza separada para no mezclar responsabilidades.
- El paquete externo usa `@overon/react-native-overon-errors` que exporta `BaseError`. Esta clase es la base de todos los errores del ecosistema Overon.
