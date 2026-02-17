# Tarea: Extraer TrackSelectionManager

> Tarea 14 de 22 | Fase D: Extracciones riesgo medio (ReactExoplayerView)
> Plan de refactorización de Android Native Module

## Contexto

`ReactExoplayerView.java` contiene ~280 líneas de lógica de selección de tracks de reproducción (`setSelectedTrack` con 6 estrategias) y obtención de info de tracks. Esta lógica depende del `DefaultTrackSelector` pero puede encapsularse en un manager independiente.

**IDs de auditoría relacionados**: REQ-004, REQ-011

## Objetivo

Extraer la selección y gestión de tracks de reproducción a una clase `TrackSelectionManager` independiente de `ReactExoplayerView`.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` — extraer:
  - `setSelectedTrack()` (líneas ~2274-2433, ~160 líneas)
  - `getVideoTrackInfo()`, `getAudioTrackInfo()`, `getTextTrackInfo()` (~60 líneas)
  - `getVideoTrackInfoFromManifest()` (líneas ~1921-1987, ~67 líneas)
  - `isFormatSupported()` (líneas ~2435-2452, ~18 líneas)
- `android/src/main/java/com/brentvatne/exoplayer/tracks/TrackSelectionManager.java` — nuevo fichero

### Fuera de alcance

- NO modificar las 6 estrategias de selección
- NO tocar `DownloadTrackSelector` (tarea 07, selección para descargas)

## Requisitos funcionales

1. **[REQ-004]**: La selección de tracks por idioma, título, índice o resolución debe funcionar idénticamente con las 6 estrategias.
2. **[REQ-011]**: La obtención de tracks desde manifiesto DASH debe funcionar idénticamente.

## Requisitos técnicos

1. Clase con estado (`DefaultTrackSelector` inyectado)
2. Interfaz pública (ver sección 2.1, Unidad 5 de la auditoría)
3. `ReactExoplayerView` crea instancia en `initializePlayerCore()` pasando el `trackSelector`
4. Máximo 4 ficheros de producción modificados

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] `setSelectedTrack()` y los métodos de info ya no existen en `ReactExoplayerView.java`
- [ ] `ReactExoplayerView` delega a `trackSelectionManager` en todos los puntos
- [ ] Cambio de audio, subtítulos y calidad de vídeo funciona durante reproducción

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅
- [ ] Tests nuevos de `TrackSelectionManager` cubren las 6 estrategias de selección

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅

## Dependencias

### Tareas previas requeridas
- Tarea 03 (Fase A): tests de contrato
- Tarea 04 (Fase A): infraestructura de tests

### Tareas que dependen de esta
- Ninguna directamente (facilita pero no bloquea)

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: `setSelectedTrack()` accede a `player` y `isUsingContentResolution` que son estado del orquestador. Hay que pasar estos como parámetros.
- **Mitigación**: pasar `ExoPlayer` como parámetro del método, no del constructor
- **Rollback**: `git revert HEAD`

## Estimación

2-3 horas
