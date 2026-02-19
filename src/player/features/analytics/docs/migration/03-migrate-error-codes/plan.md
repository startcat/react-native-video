# Plan de Implementación: Migrar códigos de error a createAnalyticsError/createHandlerError

> Basado en spec.md | Generado el 2026-02-19

## Resumen ejecutivo

- **Objetivo**: Reemplazar `PlayerError` por `createHandlerError` en `VideoEventsAdapter` y `useVideoAnalytics`, y actualizar el tipo de `onInternalError` a `BaseError` en `types/index.ts` y los dos flavours
- **Fases**: 3
- **Estimación**: 30-45 minutos
- **Riesgo general**: Bajo-Medio (breaking change controlado en `onInternalError`)

## Pre-requisitos

- [x] `@overon/react-native-overon-player-analytics-plugins` instalado en `node_modules`
- [x] `createHandlerError`, `createAnalyticsError`, `BaseError` exportados desde el índice principal del paquete
- [x] Baseline TypeScript estable
- [x] Branch de trabajo activo (`refactor_plugins`)

---

## Fases de implementación

### Fase 1: Migrar VideoEventsAdapter.ts (2 instancias)

**Objetivo**: Reemplazar los 2 usos de `PlayerError` por `createHandlerError` y eliminar el import de `PlayerError`.

**Archivos a modificar**:

- `src/player/core/events/VideoEventsAdapter.ts`

**Cambios específicos**:

1. Eliminar `import { PlayerError } from "../../core/errors";`
2. Añadir `import { createHandlerError } from "@overon/react-native-overon-player-analytics-plugins";`
3. Línea 55: `throw new PlayerError("PLAYER_EVENT_HANDLER_INITIALIZATION_FAILED")` → `throw createHandlerError("INITIALIZATION_FAILED")`
4. Línea 69: `throw new PlayerError("PLAYER_EVENT_HANDLER_INITIALIZATION_FAILED", { originalError: error })` → `throw createHandlerError("INITIALIZATION_FAILED", { originalError: error })`

**Invariantes**:

- El comportamiento de throw/catch no cambia — `BaseError` extiende `Error`

**Punto de verificación**:

```bash
grep -n "PlayerError" src/player/core/events/VideoEventsAdapter.ts
# Resultado esperado: sin resultados
npx tsc --noEmit --skipLibCheck 2>&1 | grep "VideoEventsAdapter" | head -5
```

**Rollback**: `git checkout -- src/player/core/events/VideoEventsAdapter.ts`

**Estimación**: 5 minutos

---

### Fase 2: Migrar useVideoAnalytics.ts (21 instancias)

**Objetivo**: Reemplazar los 21 usos de `PlayerError` por `createHandlerError` y eliminar el import de `PlayerError`.

**Archivos a modificar**:

- `src/player/core/events/hooks/useVideoAnalytics.ts`

**Cambios específicos**:

1. Eliminar `import { PlayerError } from "../../errors";`
2. Añadir `import { createHandlerError } from "@overon/react-native-overon-player-analytics-plugins";`
3. Reemplazar cada `new PlayerError("PLAYER_EVENT_HANDLER_X", { originalError: error })` por `createHandlerError("X", { originalError: error })` según el mapeo:

| Antes | Después |
|---|---|
| `PLAYER_EVENT_HANDLER_INITIALIZATION_FAILED` | `INITIALIZATION_FAILED` |
| `PLAYER_EVENT_HANDLER_LOAD_START_FAILED` | `LOAD_START_FAILED` |
| `PLAYER_EVENT_HANDLER_LOAD_FAILED` | `LOAD_FAILED` |
| `PLAYER_EVENT_HANDLER_PROGRESS_FAILED` | `PROGRESS_FAILED` |
| `PLAYER_EVENT_HANDLER_PLAYBACK_STATE_CHANGED_FAILED` | `PLAYBACK_STATE_CHANGED_FAILED` |
| `PLAYER_EVENT_HANDLER_BUFFER_FAILED` | `BUFFER_FAILED` |
| `PLAYER_EVENT_HANDLER_SEEK_FAILED` | `SEEK_FAILED` |
| `PLAYER_EVENT_HANDLER_PLAYBACK_RATE_CHANGE_FAILED` | `PLAYBACK_RATE_CHANGE_FAILED` |
| `PLAYER_EVENT_HANDLER_VOLUME_CHANGE_FAILED` | `VOLUME_CHANGE_FAILED` |
| `PLAYER_EVENT_HANDLER_END_FAILED` | `END_FAILED` |
| `PLAYER_EVENT_HANDLER_ERROR_FAILED` | `ERROR_FAILED` |
| `PLAYER_EVENT_HANDLER_RECEIVE_AD_EVENT_FAILED` | `RECEIVE_AD_EVENT_FAILED` |
| `PLAYER_EVENT_HANDLER_AUDIO_TRACKS_FAILED` | `AUDIO_TRACKS_FAILED` |
| `PLAYER_EVENT_HANDLER_TEXT_TRACKS_FAILED` | `TEXT_TRACKS_FAILED` |
| `PLAYER_EVENT_HANDLER_VIDEO_TRACKS_FAILED` | `VIDEO_TRACKS_FAILED` |
| `PLAYER_EVENT_HANDLER_BANDWIDTH_UPDATE_FAILED` | `BANDWIDTH_UPDATE_FAILED` |
| `PLAYER_EVENT_HANDLER_ASPECT_RATIO_FAILED` | `ASPECT_RATIO_FAILED` |
| `PLAYER_EVENT_HANDLER_TIMED_METADATA_FAILED` | `TIMED_METADATA_FAILED` |
| `PLAYER_EVENT_HANDLER_READY_FOR_DISPLAY_FAILED` | `READY_FOR_DISPLAY_FAILED` |
| `PLAYER_EVENT_HANDLER_AUDIO_BECOMING_NOISY_FAILED` | `AUDIO_BECOMING_NOISY_FAILED` |
| `PLAYER_EVENT_HANDLER_IDLE_FAILED` | `IDLE_FAILED` |

**Nota**: `onInternalError?.(createHandlerError(...))` — el callback recibe `BaseError` directamente (Opción B). El tipo del callback se actualiza en Fase 3.

**Punto de verificación**:

```bash
grep -n "PLAYER_EVENT_HANDLER" src/player/core/events/hooks/useVideoAnalytics.ts
# Resultado esperado: sin resultados
grep -n "PlayerError" src/player/core/events/hooks/useVideoAnalytics.ts
# Resultado esperado: sin resultados
```

**Rollback**: `git checkout -- src/player/core/events/hooks/useVideoAnalytics.ts`

**Estimación**: 15 minutos

---

### Fase 3: Actualizar tipo de onInternalError (Opción B — 3 archivos)

**Objetivo**: Cambiar el tipo del callback `onInternalError` de `PlayerError` a `BaseError` en la definición y en los dos flavours que lo implementan.

**Archivos a modificar**:

- `src/player/core/events/types/index.ts`
- `src/player/flavours/audio/index.tsx`
- `src/player/flavours/normal/index.tsx`

**Cambios específicos**:

1. **`types/index.ts`**:
   - Eliminar `import type { PlayerError } from "../../errors";`
   - Añadir `import type { BaseError } from "@overon/react-native-overon-player-analytics-plugins";`
   - Cambiar `onInternalError?: (error: PlayerError) => void` → `onInternalError?: (error: BaseError) => void`

2. **`flavours/audio/index.tsx` (línea ~1089)**:
   - Cambiar `const handleOnInternalError = (error: PlayerError) => {` → `const handleOnInternalError = (error: BaseError) => {`
   - Añadir import de `BaseError` desde el paquete externo (o desde `@overon/react-native-overon-errors`)

3. **`flavours/normal/index.tsx` (línea ~1907)**:
   - Mismo cambio que en audio

**Punto de verificación**:

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "onInternalError|handleOnInternalError|BaseError" | head -10
# Resultado esperado: sin errores relacionados
grep -n "PlayerError" src/player/core/events/types/index.ts
# Resultado esperado: sin resultados
```

**Rollback**: `git checkout -- src/player/core/events/types/index.ts src/player/flavours/audio/index.tsx src/player/flavours/normal/index.tsx`

**Estimación**: 10 minutos

---

## Orden de ejecución

```
┌──────────────────────────────────────────────┐
│ Fase 1: VideoEventsAdapter (2 instancias)    │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│ Fase 2: useVideoAnalytics (21 instancias)    │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│ Fase 3: Tipo onInternalError (3 archivos)    │
│         types/index.ts + audio + normal      │
└──────────────────────────────────────────────┘
```

Las 3 fases son secuenciales — Fase 3 depende de que Fase 2 haya eliminado el uso de `PlayerError` en `useVideoAnalytics`.

## Testing por fase

| Fase | Verificación manual |
|---|---|
| 1 | `grep PlayerError VideoEventsAdapter.ts` → vacío |
| 2 | `grep PLAYER_EVENT_HANDLER useVideoAnalytics.ts` → vacío |
| 3 | `tsc --noEmit --skipLibCheck` sin nuevos errores |

## Checklist pre-implementación

- [x] Spec revisado y aprobado (Opción B confirmada)
- [x] Baseline verificado sin bloqueos
- [x] Paquete externo instalado
- [x] Mapeo de 21 códigos de error verificado

## Rollback global

```bash
git checkout -- \
  src/player/core/events/VideoEventsAdapter.ts \
  src/player/core/events/hooks/useVideoAnalytics.ts \
  src/player/core/events/types/index.ts \
  src/player/flavours/audio/index.tsx \
  src/player/flavours/normal/index.tsx
```

## Aprobación

- [ ] Plan revisado
- [ ] Listo para implementar
