# Tarea: Extraer DownloadProgressTracker.swift

> Tarea 13 de 20 | Fase D: Extracciones de riesgo medio
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`DownloadsModule2.swift` contiene ~150 líneas de lógica de timer de progreso, cálculo de velocidad/tiempo restante, y throttling de eventos (incrementos de 1%). Esta lógica gestiona un `Timer` que consulta periódicamente el estado de descargas activas y decide cuándo emitir eventos de progreso. Extraerla es de riesgo medio porque involucra un timer con lifecycle propio.

**IDs de auditoría relacionados**: SA-01, REQ-021, REQ-024, NC-008

## Objetivo

Extraer la lógica de tracking de progreso a `DownloadProgressTracker.swift`, incluyendo el timer, cálculo de velocidad y throttling de eventos.

## Alcance

### Código afectado

- `ios/Downloads_v2/DownloadsModule2.swift` — extraer funciones: `startProgressTimerIfNeeded()` (líneas 1283-1308), `stopProgressTimerIfNotNeeded()` (líneas 1311-1321), `invalidateProgressTimer()` (líneas 1324-1332), `checkProgressUpdates()` (líneas 1335-1348), cálculo de progreso dentro de `urlSession(didLoad:...)` (líneas 1994-2065), propiedades `progressTimer`, `lastProgressUpdate`, `lastReportedProgress`
- `ios/Downloads_v2/DownloadProgressTracker.swift` — **nuevo fichero**

### Fuera de alcance

- NO extraer el delegado de sesión completo (tarea 14)
- NO cambiar la frecuencia del timer ni la lógica de throttling

## Requisitos funcionales

1. **[REQ-021]**: Reportar progreso de descarga con incrementos de 1%
2. **[REQ-024]**: Calcular velocidad de descarga y tiempo restante

## Requisitos técnicos

1. Clase `DownloadProgressTracker` en `ios/Downloads_v2/`
2. Interfaz pública según sección A6 de `02-propuesta-segmentacion.md`
3. Protocolo `DownloadProgressDelegate` para notificar al módulo principal
4. Depende de `DownloadTypes` (para `DownloadInfo`, `DownloadProgressUpdate`)
5. El timer usa `[weak self]` y se invalida en `deinit`
6. `DownloadsModule2` implementa `DownloadProgressDelegate`

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] Timer de progreso gestionado por `DownloadProgressTracker`
- [ ] `DownloadsModule2` ya no tiene propiedades de timer ni de progreso
- [ ] El throttling de 1% sigue funcionando
- [ ] El timer se invalida en `deinit` de `DownloadProgressTracker`
- [ ] El proyecto compila sin errores

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅
- [ ] Tests nuevos cubren: shouldEmitProgress (throttling), timer start/stop, cálculo de velocidad

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `ios/Tests/DownloadsModule2StateTests.swift` — valida que las operaciones de descarga siguen emitiendo progreso

### Tests nuevos a crear

- `ios/Tests/DownloadProgressTrackerTests.swift`:
  - `testShouldEmitProgress_firstCall_returnsTrue`: Primera llamada siempre emite
  - `testShouldEmitProgress_samePercent_returnsFalse`: Mismo porcentaje → no emite
  - `testShouldEmitProgress_nextPercent_returnsTrue`: Siguiente porcentaje → emite
  - `testUpdateProgress_calculatesSpeed`: Verifica cálculo de bytes/s
  - `testUpdateProgress_calculatesRemainingTime`: Verifica estimación de tiempo
  - `testReset_clearsState`: Reset para un downloadId limpia estado de progreso

## Dependencias

### Tareas previas requeridas
- Tarea 05 (DownloadTypes): necesita `DownloadInfo`, `DownloadProgressUpdate`

### Tareas que dependen de esta
- Tarea 14 (DownloadSessionDelegate): usa `DownloadProgressTracker` para calcular progreso en callbacks

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: El timer interactúa con el RunLoop y puede comportarse diferente en tests que en producción. El cálculo de velocidad depende de timestamps reales.
- **Mitigación**: Los tests de throttling no dependen del timer (son lógica pura). Los tests del timer verifican start/stop/invalidate sin depender de timing exacto.
- **Rollback**: `git revert HEAD`

## Estimación

1.5-2.5 horas

## Notas

- El `deinit` de `DownloadProgressTracker` debe invalidar el timer (resuelve NC-008 de forma estructural).
- La struct `DownloadProgressUpdate` (progress, downloadedBytes, totalBytes, speed, remainingTime) se define en `DownloadTypes.swift` si no existe ya.
- El cálculo de velocidad usa `Date()` para medir el tiempo entre actualizaciones. En tests, se puede inyectar un `DateProvider` o simplemente verificar que el cálculo es correcto con valores conocidos.
