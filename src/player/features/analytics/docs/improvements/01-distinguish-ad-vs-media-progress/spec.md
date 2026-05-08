# Especificación Técnica: Distinguir progreso de anuncios y de media en analytics

> Generado a partir de task.md el 2026-05-05

## Resumen

Separar el flujo de progreso emitido a los plugins de analytics en dos canales diferenciados: `onProgress`/`onPositionUpdate` queda reservado para el contenido principal (con un gate que lo silencie durante anuncios), y se introduce un canal nuevo `onAdProgress` específico para el avance del clip de anuncio.

## 1. Alcance

### Módulos afectados

**Directos:**

- `src/player/core/events/handlers/PlaybackEventsHandler.ts`: incorporar gate ad-aware antes de emitir `onPositionUpdate`/`onProgress`.
- `src/player/core/events/handlers/AdEventsHandler.ts`: emitir `onAdProgress` desde `handleAdProgress` y enriquecer extracción de `position`/`duration` del clip de anuncio.
- `src/player/core/events/VideoEventsAdapter.ts`: o bien filtrar antes de delegar en `playbackHandler.handleProgress`, o bien pasar el flag `isAdActive` al handler. Decisión a tomar (ver §6 — recomendación: filtrar en el adapter).
- `src/player/core/events/hooks/useVideoAnalytics.ts`: nada estructural; verificar tipos si la API del paquete cambia.
- `@overon/react-native-overon-player-analytics-plugins` (paquete externo): añadir al contrato del plugin y a `PlayerAnalyticsEvents` el método `onAdProgress`.

**Indirectos:**

- `src/player/flavours/normal/index.tsx`: consumidor final. No cambia código, pero los plugins inyectados verán nueva semántica de eventos. Documentar.
- `src/player/flavours/cast/index.tsx`: actualmente NO engancha `useVideoAnalytics`. Decisión a tomar (ver §8 — fuera de alcance de esta tarea o ítem aparte).
- `src/player/core/phase/PlaybackPhaseManager.ts`: posible candidato a fuente de verdad del gate. Ver discusión en §6.
- `src/player/features/analytics/docs/eventos-plugin.md`: documentación a actualizar tras implementar.

### Dependencias impactadas

**Internas:**

- Ninguna interna del repo cambia API pública. La interfaz pública del propio `react-native-video` no se ve afectada.

**Externas:**

- `@overon/react-native-overon-player-analytics-plugins` — versión vendorizada local `0.2.2` (verificada en `/Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn/package.json`). El repo `react-native-video` declara `^0.2.0` en `package.json:36` como devDependency. **Requiere bump** para añadir `onAdProgress` al contrato `PlayerAnalyticsPlugin` y a la clase `PlayerAnalyticsEvents`. Versión propuesta: `0.3.0` (minor — feature aditiva).
  - **Repo local editable**: el paquete vive en `/Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn` y es modificable directamente. Los cambios al contrato del plugin se hacen en ese repo.
  - **Resolución de TypeScript**: el registro npm privado (`https://europe-west1-npm.pkg.dev/kubernetes-overon/oveprgcpew1-npm-registry/`) devuelve **403 Forbidden** sin auth. `yarn install` falla y por tanto los imports `@overon/...` no resuelven en `node_modules`. El plan debe enlazar el paquete local vía `yarn link`, `portal:`, o resolver auth contra el registry GCP antes de poder compilar (`yarn tsc --noEmit` ya falla por este motivo en baseline, pre-existente).

### Archivos de configuración

- `package.json`: bump de la versión de `@overon/react-native-overon-player-analytics-plugins` cuando el paquete publique la nueva minor.

## 2. Contratos

### Cambios en API pública

| Elemento | Tipo de cambio | Antes | Después |
|---|---|---|---|
| `PlayerAnalyticsEvents.onAdProgress` (paquete externo, `…/src/PlayerAnalyticsEvents.ts`) | Nuevo | n/a | `(params: AdProgressParams) => void` (siguiendo el patrón de `onProgress`/`onAdBegin`) |
| `PlayerAnalyticsPlugin.onAdProgress` (paquete externo, `…/src/types/Plugin.ts`) | Nuevo (opcional) | n/a | `onAdProgress?: (params: AdProgressParams) => void` |
| `AdProgressParams` interface (paquete externo, `…/src/types/Plugin.ts`) | Nuevo | n/a | extiende `PositionParams` (ya definido en línea ~5) con `adId?`, `adBreakId?`, `adType?`, `percentageWatched?` |
| `PlayerAnalyticsEvents.onProgress` (paquete externo) | Modificado (semántica) | "tick de progreso" sin distinción | "tick de progreso del **contenido**, nunca durante un anuncio" |
| `PlayerAnalyticsEvents.onPositionUpdate` (paquete externo) | Modificado (semántica) | "actualización de posición" | "actualización de posición del **contenido**, nunca durante un anuncio" |
| `PlaybackEventsHandler.handleProgress` (interno) | Modificado | `(data, positionMs, durationMs)` | `(data, positionMs, durationMs, isAdActive: boolean)` o lectura de un getter inyectado. Detalle final en `/plan`. |
| `AdEventsHandler.handleAdBreakEnded` (interno) | **Fix colateral** — añadir `this.isAdPlaying = false` | flag queda colgado | flag se baja correctamente al fin del break |

### Cambios en tipos/interfaces

Tipo nuevo a añadir al paquete externo (forma final tras `/verify`):

```ts
// /Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn/src/types/Plugin.ts
// Encajar con el patrón ya existente: AdBeginParams, ProgressParams, etc.

export interface AdProgressParams extends PositionParams {
  adId?: string;
  adBreakId?: string;
  adType?: "preroll" | "midroll" | "postroll";
  percentageWatched?: number; // 0..100
}

export interface PlayerAnalyticsPlugin {
  // ... existentes (línea 187: onPositionUpdate?, línea 188: onProgress?, línea 196: onAdBegin?, etc.)
  onAdProgress?: (params: AdProgressParams) => void;
}

// /Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn/src/PlayerAnalyticsEvents.ts
// Encajar tras onAdResume (~línea 240) o agrupado con los métodos de Ad

export class PlayerAnalyticsEvents {
  // ... existentes
  onAdProgress(params: AdProgressParams) {
    const result = dispatchToPlugins(this.registry.getPlugins(), "onAdProgress", [params]);
    if (result.errors.length > 0) {
      this.logDispatchErrors(result, "onAdProgress");
    }
  }
}
```

### Cambios en eventos/callbacks

- `analyticsEvents.onProgress` y `analyticsEvents.onPositionUpdate`: deja de invocarse mientras `isAdActive === true`. Resto del comportamiento idéntico.
- `analyticsEvents.onAdProgress`: nuevo. Se invoca desde `AdEventsHandler.handleAdProgress` cada vez que llega un `AD_PROGRESS` del native, con `position`/`duration` resueltos según platform (ver §3).

## 3. Flujo de datos

### Estado global afectado

- Ninguno externo. El flag `isAdPlaying` ya vive dentro de `AdEventsHandler` (línea 15). Se consultará desde el adapter o se le pasará al handler de playback.

### Persistencia

- **Local storage**: sin impacto.
- **Base de datos**: sin impacto.
- **Cache**: sin impacto.

### Comunicación entre módulos

- `Video` (nativo) → `useVideoAnalytics.onProgress` (RN) → `VideoEventsAdapter.onProgress` → **(nuevo gate)** → `PlaybackEventsHandler.handleProgress` → `analyticsEvents.onProgress`/`onPositionUpdate`. El gate es donde se rompe el flujo durante anuncios.
- `Video` (nativo) → `useVideoAnalytics.onReceiveAdEvent` → `VideoEventsAdapter.onReceiveAdEvent` → `AdEventsHandler.handleAdEvent` → si `event === "AD_PROGRESS"` → `analyticsEvents.onAdProgress` (canal nuevo).

### Fuente del `position`/`duration` del anuncio (decidido — opción A)

El payload nativo de `AD_PROGRESS` actual no carga `position`/`duration` en `data.data`. La decisión cerrada (§7-bis #5) es **enriquecer el payload nativo** en ambas plataformas:

- **iOS** (`ios/Video/Features/RCTIMAAdsManager.swift:143-162`): cuando `event.type == AD_PROGRESS`, añadir al diccionario reenviado los campos `currentTime` (consultando el IMA SDK iOS, p. ej. `IMAAdsManager.adPlaybackInfo.currentMediaTime` u otro getter público disponible — confirmar nombre exacto durante `/plan` con la versión del IMA SDK vendorizado en el `Podfile.lock`) y `duration` (`IMAAdsManager.currentAd?.duration`).
- **Android** (`android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java:2827-2840`): cuando `adEvent.getType() == AD_PROGRESS`, enriquecer el `Map` reenviado con `position` (del `AdMediaInfo.getCurrentTimeMs()` o equivalente del IMA Android — confirmar API exacta) y `duration` (ya disponible: `adEvent.getAd().getDuration()`).

JS-side, `AdEventsHandler.handleAdProgress` aplica throttle uniforme a 250 ms (decisión §7-bis #6) y se suspende entre `PAUSED` y `RESUMED` (decisión §7-bis #7).

**Asunciones nativas pendientes para `/plan`** (escaladas por la opción A):

- A.iOS: nombre exacto del getter público del IMA SDK iOS para `currentMediaTime` del ad activo (versión del Pod a confirmar en `Podfile.lock`).
- A.Android: nombre exacto del getter público del IMA Android para la posición actual del ad media (`AdMediaInfo` vs `AdProgressInfo` vs `AdsManager.adProgress` — depende de la versión del IMA SDK).

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change | Severidad | Mitigación |
|---|---|---|
| Plugins existentes que confiaban en `onProgress` durante anuncios verán un "hueco" durante el break | Media | Documentar el cambio semántico en `eventos-plugin.md`. Es un fix; los plugins probablemente estaban modelando mal el tiempo visto. |
| `PlayerAnalyticsEvents.onAdProgress` añadido al paquete externo no rompe consumidores existentes (método nuevo) | Baja | Asegurar que `PlayerAnalyticsPlugin.onAdProgress` se declara opcional en el contrato del paquete. |
| Si la decisión sobre la fuente de `position`/`duration` (A/B/C) se cambia tras implementar, los plugins consumidores pueden recibir resoluciones distintas | Media | Fijar la opción en `/plan`, documentarla, y cubrirla con tests. |

### Impacto en rendimiento

- **PlaybackEventsHandler.handleProgress**: una comparación booleana extra por tick (~4/s). Coste despreciable.
- **AdEventsHandler.handleAdProgress**: emite `onAdProgress` ~4/s durante un break (típicamente 15-30 s). Volumen comparable al `onProgress` actual de contenido. Coste despreciable.
- Si se elige **opción B** (timer JS): un `setInterval` de 250 ms activo solo durante el break. Coste despreciable. Importante limpiarlo en `COMPLETED`/`SKIPPED`/`ERROR`/`destroy`.

### Casos edge problemáticos

- **Ad pausado por el usuario**: el `AD_PROGRESS` deja de fluir desde IMA mientras está pausado. Si usamos opción B (timer JS), el timer hay que suspenderlo en `PAUSED` y reanudarlo en `RESUMED`, o el `position` derivado del wallclock se irá fuera del clip.
- **Ad skip antes del primer tick**: emitir un `onAdEnd` con `completed: false` sin haber emitido ningún `onAdProgress` debe seguir siendo válido. No requerir progress para que el lifecycle del plugin sea coherente.
- **Stream switch (live/DVR) durante un break**: `AdEventsHandler.isAdPlaying` puede quedar colgado si el switch ocurre antes de `AD_BREAK_ENDED`. Hay precedente conocido de este síntoma en cast (ver memoria del proyecto: `feedback_cast_stale_duration_invalidation_works`). Mitigar reseteando flags en `destroy`/`changeSource`.
- **`AD_BREAK_STARTED` perdido o no emitido en alguna plataforma**: si el flag `isAdPlaying` no se levanta, el gate falla "abierto" y plugins reciben `onProgress` durante el ad. Este es el comportamiento actual — la mejora reduce el problema pero no lo elimina. Considerar usar también `PlaybackPhaseManager` como segunda fuente cuando esté disponible.
- **Cast**: hoy plugins no reciben nada de progreso en cast (ni media ni ad). Esta tarea NO arregla cast; solo deja claro en docs que cast queda fuera del pipeline de plugins. Ítem aparte.

## 5. Estrategias

### Testing

- **Unitarios**:
  - `PlaybackEventsHandler.handleProgress` con `isAdActive=true` → ningún `onProgress` ni `onPositionUpdate` se emite. La maquinaria de seek (`finishSeek`) debe seguir funcionando si hay un seek en curso, ya que es un caso muy raro pero posible (un usuario hace seek y entra a un break a la vez). Decisión: durante anuncio, `handleProgress` retorna temprano sin tocar nada relacionado con seek tampoco — los seeks no ocurren durante ad break en IMA.
  - `PlaybackEventsHandler.handleProgress` con `isAdActive=false` → comportamiento idéntico al actual.
  - `AdEventsHandler.handleAdEvent({event: "AD_PROGRESS", data: {...}})` → llama a `analyticsEvents.onAdProgress` con shape correcto.
  - `AdEventsHandler.handleAdEvent({event: "STARTED", ...})` → si se elige opción B, arranca el timer.
  - `AdEventsHandler.handleAdEvent({event: "COMPLETED" / "SKIPPED" / "ERROR"})` → si se elige opción B, detiene el timer.
- **Integración**: mock de `PlayerAnalyticsPlugin` registrado vía `useVideoAnalytics`, simulando una secuencia VMAP preroll + content. Asserts:
  - Secuencia recibida: `onSessionStart` (si aplica) → `onAdBreakBegin` → `onAdBegin` → N×`onAdProgress` → `onAdEnd` → `onAdBreakEnd` → M×`onProgress` (contenido) → `onEnd`.
  - Ningún `onProgress`/`onPositionUpdate` entre `onAdBreakBegin` y `onAdBreakEnd`.
- **E2E**: no aplica en este repo (no hay infraestructura E2E del player).
- **Manual**: ejecutar `examples/basic` con un VMAP de prueba (preroll + midroll), inyectar un plugin de log, verificar el tape de eventos en consola.

### Rollback

1. `git revert` del commit del cambio en handlers + adapter.
2. Bajar el peg de `@overon/react-native-overon-player-analytics-plugins` a la minor previa (la nueva `onAdProgress` queda como noop en plugins viejos por ser opcional, así que no hay obligación de revertir el bump).
3. Plugins consumidores que adoptaron `onAdProgress` mantienen el método; al no llamarse, queda inerte.

### Migración de datos

- **¿Necesaria?**: No.
- **Estrategia**: n/a.
- **Reversible**: Sí.

## 6. Complejidad estimada

- **Nivel**: **Media**.
- **Justificación**:
  - El fix en sí (gate + emisión de `onAdProgress`) es localizado y pequeño (3 ficheros, <100 LoC).
  - La complejidad real está fuera del repo: requiere coordinar el bump del paquete `@overon/react-native-overon-player-analytics-plugins`, sin el cual TypeScript no compila la llamada nueva.
  - La incertidumbre sobre la procedencia real de `position`/`duration` durante `AD_PROGRESS` (asunciones A.1, A.2) puede forzar trabajo nativo si se descarta la opción B.
  - Decisión de gate (flag de handler vs phase manager) acotada y reversible.

## 7. Asunciones verificadas en /verify (2026-05-05)

> Tras `/verify` con acceso al repo local del paquete (`/Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn`).

### Symbols externos (tipo B)

| # | Symbol | Package | Versión | Estado | Evidencia |
|---|---|---|---|---|---|
| B.1 | `PlayerAnalyticsEvents` con `addPlugin/removePlugin/onProgress(ProgressParams)/onPositionUpdate(PositionUpdateParams)/onAdBegin(AdBeginParams)/onAdEnd(AdEndParams)/onAdBreakBegin/onAdBreakEnd/onAdPause/onAdResume/onAdSkip/onContentResume` | `@overon/react-native-overon-player-analytics-plugins` | `0.2.2` local | ✅ | `…/overon-player-analytics-plugins-rn/src/PlayerAnalyticsEvents.ts:183-258` |
| B.2 | `PlayerAnalyticsPlugin` interface con métodos opcionales (`onProgress?`, `onPositionUpdate?`, `onAdBegin?`, `onAdEnd?`, `onAdPause?`, `onAdResume?`, `onAdSkip?`, `onAdBreakBegin?`, `onAdBreakEnd?`, etc.) | idem | `0.2.2` | ✅ | `…/src/types/Plugin.ts:185-202` |
| B.3 | `createHandlerError = createErrorFactory(HANDLER_ERROR_CATALOG)`, `createAnalyticsError = createErrorFactory(ANALYTICS_ERROR_CATALOG)` | idem | `0.2.2` | ✅ | `…/src/errors/types.ts:10,16` |
| B.4 | `onAdProgress` **NO existe** en el contrato — es lo que esta tarea introduce | idem | a publicar en `0.3.0` | ✅ confirmada como **faltante por diseño** | `grep -rn 'onAdProgress' .../src` → 0 resultados |

**Acción para `/plan`**: añadir `onAdProgress?` al interface `PlayerAnalyticsPlugin` (`…/src/types/Plugin.ts`) y `onAdProgress(params: AdProgressParams)` a la clase `PlayerAnalyticsEvents` (`…/src/PlayerAnalyticsEvents.ts`), siguiendo el patrón de los métodos existentes (`dispatchToPlugins(this.registry.getPlugins(), "onAdProgress", [params])`). Bump del paquete a `0.3.0` y publicación en el registry GCP privado.

### Invariantes de runtime (tipo C)

| # | Asunción | Estado | Hallazgos |
|---|---|---|---|
| C.1 | `AD_PROGRESS` iOS no popula `position/duration` en `event.adData` | ⚠️ Parcial — verificable solo en runtime | `RCTIMAAdsManager.swift:143-162` reenvía `event.adData` opaco. Confirmación final requiere log instrumentado en build real |
| C.2 | `AD_PROGRESS` Android no popula `position/duration` en `getAdData()` | ⚠️ Parcial — verificable solo en runtime | `ReactExoplayerView.java:2836` reenvía `adEvent.getAdData()` (`Map<String,String>`); el `getDuration()` del `Ad` solo aparece en DebugLog (línea 2833), nunca se propaga a JS |
| C.3 | `AdEventsHandler.isAdPlaying` se baja correctamente en todas las salidas del break | ⚠️ **GAP detectado** | Se baja en `handleAdCompleted/Skipped/Error/AllAdsCompleted` pero **NO** en `handleAdBreakEnded` (línea ~146 de `AdEventsHandler.ts`). El plan debe corregirlo. |
| C.4 | `Video.onProgress` sigue firing durante el ad break | ⚠️ No verificable estáticamente | Log instrumentado obligatorio en `/implement` |
| C.5 | `Player.tsx:201` mantiene gate `!isPlayingAd.current` | ✅ | `if (hasBeenLoaded.current && !props.playerProgress?.isLive && !isCasting.current && !isPlayingAd.current) {` |
| C.6a | `PlaybackPhaseManager.isAdActive()` solo cubre `AD_PREROLL` | ✅ | `PlaybackPhaseManager.ts:80-82` |
| C.6b | **Hallazgo nuevo**: el mapa `VALID_TRANSITIONS` **rechaza** `CONTENT_PLAYING → AD_PREROLL` | ✅ | `PlaybackPhaseManager.ts:38-43`: `[CONTENT_PLAYING]: [SEEKING, CHANGING_SOURCE, LOADING, IDLE]` no incluye `AD_PREROLL`. Midrolls disparan `transition(...)` que es **silenciosamente rechazada** (`Invalid transition` log en warn). El phase manager **no debe** ser la fuente del gate. |
| C.7 | Cast no usa `useVideoAnalytics` | ✅ | `grep -nc 'useVideoAnalytics' src/player/flavours/cast/index.tsx` → `0` |

### Estado de build / configuración (tipo D)

| # | Asunción | Estado | Evidencia |
|---|---|---|---|
| D.1 | devDependency declarada `^0.2.0` | ✅ | `package.json:36` |
| D.2 | No hay tests existentes en `src/player/core/events/` | ✅ | `find src/player/core/events -name '*.test.ts'` → 0 resultados. Patrón de referencia para tests nuevos: `src/player/core/phase/__tests__/PlaybackPhaseManager.test.ts` |

### Versiones de dependencias vendorizadas (tipo E)

| # | Paquete | Versión real | Estado | Fichero |
|---|---|---|---|---|
| E.1 | `@overon/react-native-overon-player-analytics-plugins` | `0.2.2` (paquete local), no resoluble vía `yarn install` (registry GCP privado, 403) | ✅ confirmada | `/Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn/package.json` |

### Decisiones Tipo F (humanas) pendientes

- F.1: Cast — engancha `useVideoAnalytics` en esta tarea o se deja fuera (status quo).
- F.2: Resolución temporal de `onAdProgress` — 250 ms (timer JS), 1 s, o solo quartiles.

## 7-bis. Decisiones cerradas (2026-05-05)

Tras ronda de decisiones con el usuario:

1. **Gate ad/media** — `AdEventsHandler.getIsAdPlaying()` como única fuente. **NO** usar `PlaybackPhaseManager.isAdActive()` (C.6b: no cubre midroll/postroll y la transición se rechaza silenciosamente).
2. **Fix colateral obligatorio** — `handleAdBreakEnded` debe resetear `isAdPlaying = false` (gap C.3 detectado en /verify).
3. **Versión del paquete externo** — bump a **`0.3.0`** (minor) con `onAdProgress?` opcional. Ciclo de release: pre-release `0.3.0-rc.x` para iterar durante `/implement`.
4. **Resolución TS local** — flujo estándar publish: `bash scripts/npm.token.sh` (desde repo hermano) → bump pre-release en el paquete → `yarn publish:overon:patch` → bump `package.json:36` en `react-native-video` → `yarn install`. **No** se usa `yarn link` ni `portal:`.
5. **Origen `position/duration` del anuncio** — **Opción A: enriquecimiento nativo**.
   - iOS (`ios/Video/Features/RCTIMAAdsManager.swift:143-162`): añadir al payload de `AD_PROGRESS` los campos `currentTime` (de `IMAAdsManager.adPlaybackInfo.currentMediaTime` o equivalente público del IMA SDK iOS) y `duration` (de `IMAAdsManager.currentAd?.duration`).
   - Android (`android/.../ReactExoplayerView.java:2827-2840`): añadir al `Map` que se reenvía a `eventEmitter.receiveAdEvent` los campos `position` (poll del `AdMediaInfo.getCurrentTimeMs()` o equivalente) y `duration` (`adEvent.getAd().getDuration()`).
6. **Cadencia `onAdProgress`** — throttle JS uniforme a **250 ms** en `AdEventsHandler` (compensa la diferencia entre iOS ~4 ticks/s y Android ~5-10 ticks/s). Implementado con comparador `Date.now() - lastTickTs >= 250`.
7. **Pausa del anuncio** — `onAdProgress` se suspende entre `PAUSED` y `RESUMED`. El plugin ya tiene `onAdPause`/`onAdResume` para medir pausa; `onAdProgress` significa "el reloj del anuncio avanzó".
8. **Cast** — fuera de alcance **por diseño**, no por defer. El receptor CAF tiene su propio sistema de analíticas integrado en el receptor; cablear `useVideoAnalytics` en el flavour `cast` duplicaría tracking. Documentar en `eventos-plugin.md` que la pipeline RN-side cubre solo el flavour `normal`.
9. **Alcance de tests** — JS unit en `react-native-video` (handlers + throttle + fix isAdPlaying), JS unit del nuevo método en el paquete externo, JS integración con mock plugin, smoke manual en `examples/basic`. Sin tests nativos iOS/Android (el repo no tiene infraestructura; validación nativa por smoke + logs instrumentados durante `/implement`).

## 8. Preguntas sin resolver

### Técnicas (a resolver en `/plan` por inspección)

- [ ] Nombre exacto del getter público del IMA SDK iOS para `currentMediaTime` del ad activo (depende de la versión vendorizada en `Podfile.lock`).
- [ ] Nombre exacto del getter público del IMA Android para la posición actual del ad (`AdMediaInfo` vs `AdProgressInfo` — depende de la versión del IMA en gradle).
- [ ] ¿`PlaybackPhase` se extiende para modelar `AD_MIDROLL`/`AD_POSTROLL`? **Decidido: NO en esta tarea.** El gate usa `AdEventsHandler.isAdPlaying` (§7-bis #1). La extensión del phase manager queda como ítem futuro independiente.
- [ ] El método `forceSeekEnd` en `PlaybackEventsHandler` ¿debe bloquearse durante anuncio o ignorar el gate por ser operación de mantenimiento? **A resolver en `/plan`** — recomendación: ignorar el gate (es una operación de cleanup, no un tick de progreso).

### De negocio (tipo F — cerradas)

- [x] **Cast**: fuera de alcance por diseño (§7-bis #8). El receptor CAF tiene su propio sistema de analíticas; cablear `useVideoAnalytics` en cast duplicaría tracking.
- [ ] ¿Hay plugins en producción que dependan del comportamiento actual (recibir `onProgress` durante anuncios)? **A confirmar antes de mergear** — si sí, coordinar nota de cambio en `eventos-plugin.md` y notificar consumidores.

### De rendimiento (cerradas)

- [x] Cadencia: throttle JS a 250 ms uniforme (§7-bis #6).

## Aprobación

- [x] Spec revisado
- [x] Asunciones listadas explícitamente en §7
- [x] Verificación de baseline completada (2026-05-05) — veredicto 🟡 AJUSTES; bloqueos críticos resueltos al disponer del paquete local editable
- [x] Decisiones humanas cerradas (§7-bis): origen position/duration = nativo iOS+Android, throttle 250 ms, suspensión en pausa, Cast fuera por diseño, scope de tests acotado a JS
- [x] Listo para `/plan`
