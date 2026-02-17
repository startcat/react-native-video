# Tarea: Extraer DownloadErrorClassifier

> Tarea 05 de 22 | Fase B: Extracciones de bajo riesgo
> Plan de refactorización de Android Native Module

## Contexto

`DownloadsModule2.java` contiene lógica de clasificación de errores de descarga (`isNoSpaceLeftError`, `mapDownloadState`) dispersa entre sus 2446 líneas. Esta lógica es pura (sin efectos secundarios) y puede extraerse sin riesgo a una clase independiente y testeable. La auditoría identifica esta duplicación en SA-05 y la complejidad innecesaria en CI-002.

**IDs de auditoría relacionados**: REQ-032, CI-002

## Objetivo

Extraer la clasificación de errores de descarga a una clase estática `DownloadErrorClassifier` independiente de `DownloadsModule2`.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/react/DownloadsModule2.java` — extraer `isNoSpaceLeftError()` (líneas ~1882-1935) y `mapDownloadState()` (líneas ~1169-1179)
- `android/src/main/java/com/brentvatne/react/downloads/DownloadErrorClassifier.java` — nuevo fichero

### Fuera de alcance

- NO tocar `DownloadsModule.java` (v1) — se elimina en tarea 20
- NO unificar la lógica de high-progress MPD — se hace en tarea 21
- NO modificar la lógica interna de los métodos, solo moverlos

## Requisitos funcionales

1. **[REQ-032]**: La detección de errores de espacio en disco debe funcionar idénticamente: búsqueda recursiva en causas encadenadas, detección de ErrnoException con ENOSPC (errno 28), detección por mensaje (case-insensitive).

## Requisitos técnicos

1. Clase estática sin estado (`final class` con constructor privado)
2. Interfaz pública:
```java
public final class DownloadErrorClassifier {
    static boolean isNoSpaceLeftError(Exception exception);
    static String mapDownloadState(int state);
    static final int ENOSPC = 28;
}
```
3. No introducir dependencias nuevas
4. Mantener los mismos imports que usan los métodos originales

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] `isNoSpaceLeftError()` ya no existe en `DownloadsModule2.java`
- [ ] `mapDownloadState()` ya no existe en `DownloadsModule2.java`
- [ ] Todas las llamadas en `DownloadsModule2` usan `DownloadErrorClassifier.isNoSpaceLeftError()` y `DownloadErrorClassifier.mapDownloadState()`
- [ ] El comportamiento es idéntico al original

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅
- [ ] Tests nuevos de `DownloadErrorClassifier` cubren: mapeo de todos los estados, detección de espacio (null, mensaje directo, causa encadenada, ErrnoException)

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅
- [ ] Build exitoso

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `DownloadErrorClassifierTest.java` — valida `mapDownloadState()` y `isNoSpaceLeftError()` con todos los casos
- Estos tests NO se modifican salvo que haya "Cambios de contrato" documentados arriba

### Tests nuevos a crear

- `android/src/test/java/com/brentvatne/react/downloads/DownloadErrorClassifierTest.java` (si no existe ya de Fase A, o ampliar):
  - Test: cada estado de Download → string correcto
  - Test: null exception → false
  - Test: mensaje "No space left" → true
  - Test: causa encadenada con ENOSPC → true
  - Test: ErrnoException con errno != 28 → false

## Dependencias

### Tareas previas requeridas
- Tarea 01 (Fase A): tests de contrato de utilidades de descargas deben estar en verde
- Tarea 04 (Fase A): infraestructura de tests

### Tareas que dependen de esta
- Tarea 20: Eliminar DownloadsModule v1
- Tarea 21: Consolidar lógica MPD failure (añadirá `isHighProgressMpdFailure()` a esta clase)

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: que haya llamadas a estos métodos desde otros ficheros no identificados
- **Mitigación**: buscar `isNoSpaceLeftError` y `mapDownloadState` en todo el proyecto antes de eliminar
- **Rollback**: `git revert HEAD`

## Estimación

1-2 horas
