# Fase 4: Extracción de requerimientos

## 4.1 Requerimientos funcionales

### Área: Gestión de cola de descargas

#### REQ-001: Añadir descarga a cola
- **Descripción**: El usuario puede añadir un contenido (stream o binario) a la cola de descargas. El sistema lo encola con estado QUEUED y lo procesa cuando hay capacidad.
- **Implementación**: `QueueManager.addDownloadItem()` (líneas 280-367), `DownloadsManager.addDownload()` (líneas 737-800)
- **Criticidad**: crítica
- **Dependencias**: REQ-007, REQ-011, REQ-014
- **Cobertura de test actual**: sin test

#### REQ-002: Eliminar descarga con gestión de perfiles
- **Descripción**: Al eliminar una descarga, se quita el perfil activo del array de perfiles. Solo se elimina del disco cuando no quedan perfiles asociados.
- **Implementación**: `QueueManager.removeDownload()` (líneas 375-512), `DownloadsManager.removeDownload()` (líneas 836-973)
- **Criticidad**: crítica
- **Dependencias**: REQ-014
- **Cobertura de test actual**: sin test

#### REQ-003: Pausar descarga individual
- **Descripción**: El usuario puede pausar una descarga activa. El estado cambia a PAUSED.
- **Implementación**: `QueueManager.pauseDownload()` (líneas 606-614), `DownloadsManager.pauseDownload()` (líneas 975-1001)
- **Criticidad**: alta
- **Dependencias**: —
- **Cobertura de test actual**: sin test

#### REQ-004: Reanudar descarga de stream
- **Descripción**: Una descarga de stream pausada se reanuda delegando al módulo nativo.
- **Implementación**: `DownloadsManager.resumeDownload()` (líneas 1003-1016) — rama `DownloadType.STREAM`
- **Criticidad**: alta
- **Dependencias**: REQ-003
- **Cobertura de test actual**: sin test

#### REQ-005: Reanudar descarga binaria (recreación)
- **Descripción**: Las descargas binarias no soportan reanudación parcial. Al reanudar, se elimina la descarga antigua y se crea una nueva desde cero.
- **Implementación**: `DownloadsManager.resumeDownload()` (líneas 1018-1106) — rama `DownloadType.BINARY`
- **Criticidad**: alta
- **Dependencias**: REQ-001, REQ-002
- **Cobertura de test actual**: sin test

#### REQ-006: Pausar y reanudar todas las descargas
- **Descripción**: El sistema permite pausar y reanudar todas las descargas activas de forma masiva.
- **Implementación**: `DownloadsManager.pauseAll()` (líneas 1113-1164), `DownloadsManager.resumeAll()` (líneas 1166-1230), `QueueManager.pauseAll()` (líneas 641-662), `QueueManager.resumeAll()` (líneas 669-713)
- **Criticidad**: alta
- **Dependencias**: REQ-003, REQ-004, REQ-005
- **Cobertura de test actual**: sin test

#### REQ-007: Límite de descargas concurrentes
- **Descripción**: El sistema respeta un límite configurable de descargas simultáneas. Las descargas que exceden el límite permanecen en QUEUED.
- **Implementación**: `QueueManager.doProcessQueue()` (líneas 1175-1338) — verificación en líneas 1199-1208, `QueueManager.setMaxConcurrent()` (líneas 844-853)
- **Criticidad**: alta
- **Dependencias**: —
- **Cobertura de test actual**: sin test

#### REQ-008: Reintentos con backoff exponencial
- **Descripción**: Las descargas fallidas se reintentan automáticamente con delay exponencial (2^n * baseDelay) hasta un máximo configurable.
- **Implementación**: `QueueManager.handleDownloadFailure()` (líneas 1655-1734)
- **Criticidad**: alta
- **Dependencias**: REQ-009
- **Cobertura de test actual**: sin test

#### REQ-009: Clasificación de errores no reintentables
- **Descripción**: Ciertos errores (sin espacio, HTTP 404, asset corrupto) se marcan como no reintentables y la descarga falla inmediatamente.
- **Implementación**: `QueueManager.isNonRetryableError()` (líneas 1739-1790)
- **Criticidad**: alta
- **Dependencias**: —
- **Cobertura de test actual**: sin test

#### REQ-026: Reordenación de cola
- **Descripción**: El usuario puede cambiar el orden de las descargas en cola.
- **Implementación**: `QueueManager.reorderQueue()` (líneas 800-837)
- **Criticidad**: baja
- **Dependencias**: —
- **Cobertura de test actual**: sin test

---

### Área: Persistencia y estado

#### REQ-010: Persistencia de estado de descargas
- **Descripción**: El estado de la cola se persiste en AsyncStorage. Al reiniciar la app, se restaura el estado previo.
- **Implementación**: `PersistenceService.saveDownloadState()`, `PersistenceService.loadDownloadState()` (PersistenceService.ts líneas ~200-400), `QueueManager.loadPersistedQueue()`, `QueueManager.updateDownloadState()` (línea 1903)
- **Criticidad**: crítica
- **Dependencias**: —
- **Cobertura de test actual**: sin test

#### REQ-015: Gestión de configuración con validación
- **Descripción**: La configuración de descargas se valida antes de aplicar y se persiste automáticamente con debounce.
- **Implementación**: `ConfigManager.updateConfig()` (líneas 134-186), `ConfigManager.validateConfigValue()` (líneas 394-485), `ConfigManager.persistConfig()` (líneas 568-592)
- **Criticidad**: media
- **Dependencias**: —
- **Cobertura de test actual**: sin test

#### REQ-027: Backup y restore de datos
- **Descripción**: El sistema mantiene backups de los datos persistidos y puede restaurar desde backup si los datos principales están corruptos.
- **Implementación**: `PersistenceService.createBackup()`, `PersistenceService.restoreFromBackup()` (PersistenceService.ts)
- **Criticidad**: media
- **Dependencias**: REQ-010
- **Cobertura de test actual**: sin test

---

### Área: Políticas de red

#### REQ-011: Política WiFi-only
- **Descripción**: Si está habilitada la política WiFi-only, las descargas solo se inician cuando hay conexión WiFi. En red celular, las descargas se pausan o no se inician.
- **Implementación**: `QueueManager.canDownloadNow()` (líneas 1346-1357), `DownloadsManager.setupGlobalPolicies()` (líneas 307-341), `DownloadsManager.handleConfigEvent()` (líneas 365-427)
- **Criticidad**: alta
- **Dependencias**: REQ-012
- **Cobertura de test actual**: sin test

#### REQ-012: Pausa automática sin conectividad
- **Descripción**: Cuando se pierde la conexión de red, todas las descargas activas se pausan automáticamente. Se reanudan cuando vuelve la conectividad adecuada.
- **Implementación**: `DownloadsManager.handleNetworkEvent()` (líneas 607-647), `NetworkService` (monitoreo de red)
- **Criticidad**: alta
- **Dependencias**: REQ-006
- **Cobertura de test actual**: sin test

---

### Área: Almacenamiento

#### REQ-013: Pausa automática por espacio bajo
- **Descripción**: Cuando el espacio disponible baja del umbral configurado, las descargas se pausan automáticamente.
- **Implementación**: `DownloadsManager.handleStorageEvent()` (líneas 654-674), `StorageService.checkStorageThresholds()`
- **Criticidad**: media
- **Dependencias**: REQ-006, REQ-028
- **Cobertura de test actual**: sin test

#### REQ-028: Monitoreo de almacenamiento
- **Descripción**: El sistema monitorea periódicamente el espacio disponible y emite warnings cuando se acerca al límite.
- **Implementación**: `StorageService.startMonitoring()`, `StorageService.getStorageInfo()`, `StorageService.isLowSpace()` (StorageService.ts)
- **Criticidad**: media
- **Dependencias**: —
- **Cobertura de test actual**: sin test

#### REQ-024: Limpieza de descargas huérfanas
- **Descripción**: El sistema detecta y limpia descargas que quedaron en estado DOWNLOADING tras un reinicio de la app (huérfanas).
- **Implementación**: `QueueManager.forceCleanupOrphanedDownloads()`, `QueueManager.syncWithNativeState()` (QueueManager.ts líneas ~2050-2200)
- **Criticidad**: media
- **Dependencias**: REQ-023
- **Cobertura de test actual**: sin test

---

### Área: Perfiles

#### REQ-014: Filtrado por perfil activo
- **Descripción**: Las descargas se filtran según el perfil activo. Un contenido con array de perfiles vacío es visible para todos. Un contenido con perfiles específicos solo es visible para esos perfiles.
- **Implementación**: `ProfileManager.shouldShowContent()` (líneas 160-179), `ProfileManager.filterByActiveProfile()` (líneas 219-225), `DownloadsManager.getDownloads()` (líneas 1273-1287)
- **Criticidad**: alta
- **Dependencias**: —
- **Cobertura de test actual**: sin test

---

### Área: Descargas de contenido

#### REQ-016: Descarga de subtítulos
- **Descripción**: El sistema descarga subtítulos asociados a un stream, soportando descarga directa y playlists HLS de subtítulos.
- **Implementación**: `SubtitleDownloadService.downloadSubtitle()`, `SubtitleDownloadService.downloadHLSSubtitlePlaylist()` (SubtitleDownloadService.ts), `StreamDownloadService.downloadSubtitles()` (StreamDownloadService.ts)
- **Criticidad**: media
- **Dependencias**: REQ-017
- **Cobertura de test actual**: sin test

#### REQ-017: Parsing de manifiestos DASH y HLS
- **Descripción**: El sistema parsea manifiestos DASH (XML) y HLS (M3U8) para extraer streams de vídeo, pistas de audio y subtítulos.
- **Implementación**: `DASHManifestParser.parse()` (DASHManifestParser.ts), `HLSManifestParser.parse()` (HLSManifestParser.ts)
- **Criticidad**: media
- **Dependencias**: —
- **Cobertura de test actual**: sin test

#### REQ-023: Sincronización con estado nativo
- **Descripción**: El sistema sincroniza el estado de las descargas en el QueueManager con el estado real reportado por el módulo nativo.
- **Implementación**: `QueueManager.syncWithNativeState()` (QueueManager.ts líneas ~2050-2200)
- **Criticidad**: alta
- **Dependencias**: —
- **Cobertura de test actual**: sin test

#### REQ-025: DRM — Descarga, renovación y verificación de licencias
- **Descripción**: El sistema gestiona licencias DRM para contenido protegido: descarga, verificación, renovación y liberación.
- **Implementación**: `NativeManager.downloadLicense()` (líneas 944-957), `NativeManager.checkLicense()` (líneas 959-971), `NativeManager.renewLicense()` (líneas 973-986), `NativeManager.releaseLicense()` (líneas 988-1001)
- **Criticidad**: alta
- **Dependencias**: —
- **Cobertura de test actual**: sin test

---

### Área: Presentación y utilidades

#### REQ-018: Estadísticas de cola
- **Descripción**: El sistema calcula estadísticas en tiempo real: descargas activas, pendientes, completadas, fallidas, velocidad promedio, tiempo estimado restante.
- **Implementación**: `QueueManager.getQueueStats()` (líneas 899-945), `DownloadsManager.getQueueStats()` (líneas 1337-1375)
- **Criticidad**: media
- **Dependencias**: REQ-021
- **Cobertura de test actual**: sin test

#### REQ-019: Formateo de datos para UI
- **Descripción**: Funciones de formateo para velocidad, tiempo restante, tamaño de archivo y porcentaje.
- **Implementación**: `formatters.ts` — `formatDownloadSpeed()`, `formatRemainingTime()`, `formatFileSize()`, `formatPercentage()`, `formatDownloadProgress()`, `formatDuration()`
- **Criticidad**: baja
- **Dependencias**: —
- **Cobertura de test actual**: sin test

#### REQ-020: Generación de IDs de descarga
- **Descripción**: IDs de descarga generados de forma determinista a partir de la URI del contenido.
- **Implementación**: `downloadsUtils.generateDownloadIdFromUri()` (downloadsUtils.ts líneas 1-50)
- **Criticidad**: baja
- **Dependencias**: —
- **Cobertura de test actual**: sin test

#### REQ-021: Cálculo de velocidad con ventana deslizante
- **Descripción**: La velocidad de descarga se calcula usando una ventana deslizante de muestras para mayor precisión.
- **Implementación**: `SpeedCalculator` (SpeedCalculator.ts)
- **Criticidad**: baja
- **Dependencias**: —
- **Cobertura de test actual**: sin test

#### REQ-022: Mapeo de errores nativos
- **Descripción**: Los errores nativos se mapean a códigos de error estandarizados con mensajes legibles y clasificación de reintentabilidad.
- **Implementación**: `ErrorMapper` (ErrorMapper.ts)
- **Criticidad**: media
- **Dependencias**: —
- **Cobertura de test actual**: sin test

---

## 4.2 Casos no contemplados

#### NC-001: Race condition en removeDownload + eventos de progreso
- **Escenario**: Se elimina una descarga mientras llegan eventos de progreso nativos. El handler de progreso intenta actualizar un item que ya no existe o está siendo eliminado.
- **Código afectado**: `QueueManager.handleNativeProgressEvent()` y `QueueManager.removeDownload()` — el lock solo protege `removeDownload`, pero los handlers de progreso no verifican el lock.
- **Impacto**: Silencioso — el progreso se ignora porque el item no existe. Pero si el timing es exacto, podría re-insertar datos en el Map.
- **Recomendación**: implementar — verificar `isBeingRemoved()` en handlers de progreso.
- **Prioridad**: media
- **Requerimiento relacionado**: REQ-002

#### NC-002: setTimeout sin limpieza en reintentos
- **Escenario**: Se destruye el QueueManager (o la app se cierra) mientras hay reintentos programados con `setTimeout`. Los callbacks se ejecutan sobre estado inconsistente.
- **Código afectado**: `QueueManager.handleDownloadFailure()` línea 1724 — `setTimeout(async () => { ... }, delay)`
- **Impacto**: Potencial crash o corrupción de estado si el callback intenta acceder a `this.downloadQueue` después del destroy.
- **Recomendación**: implementar — trackear los timeouts y cancelarlos en `destroy()`.
- **Prioridad**: alta
- **Requerimiento relacionado**: REQ-008

#### NC-003: Persistencia excesiva bloquea el hilo
- **Escenario**: Con múltiples descargas concurrentes, `updateDownloadState()` llama a `persistenceService.saveDownloadState()` en cada cambio de estado. Con 3 descargas activas recibiendo progreso, esto genera decenas de escrituras por segundo a AsyncStorage.
- **Código afectado**: `QueueManager.updateDownloadState()` línea 1903, `QueueManager.updateDownloadProgress()` línea 1949 (cada 10%)
- **Impacto**: UX degradada — lag en la UI, especialmente en Android donde AsyncStorage usa SQLite.
- **Recomendación**: implementar — debounce de persistencia (ej: máximo 1 escritura cada 2 segundos).
- **Prioridad**: alta
- **Requerimiento relacionado**: REQ-010

#### NC-004: Componentes desmontados reciben actualizaciones
- **Escenario**: Un hook (`useDownloadsProgress`, `useDownloadsManager`) se desmonta mientras hay descargas activas. Los callbacks de eventos siguen ejecutándose y llaman a `setState` sobre un componente desmontado.
- **Código afectado**: Todos los hooks que usan `useEffect` con suscripciones a eventos — la función de cleanup se ejecuta, pero hay una ventana entre el último evento y el cleanup.
- **Impacto**: Warning de React en desarrollo ("Can't perform a React state update on an unmounted component"). En producción, silencioso pero desperdicia CPU.
- **Recomendación**: implementar — usar ref `isMounted` en hooks críticos.
- **Prioridad**: media
- **Requerimiento relacionado**: —

#### NC-005: Pérdida de datos si la app se cierra durante persistConfig debounce
- **Escenario**: El usuario cambia una configuración y cierra la app antes de que el debounce de 500ms se complete. El cambio se pierde.
- **Código afectado**: `ConfigManager.persistConfig()` líneas 568-592 — usa `setTimeout` con 500ms de debounce.
- **Impacto**: Datos corruptos — la configuración en memoria difiere de la persistida. Al reiniciar, se carga la configuración antigua.
- **Recomendación**: implementar — guardar inmediatamente en `destroy()` (parcialmente implementado en línea 604, pero es fire-and-forget).
- **Prioridad**: media
- **Requerimiento relacionado**: REQ-015

#### NC-006: Dependencia circular puede causar import order issues
- **Escenario**: `QueueManager` importa `downloadsManager` y viceversa. En ciertos bundlers o configuraciones de Jest, el orden de evaluación de módulos puede causar que uno de los singletons sea `undefined` en el momento de uso.
- **Código afectado**: `QueueManager.ts` línea 17, `DownloadsManager.ts` línea 36
- **Impacto**: Crash — `TypeError: Cannot read property 'startDownloadNow' of undefined`.
- **Recomendación**: implementar — romper la dependencia circular (ver Paso 7 del plan de migración).
- **Prioridad**: alta
- **Requerimiento relacionado**: REQ-001

#### NC-007: Stagger delay de 500ms fijo sin configuración
- **Escenario**: El delay de 500ms entre descargas consecutivas (`doProcessQueue()` línea 1248) es fijo. En dispositivos potentes con buena conexión, esto ralentiza innecesariamente. En dispositivos lentos, puede ser insuficiente.
- **Código afectado**: `QueueManager.doProcessQueue()` línea 1248 — `await new Promise(resolve => setTimeout(resolve, 500))`
- **Impacto**: UX degradada — descargas tardan más de lo necesario en iniciarse.
- **Recomendación**: documentar como limitación — hacer configurable si se reportan problemas.
- **Prioridad**: baja
- **Requerimiento relacionado**: REQ-007

#### NC-008: Errores silenciados en handlers de eventos
- **Escenario**: Los handlers de eventos en `DownloadsManager` (`handleQueueEvent`, `handleConfigEvent`, `handleProfileEvent`) capturan errores con try/catch y solo logean, sin propagar ni emitir evento de error.
- **Código afectado**: `DownloadsManager.ts` líneas 348-363, 365-427, 429-444
- **Impacto**: Silencioso — errores en la coordinación entre servicios se pierden. La UI no se entera de fallos internos.
- **Recomendación**: implementar — emitir evento `system:error` para que los hooks puedan reaccionar.
- **Prioridad**: media
- **Requerimiento relacionado**: —

#### NC-009: resumeAll puede causar avalancha de descargas
- **Escenario**: Si hay 20 descargas pausadas y se llama a `resumeAll()`, el método itera sobre todas y llama a `this.resumeDownload()` para cada una. Para binarios, esto implica `removeDownload` + `addDownload` para cada uno, generando una cascada de operaciones.
- **Código afectado**: `DownloadsManager.resumeAll()` líneas 1193-1211
- **Impacto**: UX degradada — la app puede bloquearse temporalmente. Posibles race conditions entre las operaciones de remove/add.
- **Recomendación**: implementar — limitar la concurrencia de operaciones de resume, o procesar secuencialmente con delay.
- **Prioridad**: media
- **Requerimiento relacionado**: REQ-005, REQ-006

#### NC-010: NativeManager.handleDownloadProgress emite completado por progreso 100%
- **Escenario**: El módulo nativo envía eventos de progreso con 100% y speed=0 después de completar. `NativeManager` interpreta esto como completado y emite `download_completed`, potencialmente duplicando el evento real de completado.
- **Código afectado**: `NativeManager.handleDownloadProgress()` líneas 377-402
- **Impacto**: Potencial doble procesamiento de completado. Mitigado parcialmente por `completedDownloads` Set, pero si el evento real de completado llega primero, el Set no previene el duplicado desde progreso.
- **Recomendación**: implementar — unificar la detección de completado en un solo punto.
- **Prioridad**: media
- **Requerimiento relacionado**: REQ-023

#### NC-011: Lock timeout de 30 segundos sin notificación
- **Escenario**: Si una operación de eliminación tarda más de 30 segundos (ej: módulo nativo no responde), el lock se libera automáticamente. Otra operación puede entonces modificar el item mientras la primera sigue en progreso.
- **Código afectado**: `QueueManager.acquireLock()` líneas 1810-1813
- **Impacto**: Corrupción de estado — dos operaciones concurrentes sobre el mismo item.
- **Recomendación**: documentar como limitación — el timeout es una red de seguridad, no un flujo normal.
- **Prioridad**: baja
- **Requerimiento relacionado**: REQ-002

#### NC-012: clearCompleted y clearFailed son stubs en DownloadsManager
- **Escenario**: El usuario llama a `clearCompleted()` o `clearFailed()` desde un hook. El método logea un mensaje pero no hace nada.
- **Código afectado**: `DownloadsManager.ts` líneas 1258-1266
- **Impacto**: UX degradada — el usuario cree que ha limpiado las descargas pero siguen ahí.
- **Recomendación**: implementar — delegar a `queueManager.cleanupCompleted()` y `queueManager.clearFailed()` que sí funcionan.
- **Prioridad**: alta
- **Requerimiento relacionado**: —

---

## 4.3 Complejidad innecesaria

#### CI-001: Compresión simulada en PersistenceService
- **Código**: `PersistenceService.ts` — métodos `compress()` y `decompress()`
- **Qué hace**: Los métodos existen pero no comprimen realmente. Son stubs que retornan los datos sin modificar.
- **Por qué parece innecesario**: Añaden una capa de indirección sin valor. Cada save/load pasa por compress/decompress sin efecto.
- **Propuesta**: eliminar — quitar los métodos y las llamadas a ellos.
- **Riesgo de eliminación**: Ninguno. Verificar que `saveDownloadState` y `loadDownloadState` siguen funcionando.

#### CI-002: Dos métodos getStats/getQueueStats duplicados en QueueManager
- **Código**: `QueueManager.ts` — `getQueueStats()` (línea 899) y `getStats()` (línea 1964)
- **Qué hace**: Ambos calculan las mismas estadísticas con lógica casi idéntica.
- **Por qué parece innecesario**: `getStats()` además llama a `getAllDownloads()` que clona todos los items (costoso), mientras `getQueueStats()` itera directamente sobre el Map.
- **Propuesta**: simplificar — eliminar `getStats()` y que todos los consumidores usen `getQueueStats()`.
- **Riesgo de eliminación**: Buscar consumidores de `getStats()` y migrarlos. `grep -r "\.getStats()" src/`.

#### CI-003: handleDownloadEvent y notifyQueueManagerOfEvent posiblemente muertos
- **Código**: `DownloadsManager.ts` — `handleDownloadEvent()` (líneas 451-488), `notifyQueueManagerOfEvent()` (líneas 496-600)
- **Qué hace**: `handleDownloadEvent` procesa eventos de descarga y los propaga al QueueManager. `notifyQueueManagerOfEvent` traduce eventos al formato del QueueManager.
- **Por qué parece innecesario**: El comentario en línea 280 dice "Suscripción a DownloadService deshabilitada - eventos fluyen directamente desde NativeManager/BinaryDownloadService -> QueueManager". Si la suscripción está deshabilitada, estos métodos nunca se invocan.
- **Propuesta**: eliminar — verificar que ningún código llama a estos métodos. Si se confirma que son código muerto, eliminarlos (~150 líneas).
- **Riesgo de eliminación**: Verificar con `grep -r "handleDownloadEvent\|notifyQueueManagerOfEvent" src/`. Si solo aparecen en la definición, son seguros de eliminar.

#### CI-004: handleAutoRetry con TODO sin implementar
- **Código**: `DownloadsManager.ts` — `handleAutoRetry()` (líneas 698-712)
- **Qué hace**: Programa un reintento con backoff exponencial, pero el cuerpo del setTimeout tiene un TODO: "Implementar lógica de reintento cuando esté disponible el QueueManager".
- **Por qué parece innecesario**: El QueueManager ya implementa reintentos completos en `handleDownloadFailure()`. Este método en DownloadsManager es redundante y no funcional.
- **Propuesta**: eliminar — junto con `applyGlobalPolicies()` que lo invoca, y `enforceGlobalLimits()` que también tiene un TODO.
- **Riesgo de eliminación**: Ninguno. La lógica real de reintentos está en QueueManager.

#### CI-005: Hook useOfflineQueue redundante
- **Código**: `hooks/useOfflineQueue.ts` (134 líneas)
- **Qué hace**: Proporciona interfaz reactiva para la cola de descargas.
- **Por qué parece innecesario**: `useDownloadsQueue.ts` (193 líneas) proporciona la misma funcionalidad con más features. `useOfflineQueue` además tiene `maxConcurrent: 3` hardcodeado con un TODO.
- **Propuesta**: eliminar — migrar consumidores a `useDownloadsQueue`.
- **Riesgo de eliminación**: Buscar consumidores con `grep -r "useOfflineQueue" src/`.

#### CI-006: Checksum en PersistenceService
- **Código**: `PersistenceService.ts` — `calculateChecksum()`, `verifyChecksum()`
- **Qué hace**: Calcula un checksum simple de los datos antes de guardar y lo verifica al cargar.
- **Por qué parece innecesario**: AsyncStorage ya garantiza integridad de datos (SQLite en Android, plist en iOS). Un checksum adicional en JavaScript no protege contra corrupción real del storage.
- **Propuesta**: simplificar — mantener como validación ligera pero no como mecanismo de seguridad. Eliminar si causa overhead medible.
- **Riesgo de eliminación**: Si se elimina, datos corruptos por bugs de serialización podrían pasar desapercibidos. Riesgo bajo.

#### CI-007: Versionado de datos con migración en PersistenceService
- **Código**: `PersistenceService.ts` — `migrateData()`, `checkDataVersion()`
- **Qué hace**: Verifica la versión de los datos persistidos y ejecuta migraciones si es necesario.
- **Por qué parece innecesario**: Actualmente solo existe la versión 1. No hay migraciones definidas. La infraestructura de migración existe pero no se usa.
- **Propuesta**: mantener — es una buena práctica para el futuro. Pero documentar que actualmente no hay migraciones.
- **Riesgo de eliminación**: Si se elimina y luego se cambia el formato de datos, no habrá forma de migrar datos existentes.

#### CI-008: Lógica específica de "3cat" en DASHManifestParser
- **Código**: `DASHManifestParser.ts` — `constructSubtitleUrl()`, `getLanguageIndex()`
- **Qué hace**: Construye URLs de subtítulos y mapea índices de idioma específicos para el proveedor "3cat".
- **Por qué parece innecesario**: Es lógica de negocio específica de un proveedor embebida en un parser genérico. Otros consumidores del parser no necesitan esta lógica.
- **Propuesta**: simplificar — extraer a un plugin o configuración inyectable.
- **Riesgo de eliminación**: Rompe la funcionalidad de subtítulos para contenido de "3cat". Necesita test de regresión.

#### CI-009: Cache de estadísticas en DownloadsManager con TTL de 500ms
- **Código**: `DownloadsManager.ts` — `cachedStats`, `STATS_CACHE_TTL` (líneas 52-54), `getQueueStats()` (líneas 1337-1375)
- **Qué hace**: Cachea las estadísticas de la cola durante 500ms para evitar recalcularlas en cada llamada.
- **Por qué parece innecesario**: `getQueueStats()` del QueueManager ya es O(n) sobre el Map, que es rápido para colas de tamaño típico (<100 items). El cache añade complejidad (invalidación manual) sin beneficio medible.
- **Propuesta**: simplificar — eliminar el cache y llamar directamente a `queueManager.getQueueStats()`.
- **Riesgo de eliminación**: Si hay hooks que llaman a `getQueueStats()` en cada render (ej: en un `setInterval` de 100ms), podría haber impacto. Verificar frecuencia de llamadas.

#### CI-010: Deep clone de DownloadItem en cada consulta
- **Código**: `QueueManager.ts` — `deepCloneItem()`, usado en `getAllDownloads()` (línea 721) y `getDownload()` (línea 731)
- **Qué hace**: Clona profundamente cada DownloadItem al retornarlo para evitar mutaciones externas.
- **Por qué parece innecesario**: Es una buena práctica defensiva, pero `getAllDownloads()` se llama frecuentemente desde hooks (en cada evento). Clonar todos los items en cada llamada es costoso.
- **Propuesta**: simplificar — usar `Object.freeze()` en los items del Map para prevenir mutaciones sin clonar, o clonar solo en `getDownload()` (consulta individual) y retornar array readonly en `getAllDownloads()`.
- **Riesgo de eliminación**: Si algún consumidor muta los items retornados, se corrompería el estado interno. Verificar con búsqueda de mutaciones.

---

## 4.4 Resumen ejecutivo

| ID | Tipo | Descripción | Estado | Tests | Prioridad refactorización |
|---|---|---|---|---|---|
| REQ-001 | Requerimiento | Añadir descarga a cola | implementado | ⬜ | alta |
| REQ-002 | Requerimiento | Eliminar descarga con gestión de perfiles | implementado | ⬜ | alta |
| REQ-003 | Requerimiento | Pausar descarga individual | implementado | ⬜ | media |
| REQ-004 | Requerimiento | Reanudar descarga de stream | implementado | ⬜ | media |
| REQ-005 | Requerimiento | Reanudar descarga binaria (recreación) | implementado | ⬜ | alta |
| REQ-006 | Requerimiento | Pausar/reanudar todas | implementado | ⬜ | alta |
| REQ-007 | Requerimiento | Límite de descargas concurrentes | implementado | ⬜ | media |
| REQ-008 | Requerimiento | Reintentos con backoff exponencial | implementado | ⬜ | alta |
| REQ-009 | Requerimiento | Errores no reintentables | implementado | ⬜ | media |
| REQ-010 | Requerimiento | Persistencia de estado | implementado | ⬜ | alta |
| REQ-011 | Requerimiento | Política WiFi-only | implementado | ⬜ | alta |
| REQ-012 | Requerimiento | Pausa automática sin red | implementado | ⬜ | alta |
| REQ-013 | Requerimiento | Pausa automática por espacio bajo | implementado | ⬜ | media |
| REQ-014 | Requerimiento | Filtrado por perfil activo | implementado | ⬜ | media |
| REQ-015 | Requerimiento | Configuración con validación | implementado | ⬜ | baja |
| REQ-016 | Requerimiento | Descarga de subtítulos | implementado | ⬜ | media |
| REQ-017 | Requerimiento | Parsing DASH/HLS | implementado | ⬜ | baja |
| REQ-018 | Requerimiento | Estadísticas de cola | implementado | ⬜ | baja |
| REQ-019 | Requerimiento | Formateo para UI | implementado | ⬜ | baja |
| REQ-020 | Requerimiento | Generación de IDs | implementado | ⬜ | baja |
| REQ-021 | Requerimiento | Velocidad ventana deslizante | implementado | ⬜ | baja |
| REQ-022 | Requerimiento | Mapeo de errores nativos | implementado | ⬜ | baja |
| REQ-023 | Requerimiento | Sincronización con estado nativo | implementado | ⬜ | alta |
| REQ-024 | Requerimiento | Limpieza de huérfanas | implementado | ⬜ | media |
| REQ-025 | Requerimiento | DRM licencias | implementado | ⬜ | alta |
| REQ-026 | Requerimiento | Reordenación de cola | implementado | ⬜ | baja |
| REQ-027 | Requerimiento | Backup y restore | implementado | ⬜ | media |
| REQ-028 | Requerimiento | Monitoreo de almacenamiento | implementado | ⬜ | media |
| NC-001 | No contemplado | Race condition remove + progreso | — | — | media |
| NC-002 | No contemplado | setTimeout sin limpieza en reintentos | — | — | alta |
| NC-003 | No contemplado | Persistencia excesiva bloquea hilo | — | — | alta |
| NC-004 | No contemplado | Componentes desmontados reciben updates | — | — | media |
| NC-005 | No contemplado | Pérdida de config en debounce | — | — | media |
| NC-006 | No contemplado | Dependencia circular import order | — | — | alta |
| NC-007 | No contemplado | Stagger delay fijo 500ms | — | — | baja |
| NC-008 | No contemplado | Errores silenciados en handlers | — | — | media |
| NC-009 | No contemplado | Avalancha en resumeAll binarios | — | — | media |
| NC-010 | No contemplado | Doble completado por progreso 100% | — | — | media |
| NC-011 | No contemplado | Lock timeout sin notificación | — | — | baja |
| NC-012 | No contemplado | clearCompleted/clearFailed son stubs | — | — | alta |
| CI-001 | Complejidad innecesaria | Compresión simulada | — | — | alta |
| CI-002 | Complejidad innecesaria | getStats duplicado | — | — | alta |
| CI-003 | Complejidad innecesaria | handleDownloadEvent código muerto | — | — | alta |
| CI-004 | Complejidad innecesaria | handleAutoRetry con TODO | — | — | alta |
| CI-005 | Complejidad innecesaria | useOfflineQueue redundante | — | — | alta |
| CI-006 | Complejidad innecesaria | Checksum en PersistenceService | — | — | baja |
| CI-007 | Complejidad innecesaria | Versionado sin migraciones | — | — | baja |
| CI-008 | Complejidad innecesaria | Lógica "3cat" en parser | — | — | media |
| CI-009 | Complejidad innecesaria | Cache stats 500ms | — | — | baja |
| CI-010 | Complejidad innecesaria | Deep clone en cada consulta | — | — | media |
