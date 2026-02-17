# Fase 1: Análisis Estructural

## 1.1 Inventario de responsabilidades

---

### managers/QueueManager.ts (2645 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Cola de descargas (Map) | Gestión de estado | ~40-65 | `downloadQueue`, `currentlyDownloading`, `retryTracker`, `isPaused`, `isProcessing` | Todas las demás | — |
| Inicialización y carga persistida | Orquestación | ~187-243 | `initialize()`, `loadPersistedQueue()` | Estado, Persistencia | `persistenceService` |
| Añadir/eliminar descargas | Lógica de negocio | ~280-600 | `addDownloadItem()`, `removeDownload()`, `forceRemoveDownload()` | Estado, Eventos, Persistencia | `persistenceService`, `nativeManager`, `storageService`, `profileManager` |
| Procesamiento de cola (scheduling) | Orquestación | ~1096-1338 | `start()`, `startProcessing()`, `stopProcessing()`, `processQueue()`, `doProcessQueue()` | Estado, Envío a destino | `setInterval`, `networkService`, `configManager` |
| Envío a cola destino | Orquestación | ~1365-1432 | `sendToDestinationQueue()` | Estado | `downloadsManager`, `storageService` |
| Manejo de eventos nativos | Efectos secundarios | ~82-180 | `setupNativeEventListeners()`, `setupBinaryEventListeners()`, `handleNativeProgressEvent()`, `handleNativeStateEvent()`, `handleNativeCompletedEvent()`, `handleNativeErrorEvent()` | Estado, Progreso | `nativeManager`, `binaryDownloadService` |
| Notificaciones de progreso/estado | Lógica de negocio | ~1445-1641 | `notifyDownloadProgress()`, `notifyDownloadCompleted()`, `notifyDownloadFailed()`, `notifyDownloadPaused()`, `notifyDownloadResumed()`, `notifyDownloadStateChange()` | Estado, Eventos | `persistenceService`, `speedCalculator` |
| Manejo de fallos y reintentos | Lógica de negocio | ~1655-1790 | `handleDownloadFailure()`, `isNonRetryableError()` | Estado, Reintentos | `speedCalculator` |
| Sistema de locks | Lógica de negocio | ~1798-1832 | `acquireLock()`, `releaseLock()`, `isBeingRemoved()` | Estado | — |
| Actualización de estado y progreso | Gestión de estado | ~1839-1951 | `updateDownloadState()`, `updateDownloadProgress()` | Estado | `persistenceService`, `speedCalculator` |
| Estadísticas de cola | Presentación | ~899-945, 1964-2040 | `getQueueStats()`, `getStats()` | Estado | — |
| Filtrado y consultas | Lógica de negocio | ~720-892 | `getAllDownloads()`, `getDownload()`, `filterByState()`, `filterByType()`, `getQueuePositions()`, `reorderQueue()` | Estado | — |
| Sincronización con estado nativo | Orquestación | ~2050-2200 | `syncWithNativeState()`, `forceCleanupOrphanedDownloads()` | Estado | `nativeManager` |
| Sistema de eventos (subscribe) | Efectos secundarios | ~1035-1094 | `subscribe()`, `subscribeToDownload()` | — | `eventemitter3` |
| Verificación de red | Lógica de negocio | ~1346-1357 | `canDownloadNow()` | — | `networkService`, `configManager` |
| Configuración | Configuración | ~249-273 | `updateConfig()` | Estado | — |
| Deep clone | Lógica de negocio | ~15 | `deepCloneItem()` | — | — |

**Dependencia circular crítica:** `QueueManager` importa `downloadsManager` (línea 17) y `DownloadsManager` importa `queueManager` (línea 36). Ambos son singletons, lo que evita un crash en tiempo de carga, pero crea un acoplamiento bidireccional fuerte.

---

### managers/DownloadsManager.ts (1630 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Estado del sistema | Gestión de estado | ~42-73 | `state`, `cachedStats`, `eventUnsubscribers` | Todas | — |
| Inicialización del ecosistema | Orquestación | ~82-248 | `initialize()`, `initializeSystemServices()` | Estado, Coordinación | `configManager`, `profileManager`, `queueManager`, `downloadService`, `networkService`, `storageService` |
| Coordinación entre servicios | Orquestación | ~255-300 | `setupServiceCoordination()` | Estado, Eventos | Todos los managers y servicios |
| Políticas globales | Lógica de negocio | ~307-341 | `setupGlobalPolicies()` | — | `configManager`, `networkService`, `streamDownloadService`, `binaryDownloadService`, `profileManager` |
| Manejo de eventos (queue, config, profile, network, storage) | Efectos secundarios | ~348-674 | `handleQueueEvent()`, `handleConfigEvent()`, `handleProfileEvent()`, `handleDownloadEvent()`, `handleNetworkEvent()`, `handleStorageEvent()` | Estado, Políticas | Múltiples servicios |
| Notificación al QueueManager | Orquestación | ~496-600 | `notifyQueueManagerOfEvent()` | — | `queueManager` |
| Políticas de reintento y límites | Lógica de negocio | ~681-730 | `applyGlobalPolicies()`, `handleAutoRetry()`, `enforceGlobalLimits()` | Estado | — |
| API de descargas (add, remove, pause, resume) | Orquestación | ~737-1106 | `addDownload()`, `startDownloadNow()`, `removeDownload()`, `pauseDownload()`, `resumeDownload()` | Estado | `downloadService`, `queueManager`, `profileManager`, `storageService`, `nativeManager` |
| Control masivo (pauseAll, resumeAll) | Orquestación | ~1113-1230 | `pauseAll()`, `resumeAll()` | Estado | `queueManager`, `downloadService`, `nativeManager` |
| Consultas de estado | Presentación | ~1273-1375 | `getDownloads()`, `getDownload()`, `getActiveDownloads()`, `getQueuedDownloads()`, `getCompletedDownloads()`, `getFailedDownloads()`, `getQueueStats()` | Estado | `queueManager`, `profileManager` |
| Control del sistema | Orquestación | ~1382-1419 | `start()`, `stop()` | Estado | `queueManager`, `nativeManager` |
| Configuración | Configuración | ~1426-1470 | `updateConfig()`, `getConfig()` | Estado | `queueManager`, `downloadService` |
| Validación de políticas | Lógica de negocio | ~1533-1560 | `validateGlobalPolicies()` | — | `storageService`, `networkService` |
| Restauración de estado previo | Orquestación | ~1562-1589 | `restorePreviousState()` | Estado | `queueManager` |
| Sistema de eventos | Efectos secundarios | ~1477-1483 | `subscribe()` | — | `eventemitter3` |
| Limpieza | Orquestación | ~1601-1625 | `destroy()` | Estado, Eventos | — |

---

### managers/NativeManager.ts (1343 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Setup módulo nativo | Efectos secundarios | ~142-164 | `setupNativeModule()` | — | `NativeModules.DownloadsModule2` |
| Event listeners nativos | Efectos secundarios | ~166-197 | `setupNativeEventListeners()` | — | `NativeEventEmitter` |
| Inicialización módulo nativo | Orquestación | ~199-273 | `initializeNativeModule()` | — | `nativeModule.moduleInit()`, `nativeModule.setDownloadDirectories()`, `nativeModule.pauseAll()` |
| Manejo de eventos nativos | Lógica de negocio | ~280-558 | `handleNativeEvent()`, `handleDownloadProgress()`, `handleDownloadStateChanged()`, `handleDownloadCompleted()`, `handleDownloadError()`, `handleDownloadPrepared()`, `handleDownloadPrepareError()`, `handleLicenseEvent()` | Estado, Eventos | — |
| Throttle de progreso | Lógica de negocio | ~404-421 | Inline en `handleDownloadProgress()` | Estado (`lastProgressEmitTime`) | — |
| Detección de completado por progreso 100% | Lógica de negocio | ~377-402 | Inline en `handleDownloadProgress()` | Estado (`completedDownloads`) | — |
| API de descargas (CRUD) | Efectos secundarios | ~565-682 | `addDownload()`, `removeDownload()`, `pauseDownload()`, `resumeDownload()`, `cancelDownload()` | — | `nativeModule.*` |
| API de control masivo | Efectos secundarios | ~715-798 | `pauseAll()`, `resumeAll()`, `startDownloadProcessing()`, `stopDownloadProcessing()`, `cancelAll()` | — | `nativeModule.*` |
| API de consultas | Efectos secundarios | ~805-858 | `getDownloads()`, `getDownload()`, `hasDownload()`, `getStats()` | — | `nativeModule.*` |
| API de configuración | Efectos secundarios | ~889-937 | `setStreamQuality()`, `setNetworkPolicy()`, `setDownloadLimits()` | — | `nativeModule.*` |
| API de DRM | Efectos secundarios | ~944-1015 | `downloadLicense()`, `checkLicense()`, `renewLicense()`, `releaseLicense()`, `releaseAllLicenses()` | — | `nativeModule.*` |
| Utilidades | Lógica de negocio | ~1022-1047 | `generateDownloadId()`, `validateDownloadUri()`, `cleanupCompletedDownload()` | — | `nativeModule.*` |
| Buffer de eventos | Gestión de estado | ~548-558 | `bufferEvent()` | Estado (`eventBuffer`) | — |

---

### managers/ConfigManager.ts (624 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Estado de configuración | Gestión de estado | ~40-65 | `currentDownloadsConfig`, `isInitialized`, `pendingSave` | Todas | — |
| Inicialización y carga | Orquestación | ~74-118 | `initialize()`, `loadPersistedConfig()` | Estado | `persistenceService` |
| Actualización de config | Lógica de negocio | ~134-252 | `updateConfig()`, `updateMultipleConfig()` | Estado, Validación, Persistencia | `persistenceService` |
| Métodos de conveniencia | Lógica de negocio | ~328-349 | `updateStreamQuality()`, `updateNetworkPolicy()`, `updateConcurrentLimit()`, `updateAutoResume()`, `updateStorageThreshold()` | Actualización | — |
| Validación | Lógica de negocio | ~394-485 | `validateConfigValue()` | — | — |
| Persistencia con debounce | Efectos secundarios | ~568-592 | `persistConfig()`, `saveConfigToPersistence()` | Estado | `persistenceService` |
| Reset | Lógica de negocio | ~259-321 | `clearPersistedConfig()`, `resetToDefaults()` | Estado, Persistencia | `persistenceService` |
| Sistema de eventos | Efectos secundarios | ~355-378 | `subscribe()` | — | `eventemitter3` |

---

### managers/ProfileManager.ts (321 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Contexto de perfil activo | Gestión de estado | ~19-24 | `currentProfile`, `isInitialized`, `config` | — | — |
| Gestión de perfil | Lógica de negocio | ~95-143 | `setActiveProfile()`, `getActiveProfile()`, `hasActiveProfile()`, `getActiveProfileId()`, `isChildProfile()` | Estado | — |
| Filtrado de contenido | Lógica de negocio | ~160-225 | `shouldShowContent()`, `canDownload()`, `canDownloadContent()`, `filterByActiveProfile()` | Estado | — |
| Configuración de filtrado | Configuración | ~257-288 | `setProfileFiltering()`, `setActiveProfileRequired()` | Estado | — |
| Sistema de eventos | Efectos secundarios | ~232-249 | `subscribe()` | — | `eventemitter3` |

**Bien estructurado.** Responsabilidad única clara. No requiere segmentación.

---

### services/download/DownloadService.ts (~616 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Strategy pattern (binary/stream) | Orquestación | ~200-616 | `initialize()`, `startDownload()`, `pauseDownload()`, `resumeDownload()`, `cancelDownload()` | — | `binaryDownloadService`, `streamDownloadService` |
| Gestión de tipos habilitados | Configuración | ~50 | `isTypeEnabled()`, `enableDownloadType()`, `disableDownloadType()` | Estado | — |
| Delegación de eventos | Efectos secundarios | ~80 | `subscribe()` | — | `eventemitter3` |

**Bien estructurado.** Patrón Strategy limpio. No requiere segmentación.

---

### services/download/BinaryDownloadService.ts (~1079 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Descargas binarias en background | Efectos secundarios | ~200-500 | `startDownload()`, `pauseDownload()`, `resumeDownload()`, `cancelDownload()` | Estado | `RNBackgroundDownloader` |
| Cola interna de descargas | Gestión de estado | ~50 | `activeDownloads`, `downloadQueue` | — | — |
| Manejo de red | Efectos secundarios | ~100 | `handleNetworkChange()`, `setNetworkPolicy()` | Estado | `networkService` |
| Validación de archivos | Lógica de negocio | ~80 | `validateFile()` | — | `RNFS` |
| Progreso y velocidad | Lógica de negocio | ~100 | Callbacks de progreso | Estado | — |
| Sistema de eventos | Efectos secundarios | ~50 | `subscribe()` | — | `eventemitter3` |

---

### services/download/StreamDownloadService.ts (~1084 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Descargas de streams (HLS/DASH) | Efectos secundarios | ~200-500 | `startDownload()`, `pauseDownload()`, `resumeDownload()`, `cancelDownload()` | Estado | `nativeManager` |
| Cola interna de streams | Gestión de estado | ~50 | `activeDownloads` | — | — |
| Descarga de subtítulos | Orquestación | ~150 | `downloadSubtitles()` | — | `subtitleDownloadService` |
| Política de red | Lógica de negocio | ~50 | `setNetworkPolicy()` | Estado | — |
| Calidad de stream | Configuración | ~30 | `setStreamQuality()` | Estado | — |
| Sistema de eventos | Efectos secundarios | ~50 | `subscribe()` | — | `eventemitter3` |

---

### services/download/SubtitleDownloadService.ts (~785 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Descarga de subtítulos (HTTP) | Efectos secundarios | ~200-400 | `downloadSubtitle()`, `downloadHLSSubtitlePlaylist()` | Estado | `RNFS` |
| Reintentos | Lógica de negocio | ~80 | Lógica de retry inline | Estado | — |
| Validación de contenido | Lógica de negocio | ~60 | `validateSubtitleContent()` | — | — |
| Generación de nombres | Lógica de negocio | ~40 | `generateUniqueFilename()` | — | — |
| Tracking de subtítulos descargados | Gestión de estado | ~50 | `downloadedSubtitles` | — | — |

---

### services/network/NetworkService.ts (554 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Monitoreo de conectividad | Efectos secundarios | ~100-200 | `initialize()`, `fetchNetworkStatus()`, `startMonitoring()` | Estado | `@react-native-community/netinfo` |
| Políticas de red | Lógica de negocio | ~100 | `setNetworkPolicy()`, `canDownload()`, `areDownloadsAllowed()`, `areDownloadsPausedByNetwork()` | Estado | — |
| Estado de red | Gestión de estado | ~50 | `currentStatus`, `networkPolicy` | — | — |
| Acciones de pausa/reanudación | Lógica de negocio | ~50 | `pauseOnCellular()`, `resumeOnWifi()` | Estado | — |
| Sistema de eventos | Efectos secundarios | ~50 | `subscribe()` | — | `eventemitter3` |

---

### services/storage/PersistenceService.ts (1121 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Guardar/cargar estado de descargas | Efectos secundarios | ~200-400 | `saveDownloadState()`, `loadDownloadState()` | Estado | `AsyncStorage` |
| Guardar/cargar configuración | Efectos secundarios | ~100 | `saveDownloadsConfig()`, `loadDownloadsConfig()`, `clearDownloadsConfig()` | Estado | `AsyncStorage` |
| Guardar/cargar perfiles | Efectos secundarios | ~80 | `saveProfileMappings()`, `loadProfileMappings()` | Estado | `AsyncStorage` |
| Versionado y migración | Lógica de negocio | ~100 | `migrateData()`, `checkDataVersion()` | — | — |
| Checksum y validación | Lógica de negocio | ~80 | `calculateChecksum()`, `verifyChecksum()` | — | — |
| Backup y restore | Lógica de negocio | ~150 | `createBackup()`, `restoreFromBackup()` | Estado | `AsyncStorage` |
| Compresión (simulada) | Lógica de negocio | ~40 | `compress()`, `decompress()` | — | — |
| Sistema de eventos | Efectos secundarios | ~50 | `subscribe()` | — | `eventemitter3` |

---

### services/storage/StorageService.ts (1430 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Información de almacenamiento | Efectos secundarios | ~200-400 | `getStorageInfo()`, `getSystemInfo()` | Estado | `RNFS`, `NativeModules.DownloadsModule2` |
| Operaciones de archivos | Efectos secundarios | ~200 | `readFile()`, `writeFile()`, `deleteFile()`, `moveFile()`, `validateFile()` | — | `RNFS` |
| Gestión de directorios | Efectos secundarios | ~150 | `ensureDirectories()`, `createDirectory()`, `getDownloadDirectory()`, `getTempDirectory()`, `getBinariesDirectory()`, `getSubtitlesDirectory()` | Estado | `RNFS` |
| Monitoreo de espacio | Efectos secundarios | ~100 | `startMonitoring()`, `stopMonitoring()`, `checkStorageThresholds()` | Estado | — |
| Limpieza de archivos | Lógica de negocio | ~100 | `cleanupTempFiles()`, `cleanupPartialFiles()`, `cleanupOrphanedFiles()` | — | `RNFS` |
| Estimación de espacio | Lógica de negocio | ~50 | `estimateSpaceNeeded()`, `hasSufficientSpace()` | Estado | — |
| Validación de nombres | Lógica de negocio | ~50 | `validateFilename()`, `sanitizeFilename()` | — | — |
| Cache de info | Gestión de estado | ~30 | `cachedInfo`, `CACHE_TTL_MS` | — | — |
| Sistema de eventos | Efectos secundarios | ~50 | `subscribe()` | — | `eventemitter3` |

---

### services/manifest/DASHManifestParser.ts (~387 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Parsing de manifiestos DASH | Lógica de negocio | ~200-387 | `parse()`, `extractVideoStreams()`, `extractSubtitles()`, `parseAudioTracks()` | — | — |
| Resolución de URLs | Lógica de negocio | ~30 | `resolveUrl()`, `extractBaseUrl()` | — | — |
| Lógica específica "3cat" | Lógica de negocio | ~40 | `constructSubtitleUrl()`, `getLanguageIndex()` | — | — |
| Detección de formato de subtítulos | Lógica de negocio | ~20 | `detectSubtitleFormat()` | — | — |

---

### services/manifest/HLSManifestParser.ts (~317 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Parsing de manifiestos HLS | Lógica de negocio | ~200-317 | `parse()`, `extractSubtitles()`, `extractAudioTracks()` | — | — |
| Parsing de atributos | Lógica de negocio | ~30 | `parseAttributes()` | — | — |
| Resolución de URLs | Lógica de negocio | ~20 | `resolveUrl()` | — | — |

---

### Hooks (9 ficheros)

#### hooks/useDownloadsManager.ts (764 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Estado completo de descargas | Gestión de estado | ~100 | `downloads`, `activeDownloads`, `queuedDownloads`, etc. | — | `react` |
| Estadísticas globales | Presentación | ~50 | `queueStats`, `totalProgress`, `globalSpeed` | — | — |
| Inicialización del sistema | Orquestación | ~80 | `useEffect` de init | — | `downloadsManager` |
| Suscripción a eventos (con throttle) | Efectos secundarios | ~150 | `useEffect` de suscripción | Estado | `queueManager` |
| Acciones de descarga | Orquestación | ~200 | `addDownload()`, `removeDownload()`, `pauseDownload()`, `resumeDownload()`, `cancelDownload()` | — | `downloadsManager`, `queueManager`, `downloadService`, `storageService`, `profileManager`, `dashManifestParser`, `hlsManifestParser` |
| Acciones masivas | Orquestación | ~50 | `clearCompleted()`, `clearFailed()`, `pauseAll()`, `resumeAll()` | — | `downloadsManager` |
| Lógica de addDownload (manifiestos, subtítulos, perfiles) | Lógica de negocio | ~150 | Inline en `addDownload` | — | `dashManifestParser`, `hlsManifestParser` |

#### hooks/useDownloadsList.ts (420 líneas)

| Responsabilidad | Categoría | Líneas aprox. | Funciones/métodos | Dependencias internas | Dependencias externas |
|---|---|---|---|---|---|
| Lista ordenada de descargas | Gestión de estado | ~50 | `downloads` | — | `react` |
| Acciones básicas | Orquestación | ~150 | `addDownload()`, `removeDownload()`, `cancelDownload()` | — | Mismas que useDownloadsManager |
| Throttle de progreso | Lógica de negocio | ~30 | Throttle de 3s | — | — |
| **Lógica duplicada de addDownload** | Lógica de negocio | ~150 | Copia de useDownloadsManager | — | — |

#### hooks/useDownloadsProgress.ts (401 líneas)

Responsabilidad única: monitoreo de progreso de una descarga individual. Bien enfocado.

#### hooks/useDownloadsQueue.ts (193 líneas)

Responsabilidad única: interfaz reactiva para la cola. Bien enfocado.

#### hooks/useDownloadsConfig.ts (284 líneas)

Responsabilidad única: gestión reactiva de configuración. Bien enfocado.

#### hooks/useDownloadsStatus.ts (232 líneas)

Responsabilidad única: estado del sistema sin suscripción a PROGRESS. Bien enfocado.

#### hooks/useDownloadsProfile.ts (180 líneas)

Responsabilidad única: gestión de perfiles. Incluye 3 hooks (`useDownloadsProfile`, `useActiveProfile`, `useCanDownload`). Bien enfocado.

#### hooks/useNetworkStatus.ts (208 líneas)

Responsabilidad única: estado de red. **Problema:** accede a `eventEmitter` interno via casting forzado (línea 87).

#### hooks/useStorageInfo.ts (267 líneas)

Responsabilidad única: información de almacenamiento. Bien enfocado.

#### hooks/useOfflineQueue.ts (134 líneas)

**Redundante** con `useDownloadsQueue.ts`. Funcionalidad solapada.

---

### Utilidades

#### utils/downloadsUtils.ts (152 líneas)
Funciones puras: `generateDownloadIdFromUri()`, `ensureDownloadId()`, `normalizeUri()`, `isValidUri()`, `calculateRemainingTime()`. **Bien estructurado.**

#### utils/formatters.ts (199 líneas)
Funciones puras: `formatDownloadSpeed()`, `formatRemainingTime()`, `formatFileSize()`, `formatPercentage()`, `formatDownloadProgress()`, `formatDuration()`. **Bien estructurado.**

#### utils/ErrorMapper.ts (185 líneas)
Clase estática con mapeo de errores. **Bien estructurado.**

#### utils/SpeedCalculator.ts (117 líneas)
Clase con ventana deslizante para cálculo de velocidad. **Bien estructurado.**

---

### Tipos (12 ficheros)

Todos los ficheros de tipos están bien organizados por dominio (`download.ts`, `config.ts`, `network.ts`, `storage.ts`, `queue.ts`, `persistence.ts`, `profiles.ts`, `subtitles.ts`, `native.ts`, `NativeEvents.ts`, `drm.ts`). **No requieren segmentación.**

**Nota:** `NativeEvents.ts` define un `DownloadProgressEvent` que colisiona con el nombre en `download.ts` (línea 354). Ambos se exportan desde `types/index.ts`, lo que puede causar conflictos de importación.

---

### Configuración

#### constants.ts (141 líneas)
Constantes centralizadas. **Bien estructurado.**

#### defaultConfigs.ts (148 líneas)
Configuraciones por defecto. **Bien estructurado.**

---

## 1.2 Mapa de acoplamiento

### Acoplamiento intra-fichero (QueueManager)

| Responsabilidad A | Responsabilidad B | Tipo | Detalle |
|---|---|---|---|
| Cola de descargas | Procesamiento de cola | **Fuerte** | `processQueue()` lee y muta `downloadQueue` directamente |
| Procesamiento de cola | Envío a destino | **Fuerte** | `doProcessQueue()` invoca `sendToDestinationQueue()` |
| Envío a destino | DownloadsManager | **Fuerte** | `sendToDestinationQueue()` llama a `downloadsManager.startDownloadNow()` — dependencia circular |
| Manejo de eventos nativos | Actualización de estado | **Fuerte** | Los handlers nativos mutan `downloadQueue` vía `updateDownloadState()` |
| Manejo de fallos | Procesamiento de cola | **Fuerte** | `handleDownloadFailure()` programa reintentos que llaman a `processQueue()` |
| Sistema de locks | Eliminación | **Fuerte** | `removeDownload()` usa `acquireLock()`/`releaseLock()` |
| Estadísticas | Cola de descargas | **Débil** | Solo lectura del Map |

### Acoplamiento intra-fichero (DownloadsManager)

| Responsabilidad A | Responsabilidad B | Tipo | Detalle |
|---|---|---|---|
| Inicialización | Todos los servicios | **Fuerte** | `initializeSystemServices()` inicializa 6+ servicios en paralelo |
| Coordinación | Eventos | **Fuerte** | `setupServiceCoordination()` suscribe a todos los managers |
| Políticas globales | Configuración | **Fuerte** | `setupGlobalPolicies()` lee de `configManager` y propaga a servicios |
| API de descargas | QueueManager | **Fuerte** | Todas las operaciones delegan a `queueManager` |
| resumeDownload (binarios) | removeDownload + addDownload | **Fuerte** | Recreación completa para binarios (líneas 1018-1094) |

### Acoplamiento entre ficheros

| Origen | Destino | Tipo | Detalle |
|---|---|---|---|
| `QueueManager` | `DownloadsManager` | **Fuerte (circular)** | `sendToDestinationQueue()` → `downloadsManager.startDownloadNow()` |
| `DownloadsManager` | `QueueManager` | **Fuerte (circular)** | Toda la API pública delega a `queueManager` |
| `QueueManager` | `BinaryDownloadService` | **Fuerte** | Suscripción directa a eventos binarios |
| `QueueManager` | `NativeManager` | **Fuerte** | Suscripción directa a eventos nativos |
| `QueueManager` | `PersistenceService` | **Fuerte** | Persistencia en cada cambio de estado |
| `QueueManager` | `NetworkService` + `ConfigManager` | **Fuerte** | `canDownloadNow()` consulta ambos |
| `DownloadsManager` | 8 singletons | **Fuerte** | Importa y usa directamente todos los managers y servicios |
| Hooks | Singletons | **Fuerte** | Todos los hooks importan singletons directamente (no inyectados) |
| `useDownloadsManager` | `useDownloadsList` | **Fuerte (duplicación)** | Lógica de `addDownload` copiada |
| `useNetworkStatus` | `NetworkService.eventEmitter` | **Fuerte** | Acceso a propiedad interna via casting |
| `useOfflineQueue` | `useDownloadsQueue` | **Débil (redundancia)** | Funcionalidad solapada |

---

## 1.3 Señales de alerta

### SA-01: Dependencia circular QueueManager ↔ DownloadsManager
- **Fichero:** `QueueManager.ts` línea 17, `DownloadsManager.ts` línea 36
- **Impacto:** `QueueManager.sendToDestinationQueue()` (línea 1418) llama a `downloadsManager.startDownloadNow()`, y `DownloadsManager` delega casi todo a `queueManager`. Esto crea un flujo circular: QueueManager → DownloadsManager → DownloadService → (eventos) → QueueManager.
- **Riesgo:** Dificulta el testing aislado y puede causar stack overflows en escenarios de error.

### SA-02: Código duplicado en addDownload entre hooks
- **Ficheros:** `useDownloadsManager.ts` y `useDownloadsList.ts`
- **Detalle:** La lógica de `addDownload` (~150 líneas) incluyendo extracción de subtítulos de manifiestos DASH/HLS, creación de tasks, asignación de perfiles, está copiada verbatim en ambos hooks.
- **Riesgo:** Cambios en uno sin actualizar el otro causan bugs silenciosos.

### SA-03: QueueManager con demasiadas responsabilidades (2645 líneas)
- **Fichero:** `QueueManager.ts`
- **Detalle:** Combina gestión de cola, procesamiento/scheduling, manejo de eventos nativos, reintentos, locks, sincronización con estado nativo, estadísticas y persistencia.
- **Funciones >50 líneas:** `doProcessQueue()` (~160 líneas), `removeDownload()` (~135 líneas), `handleDownloadFailure()` (~80 líneas), `resumeAll()` (~45 líneas), `sendToDestinationQueue()` (~70 líneas), `updateDownloadState()` (~65 líneas), `handleNativeProgressEvent()` (~80 líneas), `syncWithNativeState()` (~100 líneas).

### SA-04: DownloadsManager con demasiadas responsabilidades (1630 líneas)
- **Fichero:** `DownloadsManager.ts`
- **Detalle:** Orquesta 8+ singletons, maneja eventos de 5 fuentes distintas, aplica políticas globales, gestiona API pública completa.
- **Funciones >50 líneas:** `removeDownload()` (~135 líneas), `resumeDownload()` (~90 líneas), `resumeAll()` (~65 líneas), `pauseAll()` (~50 líneas), `notifyQueueManagerOfEvent()` (~100 líneas).

### SA-05: Acceso a propiedad interna via casting forzado
- **Fichero:** `useNetworkStatus.ts` líneas 13-18, 87
- **Código:** `const serviceWithEmitter = networkService as unknown as NetworkServiceWithEventEmitter;`
- **Impacto:** Rompe encapsulación. Si `NetworkService` cambia la implementación interna del eventEmitter, el hook se rompe silenciosamente.

### SA-06: Hook redundante useOfflineQueue
- **Fichero:** `useOfflineQueue.ts`
- **Detalle:** Funcionalidad casi idéntica a `useDownloadsQueue.ts`. Además tiene `maxConcurrent: 3` hardcodeado (línea 110) con un TODO.
- **Impacto:** Confusión sobre cuál usar, mantenimiento duplicado.

### SA-07: Casteos `as unknown` y tipado débil
- **Ficheros:** Múltiples
- **Ejemplos:**
  - `QueueManager.ts`: `data as { taskId: string; ... }` en múltiples handlers de eventos (líneas 127-176, 348-362, etc.)
  - `DownloadsManager.ts`: `data as Record<string, unknown>` (línea 350), `data as { type?: string; ... }` (líneas 367, 431, 453)
  - `NativeManager.ts`: `nativeModule: any` (línea 42), `eventSubscriptions: Map<string, any>` (línea 45)
- **Impacto:** Los contratos entre emisor y receptor de eventos no están tipados, errores en runtime.

### SA-08: Lógica hardcodeada de "3cat" en DASHManifestParser
- **Fichero:** `DASHManifestParser.ts`
- **Funciones:** `constructSubtitleUrl()`, `getLanguageIndex()`
- **Detalle:** Contiene lógica específica del proveedor "3cat" (dominio, índices de idioma) que debería ser configurable o extraída.

### SA-09: setTimeout sin limpieza en handleDownloadFailure
- **Fichero:** `QueueManager.ts` línea 1724
- **Código:** `setTimeout(async () => { ... }, delay);`
- **Impacto:** Si el QueueManager se destruye durante el delay, el callback se ejecutará sobre un estado inconsistente. No hay tracking ni cancelación de estos timers.

### SA-10: Persistencia excesiva en updateDownloadState
- **Fichero:** `QueueManager.ts` línea 1903
- **Detalle:** `updateDownloadState()` llama a `persistenceService.saveDownloadState(this.downloadQueue)` en CADA cambio de estado. Con múltiples descargas concurrentes, esto genera escrituras a AsyncStorage muy frecuentes.
- **Impacto:** Rendimiento degradado, especialmente en Android donde AsyncStorage es SQLite.

### SA-11: Compresión simulada en PersistenceService
- **Fichero:** `PersistenceService.ts`
- **Funciones:** `compress()`, `decompress()`
- **Detalle:** Los métodos de compresión son stubs que no comprimen realmente. Añaden complejidad sin valor.

### SA-12: `handleDownloadEvent` no referenciado
- **Fichero:** `DownloadsManager.ts` líneas 451-488
- **Detalle:** El método `handleDownloadEvent()` y `notifyQueueManagerOfEvent()` existen pero el comentario en línea 280 indica que la suscripción a DownloadService está deshabilitada. Estos métodos parecen ser código muerto o legacy.

### SA-13: Dos métodos getStats/getQueueStats duplicados en QueueManager
- **Fichero:** `QueueManager.ts`
- **Funciones:** `getQueueStats()` (línea 899) y `getStats()` (línea 1964)
- **Detalle:** Ambos calculan las mismas estadísticas con lógica casi idéntica. `getStats()` además llama a `getAllDownloads()` que clona todos los items, mientras `getQueueStats()` itera directamente sobre el Map.

### SA-14: `clearCompleted()` y `clearFailed()` son stubs en DownloadsManager
- **Fichero:** `DownloadsManager.ts` líneas 1258-1266
- **Detalle:** Solo logean un mensaje sin hacer nada. Los métodos equivalentes en QueueManager sí funcionan.

### SA-15: `console.log` en NativeManager para debug
- **Fichero:** `NativeManager.ts` línea 290
- **Código:** `console.log('[NativeManager] 📥 Received native progress event:', logData);`
- **Impacto:** Uso de `console.log` directo en lugar del Logger del sistema. Debería usar `this.currentLogger`.
