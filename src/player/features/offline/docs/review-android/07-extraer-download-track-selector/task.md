# Tarea: Extraer DownloadTrackSelector

> Tarea 07 de 22 | Fase B: Extracciones de bajo riesgo
> Plan de refactorización de Android Native Module

## Contexto

`DownloadsModule2.java` contiene ~230 líneas de lógica de selección de tracks para descarga según calidad (low/medium/high/auto). Esta lógica es casi pura (solo necesita `Context` para logging) y puede extraerse a una clase estática.

**IDs de auditoría relacionados**: REQ-022

## Objetivo

Extraer la selección de tracks para descarga a una clase estática `DownloadTrackSelector` independiente de `DownloadsModule2`.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/react/DownloadsModule2.java` — extraer:
  - `selectQualityTracks()` (líneas ~2081-2141)
  - `selectVideoTrackByBitrate()` (líneas ~2250-2308)
  - `selectAllAudioTracks()` (líneas ~2193-2245)
  - `selectAllTracksForRenderer()` (líneas ~2147-2186)
  - Constantes de bitrate (líneas ~2087-2098)
- `android/src/main/java/com/brentvatne/react/downloads/DownloadTrackSelector.java` — nuevo fichero

### Fuera de alcance

- NO modificar la lógica interna de selección
- NO cambiar los thresholds de bitrate

## Requisitos funcionales

1. **[REQ-022]**: La selección de tracks por calidad debe funcionar idénticamente: low ≤1.5Mbps, medium ≤3Mbps, high ≤6Mbps, auto selecciona todos los audio tracks.

## Requisitos técnicos

1. Clase con métodos estáticos
2. Interfaz pública:
```java
public class DownloadTrackSelector {
    static void selectQualityTracks(DownloadHelper helper, String quality, Context context);
    static void selectAllAudioTracks(DownloadHelper helper);
    static final int BITRATE_LOW = 1_500_000;
    static final int BITRATE_MEDIUM = 3_000_000;
    static final int BITRATE_HIGH = 6_000_000;
}
```
3. En `DownloadsModule2.onPrepared()`, reemplazar llamadas directas por `DownloadTrackSelector.selectQualityTracks(helper, quality, reactContext)`

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] Los 4 métodos de selección ya no existen en `DownloadsModule2.java`
- [ ] Las constantes de bitrate ya no existen en `DownloadsModule2.java`
- [ ] `onPrepared()` delega a `DownloadTrackSelector`

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅
- [ ] Tests nuevos cubren: selección por calidad low/medium/high/auto, constantes de bitrate

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `DownloadTrackSelectorTest.java` — valida selección por calidad y constantes

### Tests nuevos a crear

- Ampliar `DownloadTrackSelectorTest.java` si falta cobertura para `selectAllAudioTracks()` y `selectAllTracksForRenderer()`

## Dependencias

### Tareas previas requeridas
- Tarea 01 (Fase A): tests de contrato
- Tarea 04 (Fase A): infraestructura de tests

### Tareas que dependen de esta
- Tarea 20: Eliminar DownloadsModule v1

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: `selectQualityTracks` accede a `MappedTrackInfo` que puede tener comportamiento diferente según la versión de ExoPlayer
- **Mitigación**: los tests con mocks verifican la lógica de selección, no la API de ExoPlayer
- **Rollback**: `git revert HEAD`

## Estimación

1-2 horas
