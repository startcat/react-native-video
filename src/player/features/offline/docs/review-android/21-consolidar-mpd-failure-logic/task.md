# Tarea: Consolidar lógica de high-progress MPD failure

> Tarea 21 de 22 | Fase F: Eliminación y consolidación
> Plan de refactorización de Android Native Module

## Contexto

La lógica de considerar descargas MPD fallidas como exitosas cuando superan cierto umbral está implementada en **3 lugares diferentes** con thresholds y lógica ligeramente distintos (SA-13, CI-002). Además, `AxDownloadTracker.onDownloadChanged()` contiene `if (is404Error || true)` (línea ~280), lo que hace que la condición siempre sea true.

**IDs de auditoría relacionados**: CI-002, REQ-029

## Objetivo

Unificar la lógica de high-progress MPD failure en un solo método estático en `DownloadErrorClassifier` (creado en tarea 05).

## Alcance

### Código afectado

- `android/src/main/java/com/brentvatne/react/downloads/DownloadErrorClassifier.java` — añadir `isHighProgressMpdFailure()`
- `android/src/main/java/com/brentvatne/offline/AxDownloadTracker.java`:
  - `getDownloadRequest()` (líneas ~196-227) — reemplazar lógica inline
  - `onDownloadChanged()` (líneas ~272-353) — reemplazar lógica inline
- `android/src/main/java/com/brentvatne/offline/AxOfflineManager.java`:
  - `configureDownloadManager()` (líneas ~260-296) — reemplazar lógica inline

### Fuera de alcance

- NO cambiar los thresholds (unificar al valor más conservador tras validar)
- NO eliminar el `if (is404Error || true)` sin confirmar que es intencional

## Requisitos funcionales

1. **[REQ-029]**: Las descargas MPD fallidas con alto progreso (>85% segmentos o >80% bytes) deben seguir tratándose como exitosas.

## Requisitos técnicos

1. Nuevo método estático en `DownloadErrorClassifier`:
```java
public static boolean isHighProgressMpdFailure(
    Download download,
    double progressThreshold,  // ej: 85.0
    double bytesThreshold      // ej: 0.80
);
```
2. Constantes unificadas:
```java
public static final double HIGH_PROGRESS_THRESHOLD = 85.0;
public static final double HIGH_BYTES_THRESHOLD = 0.80;
```
3. Los 3 ficheros llaman a `DownloadErrorClassifier.isHighProgressMpdFailure()` en lugar de implementar su propia lógica

## Cambios de contrato

- **[CI-002]**: Si los thresholds difieren entre los 3 puntos, unificarlos cambia el comportamiento. Verificar en `/verify` que los thresholds son iguales o documentar la diferencia.

## Criterios de aceptación

### Funcionales
- [ ] La lógica de high-progress MPD existe solo en `DownloadErrorClassifier`
- [ ] Los 3 ficheros delegan a `DownloadErrorClassifier.isHighProgressMpdFailure()`
- [ ] El `if (is404Error || true)` está documentado o corregido
- [ ] Descargas MPD fallidas al >85% se tratan como exitosas

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `./gradlew :react-native-video:test` ✅
- [ ] Tests nuevos de `isHighProgressMpdFailure()` cubren: progreso alto → true, progreso bajo → false, no-MPD → false

### Calidad
- [ ] Sin errores de compilación: `./gradlew :react-native-video:assembleDebug` ✅

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `DownloadErrorClassifierTest.java` — se amplía con tests de `isHighProgressMpdFailure()`

### Tests nuevos a crear

- Ampliar `DownloadErrorClassifierTest.java`:
  - Test: descarga MPD al 90% → true
  - Test: descarga MPD al 50% → false
  - Test: descarga HLS al 90% → false (solo aplica a MPD)
  - Test: descarga MPD al 85% exacto → true (boundary)
  - Test: descarga MPD con 82% bytes pero 50% progreso → false

## Dependencias

### Tareas previas requeridas
- Tarea 05: DownloadErrorClassifier existe

### Tareas que dependen de esta
- Tarea 22: Limpieza final

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: los thresholds pueden diferir intencionalmente entre los 3 puntos
- **Mitigación**: en `/verify`, comparar los thresholds exactos de los 3 puntos. Si difieren, documentar y usar el más conservador.
- **Rollback**: `git revert HEAD`

## Estimación

1-2 horas

## Notas

- El `if (is404Error || true)` en `AxDownloadTracker.onDownloadChanged()` (línea ~280) hace que la condición siempre sea true. Esto parece un hack temporal que se dejó en producción. Verificar con el equipo si es intencional antes de corregir.
- La auditoría marca como "Pendiente de confirmar" si los thresholds son intencionalmente diferentes. Resolver en `/verify`.
