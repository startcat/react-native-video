# Fase 1: Análisis Estructural — Android Native Module

## Alcance del análisis

Directorio analizado: `android/src/main/java/com/brentvatne/`

### Ficheros analizados

| Paquete | Fichero | Líneas | Descripción |
|---------|---------|--------|-------------|
| `exoplayer` | `ReactExoplayerView.java` | 2885 | Vista principal ExoPlayer: reproducción, DRM, offline, ads, Youbora, controles |
| `exoplayer` | `ReactExoplayerViewManager.java` | 572 | View Manager RN: bridge de props JS → nativo |
| `exoplayer` | `ExoPlayerView.java` | 348 | Vista de renderizado de vídeo (SurfaceView/TextureView, subtítulos, aspect ratio) |
| `exoplayer` | `FullScreenPlayerView.java` | 137 | Diálogo fullscreen con transición de vistas |
| `exoplayer` | `ReactExoplayerConfig.java` | 17 | Interfaz de configuración del player |
| `exoplayer` | `DefaultReactExoplayerConfig.java` | ~30 | Implementación por defecto de ReactExoplayerConfig |
| `exoplayer` | `ReactExoplayerLoadErrorHandlingPolicy.java` | 37 | Política de reintentos ante errores de carga |
| `exoplayer` | `ReactExoplayerSimpleCache.kt` | 33 | Singleton de caché SimpleCache para ExoPlayer |
| `exoplayer` | `VideoPlaybackCallback.kt` | 44 | Callback de MediaSession (seek forward/back) |
| `exoplayer` | `VideoPlaybackService.kt` | 389 | Servicio de reproducción en background con MediaSession |
| `exoplayer` | `ConfigurationUtils.kt` | ~80 | Utilidades de configuración (metadata, live config) |
| `exoplayer` | `DataSourceUtil.java` | ~60 | Factoría de DataSource con headers personalizados |
| `exoplayer` | `AudioOutput.java` | ~30 | Enum de salida de audio (speaker/earpiece) |
| `exoplayer` | `AspectRatioFrameLayout.java` | ~100 | Layout con aspect ratio personalizado |
| `license` | `OfflineLicenseManager.java` | 471 | Gestor de licencias offline: descarga, check, release, restore |
| `license` | `LicenseManagerErrorCode.java` | 114 | Enum de códigos de error DRM |
| `license/interfaces` | `IOfflineLicenseManagerListener.java` | 95 | Interfaz de callbacks de licencias |
| `license/internal/task` | `LicenceDownloadTask.java` | 360 | AsyncTask para descarga de licencias DRM |
| `license/internal/task` | `LicenseCheckTask.java` | ~120 | AsyncTask para verificación de licencias |
| `license/internal/task` | `LicenseReleaseTask.java` | ~100 | AsyncTask para liberación de licencias |
| `license/internal/task` | `LicenseRestoreTask.java` | ~100 | AsyncTask para restauración de licencias |
| `license/internal/utils` | `DrmUtils.java` | 163 | Utilidades DRM: parsing, scheme data, duración |
| `license/internal/utils` | `LicenseFileUtils.java` | 200 | Utilidades de ficheros de licencia (lectura/escritura) |
| `license/internal/utils` | `LicenseManagerUtils.java` | ~50 | Utilidades auxiliares del license manager |
| `license/internal/utils` | `ManifestUtils.java` | ~80 | Parsing de manifiestos MPD/HLS |
| `license/internal/utils` | `RequestUtils.java` | ~60 | Utilidades HTTP para peticiones de licencia |
| `license/internal/utils` | `PsshAtomUtils.java` | ~80 | Parsing de átomos PSSH |
| `license/internal/utils` | `ParsableBitArray.java` | ~60 | Array de bits parseable |
| `license/internal/utils` | `ParsableByteArray.java` | ~80 | Array de bytes parseable |
| `license/internal/model` | `DrmMessage.java` | 163 | Modelo de mensaje DRM |
| `license/internal/model` | `Manifest.java` | ~30 | Modelo de manifiesto |
| `license/internal/model` | `SchemeData.java` | ~40 | Modelo de datos de esquema DRM |
| `license/internal/model` | `Atom.java` | ~20 | Modelo de átomo PSSH |
| `license/internal/exception` | `LicenseManagerException.java` | ~30 | Excepción personalizada del license manager |
| `offline` | `AxOfflineManager.java` | 304 | Singleton: inicialización de DownloadManager y caché |
| `offline` | `AxDownloadTracker.java` | 427 | Tracker de descargas: estado, requests, listeners |
| `offline` | `AxDownloadService.java` | 338 | Servicio de descarga en background con notificaciones |
| `react` | `ReactVideoPackage.java` | 53 | Registro del paquete RN (modules + view managers) |
| `react` | `VideoManagerModule.kt` | 76 | Módulo RN: seek, pause, volume, getCurrentPosition |
| `react` | `VideoDecoderPropertiesModule.java` | 127 | Módulo RN: info de Widevine level y codecs |
| `react` | `DownloadsModule.java` | 1149 | Módulo RN v1: gestión de descargas offline |
| `react` | `DownloadsModule2.java` | 2446 | Módulo RN v2: gestión avanzada de descargas offline |
| `receiver` | `AudioBecomingNoisyReceiver.java` | 42 | BroadcastReceiver para audio becoming noisy |
| `receiver` | `BecomingNoisyListener.java` | 14 | Interfaz listener para audio noisy |
| `util` | `Utility.java` | 54 | Utilidades: DRM scheme, playback properties, timestamp |

**Total: ~44 ficheros, ~11.000+ líneas de código Java/Kotlin**

---

## 1.1 Inventario de responsabilidades

### ReactExoplayerView.java (2885 líneas)

Este es el fichero más complejo del proyecto. Concentra la mayor parte de la lógica del reproductor.

#### Gestión de estado
- **Líneas ~100-200**: Declaración de ~60 campos mutables (player state, DRM config, UI refs, playback flags, buffering config, Youbora refs, offline state)
- **Variables clave**: `player`, `isPaused`, `isBuffering`, `isFullscreen`, `playOffline`, `multiSession`, `hasDrmFailed`, `resumeWindow`, `resumePosition`, `source`, `drmUUID`, `drmLicenseUrl`, `mDrmSessionManager`, `mOfflineLicenseManager`, `mDownloadRequest`, `npawPlugin`, `videoAdapter`, `currentYouboraOptions`
- **Dependencias internas**: Prácticamente todas las responsabilidades leen/escriben estos campos
- **Dependencias externas**: ExoPlayer API, React Native bridge types

#### Lógica de negocio
- **`RNVLoadControl` (líneas ~350-500)**: Clase interna que extiende `DefaultLoadControl` con estrategia de buffering personalizada basada en memoria disponible. ~150 líneas.
  - Funciones: `shouldContinueLoading()`, `calculateFreeHeapInPercent()`
  - Dependencias: `bufferingStrategy`, `bufferConfig`
- **`buildMediaSource()` (líneas ~1350-1494)**: Construcción de MediaSource según tipo de contenido (DASH, HLS, SS, RTSP, progressive). ~145 líneas.
  - Dependencias: `playOffline`, `mDownloadRequest`, `mMediaDataSourceFactory`, `adTagUrl`, `source`, `drmSessionManager`
- **`buildDrmSessionManager()` (líneas ~1274-1312)**: Construcción del DRM session manager con retry (3 intentos). ~40 líneas.
  - Dependencias: `hasDrmFailed`, `multiSession`, `drmUUID`
- **`setSelectedTrack()` (líneas ~2274-2433)**: Selección de tracks por tipo (language, title, index, resolution). ~160 líneas.
  - Dependencias: `trackSelector`, `player`, `isUsingContentResolution`
- **`getVideoTrackInfoFromManifest()` (líneas ~1921-1987)**: Obtención de tracks de vídeo desde manifiesto DASH en thread separado. ~67 líneas.
  - Dependencias: `mediaDataSourceFactory`, `source`, `contentStartTime`
- **`isFormatSupported()` (líneas ~2435-2452)**: Verificación de soporte de formato por codec. ~18 líneas.

#### Efectos secundarios
- **`initializePlayer()` (líneas ~200-350)**: Inicialización completa del player con verificación de descarga offline (AxDownloadTracker). ~150 líneas.
  - Dependencias: `AxOfflineManager`, `AxDownloadTracker`, `ImaAdsLoader`, `DefaultTrackSelector`, `DefaultRenderersFactory`
- **`initializePlayerCore()` (líneas ~350-500)**: Creación de ExoPlayer, configuración de listeners, setup de audio focus. ~150 líneas.
  - Dependencias: `audioManager`, `bandwidthMeter`, `config`
- **`initializePlayerDrm()` (líneas ~998-1046)**: Inicialización DRM con path offline vs online. ~50 líneas.
  - Dependencias: `playOffline`, `mOfflineLicenseManager`, `drmUUID`, `drmLicenseUrl`
- **`initializePlayerSource()` (líneas ~1048-1177)**: Preparación de media source, integración Youbora, player.prepare(). ~130 líneas.
  - Dependencias: `player`, `source`, `adTagUrl`, `adsLoader`, `npawPlugin`
- **`setupPlaybackService()` (líneas ~1186-1255)**: Conexión con VideoPlaybackService para notificaciones. ~70 líneas.
  - Dependencias: `playbackServiceConnection`, `playbackServiceBinder`, `themedReactContext`
- **`releasePlayer()` (líneas ~1524-1558)**: Liberación de recursos del player. ~35 líneas.
  - Dependencias: `adsLoader`, `playbackServiceBinder`, `progressHandler`, `bandwidthMeter`

#### Orquestación
- **`onEvents()` (líneas ~1738-1788)**: Handler de eventos del player (state changes). ~50 líneas.
  - Coordina: buffering, progress, videoLoaded, controls visibility
- **`videoLoaded()` (líneas ~1804-1848)**: Emisión de evento load con tracks info. ~45 líneas.
  - Coordina: track selection, event emission, manifest parsing
- **`onPlayerError()` (líneas ~2089-2119)**: Manejo de errores con retry DRM y behind-live-window. ~30 líneas.
  - Coordina: DRM retry, resume position, player reinit
- **`setSrc()` (líneas ~2174-2206)**: Setter de source con detección de cambio y reinicialización. ~30 líneas.

#### Presentación
- **`setFullscreen()` (líneas ~2630-2668)**: Gestión de fullscreen con system bars. ~40 líneas.
- **`setControls()` (líneas ~2746-2757)**: Gestión de visibilidad de controles. ~12 líneas.
- **`updateFullScreenButtonVisbility()` (líneas ~2610-2624)**: Visibilidad del botón fullscreen. ~15 líneas.

#### Manejo de errores
- **DRM error retry** (líneas ~2093-2106): Retry con fallback L1→L3 en primer fallo DRM.
- **`isBehindLiveWindow()`** (línea ~2121): Detección de error behind-live-window.
- **DRM session error** (líneas ~2726-2729): Emisión de error DRM al JS.

#### Configuración
- **Constantes** (líneas ~90-100): `SHOW_PROGRESS`, `DEFAULT_MAX_HEAP_ALLOCATION_PERCENT`
- **Youbora** (líneas ~2813-2869): `setYoubora()`, `clearYoubora()`, `stopYouboraAdapter()`
- **Setters de props** (líneas ~2220-2600): ~20 setters para props de React Native

---

### DownloadsModule.java (1149 líneas)

#### Gestión de estado
- **Líneas ~62-88**: `mLicenseManager`, `mAxDownloadTracker`, `mDownloadHelper`, `currentMediaItem`, `pendingResumeAll`, `pendingResumePromise`
- **Dependencias externas**: `AxOfflineManager`, `OfflineLicenseManager`, `AxDownloadTracker`

#### Lógica de negocio
- **`createMediaItem()` (líneas ~224-260)**: Construcción de MediaItem con DRM config. ~36 líneas.
- **`getTracks()` (líneas ~776-829)**: Selección de tracks para descarga (max bitrate video + all audio/text). ~53 líneas.
- **`getDownloadStateAsString()` (líneas ~1120-1147)**: Mapeo de estado de descarga a string. ~28 líneas.

#### Efectos secundarios
- **`moduleInit()` (líneas ~268-330)**: Inicialización completa: license manager, offline manager, download service. ~62 líneas.
- **`addItem()` (líneas ~473-543)**: Añadir descarga con recovery ante dead thread handler. ~70 líneas.
- **`removeItem()` (líneas ~587-658)**: Eliminar descarga buscando en download index. ~71 líneas.
- **`resumeAll()` (líneas ~356-430)**: Resume con detección de foreground y defer. ~74 líneas.
- **`recoverDownloadSystem()` (líneas ~547-584)**: Recovery del sistema de descargas. ~37 líneas.

#### Orquestación
- **Lifecycle** (líneas ~992-1117): `onHostResume()` con pending resume, `onHostPause()`, `onHostDestroy()` con cleanup completo.
- **BroadcastReceiver** (líneas ~101-121): Recepción de progreso de descarga y emisión a JS.

#### Manejo de errores
- **Recovery pattern** en `addItem()`: detección de dead thread handler → `recoverDownloadSystem()` → retry.
- **Foreground service validation**: Verificación de permisos en Android 12+.

#### Eventos (bridge JS)
- **Líneas ~838-966**: 11 callbacks de `IOfflineLicenseManagerListener` + `onDownloadsChanged` + `onPrepared` + `onPrepareError`, todos emitiendo eventos a JS vía `RCTDeviceEventEmitter`.

---

### DownloadsModule2.java (2446 líneas)

#### Gestión de estado
- **Líneas ~78-146**: Estado extenso: `activeHelpers`, `helperCreationTimes`, `moduleConfig`, directorios configurables, `downloadStartTimes`, `lastBytesDownloaded`, `lastSpeedCheckTime`, `activeDownloadQuality`, `activeDrmMessages`, `activeDownloadTitles`, `pendingLicenseDownloads`, `isDownloadingLicense`, caché de tamaño de directorio.
- **Dependencias externas**: Mismas que DownloadsModule + `ConcurrentHashMap` para thread safety.

#### Lógica de negocio
- **`createMediaItemFromConfig()` (líneas ~1086-1110)**: Construcción de MediaItem desde ReadableMap. ~25 líneas.
- **`createDrmConfiguration()` (líneas ~1112-1160)**: Configuración DRM con headers y drmMessage. ~48 líneas.
- **`calculateAccurateTotalBytes()` (líneas ~1309-1383)**: Estimación precisa de bytes totales con heurísticas. ~75 líneas.
- **`calculateDownloadSpeed()` (líneas ~1385-1421)**: Cálculo de velocidad de descarga. ~37 líneas.
- **`estimateRemainingTime()` (líneas ~1423-1443)**: Estimación de tiempo restante. ~21 líneas.
- **`selectQualityTracks()` (líneas ~2081-2141)**: Selección de tracks por calidad (low/medium/high). ~60 líneas.
- **`selectVideoTrackByBitrate()` (líneas ~2250-2308)**: Selección de track de vídeo por bitrate máximo. ~58 líneas.
- **`selectAllAudioTracks()` (líneas ~2193-2245)**: Selección de todos los tracks de audio. ~52 líneas.
- **`isNoSpaceLeftError()` (líneas ~1882-1935)**: Detección recursiva de error de espacio en disco. ~53 líneas.

#### Efectos secundarios
- **`moduleInit()` (líneas ~202-236)**: Inicialización con config opcional. ~34 líneas.
- **`addDownload()` (líneas ~358-485)**: Flujo completo de añadir descarga con 11 pasos documentados. ~127 líneas.
- **`removeDownload()` (líneas ~488-546)**: Eliminación con cleanup de tracking maps. ~58 líneas.
- **`getSystemInfo()` (líneas ~273-351)**: Info de almacenamiento y red en thread separado. ~78 líneas.
- **`enqueueLicenseDownload()` / `processNextLicenseDownload()` (líneas ~1615-1634)**: Cola de descargas de licencia para evitar race conditions. ~20 líneas.

#### Orquestación
- **`onPrepared()` (líneas ~1938-2075)**: Handler de preparación completada: track selection, download request creation, DownloadManager integration. ~137 líneas.
- **`cleanupStaleHelpers()` (líneas ~1564-1608)**: Limpieza periódica de helpers con timeout. ~44 líneas.
- **Lifecycle** (líneas ~1722-1811): `onHostResume()` con pending resume, `onHostDestroy()` con cleanup exhaustivo.

#### Configuración
- **Constantes** (líneas ~80-127): Directorios, timeouts, thresholds, calidades.
- **`setStreamQuality()`**, **`setNetworkPolicy()`**, **`setDownloadLimits()`**, **`setNotificationConfig()`**: Setters de configuración desde JS.

---

### AxOfflineManager.java (304 líneas)

#### Gestión de estado
- **Singleton** con `sAxOfflineManager`, `mDownloadManager`, `mDownloadTracker`, `mDownloadCache`, `databaseProvider`, `mDownloadDirectory`.

#### Efectos secundarios
- **`init()` (líneas ~76-124)**: Inicialización con health check y reinicialización automática.
- **`reinitializeDownloadManager()` (líneas ~187-223)**: Reinicialización con cleanup y `Thread.sleep(500)`.
- **`configureDownloadManager()` (líneas ~249-303)**: Configuración con listener para descargas MPD fallidas al >95%.

#### Lógica de negocio
- **`isDownloadManagerHealthy()` (líneas ~226-246)**: Health check del DownloadManager.
- **`buildDataSourceFactory()` / `buildReadOnlyCacheDataSource()`**: Construcción de data source factories.

---

### AxDownloadTracker.java (427 líneas)

#### Gestión de estado
- **`mDownloads`** (`HashMap<Uri, Download>`): Mapa de descargas en memoria.
- **`mListeners`** (`CopyOnWriteArraySet<Listener>`): Listeners thread-safe.
- **`mDownloadHelper`**: Helper actual de descarga.

#### Lógica de negocio
- **`getDownloadRequest()` (líneas ~196-227)**: Obtención de request con lógica de "high-progress MPD failure" (>85% segmentos O >80% bytes). ~31 líneas.
- **`DownloadManagerListener.onDownloadChanged()` (líneas ~272-416)**: Lógica compleja de conversión de descargas MPD fallidas a exitosas. ~145 líneas.

#### Configuración
- **Thresholds** (líneas ~43-50): `HIGH_PROGRESS_THRESHOLD_PERCENT = 85.0`, `HIGH_BYTES_THRESHOLD_PERCENT = 0.80`.

---

### AxDownloadService.java (338 líneas)

#### Efectos secundarios
- **`onCreate()` (líneas ~74-105)**: `startForeground()` inmediato para Android 12+.
- **`getForegroundNotification()` (líneas ~151-219)**: Construcción de notificación con progreso y broadcast.
- **`sendNotification()` (líneas ~238-251)**: Broadcast de progreso con deduplicación.

#### Orquestación
- **`TerminalStateNotificationHelper`** (líneas ~254-336): Listener de estados terminales con logging detallado de errores.

---

### OfflineLicenseManager.java (471 líneas)

#### Gestión de estado
- **Campos**: `mDownloadTask`, `mCheckTask`, `mReleaseTask`, `mRestoreTask`, `mRequestParams`, `mDefaultStoragePath`, `mMinExpireSeconds`, `mListener`.

#### Efectos secundarios
- **`downloadLicense()` / `downloadLicenseWithResult()`**: Descarga de licencia vía AsyncTask.
- **`checkLicenseValid()`**: Verificación de licencia.
- **`releaseLicense()` / `releaseAllLicenses()`**: Liberación de licencias.
- **`restoreLicense()` / `getLicenseKeys()`**: Restauración de licencias.

#### Orquestación
- **`InternalListener`**: Bridge entre callbacks de AsyncTask y `IOfflineLicenseManagerListener`.

---

### VideoPlaybackService.kt (389 líneas)

#### Gestión de estado
- **`registeredPlayers`** (`HashMap<ExoPlayer, MediaSession>`): Mapa de players registrados.
- **`notificationManager`**: Gestor de notificaciones.

#### Efectos secundarios
- **`registerPlayer()` / `unregisterPlayer()`**: Registro/desregistro de players con MediaSession.
- **`onStartCommand()`**: Gestión de foreground service con detección de app en foreground.
- **`updateNotification()`**: Actualización de notificación con botones de seek personalizados.

---

### Ficheros auxiliares (sin necesidad de segmentación)

| Fichero | Justificación |
|---------|---------------|
| `ExoPlayerView.java` (348 lín.) | Responsabilidad única: renderizado de vídeo. Bien encapsulado. |
| `FullScreenPlayerView.java` (137 lín.) | Responsabilidad única: diálogo fullscreen. |
| `ReactExoplayerConfig.java` (17 lín.) | Interfaz simple. |
| `ReactExoplayerLoadErrorHandlingPolicy.java` (37 lín.) | Política de retry simple. |
| `ReactExoplayerSimpleCache.kt` (33 lín.) | Singleton de caché. |
| `VideoPlaybackCallback.kt` (44 lín.) | Callback de MediaSession. |
| `ConfigurationUtils.kt` (~80 lín.) | Utilidades puras. |
| `DataSourceUtil.java` (~60 lín.) | Factoría simple. |
| `AudioOutput.java` (~30 lín.) | Enum. |
| `AspectRatioFrameLayout.java` (~100 lín.) | Layout personalizado. |
| `ReactVideoPackage.java` (53 lín.) | Registro de paquete. |
| `VideoManagerModule.kt` (76 lín.) | Módulo RN simple. |
| `VideoDecoderPropertiesModule.java` (127 lín.) | Módulo RN simple. |
| `AudioBecomingNoisyReceiver.java` (42 lín.) | Receiver simple. |
| `BecomingNoisyListener.java` (14 lín.) | Interfaz simple. |
| `Utility.java` (54 lín.) | Utilidades puras. |
| Todos los ficheros en `license/internal/` | Bien encapsulados con responsabilidad única cada uno. |

---

## 1.2 Mapa de acoplamiento

### Acoplamiento interno en ReactExoplayerView.java

| Responsabilidad A | Responsabilidad B | Tipo | Detalle |
|---|---|---|---|
| Inicialización player | DRM offline | **Fuerte** | `initializePlayer()` lee `playOffline` y crea `mOfflineLicenseManager`, `initializePlayerDrm()` retorna null para defer |
| Inicialización player | Ads (IMA) | **Fuerte** | `initializePlayer()` crea `ImaAdsLoader`, `initializePlayerSource()` crea `AdsMediaSource` |
| Inicialización player | Youbora | **Fuerte** | `initializePlayerSource()` crea `NpawPlugin` y `videoAdapter` directamente |
| Inicialización player | Playback service | **Fuerte** | `initializePlayerCore()` llama `setupPlaybackService()` |
| DRM online | DRM offline | **Fuerte** | Comparten `drmUUID`, `drmLicenseUrl`, `drmLicenseHeader`; path diverge en `initializePlayerDrm()` |
| Player events | Progress handler | **Fuerte** | `onEvents()` inicia/para `progressHandler` |
| Player events | Track selection | **Fuerte** | `onEvents()` llama `videoLoaded()` que llama `setSelectedTrack()` |
| Track selection | Video track info | **Fuerte** | `setSelectedTrack()` usa `trackSelector`, `getVideoTrackInfo()` |
| Audio focus | Playback control | **Fuerte** | `OnAudioFocusChangedListener` llama `pausePlayback()`, modifica `player.setVolume()` |
| Fullscreen | Controls | **Débil** | Comparten `controls` flag, `fullScreenPlayerView` |
| Buffering strategy | Load control | **Fuerte** | `RNVLoadControl` lee `bufferingStrategy` |
| Source config | Media source build | **Fuerte** | `setSrc()` → `initializePlayer()` → `buildMediaSource()` |

### Acoplamiento interno en DownloadsModule2.java

| Responsabilidad A | Responsabilidad B | Tipo | Detalle |
|---|---|---|---|
| addDownload | onPrepared | **Fuerte** | `addDownload()` almacena helper en `activeHelpers`, `onPrepared()` lo busca por referencia |
| addDownload | DRM license queue | **Fuerte** | `addDownload()` llama `enqueueLicenseDownload()` |
| Track selection | onPrepared | **Fuerte** | `onPrepared()` lee `activeDownloadQuality` para seleccionar tracks |
| Speed tracking | Progress broadcast | **Fuerte** | `BroadcastReceiver` llama `calculateDownloadSpeed()` |
| Helper cleanup | addDownload | **Fuerte** | `cleanupStaleHelpers()` elimina de `activeHelpers` |
| State mapping | Event emission | **Débil** | `mapDownloadState()` usado en múltiples eventos |

### Acoplamiento entre ficheros

| Fichero A | Fichero B | Tipo | Detalle |
|---|---|---|---|
| `ReactExoplayerView` | `AxOfflineManager` | **Fuerte** | Accede al singleton para `getDownloadTracker()`, `buildDataSourceFactory()` |
| `ReactExoplayerView` | `OfflineLicenseManager` | **Fuerte** | Crea instancia, implementa `IOfflineLicenseManagerListener` |
| `ReactExoplayerView` | `VideoPlaybackService` | **Fuerte** | Bind/unbind del servicio, registro de player |
| `ReactExoplayerView` | `ExoPlayerView` | **Fuerte** | Crea y configura la vista, accede a métodos de rendering |
| `ReactExoplayerViewManager` | `ReactExoplayerView` | **Fuerte** | Crea instancia, llama ~30 setters |
| `DownloadsModule` | `AxOfflineManager` | **Fuerte** | Init, getDownloadManager, getDownloadTracker |
| `DownloadsModule` | `OfflineLicenseManager` | **Fuerte** | Crea instancia, implementa listener |
| `DownloadsModule` | `AxDownloadTracker` | **Fuerte** | addListener, download, getDownloadHelper, isDownloaded |
| `DownloadsModule` | `AxDownloadService` | **Fuerte** | DownloadService.start/sendPauseDownloads/sendResumeDownloads/sendRemoveDownload |
| `DownloadsModule2` | `AxOfflineManager` | **Fuerte** | Mismo patrón que DownloadsModule |
| `DownloadsModule2` | `OfflineLicenseManager` | **Fuerte** | Mismo patrón que DownloadsModule |
| `DownloadsModule2` | `AxDownloadTracker` | **Fuerte** | Mismo patrón que DownloadsModule |
| `DownloadsModule2` | `AxDownloadService` | **Fuerte** | Mismo patrón que DownloadsModule |
| `DownloadsModule` | `DownloadsModule2` | **Punto de corte** | Ambos registrados en ReactVideoPackage, no se referencian entre sí |
| `AxDownloadTracker` | `AxOfflineManager` | **Fuerte** | Creado por AxOfflineManager, recibe DownloadManager |
| `AxDownloadService` | `AxOfflineManager` | **Fuerte** | `getDownloadManager()` en `getDownloadManager()` override |
| `LicenceDownloadTask` | `DrmUtils` | **Débil** | Usa utilidades puras |
| `LicenceDownloadTask` | `LicenseFileUtils` | **Débil** | Usa utilidades puras para guardar keys |
| `LicenceDownloadTask` | `ManifestUtils` | **Débil** | Usa utilidades puras para parsing |
| `LicenceDownloadTask` | `RequestUtils` | **Débil** | Usa utilidades puras para HTTP |

---

## 1.3 Señales de alerta

### SA-01: ReactExoplayerView — God Object (2885 líneas)

- **Fichero**: `ReactExoplayerView.java`
- **Problema**: Concentra 7+ responsabilidades distintas en una sola clase: reproducción, DRM online, DRM offline, ads, Youbora analytics, controles UI, playback service, audio focus, track selection, progress reporting, fullscreen.
- **Impacto**: Extremadamente difícil de testear, mantener y razonar sobre el código. Cualquier cambio puede tener efectos colaterales inesperados.

### SA-02: Funciones con más de una responsabilidad

| Fichero | Función | Líneas | Responsabilidades mezcladas |
|---|---|---|---|
| `ReactExoplayerView.java` | `initializePlayer()` | ~200-350 (~150 lín.) | Verificación de descarga offline + creación de componentes ExoPlayer + setup de ads + configuración de renderers |
| `ReactExoplayerView.java` | `initializePlayerSource()` | ~1048-1177 (~130 lín.) | Construcción de media source + integración Youbora + preparación del player + setup de controles |
| `ReactExoplayerView.java` | `buildMediaSource()` | ~1350-1494 (~145 lín.) | Decisión offline/online + switch por tipo de contenido + clipping + DRM provider setup |
| `ReactExoplayerView.java` | `setSelectedTrack()` | ~2274-2433 (~160 lín.) | 6 estrategias de selección diferentes (disabled, language, title, index, resolution, default) en un solo método |
| `DownloadsModule2.java` | `addDownload()` | ~358-485 (~127 lín.) | Validación + check existente + creación MediaItem + DRM license + helper preparation |
| `DownloadsModule2.java` | `onPrepared()` | ~1938-2075 (~137 lín.) | Búsqueda de helper + track selection + download request creation + DownloadManager integration + event emission |
| `AxDownloadTracker.java` | `DownloadManagerListener.onDownloadChanged()` | ~272-416 (~145 lín.) | Detección de MPD high-progress + conversión de estado + logging extenso + notificación a listeners |

### SA-03: Estado compartido que dificulta aislamiento

| Fichero | Estado | Problema |
|---|---|---|
| `ReactExoplayerView.java` | `player`, `trackSelector`, `source` | ~15 métodos leen/escriben estos campos sin sincronización |
| `ReactExoplayerView.java` | `playOffline`, `mDrmSessionManager`, `mOfflineLicenseManager` | Path offline entrelazado con path online en múltiples métodos |
| `ReactExoplayerView.java` | `npawPlugin`, `videoAdapter`, `currentYouboraOptions` | Youbora integrado directamente en el flujo de inicialización del player |
| `DownloadsModule.java` | `currentMediaItem` (static) | Variable estática compartida entre llamadas, potencial race condition |
| `DownloadsModule2.java` | `activeHelpers`, `helperCreationTimes`, `activeDownloadQuality`, `activeDrmMessages` | 4 maps paralelos que deben mantenerse sincronizados |

### SA-04: Efectos secundarios ocultos dentro de lógica de negocio

| Fichero | Función | Efecto oculto |
|---|---|---|
| `ReactExoplayerView.java` | `initializePlayerDrm()` (línea ~1012-1027) | Crea `OfflineLicenseManager`, llama `getLicenseKeys()`, retorna `null` para defer — el caller no sabe que se ha iniciado una operación async |
| `ReactExoplayerView.java` | `buildMediaSource()` (línea ~1395-1403) | Llama `buildLocalDataSourceFactory()` que accede al singleton `AxOfflineManager` y al `AxDownloadTracker` |
| `ReactExoplayerView.java` | `setBufferConfig()` (líneas ~2683-2696) | Llama `releasePlayer()` + `initializePlayer()` — un setter que reinicia todo el player |
| `ReactExoplayerView.java` | `setMinLoadRetryCountModifier()` (líneas ~2569-2573) | Llama `releasePlayer()` + `initializePlayer()` — mismo patrón |
| `AxOfflineManager.java` | `configureDownloadManager()` (líneas ~260-296) | Registra listener que silenciosamente convierte descargas fallidas al >95% en exitosas |

### SA-05: Código duplicado entre DownloadsModule y DownloadsModule2

| Funcionalidad | DownloadsModule | DownloadsModule2 |
|---|---|---|
| `moduleInit()` | líneas ~268-330 | líneas ~202-236 |
| `pauseAll()` | líneas ~333-353 | líneas ~602-612 |
| `resumeAll()` | líneas ~356-430 | líneas ~614-637 |
| `isAppInForeground()` | líneas ~124-158 | líneas ~1060-1084 |
| `initOfflineManager()` | líneas ~160-190 | líneas ~997-1018 |
| `onHostResume()` con pending resume | líneas ~992-1054 | líneas ~1722-1753 |
| `onHostDestroy()` con cleanup | líneas ~1072-1117 | líneas ~1761-1811 |
| `getDownloadStateAsString()` / `mapDownloadState()` | líneas ~1120-1147 | líneas ~1169-1179 |
| Todos los callbacks de `IOfflineLicenseManagerListener` | líneas ~838-944 | líneas ~2355-2445 |
| `BroadcastReceiver` para progreso | líneas ~101-121 | líneas ~167-196 |
| `createMediaItem()` / `createMediaItemFromConfig()` | líneas ~224-260 | líneas ~1086-1110 |

**Impacto**: Ambos módulos están registrados simultáneamente en `ReactVideoPackage.java` (línea 34). Cualquier fix debe aplicarse en ambos.

### SA-06: Callbacks anidados y cadenas difíciles de seguir

| Fichero | Patrón | Detalle |
|---|---|---|
| `ReactExoplayerView.java` | Deferred initialization | `initializePlayerDrm()` retorna null → `onOfflineLicenseAcquired()` (no visible en el fichero, viene del listener) → `initializePlayerSource(mDrmSessionManager)`. El flujo es implícito. |
| `DownloadsModule.java` | `addItem()` → `prepare()` → `onPrepared()` | El resultado de `addItem()` se resuelve antes de que la descarga realmente comience. `onPrepared()` es un callback asíncrono que inicia la descarga real. |
| `DownloadsModule2.java` | License queue | `enqueueLicenseDownload()` → `processNextLicenseDownload()` → `downloadLicenseForItem()` → callback `onLicenseDownloaded()` → `onLicenseDownloadComplete()` → `processNextLicenseDownload()`. Cola recursiva. |
| `AxDownloadService.java` | `getForegroundNotification()` | Emite broadcasts dentro de un método que debería solo construir una notificación. |

### SA-07: Listeners/timers sin limpieza garantizada

| Fichero | Recurso | Problema |
|---|---|---|
| `ReactExoplayerView.java` | `progressHandler` | Se limpia en `releasePlayer()` pero si el player nunca se inicializa, el handler podría quedar huérfano |
| `ReactExoplayerView.java` | `mainHandler` / `mainRunnable` | Se limpia en `releasePlayer()` pero la creación está en `initializePlayerCore()` |
| `DownloadsModule.java` | `mBroadcastReceiver` | Se registra en `initOfflineManager()` pero solo se desregistra en `onHostDestroy()`. Si `onHostDestroy()` no se llama (crash), queda registrado |
| `DownloadsModule2.java` | `helperCleanupHandler` | Se limpia en `onHostDestroy()` pero si el módulo se recrea sin destroy previo, podría haber duplicados |
| `AxOfflineManager.java` | `DownloadManager.Listener` en `configureDownloadManager()` | Se añade listener pero nunca se elimina. Si `reinitializeDownloadManager()` se llama, el listener antiguo queda en el manager anterior |

### SA-08: Valores hardcodeados que deberían ser configurables

| Fichero | Valor | Línea(s) | Descripción |
|---|---|---|---|
| `ReactExoplayerView.java` | `DEFAULT_MAX_HEAP_ALLOCATION_PERCENT = 1` | ~95 | Porcentaje de heap para buffering |
| `ReactExoplayerView.java` | `"X-AxDRM-Message"` | ~1332 | Header DRM hardcodeado (Axinom-específico) |
| `ReactExoplayerView.java` | `"securityLevel", "L3"` | ~1293 | Fallback DRM security level |
| `AxDownloadTracker.java` | `HIGH_PROGRESS_THRESHOLD_PERCENT = 85.0` | ~46 | Umbral de progreso para considerar descarga exitosa |
| `AxDownloadTracker.java` | `HIGH_BYTES_THRESHOLD_PERCENT = 0.80` | ~50 | Umbral de bytes para considerar descarga exitosa |
| `AxOfflineManager.java` | `"Downloads/Streams"` | ~96 | Subdirectorio de descargas |
| `AxOfflineManager.java` | `Executors.newFixedThreadPool(6)` | ~176 | Pool de threads fijo |
| `AxDownloadService.java` | `FOREGROUND_NOTIFICATION_ID = 1` | ~37 | ID de notificación |
| `DownloadsModule2.java` | `HELPER_TIMEOUT_MS = 60000` | ~103 | Timeout de helper |
| `DownloadsModule2.java` | Bitrates en `selectQualityTracks()` | ~2087-2098 | `1500000`, `3000000`, `6000000` |
| `DownloadsModule.java` / `DownloadsModule2.java` | Delay `1000` ms en `onHostResume()` | ~1001/1730 | Delay para estabilidad |
| `LicenceDownloadTask.java` | `"DML: No usamos token en Primeran"` | ~257 | Comentario que indica lógica específica del cliente deshabilitada |

### SA-09: Funciones de más de 50 líneas

| Fichero | Función | Líneas aprox. |
|---|---|---|
| `ReactExoplayerView.java` | `initializePlayer()` | ~150 |
| `ReactExoplayerView.java` | `initializePlayerCore()` | ~150 |
| `ReactExoplayerView.java` | `initializePlayerSource()` | ~130 |
| `ReactExoplayerView.java` | `buildMediaSource()` | ~145 |
| `ReactExoplayerView.java` | `setSelectedTrack()` | ~160 |
| `ReactExoplayerView.java` | `getVideoTrackInfoFromManifest()` | ~67 |
| `ReactExoplayerView.java` | `videoLoaded()` | ~45 (borderline) |
| `ReactExoplayerView.java` | `onEvents()` | ~50 |
| `ReactExoplayerView.java` | `setupPlaybackService()` | ~70 |
| `DownloadsModule.java` | `moduleInit()` | ~62 |
| `DownloadsModule.java` | `addItem()` | ~70 |
| `DownloadsModule.java` | `removeItem()` | ~71 |
| `DownloadsModule.java` | `resumeAll()` | ~74 |
| `DownloadsModule.java` | `onHostResume()` | ~62 |
| `DownloadsModule.java` | `getTracks()` | ~53 |
| `DownloadsModule2.java` | `addDownload()` | ~127 |
| `DownloadsModule2.java` | `onPrepared()` | ~137 |
| `DownloadsModule2.java` | `getSystemInfo()` | ~78 |
| `DownloadsModule2.java` | `selectQualityTracks()` | ~60 |
| `DownloadsModule2.java` | `selectVideoTrackByBitrate()` | ~58 |
| `DownloadsModule2.java` | `selectAllAudioTracks()` | ~52 |
| `DownloadsModule2.java` | `calculateAccurateTotalBytes()` | ~75 |
| `DownloadsModule2.java` | `onDownloadsChanged()` | ~60 |
| `DownloadsModule2.java` | `isNoSpaceLeftError()` | ~53 |
| `AxDownloadTracker.java` | `DownloadManagerListener.onDownloadChanged()` | ~145 |
| `AxOfflineManager.java` | `init()` | ~48 (borderline) |
| `AxOfflineManager.java` | `configureDownloadManager()` | ~54 |
| `AxDownloadService.java` | `getForegroundNotification()` | ~68 |
| `AxDownloadService.java` | `TerminalStateNotificationHelper.onDownloadChanged()` | ~60 |
| `VideoPlaybackService.kt` | `registerPlayer()` | ~60 |
| `LicenceDownloadTask.java` | `getKeySetId()` | ~86 |

### SA-10: Uso de AsyncTask (deprecated desde API 30)

- **Ficheros**: `LicenceDownloadTask.java`, `LicenseCheckTask.java`, `LicenseReleaseTask.java`, `LicenseRestoreTask.java`
- **Problema**: `AsyncTask` está deprecated. El propio código lo reconoce con `// TODO: Replace with ExecutorService` (línea 13 de `LicenceDownloadTask.java`).
- **Impacto**: Funcional actualmente pero puede causar problemas en futuras versiones de Android.

### SA-11: Thread.sleep() en código de producción

- **Fichero**: `AxOfflineManager.java`, línea ~214
- **Código**: `Thread.sleep(500)` en `reinitializeDownloadManager()`
- **Problema**: Bloquea el thread actual. Si se ejecuta en el main thread, puede causar ANR.

### SA-12: Variable estática mutable compartida

- **Fichero**: `DownloadsModule.java`, línea ~83
- **Código**: `private static MediaItem currentMediaItem`
- **Problema**: Variable estática mutable accedida desde múltiples callbacks sin sincronización. Potencial race condition si se llaman `setItem()` y `onPrepared()` concurrentemente.

### SA-13: Lógica de "high-progress MPD failure" duplicada

La lógica de considerar descargas MPD fallidas como exitosas cuando superan cierto umbral está implementada en **3 lugares diferentes**:
1. `AxDownloadTracker.getDownloadRequest()` (líneas ~196-227)
2. `AxDownloadTracker.DownloadManagerListener.onDownloadChanged()` (líneas ~272-353)
3. `AxOfflineManager.configureDownloadManager()` (líneas ~260-296)

Cada implementación tiene thresholds ligeramente diferentes y lógica de decisión distinta.

### SA-14: `wait()` sin timeout en initializePlayerSource()

- **Fichero**: `ReactExoplayerView.java`, líneas ~1123-1130
- **Código**:
  ```java
  while (player == null) {
      try {
          wait();
      } catch (InterruptedException ex) {
          Thread.currentThread().interrupt();
      }
  }
  ```
- **Problema**: `wait()` sin timeout puede bloquear indefinidamente si `player` nunca se asigna.

### SA-15: Logging excesivo en producción

Múltiples ficheros contienen logging extenso con `Log.d()`, `Log.i()`, `Log.w()` que no está condicionado a un flag de debug:
- `AxDownloadTracker.java`: ~40 líneas de logging en `onDownloadChanged()`
- `AxDownloadService.java`: ~30 líneas de logging en `TerminalStateNotificationHelper`
- `DownloadsModule2.java`: ~50 líneas de logging en `onPrepared()`
- `ReactExoplayerView.java`: `Log.i("Downloads", ...)` dispersos por el código

---

## Pendiente de confirmar

1. **¿Se usa DownloadsModule (v1) activamente o es legacy?** Ambos están registrados en `ReactVideoPackage.java`. Si v1 es legacy, debería eliminarse para reducir duplicación.

2. **¿Los callbacks de `IOfflineLicenseManagerListener` en `ReactExoplayerView.java` están implementados?** No se ven en el código leído (líneas 600-998 del fichero). Podrían estar en la sección no leída o heredados.

3. **¿El comentario "DML: No usamos token en Primeran"** en `LicenceDownloadTask.java` (línea ~257) indica que la validación de DRM message está deshabilitada intencionalmente para un cliente específico? Esto afecta la seguridad del flujo DRM.

4. **¿Existe un mecanismo de feature flags** para controlar la lógica de "high-progress MPD failure"? Actualmente está hardcodeada con `if (is404Error || true)` (línea ~280 de `AxDownloadTracker.java` y línea ~296), lo que significa que **siempre** se ejecuta independientemente del tipo de error.
