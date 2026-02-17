# Fase 1: Análisis Estructural — iOS Native (`/ios`)

## 1.1 Inventario de responsabilidades

---

### Downloads/Asset.swift (114 líneas)

| Categoría | Responsabilidad | Líneas aprox. | Funciones/Variables | Deps. internas | Deps. externas |
|---|---|---|---|---|---|
| Configuración | Definición del modelo `Asset` (name, url, id, contentKeyIdList) | 1-30 | `Asset`, propiedades | — | AVFoundation |
| Configuración | Enum `DownloadState` (notDownloaded, downloading, downloaded) | ~10 | `DownloadState` | — | — |
| Configuración | Struct `Keys` con claves para `NotificationCenter` userInfo | ~10 | `Keys` | — | — |
| Lógica de negocio | Creación de `AVURLAsset` a partir de URL | ~15 | `urlAsset()` | — | AVFoundation |
| Efectos secundarios | Registro del asset como recipient en `ContentKeySession` | ~15 | `addAsRecipient()` | — | `ContentKeyManager` |

---

### Downloads/DownloadsModule.m (30 líneas)

| Categoría | Responsabilidad | Líneas aprox. | Funciones/Variables | Deps. internas | Deps. externas |
|---|---|---|---|---|---|
| Configuración | Bridge Obj-C: exporta métodos RN (moduleInit, pause, resume, add, remove, getList, getItem) | 1-30 | Macros `RCT_EXTERN_METHOD` | — | React |

---

### Downloads/DownloadsModule.swift (344 líneas)

| Categoría | Responsabilidad | Líneas aprox. | Funciones/Variables | Deps. internas | Deps. externas |
|---|---|---|---|---|---|
| Gestión de estado | Lista de assets gestionados, observers de notificaciones | ~30 | `assets`, `hasListeners` | — | — |
| Orquestación | Inicialización del módulo: configura `AssetDownloader` y `ContentKeyManager` | ~40 | `moduleInit()` | — | `AssetDownloader`, `ContentKeyManager` |
| Efectos secundarios | Suscripción a `NotificationCenter` para progreso y cambio de estado | ~30 | `addObservers()` | Gestión de estado | Foundation |
| Lógica de negocio | Parseo de `StreamData` desde NSDictionary de React Native | ~30 | `StreamData` struct | — | — |
| Orquestación | Añadir/eliminar descargas: crea `Asset`, inicia descarga, configura DRM | ~60 | `addItem()`, `removeItem()` | `StreamData` | `AssetDownloader`, `ContentKeyManager` |
| Orquestación | Pausar/reanudar descargas individuales y globales | ~40 | `pause()`, `resume()`, `pauseAll()`, `resumeAll()` | — | `AssetDownloader` |
| Efectos secundarios | Emisión de eventos a React Native (progreso, estado, licencia) | ~50 | `handleProgress()`, `handleStateChange()`, `handlePersistableContentKey()` | Gestión de estado | React (`RCTEventEmitter`) |
| Lógica de negocio | Consulta de lista de descargas y estado individual | ~30 | `getList()`, `getItem()` | Gestión de estado | `AssetDownloader` |
| Manejo de errores | Rejects de promesas con códigos de error | ~15 | Disperso en métodos | — | React |

---

### Downloads_v2/DownloadsModule2.m (160 líneas)

| Categoría | Responsabilidad | Líneas aprox. | Funciones/Variables | Deps. internas | Deps. externas |
|---|---|---|---|---|---|
| Configuración | Bridge Obj-C: exporta ~50 métodos RN organizados por categoría (descargas, DRM, subtítulos, recovery, utilidades, legacy) | 1-160 | Macros `RCT_EXTERN_METHOD` | — | React |

---

### Downloads_v2/DownloadsModule2.swift (2929 líneas)

Este es el fichero más grande y complejo del directorio. Contiene múltiples responsabilidades entrelazadas.

| Categoría | Responsabilidad | Líneas aprox. | Funciones/Variables | Deps. internas | Deps. externas |
|---|---|---|---|---|---|
| **Gestión de estado** | Diccionarios de descargas activas, tareas, ubicaciones pendientes, progreso | ~80 | `activeDownloads`, `downloadTasks`, `pendingLocations`, `lastProgressUpdate`, `lastReportedProgress`, `completedWithoutError` | — | — |
| **Gestión de estado** | Configuración del módulo (directorios, límites, políticas de red, calidad) | ~40 | `downloadDirectory`, `tempDirectory`, `maxConcurrentDownloads`, `allowCellularDownloads`, `requireWifi`, `currentStreamQuality`, `notificationsEnabled` | — | — |
| **Gestión de estado** | Cache de espacio de descargas con TTL | ~15 | `cachedDownloadSpace`, `downloadSpaceCacheTime`, `DOWNLOAD_SPACE_CACHE_TTL` | — | — |
| **Configuración** | Enum `DownloadState` con 8 estados y conformancia `CaseIterable` | ~40 | `DownloadState`, `stringValue` | — | — |
| **Configuración** | Struct `DownloadInfo` con 14 campos | ~30 | `DownloadInfo` | `DownloadState` | — |
| **Configuración** | Constantes de persistencia (UserDefaults keys) | ~10 | `ACTIVE_DOWNLOADS_KEY`, `ASSET_PATHS_KEY`, `ASSET_BOOKMARKS_KEY`, `SUBTITLE_BOOKMARKS_KEY` | — | — |
| **Orquestación** | Inicialización: crea sesión de descarga, directorios, ContentKeySession, recupera tareas pendientes, restaura estado, purga huérfanos | ~80 | `moduleInit()`, `initializeDownloadSession()`, `createDirectoriesIfNeeded()`, `setupContentKeySession()` | Gestión de estado, Persistencia | AVFoundation, `ContentKeyManager` |
| **Lógica de negocio** | Añadir descarga: valida config, crea AVURLAsset, configura DRM, crea tarea aggregate | ~120 | `addDownload()`, `createDownloadTask()`, `setupDRMForAsset()` | Gestión de estado | AVFoundation, `ContentKeyManager` |
| **Lógica de negocio** | Eliminar descarga: cancela tarea, limpia ficheros, elimina paths/bookmarks | ~120 | `removeDownload()`, `removeDownloadedFiles()` | Gestión de estado, Persistencia | FileManager |
| **Orquestación** | Pausar/reanudar/cancelar descargas (individual y global) | ~100 | `pauseDownload()`, `resumeDownload()`, `cancelDownload()`, `pauseAll()`, `resumeAll()`, `cancelAll()` | Gestión de estado | — |
| **Lógica de negocio** | Consultas: lista de descargas, descarga individual, existencia, estadísticas | ~80 | `getDownloads()`, `getDownload()`, `hasDownload()`, `getStats()` | Gestión de estado | — |
| **Configuración** | Métodos de configuración: calidad, política de red, límites, notificaciones | ~40 | `setStreamQuality()`, `setNetworkPolicy()`, `setDownloadLimits()`, `setNotificationConfig()` | Gestión de estado | — |
| **Lógica de negocio** | Gestión DRM: descarga/verificación/renovación/liberación de licencias | ~50 | `downloadLicense()`, `checkLicense()`, `renewLicense()`, `releaseLicense()`, `releaseAllLicenses()` | — | `ContentKeyManager` |
| **Lógica de negocio** | Gestión de subtítulos: añadir/eliminar/consultar, bookmarks de subtítulos | ~80 | `addSubtitles()`, `removeSubtitles()`, `getSubtitles()`, `saveSubtitleBookmarkFromPath()`, `resolveSubtitlePath()`, `resolveSubtitlePaths()` | Persistencia subtítulos | FileManager |
| **Orquestación** | Recovery: recuperar descargas, limpiar temporales, validar, reparar | ~50 | `recoverDownloads()`, `cleanupTempFiles()`, `validateDownloads()`, `repairDownload()` | Gestión de estado | — |
| **Lógica de negocio** | Utilidades: generar ID, validar URI, info de manifiesto, estimar tiempo | ~40 | `generateDownloadId()`, `validateDownloadUri()`, `getManifestInfo()`, `estimateDownloadTime()` | — | — |
| **Orquestación** | Métodos legacy para compatibilidad con v1 | ~60 | `setItem()`, `addItem()`, `removeItem()`, `getItem()`, `getList()`, `pause()`, `resume()`, `downloadLicense()` (legacy) | Métodos nuevos | — |
| **Efectos secundarios** | Delegado `AVAssetDownloadDelegate`: progreso, ubicación, completado, error | ~200 | `urlSession(_:aggregateAssetDownloadTask:didLoad:...)`, `urlSession(_:aggregateAssetDownloadTask:willDownloadTo:)`, `urlSession(_:task:didCompleteWithError:)` | Gestión de estado, Persistencia | AVFoundation |
| **Lógica de negocio** | Finalización de descarga: validación de integridad (estricta y relajada), cálculo de tamaño | ~120 | `finalizeDownload()`, `validateAssetIntegrity()`, `validateAssetIntegrityRelaxed()` | Gestión de estado | AVFoundation, FileManager |
| **Lógica de negocio** | Purga de assets huérfanos: escanea Library/ y Documents/, cancela tareas huérfanas, limpia UserDefaults | ~140 | `purgeOrphanedAssets()`, `doPurgeOrphanedAssets()` | Gestión de estado, Persistencia | FileManager |
| **Efectos secundarios** | Timer de progreso: inicia/detiene timer periódico para descargas activas | ~70 | `startProgressTimerIfNeeded()`, `stopProgressTimerIfNotNeeded()`, `invalidateProgressTimer()`, `checkProgressUpdates()`, `progressTimer` | Gestión de estado | Timer, RunLoop |
| **Lógica de negocio** | Cálculo de espacio: tamaño de assets individuales, total de descargas, con cache | ~120 | `calculateAssetSize()`, `calculateTotalDownloadsSize()`, `calculateDirectorySize()`, `invalidateDownloadSpaceCache()` | Gestión de estado, Persistencia | FileManager |
| **Lógica de negocio** | Info del sistema: espacio total/disponible, directorios, conectividad | ~60 | `getSystemInfoDict()` | Cálculo de espacio | FileManager |
| **Persistencia** | Persistir/restaurar estado de descargas en UserDefaults | ~60 | `persistDownloadState()`, `restoreDownloadStates()` | Gestión de estado | UserDefaults |
| **Persistencia** | Asset paths en UserDefaults | ~30 | `saveAssetPath()`, `loadAssetPaths()`, `removeAssetPath()`, `clearAllAssetPaths()` | — | UserDefaults |
| **Persistencia** | Asset bookmarks (sobreviven cambios de sandbox UUID) | ~50 | `saveAssetBookmark()`, `loadAssetBookmarks()`, `resolveAssetBookmark()`, `removeAssetBookmark()` | — | UserDefaults |
| **Persistencia** | Subtitle bookmarks | ~80 | `saveSubtitleBookmark()`, `loadSubtitleBookmarks()`, `resolveSubtitleBookmark()`, `removeSubtitleBookmark()`, `removeAllSubtitleBookmarks()` | — | UserDefaults |
| **Orquestación** | Recovery de tareas pendientes del sistema tras restart | ~50 | `recoverPendingTask()` | Gestión de estado | AVFoundation |
| **Efectos secundarios** | Emisión de eventos a React Native | Disperso (~30 llamadas) | `sendEvent(withName:body:)` | — | React (`RCTEventEmitter`) |
| **Manejo de errores** | Manejo de errores en completado: 404 recuperable, espacio insuficiente, validación fallida | ~100 | Dentro de `urlSession(_:task:didCompleteWithError:)` | Gestión de estado | — |
| **Efectos secundarios** | Detección de espera por conectividad | ~30 | `urlSession(_:taskIsWaitingForConnectivity:)` | Gestión de estado | — |
| **Lógica de negocio** | Emisión de evento downloadPrepared con info de tracks | ~60 | `emitDownloadPrepared()` | — | AVFoundation |
| **Lógica de negocio** | Control de concurrencia: inicia descarga si hay slots disponibles | ~30 | `startDownloadIfPossible()` | Gestión de estado | — |
| **Lógica de negocio** | Serialización de DownloadInfo a diccionario para RN | ~20 | `createDownloadInfoDict()` | — | — |
| **Lógica de negocio** | Búsqueda de downloadId por tarea | ~5 | `findDownloadId()` | Gestión de estado | — |
| **Lógica de negocio** | Manejo de prefijo `/.nofollow` en paths | Disperso (~10 ocurrencias) | Inline en múltiples métodos | — | — |

---

### Extensions + Utils/LogManager.swift (104 líneas)

| Categoría | Responsabilidad | Líneas aprox. | Funciones/Variables | Deps. internas | Deps. externas |
|---|---|---|---|---|---|
| Gestión de estado | Singleton con referencia a `UITextView` para logging visual | ~15 | `LogManager.singletonInstance`, `textView` | — | UIKit |
| Configuración | Enum de tipos de mensaje y niveles de log | ~15 | `MessageType`, `logLevel` | — | — |
| Efectos secundarios | Escritura de logs en UITextView y consola Xcode | ~50 | `log()`, `clearLog()` | Gestión de estado | UIKit |

---

### Extensions + Utils/Notification.Name.swift (27 líneas)

| Categoría | Responsabilidad | Líneas aprox. | Funciones/Variables | Deps. internas | Deps. externas |
|---|---|---|---|---|---|
| Configuración | Definición de nombres de notificación custom | 1-27 | `HasAvailablePersistableContentKey`, `AssetDownloadProgress`, `AssetDownloadStateChanged`, `ConsoleMessageSent` | — | Foundation |

---

### Extensions + Utils/Utils.swift (56 líneas)

| Categoría | Responsabilidad | Líneas aprox. | Funciones/Variables | Deps. internas | Deps. externas |
|---|---|---|---|---|---|
| Lógica de negocio | Extensión `Date` → milisegundos | ~5 | `Date.millisecondsSince1970` | — | Foundation |
| Efectos secundarios | Extensión `URLSession` → data task síncrono con semáforo | ~20 | `URLSession.synchronousDataTask()` | — | Foundation |
| Lógica de negocio | Conversión de bytes a formato legible | ~10 | `bytesToHumanReadable()` | — | — |
| Configuración | Enum `ProgramError` con casos de error del sistema | ~15 | `ProgramError` | — | — |

---

### Managers/AssetDownloader.swift (411 líneas)

| Categoría | Responsabilidad | Líneas aprox. | Funciones/Variables | Deps. internas | Deps. externas |
|---|---|---|---|---|---|
| Gestión de estado | Singleton con diccionarios de descargas activas y mapeo de tareas | ~30 | `AssetDownloader.sharedDownloader`, `activeDownloadsMap`, `assetDownloadURLSession` | — | — |
| Orquestación | Configuración de `AVAssetDownloadURLSession` con background config | ~30 | `init()` | — | AVFoundation |
| Lógica de negocio | Iniciar descarga HLS: crea `AVAssetDownloadTask` | ~40 | `downloadStream()` | Gestión de estado | AVFoundation |
| Lógica de negocio | Cancelar/pausar/reanudar/eliminar descargas | ~60 | `cancelDownload()`, `pauseDownload()`, `resumeDownload()`, `deleteAsset()` | Gestión de estado | AVFoundation, FileManager |
| Lógica de negocio | Determinar estado de descarga de un asset | ~30 | `downloadState()` | Gestión de estado | — |
| Efectos secundarios | Delegado `AVAssetDownloadDelegate`: progreso, ubicación, completado | ~120 | `urlSession(didLoad:...)`, `urlSession(didFinishDownloadingTo:)`, `urlSession(didCompleteWithError:)` | Gestión de estado | AVFoundation |
| Efectos secundarios | Emisión de notificaciones de progreso y cambio de estado | ~30 | `NotificationCenter.default.post()` | — | Foundation |
| Lógica de negocio | Restauración de descargas tras restart de app | ~30 | `restorePendingDownloads()` | Gestión de estado | AVFoundation |

---

### Managers/ContentKeyManager.swift (772 líneas)

| Categoría | Responsabilidad | Líneas aprox. | Funciones/Variables | Deps. internas | Deps. externas |
|---|---|---|---|---|---|
| Gestión de estado | Singleton con sesión de content key, URLs de certificado y licencia, asset actual | ~40 | `ContentKeyManager.sharedManager`, `contentKeySession`, `fpsCertificateUrl`, `licensingServiceUrl`, `asset`, `downloadRequestedByUser` | — | AVFoundation |
| Orquestación | Creación y configuración de `AVContentKeySession` | ~20 | `createContentKeySession()` | — | AVFoundation |
| Lógica de negocio | Obtención de certificado FPS desde URL | ~60 | `requestApplicationCertificate()` | Gestión de estado | URLSession |
| Lógica de negocio | Solicitud de CKC al KSM (Key Security Module) | ~60 | `requestContentKeyFromKeySecurityModule()` | Gestión de estado | URLSession (síncrono) |
| Efectos secundarios | Delegado `AVContentKeySessionDelegate`: respuesta a solicitudes de clave | ~200 | `contentKeySession(didProvide:)`, `contentKeySession(didProvideRenewingContentKeyRequest:)`, `contentKeySession(shouldRetry:)` | Gestión de estado | AVFoundation |
| Lógica de negocio | Manejo de claves online: genera SPC, solicita CKC, responde al request | ~100 | `handleOnlineContentKeyRequest()` | Certificado, KSM | AVFoundation |
| Lógica de negocio | Manejo de claves offline: persiste claves a disco, genera SPC persistible | ~120 | `handlePersistableContentKeyRequest()` | Certificado, KSM | AVFoundation, FileManager |
| Lógica de negocio | Persistencia de claves: escritura/lectura/eliminación en disco | ~80 | `writePersistableContentKey()`, `deletePeristableContentKey()`, `deleteAllPeristableContentKeys()`, `contentKeyDirectory` | — | FileManager |
| Efectos secundarios | Notificación de clave persistible disponible | ~10 | `NotificationCenter.default.post(HasAvailablePersistableContentKey)` | — | Foundation |
| Manejo de errores | Logging de errores DRM con `RCTLog` | Disperso | — | — | React |

---

### NowPlayingInfoCenterManager.swift (271 líneas)

| Categoría | Responsabilidad | Líneas aprox. | Funciones/Variables | Deps. internas | Deps. externas |
|---|---|---|---|---|---|
| Gestión de estado | Singleton con tabla de players registrados, player actual, observers | ~25 | `NowPlayingInfoCenterManager.shared`, `currentPlayer`, `players`, `observers`, `playbackObserver` | — | — |
| Gestión de estado | Targets de comandos remotos | ~10 | `playTarget`, `pauseTarget`, `skipForwardTarget`, `skipBackwardTarget`, `playbackPositionTarget`, `togglePlayPauseTarget` | — | — |
| Orquestación | Registro/eliminación de players con observación de rate | ~40 | `registerPlayer()`, `removePlayer()` | Gestión de estado | AVFoundation |
| Efectos secundarios | Configuración de audio session y remote control events | ~15 | `receivingRemoveControlEvents` (didSet) | — | AVFoundation, UIKit |
| Efectos secundarios | Registro de command targets en `MPRemoteCommandCenter` | ~70 | `registerCommandTargets()`, `invalidateCommandTargets()` | Gestión de estado | MediaPlayer |
| Lógica de negocio | Actualización de `MPNowPlayingInfoCenter` con metadata del player actual | ~40 | `updateNowPlayingInfo()` | Gestión de estado | MediaPlayer, AVFoundation |
| Lógica de negocio | Selección automática del player activo basada en rate | ~30 | `findNewCurrentPlayer()`, `observePlayers()` | Gestión de estado | AVFoundation |
| Orquestación | Cleanup: elimina observers, targets, info de now playing | ~15 | `cleanup()` | Gestión de estado | MediaPlayer |

---

### Video/DataStructures/ (8 ficheros, ~370 líneas total)

Todos son structs de datos simples que parsean `NSDictionary` de React Native.

| Fichero | Responsabilidad | Líneas |
|---|---|---|
| `Chapter.swift` | Modelo de capítulo (title, uri, startTime, endTime) | 25 |
| `CustomMetadata.swift` | Modelo de metadata (title, subtitle, artist, description, imageUri) | 29 |
| `DRMParams.swift` | Modelo de parámetros DRM (type, licenseServer, certificateUrl, headers, contentId) | 41 |
| `SelectedTrackCriteria.swift` | Modelo de criterio de selección de pista (type, value) | 19 |
| `SubtitleStyle.swift` | Modelo de estilo de subtítulos (opacity) | 18 |
| `TextTrack.swift` | Modelo de pista de texto (type, language, title, uri, index) | 53 |
| `VideoSource.swift` | Modelo de fuente de vídeo (uri, type, id, title, isNetwork, shouldCache, requestHeaders, startPosition, crop) | 76 |
| `YouboraParams.swift` | Modelo de parámetros Youbora (30+ campos de analítica) | 108 |

**Categoría única**: Configuración — parseo de NSDictionary a structs tipados.

---

### Video/Features/ (12 ficheros, ~1850 líneas total)

| Fichero | Categoría principal | Responsabilidad | Líneas |
|---|---|---|---|
| `RCTCaptionStyleUtils.swift` | Lógica de negocio | Conversión de estilos de subtítulos RN a `AVTextStyleRule` | ~30 |
| `RCTIMAAdsManager.swift` | Orquestación + Efectos secundarios | Integración Google IMA SDK: carga, reproducción y eventos de anuncios | 261 |
| `RCTPictureInPicture.swift` | Efectos secundarios | Gestión de PiP con `AVPictureInPictureController` y delegado | 90 |
| `RCTPlayerObserver.swift` | Efectos secundarios | Observador KVO de AVPlayer/AVPlayerItem con ~15 callbacks delegados | 335 |
| `RCTPlayerOperations.swift` | Lógica de negocio | Selección de pistas de texto y audio (sideloaded y embebidas) | 219 |
| `RCTResourceLoaderDelegate.swift` | Efectos secundarios + Lógica de negocio | `AVAssetResourceLoaderDelegate` para DRM FairPlay en playback | 187 |
| `RCTVideoDRM.swift` | Lógica de negocio | Fetch de licencias DRM y creación de requests HTTP | 186 |
| `RCTVideoErrorHandling.swift` | Configuración + Manejo de errores | Enum de errores DRM y factory de `NSError` | 115 |
| `RCTVideoSave.swift` | Efectos secundarios | Guardado de vídeo a galería | ~30 |
| `RCTVideoTVUtils.swift` | Lógica de negocio | Utilidades específicas para tvOS | ~30 |
| `RCTVideoUtils.swift` | Lógica de negocio | Utilidades: duración, metadata, tracks, audio session, ventana | 499 |
| `URLSession+data.swift` | Efectos secundarios | Extensión URLSession para data task síncrono | ~15 |

---

### Video/RCTVideo.swift (~73KB, ~1800+ líneas)

Fichero principal del player. No se desglosa en detalle aquí por estar fuera del foco principal de descargas, pero se documenta su acoplamiento:

| Categoría | Responsabilidad | Deps. relevantes |
|---|---|---|
| Orquestación | Clase `UIView` principal que integra AVPlayer, DRM, PiP, IMA, observer | `RCTPlayerObserver`, `RCTResourceLoaderDelegate`, `RCTIMAAdsManager`, `RCTPictureInPicture`, `NowPlayingInfoCenterManager` |
| Gestión de estado | ~50 propiedades reactivas (source, paused, muted, volume, rate, etc.) | DataStructures/* |
| Efectos secundarios | Emisión de ~30 eventos a React Native | React |

---

### Video/RCTVideoManager.swift (100 líneas) + RCTVideoManager.m (93 líneas)

| Categoría | Responsabilidad | Líneas aprox. |
|---|---|---|
| Orquestación | `RCTViewManager` que crea instancias de `RCTVideo` y delega métodos | 100 (Swift) |
| Configuración | Bridge Obj-C: exporta ~40 props y ~9 métodos | 93 (Obj-C) |

---

### Video/RCTVideoPlayerViewController.swift (50 líneas)

| Categoría | Responsabilidad | Líneas aprox. |
|---|---|---|
| Presentación | Subclase de `AVPlayerViewController` con soporte de orientación y delegado de dismiss | 50 |

---

### Video/RCTVideoSwiftLog/ (2 ficheros, ~25 líneas)

| Categoría | Responsabilidad |
|---|---|
| Efectos secundarios | Bridge de logging Swift → Obj-C `RCTLogInfo` |

---

### VideoCaching/ (3 ficheros, ~313 líneas)

| Fichero | Categoría | Responsabilidad | Líneas |
|---|---|---|---|
| `RCTVideoCache.h` | Configuración | Header con enum `RCTVideoCacheStatus` e interfaz de caché | 38 |
| `RCTVideoCache.m` | Lógica de negocio + Efectos secundarios | Singleton de caché con `SPTPersistentCache`: almacenamiento, recuperación, hash MD5, GC | 176 |
| `RCTVideoCachingHandler.swift` | Orquestación | Handler Swift que decide si cachear y gestiona flujo con `DVAssetLoaderDelegate` | 99 |

---

## 1.2 Mapa de acoplamiento

### 1.2.1 Acoplamiento intra-fichero (DownloadsModule2.swift)

Este fichero tiene el acoplamiento interno más complejo:

| Responsabilidad A | Responsabilidad B | Tipo | Descripción |
|---|---|---|---|
| Gestión de estado (`activeDownloads`) | Todas las operaciones de descarga | **Fuerte** | Todos los métodos leen/escriben `activeDownloads` |
| Gestión de estado (`downloadTasks`) | Delegado AVAssetDownload | **Fuerte** | El delegado busca downloadId por tarea en `downloadTasks` |
| Persistencia (UserDefaults) | Gestión de estado | **Fuerte** | `persistDownloadState()` serializa `activeDownloads`; `restoreDownloadStates()` lo reconstruye |
| Persistencia (Bookmarks) | Eliminación de ficheros | **Fuerte** | `removeDownloadedFiles()` usa bookmarks como fallback para localizar assets |
| Timer de progreso | Gestión de estado | **Fuerte** | Timer consulta `activeDownloads` para decidir si detenerse |
| Cálculo de espacio | Persistencia + Gestión de estado | **Fuerte** | `calculateTotalDownloadsSize()` lee de `activeDownloads` Y de `loadAssetPaths()` |
| Manejo de errores (completado) | Validación de integridad | **Fuerte** | `urlSession(didCompleteWithError:)` invoca `finalizeDownload()` → `validateAssetIntegrity()` |
| Métodos legacy | Métodos nuevos | **Punto de corte** | Los métodos legacy delegan a los nuevos (`addItem` → `addDownload`) |
| Configuración | Operaciones de descarga | **Débil** | Los métodos de config solo escriben variables que otros leen |

### 1.2.2 Acoplamiento entre ficheros

| Fichero A | Fichero B | Tipo | Descripción |
|---|---|---|---|
| `DownloadsModule2.swift` | `ContentKeyManager.swift` | **Fuerte** | DM2 configura CKM (licensingServiceUrl, fpsCertificateUrl, asset), le asigna como delegate de contentKeySession, y llama `createContentKeySession()` |
| `DownloadsModule.swift` | `ContentKeyManager.swift` | **Fuerte** | Mismo patrón que DM2 pero con API v1 |
| `DownloadsModule.swift` | `AssetDownloader.swift` | **Fuerte** | DM1 delega todas las operaciones de descarga al singleton `AssetDownloader` |
| `DownloadsModule2.swift` | `AssetDownloader.swift` | **Ninguno** | DM2 NO usa AssetDownloader — gestiona sus propias sesiones de descarga |
| `DownloadsModule.swift` | `Asset.swift` | **Fuerte** | DM1 crea instancias de `Asset` para cada descarga |
| `DownloadsModule2.swift` | `Asset.swift` | **Débil** | DM2 solo crea `Asset` para configurar DRM, no como modelo principal (usa `DownloadInfo`) |
| `ContentKeyManager.swift` | `Asset.swift` | **Fuerte** | CKM almacena un `Asset` y usa su `contentKeyIdList` |
| `AssetDownloader.swift` | `Asset.swift` | **Fuerte** | AD almacena mapeo de `AVAssetDownloadTask` → `Asset` |
| `ContentKeyManager.swift` | `Utils.swift` | **Fuerte** | CKM usa `URLSession.synchronousDataTask()` y `ProgramError` |
| `RCTResourceLoaderDelegate.swift` | `RCTVideoDRM.swift` | **Fuerte** | RLD usa funciones estáticas de DRM para fetch de licencias |
| `RCTVideo.swift` | `NowPlayingInfoCenterManager.swift` | **Fuerte** | RCTVideo registra/elimina player en el singleton |
| `RCTVideo.swift` | `RCTPlayerObserver.swift` | **Fuerte** | RCTVideo implementa el protocolo delegado del observer |
| `RCTVideo.swift` | Todos los Features/ | **Fuerte** | RCTVideo integra PiP, IMA, DRM, observer, operations |
| `DownloadsModule.swift` ↔ `DownloadsModule2.swift` | — | **Ninguno** | Son módulos independientes registrados con nombres distintos en RN |
| `LogManager.swift` | Varios | **Débil** | Solo usado por `ContentKeyManager` y `AssetDownloader` para logging |

### 1.2.3 Diagrama de dependencias principales (Downloads)

```
DownloadsModule.swift ──────► AssetDownloader.swift ──► AVAssetDownloadURLSession
       │                              │
       │                              ▼
       ├──────────────────► ContentKeyManager.swift ──► AVContentKeySession
       │                         │
       ▼                         ▼
   Asset.swift              FileManager (claves persistidas)
                                 │
                                 ▼
                            Utils.swift (sync URLSession, ProgramError)

DownloadsModule2.swift ──────► AVAssetDownloadURLSession (directa, sin AssetDownloader)
       │
       ├──────────────────► ContentKeyManager.swift (solo para DRM)
       │
       ├──────────────────► UserDefaults (persistencia de estado, paths, bookmarks)
       │
       ├──────────────────► FileManager (ficheros descargados, validación, purga)
       │
       └──────────────────► Asset.swift (solo para setup DRM)
```

---

## 1.3 Señales de alerta

### SA-01: God Object — DownloadsModule2.swift (2929 líneas)

- **Fichero**: `Downloads_v2/DownloadsModule2.swift`
- **Problema**: Contiene **~15 responsabilidades distintas** en una sola clase: gestión de estado, persistencia (3 mecanismos distintos), delegado de descarga, validación de integridad, cálculo de espacio, timer de progreso, purga de huérfanos, DRM, subtítulos, recovery, métodos legacy, serialización, manejo de errores, emisión de eventos.
- **Impacto**: Extremadamente difícil de testear, mantener o modificar sin efectos colaterales.

### SA-02: Duplicación de módulos de descarga (Downloads/ vs Downloads_v2/)

- **Ficheros**: `Downloads/DownloadsModule.swift` (344 líneas) + `Downloads_v2/DownloadsModule2.swift` (2929 líneas)
- **Problema**: Dos módulos de descarga coexisten con APIs parcialmente solapadas. `DownloadsModule2` incluye métodos legacy que delegan a los nuevos, pero ambos módulos están registrados en React Native.
- **Impacto**: Confusión sobre cuál usar, riesgo de estado inconsistente si ambos se usan simultáneamente, mantenimiento duplicado.

### SA-03: Singleton compartido ContentKeyManager usado por ambos módulos

- **Fichero**: `Managers/ContentKeyManager.swift`, líneas 1-772
- **Problema**: `ContentKeyManager.sharedManager` es un singleton mutable con estado (`asset`, `licensingServiceUrl`, `fpsCertificateUrl`, `downloadRequestedByUser`). Tanto `DownloadsModule` como `DownloadsModule2` escriben en estas propiedades. Si ambos módulos se usan, el último en escribir gana.
- **Impacto**: Condición de carrera potencial en configuración DRM.

### SA-04: Métodos stub sin implementar en DownloadsModule2

- **Fichero**: `Downloads_v2/DownloadsModule2.swift`
- **Funciones afectadas**:
  - `renewLicense()` (línea 961) → `resolve(nil)` sin lógica
  - `releaseAllLicenses()` (línea 971) → `resolve(nil)` sin lógica
  - `addSubtitles()` (línea 977) → `resolve(nil)` sin lógica
  - `removeSubtitles()` (línea 982) → `resolve(nil)` sin lógica
  - `getSubtitles()` (línea 987) → `resolve([])` sin lógica
  - `recoverDownloads()` (línea 1043) → devuelve array vacío
  - `repairDownload()` (línea 1089) → `resolve(nil)` sin lógica
  - `setupNetworkMonitoring()` (línea 1276) → vacío
  - `cleanupTemporaryFiles()` (línea 1886) → devuelve `(0, 0)`
  - `validateAllDownloads()` (línea 1891) → devuelve `[]`
  - `releaseLicenseForDownload()` (línea 1865) → vacío
  - `downloadLicenseForContent()` (línea 1869) → vacío
  - `checkLicenseValidity()` (línea 1873) → siempre `true`
  - `getManifestInfo()` (línea 1110) → devuelve datos hardcodeados falsos
  - `estimateDownloadTime()` (línea 1121) → devuelve ceros
- **Impacto**: El bridge Obj-C expone estos métodos a React Native. El código JS puede llamarlos esperando funcionalidad real y recibir respuestas vacías/falsas sin error.

### SA-05: Funciones de más de 50 líneas

| Fichero | Función | Líneas aprox. |
|---|---|---|
| `DownloadsModule2.swift` | `urlSession(_:task:didCompleteWithError:)` | ~130 |
| `DownloadsModule2.swift` | `urlSession(_:aggregateAssetDownloadTask:didLoad:...)` | ~90 |
| `DownloadsModule2.swift` | `removeDownloadedFiles()` | ~110 |
| `DownloadsModule2.swift` | `doPurgeOrphanedAssets()` | ~140 |
| `DownloadsModule2.swift` | `calculateTotalDownloadsSize()` | ~100 |
| `DownloadsModule2.swift` | `initializeDownloadSession()` | ~60 |
| `DownloadsModule2.swift` | `createDownloadTask()` | ~80 |
| `DownloadsModule2.swift` | `addDownload()` | ~80 (estimado) |
| `DownloadsModule2.swift` | `finalizeDownload()` | ~75 |
| `ContentKeyManager.swift` | `handlePersistableContentKeyRequest()` | ~80 |
| `ContentKeyManager.swift` | `handleOnlineContentKeyRequest()` | ~70 |
| `AssetDownloader.swift` | `urlSession(didCompleteWithError:)` | ~60 |
| `RCTVideoUtils.swift` | Varias funciones de utilidad | ~60 cada una |

### SA-06: Manejo de path `/.nofollow` disperso y duplicado

- **Fichero**: `Downloads_v2/DownloadsModule2.swift`
- **Ubicaciones**: `removeDownloadedFiles()`, `calculateAssetSize()`, `calculateTotalDownloadsSize()`, `validateAssetIntegrity()`, `validateAssetIntegrityRelaxed()`
- **Problema**: La lógica de limpiar el prefijo `/.nofollow` de paths se repite en ~10 lugares con código casi idéntico:
  ```swift
  if path.hasPrefix("/.nofollow") {
      let cleanPath = String(path.dropFirst("/.nofollow".count))
  }
  ```
- **Impacto**: Código duplicado, riesgo de inconsistencia si se modifica en un lugar pero no en otros.

### SA-07: Persistencia triple redundante para localización de assets

- **Fichero**: `Downloads_v2/DownloadsModule2.swift`
- **Problema**: Tres mecanismos de persistencia para la misma información (ubicación de un asset descargado):
  1. `activeDownloads[id].assetPath` (en memoria, persistido en `ACTIVE_DOWNLOADS_KEY`)
  2. `saveAssetPath()` / `loadAssetPaths()` (UserDefaults separado `ASSET_PATHS_KEY`)
  3. `saveAssetBookmark()` / `resolveAssetBookmark()` (UserDefaults separado `ASSET_BOOKMARKS_KEY`)
- **Impacto**: `removeDownloadedFiles()` intenta los tres mecanismos en cascada (líneas 1597-1661). `calculateTotalDownloadsSize()` también consulta múltiples fuentes. Complejidad innecesaria y riesgo de inconsistencia entre las tres fuentes.

### SA-08: Casteos forzados y tipado débil

| Fichero | Ubicación | Problema |
|---|---|---|
| `YouboraParams.swift` | Línea 83 | `(json["contentIsLive"] as? Bool)!` — force unwrap de optional, crash si falta el campo |
| `RCTVideoManager.swift` | Línea 7 | `RCTBridge.current().eventDispatcher() as! RCTEventDispatcher` — force cast |
| `RCTVideoCachingHandler.swift` | Líneas 44, 54, 65 | `options as! [String: Any]` — force cast de NSDictionary |
| `DownloadsModule2.swift` | Múltiples | `NSDictionary` como tipo de entrada en todos los métodos bridge — sin validación de tipos |

### SA-09: URLSession síncrono bloqueando hilo

- **Fichero**: `Extensions + Utils/Utils.swift`, líneas 20-40
- **Función**: `URLSession.synchronousDataTask()` usa `DispatchSemaphore` para bloquear
- **Usado por**: `ContentKeyManager.requestContentKeyFromKeySecurityModule()` (línea 735)
- **Problema**: Bloquea el hilo actual durante la solicitud de red. Si se ejecuta en el hilo principal, congela la UI. Si se ejecuta en la queue de ContentKeySession, bloquea otras operaciones de clave.
- **Impacto**: Potencial congelamiento de UI o deadlock.

### SA-10: LogManager con referencia a UITextView

- **Fichero**: `Extensions + Utils/LogManager.swift`
- **Problema**: Un singleton de logging mantiene una referencia fuerte a un `UITextView` (`textView` propiedad). Esto acopla el sistema de logging a UIKit y puede causar retención de memoria si el view se destruye sin limpiar la referencia.
- **Impacto**: Memory leak potencial, acoplamiento innecesario a UIKit.

### SA-11: AssetDownloader (v1) es singleton pero DownloadsModule2 no lo usa

- **Fichero**: `Managers/AssetDownloader.swift`
- **Problema**: `AssetDownloader.sharedDownloader` es un singleton que crea su propia `AVAssetDownloadURLSession`. `DownloadsModule2` crea otra sesión independiente. Si ambos módulos están activos, hay dos sesiones de descarga en background compitiendo por recursos.
- **Impacto**: Consumo innecesario de recursos, posible confusión en la recuperación de tareas tras restart.

### SA-12: Timer sin invalidación garantizada en deinit

- **Fichero**: `Downloads_v2/DownloadsModule2.swift`, líneas 1280-1332
- **Problema**: `progressTimer` se crea en `startProgressTimerIfNeeded()` y se invalida en `stopProgressTimerIfNotNeeded()` o `invalidateProgressTimer()`, pero no hay `deinit` en `DownloadsModule2` que garantice la invalidación del timer si el módulo se destruye.
- **Impacto**: Timer huérfano que sigue ejecutándose y accediendo a `self` (aunque usa `[weak self]`, el timer mismo no se invalida).

### SA-13: Valores hardcodeados que deberían ser configurables

| Fichero | Ubicación | Valor | Descripción |
|---|---|---|---|
| `DownloadsModule2.swift` | Línea 2146 | `0.98` | Umbral de progreso para considerar descarga exitosa con error |
| `DownloadsModule2.swift` | Líneas 1384-1396 | `500_000`, `1_500_000`, `3_000_000` | Bitrates para calidades low/medium/high |
| `DownloadsModule2.swift` | Línea 2363 | `1_000_000` | Tamaño mínimo de asset válido (1MB) |
| `DownloadsModule2.swift` | Línea 2024 | `500_000_000` | Estimación por defecto de tamaño total (500MB) |
| `ContentKeyManager.swift` | Línea 732 | `""` | Header `X-AxDRM-Message` siempre vacío |
| `NowPlayingInfoCenterManager.swift` | Línea 7 | `10` | Intervalo de seek en segundos |
| `RCTVideoCache.m` | Líneas 28-30 | `60*60*24*30`, `100*1024*1024` | TTL de caché (30 días) y límite de tamaño (100MB) |

### SA-14: Catch vacíos o silenciados

| Fichero | Ubicación | Problema |
|---|---|---|
| `DownloadsModule2.swift` | Línea 1681 | `catch { // Partial cleanup is acceptable }` — error de FileManager silenciado |
| `DownloadsModule2.swift` | Línea 1700 | Mismo patrón en subdirectories cleanup |
| `DownloadsModule2.swift` | Línea 2471-2473 | `catch { // Skip files that can't be read }` en cálculo de tamaño |
| `DownloadsModule2.swift` | Línea 2778-2780 | `catch { // Failed to create bookmark }` — fallo de bookmark silenciado |
| `DownloadsModule2.swift` | Línea 2484 | `catch { // Error calculating size }` |
| `NowPlayingInfoCenterManager.swift` | Líneas 28-29 | `try?` en `setCategory` y `setActive` — errores de audio session ignorados |

### SA-15: Duplicación de URLSession+data entre Utils.swift y Features/

- **Ficheros**: `Extensions + Utils/Utils.swift` (líneas 20-40) y `Video/Features/URLSession+data.swift`
- **Problema**: Ambos ficheros extienden `URLSession` con funcionalidad de data task síncrono. Duplicación de concepto.

### SA-16: Modificación Axinom hardcodeada en RCTVideoDRM.swift

- **Fichero**: `Video/Features/RCTVideoDRM.swift`, líneas 23-36
- **Problema**: El decode base64 de la respuesta de licencia está comentado con un comentario `DANI: Axinom Response`. La respuesta se usa directamente sin decodificar. Esto es una modificación específica para un proveedor DRM concreto que debería ser configurable.
- **Impacto**: Si se cambia de proveedor DRM, este código fallará silenciosamente.

### SA-17: Header X-AxDRM-Message vacío en ContentKeyManager

- **Fichero**: `Managers/ContentKeyManager.swift`, línea 732
- **Código**: `ksmRequest.setValue("", forHTTPHeaderField: "X-AxDRM-Message")`
- **Problema**: El header de autenticación DRM siempre se envía vacío. El `licensingServiceUrl` se configura externamente pero el token de licencia no se propaga al header.
- **Impacto**: Las solicitudes de CKC al KSM pueden fallar o devolver licencias no autorizadas.

---

## Pendiente de confirmar

1. **¿Se usan ambos módulos de descarga (v1 y v2) simultáneamente?** Si solo se usa v2, el directorio `Downloads/` y `Managers/AssetDownloader.swift` podrían ser código muerto.
2. **¿El `LogManager` con `UITextView` se usa en producción?** Parece una herramienta de debug que no debería estar en el bundle de release.
3. **¿La modificación Axinom en `RCTVideoDRM.swift` es permanente?** Si es específica de un proveedor, debería parametrizarse.
4. **¿El header `X-AxDRM-Message` vacío en `ContentKeyManager` es intencional?** Parece un placeholder no completado.
