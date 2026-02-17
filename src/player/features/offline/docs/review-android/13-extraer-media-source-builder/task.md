# Tarea: Extraer MediaSourceBuilder

> Tarea 13 de 22 | Fase D: Extracciones riesgo medio (ReactExoplayerView)
> Plan de refactorización de Android Native Module

## Contexto

`ReactExoplayerView.java` contiene `buildMediaSource()` (~145 líneas) y `buildTextSources()` (~27 líneas) que construyen el `MediaSource` apropiado según URI, extensión y modo (online/offline). Esta lógica es casi pura (stateless builder) y puede extraerse sin riesgo.

**IDs de auditoría relacionados**: REQ-002, REQ-006

## Objetivo

Extraer la construcción de MediaSource a una clase estática `MediaSourceBuilder` independiente de `ReactExoplayerView`.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java` — extraer `buildMediaSource()` (líneas ~1350-1494) y `buildTextSources()` (líneas ~1496-1522)
- `android/src/main/java/com/brentvatne/exoplayer/source/MediaSourceBuilder.java` — nuevo fichero

### Fuera de alcance

- NO modificar la lógica interna de construcción
- NO cambiar el comportamiento offline vs online

## Requisitos funcionales

1. **[REQ-002]**: La construcción de MediaSource según tipo (DASH, HLS, SS, RTSP, Progressive) debe funcionar idénticamente.
2. **[REQ-006]**: El path offline (usando `DownloadRequest` y `buildReadOnlyCacheDataSource`) debe funcionar idénticamente.

## Requisitos técnicos

1. Clase con métodos estáticos
2. Interfaz pública:
```java
public class MediaSourceBuilder {
    static MediaSource buildMediaSource(Uri uri, String extension,
        DataSource.Factory mediaDataSourceFactory, DataSource.Factory localDataSourceFactory,
        @Nullable DrmSessionManager drmSessionManager, @Nullable DownloadRequest downloadRequest,
        boolean playOffline, long contentStartTime);
    static MediaSource[] buildTextSources(ReadableArray textTracks, DataSource.Factory factory);
    static @ContentType int inferContentType(Uri uri, String extension);
}
```
3. En `initializePlayerSource()`, reemplazar `buildMediaSource(...)` por `MediaSourceBuilder.buildMediaSource(...)`

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] `buildMediaSource()` y `buildTextSources()` ya no existen en `ReactExoplayerView.java`
- [ ] `initializePlayerSource()` delega a `MediaSourceBuilder`
- [ ] Contenido DASH, HLS, progressive y offline se reproduce correctamente

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅
- [ ] `MediaSourceBuilderTest` pasa en verde

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `MediaSourceBuilderTest.java` — valida inferencia de tipo y construcción por tipo

### Tests nuevos a crear

- Ampliar `MediaSourceBuilderTest.java` si falta cobertura para: path offline con DownloadRequest, text sources

## Dependencias

### Tareas previas requeridas
- Tarea 03 (Fase A): tests de contrato de MediaSource
- Tarea 04 (Fase A): infraestructura de tests

### Tareas que dependen de esta
- Tarea 16: Extraer PlayerDrmManager (usa MediaSourceBuilder para construir source con DRM)

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: `buildMediaSource()` accede a `AxOfflineManager` singleton para el path offline. La dependencia se pasa como parámetro (`localDataSourceFactory`).
- **Mitigación**: pasar todas las dependencias como parámetros, no acceder a singletons dentro de `MediaSourceBuilder`
- **Rollback**: `git revert HEAD`

## Estimación

1-2 horas
