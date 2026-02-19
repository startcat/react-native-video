# Plan de Implementación: Extraer NativeEventBridge

> Basado en spec.md | Generado el 2026-02-19

## Resumen ejecutivo

- **Objetivo**: Extraer ~400 líneas de handlers de eventos nativos del QueueManager a una clase independiente NativeEventBridge
- **Fases**: 3
- **Estimación**: 1.5–2 horas
- **Riesgo general**: Medio

## Pre-requisitos

### Estado de git requerido

- Branch base: `refactor_offline`
- Branch de trabajo: `refactor_offline_tasks/15-extraer-native-event-bridge` ✅

### Checklist

- [x] Spec revisado y aprobado
- [x] Baseline verificado (262 tests passing)
- [x] Branch creado
- [x] Task 14 (DownloadStateStore) mergeada

---

## Fases de implementación

### Fase 1: Crear NativeEventBridge con tests

**Objetivo**: Crear la clase NativeEventBridge con toda la lógica de traducción de eventos y sus tests unitarios.

**Archivos a crear**:

- `managers/queue/NativeEventBridge.ts` — clase con setup/teardown, suscripciones a NativeManager y BinaryDownloadService, traducción de formatos, mapeo de estados
- `__tests__/managers/queue/NativeEventBridge.test.ts` — 12 tests unitarios

**Cambios específicos**:

1. Definir interfaces `EventBridgeCallbacks`, `EventBridgeDependencies`, `NativeProgressData`
2. Implementar constructor que recibe deps, callbacks y logger
3. Implementar `setup()`:
   - Suscribir a `nativeManager.subscribe("download_progress")` → parsear datos → filtrar (isPaused, isBeingRemoved, hasDownload) → invocar `callbacks.onProgress()`
   - Suscribir a `nativeManager.subscribe("download_state_changed")` → parsear datos → mapear estado → invocar `callbacks.onStateChanged()`
   - Suscribir a `nativeManager.subscribe("download_completed")` → parsear datos → invocar `callbacks.onCompleted()`
   - Suscribir a `nativeManager.subscribe("download_error")` → parsear error (string/object/nested) → invocar `callbacks.onFailed()`
   - Suscribir a `binaryDownloadService.subscribe(PROGRESS)` → normalizar campos (taskId→downloadId, bytesWritten→bytesDownloaded) → invocar `callbacks.onProgress()`
   - Suscribir a `binaryDownloadService.subscribe(COMPLETED)` → normalizar campos → invocar `callbacks.onCompleted()`
   - Suscribir a `binaryDownloadService.subscribe(FAILED)` → normalizar campos → invocar `callbacks.onFailed()`
4. Implementar `teardown()`: llamar a todas las unsubscribe functions almacenadas
5. Implementar `mapNativeStateToInternal()` como método privado (copiar exactamente de QueueManager)
6. Escribir 12 tests con mocks de NativeManager y BinaryDownloadService

**Invariantes que podrían verse afectados**:

- Ninguno — esta fase solo crea código nuevo, no modifica código existente

**Punto de verificación**:

```bash
npx jest --testPathPattern="NativeEventBridge" --no-coverage
```

**Estimación**: 45 min

---

### Fase 2: Integrar NativeEventBridge en QueueManager

**Objetivo**: Reemplazar `setupNativeEventListeners()` y `setupBinaryEventListeners()` por instanciación de NativeEventBridge, y eliminar los handlers que ahora están en el bridge.

**Archivos a modificar**:

- `managers/QueueManager.ts` — reemplazar setup de listeners por NativeEventBridge, eliminar handlers movidos

**Cambios específicos**:

1. Añadir import de `NativeEventBridge` y sus tipos
2. Añadir propiedad privada `private eventBridge: NativeEventBridge`
3. En `initialize()`: reemplazar `this.setupNativeEventListeners()` por creación e instanciación de `NativeEventBridge` con callbacks que delegan a los métodos internos del QueueManager
4. Crear métodos callback privados en QueueManager que contengan la lógica de procesamiento que NO se movió al bridge:
   - `handleBridgeProgress(downloadId, progressData)` — contiene la lógica de updateDownloadProgress, cálculos de bytes/speed/remainingTime, throttling, emisión de eventos
   - `handleBridgeCompleted(downloadId, fileUri, fileSize)` — delega a `notifyDownloadCompleted`
   - `handleBridgeFailed(downloadId, error)` — busca item en store, delega a `handleDownloadFailure`
   - `handleBridgeStateChanged(downloadId, state, rawState, extraData)` — contiene la lógica de updateDownloadState, emisión de eventos específicos, re-procesamiento de cola
5. Eliminar métodos: `setupNativeEventListeners()`, `setupBinaryEventListeners()`, `handleNativeProgressEvent()`, `handleNativeStateEvent()`, `handleNativeCompletedEvent()`, `handleNativeErrorEvent()`, `mapNativeStateToInternal()`
6. En `destroy()`: añadir `this.eventBridge.teardown()` (fix del bug pre-existente de listeners no desuscriptos)

**Invariantes que podrían verse afectados**:

- Event flow native→QueueManager: preservado via callbacks
- State mapping: preservado (misma lógica en bridge)
- isBeingRemoved filter: preservado (bridge filtra antes de invocar callback)

**Punto de verificación**:

```bash
npx jest --testPathPattern="src/player/features/offline/__tests__" --no-coverage
```

**Estimación**: 45 min

---

### Fase 3: Verificación final y limpieza

**Objetivo**: Verificar que todos los tests pasan, no hay errores de TypeScript en los archivos modificados, y el código está limpio.

**Archivos a revisar**:

- `managers/QueueManager.ts` — verificar que no quedan referencias a métodos eliminados
- `managers/queue/NativeEventBridge.ts` — verificar que no hay imports innecesarios

**Cambios específicos**:

1. Ejecutar tests completos
2. Verificar TypeScript compilation en archivos offline
3. Verificar que `grep -n "handleNative\|setupNative\|setupBinary\|mapNativeState" QueueManager.ts` no devuelve resultados
4. Contar líneas eliminadas del QueueManager

**Punto de verificación**:

```bash
npx jest --testPathPattern="src/player/features/offline/__tests__" --no-coverage
npx tsc --noEmit --pretty 2>&1 | grep -E "(QueueManager|NativeEventBridge|DownloadStateStore)" | head -10
```

**Estimación**: 15 min

---

## Orden de ejecución

```
┌─────────────────────────────┐
│ Fase 1: Crear bridge+tests  │
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│ Fase 2: Integrar en QM      │
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│ Fase 3: Verificación final   │
└─────────────────────────────┘
```

Todas las fases son secuenciales.

## Testing por fase

| Fase | Tests unitarios | Tests integración | Verificación |
|------|----------------|-------------------|--------------|
| 1 | NativeEventBridge.test.ts (12 tests) | — | Solo tests nuevos |
| 2 | — | QueueManager.contract.test.ts (existentes) | Todos los tests offline |
| 3 | — | — | Tests completos + TypeScript |

## Rollback global

```bash
git checkout refactor_offline
git branch -D refactor_offline_tasks/15-extraer-native-event-bridge
```

## Aprobación

- [ ] Plan revisado
- [ ] Orden de fases aprobado
- [ ] Listo para implementar
