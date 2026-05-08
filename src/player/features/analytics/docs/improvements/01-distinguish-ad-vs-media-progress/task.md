# Tarea 01: Distinguir progreso de anuncios y de media en el pipeline de analytics

## Prioridad

🔴 Alta — afecta la fiabilidad de cualquier plugin de analytics que mida tiempo visto, completion rate o quartiles. Las métricas actuales contaminan tiempo de contenido con tiempo de anuncio.

## Objetivo

Que cada plugin registrado vía `PlayerAnalyticsEvents` reciba eventos de progreso etiquetados según su origen:

- Progreso de **media** (contenido principal) → `onProgress` / `onPositionUpdate` con la garantía de que la posición/duración se refieren al contenido y nunca al anuncio.
- Progreso de **anuncio** → un canal nuevo `onAdProgress` (a definir en el contrato del plugin) con `position`, `duration`, `adId`, `adBreakId`.

Hoy ambos flujos se mezclan en el mismo `onProgress` de contenido y los ticks de anuncio se descartan.

## Contexto

### Comportamiento actual

1. **`Video` nativo dispara `onProgress` durante todo el playback**, incluido (según implementación CSAI/IMA) durante el ad break.
2. **`useVideoAnalytics.onProgress`** (`src/player/core/events/hooks/useVideoAnalytics.ts:144`) reenvía el evento al adapter sin filtrar.
3. **`VideoEventsAdapter.onProgress`** (`src/player/core/events/VideoEventsAdapter.ts:102`) llama siempre a `playbackHandler.handleProgress` y nunca consulta `adHandler.getIsAdPlaying()`.
4. **`PlaybackEventsHandler.handleProgress`** (`src/player/core/events/handlers/PlaybackEventsHandler.ts:39`) emite incondicionalmente:
   ```ts
   this.analyticsEvents.onPositionUpdate({ position, duration, bufferedPosition });
   this.analyticsEvents.onProgress({ position, duration, percentageWatched });
   ```
   No tiene noción de fase (`PlaybackPhaseManager.isAdActive()`) ni de estado de anuncio (`AdEventsHandler.isAdPlaying`).
5. **`AdEventsHandler.handleAdProgress`** (`src/player/core/events/handlers/AdEventsHandler.ts:215`) recibe los `AD_PROGRESS` ticks de IMA pero solo loguea quartiles. **No existe canal `onAdProgress` en el contrato del plugin**, así que los ticks se tiran.
6. **`Player.tsx:201`** sí gatea correctamente la llamada del host `props.hooks.addContentProgress(...)` con `!isPlayingAd.current && !isCasting.current && !props.playerProgress?.isLive`. Ese gate es la única protección ad/media que existe y solo cubre el callback del host, no el pipeline de plugins.
7. **Cast (`src/player/flavours/cast/index.tsx`)** no engancha `useVideoAnalytics` en absoluto. Hay un gate `isPlayingAdRef` para el `dvrProgressManager` (línea ~1822), pero ningún progreso (ni de media ni de anuncio) llega a los plugins durante una sesión Cast.

### Consecuencia para los plugins

- En flavour `normal` con anuncios CSAI/IMA: el plugin recibe `onProgress`/`onPositionUpdate` durante el ad break con la `currentTime/seekableDuration` que reporte el reproductor nativo. Eso desplaza/infla el tiempo visto y rompe la lógica de quartiles del lado del plugin.
- No existe forma de que un plugin observe el progreso del anuncio (solo `onAdBegin`/`onAdEnd`/`onAdBreakBegin`/`onAdBreakEnd`/`onAdSkip`/`onAdPause`/`onAdResume`).
- Cast no genera ningún progreso para los plugins.

## Diseño propuesto (a refinar en `/spec`)

### Cambios en el contrato del paquete externo

Paquete: `@overon/react-native-overon-player-analytics-plugins`.

Añadir al contrato `PlayerAnalyticsEvents` / `PlayerAnalyticsPlugin`:

```ts
onAdProgress(payload: {
  adId?: string;
  adBreakId?: string;
  position: number;       // ms dentro del ad
  duration: number;       // ms del ad
  percentageWatched: number;
}): void;
```

Documentar en `eventos-plugin.md` que `onProgress` y `onPositionUpdate` se refieren **siempre** al contenido, nunca al anuncio.

### Cambios en este repo

| Archivo | Cambio |
|---|---|
| `src/player/core/events/VideoEventsAdapter.ts:102` | Antes de delegar en `playbackHandler.handleProgress`, consultar `this.adHandler.getIsAdPlaying()` (o `PlaybackPhaseManager.isAdActive()` si se decide usar la fase como single source of truth). Si hay anuncio activo, **no** llamar al `playbackHandler.handleProgress` — el progreso de anuncio fluye por `onReceiveAdEvent → AdEventsHandler.handleAdProgress`. |
| `src/player/core/events/handlers/PlaybackEventsHandler.ts:39` | Aceptar (o leer) `isAdActive` y bifurcar: si está activo, no emitir `onPositionUpdate` ni `onProgress`. Mantener intacta la maquinaria de seek (esa sí depende del `currentTime` del player nativo y debe seguir funcionando entre ad breaks). |
| `src/player/core/events/handlers/AdEventsHandler.ts:215` | En `handleAdProgress`, extraer `position`/`duration` del `OnReceiveAdEventData` y emitir `this.analyticsEvents.onAdProgress({ adId, adBreakId, position, duration, percentageWatched })`. Mantener el log de quartiles. |
| `src/player/core/events/handlers/AdEventsHandler.ts` | Añadir helpers `extractAdCurrentPosition` y `extractAdDurationFromProgress` análogos a los `extract*` ya existentes para `STARTED`. Validar el shape del payload `AD_PROGRESS` en iOS y Android (los IMA SDKs difieren). |
| `src/player/flavours/cast/index.tsx` | Decidir explícitamente: (a) Cast queda fuera del pipeline de plugins (status quo, documentar), o (b) Cast también engancha `useVideoAnalytics`. Si (b): replicar el gate ad/media usando `isPlayingAdRef` + `currentSourceType.current === 'content'`, y mapear `castProgress` (media) y los eventos de break (ad) al adapter. |

### Tests

- Unit test de `PlaybackEventsHandler.handleProgress` con `isAdActive=true` → no se llama a `analyticsEvents.onProgress` ni `onPositionUpdate`.
- Unit test de `PlaybackEventsHandler.handleProgress` con `isAdActive=false` → emite ambos como hoy.
- Unit test de `AdEventsHandler.handleAdEvent` con `event=AD_PROGRESS` y un payload realista → llama a `analyticsEvents.onAdProgress` con el shape correcto.
- Integration test (mock de `PlayerAnalyticsPlugin`): durante un preroll seguido de contenido, el plugin recibe la secuencia `onAdBreakBegin → onAdBegin → N×onAdProgress → onAdEnd → onAdBreakEnd → M×onProgress (contenido)` sin solaparse.
- Si se decide enganchar Cast: smoke test con un mock de `castProgress` durante un break IMA → el plugin no recibe `onProgress` mientras `isPlayingAdRef.current === true`.

## Verificación

### Antes de implementar (`/verify`)

```bash
# Confirmar el call site del progreso en el adapter
grep -n "playbackHandler.handleProgress" src/player/core/events/VideoEventsAdapter.ts

# Confirmar emisión actual sin gate
grep -n "analyticsEvents.onPositionUpdate\|analyticsEvents.onProgress" \
  src/player/core/events/handlers/PlaybackEventsHandler.ts

# Confirmar que el AD_PROGRESS solo se loguea
grep -n "AD_PROGRESS\|handleAdProgress" \
  src/player/core/events/handlers/AdEventsHandler.ts

# Confirmar que cast no usa useVideoAnalytics
grep -n "useVideoAnalytics" src/player/flavours/cast/index.tsx
```

### Después de implementar

```bash
# El gate ad-aware existe en el adapter o el handler
grep -n "isAdActive\|getIsAdPlaying" \
  src/player/core/events/VideoEventsAdapter.ts \
  src/player/core/events/handlers/PlaybackEventsHandler.ts

# El canal onAdProgress se emite desde AdEventsHandler
grep -n "analyticsEvents.onAdProgress" src/player/core/events/handlers/AdEventsHandler.ts

# TypeScript y tests
yarn tsc --noEmit
yarn test src/player/core/events
```

## Criterios de aceptación

- [ ] El paquete externo `@overon/react-native-overon-player-analytics-plugins` expone `onAdProgress` en el contrato del plugin (versión bumpeada y documentada).
- [ ] `VideoEventsAdapter.onProgress` no propaga al `PlaybackEventsHandler` cuando hay un anuncio activo.
- [ ] `PlaybackEventsHandler.handleProgress` no emite `onProgress` ni `onPositionUpdate` durante anuncios. Sigue manteniendo la lógica de detección de fin de seek.
- [ ] `AdEventsHandler.handleAdProgress` emite `analyticsEvents.onAdProgress(...)` con `adId`, `adBreakId`, `position`, `duration`, `percentageWatched` en cada `AD_PROGRESS`.
- [ ] La fuente de verdad de "estamos en anuncio" queda elegida y documentada (recomendado `PlaybackPhaseManager.isAdActive()` para alinearse con el resto del player).
- [ ] Decisión Cast tomada y aplicada: o se documenta que Cast no genera analytics de progreso, o se cablea a `useVideoAnalytics` con el gate ad/media equivalente.
- [ ] Tests unit + integration añadidos y pasando.
- [ ] `yarn tsc --noEmit` pasa.
- [ ] `docs/eventos-plugin.md` actualizado con la nueva semántica.

## Bloqueadores / dependencias

**Cerrados en /verify y ronda de decisiones (2026-05-05)**:

- ✅ Paquete `@overon/react-native-overon-player-analytics-plugins` accesible y editable en `/Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn` (versión local `0.2.2`).
- ✅ Decisión sobre Cast: fuera de alcance por diseño (el receptor CAF tiene su propio sistema de analíticas).
- ✅ Decisión sobre origen `position/duration`: enriquecimiento nativo iOS+Android.
- ✅ Cadencia y comportamiento en pausa: throttle 250 ms, suspensión entre `PAUSED`/`RESUMED`.

**Activos para `/plan` y `/implement`**:

- 🔧 **Identificar getters del IMA SDK** en ambas plataformas (`/plan` lo resolverá leyendo `Podfile.lock` para iOS y `build.gradle` para Android).
- 🔧 **Bootstrap de auth GCP**: `bash scripts/npm.token.sh` (desde un repo hermano como `overon-cast-rn`) antes de `yarn install` cada vez que el token caduque.
- 🔧 **Ciclo de release del paquete**: editar paquete → bump pre-release `0.3.0-rc.x` → `yarn publish:overon:patch` → bump `package.json:36` → `yarn install` en `react-native-video`.

## Alcance final del cambio

| Área | Repo | Ficheros |
|---|---|---|
| Contrato del plugin | `…/overon-player-analytics-plugins-rn` | `src/types/Plugin.ts` (interface `AdProgressParams`, campo opcional `onAdProgress?`), `src/PlayerAnalyticsEvents.ts` (método `onAdProgress`), `src/__tests__/PlayerAnalyticsEvents.test.ts` |
| Gate JS + emisión | `react-native-video` | `src/player/core/events/VideoEventsAdapter.ts`, `src/player/core/events/handlers/PlaybackEventsHandler.ts`, `src/player/core/events/handlers/AdEventsHandler.ts` (incluido fix de `handleAdBreakEnded`) |
| Tests JS | `react-native-video` | nuevos: `src/player/core/events/handlers/__tests__/PlaybackEventsHandler.test.ts`, `…/AdEventsHandler.test.ts`, integración mínima con mock plugin en `useVideoAnalytics` |
| Nativo iOS | `react-native-video` | `ios/Video/Features/RCTIMAAdsManager.swift` |
| Nativo Android | `react-native-video` | `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` |
| Documentación | ambos repos | `src/player/features/analytics/docs/eventos-plugin.md` (semántica nueva + nota Cast por diseño) |

## Archivos relacionados

- `src/player/core/events/VideoEventsAdapter.ts`
- `src/player/core/events/handlers/PlaybackEventsHandler.ts`
- `src/player/core/events/handlers/AdEventsHandler.ts`
- `src/player/core/events/hooks/useVideoAnalytics.ts`
- `src/player/core/phase/PlaybackPhaseManager.ts`
- `src/player/flavours/cast/index.tsx`
- `src/Player.tsx` (referencia del único gate ad/media existente, línea 201)
- `src/player/features/analytics/docs/eventos-plugin.md` (documentación a actualizar)

## Notas

- No mezclar este cambio con la limpieza pendiente de códigos de error `PLAYER_ANALYTICS_PLUGIN_*` / `PLAYER_EVENT_HANDLER_*` (tarea futura propia).
- El gate de `Player.tsx:201` para `addContentProgress` se mantiene tal cual: protege un canal distinto (callback del host, no plugins) y es independiente.
- `AdEventsHandler` ya distingue tipos de break vía `extractAdType` (`preroll/midroll/postroll`). Considerar incluir esa información en el payload de `onAdProgress` si los plugins lo necesitan.
