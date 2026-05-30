# PLAYER-195 — Review estático (native) — `onPlaybackMetrics` QoE telemetry

> Revisión **read-only y 100% estática**. La compilación nativa (gradle `compileDebug*` / build iOS) y el runtime
> **NO están verificados aquí** — ese es el gate permanente del equipo. Este review emula lo que cazaría un
> compilador (aridades, tipos, null-safety, ciclo de vida de listeners, uso de API) sobre el diff vs `master`.

## Resumen

Cambio aditivo y retro-compatible: nuevo DirectEvent `onVideoPlaybackMetrics` (público `onPlaybackMetrics`) que
reenvía a JS throughput / bitrate / fps / dropped frames / total bytes / rendición seleccionada. Toca 8 ficheros
(TS spec + types + Video.tsx, Android `ReactExoplayerView`+`VideoEventEmitter`, iOS `RCTVideo.swift`+`RCTVideoManager.m`,
docs). `onBandwidthUpdate`/`onVideoTracks` quedan intactos.

El diff está **bien construido** y coincide con el spec salvo desviaciones documentadas en los propios comentarios del
código (trackId omitido, fps como Double). Los puntos de mayor riesgo del spec (override de `onDroppedVideoFrames`,
remove del listener en release, null-safety de `Format`, aridad de `playbackMetrics`, nombres de evento cross-stack)
están **resueltos correctamente** en mi lectura estática. No encuentro bloqueantes.

## Tabla de hallazgos

| Sev | file:line | Issue | Fix |
|---|---|---|---|
| menor | `RCTVideo.swift:2055` (`framesPerSecond`: `Float`) vs `VideoNativeComponent.ts:OnPlaybackMetricsData` (`Double`) | iOS mete `Float` en el diccionario; el tipo codegen es `Double`. El puente RN coacciona ambos a `number` JS, no rompe; pero hay desalineación de precisión entre plataformas (Android emite `double`, iOS `Float`). | Cosmético. Opcional `Double(fps)` en iOS para paridad exacta. No bloquea. |
| menor | `ReactExoplayerView.java:493-507` (emit no gated por suscriptor) | A diferencia de iOS (`if onVideoPlaybackMetrics != nil`), Android emite `playbackMetrics(...)` en **cada** `onBandwidthSample` sin comprobar si hay listener JS. `receiveEvent` despacha igualmente; coste = crear un `WritableMap` por muestra (sub-segundo bajo carga) aunque nadie escuche. | Aceptable (mismo patrón que el resto de eventos del emisor). Si se quiere paridad/eficiencia, gate opcional. No bloquea. |
| nit | `RCTVideo.swift:2049,2058` (`"target": reactTag`) | El payload iOS incluye `target` (no está en `OnPlaybackMetricsData`). | Correcto: es el patrón estándar RN (lo usa `onVideoBandwidthUpdate` y todos los eventos); el puente lo necesita. Sin acción. |
| nit | `OnPlaybackMetricsData` todos los campos `?` opcionales | Spec los definía no-opcionales (salvo `trackId`). Hacerlos opcionales es **más** seguro para codegen y para el consumidor. | Sin acción; mejora sobre el spec. |
| nit | Android `throughput` instantáneo vs iOS `observedBitrate` (estimación suavizada) | Documentado en el comentario y en spec §8. Divergencia de semántica entre plataformas. | NPAW debe tolerar; documentado. Sin acción. |

## Walk-through de corrección nativa

### Android — `ReactExoplayerView.java`

- **Override `onDroppedVideoFrames`** (`:1019-1022`): firma `onDroppedVideoFrames(AnalyticsListener.EventTime eventTime, int dropped, long elapsedMs)` — **coincide exactamente** con la interfaz media3 `AnalyticsListener`. `@Override` presente; `EventTime` calificado como `AnalyticsListener.EventTime`. Import `androidx.media3.exoplayer.analytics.AnalyticsListener` añadido (`:65`). ✅
- **Ciclo de vida del listener (no leak)**: se crea y suscribe en el path de creación del player (`:1016-1025`, junto a `player.addListener(self)`) y se **quita** en `releasePlayer()` (`:1627`) con `removeAnalyticsListener(...)` + null-out, **antes** de `player.release()` (`:1630`). Orden correcto. ✅
- **Reset de acumuladores en (re)create**: `totalBytesTransferred = 0; droppedFrames = 0;` en `:1014-1015`, en el mismo path que crea el listener → se resetean en cada (re)creación de player. ✅ (Coherente con que `onDroppedVideoFrames` es delta y se acumula.)
- **`onBandwidthSample(int, long, long)`** (`:481`): firma `BandwidthMeter.EventListener` correcta (sin cambios). `totalBytesTransferred += bytes` con guard `bytes > 0` (`:482-484`). El bloque `mReportBandwidth` existente queda intacto → `onBandwidthUpdate` no se altera. ✅
- **`Format` null-safety**: `videoFormat != null ? ... : 0` para width/height; fps con doble guard `videoFormat != null && videoFormat.frameRate != Format.NO_VALUE` (`:502-503`). `getVideoFormat()` puede devolver null y se contempla. Patrón idéntico al existente en `:478-481` y `:2503`. ✅
- **`throughput`**: `elapsedMs > 0 ? (double)bytes*8000d/elapsedMs : -1d` — sin división por cero, cast a double antes de multiplicar (sin overflow de `long*long` problemático). ✅
- **API media3**: `AnalyticsListener`, `EventTime`, `addAnalyticsListener`/`removeAnalyticsListener`, `getVideoFormat`, `Format.frameRate`, `Format.NO_VALUE` — todas estables en media3 (`media3Version`, ext property). El repo ya usa `debugEventLogger` como `AnalyticsListener` (`:689/691`) y `Format.frameRate` (`:2503`). No hay uso de API ausente. ✅

### Android — `VideoEventEmitter.java`

- **`playbackMetrics(double bitrate, double throughput, double framesPerSecond, int droppedFrames, double totalBytesTransferred, int width, int height)`** — 7 args.
  **Call site** `ReactExoplayerView.java:506-507`: `playbackMetrics(bitrate /*long→double ok*/, throughput /*double*/, fps /*double*/, droppedFrames /*int*/, totalBytesTransferred /*long→double ok*/, width /*int*/, height /*int*/)`. **Aridad y tipos coinciden** (widening long→double y el `bitrate` long→double son conversiones implícitas válidas en Java). ✅
- **`putDouble`/`putInt`**: `bitrate/throughput/framesPerSecond/totalBytesTransferred` → `putDouble`; `droppedFrames/width/height` → `putInt`. Coincide con los tipos del payload TS (`Double` vs `Int32`). `framesPerSecond` como `putDouble` ⇄ TS `Double` ✅ (consistente con la corrección del spec que lo subió de Float a Double).
- **Registro del evento**: `EVENT_PLAYBACK_METRICS = "onVideoPlaybackMetrics"` (`:40`) añadido al **array de eventos exportados** (`:93`) **y** al `@interface VideoEvents` `@StringDef` (`:125`). Constantes de prop nuevas declaradas (`:168-171`). `receiveEvent(EVENT_PLAYBACK_METRICS, event)` al final. ✅
- **`trackId` omitido**: comentado explícitamente (Android `Format.id` es String, iOS sin id estable). No se emite `trackId`; el spec lo permite vía width/height. Coherente con iOS. ✅

### iOS — `RCTVideo.swift` / `RCTVideoManager.m`

- **`handleAVPlayerAccess`** (`:2024`): guard ampliado a `onVideoBandwidthUpdate != nil || onVideoPlaybackMetrics != nil` — no rompe el early-return existente. `onVideoBandwidthUpdate` se sigue emitiendo con el shape original. ✅
- **AccessLog props**: `lastEvent.indicatedBitrate` (Double), `lastEvent.observedBitrate` (Double), `$1.numberOfBytesTransferred` (Int64), `$1.numberOfDroppedVideoFrames` (Int) — **nombres y tipos correctos** de `AVPlayerItemAccessLogEvent`. ✅
- **`reduce`**: `totalBytes = reduce(0.0){ $0 + Double(max(0, $1.numberOfBytesTransferred)) }` (acumulador `Double`, cast explícito desde Int64 → ok); `droppedFrames = reduce(0){ $0 + max(0, $1.numberOfDroppedVideoFrames) }` (acumulador `Int` ⇄ elementos `Int` → ok). El `max(0, …)` neutraliza el sentinel `-1` de AVFoundation cuando un campo es desconocido. Suma sobre **todos** los eventos del log → acumulado de sesión, paridad con Android. ✅
- **`currentSelectedVideoTrackNominalFrameRate()`** (`:2064-2071`): `guard let tracks = _player?.currentItem?.tracks else { return 0 }`; itera `where track.isEnabled`, `if let assetTrack = track.assetTrack, assetTrack.mediaType == .video { return assetTrack.nominalFrameRate }`; `return 0` por defecto. **API AVFoundation válida y null/optional-safe** (`AVPlayerItemTrack.assetTrack` es opcional y se desempaqueta; `nominalFrameRate` es `Float`). `_player`/`currentItem` opcionales encadenados con `?.`. ✅
- **`presentationSize`**: `_playerItem?.presentationSize ?? .zero` (`:2048`) — `_playerItem` declarado en `:27`, `presentationSize` ya usado en `:1815`. Optional-safe. ✅
- **Prop + export**: `@objc var onVideoPlaybackMetrics: RCTDirectEventBlock?` (`RCTVideo.swift:145`) + `RCT_EXPORT_VIEW_PROPERTY(onVideoPlaybackMetrics, RCTDirectEventBlock);` (`RCTVideoManager.m:51`). Macro correcta (DirectEventBlock, igual que `onVideoBandwidthUpdate`). Nombre Swift ⇄ export coinciden. ✅

## Chequeo de consistencia de nombre de evento

Patrón nativo `onVideo*` → público `on*` (idéntico a `onVideoBandwidthUpdate`→`onBandwidthUpdate`), **intencional y correcto**:

| Capa | Símbolo | Estado |
|---|---|---|
| Spec codegen evento | `VideoNativeComponent.ts:409` `onVideoPlaybackMetrics?: DirectEventHandler<OnPlaybackMetricsData>` | ✅ |
| Tipo público | `events.ts:240` `onPlaybackMetrics?: (e: OnPlaybackMetricsData) => void; // Android, iOS` + import `:10` | ✅ |
| Bridge JS | `Video.tsx` destructura `onPlaybackMetrics` (`:86`), `_onPlaybackMetrics` useCallback (`:494-499`), wire `onVideoPlaybackMetrics={onPlaybackMetrics ? _onPlaybackMetrics : undefined}` (`:629`) | ✅ |
| Android emisor | `VideoEventEmitter.java:40` `EVENT_PLAYBACK_METRICS = "onVideoPlaybackMetrics"` (+ array + `@VideoEvents`) | ✅ |
| iOS prop/export | `RCTVideo.swift:145` + `RCTVideoManager.m:51` `onVideoPlaybackMetrics` | ✅ |

**Nombre nativo `onVideoPlaybackMetrics` idéntico en las 4 superficies; público `onPlaybackMetrics` consistente. Sin break.** ✅

**Consistencia de campos del payload** (native emite ⇄ TS espera):

| Campo | TS (`OnPlaybackMetricsData`) | Android `playbackMetrics` | iOS dict |
|---|---|---|---|
| `throughput` | `Double?` | `putDouble` ✅ | `observedBitrate` (Double) ✅ |
| `bitrate` | `Double?` | `putDouble` ✅ | `indicatedBitrate` (Double) ✅ |
| `framesPerSecond` | `Double?` | `putDouble` ✅ | `Float` ⚠️ (coacciona, ver menor) |
| `droppedFrames` | `Int32?` | `putInt` ✅ | `Int` ✅ |
| `totalBytesTransferred` | `Double?` | `putDouble` ✅ | `Double` ✅ |
| `width` / `height` | `Float?` | `putInt` (int) — RN coacciona int→Float JS ✅ | `Float` ✅ |

Mismos nombres de clave en ambas plataformas y en el tipo. `width/height` salen `int` en Android y `Float` en iOS, ambos llegan como `number` JS bajo `Float?`; sin discrepancia funcional.

## Codegen/TS

- `OnPlaybackMetricsData` usa solo primitivas codegen-válidas (`Double`/`Float`/`Int32`), todas opcionales → **codegen-safe** (sin uniones ni tipos no soportados que rompan Fabric). `Double` ya importado en el fichero. El evento se añade al `interface VideoNativeProps` → el codegen genera el descriptor del DirectEvent automáticamente.
- `events.ts`: import de `OnPlaybackMetricsData` añadido en orden alfabético; entrada en `ReactVideoEvents`. ✅
- No ejecuté `yarn codegen` (pesado, read-only); verificado por lectura que tipos y nombres son consistentes en las tres capas TS.

## Veredicto

Lectura estática limpia: firmas de override correctas (media3 `onDroppedVideoFrames`), listener añadido **y** removido antes de `release()` (sin leak), acumuladores reseteados en (re)create, `Format`/optionals null-safe en ambas plataformas, aridad/tipos de `playbackMetrics` coinciden con el call site, evento registrado en `Events[]` + `@VideoEvents`, y nombre `onVideoPlaybackMetrics`→`onPlaybackMetrics` consistente en TS/Android/iOS. Hallazgos solo menores/nit (fps `Float` vs `Double` en iOS, emit Android no gated por suscriptor) — ninguno bloquea. **Compilación nativa y runtime quedan SIN verificar (gate del equipo).**

⚠️ CON NOTAS — diff estáticamente correcto y consistente cross-stack; pendiente gate de compilación nativa + runtime del equipo; menores: fps iOS `Float` vs `Double`, emit Android sin gate de suscriptor.
