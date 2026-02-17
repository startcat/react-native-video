# Tarea: Extraer DownloadStatsCalculator

> Tarea 06 de 22 | Fase B: Extracciones de bajo riesgo
> Plan de refactorización de Android Native Module

## Contexto

`DownloadsModule2.java` contiene lógica de cálculo de estadísticas de descarga (velocidad, tiempo restante, bytes totales) junto con 3 maps de tracking (`downloadStartTimes`, `lastBytesDownloaded`, `lastSpeedCheckTime`). Esta lógica se puede encapsular en una clase independiente con estado interno propio.

**IDs de auditoría relacionados**: REQ-028

## Objetivo

Extraer el cálculo de estadísticas de descarga a una clase `DownloadStatsCalculator` independiente de `DownloadsModule2`.

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/react/DownloadsModule2.java` — extraer:
  - `calculateAccurateTotalBytes()` (líneas ~1309-1383)
  - `calculateDownloadSpeed()` (líneas ~1385-1421)
  - `estimateRemainingTime()` (líneas ~1423-1443)
  - Maps: `downloadStartTimes`, `lastBytesDownloaded`, `lastSpeedCheckTime` (líneas ~1294-1296)
- `android/src/main/java/com/brentvatne/react/downloads/DownloadStatsCalculator.java` — nuevo fichero

### Fuera de alcance

- NO modificar la lógica interna de los métodos
- NO implementar los stubs (`calculateDownloadSpeed` y `estimateRemainingTime` actualmente devuelven 0)

## Requisitos funcionales

1. **[REQ-028]**: El cálculo preciso de bytes totales debe funcionar idénticamente: heurística basada en progreso cuando `contentLength` no refleja la calidad seleccionada.

## Requisitos técnicos

1. Clase con estado interno (maps de tracking)
2. Interfaz pública:
```java
public class DownloadStatsCalculator {
    DownloadStatsCalculator();
    long calculateAccurateTotalBytes(Download download);
    double calculateDownloadSpeed(String downloadId, Download download);
    int estimateRemainingTime(String downloadId, Download download, int progress);
    void startTracking(String downloadId);
    void stopTracking(String downloadId);
    void clearAll();
}
```
3. `DownloadsModule2` crea una instancia `private final DownloadStatsCalculator statsCalculator`
4. Llamar `statsCalculator.clearAll()` en `onHostDestroy()`

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] Los 3 métodos ya no existen en `DownloadsModule2.java`
- [ ] Los 3 maps de tracking ya no existen en `DownloadsModule2.java`
- [ ] `DownloadsModule2` delega a `statsCalculator` en todos los puntos de llamada
- [ ] `onHostDestroy()` llama `statsCalculator.clearAll()`

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅
- [ ] Tests nuevos cubren: cálculo de bytes con diferentes escenarios de contentLength/progreso, velocidad primera/segunda llamada, clearAll

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `DownloadStatsCalculatorTest.java` — valida `calculateAccurateTotalBytes()`, `calculateDownloadSpeed()`, `estimateRemainingTime()`

### Tests nuevos a crear

- Ampliar `DownloadStatsCalculatorTest.java` si falta cobertura para `startTracking()`, `stopTracking()`, `clearAll()`

## Dependencias

### Tareas previas requeridas
- Tarea 01 (Fase A): tests de contrato
- Tarea 04 (Fase A): infraestructura de tests

### Tareas que dependen de esta
- Tarea 20: Eliminar DownloadsModule v1

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: los maps de tracking se acceden desde el `BroadcastReceiver` (thread diferente). Verificar thread-safety.
- **Mitigación**: usar `ConcurrentHashMap` como en el código original
- **Rollback**: `git revert HEAD`

## Estimación

1-2 horas
