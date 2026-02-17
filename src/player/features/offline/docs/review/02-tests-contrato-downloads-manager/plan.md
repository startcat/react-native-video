# Plan de Implementación: Tests de contrato — DownloadsManager

> Basado en spec.md | Generado el 2026-02-17

## Resumen ejecutivo

- **Objetivo**: Escribir 59 tests de contrato que capturen el comportamiento actual del DownloadsManager
- **Fases**: 5
- **Estimación**: 2–3 horas
- **Riesgo general**: Bajo

## Pre-requisitos

### Dependencias a instalar/actualizar

```bash
# Ninguna — todas las dependencias ya están instaladas (tarea 01)
```

### Configuración previa

- [x] `jest.config.js` configurado (tarea 01)
- [x] `eventemitter3` instalado como devDependency (tarea 01)
- [x] `__DEV__: true` en globals de Jest (tarea 01)

### Estado de git requerido

- Branch base: `refactor_offline`
- Branch de trabajo: `refactor_offline_tasks/02-tests-contrato-downloads-manager` (ya creado)

---

## Fases de implementación

### Fase 1: Estructura base — mocks y helpers

**Objetivo**: Crear el archivo de test con todos los mocks de las 9 dependencias y el helper `createMockDownloadItem`

**Archivos a crear**:

- `src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts` — archivo de test principal

**Cambios específicos**:

1. Crear 9 bloques `jest.mock()` para todas las dependencias del DownloadsManager:
   - `../../managers/QueueManager` — mock completo con 20+ métodos
   - `../../services/download/DownloadService` — mock con 9 métodos
   - `../../services/download/StreamDownloadService` — mock con `setNetworkPolicy`
   - `../../services/download/BinaryDownloadService` — mock con `setNetworkPolicy`
   - `../../managers/NativeManager` — mock con 5 métodos
   - `../../managers/ConfigManager` — mock con 3 métodos
   - `../../managers/ProfileManager` — mock con 6 métodos
   - `../../services/network/NetworkService` — mock con 7 métodos
   - `../../services/storage/StorageService` — mock con 6 métodos
2. Crear función helper `createMockDownloadItem(overrides)` que retorne un `DownloadItem` válido
3. Crear función helper `createMockStreamTask(overrides)` para tareas stream
4. Crear función helper `createMockBinaryTask(overrides)` para tareas binarias
5. Crear bloque `describe('DownloadsManager — Contrato público')` con `beforeEach`/`afterEach`:
   - Reset singleton: `DownloadsManager['instance'] = undefined`
   - Obtener instancia: `DownloadsManager.getInstance()`
   - Inicializar con: `{ autoStart: false, logEnabled: false, maxConcurrentDownloads: 3 }`
   - Limpiar mocks: `jest.clearAllMocks()`
   - afterEach: `manager.destroy()`
6. Usar `import` + `jest.mocked` para acceder a mocks (no `require()`)
7. Añadir `/* eslint-disable dot-notation */` al inicio del archivo
8. Usar `@ts-expect-error -- reset singleton` para acceso a propiedad privada

**Punto de verificación**:

```bash
npx jest src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts --no-coverage 2>&1 | tail -5
# Esperado: 0 tests, 0 suites (archivo compila pero sin tests aún)
```

**Estimación**: 30 min

---

### Fase 2: Tests de inicialización, CRUD y control individual (tests #1–#21)

**Objetivo**: Implementar tests para `initialize`, `addDownload`, `startDownloadNow`, `removeDownload`, `pauseDownload`, `resumeDownload`

**Archivos a modificar**:

- `src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts`

**Cambios específicos**:

1. **describe('initialize')** — 4 tests (#1–#4):
   - #1: Marca `isInitialized = true`
   - #2: Idempotente (segunda llamada no falla)
   - #3: Aplica config parcial
   - #4: Inicializa sub-servicios (verifica que mocks de initialize fueron llamados)

2. **describe('addDownload')** — 5 tests (#5–#9):
   - #5: Stream delega a `queueManager.addDownloadItem` con item correcto
   - #6: Binary delega a `queueManager.addDownloadItem` con `type=BINARY`
   - #7: Tipo no habilitado → lanza `PlayerError`
   - #8: Sin inicializar → lanza error
   - #9: Retorna el ID de la tarea

3. **describe('startDownloadNow')** — 2 tests (#10–#11):
   - #10: Delega a `downloadService.startDownload`
   - #11: Sin inicializar → lanza error

4. **describe('removeDownload')** — 5 tests (#12–#16):
   - #12: Cancela en servicio si DOWNLOADING
   - #13: Llama a `forceRemoveDownload`
   - #14: Limpia en nativeManager siempre
   - #15: No falla si item no existe en queue
   - #16: Elimina archivo binario completado

5. **describe('pauseDownload')** — 2 tests (#17–#18):
   - #17: Delega a `downloadService.pauseDownload` con id y tipo
   - #18: Item no existe → lanza error

6. **describe('resumeDownload')** — 3 tests (#19–#21):
   - #19: Stream delega a `downloadService.resumeDownload`
   - #20: Binary: recreación (remove + add) — mock `queueManager.getDownload` retorna item completo, verificar secuencia
   - #21: Item no existe → lanza error

**Punto de verificación**:

```bash
npx jest src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts --no-coverage 2>&1 | tail -10
# Esperado: 21 tests passing
```

**Estimación**: 45 min

---

### Fase 3: Tests de control masivo y sistema (tests #22–#34)

**Objetivo**: Implementar tests para `pauseAll`, `resumeAll`, `start`, `stop`

**Archivos a modificar**:

- `src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts`

**Cambios específicos**:

1. **describe('pauseAll')** — 5 tests (#22–#26):
   - #22: Marca `isPaused = true` en state
   - #23: Delega a `queueManager.pauseAll`
   - #24: Pausa binarios activos via `downloadService.pauseDownload`
   - #25: Detiene procesamiento nativo (`nativeManager.stopDownloadProcessing`)
   - #26: Sin inicializar → lanza error

2. **describe('resumeAll')** — 4 tests (#27–#30):
   - #27: Marca `isPaused = false`
   - #28: Limpia huérfanas (`queueManager.forceCleanupOrphanedDownloads`)
   - #29: Delega a `queueManager.resumeAll`
   - #30: Inicia procesamiento nativo (`nativeManager.startDownloadProcessing`)

3. **describe('start')** — 3 tests (#31–#33):
   - #31: `isProcessing = true` en state
   - #32: Delega a `queueManager.start`
   - #33: Inicia procesamiento nativo

4. **describe('stop')** — 1 test (#34):
   - #34: Llama a `pauseAll` internamente

**Punto de verificación**:

```bash
npx jest src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts --no-coverage 2>&1 | tail -10
# Esperado: 34 tests passing
```

**Estimación**: 30 min

---

### Fase 4: Tests de consulta y estadísticas (tests #35–#48)

**Objetivo**: Implementar tests para `getDownloads`, `getDownload`, `getActiveDownloads`, `getQueuedDownloads`, `getCompletedDownloads`, `getFailedDownloads`, `getQueueStats`, `subscribe`

**Archivos a modificar**:

- `src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts`

**Cambios específicos**:

1. **describe('getDownloads')** — 3 tests (#35–#37):
   - #35: Delega a `queueManager.getAllDownloads`
   - #36: Filtra por perfil si habilitado (`profileManager.filterByActiveProfile`)
   - #37: Retorna `[]` si no inicializado

2. **describe('getDownload')** — 2 tests (#38–#39):
   - #38: Delega a `queueManager.getDownload`
   - #39: Retorna `null` si no inicializado

3. **describe('getActiveDownloads / getQueuedDownloads / getCompletedDownloads / getFailedDownloads')** — 4 tests (#40–#43):
   - #40: Filtra por DOWNLOADING/PREPARING
   - #41: Filtra por QUEUED
   - #42: Filtra por COMPLETED
   - #43: Filtra por FAILED

4. **describe('getQueueStats')** — 3 tests (#44–#46):
   - #44: Retorna stats del queueManager
   - #45: Cache: segunda llamada inmediata no recalcula (verificar 1 sola llamada a mock)
   - #46: Sin inicializar: retorna stats vacías con todos los contadores a 0

5. **describe('subscribe')** — 2 tests (#47–#48):
   - #47: Retorna función de unsubscribe
   - #48: Unsubscribe no lanza error

**Punto de verificación**:

```bash
npx jest src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts --no-coverage 2>&1 | tail -10
# Esperado: 48 tests passing
```

**Estimación**: 30 min

---

### Fase 5: Tests de configuración, estado y lifecycle (tests #49–#59)

**Objetivo**: Implementar tests para `updateConfig`, `getConfig`, `getState`, `isInitialized`, `isProcessing`, `isPaused`, `cleanupOrphanedDownloads`, `destroy`

**Archivos a modificar**:

- `src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts`

**Cambios específicos**:

1. **describe('updateConfig')** — 3 tests (#49–#51):
   - #49: Actualiza config y propaga a `queueManager.updateConfig`
   - #50: `getConfig` retorna copia (mutación externa no afecta)
   - #51: Habilitar/deshabilitar tipos propaga a `downloadService`

2. **describe('getState / isInitialized / isProcessing / isPaused')** — 4 tests (#52–#55):
   - #52: `getState` retorna copia
   - #53: `isInitialized` refleja estado real
   - #54: `isProcessing` delega a `queueManager.getQueueStats`
   - #55: `isPaused` delega a `queueManager.getQueueStats`

3. **describe('cleanupOrphanedDownloads')** — 2 tests (#56–#57):
   - #56: Delega a `queueManager.forceCleanupOrphanedDownloads`
   - #57: Sin inicializar → lanza error

4. **describe('destroy')** — 2 tests (#58–#59):
   - #58: Marca `isInitialized = false`
   - #59: Limpia event listeners (no lanza error)

**Punto de verificación**:

```bash
npx jest src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts --no-coverage 2>&1 | tail -10
# Esperado: 59 tests passing
```

**Estimación**: 30 min

---

## Orden de ejecución

```
┌─────────┐
│ Fase 1  │  Estructura base (mocks + helpers)
└────┬────┘
     │
┌────▼────┐
│ Fase 2  │  Init + CRUD + Control individual (21 tests)
└────┬────┘
     │
┌────▼────┐
│ Fase 3  │  Control masivo + Sistema (13 tests)
└────┬────┘
     │
┌────▼────┐
│ Fase 4  │  Consulta + Estadísticas (14 tests)
└────┬────┘
     │
┌────▼────┐
│ Fase 5  │  Config + Estado + Lifecycle (11 tests)
└─────────┘
```

### Dependencias entre fases

- Fase 2 depende de: Fase 1 (necesita mocks y helpers)
- Fase 3 depende de: Fase 2 (puede reusar patrones)
- Fase 4 depende de: Fase 1 (solo necesita mocks)
- Fase 5 depende de: Fase 1 (solo necesita mocks)

### Fases paralelas

- Ninguna — todas modifican el mismo archivo, ejecución secuencial

### Puntos de no retorno

- Ninguno — todo el trabajo es un solo archivo de test nuevo, rollback trivial

## Testing por fase

| Fase | Tests | Verificación |
| ---- | ----- | ------------ |
| 1    | 0 (estructura) | Archivo compila sin errores |
| 2    | 21 | `npx jest ...DownloadsManager.contract.test.ts` → 21 passing |
| 3    | 34 acumulados | → 34 passing |
| 4    | 48 acumulados | → 48 passing |
| 5    | 59 acumulados | → 59 passing |

## Commit por fase

| Fase | Mensaje de commit |
| ---- | ----------------- |
| 1    | `test(offline): scaffold DownloadsManager contract test with mocks` |
| 2    | `test(offline): add init, CRUD and individual control tests (#1-#21)` |
| 3    | `test(offline): add bulk control and system tests (#22-#34)` |
| 4    | `test(offline): add query and stats tests (#35-#48)` |
| 5    | `test(offline): add config, state and lifecycle tests (#49-#59)` |

## Checklist pre-implementación

- [x] Spec revisado y aprobado
- [x] Baseline verificado sin bloqueos
- [x] Branch creado (`refactor_offline_tasks/02-tests-contrato-downloads-manager`)
- [x] Entorno de desarrollo limpio
- [x] Tests actuales pasando (41/41 QueueManager)

## Rollback global

```bash
# Opción 1: Eliminar el archivo de test
rm src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts

# Opción 2: Reset commits de esta tarea
git log --oneline | head -5
git reset --soft HEAD~[N]  # N = número de commits de esta tarea
```

## Aprobación

- [x] Plan revisado
- [x] Orden de fases aprobado
- [x] Listo para implementar
