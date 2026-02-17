# Fase 4: Extracción de Requerimientos — Android Native Module

Basado en las conclusiones de las Fases 1, 2 y 3.

---

## 4.1 Requerimientos funcionales

### Área: Reproducción de vídeo

#### REQ-001: Inicialización del reproductor ExoPlayer
- **Descripción**: El sistema inicializa un reproductor ExoPlayer con configuración de renderers, track selector, load control y bandwidth meter cuando se establece una fuente de vídeo.
- **Implementación**: `ReactExoplayerView.java`, funciones `initializePlayer()` (líneas ~200-350), `initializePlayerCore()` (líneas ~350-500)
- **Criticidad**: crítica
- **Dependencias**: REQ-003, REQ-005, REQ-010
- **Cobertura de test actual**: sin test

#### REQ-002: Construcción de MediaSource según tipo de contenido
- **Descripción**: El sistema construye la fuente de medios apropiada (DASH, HLS, SmoothStreaming, RTSP, Progressive) según la URI y extensión del contenido.
- **Implementación**: `ReactExoplayerView.java`, función `buildMediaSource()` (líneas ~1350-1494)
- **Criticidad**: crítica
- **Dependencias**: REQ-001, REQ-006
- **Cobertura de test actual**: sin test

#### REQ-003: Configuración de buffering personalizada
- **Descripción**: El sistema permite configurar la estrategia de buffering (min/max buffer, back buffer, heap allocation) desde JavaScript, con una implementación personalizada de LoadControl que gestiona la memoria disponible.
- **Implementación**: `ReactExoplayerView.java`, clase interna `RNVLoadControl` (líneas ~350-500), `setBufferConfig()` (líneas ~2683-2696), `setBufferingStrategy()` (líneas ~2598-2608)
- **Criticidad**: alta
- **Dependencias**: REQ-001
- **Cobertura de test actual**: sin test

#### REQ-004: Selección de tracks de audio, vídeo y texto
- **Descripción**: El sistema permite seleccionar tracks por idioma, título, índice o resolución durante la reproducción, con 6 estrategias de selección diferentes.
- **Implementación**: `ReactExoplayerView.java`, función `setSelectedTrack()` (líneas ~2274-2433)
- **Criticidad**: alta
- **Dependencias**: REQ-001
- **Cobertura de test actual**: sin test

#### REQ-005: Gestión de audio focus
- **Descripción**: El sistema gestiona el audio focus de Android, pausando o reduciendo volumen cuando otra app toma el focus, y restaurando cuando lo recupera.
- **Implementación**: `ReactExoplayerView.java`, `OnAudioFocusChangedListener` (líneas ~1560-1600), `AudioBecomingNoisyReceiver.java`
- **Criticidad**: alta
- **Dependencias**: REQ-001
- **Cobertura de test actual**: sin test

#### REQ-006: Reproducción offline desde caché local
- **Descripción**: El sistema reproduce contenido previamente descargado usando el DownloadRequest almacenado en AxDownloadTracker, construyendo un MediaSource local.
- **Implementación**: `ReactExoplayerView.java`, `buildMediaSource()` path offline (líneas ~1395-1403), `AxOfflineManager.buildReadOnlyCacheDataSource()`
- **Criticidad**: crítica
- **Dependencias**: REQ-001, REQ-002, REQ-020
- **Cobertura de test actual**: sin test

#### REQ-007: Emisión de eventos de reproducción a JavaScript
- **Descripción**: El sistema emite eventos de ciclo de vida del player (loadStart, load, buffer, progress, seek, end, error) a la capa JavaScript vía RCTEventEmitter.
- **Implementación**: `ReactExoplayerView.java`, múltiples puntos de emisión (~30 llamadas a `eventEmitter.receiveEvent()`)
- **Criticidad**: crítica
- **Dependencias**: REQ-001
- **Cobertura de test actual**: sin test

#### REQ-008: Modo fullscreen
- **Descripción**: El sistema permite transicionar entre modo embebido y fullscreen, gestionando system bars y diálogo de pantalla completa.
- **Implementación**: `ReactExoplayerView.java`, `setFullscreen()` (líneas ~2630-2668), `FullScreenPlayerView.java`
- **Criticidad**: media
- **Dependencias**: REQ-001
- **Cobertura de test actual**: sin test

#### REQ-009: Controles de reproducción nativos
- **Descripción**: El sistema muestra/oculta controles nativos de reproducción (play/pause, seek, fullscreen) con personalización de visibilidad.
- **Implementación**: `ReactExoplayerView.java`, `setControls()` (líneas ~2746-2757), `updateFullScreenButtonVisbility()` (líneas ~2610-2624)
- **Criticidad**: media
- **Dependencias**: REQ-001, REQ-008
- **Cobertura de test actual**: sin test

#### REQ-010: Servicio de reproducción en background
- **Descripción**: El sistema mantiene la reproducción activa cuando la app pasa a background, mostrando una notificación con controles de MediaSession.
- **Implementación**: `VideoPlaybackService.kt` (389 líneas), `ReactExoplayerView.setupPlaybackService()` (líneas ~1186-1255)
- **Criticidad**: alta
- **Dependencias**: REQ-001
- **Cobertura de test actual**: sin test

#### REQ-011: Obtención de info de tracks desde manifiesto
- **Descripción**: El sistema obtiene información de tracks de vídeo directamente del manifiesto DASH en un thread separado, para contenido con resoluciones múltiples.
- **Implementación**: `ReactExoplayerView.java`, `getVideoTrackInfoFromManifest()` (líneas ~1921-1987)
- **Criticidad**: media
- **Dependencias**: REQ-004
- **Cobertura de test actual**: sin test

---

### Área: DRM (Digital Rights Management)

#### REQ-012: Reproducción con DRM Widevine online
- **Descripción**: El sistema configura un DrmSessionManager para contenido protegido con Widevine, comunicándose con un servidor de licencias para obtener las claves de descifrado.
- **Implementación**: `ReactExoplayerView.java`, `buildDrmSessionManager()` (líneas ~1274-1312), `initializePlayerDrm()` (líneas ~998-1046)
- **Criticidad**: crítica
- **Dependencias**: REQ-001, REQ-002
- **Cobertura de test actual**: sin test

#### REQ-013: Retry de DRM con fallback L1→L3
- **Descripción**: Ante un primer fallo de DRM, el sistema reintenta con security level L3 (software) como fallback del nivel L1 (hardware).
- **Implementación**: `ReactExoplayerView.java`, `onPlayerError()` (líneas ~2093-2106)
- **Criticidad**: alta
- **Dependencias**: REQ-012
- **Cobertura de test actual**: sin test

#### REQ-014: Reproducción con DRM offline (licencia persistente)
- **Descripción**: El sistema restaura licencias DRM persistentes desde ficheros locales para reproducir contenido offline sin conexión a red.
- **Implementación**: `ReactExoplayerView.java`, `initializePlayerDrm()` path offline (líneas ~1012-1027), `OfflineLicenseManager.getLicenseKeys()`, `LicenseFileUtils`
- **Criticidad**: crítica
- **Dependencias**: REQ-006, REQ-012, REQ-015
- **Cobertura de test actual**: sin test

#### REQ-015: Descarga de licencias DRM offline
- **Descripción**: El sistema descarga y almacena licencias DRM persistentes en disco, asociadas a la URL del manifiesto del contenido.
- **Implementación**: `OfflineLicenseManager.downloadLicense()` / `downloadLicenseWithResult()`, `LicenceDownloadTask.java` (360 líneas), `LicenseFileUtils.writeKeySetId()`
- **Criticidad**: crítica
- **Dependencias**: REQ-012
- **Cobertura de test actual**: sin test

#### REQ-016: Verificación de validez de licencia DRM
- **Descripción**: El sistema verifica si una licencia DRM almacenada sigue siendo válida (no expirada) consultando la duración restante vía MediaDrm.
- **Implementación**: `OfflineLicenseManager.checkLicenseValid()`, `LicenseCheckTask.java`
- **Criticidad**: alta
- **Dependencias**: REQ-015
- **Cobertura de test actual**: sin test

#### REQ-017: Liberación de licencias DRM
- **Descripción**: El sistema libera licencias DRM individuales o todas las licencias, eliminando los ficheros de key set ID del disco.
- **Implementación**: `OfflineLicenseManager.releaseLicense()` / `releaseAllLicenses()`, `LicenseReleaseTask.java`, `LicenseFileUtils.deleteKeySetId()`
- **Criticidad**: alta
- **Dependencias**: REQ-015
- **Cobertura de test actual**: sin test

#### REQ-018: Restauración de licencias DRM
- **Descripción**: El sistema restaura licencias DRM desde key set IDs almacenados, renovando la sesión DRM sin nueva comunicación con el servidor.
- **Implementación**: `OfflineLicenseManager.restoreLicense()`, `LicenseRestoreTask.java`
- **Criticidad**: alta
- **Dependencias**: REQ-015
- **Cobertura de test actual**: sin test

#### REQ-019: Cola serializada de descargas de licencias
- **Descripción**: El sistema encola las descargas de licencias DRM para procesarlas secuencialmente, evitando race conditions cuando se descargan múltiples contenidos.
- **Implementación**: `DownloadsModule2.java`, `enqueueLicenseDownload()` (líneas ~1615-1619), `processNextLicenseDownload()` (líneas ~1621-1629)
- **Criticidad**: alta
- **Dependencias**: REQ-015
- **Cobertura de test actual**: sin test

---

### Área: Descargas offline

#### REQ-020: Inicialización del sistema de descargas
- **Descripción**: El sistema inicializa DownloadManager, SimpleCache, AxDownloadTracker y el servicio de descarga, con health check y reinicialización automática si el manager no está sano.
- **Implementación**: `AxOfflineManager.init()` (líneas ~76-124), `DownloadsModule2.moduleInit()` (líneas ~202-236), `DownloadsModule2.initOfflineManager()` (líneas ~997-1018)
- **Criticidad**: crítica
- **Dependencias**: ninguna
- **Cobertura de test actual**: sin test

#### REQ-021: Añadir descarga de contenido
- **Descripción**: El sistema permite añadir una descarga de contenido con validación, creación de MediaItem, descarga de licencia DRM si aplica, y preparación del DownloadHelper.
- **Implementación**: `DownloadsModule2.addDownload()` (líneas ~358-485)
- **Criticidad**: crítica
- **Dependencias**: REQ-020, REQ-019
- **Cobertura de test actual**: sin test

#### REQ-022: Selección de tracks para descarga por calidad
- **Descripción**: El sistema selecciona tracks de vídeo según calidad (low ≤1.5Mbps, medium ≤3Mbps, high ≤6Mbps, auto) y todos los tracks de audio disponibles para descarga offline.
- **Implementación**: `DownloadsModule2.java`, `selectQualityTracks()` (líneas ~2081-2141), `selectVideoTrackByBitrate()` (líneas ~2250-2308), `selectAllAudioTracks()` (líneas ~2193-2245)
- **Criticidad**: alta
- **Dependencias**: REQ-021
- **Cobertura de test actual**: sin test

#### REQ-023: Eliminación de descarga con cleanup
- **Descripción**: El sistema elimina una descarga incluyendo cleanup de helpers, tracking maps, licencia DRM asociada y ficheros del DownloadManager.
- **Implementación**: `DownloadsModule2.removeDownload()` (líneas ~488-546)
- **Criticidad**: alta
- **Dependencias**: REQ-020, REQ-017
- **Cobertura de test actual**: sin test

#### REQ-024: Pausa y reanudación de descargas
- **Descripción**: El sistema permite pausar y reanudar descargas individuales o todas las descargas, con gestión de foreground service y defer cuando la app está en background.
- **Implementación**: `DownloadsModule2.java`, `pauseDownload()` (líneas ~548-565), `resumeDownload()` (líneas ~567-584), `pauseAll()` (líneas ~602-612), `resumeAll()` (líneas ~614-637)
- **Criticidad**: alta
- **Dependencias**: REQ-020
- **Cobertura de test actual**: sin test

#### REQ-025: Servicio de descarga en background
- **Descripción**: El sistema ejecuta descargas en un servicio foreground con notificación de progreso, compatible con restricciones de Android 12+.
- **Implementación**: `AxDownloadService.java` (338 líneas)
- **Criticidad**: alta
- **Dependencias**: REQ-020
- **Cobertura de test actual**: sin test

#### REQ-026: Broadcast de progreso de descarga
- **Descripción**: El servicio de descarga emite broadcasts con el progreso (porcentaje, bytes descargados, content ID) que el módulo RN recibe y reenvía a JavaScript.
- **Implementación**: `AxDownloadService.getForegroundNotification()` (líneas ~151-219), `DownloadsModule2.mBroadcastReceiver` (líneas ~167-196)
- **Criticidad**: alta
- **Dependencias**: REQ-025
- **Cobertura de test actual**: sin test

#### REQ-027: Consulta de estado de descargas
- **Descripción**: El sistema permite consultar la lista de descargas, el estado individual, existencia y estadísticas globales (activas, completadas, fallidas, velocidad media).
- **Implementación**: `DownloadsModule2.java`, `getDownloads()` (líneas ~669-713), `getDownload()` (líneas ~715-738), `hasDownload()` (líneas ~740-765), `getStats()` (líneas ~767-816)
- **Criticidad**: alta
- **Dependencias**: REQ-020
- **Cobertura de test actual**: sin test

#### REQ-028: Cálculo preciso de tamaño total de descarga
- **Descripción**: El sistema estima el tamaño real de la descarga basándose en el progreso actual cuando el contentLength reportado por ExoPlayer no refleja la calidad seleccionada.
- **Implementación**: `DownloadsModule2.java`, `calculateAccurateTotalBytes()` (líneas ~1309-1383)
- **Criticidad**: alta
- **Dependencias**: REQ-027
- **Cobertura de test actual**: sin test

#### REQ-029: Recovery de descargas MPD fallidas con alto progreso
- **Descripción**: El sistema trata descargas DASH (MPD) fallidas como exitosas cuando han alcanzado >85% de segmentos o >80% de bytes, permitiendo reproducción offline de contenido casi-completo.
- **Implementación**: `AxDownloadTracker.java`, `getDownloadRequest()` (líneas ~196-227), `onDownloadChanged()` (líneas ~272-416); `AxOfflineManager.configureDownloadManager()` (líneas ~260-296)
- **Criticidad**: alta
- **Dependencias**: REQ-020, REQ-006
- **Cobertura de test actual**: sin test

#### REQ-030: Limpieza periódica de DownloadHelpers
- **Descripción**: El sistema limpia DownloadHelpers que llevan más de 60 segundos sin completar preparación, emitiendo error a JavaScript y liberando recursos.
- **Implementación**: `DownloadsModule2.java`, `initializeHelperCleanup()` (líneas ~1545-1558), `cleanupStaleHelpers()` (líneas ~1564-1608)
- **Criticidad**: media
- **Dependencias**: REQ-021
- **Cobertura de test actual**: sin test

#### REQ-031: Información del sistema (almacenamiento y red)
- **Descripción**: El sistema proporciona información de almacenamiento (total, disponible, usado por descargas) y conectividad (WiFi, cellular) al JavaScript.
- **Implementación**: `DownloadsModule2.getSystemInfo()` (líneas ~273-351)
- **Criticidad**: media
- **Dependencias**: REQ-020
- **Cobertura de test actual**: sin test

#### REQ-032: Detección de error de espacio en disco
- **Descripción**: El sistema detecta errores de "no space left on device" en descargas fallidas, incluyendo búsqueda recursiva en causas encadenadas y detección de ErrnoException con ENOSPC.
- **Implementación**: `DownloadsModule2.java`, `isNoSpaceLeftError()` (líneas ~1882-1935)
- **Criticidad**: alta
- **Dependencias**: REQ-025
- **Cobertura de test actual**: sin test

---

### Área: Ads (publicidad)

#### REQ-033: Reproducción de anuncios IMA
- **Descripción**: El sistema integra IMA SDK para reproducir anuncios (pre-roll, mid-roll, post-roll) configurados vía ad tag URL VAST.
- **Implementación**: `ReactExoplayerView.java`, creación de `ImaAdsLoader` en `initializePlayer()`, wrapping en `initializePlayerSource()`, listeners `AdEvent.AdEventListener` y `AdErrorEvent.AdErrorListener` (líneas ~2770-2810)
- **Criticidad**: alta
- **Dependencias**: REQ-001, REQ-002
- **Cobertura de test actual**: sin test

---

### Área: Analytics

#### REQ-034: Integración Youbora/NPAW
- **Descripción**: El sistema integra Youbora analytics para reportar métricas de reproducción al dashboard de NPAW, con soporte para configuración dinámica desde JavaScript.
- **Implementación**: `ReactExoplayerView.java`, `setYoubora()` (líneas ~2813-2845), `clearYoubora()` (líneas ~2860-2869), integración en `initializePlayerSource()`
- **Criticidad**: media
- **Dependencias**: REQ-001
- **Cobertura de test actual**: sin test

---

### Área: Información del dispositivo

#### REQ-035: Consulta de propiedades del decodificador
- **Descripción**: El sistema expone métodos para consultar el nivel de seguridad Widevine y el soporte de codecs (HEVC, etc.) del dispositivo.
- **Implementación**: `VideoDecoderPropertiesModule.java` (127 líneas)
- **Criticidad**: media
- **Dependencias**: ninguna
- **Cobertura de test actual**: sin test

---

### Área: Control imperativo del player

#### REQ-036: Control imperativo desde JavaScript
- **Descripción**: El sistema permite controlar el player imperativamente desde JavaScript: pause, seek, setVolume, getCurrentPosition.
- **Implementación**: `VideoManagerModule.kt` (76 líneas)
- **Criticidad**: alta
- **Dependencias**: REQ-001
- **Cobertura de test actual**: sin test

---

## 4.2 Casos no contemplados

#### NC-001: Race condition en variable estática currentMediaItem
- **Escenario**: Dos llamadas concurrentes a `setItem()` en `DownloadsModule.java` sobrescriben `currentMediaItem` (estática) antes de que `onPrepared()` lo consuma.
- **Código afectado**: `DownloadsModule.java`, campo `private static MediaItem currentMediaItem` (línea ~83), `setItem()` y `onPrepared()`
- **Impacto**: La descarga se inicia con el MediaItem incorrecto. Datos corruptos silenciosamente.
- **Recomendación**: implementar (usar map por ID como en DownloadsModule2)
- **Prioridad**: alta
- **Requerimiento relacionado**: REQ-021

#### NC-002: wait() sin timeout en initializePlayerSource
- **Escenario**: Si `player` nunca se asigna (error en inicialización), el thread queda bloqueado indefinidamente.
- **Código afectado**: `ReactExoplayerView.java`, `initializePlayerSource()` (líneas ~1123-1130), `while (player == null) { wait(); }`
- **Impacto**: ANR (Application Not Responding) y potencial crash del proceso.
- **Recomendación**: implementar (añadir timeout de 5-10 segundos con `wait(timeout)`)
- **Prioridad**: crítica
- **Requerimiento relacionado**: REQ-001

#### NC-003: Thread.sleep() en reinitializeDownloadManager
- **Escenario**: `reinitializeDownloadManager()` se ejecuta en el main thread, bloqueándolo 500ms.
- **Código afectado**: `AxOfflineManager.java`, `reinitializeDownloadManager()` (línea ~214), `Thread.sleep(500)`
- **Impacto**: ANR si se ejecuta en main thread. UX degradada.
- **Recomendación**: implementar (mover a thread separado o usar Handler.postDelayed)
- **Prioridad**: alta
- **Requerimiento relacionado**: REQ-020

#### NC-004: Listener no eliminado en reinicialización de DownloadManager
- **Escenario**: `configureDownloadManager()` añade un listener al DownloadManager. Si `reinitializeDownloadManager()` crea un nuevo DownloadManager, el listener del anterior no se elimina.
- **Código afectado**: `AxOfflineManager.java`, `configureDownloadManager()` (líneas ~260-296), `reinitializeDownloadManager()` (líneas ~187-223)
- **Impacto**: Memory leak. El listener antiguo mantiene referencia al DownloadManager anterior.
- **Recomendación**: implementar (guardar referencia al listener y eliminarlo antes de reinicializar)
- **Prioridad**: media
- **Requerimiento relacionado**: REQ-020

#### NC-005: BroadcastReceiver no desregistrado en crash
- **Escenario**: Si la app crashea sin pasar por `onHostDestroy()`, el BroadcastReceiver queda registrado.
- **Código afectado**: `DownloadsModule.java` (línea ~101-121), `DownloadsModule2.java` (línea ~167-196)
- **Impacto**: Leak de receiver. Android puede mostrar warning en logcat.
- **Recomendación**: documentar como limitación (Android gestiona cleanup en process death)
- **Prioridad**: baja
- **Requerimiento relacionado**: REQ-026

#### NC-006: Foreground service denegado silenciosamente en Android 12+
- **Escenario**: En Android 12+, si la app no tiene permiso de foreground service o está en background, `startForegroundService()` falla. El código captura la excepción y la loguea, pero la descarga no se inicia y el usuario no recibe feedback claro.
- **Código afectado**: `DownloadsModule2.java`, `startDownloadService()` (líneas ~1029-1058), `resumeAll()` (líneas ~614-637)
- **Impacto**: Las descargas no se inician silenciosamente. El usuario puede pensar que la app está rota.
- **Recomendación**: implementar (emitir evento específico a JS para que la UI informe al usuario)
- **Prioridad**: alta
- **Requerimiento relacionado**: REQ-024, REQ-025

#### NC-007: Descargas con DRM sin headers procesados
- **Escenario**: `renewLicense()` y `releaseAllLicenses()` en `DownloadsModule2.java` están vacíos (solo resuelven la promise sin hacer nada).
- **Código afectado**: `DownloadsModule2.java`, `renewLicense()` (líneas ~921-928), `releaseAllLicenses()` (líneas ~944-956)
- **Impacto**: Las licencias no se renuevan ni se liberan masivamente. Funcionalidad anunciada pero no implementada.
- **Recomendación**: implementar
- **Prioridad**: alta
- **Requerimiento relacionado**: REQ-017, REQ-018

#### NC-008: applyNetworkPolicy() vacío
- **Escenario**: `setNetworkPolicy()` almacena `allowCellularDownloads` y `requireWifi` pero `applyNetworkPolicy()` está vacío.
- **Código afectado**: `DownloadsModule2.java`, `applyNetworkPolicy()` (líneas ~1689-1692), `setNetworkPolicy()` (líneas ~833-849)
- **Impacto**: Las descargas continúan en datos móviles aunque el usuario configure "solo WiFi".
- **Recomendación**: implementar
- **Prioridad**: media
- **Requerimiento relacionado**: REQ-024

#### NC-009: Maps paralelos desincronizados en DownloadsModule2
- **Escenario**: `activeHelpers`, `helperCreationTimes`, `activeDownloadQuality`, `activeDrmMessages`, `activeDownloadTitles` son 5 maps que deben mantenerse sincronizados. Si un cleanup falla parcialmente, quedan en estado inconsistente.
- **Código afectado**: `DownloadsModule2.java`, múltiples puntos de cleanup (líneas ~488-546, ~1564-1608, ~1938-2075)
- **Impacto**: Memory leak gradual. Helpers huérfanos. Calidad incorrecta aplicada a descarga equivocada.
- **Recomendación**: implementar (encapsular en un objeto `DownloadSession` que agrupe todos los datos por ID)
- **Prioridad**: media
- **Requerimiento relacionado**: REQ-021

#### NC-010: Desmontaje de ReactExoplayerView durante operación async
- **Escenario**: Si la vista se desmonta mientras `getVideoTrackInfoFromManifest()` está ejecutándose en un thread separado, el callback intenta acceder a la vista desmontada.
- **Código afectado**: `ReactExoplayerView.java`, `getVideoTrackInfoFromManifest()` (líneas ~1921-1987)
- **Impacto**: NullPointerException silenciosa o crash.
- **Recomendación**: implementar (verificar `isAttachedToWindow()` antes de ejecutar callback)
- **Prioridad**: media
- **Requerimiento relacionado**: REQ-011

#### NC-011: Pérdida de posición de reproducción en error behind-live-window
- **Escenario**: Cuando se detecta `isBehindLiveWindow()`, el player se reinicializa con `resumePosition = C.TIME_UNSET`, perdiendo la posición actual.
- **Código afectado**: `ReactExoplayerView.java`, `onPlayerError()` (líneas ~2109-2119)
- **Impacto**: El usuario pierde su posición en el stream. UX degradada.
- **Recomendación**: documentar como limitación (comportamiento esperado para live streams)
- **Prioridad**: baja
- **Requerimiento relacionado**: REQ-001

#### NC-012: setBufferConfig reinicia el player completo
- **Escenario**: Cambiar la configuración de buffer desde JS provoca `releasePlayer()` + `initializePlayer()`, reiniciando toda la reproducción.
- **Código afectado**: `ReactExoplayerView.java`, `setBufferConfig()` (líneas ~2683-2696)
- **Impacto**: Interrupción visible de la reproducción. El usuario ve un corte.
- **Recomendación**: documentar como limitación (ExoPlayer no permite cambiar LoadControl en caliente)
- **Prioridad**: baja
- **Requerimiento relacionado**: REQ-003

#### NC-013: Descarga con ID duplicado en DownloadsModule (v1)
- **Escenario**: `DownloadsModule.addItem()` no verifica si ya existe una descarga con el mismo ID antes de iniciar una nueva.
- **Código afectado**: `DownloadsModule.java`, `addItem()` (líneas ~473-543)
- **Impacto**: Descarga duplicada. Posible corrupción del DownloadIndex.
- **Recomendación**: implementar (ya resuelto en DownloadsModule2, eliminar v1 según Paso 13)
- **Prioridad**: alta
- **Requerimiento relacionado**: REQ-021

#### NC-014: forceRemoveDownloadFromIndex con delay asíncrono
- **Escenario**: `forceRemoveDownloadFromIndex()` usa `Handler.postDelayed(300ms)` para verificar la eliminación. Si `addDownload()` continúa inmediatamente, puede intentar crear una descarga antes de que la anterior se elimine.
- **Código afectado**: `DownloadsModule2.java`, `forceRemoveDownloadFromIndex()` (líneas ~1235-1267), `addDownload()` (líneas ~398-404)
- **Impacto**: Race condition. La nueva descarga puede fallar con "download already exists".
- **Recomendación**: implementar (usar callback de completado antes de continuar con addDownload)
- **Prioridad**: media
- **Requerimiento relacionado**: REQ-021

---

## 4.3 Complejidad innecesaria

#### CI-001: DownloadsModule (v1) duplicado
- **Código**: `DownloadsModule.java`, 1149 líneas completas
- **Qué hace**: Módulo RN para gestión de descargas, funcionalidad idéntica a DownloadsModule2 pero con menos features
- **Por qué parece innecesario**: DownloadsModule2 es un superset estricto. Ambos están registrados simultáneamente en `ReactVideoPackage.java`. Mantener ambos obliga a aplicar fixes en dos sitios (SA-05).
- **Propuesta**: eliminar
- **Riesgo de eliminación**: Código JS que referencia `NativeModules.Downloads` (sin "2") dejaría de funcionar. Validar: buscar `"Downloads"` en código JS/TS.

#### CI-002: Lógica de high-progress MPD failure triplicada
- **Código**: `AxDownloadTracker.getDownloadRequest()` (líneas ~196-227), `AxDownloadTracker.onDownloadChanged()` (líneas ~272-353), `AxOfflineManager.configureDownloadManager()` (líneas ~260-296)
- **Qué hace**: Cada implementación decide si una descarga MPD fallida debe tratarse como exitosa, con thresholds y lógica ligeramente diferentes
- **Por qué parece innecesario**: La misma decisión se toma en 3 puntos con 3 implementaciones distintas. Además, `AxDownloadTracker.onDownloadChanged()` contiene `if (is404Error || true)` (línea ~280), lo que significa que la condición siempre es true, haciendo el check de 404 irrelevante.
- **Propuesta**: simplificar (unificar en un solo método en `DownloadErrorClassifier`, Paso 14 de migración)
- **Riesgo de eliminación**: Si los thresholds difieren intencionalmente entre los 3 puntos, unificarlos podría cambiar el comportamiento. Validar: comparar los thresholds exactos y confirmar que deben ser iguales.

#### CI-003: getDownloadStateAsString() con if-else chain
- **Código**: `DownloadsModule.java`, `getDownloadStateAsString()` (líneas ~1120-1147)
- **Qué hace**: Convierte un int de estado a String con 7 if-else
- **Por qué parece innecesario**: `DownloadsModule2.mapDownloadState()` (líneas ~1169-1179) hace lo mismo con un switch más limpio. Además, ambos son equivalentes a un simple `Map<Integer, String>` o `switch`.
- **Propuesta**: eliminar (se elimina con CI-001)
- **Riesgo de eliminación**: Ninguno adicional al de CI-001.

#### CI-004: Logging excesivo sin flag de debug
- **Código**: `AxDownloadTracker.java` (~40 líneas de Log.d en `onDownloadChanged()`), `AxDownloadService.java` (~30 líneas en `TerminalStateNotificationHelper`), `DownloadsModule2.java` (~50 líneas en `onPrepared()`), `ReactExoplayerView.java` (múltiples `Log.i("Downloads", ...)`)
- **Qué hace**: Logging extenso en producción sin condición de debug
- **Por qué parece innecesario**: Impacto en rendimiento (I/O de disco por cada log). Ruido en logcat. Información sensible (URIs, license URLs) expuesta en logs de producción.
- **Propuesta**: simplificar (condicionar a `BuildConfig.DEBUG` o a un flag configurable)
- **Riesgo de eliminación**: Pérdida de capacidad de diagnóstico en producción. Mitigación: mantener `Log.e()` y `Log.w()` incondicionales, condicionar solo `Log.d()` y `Log.i()`.

#### CI-005: AsyncTask en tareas de licencia
- **Código**: `LicenceDownloadTask.java` (360 líneas), `LicenseCheckTask.java` (~120 líneas), `LicenseReleaseTask.java` (~100 líneas), `LicenseRestoreTask.java` (~100 líneas)
- **Qué hace**: Usa `AsyncTask` (deprecated desde API 30) para operaciones de licencia DRM
- **Por qué parece innecesario**: `AsyncTask` tiene problemas conocidos (memory leaks, no cancellable de forma segura, pool compartido). El propio código lo reconoce con `// TODO: Replace with ExecutorService`.
- **Propuesta**: simplificar (reemplazar por `ExecutorService` + `Handler` para callbacks en main thread)
- **Riesgo de eliminación**: Cambio de threading model podría introducir bugs sutiles. Validar: tests de contrato de Fase 3 deben pasar antes y después.

#### CI-006: Clase interna RNVLoadControl
- **Código**: `ReactExoplayerView.java`, clase interna `RNVLoadControl` (líneas ~350-500, ~150 líneas)
- **Qué hace**: Extiende `DefaultLoadControl` con lógica de buffering basada en heap disponible
- **Por qué parece innecesario**: Como clase interna, no es testeable aisladamente y contribuye al tamaño del God Object. La lógica de `shouldContinueLoading()` es independiente del player.
- **Propuesta**: simplificar (extraer a `BufferConfigManager` según Paso 8 de migración)
- **Riesgo de eliminación**: Bajo. La lógica se mueve sin cambios.

#### CI-007: Broadcast de progreso dentro de getForegroundNotification()
- **Código**: `AxDownloadService.java`, `getForegroundNotification()` (líneas ~151-219)
- **Qué hace**: Además de construir la notificación, emite un broadcast con el progreso de descarga
- **Por qué parece innecesario**: Mezcla responsabilidades. Un método que construye una notificación no debería tener el efecto secundario de emitir broadcasts.
- **Propuesta**: simplificar (extraer el broadcast a un método separado llamado desde `onStartCommand()` o un listener)
- **Riesgo de eliminación**: Bajo. El broadcast se sigue emitiendo, solo cambia dónde se invoca.

#### CI-008: Comentario "DML: No usamos token en Primeran"
- **Código**: `LicenceDownloadTask.java`, línea ~257
- **Qué hace**: Código de validación de DRM message comentado/deshabilitado con referencia a un cliente específico
- **Por qué parece innecesario**: Referencia a lógica de negocio de un cliente específico en código genérico de librería. Si la validación no se usa, el código muerto añade confusión.
- **Propuesta**: eliminar (el código comentado y la referencia al cliente)
- **Riesgo de eliminación**: Si algún día se necesita la validación, habría que reimplementarla. Mitigación: documentar en commit message qué se eliminó.

#### CI-009: generateUniqueId() basado en hashCode + timestamp
- **Código**: `DownloadsModule2.java`, `generateUniqueId()` (líneas ~1445-1448)
- **Qué hace**: Genera un ID "único" concatenando `uri.hashCode()` + `"_"` + `System.currentTimeMillis()`
- **Por qué parece innecesario**: `hashCode()` puede colisionar. El método no se usa internamente (los IDs vienen del JS). Si se expone como API, debería usar `UUID.randomUUID()`.
- **Propuesta**: simplificar (reemplazar por `UUID.randomUUID().toString()` o eliminar si no se usa)
- **Riesgo de eliminación**: Si código JS llama a `generateDownloadId()`, cambiar la implementación cambia el formato de IDs. Validar: buscar uso en JS.

#### CI-010: Parámetro `foreground` siempre false en DownloadService calls
- **Código**: `DownloadsModule2.java`, múltiples llamadas a `DownloadService.sendRemoveDownload(reactContext, AxDownloadService.class, id, false)`, `DownloadService.sendResumeDownloads(reactContext, AxDownloadService.class, false)`, etc.
- **Qué hace**: El parámetro `foreground` siempre se pasa como `false`
- **Por qué parece innecesario**: Si nunca se usa `true`, el parámetro no aporta valor. Sin embargo, es parte de la API de ExoPlayer, no del código propio.
- **Propuesta**: mantener (es API de ExoPlayer, no se puede eliminar)
- **Riesgo de eliminación**: N/A

---

## 4.4 Resumen ejecutivo

| ID | Tipo | Descripción | Estado | Tests | Prioridad refact. |
|---|---|---|---|---|---|
| REQ-001 | Requerimiento | Inicialización del reproductor ExoPlayer | implementado | ⬜ | alta |
| REQ-002 | Requerimiento | Construcción de MediaSource según tipo | implementado | ⬜ | alta |
| REQ-003 | Requerimiento | Configuración de buffering personalizada | implementado | ⬜ | media |
| REQ-004 | Requerimiento | Selección de tracks audio/vídeo/texto | implementado | ⬜ | alta |
| REQ-005 | Requerimiento | Gestión de audio focus | implementado | ⬜ | baja |
| REQ-006 | Requerimiento | Reproducción offline desde caché | implementado | ⬜ | alta |
| REQ-007 | Requerimiento | Emisión de eventos a JavaScript | implementado | ⬜ | alta |
| REQ-008 | Requerimiento | Modo fullscreen | implementado | ⬜ | baja |
| REQ-009 | Requerimiento | Controles de reproducción nativos | implementado | ⬜ | baja |
| REQ-010 | Requerimiento | Servicio de reproducción en background | implementado | ⬜ | media |
| REQ-011 | Requerimiento | Info de tracks desde manifiesto | implementado | ⬜ | baja |
| REQ-012 | Requerimiento | DRM Widevine online | implementado | ⬜ | alta |
| REQ-013 | Requerimiento | Retry DRM L1→L3 | implementado | ⬜ | media |
| REQ-014 | Requerimiento | DRM offline (licencia persistente) | implementado | ⬜ | alta |
| REQ-015 | Requerimiento | Descarga de licencias DRM | implementado | ⬜ | alta |
| REQ-016 | Requerimiento | Verificación de validez de licencia | implementado | ⬜ | media |
| REQ-017 | Requerimiento | Liberación de licencias DRM | implementado | ⬜ | media |
| REQ-018 | Requerimiento | Restauración de licencias DRM | implementado | ⬜ | media |
| REQ-019 | Requerimiento | Cola serializada de licencias | implementado | ⬜ | alta |
| REQ-020 | Requerimiento | Inicialización sistema de descargas | implementado | ⬜ | alta |
| REQ-021 | Requerimiento | Añadir descarga de contenido | implementado | ⬜ | alta |
| REQ-022 | Requerimiento | Selección de tracks por calidad | implementado | ⬜ | alta |
| REQ-023 | Requerimiento | Eliminación de descarga con cleanup | implementado | ⬜ | media |
| REQ-024 | Requerimiento | Pausa/reanudación de descargas | implementado | ⬜ | media |
| REQ-025 | Requerimiento | Servicio de descarga en background | implementado | ⬜ | media |
| REQ-026 | Requerimiento | Broadcast de progreso | implementado | ⬜ | media |
| REQ-027 | Requerimiento | Consulta de estado de descargas | implementado | ⬜ | baja |
| REQ-028 | Requerimiento | Cálculo preciso de tamaño total | implementado | ⬜ | alta |
| REQ-029 | Requerimiento | Recovery MPD high-progress | implementado | ⬜ | alta |
| REQ-030 | Requerimiento | Limpieza periódica de helpers | implementado | ⬜ | baja |
| REQ-031 | Requerimiento | Info del sistema (storage/red) | implementado | ⬜ | baja |
| REQ-032 | Requerimiento | Detección error espacio en disco | implementado | ⬜ | alta |
| REQ-033 | Requerimiento | Reproducción de anuncios IMA | implementado | ⬜ | media |
| REQ-034 | Requerimiento | Integración Youbora/NPAW | implementado | ⬜ | baja |
| REQ-035 | Requerimiento | Propiedades del decodificador | implementado | ⬜ | baja |
| REQ-036 | Requerimiento | Control imperativo desde JS | implementado | ⬜ | baja |
| NC-001 | No contemplado | Race condition currentMediaItem estático | — | — | alta |
| NC-002 | No contemplado | wait() sin timeout | — | — | crítica |
| NC-003 | No contemplado | Thread.sleep() en main thread | — | — | alta |
| NC-004 | No contemplado | Listener no eliminado en reinit | — | — | media |
| NC-005 | No contemplado | BroadcastReceiver leak en crash | — | — | baja |
| NC-006 | No contemplado | Foreground service denegado silenciosamente | — | — | alta |
| NC-007 | No contemplado | renewLicense/releaseAllLicenses vacíos | — | — | alta |
| NC-008 | No contemplado | applyNetworkPolicy vacío | — | — | media |
| NC-009 | No contemplado | Maps paralelos desincronizados | — | — | media |
| NC-010 | No contemplado | Desmontaje durante operación async | — | — | media |
| NC-011 | No contemplado | Pérdida de posición en behind-live-window | — | — | baja |
| NC-012 | No contemplado | setBufferConfig reinicia player | — | — | baja |
| NC-013 | No contemplado | Descarga con ID duplicado en v1 | — | — | alta |
| NC-014 | No contemplado | forceRemoveDownloadFromIndex race condition | — | — | media |
| CI-001 | Complejidad innecesaria | DownloadsModule v1 duplicado | — | — | alta |
| CI-002 | Complejidad innecesaria | High-progress MPD triplicado | — | — | alta |
| CI-003 | Complejidad innecesaria | getDownloadStateAsString if-else | — | — | baja |
| CI-004 | Complejidad innecesaria | Logging sin flag debug | — | — | media |
| CI-005 | Complejidad innecesaria | AsyncTask deprecated | — | — | media |
| CI-006 | Complejidad innecesaria | RNVLoadControl clase interna | — | — | media |
| CI-007 | Complejidad innecesaria | Broadcast en getForegroundNotification | — | — | baja |
| CI-008 | Complejidad innecesaria | Comentario cliente específico | — | — | baja |
| CI-009 | Complejidad innecesaria | generateUniqueId con hashCode | — | — | baja |
| CI-010 | Complejidad innecesaria | Parámetro foreground siempre false | — | — | baja (mantener) |

### Métricas globales

| Métrica | Valor |
|---|---|
| **Requerimientos funcionales** | 36 |
| **Requerimientos con test** | 0 (0%) |
| **Casos no contemplados** | 14 |
| **NC con prioridad crítica/alta** | 7 |
| **Complejidad innecesaria** | 10 |
| **CI con propuesta de eliminar** | 3 |
| **CI con propuesta de simplificar** | 6 |
| **CI con propuesta de mantener** | 1 |
