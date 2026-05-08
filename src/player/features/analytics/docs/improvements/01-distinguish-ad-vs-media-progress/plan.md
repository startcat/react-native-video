# Plan de Implementación: Distinguir progreso de anuncios y de media en analytics

> Basado en spec.md | Generado el 2026-05-05

## Resumen ejecutivo

- **Objetivo**: introducir el canal `onAdProgress` en la pipeline de plugins de analytics y aislar el `onProgress`/`onPositionUpdate` del contenido para que nunca se emita durante un break.
- **Fases**: 6
- **Estimación**: ~7.5 horas de trabajo de implementación efectivo (sin contar smoke test ni publish handshake).
- **Riesgo general**: **Medio**. Bloqueos críticos resueltos en `/verify`. Riesgo residual concentrado en (a) identificación correcta de getters del IMA SDK en ambas plataformas, (b) primer publish del paquete `@overon/...` con el contrato nuevo.

## Asunciones del spec — estado al iniciar plan

Cruce con informe de `/verify` (2026-05-05):

| Ref | Asunción | Estado |
|---|---|---|
| B.1, B.2, B.3 | API existente del paquete (PlayerAnalyticsEvents, PlayerAnalyticsPlugin, createHandlerError) | ✅ |
| B.4 | `onAdProgress` no existe — feature objetivo | ✅ confirmada como faltante |
| C.1 | iOS payload de AD_PROGRESS no carga position/duration | ⚠️ Parcial — runtime confirmable solo con log |
| C.2 | Android payload de AD_PROGRESS no carga position/duration | ⚠️ Parcial — runtime confirmable solo con log |
| C.3 | Gap: handleAdBreakEnded no resetea isAdPlaying | ✅ confirmada como bug |
| C.6b | Mapa de transiciones rechaza CONTENT_PLAYING → AD_PREROLL | ✅ |
| E.1 | Versión local del paquete `0.2.2` | ✅ |

**⚠️ PLAN EN RIESGO** en Fase 2 e Fase 3: depende de C.1/C.2 sin confirmar runtime, y del nombre exacto del getter público del IMA SDK iOS/Android (a resolver en la propia fase leyendo `Podfile.lock` / `android/build.gradle`).

## Pre-requisitos

### Bootstrap de auth para registry GCP privado

```bash
# Refrescar token (desde un repo hermano que tiene el script):
bash /Users/danimarin/Development/Repositories/overon-cast-rn/scripts/npm.token.sh
```

### Ciclo de release del paquete externo

```bash
# En /Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn:
yarn install
yarn typecheck
yarn test
# Tras Fase 1, publicar pre-release:
yarn build
# (ajustar el script según convención del repo: yarn publish:overon:patch / :minor)
```

### Configuración previa

- [ ] Token GCP refrescado en `~/.npmrc`.
- [ ] Acceso de escritura al repo `overon-player-analytics-plugins-rn` y a su pipeline de publish.
- [ ] Acceso a un dispositivo o emulador iOS+Android para smoke test de las Fases 2 y 3.
- [ ] VMAP de prueba con preroll + midroll para el smoke test final.

### Estado de git requerido

- Branch base: `master`.
- Branch de trabajo sugerido: `feat/distinguish-ad-vs-media-progress`.
- Repo paquete: branch sugerido `feat/on-ad-progress`.

---

## Fases de implementación

### Fase 1 — Contrato del plugin: añadir `onAdProgress`

**Repo**: `/Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn`

**Objetivo**: extender el contrato del plugin con `onAdProgress` siguiendo el patrón existente, publicar pre-release `0.3.0-rc.1` para que el resto de fases pueda consumirlo.

**Archivos a modificar**:

- `src/types/Plugin.ts` — añadir interface `AdProgressParams` (extiende `PositionParams`) y campo opcional `onAdProgress?` en `PlayerAnalyticsPlugin`.
- `src/PlayerAnalyticsEvents.ts` — añadir método `onAdProgress(params: AdProgressParams)` que dispatcha a plugins via `dispatchToPlugins(...)` y loggea errores con `logDispatchErrors`.
- `package.json` — bump `version` de `0.2.2` a `0.3.0-rc.1`.

**Archivos a crear**:

- `src/__tests__/PlayerAnalyticsEvents.onAdProgress.test.ts` — test unitario nuevo, sigue patrón del test existente del paquete: mock plugin con `onAdProgress` espía, instanciar `PlayerAnalyticsEvents`, registrar plugin, llamar `onAdProgress({adId, adBreakId, position, duration, percentageWatched})`, assert que el spy se llamó con esos params.

**Cambios específicos**:

1. `AdProgressParams` extiende `PositionParams` (ya define `position` y `duration?`) con `adId?`, `adBreakId?`, `adType?: "preroll"|"midroll"|"postroll"`, `percentageWatched?`.
2. El campo `onAdProgress?` en el interface es opcional para no romper plugins existentes que no lo implementen.
3. El método nuevo en la clase tiene el mismo shape que `onProgress` (línea 190) y `onAdBegin` (línea 211): `dispatchToPlugins`, log de errores.
4. Bump a `0.3.0-rc.1` (no `0.3.0` final hasta Fase 6).

**Invariantes que podrían verse afectados**:

- API pre-existente del paquete (B.1, B.2): se preserva — todos los métodos existentes siguen igual. La adición es estrictamente aditiva.

**Punto de verificación**:

```bash
cd /Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn
yarn typecheck && yarn test
yarn build
# Publish del pre-release (ajustar comando al script real del repo):
# yarn publish:overon:patch   # si publica desde 0.2.2 → 0.2.3, NO sirve
# yarn publish:overon:minor   # bumpea a 0.3.0, NO es lo que queremos
# Probable: editar package.json a 0.3.0-rc.1 y npm publish manual
```

**Nota sobre publish**: el repo tiene `yarn publish:overon:patch/minor/major`. Para un pre-release `0.3.0-rc.1` puede que haya que editar `package.json` manualmente y hacer `npm publish --tag next` (o equivalente). Confirmar la convención del repo durante la fase.

**Rollback de esta fase**: `git revert HEAD` en el repo del paquete + despublicar el pre-release del registry GCP (`npm unpublish @overon/react-native-overon-player-analytics-plugins@0.3.0-rc.1`).

**Estimación**: 1.5 horas (incluye descubrir el comando exacto de publish pre-release).

---

### Fase 2 — Enriquecimiento nativo iOS de `AD_PROGRESS`

**Repo**: `react-native-video`

**Objetivo**: cuando el IMA SDK iOS dispare `kIMAAdEvent_AD_PROGRESS`, añadir al payload reenviado a JS los campos `currentTime` (segundos del clip de anuncio) y `duration` (segundos totales).

**Archivos a modificar**:

- `ios/Video/Features/RCTIMAAdsManager.swift` — bloque `adsManager(_ adsManager: IMAAdsManager, didReceive event: IMAAdEvent)` (líneas 143-162).

**Cambios específicos**:

1. Antes del dispatch, leer la versión del IMA SDK iOS desde `ios/Podfile.lock` (línea con `GoogleAds-IMA-iOS-SDK` o similar) e identificar el getter público correcto:
   - **Asunción a verificar en esta fase**: el SDK expone `IMAAdsManager.adPlaybackInfo.currentMediaTime` (TimeInterval) y `IMAAdsManager.currentAd?.duration` (TimeInterval). Confirmar leyendo el header `<GoogleInteractiveMediaAds/IMAAdsManager.h>` en `ios/Pods/GoogleAds-IMA-iOS-SDK/.../IMAAdsManager.h`.
   - Si el getter `currentMediaTime` no existe en la versión vendorizada: alternativa por orden — `event.ad?.duration` (si IMA lo expone en el evento) → `IMAAdPlaybackInfo` (estructura sustituta) → fallback a sin `currentTime` y solo `duration` (downgrade a quartiles).
2. Cuando `event.type == IMAAdEventType.AD_PROGRESS`, construir un dict `data` con:
   ```swift
   var data: [String: Any] = [:]
   if let currentTime = adsManager.adPlaybackInfo?.currentMediaTime { data["currentTime"] = currentTime }
   if let duration = adsManager.currentAd?.duration { data["duration"] = duration }
   if let existing = event.adData { data.merge(existing) { (_, new) in new } }
   ```
3. Pasar `data` al payload de `_video.onReceiveAdEvent?([...])` (sustituye el actual `event.adData ?? [String]()` solo para `AD_PROGRESS`; el resto de eventos sigue igual).

**Invariantes que podrían verse afectados**:

- Otros consumidores JS de `OnReceiveAdEventData.data` para `AD_PROGRESS`: hoy no había `data` (probablemente nil) y nadie lo lee. Verificar con grep `data.data` en el repo.
- Comportamiento de pausa/resume: durante pausa, `currentMediaTime` debe quedarse fijo. Verificar con log temporal.

**Punto de verificación**:

```bash
# Confirmar getter en headers del Pod:
grep -rn "currentMediaTime\|adPlaybackInfo" ios/Pods/GoogleAds-IMA-iOS-SDK/ 2>/dev/null
# Build iOS:
cd examples/basic && cd ios && pod install && cd .. && yarn ios
# En consola del simulador, durante un VMAP preroll, ver logs `[RCTIMAAdsManager] didReceive event: AD_PROGRESS` con currentTime/duration en el payload (añadir log temporal en Swift).
```

**Rollback de esta fase**: `git revert HEAD` (cambio aislado en un solo bloque).

**Estimación**: 1 hora (asumiendo que el getter es accesible; +30 min si hay que escarbar headers o variantes del SDK).

---

### Fase 3 — Enriquecimiento nativo Android de `AD_PROGRESS`

**Repo**: `react-native-video`

**Objetivo**: análogo a Fase 2 en Android — cuando el IMA SDK Android dispare `AdEvent.AdEventType.AD_PROGRESS`, añadir `position` y `duration` al `Map` reenviado a JS.

**Archivos a modificar**:

- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` — método `onAdEvent(AdEvent adEvent)` (líneas 2827-2840).

**Cambios específicos**:

1. Leer la versión del IMA Android desde `android/build.gradle` (línea con `com.google.ads.interactivemedia.v3:interactivemedia` o vía Media3) e identificar el getter público para currentTimeMs del ad activo:
   - **Asunción a verificar en esta fase**: el SDK expone `AdsManager.getAdProgress()` que retorna `VideoProgressUpdate` con `getCurrentTimeMs()` y `getDurationMs()`. Confirmar inspeccionando el JAR vendorizado vía:
     ```bash
     find ~/.gradle/caches -name 'interactivemedia-*.aar' -o -name 'interactivemedia-*.jar' | head -3
     # Desempacar y javap del símbolo VideoProgressUpdate
     ```
   - Alternativas si `getAdProgress` no existe: `adEvent.getAd().getDuration()` para duration (siempre disponible per línea 2833 actual del DebugLog) + un poll de progreso desde el `AdMediaInfo` si el patrón existente lo permite.
2. Cuando `adEvent.getType() == AdEventType.AD_PROGRESS`, construir un `Map<String, String>` con:
   - `position` (current time del ad en ms, como string).
   - `duration` (duration del ad en ms, como string).
   - Preservar cualquier entry de `adEvent.getAdData()` si existiera (merge).
3. Pasar el map enriquecido a `eventEmitter.receiveAdEvent(adEvent.getType().name(), enrichedMap)` SOLO para `AD_PROGRESS`. Resto de eventos sigue el código actual.

**Invariantes que podrían verse afectados**:

- `eventEmitter.receiveAdEvent(String, Map<String, String>)` — la firma acepta `Map<String, String>`, hay que usar strings (parsear a number en el lado JS).

**Punto de verificación**:

```bash
# Localizar el AAR/JAR del IMA Android:
find ~/.gradle/caches/modules-2/files-2.1/com.google.ads.interactivemedia.v3 -name '*.aar' | head -3
# Build Android:
cd examples/basic && yarn android
# En logcat, durante un VMAP preroll, ver `Ad Event: AD_PROGRESS` con position/duration en el payload (añadir log temporal en Java).
```

**Rollback de esta fase**: `git revert HEAD`.

**Estimación**: 1 hora (paralela a Fase 2).

---

### Fase 4 — JS: gate ad/media + emisión `onAdProgress` + fix isAdPlaying

**Repo**: `react-native-video`

**Objetivo**: integrar el contrato nuevo del paquete (`onAdProgress`), añadir el gate ad/media en el adapter/handler de playback, implementar throttle 250 ms y suspensión en pausa, corregir el gap de `isAdPlaying` en `handleAdBreakEnded`.

**Pre-requisito**: Fase 1 publicada (paquete `@overon/...@0.3.0-rc.1` resoluble).

**Archivos a modificar**:

- `package.json` — bump `@overon/react-native-overon-player-analytics-plugins` de `^0.2.0` a `^0.3.0-rc.1`. Tras editar, `bash scripts/npm.token.sh` (desde repo hermano) + `yarn install`.
- `src/player/core/events/VideoEventsAdapter.ts` — en `onProgress(data)`, antes de delegar en `playbackHandler.handleProgress`, leer `this.adHandler.getIsAdPlaying()` y pasarlo como cuarto argumento.
- `src/player/core/events/handlers/PlaybackEventsHandler.ts` — modificar `handleProgress` para recibir `isAdActive: boolean` y, si `true`, retornar temprano sin emitir `onPositionUpdate` ni `onProgress`. Mantener intacta la maquinaria de `finishSeek` (en práctica no concurre con un break, pero por defensa: si `isSeekInProgress && isAdActive`, no llamar a `finishSeek` — el seek se cerrará al siguiente progress de contenido).
- `src/player/core/events/handlers/AdEventsHandler.ts` — cambios principales:
  1. Implementar `handleAdProgress` para emitir `analyticsEvents.onAdProgress(...)` con throttle 250 ms (`Date.now() - this.lastAdProgressTickTs >= 250`).
  2. Reset de `lastAdProgressTickTs` en `handleAdStarted` (línea ~117).
  3. Tracking de `isAdPaused` (set true en `handleAdPaused` línea ~163, false en `handleAdResumed` línea ~169). Saltar emisión si `isAdPaused === true`.
  4. **Fix C.3**: añadir `this.isAdPlaying = false` en `handleAdBreakEnded` (línea ~146).
  5. Implementar `extractAdCurrentPosition` (lee `(data.data as any)?.currentTime` para iOS o `(data.data as any)?.position` para Android — string parseado a number, en ms).
  6. Implementar `extractAdDurationFromProgress` (lee `(data.data as any)?.duration` — Android string, iOS number).

**Cambios específicos**:

1. La firma de `PlaybackEventsHandler.handleProgress` cambia: `(data, positionMs, durationMs)` → `(data, positionMs, durationMs, isAdActive)`.
2. El gate en el handler es un guard temprano: `if (isAdActive) { return; }` justo después de la maquinaria de seek-detection.
3. El throttle se implementa con un campo privado `lastAdProgressTickTs` y un comparador en cada llamada a `handleAdProgress` con `event === "AD_PROGRESS"`.
4. La suspensión en pausa usa el mismo flag `isAdPaused` para abortar tanto la emisión como el avance del throttle.
5. La normalización de `position`/`duration` (iOS llega en segundos como Number, Android llega en ms como String) se centraliza en los extractors. Convertir todo a milisegundos enteros antes de emitir.

**Invariantes que podrían verse afectados**:

- `useVideoAnalytics` (`src/player/core/events/hooks/useVideoAnalytics.ts:144`): no cambia su firma — la modificación es interna al adapter.
- Plugins existentes que recibían `onProgress` durante un break: cambia comportamiento (parte del fix). Documentado.
- Otros call sites de `playbackHandler.handleProgress`: solo el adapter llama a este handler. Verificar con grep.

**Punto de verificación**:

```bash
cd /Users/danimarin/Development/Repositories/react-native-video
bash /Users/danimarin/Development/Repositories/overon-cast-rn/scripts/npm.token.sh
yarn install
yarn tsc --noEmit 2>&1 | grep -E 'VideoEventsAdapter|PlaybackEventsHandler|AdEventsHandler|useVideoAnalytics' | head -20
# (no deben aparecer errores nuevos en estos ficheros; los pre-existentes en otros ficheros se ignoran).
grep -n "playbackHandler.handleProgress" src/player/core/events/VideoEventsAdapter.ts
# Debe mostrar la nueva firma con 4 argumentos.
grep -n "isAdActive" src/player/core/events/handlers/PlaybackEventsHandler.ts
# Debe encontrar el guard.
grep -n "lastAdProgressTickTs\|isAdPaused" src/player/core/events/handlers/AdEventsHandler.ts
# Debe encontrar throttle y flag.
grep -n "this.isAdPlaying = false" src/player/core/events/handlers/AdEventsHandler.ts | wc -l
# Debe ser 5 (4 anteriores + 1 nuevo en handleAdBreakEnded).
```

**Rollback de esta fase**: `git revert HEAD~1..HEAD` (paquete bump + cambios JS).

**Estimación**: 2 horas (4 ficheros, lógica de throttle + estado + extracción cross-platform).

---

### Fase 5 — Tests JS (unit + integración)

**Repo**: `react-native-video`

**Objetivo**: cubrir con tests automáticos el gate, la emisión `onAdProgress`, throttle, suspensión en pausa, fix `isAdPlaying`, y la secuencia completa con un mock de plugin.

**Pre-requisito**: Fase 4 completa.

**Archivos a crear**:

- `src/player/core/events/handlers/__tests__/PlaybackEventsHandler.test.ts` — unit tests:
  - `handleProgress` con `isAdActive=false`: emite `onPositionUpdate` y `onProgress`.
  - `handleProgress` con `isAdActive=true`: NO emite ninguno de los dos.
  - `handleProgress` con `isAdActive=true && isSeekInProgress`: no termina el seek, no emite progresos.
- `src/player/core/events/handlers/__tests__/AdEventsHandler.test.ts` — unit tests:
  - `AD_PROGRESS` con `data.data` poblado emite `onAdProgress` con shape correcto (`position`/`duration` en ms, `adId`, `adBreakId`, `adType`, `percentageWatched`).
  - Throttle: dos `AD_PROGRESS` consecutivos en <250 ms → solo una emisión. Tres con 100/200/300 ms entre ellos → dos emisiones.
  - Pausa: tras `PAUSED`, los `AD_PROGRESS` siguientes no emiten. Tras `RESUMED`, vuelve a emitir.
  - Reset del throttle en `STARTED`/`COMPLETED`/`SKIPPED`/`ERROR`.
  - `isAdPlaying` se baja correctamente en `AD_BREAK_ENDED` (regresión del fix C.3).
- `src/player/core/events/__tests__/useVideoAnalytics.integration.test.ts` — test de integración con mock plugin (espía):
  - Registrar plugin con `onAdBreakBegin/End`, `onAdBegin/End`, `onAdProgress`, `onProgress`, `onPositionUpdate` espías.
  - Disparar secuencia VMAP preroll: `LOADED → AD_BREAK_STARTED → STARTED → 5×AD_PROGRESS → COMPLETED → AD_BREAK_ENDED → CONTENT_RESUME_REQUESTED → 3×onProgress (contenido)`.
  - Assert: el espía `onProgress` se llama 3 veces (todas tras `AD_BREAK_ENDED`), `onAdProgress` se llama 5 veces (todas entre `STARTED` y `COMPLETED`), ningún `onProgress` cae dentro del intervalo del break.

**Cambios específicos**:

1. Usar `jest.useFakeTimers()` para controlar el throttle de 250 ms con avance de tiempo determinista.
2. Mockear `OnProgressData` y `OnReceiveAdEventData` con el shape mínimo necesario.
3. Reusar el patrón de `src/player/core/phase/__tests__/PlaybackPhaseManager.test.ts` para describir-anidar.

**Invariantes verificados por los tests**:

- Gate ad/media silencia content-progress.
- Throttle no degrada a sub-250 ms.
- Pausa suspende ticks.
- `isAdPlaying` no se queda colgado.
- Secuencia de eventos de un break completo es la esperada para un plugin externo.

**Punto de verificación**:

```bash
cd /Users/danimarin/Development/Repositories/react-native-video
yarn test src/player/core/events 2>&1 | tail -30
# Todos los tests nuevos pasan; ningún test pre-existente roto.
```

**Rollback de esta fase**: `git revert HEAD`.

**Estimación**: 1.5 horas.

---

### Fase 6 — Documentación + bump final del paquete + smoke test manual

**Repos**: `overon-player-analytics-plugins-rn` (bump final) + `react-native-video` (docs + smoke).

**Objetivo**: publicar `0.3.0` final del paquete, actualizar `eventos-plugin.md` con la nueva semántica y la nota sobre Cast, validar end-to-end con smoke test manual en dispositivo iOS y Android.

**Archivos a modificar**:

- `[paquete] package.json` — bump de `0.3.0-rc.1` a `0.3.0`.
- `[react-native-video] package.json:36` — bump de `^0.3.0-rc.1` a `^0.3.0`.
- `[react-native-video] src/player/features/analytics/docs/eventos-plugin.md` — añadir:
  - Sección "Eventos de anuncios": documentar `onAdProgress` con el shape de `AdProgressParams`.
  - Nota sobre la nueva semántica de `onProgress` y `onPositionUpdate` (solo contenido, nunca ad).
  - Nota explícita: "Cast no engancha esta pipeline. Las analíticas durante una sesión de Cast las gestiona el receptor CAF de manera independiente."

**Cambios específicos**:

1. Publish del paquete final con `yarn publish:overon:minor` (o equivalente del repo).
2. Edición de la doc siguiendo el estilo existente del fichero (markdown con bloques de código).
3. Smoke test manual:
   - Lanzar `examples/basic` en simulador iOS y emulador Android.
   - Inyectar un plugin de log (escribir uno mínimo inline o usar uno de fixture si existe en el paquete).
   - Reproducir contenido con VMAP preroll + midroll.
   - Capturar logs y verificar la secuencia: `onAdBreakBegin → onAdBegin → N×onAdProgress (intervalos ~250ms, position/duration coherentes) → onAdEnd → onAdBreakEnd → onProgress (contenido)`.
   - Verificar que pausando el ad, los `onAdProgress` cesan; al reanudar, vuelven.

**Punto de verificación**:

```bash
# Bump final + publish (en repo paquete):
cd /Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn
# Editar package.json a 0.3.0, commit, publish
# Bump en react-native-video:
cd /Users/danimarin/Development/Repositories/react-native-video
# Editar package.json:36 → "@overon/...": "^0.3.0"
yarn install
yarn tsc --noEmit 2>&1 | grep -E 'VideoEventsAdapter|PlaybackEventsHandler|AdEventsHandler' | head
# Sin errores nuevos.
# Smoke en device:
cd examples/basic && yarn ios   # iOS smoke
cd examples/basic && yarn android   # Android smoke
```

**Rollback de esta fase**: `git revert HEAD`. El bump final del paquete es revertible despublicando o publicando un patch hotfix.

**Estimación**: 30 min (docs + bumps) + smoke test manual variable según disponibilidad de devices.

---

## Orden de ejecución

```
┌─────────────────────────────────────────┐
│ Fase 1                                  │
│ Contrato del plugin + publish 0.3.0-rc  │
└────┬────────────────────────────────────┘
     │
     ├─────────────┬──────────────┐
     │             │              │
┌────▼────┐  ┌─────▼─────┐  ┌─────▼─────┐
│ Fase 2  │  │  Fase 3   │  │  Fase 4   │
│ iOS     │  │ Android   │  │  JS gate  │
│ native  │  │ native    │  │ + emit    │
└────┬────┘  └─────┬─────┘  └─────┬─────┘
     │             │              │
     │             │         ┌────▼────┐
     │             │         │ Fase 5  │
     │             │         │  Tests  │
     │             │         │   JS    │
     │             │         └────┬────┘
     │             │              │
     └─────────────┴──────────────┤
                                  │
                            ┌─────▼─────┐
                            │  Fase 6   │
                            │ Docs +    │
                            │ publish + │
                            │  smoke    │
                            └───────────┘
```

### Dependencias entre fases

- Fase 2 depende de: Fase 1 (no estrictamente — solo si se quiere validar la integración nativa contra el contrato; en la práctica puede arrancar antes).
- Fase 3 depende de: Fase 1 (idem).
- Fase 4 depende de: Fase 1 (estricto — sin el paquete publicado, `tsc` no resuelve).
- Fase 5 depende de: Fase 4.
- Fase 6 depende de: Fases 2, 3, 4, 5.

### Fases paralelas

- **Fase 2, Fase 3 y Fase 4** pueden ejecutarse en paralelo una vez Fase 1 está publicada. Fase 4 implementa los extractors asumiendo el shape que Fases 2 y 3 producirán.
- **Fase 5** puede empezar en cuanto Fase 4 esté terminada, sin esperar a Fases 2 o 3 (los tests mockean el shape del payload).

### Puntos de no retorno

- **Después de Fase 1 con publish del `0.3.0-rc.1`**: el paquete está en el registry GCP. Para revertir hay que despublicar el rc o publicar un nuevo rc que invalide el anterior. No catastrófico.
- **Después de Fase 6 con publish del `0.3.0` final**: cambio observable por todos los consumidores del paquete. Pre-confirmar que ningún plugin en producción dependía del comportamiento previo (pregunta abierta en spec §8).

## Testing por fase

| Fase | Tests unitarios | Tests integración | Verificación manual |
|---|---|---|---|
| 1 | nuevo en `src/__tests__/PlayerAnalyticsEvents.onAdProgress.test.ts` (paquete) | n/a | `yarn typecheck && yarn test` en el paquete |
| 2 | n/a (sin tests nativos iOS) | n/a | log temporal en Swift, smoke en simulador iOS con VMAP |
| 3 | n/a (sin tests nativos Android) | n/a | log temporal en Java, smoke en emulador Android con VMAP |
| 4 | (cubierto en Fase 5) | (cubierto en Fase 5) | `yarn tsc --noEmit` sin errores nuevos en los 4 ficheros |
| 5 | `PlaybackEventsHandler.test.ts`, `AdEventsHandler.test.ts` | `useVideoAnalytics.integration.test.ts` | `yarn test` pasa todo lo nuevo |
| 6 | n/a | n/a | smoke test manual end-to-end iOS + Android con plugin espía |

## Checklist pre-implementación

- [x] Spec revisado y aprobado
- [x] Baseline verificado sin bloqueos críticos
- [ ] Branch creado en `react-native-video` (`feat/distinguish-ad-vs-media-progress`)
- [ ] Branch creado en `overon-player-analytics-plugins-rn` (`feat/on-ad-progress`)
- [ ] Token GCP refrescado vía `npm.token.sh`
- [ ] Validaciones actuales pasando (más allá del baseline pre-existente roto, no introducir nuevos errores)
- [ ] VMAP de prueba accesible para Fase 2/3/6

## Rollback global

### Opción 1: Revert por fase (preferida)

```bash
# En orden inverso, fase por fase:
cd /Users/danimarin/Development/Repositories/react-native-video
git log --oneline | grep "Fase 6\|Fase 5\|Fase 4\|Fase 3\|Fase 2"
git revert <hash-fase-6> <hash-fase-5> <hash-fase-4> <hash-fase-3> <hash-fase-2>

cd /Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn
git log --oneline | grep "Fase 1"
git revert <hash-fase-1>
# Despublicar versions:
# npm unpublish @overon/react-native-overon-player-analytics-plugins@0.3.0
# npm unpublish @overon/react-native-overon-player-analytics-plugins@0.3.0-rc.1
```

### Opción 2: Reset al commit base

```bash
cd /Users/danimarin/Development/Repositories/react-native-video
git checkout master
git branch -D feat/distinguish-ad-vs-media-progress

cd /Users/danimarin/Development/Repositories/overon-player-analytics-plugins-rn
git checkout master   # o la rama base que use
git branch -D feat/on-ad-progress
# + despublicar las versiones publicadas.
```

## Aprobación

- [ ] Plan revisado
- [ ] Orden de fases aprobado
- [ ] Listo para `/implement`
