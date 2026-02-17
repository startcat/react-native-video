# Especificación Técnica: Tests de contrato — QueueManager

> Generado a partir de task.md el 2026-02-17
> Verificado contra código el 2026-02-17

## Resumen

Escribir tests de contrato que capturen el comportamiento actual del `QueueManager` (2645 líneas) para servir como red de seguridad durante la refactorización posterior del módulo offline.

## 1. Alcance

### Módulos afectados

**Directos:**

- `managers/QueueManager.ts`: código bajo test (NO se modifica)

**Indirectos:**

- Ninguno — esta tarea solo crea tests, no modifica código de producción

### Dependencias a mockear

| Dependencia             | Tipo      | Mock necesario                                                                         |
| ----------------------- | --------- | -------------------------------------------------------------------------------------- |
| `PersistenceService`    | Singleton | `saveDownloadState`, `loadDownloadState`, `saveProfileMappings`, `loadProfileMappings` |
| `StorageService`        | Singleton | `getBinariesDirectory`, `deleteFile`, `forceUpdate`, `invalidateDownloadSpaceCache`    |
| `NetworkService`        | Singleton | `isOnline`, `isWifiConnected`, `subscribe`                                             |
| `ConfigManager`         | Singleton | `getConfig`, `initialize`, `subscribe`                                                 |
| `DownloadsManager`      | Singleton | `startDownloadNow` (dependencia circular)                                              |
| `NativeManager`         | Singleton | `subscribe`, `removeDownload`, `getDownloads`, `initialize`                            |
| `ProfileManager`        | Singleton | `getActiveProfileId`, `initialize`, `subscribe`                                        |
| `BinaryDownloadService` | Singleton | `subscribe`                                                                            |
| `SpeedCalculator`       | Singleton | `addSample`, `getSpeed`, `getEstimatedTimeRemaining`, `clear`, `clearAll`              |

### Archivos a crear

- `src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts`

### Archivos de configuración

- `jest.config.js` — no existe actualmente, hay que crearlo (el script `test` del `package.json` es `echo no test available`)

## 2. Contratos

### API pública bajo test

| Método                                             | Firma esperada                                                                               | Categoría      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------- |
| `addDownloadItem(item)`                            | `(item: DownloadItem) => Promise<string>`                                                    | CRUD           |
| `removeDownload(id, profileId?)`                   | `(id: string, profileId?: string) => Promise<void>`                                          | CRUD           |
| `forceRemoveDownload(id)`                          | `(id: string) => Promise<void>`                                                              | CRUD           |
| `pauseDownload(id)`                                | `(id: string) => Promise<void>`                                                              | Control        |
| `resumeDownload(id)`                               | `(id: string) => Promise<void>`                                                              | Control        |
| `pauseAll()`                                       | `() => void`                                                                                 | Control        |
| `resumeAll()`                                      | `() => Promise<void>`                                                                        | Control        |
| `getAllDownloads()`                                | `() => DownloadItem[]`                                                                       | Consulta       |
| `getDownload(id)`                                  | `(id: string) => DownloadItem \| null`                                                       | Consulta       |
| `getQueueStats()`                                  | `() => QueueStats`                                                                           | Consulta       |
| `subscribe(event, callback)`                       | `(event: DownloadEventType, cb: Function) => () => void`                                     | Eventos        |
| `subscribeToDownload(id, cb)`                      | `(id: string, cb: Function) => () => void`                                                   | Eventos        |
| `notifyDownloadProgress(id, %, bytes?, total?)`    | `(id: string, percent: number, bytesWritten?: number, totalBytes?: number) => Promise<void>` | Notificaciones |
| `notifyDownloadCompleted(id, fileUri?, fileSize?)` | `(id: string, fileUri?: string, fileSize?: number) => Promise<void>`                         | Notificaciones |
| `notifyDownloadFailed(id, error)`                  | `(id: string, error: unknown) => Promise<void>`                                              | Notificaciones |
| `notifyDownloadPaused(id)`                         | `(id: string) => Promise<void>`                                                              | Notificaciones |
| `notifyDownloadResumed(id)`                        | `(id: string) => Promise<void>`                                                              | Notificaciones |
| `setMaxConcurrent(n)`                              | `(n: number) => void`                                                                        | Configuración  |
| `reorderQueue(ids)`                                | `(ids: string[]) => Promise<void>`                                                           | Gestión cola   |
| `clearQueue()`                                     | `() => Promise<void>`                                                                        | Gestión cola   |
| `cleanupCompleted()`                               | `() => Promise<void>`                                                                        | Gestión cola   |
| `clearFailed()`                                    | `() => Promise<void>`                                                                        | Gestión cola   |

### Tipos/interfaces necesarios (imports)

- `DownloadStates` — enum de estados de descarga
- `DownloadType` — enum de tipos (STREAM, BINARY)
- `DownloadItem` — interfaz del item de descarga
- `DownloadEventType` — enum de tipos de evento

## 3. Matriz de cobertura

### addDownloadItem

| #   | Caso                 | Tipo       | Verificación                                                           |
| --- | -------------------- | ---------- | ---------------------------------------------------------------------- |
| 1   | Añadir item válido   | Normal     | Retorna ID, `getDownload(id)` no es null                               |
| 2   | Item duplicado       | Límite     | Retorna ID existente, `getAllDownloads().length` no incrementa         |
| 3   | Emite evento QUEUED  | Normal     | Callback de `subscribe(QUEUED)` llamado con `downloadId` y `queueSize` |
| 4   | Sin inicializar      | Error      | `rejects.toThrow()`                                                    |
| 5   | Persiste tras añadir | Invariante | `persistenceService.saveDownloadState` llamado                         |

### removeDownload

| #   | Caso                                        | Tipo       | Verificación                                                        |
| --- | ------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| 6   | Eliminar con 1 perfil                       | Normal     | `getDownload(id)` es null                                           |
| 7   | Eliminar con 2+ perfiles                    | Límite     | Item sigue existiendo, `profileIds` no contiene el perfil eliminado |
| 8   | Emite REMOVED solo si elimina completamente | Invariante | Callback llamado solo cuando `profileIds` queda vacío               |
| 9   | Item no existe                              | Error      | `rejects.toThrow()`                                                 |

### forceRemoveDownload

| #   | Caso                             | Tipo   | Verificación                                                |
| --- | -------------------------------- | ------ | ----------------------------------------------------------- |
| 10  | Eliminar sin considerar perfiles | Normal | `getDownload(id)` es null aunque tuviera múltiples perfiles |
| 11  | Item no existe                   | Límite | `resolves.not.toThrow()`                                    |

### pauseDownload

| #   | Caso                     | Tipo   | Verificación                       |
| --- | ------------------------ | ------ | ---------------------------------- |
| 12  | DOWNLOADING → PAUSED     | Normal | `getDownload(id).state === PAUSED` |
| 13  | Estado no es DOWNLOADING | Límite | Estado no cambia                   |

### resumeDownload

| #   | Caso            | Tipo   | Verificación                       |
| --- | --------------- | ------ | ---------------------------------- |
| 14  | PAUSED → QUEUED | Normal | `getDownload(id).state === QUEUED` |

### pauseAll

| #   | Caso                          | Tipo   | Verificación            |
| --- | ----------------------------- | ------ | ----------------------- |
| 15  | Pausa todas las DOWNLOADING   | Normal | Todas cambian a PAUSED  |
| 16  | No afecta QUEUED ni COMPLETED | Límite | Esos estados no cambian |

### resumeAll

| #   | Caso                     | Tipo   | Verificación           |
| --- | ------------------------ | ------ | ---------------------- |
| 17  | Reanuda todas las PAUSED | Normal | Todas cambian a QUEUED |

### getAllDownloads

| #   | Caso                     | Tipo       | Verificación                              |
| --- | ------------------------ | ---------- | ----------------------------------------- |
| 18  | Retorna copias profundas | Invariante | Mutación externa no afecta estado interno |
| 19  | Cola vacía               | Límite     | Retorna array vacío                       |

### getQueueStats

| #   | Caso                                  | Tipo   | Verificación                              |
| --- | ------------------------------------- | ------ | ----------------------------------------- |
| 20  | Stats correctas con mezcla de estados | Normal | Contadores coinciden con items insertados |
| 21  | Cola vacía                            | Límite | Todos los contadores a 0                  |

### subscribe / subscribeToDownload

| #   | Caso                              | Tipo   | Verificación                         |
| --- | --------------------------------- | ------ | ------------------------------------ |
| 22  | Recibe eventos                    | Normal | Callback llamado al emitir evento    |
| 23  | Unsubscribe funciona              | Normal | Callback no llamado tras unsubscribe |
| 24  | subscribeToDownload filtra por ID | Normal | Solo recibe eventos del ID suscrito  |

### notifyDownloadProgress

| #   | Caso               | Tipo   | Verificación                                                          |
| --- | ------------------ | ------ | --------------------------------------------------------------------- |
| 25  | Actualiza progreso | Normal | `stats.progressPercent`, `bytesDownloaded`, `totalBytes` actualizados |
| 26  | Emite PROGRESS     | Normal | Callback con `downloadId` y `percent`                                 |
| 27  | Item no existe     | Error  | No lanza error (silencioso)                                           |

### notifyDownloadCompleted

| #   | Caso                  | Tipo       | Verificación                    |
| --- | --------------------- | ---------- | ------------------------------- |
| 28  | Cambia a COMPLETED    | Normal     | `state === COMPLETED`           |
| 29  | progressPercent = 100 | Invariante | `stats.progressPercent === 100` |
| 30  | Emite COMPLETED       | Normal     | Callback llamado                |

### notifyDownloadFailed

| #   | Caso                          | Tipo   | Verificación                                   |
| --- | ----------------------------- | ------ | ---------------------------------------------- |
| 31  | FAILED tras agotar reintentos | Normal | `state === FAILED`                             |
| 32  | Deduplicación si ya FAILED    | Límite | Callback FAILED no llamado si ya estaba FAILED |
| 33  | Emite FAILED                  | Normal | Callback llamado                               |

### notifyDownloadPaused / notifyDownloadResumed

| #   | Caso                                              | Tipo   | Verificación                                                               |
| --- | ------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| 34  | notifyDownloadPaused cambia estado                | Normal | `state === PAUSED`                                                         |
| 35  | notifyDownloadResumed cambia estado a DOWNLOADING | Normal | `state === DOWNLOADING` (no QUEUED — confirma que la descarga está activa) |

### setMaxConcurrent

| #   | Caso             | Tipo   | Verificación               |
| --- | ---------------- | ------ | -------------------------- |
| 36  | Actualiza límite | Normal | Config interna actualizada |
| 37  | Valor ≤ 0        | Error  | `toThrow()`                |

### reorderQueue

| #   | Caso           | Tipo   | Verificación                                          |
| --- | -------------- | ------ | ----------------------------------------------------- |
| 38  | Reordena items | Normal | Orden de `getAllDownloads()` coincide con nuevo orden |

### clearQueue / cleanupCompleted / clearFailed

| #   | Caso                                    | Tipo   | Verificación                                   |
| --- | --------------------------------------- | ------ | ---------------------------------------------- |
| 39  | clearQueue elimina todo                 | Normal | `getAllDownloads()` vacío                      |
| 40  | cleanupCompleted elimina solo COMPLETED | Normal | Solo items COMPLETED eliminados, resto intacto |
| 41  | clearFailed elimina solo FAILED         | Normal | Solo items FAILED eliminados, resto intacto    |

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change | Severidad | Mitigación                                  |
| --------------- | --------- | ------------------------------------------- |
| Ninguno         | —         | Esta tarea no modifica código de producción |

### Casos edge problemáticos

- **Singleton reset**: Cada test debe resetear `QueueManager.instance = undefined` para evitar estado compartido entre tests
- **Dependencia circular QM↔DM**: El mock de `DownloadsManager.startDownloadNow()` debe ser cuidadoso para no activar lógica circular
- **Acceso a propiedades privadas**: Setup de tests requiere acceso directo a `downloadQueue` (Map privado), `currentlyDownloading` (Set privado) y `retryTracker` (Map privado) via `queueManager['prop']`
- **Event listeners nativos**: `initialize()` configura listeners via `nativeManager.subscribe()` y `binaryDownloadService.subscribe()` — los mocks deben retornar funciones de cleanup
- **Mocks desactualizados**: Si las interfaces de los singletons han cambiado desde la auditoría, los mocks necesitarán ajustes

## 5. Estrategia

### Testing

- **Fuente base**: Código de test propuesto en `03-estrategia-testing.md` sección 3.1.1
- **Adaptaciones necesarias**:
  - Verificar que los imports coincidan con las rutas reales del proyecto
  - Verificar que los mocks reflejen las interfaces actuales de las dependencias
  - Ampliar cobertura para métodos no cubiertos en la propuesta: `resumeAll`, `subscribeToDownload`, `notifyDownloadPaused`, `notifyDownloadResumed`, `reorderQueue`, `clearQueue`, `cleanupCompleted`, `clearFailed`
- **Ejecución**: `npx jest src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts`

### Rollback

1. Eliminar `src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts`
2. Eliminar `jest.config.js` si fue creado en esta tarea
3. No hay otros cambios que revertir

## 6. Complejidad estimada

- **Nivel**: Baja
- **Justificación**: Solo se crean tests, no se modifica código de producción. La complejidad está en los mocks correctos y la cobertura completa.
- **Tiempo estimado**: 2–3 horas

## 7. Preguntas resueltas durante verificación

### Resueltas ✅

- [x] **Rutas de import**: Tests en `src/player/features/offline/__tests__/managers/` — mocks usan rutas relativas desde ahí (ej: `../../services/storage/PersistenceService`)
- [x] **DownloadEventType**: Confirmado QUEUED, REMOVED, PROGRESS, COMPLETED, FAILED, PAUSED, RESUMED, CANCELLED, STATE_CHANGE, QUEUE_CLEARED, QUEUE_REORDERED
- [x] **initialize()**: Acepta `Partial<QueueManagerConfig>` con campos: `logEnabled`, `logLevel`, `autoProcess`, `processIntervalMs`, `maxConcurrentDownloads`, `maxRetries`, `retryDelayMs`
- [x] **destroy()**: Existe como método público
- [x] **clearByState**: Es **privado** — usar `cleanupCompleted()` y `clearFailed()` públicos en su lugar
- [x] **removeDownload**: `profileId` es **opcional** — si no se pasa, usa `profileManager.getActiveProfileId()`
- [x] **notifyDownloadResumed**: Cambia estado a **DOWNLOADING** (no QUEUED) — confirma que la descarga está activa
- [x] **notifyDownloadFailed**: `error` es `unknown`, no `string`
- [x] **reorderQueue**: Retorna `Promise<void>`, no `void`
- [x] **Jest config**: No existe — hay que crear `jest.config.js`

### Notas de comportamiento descubiertas

- **addDownloadItem** inicia procesamiento automáticamente si `canDownloadNow()` es true, incluso con `autoProcess: false`. Los mocks de `networkService` deben controlarse.
- **handleDownloadFailure** usa backoff exponencial con `config.maxRetries` (default 3) y `config.retryDelayMs` (default 2000ms). Para test #31, setear `retryTracker` a un valor >= `maxRetries`.
- **Errores**: QueueManager lanza `PlayerError` (no `Error` estándar). Los tests deben verificar con `rejects.toThrow()` genérico o importar `PlayerError`.

## Aprobación

- [x] Spec revisado
- [x] Verificado contra código actual
- [x] Dudas resueltas
- [ ] Listo para planificación (`/plan`)
