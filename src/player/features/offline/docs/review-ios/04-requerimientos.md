# Fase 4: Extracción de Requerimientos — iOS Native (`/ios`)

Basado en las conclusiones de las Fases 1, 2 y 3.

---

## 4.1 Requerimientos funcionales

Inferidos exclusivamente del código existente.

### Área: Gestión de descargas HLS

#### REQ-001: Iniciar descarga de stream HLS
- **Descripción**: El sistema permite iniciar la descarga de un stream HLS proporcionando un ID, URI y título. Se crea una tarea de descarga aggregate que incluye vídeo, audio y subtítulos embebidos.
- **Implementación**: `DownloadsModule2.swift` → `addDownload()`, `createDownloadTask()` (líneas ~600-750, 1369-1448)
- **Criticidad**: Crítica
- **Dependencias**: REQ-002, REQ-010
- **Cobertura de test actual**: Sin test

#### REQ-002: Validar configuración de descarga
- **Descripción**: Antes de iniciar una descarga, se valida que la configuración contenga al menos id, uri y title.
- **Implementación**: `DownloadsModule2.swift` → `validateDownloadConfig()` (línea 1365)
- **Criticidad**: Crítica
- **Dependencias**: Ninguna
- **Cobertura de test actual**: Sin test

#### REQ-003: Pausar descarga individual
- **Descripción**: Permite suspender una descarga activa. La tarea se suspende y el estado se actualiza a `paused`.
- **Implementación**: `DownloadsModule2.swift` → `pauseDownload()` (líneas ~720-740)
- **Criticidad**: Alta
- **Dependencias**: REQ-001
- **Cobertura de test actual**: Sin test

#### REQ-004: Reanudar descarga individual
- **Descripción**: Permite reanudar una descarga pausada. La tarea se reanuda y el estado se actualiza a `downloading`.
- **Implementación**: `DownloadsModule2.swift` → `resumeDownload()` (líneas ~740-760)
- **Criticidad**: Alta
- **Dependencias**: REQ-003
- **Cobertura de test actual**: Sin test

#### REQ-005: Cancelar descarga individual
- **Descripción**: Cancela una descarga activa, elimina la tarea y los ficheros parcialmente descargados.
- **Implementación**: `DownloadsModule2.swift` → `cancelDownload()` (líneas ~760-780)
- **Criticidad**: Alta
- **Dependencias**: REQ-001
- **Cobertura de test actual**: Sin test

#### REQ-006: Eliminar descarga completada
- **Descripción**: Elimina una descarga completada incluyendo ficheros .movpkg, paths persistidos, bookmarks y claves DRM asociadas.
- **Implementación**: `DownloadsModule2.swift` → `removeDownload()`, `removeDownloadedFiles()` (líneas ~680-720, 1597-1704)
- **Criticidad**: Crítica
- **Dependencias**: REQ-013, REQ-014, REQ-015
- **Cobertura de test actual**: Sin test

#### REQ-007: Pausar todas las descargas
- **Descripción**: Suspende todas las descargas activas simultáneamente.
- **Implementación**: `DownloadsModule2.swift` → `pauseAll()` (líneas 730-765)
- **Criticidad**: Alta
- **Dependencias**: REQ-003
- **Cobertura de test actual**: Sin test

#### REQ-008: Reanudar todas las descargas
- **Descripción**: Reanuda todas las descargas pausadas simultáneamente.
- **Implementación**: `DownloadsModule2.swift` → `resumeAll()` (líneas 767-789)
- **Criticidad**: Alta
- **Dependencias**: REQ-004
- **Cobertura de test actual**: Sin test

#### REQ-009: Cancelar todas las descargas
- **Descripción**: Cancela todas las descargas activas, elimina ficheros y limpia todo el estado.
- **Implementación**: `DownloadsModule2.swift` → `cancelAll()` (líneas 791-821)
- **Criticidad**: Alta
- **Dependencias**: REQ-005
- **Cobertura de test actual**: Sin test

#### REQ-010: Control de concurrencia de descargas
- **Descripción**: El sistema limita el número de descargas simultáneas según `maxConcurrentDownloads`. Las descargas que exceden el límite se encolan.
- **Implementación**: `DownloadsModule2.swift` → `startDownloadIfPossible()` (líneas 1514-1546)
- **Criticidad**: Alta
- **Dependencias**: REQ-001
- **Cobertura de test actual**: Sin test

#### REQ-011: Selección de calidad de descarga
- **Descripción**: Permite seleccionar la calidad de descarga (low/medium/high/auto) que se traduce a un bitrate mínimo para la tarea de descarga iOS.
- **Implementación**: `DownloadsModule2.swift` → `createDownloadTask()` (líneas 1384-1396), `setStreamQuality()` (línea 895)
- **Criticidad**: Media
- **Dependencias**: REQ-001
- **Cobertura de test actual**: Sin test

---

### Área: Consulta de estado

#### REQ-012: Consultar lista de descargas
- **Descripción**: Devuelve un array con la información de todas las descargas activas (id, uri, title, state, progress, bytes, speed, quality, etc.).
- **Implementación**: `DownloadsModule2.swift` → `getDownloads()`, `createDownloadInfoDict()` (líneas 824-836, 1958-1973)
- **Criticidad**: Alta
- **Dependencias**: Ninguna
- **Cobertura de test actual**: Sin test

#### REQ-013: Consultar descarga individual
- **Descripción**: Devuelve la información detallada de una descarga por su ID, o nil si no existe.
- **Implementación**: `DownloadsModule2.swift` → `getDownload()` (líneas 838-853)
- **Criticidad**: Alta
- **Dependencias**: Ninguna
- **Cobertura de test actual**: Sin test

#### REQ-014: Verificar existencia de descarga
- **Descripción**: Devuelve un booleano indicando si existe una descarga con el ID proporcionado.
- **Implementación**: `DownloadsModule2.swift` → `hasDownload()` (líneas 855-864)
- **Criticidad**: Media
- **Dependencias**: Ninguna
- **Cobertura de test actual**: Sin test

#### REQ-015: Obtener estadísticas de descargas
- **Descripción**: Devuelve contadores agregados: descargas activas, encoladas, completadas, fallidas, bytes totales descargados y velocidad media.
- **Implementación**: `DownloadsModule2.swift` → `getStats()` (líneas 866-892)
- **Criticidad**: Media
- **Dependencias**: Ninguna
- **Cobertura de test actual**: Sin test

---

### Área: Persistencia

#### REQ-016: Persistir estado de descargas entre sesiones
- **Descripción**: El estado de todas las descargas activas se serializa a UserDefaults para poder restaurarlo tras un restart de la app.
- **Implementación**: `DownloadsModule2.swift` → `persistDownloadState()`, `restoreDownloadStates()` (líneas 2625-2686)
- **Criticidad**: Crítica
- **Dependencias**: Ninguna
- **Cobertura de test actual**: Sin test

#### REQ-017: Persistir ubicación de assets descargados
- **Descripción**: La ruta del fichero .movpkg descargado se guarda en UserDefaults para poder localizarlo tras restart.
- **Implementación**: `DownloadsModule2.swift` → `saveAssetPath()`, `loadAssetPaths()`, `removeAssetPath()` (líneas 2742-2760)
- **Criticidad**: Crítica
- **Dependencias**: REQ-016
- **Cobertura de test actual**: Sin test

#### REQ-018: Persistir bookmarks de assets (sandbox-safe)
- **Descripción**: Se guardan bookmarks de URL que sobreviven cambios de UUID del sandbox de iOS (ocurre en recompilaciones durante desarrollo). Permite localizar assets incluso cuando el path absoluto cambia.
- **Implementación**: `DownloadsModule2.swift` → `saveAssetBookmark()`, `resolveAssetBookmark()`, `removeAssetBookmark()` (líneas 2770-2817)
- **Criticidad**: Alta
- **Dependencias**: REQ-017
- **Cobertura de test actual**: Sin test

#### REQ-019: Persistir bookmarks de subtítulos
- **Descripción**: Similar a REQ-018 pero para ficheros de subtítulos descargados. Usa clave compuesta `downloadId:language`.
- **Implementación**: `DownloadsModule2.swift` → `saveSubtitleBookmark()`, `resolveSubtitleBookmark()`, `removeSubtitleBookmark()`, `removeAllSubtitleBookmarks()` (líneas 2819-2896)
- **Criticidad**: Alta
- **Dependencias**: REQ-018
- **Cobertura de test actual**: Sin test

#### REQ-020: Persistir claves DRM FairPlay en disco
- **Descripción**: Las claves de contenido FairPlay se persisten en disco para permitir reproducción offline de contenido protegido.
- **Implementación**: `ContentKeyManager.swift` → `writePersistableContentKey()`, `deletePeristableContentKey()`, `deleteAllPeristableContentKeys()` (líneas ~600-716)
- **Criticidad**: Crítica
- **Dependencias**: REQ-025
- **Cobertura de test actual**: Sin test

---

### Área: Progreso y eventos

#### REQ-021: Reportar progreso de descarga
- **Descripción**: El sistema calcula el porcentaje de progreso basado en los time ranges cargados y emite eventos a React Native con incrementos de 1%.
- **Implementación**: `DownloadsModule2.swift` → extensión `AVAssetDownloadDelegate`, `urlSession(didLoad:...)` (líneas 1980-2066)
- **Criticidad**: Crítica
- **Dependencias**: REQ-001
- **Cobertura de test actual**: Sin test

#### REQ-022: Emitir eventos de cambio de estado
- **Descripción**: Cada cambio de estado de una descarga (preparing, downloading, paused, completed, failed, waitingForNetwork) se emite como evento a React Native.
- **Implementación**: `DownloadsModule2.swift` → `sendEvent(withName: "overonDownloadStateChanged", ...)` (disperso, ~30 llamadas)
- **Criticidad**: Crítica
- **Dependencias**: Ninguna
- **Cobertura de test actual**: Sin test

#### REQ-023: Emitir evento de descarga preparada
- **Descripción**: Tras crear la tarea de descarga, se emite un evento con información de tracks (vídeo, audio, subtítulos), duración y calidad.
- **Implementación**: `DownloadsModule2.swift` → `emitDownloadPrepared()` (líneas 1455-1512)
- **Criticidad**: Alta
- **Dependencias**: REQ-001
- **Cobertura de test actual**: Sin test

#### REQ-024: Calcular velocidad y tiempo restante
- **Descripción**: Se estima la velocidad de descarga (bytes/s) y el tiempo restante basándose en la diferencia de bytes entre actualizaciones de progreso.
- **Implementación**: `DownloadsModule2.swift` → dentro de `urlSession(didLoad:...)` (líneas 2017-2044)
- **Criticidad**: Media
- **Dependencias**: REQ-021
- **Cobertura de test actual**: Sin test

---

### Área: DRM / FairPlay Streaming

#### REQ-025: Gestionar sesión de claves de contenido
- **Descripción**: El sistema crea y configura una `AVContentKeySession` para FairPlay Streaming, gestionando solicitudes de clave online y offline.
- **Implementación**: `ContentKeyManager.swift` → `createContentKeySession()`, delegado `AVContentKeySessionDelegate` (líneas 1-772)
- **Criticidad**: Crítica
- **Dependencias**: Ninguna
- **Cobertura de test actual**: Sin test

#### REQ-026: Obtener certificado FairPlay
- **Descripción**: Descarga el certificado de aplicación FPS desde una URL configurada.
- **Implementación**: `ContentKeyManager.swift` → `requestApplicationCertificate()` (líneas ~650-706)
- **Criticidad**: Crítica
- **Dependencias**: REQ-025
- **Cobertura de test actual**: Sin test

#### REQ-027: Solicitar clave de contenido al KSM
- **Descripción**: Envía el SPC (Server Playback Context) al Key Security Module y obtiene el CKC (Content Key Context).
- **Implementación**: `ContentKeyManager.swift` → `requestContentKeyFromKeySecurityModule()` (líneas 718-770)
- **Criticidad**: Crítica
- **Dependencias**: REQ-026
- **Cobertura de test actual**: Sin test

#### REQ-028: Configurar DRM para descarga
- **Descripción**: Configura la sesión de claves y registra el asset como recipient para que las claves se persistan durante la descarga.
- **Implementación**: `DownloadsModule2.swift` → `setupDRMForAsset()` (líneas 1563-1595)
- **Criticidad**: Crítica
- **Dependencias**: REQ-025, REQ-020
- **Cobertura de test actual**: Sin test

---

### Área: Validación y limpieza

#### REQ-029: Validar integridad de asset descargado
- **Descripción**: Tras completar una descarga, se valida que el directorio .movpkg existe, no está vacío, tiene tamaño mínimo (1MB) y contiene tracks reproducibles. Para HLS se usa validación relajada (sin verificación de tracks).
- **Implementación**: `DownloadsModule2.swift` → `validateAssetIntegrity()`, `validateAssetIntegrityRelaxed()` (líneas 2337-2421)
- **Criticidad**: Crítica
- **Dependencias**: REQ-001
- **Cobertura de test actual**: Sin test

#### REQ-030: Purgar assets huérfanos
- **Descripción**: Al inicializar el módulo, se escanean Library/ y Documents/ buscando ficheros .movpkg que no están referenciados por ninguna descarga activa. Se eliminan los huérfanos y se cancelan tareas de sesión sin tracking.
- **Implementación**: `DownloadsModule2.swift` → `doPurgeOrphanedAssets()` (líneas 1724-1863)
- **Criticidad**: Alta
- **Dependencias**: REQ-016, REQ-017
- **Cobertura de test actual**: Sin test

#### REQ-031: Recuperar tareas pendientes tras restart
- **Descripción**: Al inicializar la sesión de descarga, se consultan las tareas pendientes del sistema iOS y se reconectan con el estado persistido en `activeDownloads`.
- **Implementación**: `DownloadsModule2.swift` → `recoverPendingTask()`, dentro de `initializeDownloadSession()` (líneas 1227-1239, 2688-2737)
- **Criticidad**: Crítica
- **Dependencias**: REQ-016
- **Cobertura de test actual**: Sin test

---

### Área: Almacenamiento

#### REQ-032: Calcular espacio ocupado por descargas
- **Descripción**: Calcula el tamaño total de todas las descargas (completadas + en progreso) con cache TTL de 30 segundos.
- **Implementación**: `DownloadsModule2.swift` → `calculateTotalDownloadsSize()` (líneas 2491-2590)
- **Criticidad**: Alta
- **Dependencias**: REQ-017, REQ-018
- **Cobertura de test actual**: Sin test

#### REQ-033: Obtener información del sistema
- **Descripción**: Devuelve espacio total, disponible, ocupado por descargas, y rutas de directorios.
- **Implementación**: `DownloadsModule2.swift` → `getSystemInfoDict()` (líneas 1900-1956)
- **Criticidad**: Media
- **Dependencias**: REQ-032
- **Cobertura de test actual**: Sin test

---

### Área: Configuración

#### REQ-034: Configurar política de red
- **Descripción**: Permite configurar si se permiten descargas por datos móviles y si se requiere WiFi.
- **Implementación**: `DownloadsModule2.swift` → `setNetworkPolicy()`, `applyNetworkPolicy()` (líneas 900-910, 1878-1884)
- **Criticidad**: Media
- **Dependencias**: Ninguna
- **Cobertura de test actual**: Sin test
- **Nota**: La política real se delega a la capa JS. El módulo nativo siempre crea la sesión con `allowsCellularAccess=true`.

#### REQ-035: Configurar límites de descarga
- **Descripción**: Permite configurar el número máximo de descargas concurrentes.
- **Implementación**: `DownloadsModule2.swift` → `setDownloadLimits()` (líneas 912-917)
- **Criticidad**: Media
- **Dependencias**: REQ-010
- **Cobertura de test actual**: Sin test

---

### Área: Subtítulos

#### REQ-036: Gestionar bookmarks de subtítulos desde JS
- **Descripción**: Permite guardar, resolver y resolver en batch bookmarks de subtítulos descargados desde la capa JavaScript.
- **Implementación**: `DownloadsModule2.swift` → `saveSubtitleBookmarkFromPath()`, `resolveSubtitlePath()`, `resolveSubtitlePaths()` (líneas 994-1040)
- **Criticidad**: Alta
- **Dependencias**: REQ-019
- **Cobertura de test actual**: Sin test

---

### Área: Compatibilidad legacy

#### REQ-037: Mantener API legacy v1
- **Descripción**: Los métodos de la API v1 (`addItem`, `removeItem`, `getItem`, `getList`, `pause`, `resume`) delegan a los métodos v2 correspondientes para compatibilidad.
- **Implementación**: `DownloadsModule2.swift` → métodos legacy (líneas 1129-1186)
- **Criticidad**: Media
- **Dependencias**: REQ-001, REQ-006, REQ-003, REQ-004, REQ-012
- **Cobertura de test actual**: Sin test

---

### Área: Reproducción (player)

#### REQ-038: Gestionar Now Playing Info Center
- **Descripción**: El sistema actualiza la información de reproducción en el lock screen y Control Center, incluyendo título, artista, artwork, duración y posición. Gestiona comandos remotos (play, pause, skip, seek).
- **Implementación**: `NowPlayingInfoCenterManager.swift` (271 líneas)
- **Criticidad**: Alta
- **Dependencias**: Ninguna
- **Cobertura de test actual**: Sin test

#### REQ-039: Gestionar DRM FairPlay para reproducción
- **Descripción**: Intercepta solicitudes de recursos del player para gestionar licencias FairPlay: obtiene certificado, genera SPC, solicita CKC al servidor de licencias.
- **Implementación**: `RCTResourceLoaderDelegate.swift` (187 líneas), `RCTVideoDRM.swift` (186 líneas)
- **Criticidad**: Crítica
- **Dependencias**: REQ-025
- **Cobertura de test actual**: Sin test

#### REQ-040: Caché de vídeo
- **Descripción**: Permite cachear vídeos descargados por red usando `SPTPersistentCache`. Soporta m4v, mp4, mov. No soporta HLS (m3u8) ni vídeos con text tracks.
- **Implementación**: `VideoCaching/RCTVideoCache.m` (176 líneas), `VideoCaching/RCTVideoCachingHandler.swift` (99 líneas)
- **Criticidad**: Media
- **Dependencias**: Ninguna
- **Cobertura de test actual**: Sin test

---

## 4.2 Casos no contemplados

#### NC-001: Descarga duplicada sin protección
- **Escenario**: Se llama a `addDownload` con un ID que ya existe en `activeDownloads`. No hay verificación de duplicados antes de crear la tarea.
- **Código afectado**: `DownloadsModule2.swift` → `addDownload()` (líneas ~600-700)
- **Impacto**: Se crearía una segunda tarea de descarga para el mismo contenido, consumiendo ancho de banda y espacio duplicados. El diccionario `downloadTasks` sobrescribiría la referencia anterior, perdiendo el control de la primera tarea.
- **Recomendación**: Implementar — verificar `activeDownloads[downloadId]` antes de crear tarea
- **Prioridad**: Crítica
- **Requerimiento relacionado**: REQ-001

#### NC-002: Sesión de descarga no inicializada
- **Escenario**: Se llama a `addDownload` antes de `moduleInit()`. La sesión `downloadsSession` es nil.
- **Código afectado**: `DownloadsModule2.swift` → `createDownloadTask()` (línea 1370)
- **Impacto**: Se lanza un `NSError` que se propaga como reject de la promesa. El error es genérico ("Download session not initialized").
- **Recomendación**: Documentar como limitación — el flujo JS debe garantizar la inicialización
- **Prioridad**: Media
- **Requerimiento relacionado**: REQ-001

#### NC-003: Error de red durante descarga sin retry
- **Escenario**: La conexión de red se pierde durante una descarga. iOS emite `taskIsWaitingForConnectivity` pero no hay mecanismo de retry con backoff.
- **Código afectado**: `DownloadsModule2.swift` → `urlSession(_:taskIsWaitingForConnectivity:)` (líneas 2902-2927)
- **Impacto**: La descarga queda en estado `waitingForNetwork` indefinidamente. Si la red vuelve, iOS puede reanudar automáticamente (gracias a `waitsForConnectivity=true`), pero no hay timeout ni notificación al usuario si la espera es prolongada.
- **Recomendación**: Implementar — añadir timeout configurable para estado waitingForNetwork
- **Prioridad**: Alta
- **Requerimiento relacionado**: REQ-022

#### NC-004: Condición de carrera en acceso a activeDownloads
- **Escenario**: Aunque `downloadQueue` serializa las operaciones, los métodos de configuración (`setStreamQuality`, `setNetworkPolicy`, etc.) escriben propiedades directamente sin pasar por la queue.
- **Código afectado**: `DownloadsModule2.swift` → `setStreamQuality()` (línea 896), `setNotificationConfig()` (línea 919)
- **Impacto**: Lectura/escritura concurrente de propiedades como `currentStreamQuality`, `notificationsEnabled`. En la práctica, el riesgo es bajo porque son escrituras atómicas de tipos simples.
- **Recomendación**: Documentar como limitación — bajo riesgo real
- **Prioridad**: Baja
- **Requerimiento relacionado**: REQ-034, REQ-035

#### NC-005: ContentKeyManager singleton compartido entre módulos
- **Escenario**: `DownloadsModule` (v1) y `DownloadsModule2` (v2) ambos escriben en `ContentKeyManager.sharedManager` (licensingServiceUrl, fpsCertificateUrl, asset). Si ambos se usan simultáneamente, el último en escribir gana.
- **Código afectado**: `DownloadsModule.swift` → `addItem()`, `DownloadsModule2.swift` → `setupDRMForAsset()`, `ContentKeyManager.swift` → propiedades mutables del singleton
- **Impacto**: Configuración DRM incorrecta, posible fallo en obtención de licencias o claves persistidas para el asset equivocado.
- **Recomendación**: Implementar — eliminar módulo v1 o aislar las sesiones de clave
- **Prioridad**: Alta
- **Requerimiento relacionado**: REQ-025, REQ-028

#### NC-006: Force unwrap en YouboraParams crashea la app
- **Escenario**: Se recibe un diccionario de YouboraParams sin el campo `contentIsLive`.
- **Código afectado**: `YouboraParams.swift` → línea 83: `(json["contentIsLive"] as? Bool)!`
- **Impacto**: Crash de la app (Fatal error: Unexpectedly found nil while unwrapping an Optional value).
- **Recomendación**: Implementar — cambiar a `json["contentIsLive"] as? Bool ?? false`
- **Prioridad**: Crítica
- **Requerimiento relacionado**: Ninguno (DataStructures)

#### NC-007: Header DRM vacío en ContentKeyManager
- **Escenario**: Todas las solicitudes de CKC al KSM se envían con el header `X-AxDRM-Message` vacío.
- **Código afectado**: `ContentKeyManager.swift` → línea 732: `ksmRequest.setValue("", forHTTPHeaderField: "X-AxDRM-Message")`
- **Impacto**: Si el KSM requiere un token de autenticación en este header, las solicitudes fallarán. Actualmente funciona si el KSM no valida este header.
- **Recomendación**: Implementar — propagar el `licenseToken` desde la configuración DRM
- **Prioridad**: Alta
- **Requerimiento relacionado**: REQ-027

#### NC-008: Timer de progreso sin invalidación en deinit
- **Escenario**: `DownloadsModule2` se destruye (por ejemplo, durante hot reload en desarrollo) mientras el timer de progreso está activo.
- **Código afectado**: `DownloadsModule2.swift` → `progressTimer` (líneas 1280-1332)
- **Impacto**: Timer huérfano que sigue ejecutándose. Usa `[weak self]` así que no causará crash, pero el timer no se invalida y consume recursos.
- **Recomendación**: Implementar — añadir `deinit { invalidateProgressTimer() }`
- **Prioridad**: Media
- **Requerimiento relacionado**: REQ-021

#### NC-009: Errores de bookmark silenciados
- **Escenario**: Falla la creación de un bookmark para un asset descargado (por ejemplo, por permisos).
- **Código afectado**: `DownloadsModule2.swift` → `saveAssetBookmark()` (líneas 2772-2781): `catch { // Failed to create bookmark }`
- **Impacto**: El asset se descarga correctamente pero no se puede localizar tras un cambio de sandbox UUID. La descarga aparece como completada pero el fichero no se encuentra para reproducción offline.
- **Recomendación**: Implementar — loguear el error y emitir warning a JS
- **Prioridad**: Alta
- **Requerimiento relacionado**: REQ-018

#### NC-010: Espacio insuficiente detectado tarde
- **Escenario**: No se verifica el espacio disponible antes de iniciar una descarga. El error `NO_SPACE_LEFT` solo se detecta cuando iOS reporta el fallo.
- **Código afectado**: `DownloadsModule2.swift` → `addDownload()` (no verifica espacio), `urlSession(didCompleteWithError:)` (líneas 2160-2198)
- **Impacto**: Se inicia la descarga, se consume ancho de banda y tiempo, y luego falla. El usuario no recibe feedback preventivo.
- **Recomendación**: Implementar — verificar espacio disponible vs estimación de tamaño antes de iniciar
- **Prioridad**: Alta
- **Requerimiento relacionado**: REQ-001, REQ-032

#### NC-011: URLSession síncrono puede bloquear
- **Escenario**: `ContentKeyManager.requestContentKeyFromKeySecurityModule()` usa `URLSession.synchronousDataTask()` que bloquea el hilo con un semáforo.
- **Código afectado**: `ContentKeyManager.swift` → línea 735, `Utils.swift` → `synchronousDataTask()` (líneas 20-40)
- **Impacto**: Si se ejecuta en la queue del ContentKeySession y el servidor de licencias tarda en responder, bloquea todas las operaciones de clave. Si se ejecuta en main thread, congela la UI.
- **Recomendación**: Implementar — convertir a async/await
- **Prioridad**: Alta
- **Requerimiento relacionado**: REQ-027

#### NC-012: Métodos stub devuelven datos falsos
- **Escenario**: Se llama desde JS a métodos como `getManifestInfo()`, `estimateDownloadTime()`, `checkLicenseValidity()`, `recoverDownloads()`, etc. que devuelven datos hardcodeados o vacíos.
- **Código afectado**: `DownloadsModule2.swift` → líneas 961, 971, 977, 982, 987, 1043, 1089, 1110, 1121, 1865, 1869, 1873, 1886, 1891
- **Impacto**: La capa JS puede tomar decisiones incorrectas basándose en datos falsos (ej: `checkLicenseValidity()` siempre devuelve `true`).
- **Recomendación**: Implementar los métodos necesarios o eliminar los que no se usan del bridge
- **Prioridad**: Alta
- **Requerimiento relacionado**: Múltiples

#### NC-013: Descarga parcial tratada como exitosa
- **Escenario**: Una descarga alcanza ≥98% de progreso pero falla con error 404 (chunks no disponibles en CDN). El sistema la marca como completada.
- **Código afectado**: `DownloadsModule2.swift` → `urlSession(didCompleteWithError:)` (líneas 2200-2222)
- **Impacto**: El asset puede tener chunks faltantes que causen glitches o cortes durante la reproducción offline. La validación relajada no detecta chunks individuales faltantes.
- **Recomendación**: Documentar como limitación — el umbral del 98% es un compromiso aceptable para HLS
- **Prioridad**: Media
- **Requerimiento relacionado**: REQ-029

---

## 4.3 Complejidad innecesaria

#### CI-001: Triple persistencia de ubicación de assets
- **Código**: `DownloadsModule2.swift` → `activeDownloads[id].assetPath` (persistido en `ACTIVE_DOWNLOADS_KEY`), `saveAssetPath()` (`ASSET_PATHS_KEY`), `saveAssetBookmark()` (`ASSET_BOOKMARKS_KEY`)
- **Qué hace**: Tres mecanismos independientes para guardar la misma información (dónde está el fichero .movpkg)
- **Por qué parece innecesario**: Los bookmarks (`ASSET_BOOKMARKS_KEY`) son el mecanismo más robusto y el único que sobrevive cambios de sandbox UUID. Los otros dos son redundantes si los bookmarks funcionan correctamente. La cascada de fallbacks en `removeDownloadedFiles()` (líneas 1597-1661) y `calculateTotalDownloadsSize()` (líneas 2491-2590) añade ~200 líneas de complejidad.
- **Propuesta**: Simplificar — usar bookmarks como mecanismo principal, mantener assetPath en memoria solo como cache, eliminar `ASSET_PATHS_KEY` separado
- **Riesgo de eliminación**: Si los bookmarks fallan (raro pero posible), no habría fallback. Mitigación: loguear warnings cuando un bookmark no se puede crear.

#### CI-002: Módulo de descargas v1 completo (Downloads/)
- **Código**: `Downloads/Asset.swift` (114 líneas), `Downloads/DownloadsModule.swift` (344 líneas), `Downloads/DownloadsModule.m` (30 líneas), `Managers/AssetDownloader.swift` (411 líneas) — total ~900 líneas
- **Qué hace**: Sistema de descargas legacy que usa `AssetDownloader` singleton y `AVAssetDownloadTask` (no aggregate)
- **Por qué parece innecesario**: `DownloadsModule2` reimplementa toda la funcionalidad con mejoras (aggregate tasks, persistencia robusta, validación, purga). Los métodos legacy en DM2 ya delegan a los nuevos. Mantener ambos módulos registrados en RN crea confusión y riesgo de conflicto en `ContentKeyManager`.
- **Propuesta**: Eliminar — tras confirmar que ningún código JS referencia `NativeModules.DownloadsModule` (sin "2")
- **Riesgo de eliminación**: Si algún flujo JS aún usa v1, dejará de funcionar. Verificar con grep en el código TypeScript.

#### CI-003: LogManager con UITextView
- **Código**: `Extensions + Utils/LogManager.swift` (104 líneas)
- **Qué hace**: Singleton de logging que mantiene referencia a un `UITextView` para mostrar logs en pantalla
- **Por qué parece innecesario**: Es una herramienta de debug que no debería estar en producción. Acopla el sistema de logging a UIKit innecesariamente. Los logs a consola (`print`/`RCTLog`) son suficientes para producción.
- **Propuesta**: Simplificar — eliminar la dependencia de `UITextView`, mantener solo logging a consola
- **Riesgo de eliminación**: Si hay una pantalla de debug en la app que muestra estos logs, dejaría de funcionar. Verificar si `LogManager.singletonInstance.textView` se asigna en algún lugar.

#### CI-004: Manejo de /.nofollow disperso
- **Código**: `DownloadsModule2.swift` → ~10 ocurrencias en `removeDownloadedFiles()`, `calculateAssetSize()`, `calculateTotalDownloadsSize()`, `validateAssetIntegrity()`, `validateAssetIntegrityRelaxed()`
- **Qué hace**: Cada método que accede a paths de ficheros verifica si el path tiene prefijo `/.nofollow` y lo elimina
- **Por qué parece innecesario**: El mismo patrón de 3-4 líneas se repite en 10 lugares. Una función centralizada `cleanPath()` reduciría esto a 1 línea por uso.
- **Propuesta**: Simplificar — extraer a función `cleanPath()` en `DownloadFileManager`
- **Riesgo de eliminación**: Ninguno si la función centralizada cubre todos los casos.

#### CI-005: Duplicación URLSession+data
- **Código**: `Extensions + Utils/Utils.swift` (líneas 20-40) y `Video/Features/URLSession+data.swift` (~15 líneas)
- **Qué hace**: Ambos extienden `URLSession` con funcionalidad de data task síncrono usando `DispatchSemaphore`
- **Por qué parece innecesario**: Duplicación directa del mismo concepto. En Swift, las extensiones son globales dentro del target, así que ambas compilan pero solo una se necesita.
- **Propuesta**: Eliminar `Video/Features/URLSession+data.swift`
- **Riesgo de eliminación**: Ninguno si están en el mismo target de compilación.

#### CI-006: Modificación Axinom hardcodeada en RCTVideoDRM
- **Código**: `Video/Features/RCTVideoDRM.swift` → líneas 23-36
- **Qué hace**: El decode base64 de la respuesta de licencia está comentado con `DANI: Axinom Response`. La respuesta se usa directamente sin decodificar.
- **Por qué parece innecesario**: Es una modificación específica para un proveedor DRM (Axinom) que debería ser configurable. Si se cambia de proveedor, este código fallará silenciosamente.
- **Propuesta**: Simplificar — hacer configurable vía prop `base64Certificate` o similar
- **Riesgo de eliminación**: Si se restaura el decode base64, las licencias Axinom dejarán de funcionar. Necesita ser configurable, no hardcodeado.

#### CI-007: Estimación de tamaño con valor por defecto de 500MB
- **Código**: `DownloadsModule2.swift` → línea 2024: `let estimatedTotalBytes: Int64 = downloadInfo.totalBytes > 0 ? downloadInfo.totalBytes : 500_000_000`
- **Qué hace**: Si no se conoce el tamaño total de la descarga, asume 500MB para calcular velocidad y tiempo restante
- **Por qué parece innecesario**: El valor 500MB es arbitrario y puede dar estimaciones muy incorrectas para vídeos cortos (sobreestima) o largos (subestima). Los valores de velocidad y tiempo restante basados en esta estimación son poco fiables.
- **Propuesta**: Simplificar — no reportar velocidad/tiempo restante si no se conoce el tamaño real, o usar la duración del stream como proxy
- **Riesgo de eliminación**: La UI perdería las estimaciones de velocidad/tiempo, pero serían más honestas.

#### CI-008: Métodos de DRM stub que siempre resuelven
- **Código**: `DownloadsModule2.swift` → `renewLicense()` (línea 961), `releaseAllLicenses()` (línea 971), `releaseLicenseForDownload()` (línea 1865), `downloadLicenseForContent()` (línea 1869), `checkLicenseValidity()` (línea 1873)
- **Qué hace**: Métodos que resuelven la promesa sin hacer nada, o devuelven `true` siempre
- **Por qué parece innecesario**: Están expuestos en el bridge Obj-C y pueden ser llamados desde JS. Dar la apariencia de funcionalidad sin implementación real es peor que no tener el método.
- **Propuesta**: Eliminar del bridge los que no se usan, o implementar los que sí se necesitan
- **Riesgo de eliminación**: Si algún código JS llama a estos métodos, recibirá un error de "método no encontrado" en vez de un resolve silencioso. Esto es preferible porque hace visible el problema.

---

## 4.4 Resumen ejecutivo

| ID | Tipo | Descripción | Estado | Tests | Prioridad refact. |
|---|---|---|---|---|---|
| REQ-001 | Requerimiento | Iniciar descarga HLS | Implementado | ⬜ | Alta |
| REQ-002 | Requerimiento | Validar configuración de descarga | Implementado (básico) | ⬜ | Media |
| REQ-003 | Requerimiento | Pausar descarga individual | Implementado | ⬜ | Media |
| REQ-004 | Requerimiento | Reanudar descarga individual | Implementado | ⬜ | Media |
| REQ-005 | Requerimiento | Cancelar descarga individual | Implementado | ⬜ | Media |
| REQ-006 | Requerimiento | Eliminar descarga completada | Implementado | ⬜ | Alta |
| REQ-007 | Requerimiento | Pausar todas las descargas | Implementado | ⬜ | Baja |
| REQ-008 | Requerimiento | Reanudar todas las descargas | Implementado | ⬜ | Baja |
| REQ-009 | Requerimiento | Cancelar todas las descargas | Implementado | ⬜ | Baja |
| REQ-010 | Requerimiento | Control de concurrencia | Implementado | ⬜ | Media |
| REQ-011 | Requerimiento | Selección de calidad | Implementado | ⬜ | Baja |
| REQ-012 | Requerimiento | Consultar lista de descargas | Implementado | ⬜ | Baja |
| REQ-013 | Requerimiento | Consultar descarga individual | Implementado | ⬜ | Baja |
| REQ-014 | Requerimiento | Verificar existencia de descarga | Implementado | ⬜ | Baja |
| REQ-015 | Requerimiento | Obtener estadísticas | Implementado | ⬜ | Baja |
| REQ-016 | Requerimiento | Persistir estado entre sesiones | Implementado | ⬜ | Alta |
| REQ-017 | Requerimiento | Persistir ubicación de assets | Implementado | ⬜ | Alta |
| REQ-018 | Requerimiento | Bookmarks sandbox-safe | Implementado | ⬜ | Alta |
| REQ-019 | Requerimiento | Bookmarks de subtítulos | Implementado | ⬜ | Media |
| REQ-020 | Requerimiento | Persistir claves DRM | Implementado | ⬜ | Alta |
| REQ-021 | Requerimiento | Reportar progreso | Implementado | ⬜ | Alta |
| REQ-022 | Requerimiento | Eventos de cambio de estado | Implementado | ⬜ | Alta |
| REQ-023 | Requerimiento | Evento descarga preparada | Implementado | ⬜ | Media |
| REQ-024 | Requerimiento | Velocidad y tiempo restante | Parcial (estimación) | ⬜ | Baja |
| REQ-025 | Requerimiento | Sesión de claves FairPlay | Implementado | ⬜ | Alta |
| REQ-026 | Requerimiento | Obtener certificado FPS | Implementado | ⬜ | Alta |
| REQ-027 | Requerimiento | Solicitar CKC al KSM | Implementado | ⬜ | Alta |
| REQ-028 | Requerimiento | Configurar DRM para descarga | Implementado | ⬜ | Alta |
| REQ-029 | Requerimiento | Validar integridad de asset | Implementado | ⬜ | Alta |
| REQ-030 | Requerimiento | Purgar assets huérfanos | Implementado | ⬜ | Media |
| REQ-031 | Requerimiento | Recuperar tareas tras restart | Implementado | ⬜ | Alta |
| REQ-032 | Requerimiento | Calcular espacio de descargas | Implementado | ⬜ | Media |
| REQ-033 | Requerimiento | Info del sistema | Implementado | ⬜ | Baja |
| REQ-034 | Requerimiento | Política de red | Parcial (delegado a JS) | ⬜ | Baja |
| REQ-035 | Requerimiento | Límites de descarga | Implementado | ⬜ | Baja |
| REQ-036 | Requerimiento | Bookmarks subtítulos desde JS | Implementado | ⬜ | Media |
| REQ-037 | Requerimiento | API legacy v1 | Implementado | ⬜ | Media |
| REQ-038 | Requerimiento | Now Playing Info Center | Implementado | ⬜ | Baja |
| REQ-039 | Requerimiento | DRM FairPlay para reproducción | Implementado | ⬜ | Alta |
| REQ-040 | Requerimiento | Caché de vídeo | Implementado | ⬜ | Baja |
| NC-001 | No contemplado | Descarga duplicada sin protección | — | — | Crítica |
| NC-002 | No contemplado | Sesión no inicializada | — | — | Media |
| NC-003 | No contemplado | Error de red sin retry/timeout | — | — | Alta |
| NC-004 | No contemplado | Race condition en config | — | — | Baja |
| NC-005 | No contemplado | Singleton DRM compartido | — | — | Alta |
| NC-006 | No contemplado | Force unwrap en YouboraParams | — | — | Crítica |
| NC-007 | No contemplado | Header DRM vacío | — | — | Alta |
| NC-008 | No contemplado | Timer sin invalidación en deinit | — | — | Media |
| NC-009 | No contemplado | Errores de bookmark silenciados | — | — | Alta |
| NC-010 | No contemplado | Espacio no verificado pre-descarga | — | — | Alta |
| NC-011 | No contemplado | URLSession síncrono bloqueante | — | — | Alta |
| NC-012 | No contemplado | Métodos stub con datos falsos | — | — | Alta |
| NC-013 | No contemplado | Descarga parcial como exitosa | — | — | Media |
| CI-001 | Complejidad innecesaria | Triple persistencia de ubicación | — | — | Alta |
| CI-002 | Complejidad innecesaria | Módulo descargas v1 completo | — | — | Alta |
| CI-003 | Complejidad innecesaria | LogManager con UITextView | — | — | Baja |
| CI-004 | Complejidad innecesaria | Manejo /.nofollow disperso | — | — | Alta |
| CI-005 | Complejidad innecesaria | Duplicación URLSession+data | — | — | Baja |
| CI-006 | Complejidad innecesaria | Modificación Axinom hardcodeada | — | — | Media |
| CI-007 | Complejidad innecesaria | Estimación 500MB hardcodeada | — | — | Baja |
| CI-008 | Complejidad innecesaria | Métodos DRM stub | — | — | Alta |

### Métricas globales

| Métrica | Valor |
|---|---|
| Requerimientos funcionales | 40 |
| Requerimientos implementados | 38 (95%) |
| Requerimientos parciales | 2 (5%) |
| Casos no contemplados | 13 |
| Casos no contemplados críticos | 2 (NC-001, NC-006) |
| Complejidad innecesaria | 8 |
| Tests existentes | 0 |
| Tests propuestos (Fase 3) | 54 |
| Líneas de código total | ~7.500 |
| Fichero más grande | DownloadsModule2.swift (2929 líneas) |
