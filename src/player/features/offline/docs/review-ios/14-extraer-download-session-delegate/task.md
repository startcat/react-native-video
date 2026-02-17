# Tarea: Extraer DownloadSessionDelegate.swift

> Tarea 14 de 20 | Fase D: Extracciones de riesgo medio
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`DownloadsModule2.swift` implementa `AVAssetDownloadDelegate` directamente (~280 líneas), mezclando callbacks del sistema iOS con lógica de negocio (finalización, validación de integridad, manejo de errores). Extraer el delegado a una clase separada es la extracción más arriesgada del plan porque toca los callbacks que iOS invoca directamente.

**IDs de auditoría relacionados**: SA-01, SA-05, REQ-021, REQ-022, REQ-029, REQ-031

## Objetivo

Extraer la implementación de `AVAssetDownloadDelegate` a `DownloadSessionDelegate.swift`, comunicándose con el módulo principal vía protocolo `DownloadSessionEventHandler`.

## Alcance

### Código afectado

- `ios/Downloads_v2/DownloadsModule2.swift` — extraer: extensión `AVAssetDownloadDelegate` (líneas 1975-2258), `finalizeDownload()` (líneas 2260-2332), callback `urlSession(_:taskIsWaitingForConnectivity:)` (líneas 2902-2927)
- `ios/Downloads_v2/DownloadSessionDelegate.swift` — **nuevo fichero**

### Fuera de alcance

- NO cambiar la lógica de finalización ni de manejo de errores
- NO cambiar cómo se crea la `AVAssetDownloadURLSession` (sigue en DownloadsModule2)
- NO extraer la lógica de purga (se queda en DownloadsModule2)

## Requisitos funcionales

1. **[REQ-021]**: Reportar progreso de descarga vía delegado
2. **[REQ-022]**: Emitir eventos de cambio de estado (preparing, downloading, completed, failed, waitingForNetwork)
3. **[REQ-029]**: Validar integridad de asset al completar descarga
4. **[REQ-031]**: Manejar recovery de tareas pendientes tras restart

## Requisitos técnicos

1. Clase `DownloadSessionDelegate: NSObject, AVAssetDownloadDelegate` en `ios/Downloads_v2/`
2. Interfaz pública según sección A7 de `02-propuesta-segmentacion.md`
3. Protocolo `DownloadSessionEventHandler` para comunicar eventos al módulo principal
4. Depende de `DownloadProgressTracker`, `DownloadValidator`, `DownloadTypes`
5. Closures `findDownloadId` y `getDownloadInfo` para acceder al estado del módulo sin acoplamiento directo
6. `DownloadsModule2` implementa `DownloadSessionEventHandler` y asigna el delegado a la sesión

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] `DownloadSessionDelegate` implementa todos los métodos de `AVAssetDownloadDelegate`
- [ ] `DownloadsModule2` ya no implementa `AVAssetDownloadDelegate` directamente
- [ ] `DownloadsModule2` implementa `DownloadSessionEventHandler` para recibir eventos
- [ ] La sesión de descarga usa `DownloadSessionDelegate` como delegate
- [ ] El proyecto compila sin errores

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅
- [ ] Tests nuevos cubren: handleDownloadCompleted, handleDownloadFailed, handleProgress, handleWaitingForConnectivity

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `ios/Tests/DownloadsModule2StateTests.swift` — valida operaciones CRUD y progreso
- `ios/Tests/DownloadValidationTests.swift` — valida integridad de assets
- Estos tests NO se modifican

### Tests nuevos a crear

- `ios/Tests/DownloadSessionDelegateTests.swift`:
  - `testDidCompleteWithError_nil_callsHandleCompleted`: Completado sin error → handleDownloadCompleted
  - `testDidCompleteWithError_withError_callsHandleFailed`: Completado con error → handleDownloadFailed
  - `testDidCompleteWithError_404Above98Percent_callsHandleCompleted`: Error 404 con >98% → handleDownloadCompleted (comportamiento actual NC-013)
  - `testDidLoad_callsHandleProgress`: Progreso → handleDownloadProgress
  - `testWillDownloadTo_callsHandleLocationDetermined`: Ubicación → handleDownloadLocationDetermined
  - `testWaitingForConnectivity_callsHandler`: Espera → handleDownloadWaitingForConnectivity

## Dependencias

### Tareas previas requeridas
- Tarea 08 (DownloadValidator): usa `validateAssetIntegrity` en `finalizeDownload`
- Tarea 13 (DownloadProgressTracker): usa tracker para calcular progreso en callbacks

### Tareas que dependen de esta
- Ninguna directa

## Riesgo

- **Nivel**: medio-alto
- **Principal riesgo**: El delegado de sesión es invocado por iOS en una queue específica. Cambiar quién implementa el protocolo puede afectar el threading. Además, `finalizeDownload()` accede a `activeDownloads` que está en el módulo principal.
- **Mitigación**: El delegado comunica vía protocolo `DownloadSessionEventHandler`, que el módulo implementa. El módulo sigue gestionando `activeDownloads`. El delegado solo procesa los callbacks y notifica.
- **Rollback**: `git revert HEAD`

## Estimación

2-3 horas

## Notas

- Esta es la tarea más arriesgada de la Fase D. Si causa problemas, considerar un approach más conservador: extraer solo `finalizeDownload()` primero, dejar los callbacks de delegado en DownloadsModule2, y mover los callbacks en una tarea posterior.
- Los closures `findDownloadId` y `getDownloadInfo` evitan que el delegado tenga una referencia directa al módulo, manteniendo el desacoplamiento.
- El manejo de error 404 con >98% de progreso (NC-013) se mantiene tal cual. Es un compromiso documentado.
