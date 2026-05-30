# PLAYER-195 — Exponer telemetría QoE de reproducción a JS — Spec técnica

> Repo: `react-native-video` (fork). Rama base: `master`. Rama: `feat/PLAYER-195-playback-qoe-telemetry`.
> Aditivo, retro-compatible, compatible con codegen/Fabric. Verificado contra el código real (citas `fichero:línea`).

---

## 1. Objetivo

Reenviar a JS la telemetría QoE per-tick que el player ya tiene disponible nativamente pero **no propaga**: throughput / bytes transferidos, frames por segundo, dropped frames, total de bytes transferidos, y la paridad de rendición de vídeo seleccionada en iOS. Aguas abajo (NPAW/Youbora vía PLAYER-194) hoy recibe `throughput=-1`, `framesPerSecond` ausente, `droppedFrames=0`, `totalBytes=-1`.

La solución elegida es un **nuevo DirectEvent periódico `onPlaybackMetrics`** (no extender `onBandwidthUpdate`). Justificación en §3.

---

## 2. Estado actual (qué se emite hoy + nativos disponibles-pero-no-reenviados)

### 2.1 Lo que ya se emite

**Bitrate / rendición — `onBandwidthUpdate` (solo Android):**
- Spec codegen: `src/specs/VideoNativeComponent.ts:213-217`
  ```ts
  export type OnBandwidthUpdateData = Readonly<{
      bitrate: Int32;
      width?: Float;
      height?: Float;
      trackId?: Int32;
  }>;
  ```
  Declarado como evento en `src/specs/VideoNativeComponent.ts:387`: `onVideoBandwidthUpdate?: DirectEventHandler<OnBandwidthUpdateData>;`
- Tipo público: `src/types/events.ts:238` `onBandwidthUpdate?: (e: OnBandwidthUpdateData) => void; //Android`. Import en cabecera del fichero.
- Bridge JS: `src/Video.tsx:485` `_onBandwidthUpdate` (useCallback) → `:619` `onVideoBandwidthUpdate={onBandwidthUpdate ? _onBandwidthUpdate : undefined}`.
- Android emisión: `ReactExoplayerView.java:473` `onBandwidthSample(int elapsedMs, long bytes, long bitrate)` → llama `eventEmitter.bandwidthReport(bitrate, height, width, trackId)`. El emisor está en `VideoEventEmitter.java:317` y despacha vía `receiveEvent` (`:471`, `EVENT_BANDWIDTH = "onVideoBandwidthUpdate"` en `:39`).
- iOS emisión: `ios/Video/RCTVideo.swift:2024` `handleAVPlayerAccess` → `:2032` `onVideoBandwidthUpdate?(["bitrate": lastEvent.observedBitrate, "target": reactTag])`. Prop en `:144`; registrada en `ios/Video/RCTVideoManager.m:50`.

**Tracks de vídeo — `onVideoTracks` (solo Android):**
- Spec: `src/specs/VideoNativeComponent.ts:264` `OnVideoTracksData` (width/height/bitrate/codecs/trackId/index/selected/rotation); evento en `:410`.
- Emisor Android: `VideoEventEmitter.java:304` `videoTracks(...)` + helper `videoTracksToArray` (pone width/height/bitrate/codecs/trackId/index/selected/rotation).
- **iOS NO emite `onVideoTracks`** — no existe `onVideoTracks` en `RCTVideo.swift`/`RCTVideoManager.m` (sólo `onTextTracks:164`/`onAudioTracks:165`). Paridad pendiente.

### 2.2 Nativos disponibles pero NO reenviados

| Métrica | Android — disponible en | iOS — disponible en |
|---|---|---|
| **bytes / throughput** | `onBandwidthSample(elapsedMs, **bytes**, bitrate)` — `ReactExoplayerView.java:473`. El parámetro `bytes` se recibe y **se descarta** (sólo se reenvía `bitrate`). | `AVPlayerItemAccessLog.observedBitrate` (ya leído `:2032`) + `indicatedBitrate` (no leído). |
| **framesPerSecond** | `Format.frameRate` (uso existente en `ReactExoplayerView.java:2503` dentro de `isFormatSupported`; el `videoFormat` ya se obtiene en `:478`). | `nominalFrameRate` del track de vídeo (AVAssetTrack); presentationSize ya se usa en `:1809-1837`. |
| **droppedFrames** | No hay listener actual. Sólo `debugEventLogger` está suscrito como AnalyticsListener (`:664`). Hay que añadir `AnalyticsListener.onDroppedVideoFrames(eventTime, droppedFrames, elapsedMs)`. | `AVPlayerItemAccessLog.numberOfDroppedVideoFrames` (no leído). |
| **totalBytesTransferred** | No hay acumulado de red. `getAllocator().getTotalBytesAllocated()` (`:806`) es buffer de memoria, **no** bytes de red → hay que **acumular** los `bytes` de `onBandwidthSample`. | `AVPlayerItemAccessLog.numberOfBytesTransferred` (no leído). |
| **rendición seleccionada (paridad iOS)** | `onVideoTracks` ✅ ya. | reenviar track de vídeo seleccionado (w/h/bitrate/codec) — no existe en iOS. |

---

## 3. API propuesta: nuevo evento `onPlaybackMetrics`

### 3.1 Decisión: evento nuevo vs extender `onBandwidthUpdate`

**Se recomienda evento nuevo `onPlaybackMetrics`.** Razones:

1. **Cadencia distinta.** `onBandwidthUpdate` en Android está gated por `mReportBandwidth` (prop `reportBandwidth`, `VideoNativeComponent.ts:375`) y sólo dispara en `onBandwidthSample` (muestreo del BandwidthMeter). QoE quiere un tick estable ~1/s independiente de ese flag.
2. **Retro-compatibilidad estricta.** `OnBandwidthUpdateData.bitrate` es `Int32` y consumidores existentes leen ese shape; añadir campos a un evento gated por otra prop mezcla semánticas. Un evento nuevo no toca el contrato actual.
3. **Paridad de plataformas.** `onBandwidthUpdate` hoy es "Android" en los tipos; iOS emite `onVideoBandwidthUpdate` con sólo `{bitrate, target}`. El evento nuevo se define explícitamente para **ambas** plataformas con el mismo payload.
4. **Limpieza.** Un único evento agrupa todas las métricas QoE; el consumidor (NPAW) suscribe una sola fuente.

`onBandwidthUpdate`/`onVideoTracks` se dejan **intactos** (no se borra ni cambia su shape).

### 3.2 Payload

`src/specs/VideoNativeComponent.ts` — añadir junto a `OnBandwidthUpdateData` (~:217):
```ts
export type OnPlaybackMetricsData = Readonly<{
    bitrate: Double;                 // bitrate indicado/seleccionado (bps)
    throughput: Double;              // ancho de banda observado/estimado (bps); -1 si desconocido
    framesPerSecond: Float;          // 0 si desconocido
    droppedFrames: Int32;            // dropped frames acumulados de la sesión
    totalBytesTransferred: Double;   // bytes de red acumulados; -1 si desconocido
    width: Float;
    height: Float;
    trackId?: Int32;                 // id de rendición de vídeo seleccionada
}>;
```
- Tipos: `Double` para bytes/bitrate (pueden exceder Int32; `bandwidthReport` ya usa `putDouble` para bitrate en `VideoEventEmitter.java:319`). `Int32` para `droppedFrames`. `Float` para fps/dimensiones (coherente con el resto del spec).
- Evento (junto a `:387`):
  ```ts
  onVideoPlaybackMetrics?: DirectEventHandler<OnPlaybackMetricsData>;
  ```
  (nombre nativo `onVideoPlaybackMetrics`, igual que el patrón `onVideoBandwidthUpdate` → JS `onBandwidthUpdate`).

`src/types/events.ts`:
- Import `OnPlaybackMetricsData` en el bloque de imports de cabecera (junto a `OnBandwidthUpdateData`).
- En `ReactVideoEvents` (`:234`), junto a `:238`:
  ```ts
  onPlaybackMetrics?: (e: OnPlaybackMetricsData) => void; // Android, iOS
  ```

`src/Video.tsx`:
- Desestructurar `onPlaybackMetrics` en props (junto a `onBandwidthUpdate:84`).
- Añadir `_onPlaybackMetrics` useCallback (patrón de `_onBandwidthUpdate:485`):
  ```tsx
  const _onPlaybackMetrics = useCallback(
      (e: NativeSyntheticEvent<OnPlaybackMetricsData>) => {
          onPlaybackMetrics?.(e.nativeEvent);
      },
      [onPlaybackMetrics]
  );
  ```
- Wire en el `<NativeVideoComponent>` (junto a `:619`):
  ```tsx
  onVideoPlaybackMetrics={onPlaybackMetrics ? _onPlaybackMetrics : undefined}
  ```

> El componente nativo se obtiene vía `requireNativeComponent` en `VideoNativeComponent.ts`; al añadir el evento al `interface NativeProps` el codegen Fabric genera el descriptor del evento. No hace falta tocar C++ manualmente.

---

## 4. Implementación Android (ExoPlayer)

**Fichero:** `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` + `android/src/main/java/com/brentvatne/common/react/VideoEventEmitter.java`

### 4.1 Acumular bytes + dropped frames (estado en la vista)

En `ReactExoplayerView`:
- Añadir campos: `private long totalBytesTransferred = 0;` y `private int droppedFrames = 0;`.
- Resetear ambos a 0 en la creación/release del player (junto a la inicialización en torno a `:974-996` donde se hace `bandwidthMeter.addEventListener(...)`).

**Dropped frames:** añadir un `AnalyticsListener` propio al `player` (hoy sólo se añade `debugEventLogger` en `:664`). Suscribir siempre (no sólo en debug):
```java
player.addAnalyticsListener(new AnalyticsListener() {
    @Override
    public void onDroppedVideoFrames(EventTime eventTime, int dropped, long elapsedMs) {
        droppedFrames += dropped; // onDroppedVideoFrames es delta, acumular
    }
});
```
- Import nuevo: `androidx.media3.exoplayer.analytics.AnalyticsListener` (los imports `androidx.media3.*` ya existen, `:45-104`). `EventTime` = `AnalyticsListener.EventTime`.

### 4.2 Acumular bytes + emitir desde `onBandwidthSample`

En `onBandwidthSample(int elapsedMs, long bytes, long bitrate)` (`:473`) — el `bytes` que hoy se descarta:
```java
@Override
public void onBandwidthSample(int elapsedMs, long bytes, long bitrate) {
    if (bytes > 0) {
        totalBytesTransferred += bytes;
    }
    // ... bloque onBandwidthUpdate existente (sin cambios) ...

    // NUEVO: emitir métricas QoE
    if (player != null) {
        Format videoFormat = player.getVideoFormat();
        int width = videoFormat != null ? videoFormat.width : 0;
        int height = videoFormat != null ? videoFormat.height : 0;
        String trackId = videoFormat != null ? videoFormat.id : null;
        float fps = (videoFormat != null && videoFormat.frameRate != Format.NO_VALUE)
            ? videoFormat.frameRate : 0f;
        long throughput = elapsedMs > 0 ? (bytes * 8000L / elapsedMs) : -1; // bps
        eventEmitter.playbackMetrics(
            bitrate, throughput, fps, droppedFrames, totalBytesTransferred, width, height, trackId);
    }
}
```
- `Format.frameRate` y `Format.NO_VALUE` ya se usan en `:2503`. `videoFormat`/width/height/trackId siguen el patrón exacto de `:478-481`.
- **Cadencia:** `onBandwidthSample` es el tick natural del BandwidthMeter (sub-segundo bajo carga). El evento sale por muestra; el consumidor decimará a ~1/s si lo necesita. Es la misma cadencia que ya usa `onBandwidthUpdate`, por lo que no introduce coste nuevo de scheduling. (Alternativa documentada: emitir desde el time-observer de progreso si se quiere exactamente 1/s; no recomendado porque dispersa la lectura de `bytes`/`throughput`.)
- **Nota:** el nuevo evento NO está gated por `mReportBandwidth` (a diferencia de `onBandwidthUpdate`); se emite siempre que haya un suscriptor JS, para que QoE no dependa de la prop `reportBandwidth`.

### 4.3 Emisor `VideoEventEmitter.java`

Añadir constante `EVENT_PLAYBACK_METRICS = "onVideoPlaybackMetrics"` (junto a `EVENT_BANDWIDTH:39`), registrarla en el array `@VideoEvents` / lista de eventos exportados (donde estén las demás `EVENT_*`), y un método siguiendo el patrón de `bandwidthReport` (`:317`):
```java
public void playbackMetrics(double bitrate, double throughput, float framesPerSecond,
                            int droppedFrames, double totalBytesTransferred,
                            int width, int height, String trackId) {
    WritableMap event = Arguments.createMap();
    event.putDouble("bitrate", bitrate);
    event.putDouble("throughput", throughput);
    event.putDouble("framesPerSecond", framesPerSecond);
    event.putInt("droppedFrames", droppedFrames);
    event.putDouble("totalBytesTransferred", totalBytesTransferred);
    event.putInt("width", width);
    event.putInt("height", height);
    if (trackId != null) event.putString("trackId", trackId); // o putInt si trackId numérico
    receiveEvent(EVENT_PLAYBACK_METRICS, event);
}
```
> Atención al tipo de `trackId`: el spec lo define `Int32?`. En Android `Format.id` es `String`. Para no romper codegen: o bien (a) emitir `trackId` como `Int32` parseando `Format.id`/usando el índice de track, o (b) cambiar el tipo del spec a `string`. **Recomendado (a)**: usar el índice de rendición (entero) para coherencia cross-plataforma; documentar la elección final en el PR.

---

## 5. Implementación iOS (AVPlayer)

**Fichero:** `ios/Video/RCTVideo.swift` + `ios/Video/RCTVideoManager.m`

### 5.1 Prop + registro

- `RCTVideo.swift`: añadir junto a `:144` `@objc var onVideoPlaybackMetrics: RCTDirectEventBlock?`.
- `RCTVideoManager.m`: añadir junto a `:50` `RCT_EXPORT_VIEW_PROPERTY(onVideoPlaybackMetrics, RCTDirectEventBlock);`.

### 5.2 Leer todo el AccessLog en `handleAVPlayerAccess`

`handleAVPlayerAccess` (`:2024`) hoy lee sólo `observedBitrate`. Ampliar (manteniendo el envío de `onVideoBandwidthUpdate` existente para retro-compat):
```swift
@objc
func handleAVPlayerAccess(notification: NSNotification!) {
    guard let accessLog = (notification.object as? AVPlayerItem)?.accessLog(),
          let lastEvent = accessLog.events.last else { return }

    // Existente (sin cambios), sólo si hay suscriptor:
    if onVideoBandwidthUpdate != nil {
        onVideoBandwidthUpdate?(["bitrate": lastEvent.observedBitrate, "target": reactTag])
    }

    // NUEVO: métricas QoE agregadas de toda la sesión
    if onVideoPlaybackMetrics != nil {
        let totalBytes = accessLog.events.reduce(0) { $0 + max(0, $1.numberOfBytesTransferred) }
        let droppedFrames = accessLog.events.reduce(0) { $0 + max(0, $1.numberOfDroppedVideoFrames) }
        let size = _playerItem?.presentationSize ?? .zero            // patrón de :1815
        let fps = currentSelectedVideoTrackNominalFrameRate()        // helper §5.3, 0 si desconocido
        onVideoPlaybackMetrics?([
            "bitrate": lastEvent.indicatedBitrate,
            "throughput": lastEvent.observedBitrate,
            "framesPerSecond": fps,
            "droppedFrames": droppedFrames,
            "totalBytesTransferred": totalBytes,
            "width": Float(size.width),
            "height": Float(size.height),
            "target": reactTag,
        ])
    }
}
```
- `AVPlayerItemAccessLog.events` expone `indicatedBitrate`, `observedBitrate`, `numberOfBytesTransferred`, `numberOfDroppedVideoFrames` (todos `Int`/`Double` nativos). `numberOfBytesTransferred`/`numberOfDroppedVideoFrames` por evento de log; el `reduce` da el acumulado de sesión.
- **Cadencia:** el notification `AVPlayerItemNewAccessLogEntry` llega ~cada segmento HLS (≈1/s en directo), que es exactamente el tick QoE deseado. No hay que montar timer.

### 5.3 framesPerSecond y trackId (paridad de rendición)

- `fps`: leer `nominalFrameRate` del track de vídeo seleccionado del `AVPlayerItem.tracks` (`track.assetTrack?.nominalFrameRate`), filtrando por `mediaType == .video` y `track.isEnabled`. Devolver 0 si no disponible. (El acceso a `currentItem.tracks` ya se usa en `:1232`, `:2054`.)
- `trackId`: AVFoundation no expone un id estable de rendición HLS por track. Para paridad cross-plataforma usar el índice del track de vídeo seleccionado o `Int32(presentationSize.width)` como proxy de rendición; **alinear con la decisión de `trackId` de Android (§4.3)**. Documentar en el PR.

> **Paridad `onVideoTracks` iOS (alcance del task §Ficheros):** queda cubierta funcionalmente por `width/height/bitrate/trackId` dentro de `onPlaybackMetrics` (rendición seleccionada). Implementar el `onVideoTracks` completo (lista de rendiciones) en iOS es mayor (AVFoundation no enumera variantes HLS sin parsear el manifest) y **se considera fuera de alcance**; se cubre la rendición *seleccionada*, que es lo que QoE consume. Anotarlo como asunción.

---

## 6. Ficheros afectados

| Fichero | Cambio |
|---|---|
| `src/specs/VideoNativeComponent.ts` | + `OnPlaybackMetricsData` (~:217); + evento `onVideoPlaybackMetrics` (~:387). |
| `src/types/events.ts` | + import `OnPlaybackMetricsData`; + `onPlaybackMetrics?` en `ReactVideoEvents` (~:238). |
| `src/Video.tsx` | + desestructurar prop (~:84); + `_onPlaybackMetrics` useCallback (~:485); + wire `onVideoPlaybackMetrics` (~:619). |
| `android/.../exoplayer/ReactExoplayerView.java` | campos `totalBytesTransferred`/`droppedFrames`; AnalyticsListener `onDroppedVideoFrames`; acumular `bytes` + emitir en `onBandwidthSample` (:473); import `AnalyticsListener`. |
| `android/.../common/react/VideoEventEmitter.java` | + `EVENT_PLAYBACK_METRICS`; + método `playbackMetrics(...)` (patrón de `bandwidthReport` :317); registrar en lista de eventos. |
| `ios/Video/RCTVideo.swift` | + prop `onVideoPlaybackMetrics` (:144); ampliar `handleAVPlayerAccess` (:2024); helper fps del track seleccionado. |
| `ios/Video/RCTVideoManager.m` | + `RCT_EXPORT_VIEW_PROPERTY(onVideoPlaybackMetrics, RCTDirectEventBlock)` (:50). |
| `docs/pages/component/events.mdx` | documentar `onPlaybackMetrics` + payload (acceptance del task). |

(Codegen regenera artefactos Fabric automáticamente; no se editan a mano.)

---

## 7. Plan de validación

**Gates estáticos (CI, bloqueantes):**
1. `yarn codegen` — regenera artefactos Fabric del nuevo evento sin errores.
2. `yarn build` (`tsc`) — tipos OK (`OnPlaybackMetricsData`, `ReactVideoEvents`, `Video.tsx`).
3. `yarn lint` (eslint).
4. `yarn check-android` (`scripts/kotlin-lint.sh`) — el código nuevo es Java pero el script corre el linter Android del repo.
5. `yarn check-ios` (`swift-format` + `swift-lint` + `clang-format`).

> Compilación nativa real (gradle `compileDebug*` / build iOS) es un gate permanente del proyecto: ejecutar build del módulo Android y compilación iOS vía toolchain local antes de dar por bueno (no basta el lint).

**Runtime (manual, propiedad del equipo — NO hay unit tests JS; `yarn test` es stub):**
- Build del example app + reproducir un directo HLS.
- Verificar en logcat/JS que `onPlaybackMetrics` emite `throughput`, `bitrate`, `framesPerSecond`, `droppedFrames`, `totalBytesTransferred` con **valores reales** (no `-1`/0/ausentes) en Android e iOS.
- Documentar el resultado runtime en el PR; si el agente no puede compilar el example completo, dejarlo como paso manual (no bloquea el merge según el task).

---

## 8. Riesgos / asunciones

- **Aditivo y retro-compatible:** `onBandwidthUpdate`/`onVideoTracks` no se modifican. El evento nuevo es opt-in (sólo emite si hay suscriptor JS). Riesgo de regresión bajo.
- **Codegen:** añadir un evento al `NativeProps` requiere `yarn codegen` limpio; un tipo mal formado (p.ej. unión no soportada) rompe la generación. Mantener tipos primitivos (`Double`/`Float`/`Int32`).
- **`trackId` tipo discrepante:** Android `Format.id` es `String`, iOS no tiene id de rendición estable, el spec lo pide `Int32?`. Decisión pendiente (índice de rendición vs string); alinear ambas plataformas y fijar en el PR. **Riesgo medio** si se elige mal (rompe codegen o paridad).
- **Cadencia divergente entre plataformas:** Android emite por muestra del BandwidthMeter (sub-seg bajo carga); iOS por entrada de AccessLog (~1/seg). El consumidor (NPAW) debe tolerar/decimar; documentar.
- **`droppedFrames` acumulado vs delta:** `onDroppedVideoFrames` (Android) es delta → se acumula en la vista; iOS `numberOfDroppedVideoFrames` se agrega vía `reduce` sobre el log → ambos quedan acumulados de sesión. Resetear el contador Android en cada (re)creación de player.
- **Paridad `onVideoTracks` iOS completa fuera de alcance:** se cubre la rendición *seleccionada* dentro de `onPlaybackMetrics`; enumerar todas las variantes HLS en iOS requiere parsear el manifest (no abordado).
- **Sin unit tests JS:** `yarn test` es stub; la verificación funcional es runtime manual (example + device), propiedad del equipo.
- **Throughput Android:** se deriva como `bytes*8000/elapsedMs` por muestra; es throughput instantáneo de la muestra, no la estimación suavizada del BandwidthMeter. Alternativa: `bandwidthMeter.getBitrateEstimate()`. Documentar cuál consume NPAW.

---

## 9. Complejidad + módulos

- **Complejidad: Media.** Trabajo nativo en dos plataformas + un cambio de codegen/Fabric; sin algoritmia compleja, pero toca contrato tipado (codegen) y requiere verificación runtime en device. Los puntos finos son el tipo/semántica de `trackId` y la divergencia de cadencia, no la mecánica de emisión (que reutiliza patrones existentes).
- **Módulos afectados: 4** — (1) codegen/tipos TS (`VideoNativeComponent.ts` + `events.ts` + `Video.tsx`), (2) Android (`ReactExoplayerView.java` + `VideoEventEmitter.java`), (3) iOS (`RCTVideo.swift` + `RCTVideoManager.m`), (4) docs (`events.mdx`).

✅ spec.md generado en tasks/PLAYER-195-playback-qoe-telemetry/ — Complejidad: Media — 4 modulos afectados
