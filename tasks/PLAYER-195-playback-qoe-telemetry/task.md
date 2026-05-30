# PLAYER-195 — Expose full playback QoE telemetry to JS

> Riesgo: Medio · Repo: `react-native-video` (fork). Additivo, compatible codegen/Fabric, retro-compatible.

## Contexto

La analítica QoE (NPAW/Youbora) necesita telemetría per-tick del player. Hoy se expone **bitrate** (Android `onBandwidthUpdate`, iOS `onVideoBandwidthUpdate`) y **rendición** (Android `onVideoTracks`), pero faltan o no se reenvían a JS: throughput, fps, dropped frames, total bytes, y la paridad iOS de tracks. Resultado aguas abajo: NPAW recibe `throughput=-1`, `framesPerSecond` ausente, `droppedFrames=0`, `totalBytes=-1`.

## Alcance

Exponer a JS (preferible un evento periódico `onPlaybackMetrics` ~1/s o por cambio; alternativamente extender `onBandwidthUpdate`):

| Métrica | Android (ExoPlayer) | iOS (AVPlayer) |
|---|---|---|
| throughput / bytesTransferred | `BandwidthMeter.onBandwidthSample(elapsedMs, **bytes**, bitrate)` — ya recibe `bytes` (`ReactExoplayerView.java:473`), reenviar | `AVPlayerItemAccessLog.observedBitrate` (ya leído) + `indicatedBitrate` |
| framesPerSecond | `Format.frameRate` (`ReactExoplayerView.java:~2503`, disponible, no reenviado) | frame rate del track format |
| droppedFrames | `DecoderCounters.droppedBufferCount` / `VideoRendererEventListener.onDroppedFrames` | `AVPlayerItemAccessLog.numberOfDroppedVideoFrames` |
| totalBytesTransferred | `BandwidthMeter` acumulado | `AVPlayerItemAccessLog.numberOfBytesTransferred` |
| rendición/tracks (paridad iOS) | `onVideoTracks` ✅ ya | reenviar track de vídeo seleccionado (w/h/bitrate/codec) como Android |

### Ficheros
- **TS codegen spec**: `src/specs/VideoNativeComponent.ts` (tipos de payload de eventos ~:205-323; `onBandwidthUpdate`~:387, `onVideoTracks`~:410) + `src/types/events.ts` (~:234-264). Definir el/los nuevos `DirectEventHandler<Payload>`.
- **Android**: `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` (~:473 bandwidth bytes, ~:2503 frameRate; añadir DecoderCounters/onDroppedFrames) + `android/src/main/java/com/brentvatne/common/react/VideoEventEmitter.java` (~:317 patrón de emisión).
- **iOS**: `ios/Video/RCTVideo.swift` `handleAVPlayerAccess` (~:2024-2033) — leer numberOfDroppedVideoFrames, numberOfBytesTransferred, indicatedBitrate; + track seleccionado.

## Acceptance

- [ ] Nuevo(s) evento(s)/campos tipados en el codegen spec, emitidos en Android e iOS, additivo y retro-compatible.
- [ ] `yarn codegen` regenera sin errores · `yarn build` (tsc) ✅ · `yarn lint` ✅ · `yarn check-android` ✅ · `yarn check-ios` ✅.
- [ ] Documentado en `docs/`.
- [ ] **Sanity runtime** (manual, no hay unit tests JS): build del example app + reproducir un directo HLS → el evento muestra throughput/bitrate/fps/droppedFrames con valores reales (no -1/ausentes).

## Dependencias

- bitrate + rendición YA funcionan vía `onBandwidthUpdate`/`onVideoTracks`; PLAYER-194 (framework) puede empezar sin este. Este completa el set.
- Relacionado con PLAYER-194.

## Refs

- Jira: PLAYER-195

## Metadatos de ejecucion

```yaml
rama_base: master
tipo_commit: feat
rama_trabajo: feat/PLAYER-195-playback-qoe-telemetry
validacion:
  - yarn codegen
  - yarn build
  - yarn lint
  - yarn check-android
  - yarn check-ios
# NOTA: `yarn test` es un stub (no hay unit tests JS). La verificación nativa real
# es runtime: build del example app + logcat del evento con valores reales.
# Si el agente no puede compilar el example completo, dejar la verificación
# nativa como paso manual documentado en el PR (no bloquear por ello).
```
