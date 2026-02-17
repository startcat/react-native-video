# Especificación Técnica: Tests de contrato — DownloadsManager

> Generado a partir de task.md el 2026-02-17

## Resumen

Escribir tests de contrato que capturen el comportamiento actual del `DownloadsManager` (1630 líneas) para servir como red de seguridad durante la refactorización posterior del módulo offline.

## 1. Alcance

### Módulos afectados

**Directos:**

- `managers/DownloadsManager.ts`: código bajo test (NO se modifica)

**Indirectos:**

- Ninguno — esta tarea solo crea tests, no modifica código de producción

### Dependencias a mockear

| Dependencia             | Tipo      | Mock necesario                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QueueManager`          | Singleton | `initialize`, `addDownloadItem`, `getDownload`, `getDownloadType`, `getAllDownloads`, `getQueueStats`, `forceRemoveDownload`, `forceCleanupOrphanedDownloads`, `pauseAll`, `resumeAll`, `start`, `setMaxConcurrent`, `subscribe`, `updateConfig`, `removeDownload`, `notifyDownloadProgress`, `notifyDownloadFailed`, `notifyDownloadCompleted`, `notifyDownloadPaused`, `notifyDownloadResumed`, `notifyDownloadStateChange` |
| `DownloadService`       | Singleton | `initialize`, `startDownload`, `pauseDownload`, `resumeDownload`, `cancelDownload`, `isTypeEnabled`, `getConfig`, `enableDownloadType`, `disableDownloadType`                                                                                                                                                                                                                                                                 |
| `StreamDownloadService` | Singleton | `setNetworkPolicy`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `BinaryDownloadService` | Singleton | `setNetworkPolicy`                                                                                                                                                                                                                                                                                                                                                                                                            |
| `NetworkService`        | Singleton | `initialize`, `isOnline`, `isWifiConnected`, `canDownload`, `getCurrentStatus`, `setNetworkPolicy`, `subscribe`                                                                                                                                                                                                                                                                                                               |
| `StorageService`        | Singleton | `initialize`, `isLowSpace`, `getStorageInfo`, `getBinariesDirectory`, `deleteFile`, `subscribe`                                                                                                                                                                                                                                                                                                                               |
| `ConfigManager`         | Singleton | `initialize`, `getConfig`, `subscribe`                                                                                                                                                                                                                                                                                                                                                                                        |
| `ProfileManager`        | Singleton | `initialize`, `getActiveProfileId`, `getActiveProfile`, `filterByActiveProfile`, `shouldShowContent`, `subscribe`                                                                                                                                                                                                                                                                                                             |
| `NativeManager`         | Singleton | `initialize`, `removeDownload`, `startDownloadProcessing`, `stopDownloadProcessing`, `subscribe`                                                                                                                                                                                                                                                                                                                              |

### Archivos a crear

- `src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts`

### Archivos de configuración

- `jest.config.js` — ya existe (creado en tarea 01)

## 2. Contratos

### API pública bajo test

| Método                         | Firma esperada                                                                            | Categoría      |
| ------------------------------ | ----------------------------------------------------------------------------------------- | -------------- |
| `initialize(config?)`          | `(config?: Partial<DownloadsManagerConfig>) => Promise<void>`                             | Inicialización |
| `addDownload(task, type)`      | `(task: BinaryDownloadTask \| StreamDownloadTask, type: DownloadType) => Promise<string>` | CRUD           |
| `startDownloadNow(task, type)` | `(task: BinaryDownloadTask \| StreamDownloadTask, type: DownloadType) => Promise<string>` | CRUD           |
| `removeDownload(downloadId)`   | `(downloadId: string) => Promise<void>`                                                   | CRUD           |
| `pauseDownload(downloadId)`    | `(downloadId: string) => Promise<void>`                                                   | Control        |
| `resumeDownload(downloadId)`   | `(downloadId: string) => Promise<void>`                                                   | Control        |
| `pauseAll()`                   | `() => Promise<void>`                                                                     | Control        |
| `resumeAll()`                  | `() => Promise<void>`                                                                     | Control        |
| `start()`                      | `() => Promise<void>`                                                                     | Control        |
| `stop()`                       | `() => Promise<void>`                                                                     | Control        |
| `getDownloads()`               | `() => DownloadItem[]`                                                                    | Consulta       |
| `getDownload(downloadId)`      | `(downloadId: string) => DownloadItem \| null`                                            | Consulta       |
| `getActiveDownloads()`         | `() => DownloadItem[]`                                                                    | Consulta       |
| `getQueuedDownloads()`         | `() => DownloadItem[]`                                                                    | Consulta       |
| `getCompletedDownloads()`      | `() => DownloadItem[]`                                                                    | Consulta       |
| `getFailedDownloads()`         | `() => DownloadItem[]`                                                                    | Consulta       |
| `getQueueStats()`              | `() => QueueStats`                                                                        | Consulta       |
| `subscribe(event, callback)`   | `(event: DownloadEventType \| "all" \| string, cb: DownloadEventCallback) => () => void`  | Eventos        |
| `updateConfig(newConfig)`      | `(newConfig: Partial<DownloadsManagerConfig>) => void`                                    | Configuración  |
| `getConfig()`                  | `() => DownloadsManagerConfig`                                                            | Configuración  |
| `getState()`                   | `() => DownloadsManagerState`                                                             | Estado         |
| `isInitialized()`              | `() => boolean`                                                                           | Estado         |
| `isProcessing()`               | `() => boolean`                                                                           | Estado         |
| `isPaused()`                   | `() => boolean`                                                                           | Estado         |
| `cleanupOrphanedDownloads()`   | `() => Promise<number>`                                                                   | Gestión        |
| `destroy()`                    | `() => void`                                                                              | Lifecycle      |

### Tipos/interfaces necesarios (imports)

- `DownloadType` — enum (STREAM, BINARY)
- `DownloadStates` — enum de estados
- `DownloadEventType` — enum de tipos de evento
- `DownloadItem` — interfaz del item
- `BinaryDownloadTask` — interfaz de tarea binaria
- `StreamDownloadTask` — interfaz de tarea stream
- `DownloadsManagerConfig` — interfaz de configuración
- `QueueStats` — interfaz de estadísticas

## 3. Matriz de cobertura

### initialize

| #   | Caso                                   | Tipo       | Verificación                                                   |
| --- | -------------------------------------- | ---------- | -------------------------------------------------------------- |
| 1   | Marca isInitialized = true             | Normal     | `manager.isInitialized() === true`                             |
| 2   | Idempotente (segunda llamada no falla) | Límite     | `resolves.not.toThrow()`                                       |
| 3   | Aplica config parcial                  | Normal     | `manager.getConfig()` refleja valores pasados                  |
| 4   | Inicializa sub-servicios               | Invariante | `queueManager.initialize`, `configManager.initialize` llamados |

### addDownload

| #   | Caso                             | Tipo   | Verificación                                             |
| --- | -------------------------------- | ------ | -------------------------------------------------------- |
| 5   | Stream: delega a queueManager    | Normal | `queueManager.addDownloadItem` llamado con item correcto |
| 6   | Binary: delega a queueManager    | Normal | `queueManager.addDownloadItem` llamado con type=BINARY   |
| 7   | Tipo no habilitado → lanza error | Error  | `rejects.toThrow()`                                      |
| 8   | Sin inicializar → lanza error    | Error  | `rejects.toThrow()`                                      |
| 9   | Retorna el ID de la tarea        | Normal | Resultado === task.id                                    |

### startDownloadNow

| #   | Caso                                   | Tipo   | Verificación                            |
| --- | -------------------------------------- | ------ | --------------------------------------- |
| 10  | Delega a downloadService.startDownload | Normal | `downloadService.startDownload` llamado |
| 11  | Sin inicializar → lanza error          | Error  | `rejects.toThrow()`                     |

### removeDownload

| #   | Caso                                         | Tipo       | Verificación                                              |
| --- | -------------------------------------------- | ---------- | --------------------------------------------------------- |
| 12  | Cancela en servicio si está DOWNLOADING      | Normal     | `downloadService.cancelDownload` llamado                  |
| 13  | Llama a forceRemoveDownload del queueManager | Normal     | `queueManager.forceRemoveDownload` llamado                |
| 14  | Limpia en nativeManager siempre              | Invariante | `nativeManager.removeDownload` llamado                    |
| 15  | No falla si item no existe en queue          | Límite     | `resolves.not.toThrow()`                                  |
| 16  | Elimina archivo binario completado           | Normal     | `storageService.deleteFile` llamado para BINARY+COMPLETED |

### pauseDownload

| #   | Caso                                   | Tipo   | Verificación                                          |
| --- | -------------------------------------- | ------ | ----------------------------------------------------- |
| 17  | Delega a downloadService.pauseDownload | Normal | `downloadService.pauseDownload` llamado con id y tipo |
| 18  | Item no existe → lanza error           | Error  | `rejects.toThrow()`                                   |

### resumeDownload

| #   | Caso                                            | Tipo   | Verificación                                              |
| --- | ----------------------------------------------- | ------ | --------------------------------------------------------- |
| 19  | Stream: delega a downloadService.resumeDownload | Normal | `downloadService.resumeDownload` llamado                  |
| 20  | Binary: recreación (remove + add)               | Normal | `removeDownload` y `addDownload` llamados secuencialmente |
| 21  | Item no existe → lanza error                    | Error  | `rejects.toThrow()`                                       |

### pauseAll

| #   | Caso                                       | Tipo       | Verificación                                              |
| --- | ------------------------------------------ | ---------- | --------------------------------------------------------- |
| 22  | Marca isPaused = true                      | Normal     | `manager.getState().isPaused === true`                    |
| 23  | Delega a queueManager.pauseAll             | Normal     | `queueManager.pauseAll` llamado                           |
| 24  | Pausa binarios activos via downloadService | Normal     | `downloadService.pauseDownload` llamado para cada binario |
| 25  | Detiene procesamiento nativo               | Invariante | `nativeManager.stopDownloadProcessing` llamado            |
| 26  | Sin inicializar → lanza error              | Error      | `rejects.toThrow()`                                       |

### resumeAll

| #   | Caso                               | Tipo       | Verificación                                         |
| --- | ---------------------------------- | ---------- | ---------------------------------------------------- |
| 27  | Marca isPaused = false             | Normal     | `manager.getState().isPaused === false`              |
| 28  | Limpia huérfanas antes de reanudar | Invariante | `queueManager.forceCleanupOrphanedDownloads` llamado |
| 29  | Delega a queueManager.resumeAll    | Normal     | `queueManager.resumeAll` llamado                     |
| 30  | Inicia procesamiento nativo        | Invariante | `nativeManager.startDownloadProcessing` llamado      |

### start / stop

| #   | Caso                               | Tipo   | Verificación                                    |
| --- | ---------------------------------- | ------ | ----------------------------------------------- |
| 31  | start: isProcessing = true         | Normal | `manager.getState().isProcessing === true`      |
| 32  | start: delega a queueManager.start | Normal | `queueManager.start` llamado                    |
| 33  | start: inicia procesamiento nativo | Normal | `nativeManager.startDownloadProcessing` llamado |
| 34  | stop: llama a pauseAll             | Normal | Verifica que pauseAll se ejecuta                |

### getDownloads / getDownload

| #   | Caso                                                | Tipo   | Verificación                                   |
| --- | --------------------------------------------------- | ------ | ---------------------------------------------- |
| 35  | getDownloads: delega a queueManager.getAllDownloads | Normal | `queueManager.getAllDownloads` llamado         |
| 36  | getDownloads: filtra por perfil si habilitado       | Normal | `profileManager.filterByActiveProfile` llamado |
| 37  | getDownloads: retorna [] si no inicializado         | Límite | Resultado es array vacío                       |
| 38  | getDownload: delega a queueManager.getDownload      | Normal | `queueManager.getDownload` llamado             |
| 39  | getDownload: retorna null si no inicializado        | Límite | Resultado es null                              |

### getActiveDownloads / getQueuedDownloads / getCompletedDownloads / getFailedDownloads

| #   | Caso                                    | Tipo   | Verificación                      |
| --- | --------------------------------------- | ------ | --------------------------------- |
| 40  | Filtra por estado DOWNLOADING/PREPARING | Normal | Solo items activos retornados     |
| 41  | Filtra por estado QUEUED                | Normal | Solo items en cola retornados     |
| 42  | Filtra por estado COMPLETED             | Normal | Solo items completados retornados |
| 43  | Filtra por estado FAILED                | Normal | Solo items fallidos retornados    |

### getQueueStats

| #   | Caso                                          | Tipo       | Verificación                                    |
| --- | --------------------------------------------- | ---------- | ----------------------------------------------- |
| 44  | Retorna stats del queueManager                | Normal     | `queueManager.getQueueStats` llamado            |
| 45  | Cache: segunda llamada inmediata no recalcula | Invariante | `queueManager.getQueueStats` llamado solo 1 vez |
| 46  | Sin inicializar: retorna stats vacías         | Límite     | Todos los contadores a 0                        |

### subscribe

| #   | Caso                           | Tipo   | Verificación                  |
| --- | ------------------------------ | ------ | ----------------------------- |
| 47  | Retorna función de unsubscribe | Normal | `typeof unsub === 'function'` |
| 48  | Unsubscribe no lanza error     | Normal | `unsub()` no lanza            |

### updateConfig / getConfig

| #   | Caso                                                   | Tipo   | Verificación                                                        |
| --- | ------------------------------------------------------ | ------ | ------------------------------------------------------------------- |
| 49  | Actualiza config y propaga a queueManager              | Normal | `queueManager.updateConfig` llamado                                 |
| 50  | getConfig retorna copia (no referencia)                | Normal | Mutación externa no afecta estado interno                           |
| 51  | Habilitar/deshabilitar tipos propaga a downloadService | Normal | `downloadService.enableDownloadType`/`disableDownloadType` llamados |

### getState / isInitialized / isProcessing / isPaused

| #   | Caso                               | Tipo   | Verificación                              |
| --- | ---------------------------------- | ------ | ----------------------------------------- |
| 52  | getState retorna copia             | Normal | Mutación externa no afecta estado interno |
| 53  | isInitialized refleja estado real  | Normal | true tras initialize, false tras destroy  |
| 54  | isProcessing delega a queueManager | Normal | `queueManager.getQueueStats` llamado      |
| 55  | isPaused delega a queueManager     | Normal | `queueManager.getQueueStats` llamado      |

### cleanupOrphanedDownloads

| #   | Caso                                                | Tipo   | Verificación                 |
| --- | --------------------------------------------------- | ------ | ---------------------------- |
| 56  | Delega a queueManager.forceCleanupOrphanedDownloads | Normal | Mock llamado, retorna número |
| 57  | Sin inicializar → lanza error                       | Error  | `rejects.toThrow()`          |

### destroy

| #   | Caso                        | Tipo       | Verificación                        |
| --- | --------------------------- | ---------- | ----------------------------------- |
| 58  | Marca isInitialized = false | Normal     | `manager.isInitialized() === false` |
| 59  | Limpia event listeners      | Invariante | No lanza error al destruir          |

**Total: 59 tests**

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change | Severidad | Mitigación                                  |
| --------------- | --------- | ------------------------------------------- |
| Ninguno         | —         | Esta tarea no modifica código de producción |

### Casos edge problemáticos

- **Singleton reset**: Cada test debe resetear `DownloadsManager.instance = undefined` para evitar estado compartido
- **Dependencia circular DM↔QM**: DownloadsManager importa `queueManager` singleton y QueueManager importa `downloadsManager` singleton. Los mocks deben romper este ciclo
- **initPromise**: `initialize()` usa una promesa interna para deduplicar llamadas concurrentes. El reset del singleton limpia esto
- **Mocks de sub-servicios**: `initialize()` llama a `Promise.allSettled` con múltiples servicios. Todos los mocks deben resolver correctamente
- **Cache de stats**: `getQueueStats()` tiene cache de 500ms. Tests de cache deben controlar el tiempo o invalidar manualmente
- **resumeDownload para binarios**: Internamente llama a `removeDownload` + `addDownload` (recreación). El mock de `queueManager.getDownload` debe retornar datos suficientes para la recreación
- **Acceso a propiedades privadas**: Setup de tests requiere acceso a `DownloadsManager.instance` via bracket notation
- **profileManager.getActiveProfile**: `setupGlobalPolicies()` llama a `getActiveProfile()` (no `getActiveProfileId()`). El mock debe incluir ambos métodos

## 5. Estrategia

### Testing

- **Fuente base**: Código de test propuesto en `03-estrategia-testing.md` sección 3.1.2
- **Adaptaciones necesarias**:
  - Verificar que los imports coincidan con las rutas reales del proyecto (rutas relativas desde `__tests__/managers/`)
  - Verificar que los mocks reflejen las interfaces actuales de las dependencias
  - Ampliar cobertura para métodos no cubiertos en la propuesta: `startDownloadNow`, `start`, `stop`, `getDownload`, `getActiveDownloads`, `getQueuedDownloads`, `getCompletedDownloads`, `getFailedDownloads`, `updateConfig`, `getConfig`, `getState`, `isProcessing`, `isPaused`, `cleanupOrphanedDownloads`, `destroy`
  - Adaptar mock paths: la propuesta usa `./QueueManager` pero el test estará en `__tests__/managers/` → usar `../../managers/QueueManager`
  - Usar `import` + `jest.mocked` en vez de `require()` (lección de tarea 01)
  - Usar `@ts-expect-error` con descripción en vez de `@ts-ignore` (lección de tarea 01)
  - Añadir `/* eslint-disable dot-notation */` si se necesita acceso a propiedades privadas
- **Ejecución**: `npx jest src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts`

### Rollback

1. Eliminar `src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts`
2. No hay otros cambios que revertir

## 6. Complejidad estimada

- **Nivel**: Media
- **Justificación**: Más dependencias que QueueManager (9 singletons vs 9, pero con más métodos mockeados). La lógica de `resumeDownload` para binarios es compleja (recreación). El cache de stats requiere control de tiempo.
- **Tiempo estimado**: 2–3 horas

## 7. Preguntas resueltas durante verificación

### Técnicas

- [x] **Rutas de import**: Mocks desde `__tests__/managers/` usan `../../managers/...`, `../../services/...`
- [x] **profileManager.getActiveProfile**: Retorna `ProfileContext | null` donde `ProfileContext = {id, name, isChild}`
- [x] **profileManager.filterByActiveProfile**: `(items: DownloadItem[]) => DownloadItem[]` ✅
- [x] **profileManager.shouldShowContent**: `(downloadItem: DownloadItem) => boolean` ✅
- [x] **downloadService.initialize**: `(config?: Partial<DownloadServiceConfig>) => Promise<void>` ✅
- [x] **networkService.initialize**: `(config?: Partial<NetworkServiceConfig>) => Promise<void>` ✅
- [x] **storageService.initialize**: `(config?: Partial<StorageServiceConfig>) => Promise<void>` ✅
- [x] **nativeManager.startDownloadProcessing / stopDownloadProcessing**: Ambos existen, ambos `Promise<void>` ✅
- [x] **DEFAULT_CONFIG_MAIN_MANAGER**: `{logEnabled:true, logLevel:DEBUG, autoStart:false, persistenceEnabled:true, networkMonitoringEnabled:true, storageMonitoringEnabled:true, profileManagementEnabled:true, activeProfileRequired:false, enableBinaryDownloads:true, enableStreamDownloads:true, maxConcurrentDownloads:3, autoRetryEnabled:true, maxRetryAttempts:3}`
- [x] **PersistenceService**: NO importado por DownloadsManager — no necesita mock. `restorePreviousState()` usa `queueManager.getAllDownloads()` (ya mockeado)
- [x] **clearCompleted / clearFailed**: Son TODO stubs (no-op) → **EXCLUIDOS** de los tests
- [x] **getSystemState**: Async, usa múltiples servicios → **EXCLUIDO** de tests de contrato (es concern de integración)

### Decisiones de configuración para tests

- Tests usarán `initialize({ autoStart: false, logEnabled: false, maxConcurrentDownloads: 3 })`
- Defaults tienen `persistenceEnabled: true` → `restorePreviousState()` se ejecutará. Mock de `queueManager.getAllDownloads` retorna `[]` por defecto, lo cual es suficiente
- Defaults tienen `profileManagementEnabled: true` → `profileManager.initialize` será llamado
- Defaults tienen `networkMonitoringEnabled: true` → `networkService.initialize` será llamado
- Defaults tienen `storageMonitoringEnabled: true` → `storageService.initialize` será llamado

### Notas de comportamiento descubiertas

- **initialize** usa `Promise.allSettled` para sub-servicios: fallos individuales no bloquean la inicialización
- **addDownload** valida políticas globales (espacio, red) antes de encolar
- **removeDownload** siempre intenta limpiar en nativeManager incluso si el item no existe en queue
- **resumeDownload** para BINARY hace remove+add (recreación completa), para STREAM delega directamente
- **pauseAll** recopila binarios activos ANTES de llamar a `queueManager.pauseAll()` (que cambia estados)
- **getQueueStats** tiene cache de 500ms (`STATS_CACHE_TTL`)
- **isProcessing** y **isPaused** delegan a `queueManager.getQueueStats()` en vez de usar estado local
- **destroy** llama a `stop()` internamente (que llama a `pauseAll()`)
- **Errores**: DownloadsManager lanza `PlayerError` (no `Error` estándar)

## 8. Aprobación

- [x] Spec revisado
- [x] Verificado contra código actual (2026-02-17)
- [x] Dudas resueltas
- [x] Listo para planificación (`/plan`)
