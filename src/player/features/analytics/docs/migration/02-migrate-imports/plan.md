# Plan de Implementación: Migrar imports internos al paquete externo

> Basado en spec.md | Generado el 2026-02-19

## Resumen ejecutivo

- **Objetivo**: Reemplazar los 10 imports de `features/analytics` por `@overon/react-native-overon-player-analytics-plugins` y convertir `features/index.ts` en re-export selectivo
- **Fases**: 3
- **Estimación**: 20-40 minutos
- **Riesgo general**: Bajo

## Pre-requisitos

### Dependencias

- [x] `@overon/react-native-overon-player-analytics-plugins` instalado en `node_modules` ✅

### Configuración previa

- [x] Spec revisado y aprobado
- [x] Baseline verificado sin bloqueos
- [x] Branch de trabajo activo (`refactor_plugins`)

---

## Fases de implementación

### Fase 1: Migrar handlers y VideoEventsAdapter (8 archivos)

**Objetivo**: Actualizar los 8 archivos que solo importan `PlayerAnalyticsEvents` — cambio mecánico uniforme.

**Archivos a modificar**:

- `src/player/core/events/VideoEventsAdapter.ts` — cambiar import de `PlayerAnalyticsEvents`
- `src/player/core/events/handlers/AdEventsHandler.ts` — cambiar import de `PlayerAnalyticsEvents`
- `src/player/core/events/handlers/ErrorEventsHandler.ts` — cambiar import de `PlayerAnalyticsEvents`
- `src/player/core/events/handlers/MetadataEventsHandler.ts` — cambiar import de `PlayerAnalyticsEvents`
- `src/player/core/events/handlers/PlaybackEventsHandler.ts` — cambiar import de `PlayerAnalyticsEvents`
- `src/player/core/events/handlers/QualityEventsHandler.ts` — cambiar import de `PlayerAnalyticsEvents`
- `src/player/core/events/handlers/TrackEventsHandler.ts` — cambiar import de `PlayerAnalyticsEvents`

**Cambios específicos** (idénticos en todos):

1. Reemplazar la ruta relativa `"../../../features/analytics"` (o `"../../features/analytics"`) por `"@overon/react-native-overon-player-analytics-plugins"`

**Invariantes que podrían verse afectados**:

- `PlayerAnalyticsEvents` API: se preserva — misma clase, misma firma

**Punto de verificación**:

```bash
grep -rn "features/analytics" src/player/core/events/handlers/ src/player/core/events/VideoEventsAdapter.ts
# Resultado esperado: sin resultados
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "handlers|VideoEventsAdapter" | head -5
```

**Rollback de esta fase**:

```bash
git checkout -- src/player/core/events/VideoEventsAdapter.ts src/player/core/events/handlers/
```

**Estimación**: 10 minutos

---

### Fase 2: Migrar hooks y types (2 archivos con múltiples símbolos)

**Objetivo**: Actualizar los 2 archivos que importan tanto `PlayerAnalyticsEvents` como `PlayerAnalyticsPlugin`.

**Archivos a modificar**:

- `src/player/core/events/hooks/useVideoAnalytics.ts` — importa `PlayerAnalyticsEvents` + `PlayerAnalyticsPlugin`
- `src/player/core/events/types/index.ts` — importa `PlayerAnalyticsEvents` + `PlayerAnalyticsPlugin`

**Cambios específicos**:

1. En ambos archivos, reemplazar el import desde `"../../../features/analytics"` por `"@overon/react-native-overon-player-analytics-plugins"`
2. Mantener la misma forma del import (`{ PlayerAnalyticsEvents, type PlayerAnalyticsPlugin }`)

**Invariantes que podrían verse afectados**:

- `UseVideoAnalyticsProps.plugins` sigue siendo `PlayerAnalyticsPlugin[]` — tipo compatible

**Punto de verificación**:

```bash
grep -rn "features/analytics" src/player/core/events/hooks/ src/player/core/events/types/
# Resultado esperado: sin resultados
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "useVideoAnalytics|events/types" | head -5
```

**Rollback de esta fase**:

```bash
git checkout -- src/player/core/events/hooks/useVideoAnalytics.ts src/player/core/events/types/index.ts
```

**Estimación**: 5 minutos

---

### Fase 3: Migrar newTypes.ts y features/index.ts (casos especiales)

**Objetivo**: Actualizar los 2 casos especiales — ruta profunda en `newTypes.ts` y re-export selectivo en `features/index.ts`.

**Archivos a modificar**:

- `src/player/types/newTypes.ts` — importa desde ruta profunda `../features/analytics/types`
- `src/player/features/index.ts` — actualmente `export * from "./analytics"`, cambiar a re-export selectivo

**Cambios específicos**:

1. **`newTypes.ts`**: reemplazar `from "../features/analytics/types"` por `from "@overon/react-native-overon-player-analytics-plugins"`

2. **`features/index.ts`**: reemplazar `export * from "./analytics"` por re-exports selectivos:

```typescript
export { BaseAnalyticsPluginFactory } from "@overon/react-native-overon-player-analytics-plugins";
export { PlayerAnalyticsEvents } from "@overon/react-native-overon-player-analytics-plugins";
export { usePlayerAnalyticsEvents } from "@overon/react-native-overon-player-analytics-plugins";
export type {
	PlayerAnalyticsPlugin,
	PositionParams,
	MetadataParams,
	DurationChangeParams,
	StopParams,
	SeekEndParams,
	PositionChangeParams,
	ErrorParams,
	AdBeginParams,
	AdEndParams,
	AdBreakBeginParams,
	AdBreakEndParams,
	QualityChangeParams,
	PlaybackRateChangeParams,
	VolumeChangeParams,
	AudioTrackChangeParams,
	SubtitleTrackChangeParams,
	PluginConfig,
	PluginRegistry,
	PluginCreator,
	AnalyticsFactoryConfig,
} from "@overon/react-native-overon-player-analytics-plugins";
```

**Invariantes que podrían verse afectados**:

- API pública del player: todos los símbolos que hoy exporta `features/analytics` siguen disponibles con el re-export selectivo
- `errors` y `constants` del paquete externo NO se exponen (intencional)

**Punto de verificación**:

```bash
# Sin imports residuales
grep -rn "features/analytics" src/ --include="*.ts" --include="*.tsx" | grep -v "src/player/features/analytics/"
# Resultado esperado: sin resultados

# TypeScript sin nuevos errores
npx tsc --noEmit --skipLibCheck 2>&1 | grep -v "AnalyticsPluginFactory.example" | grep -c "error TS"
# Resultado esperado: mismo número que el baseline (225)
```

**Rollback de esta fase**:

```bash
git checkout -- src/player/types/newTypes.ts src/player/features/index.ts
```

**Estimación**: 10 minutos

---

## Orden de ejecución

```
┌──────────────────────────────────────────┐
│ Fase 1: Handlers + VideoEventsAdapter    │
│         (8 archivos, cambio mecánico)    │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│ Fase 2: Hooks + Types                    │
│         (2 archivos, múltiples símbolos) │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│ Fase 3: newTypes.ts + features/index.ts  │
│         (casos especiales)               │
└──────────────────────────────────────────┘
```

### Dependencias entre fases

- Fase 2 puede ejecutarse en paralelo con Fase 1 (archivos distintos)
- Fase 3 es independiente de 1 y 2 (archivos distintos), pero se ejecuta al final para verificar el resultado global

### Puntos de no retorno

- Ninguno — cada fase es reversible con `git checkout`

## Testing por fase

| Fase | Tests unitarios | Tests integración | Verificación manual |
|---|---|---|---|
| 1 | N/A | N/A | grep sin resultados + tsc sin nuevos errores |
| 2 | N/A | N/A | grep sin resultados + tsc sin nuevos errores |
| 3 | N/A | N/A | grep global sin resultados + tsc baseline estable |

## Checklist pre-implementación

- [x] Spec revisado y aprobado
- [x] Baseline verificado sin bloqueos
- [x] Paquete externo instalado en `node_modules`
- [x] Branch de trabajo activo (`refactor_plugins`)
- [x] 225 errores TypeScript preexistentes documentados

## Rollback global

```bash
git checkout -- \
  src/player/core/events/VideoEventsAdapter.ts \
  src/player/core/events/handlers/ \
  src/player/core/events/hooks/useVideoAnalytics.ts \
  src/player/core/events/types/index.ts \
  src/player/types/newTypes.ts \
  src/player/features/index.ts
```

## Aprobación

- [ ] Plan revisado
- [ ] Orden de fases aprobado
- [ ] Listo para implementar
