# Tarea: Tests de contrato — MediaSource y tracks

> Tarea 03 de 22 | Fase A: Red de seguridad
> Plan de refactorización de Android Native Module

## Contexto

`ReactExoplayerView.java` contiene la lógica de construcción de `MediaSource` según tipo de contenido y la inferencia de tipo de contenido desde URI. Esta lógica se extraerá a `MediaSourceBuilder` en la Fase D. Necesitamos tests que capturen el comportamiento actual.

**IDs de auditoría cubiertos**: REQ-002, REQ-004

## Objetivo

Escribir tests de contrato que capturen el comportamiento actual de la construcción de MediaSource y la inferencia de tipo de contenido para que sirvan como red de seguridad durante la refactorización posterior.

## Fuente

El fichero `03-estrategia-testing.md` de la auditoría contiene código de test propuesto en la sección:
- **3.1.5** — Tests para MediaSourceBuilder

**No rediseñar los tests desde cero.**

## Alcance

### Código bajo test (NO modificar)

- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java`:
  - `buildMediaSource()` (líneas ~1350-1494)
  - Inferencia de tipo de contenido (dentro de `buildMediaSource`)

### Ficheros de test a crear

- `android/src/test/java/com/brentvatne/exoplayer/source/MediaSourceBuilderTest.java`

### Fuera de alcance

- NO modificar código de producción
- NO testear `setSelectedTrack()` (demasiado acoplado al player, se testeará post-extracción)
- NO testear `getVideoTrackInfoFromManifest()` (requiere red y thread separado)

## Cobertura requerida

| Función/Método | Caso normal | Caso límite | Caso error | Invariantes |
|----------------|-------------|-------------|------------|-------------|
| `inferContentType()` | .mpd → DASH, .m3u8 → HLS, .mp4 → OTHER | rtsp:// → RTSP | — | Siempre retorna un tipo válido |
| `inferContentType()` con extensión explícita | extensión "mpd" override URI .mp4 | — | — | Extensión explícita tiene prioridad |
| `buildMediaSource()` DASH | URI .mpd → DashMediaSource | — | — | — |
| `buildMediaSource()` HLS | URI .m3u8 → HlsMediaSource | — | — | — |
| `buildMediaSource()` Progressive | URI .mp4 → ProgressiveMediaSource | — | — | — |

## Criterios de aceptación

- [ ] Todos los tests ejecutan sin errores
- [ ] Todos los tests pasan en verde contra el código actual sin modificaciones
- [ ] Cada función tiene al menos: caso normal, caso límite
- [ ] Los mocks son realistas
- [ ] Los tests son independientes entre sí
- [ ] El comando `./gradlew :react-native-video:test --tests "com.brentvatne.exoplayer.source.*"` pasa con código 0

## Dependencias

### Tareas previas requeridas
- Tarea 04: Setup infraestructura de tests

### Tareas que dependen de esta
- Tarea 13: Extraer MediaSourceBuilder
- Tarea 14: Extraer TrackSelectionManager

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: `buildMediaSource()` es un método privado dentro de `ReactExoplayerView`. Puede requerir extraer la lógica de inferencia de tipo como método estático package-private para poder testearlo.
- **Mitigación**: La inferencia de tipo usa `Util.inferContentType()` de ExoPlayer que es estática y pública. Testear esa función directamente si el método propio no es accesible.

## Estimación

1-2 horas

## Notas

- Estos tests requieren Robolectric por el uso de `Uri.parse()` de Android.
- Si `buildMediaSource()` no es testeable directamente (método privado con muchas dependencias), centrar los tests en `inferContentType` y en la verificación de que cada tipo de URI produce el tipo correcto de MediaSource. Esto puede requerir crear un wrapper estático temporal.
