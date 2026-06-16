package com.brentvatne.react

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.brentvatne.exoplayer.CanonicalPlayerHolder
import com.brentvatne.exoplayer.CarProjectionStatus
import com.brentvatne.exoplayer.GlobalPlayerManager
import com.brentvatne.exoplayer.VideoPlaybackService
import com.brentvatne.exoplayer.androidauto.ContentStyle
import com.brentvatne.exoplayer.androidauto.MediaCache
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Módulo nativo para integración con Android Auto
 *
 * Proporciona API JavaScript para:
 * - Habilitar/deshabilitar Android Auto
 * - Configurar biblioteca de medios
 * - Actualizar metadata de reproducción
 * - Verificar estado de conexión
 *
 * Este módulo actúa como puente entre JavaScript y MediaBrowserService.
 */
class AndroidAutoModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "AndroidAutoModule"
        const val MODULE_NAME = "AndroidAutoModule"

        // Eventos emitidos a JavaScript
        const val EVENT_BROWSE_REQUEST = "onBrowseRequest"
        const val EVENT_PLAY_FROM_MEDIA_ID = "onPlayFromMediaId"
        const val EVENT_SEARCH_REQUEST = "onSearchRequest"
        const val EVENT_PLAY_FROM_SEARCH = "onPlayFromSearch"
        const val EVENT_PLAY_FROM_URI = "onPlayFromUri"
        const val EVENT_CONNECTED = "androidAutoConnected"
        const val EVENT_DISCONNECTED = "androidAutoDisconnected"
        const val EVENT_JS_READY = "androidAutoJsReady"

        // PLAYER-268: OS/car skip transport command events.
        const val EVENT_SKIP_TO_NEXT = "onSkipToNext"
        const val EVENT_SKIP_TO_PREVIOUS = "onSkipToPrevious"

        // PLAYER-300: gearhead Now Playing queue-item tap (skipToQueueItem → goToIndex).
        const val EVENT_SKIP_TO_QUEUE_ITEM = "onSkipToQueueItem"

        // Singleton instance
        @Volatile
        private var instance: AndroidAutoModule? = null

        /**
         * Obtener instancia del módulo desde contexto estático
         * Usado por MediaBrowserService para acceder al módulo
         */
        fun getInstance(context: ReactApplicationContext): AndroidAutoModule =
            instance ?: synchronized(this) {
                instance ?: AndroidAutoModule(context).also { instance = it }
            }

        /**
         * PLAYER-269 Phase 4: zero-arg accessor used by [VideoLibraryCallback] and other
         * non-RN contexts that cannot provide a [ReactApplicationContext].
         * Returns null if the module has not been initialized yet (JS not ready).
         */
        fun getInstance(): AndroidAutoModule? = instance

        /**
         * PLAYER-268: forward an OS/car "skip to next" transport command to JS, which advances
         * the playlist via PlaylistControl.next(). No-op if JS is not ready (the car simply gets
         * the blocked command; skip is a transient action, not worth launch-in-background).
         */
        @JvmStatic
        fun notifySkipToNext() {
            instance?.takeIf { it.isJavaScriptReady() }
                ?.sendEvent(EVENT_SKIP_TO_NEXT, null)
        }

        /**
         * PLAYER-268: forward an OS/car "skip to previous" transport command to JS, which advances
         * the playlist via PlaylistControl.previous().
         */
        @JvmStatic
        fun notifySkipToPrevious() {
            instance?.takeIf { it.isJavaScriptReady() }
                ?.sendEvent(EVENT_SKIP_TO_PREVIOUS, null)
        }

        /**
         * PLAYER-300: forward a gearhead Now Playing queue-item tap to JS, which jumps the
         * playlist via PlaylistControl.goToIndex(index). Called by PlaylistAwareForwardingPlayer
         * when media3 routes `onSkipToQueueItem(queueId)` → `seekToDefaultPosition(queueId)`
         * (QueueItem id == JS queue index). No-op if JS is not ready — with no JS queue the
         * synthetic timeline is inactive and gearhead cannot show tappable rows anyway.
         */
        @JvmStatic
        fun notifySkipToQueueItem(index: Int) {
            instance?.takeIf { it.isJavaScriptReady() }
                ?.sendEvent(
                    EVENT_SKIP_TO_QUEUE_ITEM,
                    Arguments.createMap().apply { putInt("index", index) }
                )
        }

        // PLAYER-280: play pedido por el coche antes de que JS estuviera listo (cold-start).
        // Vive en el companion (no en la instancia) porque en frío el módulo aún NO existe.
        // Lo entrega setJavaScriptReady() al completar el bootstrap headless.
        @Volatile
        private var pendingCarPlayMediaId: String? = null

        /**
         * PLAYER-280: encolar (o entregar, si JS ya está listo) un play solicitado por el coche.
         * Llamado por [com.brentvatne.exoplayer.VideoLibraryCallback] cuando el item no tiene
         * URI en cache y el contexto JS todavía se está inicializando.
         */
        @JvmStatic
        fun queueCarPlayRequest(mediaId: String) {
            val ready = instance?.takeIf { it.isJavaScriptReady() }
            if (ready != null) {
                // Cierra la carrera "se hizo ready entre el check y el queue".
                ready.sendEvent(
                    EVENT_PLAY_FROM_MEDIA_ID,
                    Arguments.createMap().apply { putString("mediaId", mediaId) }
                )
            } else {
                pendingCarPlayMediaId = mediaId
            }
        }

        /** Saca el play pendiente (si lo hay), dejando la cola vacía. */
        @JvmStatic
        internal fun consumePendingCarPlay(): String? = pendingCarPlayMediaId?.also { pendingCarPlayMediaId = null }
    }

    private var isEnabled = false
    private var jsReady = false

    // MediaCache instance (initialized on enable)
    private var mediaCache: MediaCache? = null

    override fun getName(): String = MODULE_NAME

    /**
     * Habilitar Android Auto
     *
     * Inicializa el sistema Android Auto y prepara MediaBrowserService.
     * Este método debe ser llamado antes de usar cualquier otra funcionalidad.
     */
    @ReactMethod
    fun enable(promise: Promise) {
        try {
            Log.d(TAG, "enable() called")

            if (isEnabled) {
                Log.w(TAG, "Android Auto already enabled")
                promise.resolve(true)
                return
            }

            // Inicializar MediaCache
            // NOTA: getInstance() auto-inicializa el caché desde disco
            if (mediaCache == null) {
                mediaCache = MediaCache.getInstance(reactContext)
            }

            // Log de contenido cargado
            val stats = mediaCache?.getStats()
            Log.d(TAG, "MediaCache ready: $stats")

            // Iniciar el servicio canónico (único servicio in-car tras el burn-down PLAYER-278)
            val svcIntent = Intent(reactContext, VideoPlaybackService::class.java)
            reactContext.startService(svcIntent)
            Log.d(TAG, "VideoPlaybackService started (canonical)")

            // Notificar habilitación al servicio canónico
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                val canonicalSvc = VideoPlaybackService.liveInstance
                canonicalSvc?.setAndroidAutoModule(this)
                canonicalSvc?.onAndroidAutoEnabled()
                Log.d(TAG, "VideoPlaybackService notified of Android Auto enabled")
            }, 500)

            isEnabled = true
            // NO marcar jsReady aquí (PLAYER-280): enable() se llama al PRINCIPIO del bootstrap
            // JS, antes de registrar onPlayFromMediaId y de poblar la librería. Marcarlo aquí
            // hacía que el servicio enviase plays "immediately" a un JS sin callback (evento
            // perdido). jsReady lo marca SOLO setJavaScriptReady(), al final del bootstrap.

            Log.i(TAG, "Android Auto enabled successfully")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to enable Android Auto", e)
            promise.reject("ENABLE_FAILED", "Failed to enable Android Auto: ${e.message}", e)
        }
    }

    /**
     * Deshabilitar Android Auto
     *
     * Detiene el sistema Android Auto y limpia recursos.
     */
    @ReactMethod
    fun disable(promise: Promise) {
        try {
            Log.d(TAG, "disable() called")

            if (!isEnabled) {
                Log.w(TAG, "Android Auto already disabled")
                promise.resolve(true)
                return
            }

            // Detener el servicio canónico
            val svcIntent = Intent(reactContext, VideoPlaybackService::class.java)
            reactContext.stopService(svcIntent)
            Log.d(TAG, "VideoPlaybackService stopped (canonical)")

            isEnabled = false
            jsReady = false

            Log.i(TAG, "Android Auto disabled successfully")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to disable Android Auto", e)
            promise.reject("DISABLE_FAILED", "Failed to disable Android Auto: ${e.message}", e)
        }
    }

    /**
     * Configurar biblioteca de medios
     *
     * REEMPLAZA completamente la biblioteca de medios en caché.
     * Para actualizaciones incrementales, usa updateMediaLibrary(), addMediaItems() o removeMediaItems().
     *
     * Guarda la biblioteca de medios en caché para respuesta rápida
     * cuando Android Auto solicita contenido con la app cerrada.
     *
     * @param items Array de MediaItems con estructura:
     *   - id: string (requerido)
     *   - title: string (requerido)
     *   - subtitle: string (opcional)
     *   - artist: string (opcional)
     *   - artworkUri: string (opcional)
     *   - browsable: boolean (opcional)
     *   - playable: boolean (opcional)
     *   - parentId: string (opcional)
     */
    @ReactMethod
    fun setMediaLibrary(items: ReadableArray, promise: Promise) {
        try {
            Log.d(TAG, "setMediaLibrary() called with ${items.size()} items")

            if (!isEnabled) {
                Log.w(TAG, "Android Auto not enabled, call enable() first")
                promise.reject("NOT_ENABLED", "Android Auto not enabled")
                return
            }

            // Parsear y AGRUPAR por parentId para reconstruir el árbol multinivel.
            // JS envía una lista PLANA con un parentId por item (tabs -> "/" raíz, items -> tabId,
            // children -> itemId). Antes TODO se guardaba bajo "root" (parentNodes=1), aplanando el
            // árbol y dejando getChildren(<subnodo>) vacío. Ahora respetamos parentId; la raíz de
            // GUAU ("/" en el mapper JS) se normaliza a la raíz nativa ("root").
            val grouped = LinkedHashMap<String, MutableList<MediaItem>>()
            for (i in 0 until items.size()) {
                val map = items.getMap(i) ?: continue
                val item = buildMediaItem(map) ?: continue
                val rawParent = map.getString("parentId")
                val parent = if (rawParent.isNullOrEmpty() || rawParent == "/") "root" else rawParent
                grouped.getOrPut(parent) { mutableListOf() }.add(item)
            }
            grouped.forEach { (parent, children) -> mediaCache?.updateChildren(parent, children) }
            val totalCached = grouped.values.sumOf { it.size }
            Log.i(TAG, "setMediaLibrary: cached $totalCached items across ${grouped.size} parent nodes")

            // Notificar al servicio que el contenido cambió (refresca desde la raíz)
            notifyContentChanged("root")

            // Log estadísticas
            val stats = mediaCache?.getStats()
            Log.i(TAG, "Media library cached: ${items.size()} items, Stats: $stats")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set media library", e)
            promise.reject("SET_LIBRARY_FAILED", "Failed to set media library: ${e.message}", e)
        }
    }

    /**
     * PLAYER-267 FASE 6: receive a dynamic onBrowseRequest result from JS and cache it for the given parent,
     * then notify Android Auto to refresh. The static setMediaLibrary path is unaffected.
     */
    @ReactMethod
    fun respondToBrowseRequest(parentId: String, items: ReadableArray, promise: Promise) {
        try {
            if (!isEnabled) {
                promise.reject("NOT_ENABLED", "Android Auto not enabled")
                return
            }
            val mediaItems = parseMediaItems(items)
            mediaCache?.updateChildren(parentId, mediaItems)
            notifyContentChanged(parentId)
            Log.i(TAG, "respondToBrowseRequest($parentId): cached ${mediaItems.size} items")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "respondToBrowseRequest failed", e)
            promise.reject("BROWSE_RESPONSE_FAILED", e.message, e)
        }
    }

    /**
     * PLAYER-267 FASE 6: receive a dynamic onSearch result from JS and cache it under a synthetic search
     * parent so the car can browse the results. parentId convention: "search:<query>".
     */
    @ReactMethod
    fun respondToSearchRequest(query: String, items: ReadableArray, promise: Promise) {
        try {
            if (!isEnabled) {
                promise.reject("NOT_ENABLED", "Android Auto not enabled")
                return
            }
            val parent = "search:$query"
            val mediaItems = parseMediaItems(items)
            mediaCache?.updateChildren(parent, mediaItems)
            notifyContentChanged(parent)
            // PLAYER-284: notifyChildrenChanged does NOT cover search — media3 only invokes
            // onGetSearchResult after notifySearchResultChanged reaches the waiting browser.
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                VideoPlaybackService.liveInstance?.notifySearchResultsReady(query, mediaItems.size)
            }
            Log.i(TAG, "respondToSearchRequest('$query'): cached ${mediaItems.size} results")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "respondToSearchRequest failed", e)
            promise.reject("SEARCH_RESPONSE_FAILED", e.message, e)
        }
    }

    /**
     * PLAYER-285 (G2): report a playback error from the JS layer to the in-car session.
     *
     * Called when the JS play flow fails (URL resolution, network, auth/subscription,
     * content unavailable). Stops the canonical player so gearhead exits its loading/buffering
     * state, and sets session extras with the error code + localized message.
     *
     * Error codes: RESOLUTION_ERROR, NETWORK_ERROR, AUTH_ERROR (VI-1 hint included),
     * CONTENT_UNAVAILABLE, UNKNOWN_ERROR.
     *
     * media3 1.1.1 limitation: MediaSession.sendError() does not exist yet (added in 1.3+).
     * PLAYER-303: the stop()+setSessionExtras mechanism alone was verified INSUFFICIENT on
     * device (DHU 2026-06-12): gearhead ignores session extras and stays in its loading state
     * (legacy PlaybackState stuck in BUFFERING) — no message, infinite spinner. The working
     * channel on media3 1.1.1 is the legacy bridge's error mapping: a non-null
     * `Player.getPlayerError()` makes `PlayerWrapper.createPlaybackStateCompat()` publish
     * STATE_ERROR + errorMessage, which gearhead renders. We raise a synthetic error through
     * [com.brentvatne.exoplayer.PlaylistAwareForwardingPlayer.raiseSyntheticError]; it
     * self-clears on the next real load. setSessionExtras is kept as a secondary channel for
     * controllers that do read extras. Upgrade path: media3 1.3+ sendError().
     *
     * @param errorCode String code from RESOLUTION_ERROR/NETWORK_ERROR/AUTH_ERROR/...
     * @param localizedMessage Localized message to surface to the driver.
     */
    @ReactMethod
    fun reportPlaybackError(errorCode: String, localizedMessage: String, promise: Promise) {
        try {
            Log.w(TAG, "reportPlaybackError: code=$errorCode, message=$localizedMessage")
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                try {
                    // 1. PLAYER-303: raise the synthetic error FIRST so every legacy re-publish
                    //    from this point on (including the stop()'s IDLE transition below) derives
                    //    STATE_ERROR + message instead of a loading/none state.
                    val svcForError = VideoPlaybackService.liveInstance
                    val forwarding = svcForError?.forwardingPlayer()
                    if (forwarding != null) {
                        forwarding.raiseSyntheticError(localizedMessage)
                    } else {
                        Log.w(TAG, "reportPlaybackError: no forwarding player — error not visible in car (PLAYER-303)")
                    }

                    // 2. Stop the canonical player so any in-flight load is abandoned.
                    val player = CanonicalPlayerHolder.get()
                    if (player != null) {
                        player.stop()
                        Log.i(TAG, "reportPlaybackError: canonical player stopped")
                    } else {
                        Log.w(TAG, "reportPlaybackError: canonical player not available")
                    }

                    // 3. Attach error metadata to the session extras as a secondary channel for
                    //    controllers that do read extras (gearhead does NOT — PLAYER-303).
                    val svc = svcForError
                    if (svc != null) {
                        val errorBundle = android.os.Bundle().apply {
                            putString("error_code", errorCode)
                            putString("error_message", localizedMessage)
                        }
                        svc.librarySession()?.setSessionExtras(errorBundle)
                        // 4. Notify gearhead so it refreshes the browse tree from the stopped state.
                        svc.notifyChildrenChanged("root")
                        Log.i(TAG, "reportPlaybackError: session extras set and root notified")
                    } else {
                        Log.w(TAG, "reportPlaybackError: VideoPlaybackService not alive")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "reportPlaybackError: error while stopping player", e)
                }
            }
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "reportPlaybackError failed", e)
            promise.reject("REPORT_ERROR_FAILED", e.message, e)
        }
    }

    /**
     * PLAYER-286 (G3): persist the last-played mediaId + position for playback resumption.
     * Called from GUAU's ITEM_STARTED handler so the native layer can rebuild a minimal
     * MediaSession.MediaItemsWithStartPosition in [VideoLibraryCallback.onPlaybackResumption].
     *
     * @param mediaId The mediaId that started playing.
     * @param positionMs The playback position in milliseconds (0 for stream start).
     */
    @ReactMethod
    fun saveLastPlayed(mediaId: String, positionMs: Double, promise: Promise) {
        try {
            val mc = mediaCache ?: MediaCache.getInstance(reactContext)
            mc.saveLastPlayed(mediaId, positionMs.toLong())
            Log.i(TAG, "saveLastPlayed: mediaId=$mediaId positionMs=$positionMs")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "saveLastPlayed failed", e)
            promise.reject("SAVE_LAST_PLAYED_FAILED", e.message, e)
        }
    }

    /**
     * PLAYER-314: leer el last-played persistido ({mediaId, positionMs} o null).
     *
     * Permite al flujo JS de resumption reanudar EN la posición local guardada cuando el
     * backend no aporta una (las escuchas car-only, sin CustomPlayer montado, no reportan
     * progreso al backend).
     */
    @ReactMethod
    fun getLastPlayed(promise: Promise) {
        try {
            val mc = mediaCache ?: MediaCache.getInstance(reactContext)
            val mediaId = mc.loadLastPlayedMediaId()
            if (mediaId == null) {
                promise.resolve(null)
                return
            }
            promise.resolve(
                Arguments.createMap().apply {
                    putString("mediaId", mediaId)
                    putDouble("positionMs", mc.loadLastPlayedPositionMs().toDouble())
                }
            )
        } catch (e: Exception) {
            Log.e(TAG, "getLastPlayed failed", e)
            promise.reject("GET_LAST_PLAYED_FAILED", e.message, e)
        }
    }

    /**
     * Actualizar biblioteca de medios (incremental)
     *
     * Actualiza items existentes o añade nuevos sin eliminar los que no están en el array.
     * Más eficiente que setMediaLibrary() para actualizaciones parciales.
     *
     * @param items Array de MediaItems a actualizar/añadir
     * @param parentId ID del nodo padre (por defecto "root")
     */
    @ReactMethod
    fun updateMediaLibrary(items: ReadableArray, parentId: String?, promise: Promise) {
        try {
            val parent = parentId ?: "root"
            Log.d(TAG, "updateMediaLibrary() called with ${items.size()} items for parent: $parent")

            if (!isEnabled) {
                Log.w(TAG, "Android Auto not enabled, call enable() first")
                promise.reject("NOT_ENABLED", "Android Auto not enabled")
                return
            }

            // Obtener items actuales
            val currentItems = mediaCache?.getChildren(parent)?.toMutableList() ?: mutableListOf()
            val newItems = parseMediaItems(items)

            // Actualizar o añadir items
            for (newItem in newItems) {
                val existingIndex = currentItems.indexOfFirst { it.mediaId == newItem.mediaId }
                if (existingIndex >= 0) {
                    // Actualizar item existente
                    currentItems[existingIndex] = newItem
                    Log.d(TAG, "Updated item: ${newItem.mediaId}")
                } else {
                    // Añadir nuevo item
                    currentItems.add(newItem)
                    Log.d(TAG, "Added new item: ${newItem.mediaId}")
                }
            }

            // Guardar en caché
            mediaCache?.updateChildren(parent, currentItems)

            // Notificar al servicio
            notifyContentChanged(parent)

            val stats = mediaCache?.getStats()
            Log.i(TAG, "Media library updated: ${newItems.size} items processed, Stats: $stats")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update media library", e)
            promise.reject("UPDATE_LIBRARY_FAILED", "Failed to update media library: ${e.message}", e)
        }
    }

    /**
     * Añadir items a la biblioteca
     *
     * Añade nuevos items sin modificar los existentes.
     * Si un item con el mismo ID ya existe, se ignora.
     *
     * @param items Array de MediaItems a añadir
     * @param parentId ID del nodo padre (por defecto "root")
     */
    @ReactMethod
    fun addMediaItems(items: ReadableArray, parentId: String?, promise: Promise) {
        try {
            val parent = parentId ?: "root"
            Log.d(TAG, "addMediaItems() called with ${items.size()} items for parent: $parent")

            if (!isEnabled) {
                Log.w(TAG, "Android Auto not enabled, call enable() first")
                promise.reject("NOT_ENABLED", "Android Auto not enabled")
                return
            }

            // Obtener items actuales
            val currentItems = mediaCache?.getChildren(parent)?.toMutableList() ?: mutableListOf()
            val newItems = parseMediaItems(items)

            var addedCount = 0
            for (newItem in newItems) {
                // Solo añadir si no existe
                if (!currentItems.any { it.mediaId == newItem.mediaId }) {
                    currentItems.add(newItem)
                    addedCount++
                    Log.d(TAG, "Added item: ${newItem.mediaId}")
                } else {
                    Log.d(TAG, "Skipped existing item: ${newItem.mediaId}")
                }
            }

            // Guardar en caché
            mediaCache?.updateChildren(parent, currentItems)

            // Notificar al servicio
            notifyContentChanged(parent)

            Log.i(TAG, "Added $addedCount new items (${newItems.size - addedCount} skipped as duplicates)")
            promise.resolve(addedCount)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add media items", e)
            promise.reject("ADD_ITEMS_FAILED", "Failed to add media items: ${e.message}", e)
        }
    }

    /**
     * Eliminar items de la biblioteca
     *
     * Elimina items por sus IDs.
     *
     * @param itemIds Array de IDs de items a eliminar
     * @param parentId ID del nodo padre (por defecto "root")
     */
    @ReactMethod
    fun removeMediaItems(itemIds: ReadableArray, parentId: String?, promise: Promise) {
        try {
            val parent = parentId ?: "root"
            Log.d(TAG, "removeMediaItems() called with ${itemIds.size()} IDs for parent: $parent")

            if (!isEnabled) {
                Log.w(TAG, "Android Auto not enabled, call enable() first")
                promise.reject("NOT_ENABLED", "Android Auto not enabled")
                return
            }

            // Convertir ReadableArray a lista de IDs
            val idsToRemove = mutableListOf<String>()
            for (i in 0 until itemIds.size()) {
                itemIds.getString(i)?.let { idsToRemove.add(it) }
            }

            // Obtener items actuales y filtrar
            val currentItems = mediaCache?.getChildren(parent)?.toMutableList() ?: mutableListOf()
            val initialSize = currentItems.size
            currentItems.removeAll { idsToRemove.contains(it.mediaId) }
            val removedCount = initialSize - currentItems.size

            // Guardar en caché
            mediaCache?.updateChildren(parent, currentItems)

            // Notificar al servicio
            notifyContentChanged(parent)

            Log.i(TAG, "Removed $removedCount items")
            promise.resolve(removedCount)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to remove media items", e)
            promise.reject("REMOVE_ITEMS_FAILED", "Failed to remove media items: ${e.message}", e)
        }
    }

    /**
     * Limpiar biblioteca de medios
     *
     * Elimina todo el contenido del caché.
     */
    @ReactMethod
    fun clearMediaLibrary(promise: Promise) {
        try {
            Log.d(TAG, "clearMediaLibrary() called")

            if (!isEnabled) {
                Log.w(TAG, "Android Auto not enabled, call enable() first")
                promise.reject("NOT_ENABLED", "Android Auto not enabled")
                return
            }

            mediaCache?.clear()

            // Notificar al servicio
            notifyContentChanged("root")

            Log.i(TAG, "Media library cleared")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clear media library", e)
            promise.reject("CLEAR_LIBRARY_FAILED", "Failed to clear media library: ${e.message}", e)
        }
    }

    /**
     * Actualizar metadata del contenido actual
     *
     * Actualiza la información mostrada en Android Auto durante la reproducción.
     * Se sincroniza automáticamente con MediaSession.
     *
     * @param metadata Mapa con:
     *   - title: string (opcional)
     *   - artist: string (opcional)
     *   - album: string (opcional)
     *   - artworkUri: string (opcional)
     *   - duration: number (opcional, en segundos)
     *   - position: number (opcional, en segundos)
     */
    @ReactMethod
    fun updateNowPlaying(metadata: ReadableMap) {
        try {
            val title = metadata.getString("title") ?: "Unknown"
            Log.d(TAG, "updateNowPlaying() called: $title")

            if (!isEnabled) {
                Log.w(TAG, "Android Auto not enabled, ignoring updateNowPlaying")
                return
            }

            // PLAYER-267 FASE 6: push metadata to the canonical player's current MediaItem.
            val player = CanonicalPlayerHolder.get()
            if (player != null) {
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    try {
                        val current = player.currentMediaItem
                        val md = androidx.media3.common.MediaMetadata.Builder()
                            .setTitle(metadata.getString("title"))
                            .setArtist(metadata.getString("artist"))
                            .setArtworkUri(
                                metadata.getString("artworkUri")?.let { android.net.Uri.parse(it) }
                            )
                            .build()
                        if (current != null) {
                            player.replaceMediaItem(
                                player.currentMediaItemIndex,
                                current.buildUpon().setMediaMetadata(md).build()
                            )
                        }
                        Log.d(TAG, "Now playing pushed to canonical session: $title")
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to push now-playing to canonical player", e)
                    }
                }
            } else {
                Log.w(TAG, "Canonical player not up; skipping now-playing push")
            }
            Log.d(TAG, "Now playing updated: $title")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update now playing", e)
        }
    }

    /**
     * Verificar estado de conexión
     *
     * @return Mapa con:
     *   - enabled: boolean - Si Android Auto está habilitado
     *   - connected: boolean - Si Android Auto está conectado
     *   - appActive: boolean - Si la app está activa
     *   - jsReady: boolean - Si JavaScript está listo
     */
    @ReactMethod
    fun getConnectionStatus(promise: Promise) {
        try {
            val isConnected = VideoPlaybackService.liveInstance?.isAndroidAutoConnected() ?: false

            val status = Arguments.createMap().apply {
                putBoolean("enabled", isEnabled)
                putBoolean("connected", isConnected)
                putBoolean("appActive", isAppActive())
                putBoolean("jsReady", jsReady)
            }

            Log.d(TAG, "Connection status: enabled=$isEnabled, connected=$isConnected, appActive=${isAppActive()}, jsReady=$jsReady")
            promise.resolve(status)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get connection status", e)
            promise.reject("STATUS_FAILED", "Failed to get connection status: ${e.message}", e)
        }
    }

    /**
     * Marcar JavaScript como listo
     *
     * Indica que JavaScript se ha inicializado y está listo para recibir eventos.
     * Útil para coordinar el arranque cuando la app se abre desde Android Auto.
     */
    @ReactMethod
    fun setJavaScriptReady(promise: Promise) {
        try {
            jsReady = true
            Log.i(TAG, "JavaScript marked as ready")

            // Emitir evento para notificar a otros componentes
            sendEvent(EVENT_JS_READY, null)

            // Entregar el play pendiente de un cold-start (PLAYER-280): si el coche pidió
            // reproducir antes de que JS estuviera listo, VideoLibraryCallback lo dejó encolado.
            consumePendingCarPlay()?.let { queued ->
                Log.i(TAG, "JS ready — delivering queued car play request: $queued")
                sendEvent(
                    EVENT_PLAY_FROM_MEDIA_ID,
                    Arguments.createMap().apply { putString("mediaId", queued) }
                )
            }

            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set JavaScript ready", e)
            promise.reject("SET_READY_FAILED", "Failed to set JavaScript ready: ${e.message}", e)
        }
    }

    /**
     * Configurar el intervalo del seek RELATIVO (PLAYER-271)
     *
     * Paso en ms de los botones ±seek de la notificación / comandos custom de sesión.
     * El scrubbing absoluto (barra de progreso del coche/widget) no usa este valor:
     * va directo a player.seekTo. Se clampa a un mínimo de 1000 ms en el service.
     */
    @ReactMethod
    fun setSeekIntervalMs(intervalMs: Double, promise: Promise) {
        try {
            VideoPlaybackService.seekIntervalMs = intervalMs.toLong()
            Log.i(TAG, "Seek interval set to ${VideoPlaybackService.seekIntervalMs} ms")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set seek interval", e)
            promise.reject("SET_SEEK_INTERVAL_FAILED", "Failed to set seek interval: ${e.message}", e)
        }
    }

    /**
     * Marcar JavaScript como no listo
     *
     * Llamado cuando los componentes de React se desmontan.
     * Indica que los callbacks ya no están disponibles.
     */
    @ReactMethod
    fun setJavaScriptNotReady(promise: Promise) {
        try {
            jsReady = false
            Log.i(TAG, "JavaScript marked as NOT ready")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set JavaScript not ready", e)
            promise.reject("SET_NOT_READY_FAILED", "Failed to set JavaScript not ready: ${e.message}", e)
        }
    }

    /**
     * Traer la app al frente
     *
     * Lanza la MainActivity para traer la app al frente desde background.
     */
    @ReactMethod
    fun bringAppToForeground(promise: Promise) {
        try {
            val packageManager = reactContext.packageManager
            val launchIntent = packageManager.getLaunchIntentForPackage(reactContext.packageName)

            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)

                reactContext.startActivity(launchIntent)
                Log.i(TAG, "App brought to foreground")
                promise.resolve(true)
            } else {
                Log.e(TAG, "Could not get launch intent")
                promise.reject("NO_INTENT", "Could not get launch intent")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to bring app to foreground", e)
            promise.reject("BRING_TO_FRONT_FAILED", "Failed to bring app to foreground: ${e.message}", e)
        }
    }

    /**
     * Reproducir media usando el player global
     *
     * Inicia reproducción en background con notificación.
     * Útil para Android Auto cuando la app está cerrada.
     *
     * @param uri URI del media a reproducir
     * @param title Título del media
     * @param artist Artista/autor
     * @param artworkUri URI de la imagen
     */
    @ReactMethod
    fun playMediaInBackground(uri: String, title: String?, artist: String?, artworkUri: String?, promise: Promise) {
        try {
            Log.i(TAG, "Playing media in background: $uri")

            GlobalPlayerManager.playMedia(
                context = reactContext,
                uri = uri,
                title = title,
                artist = artist,
                artworkUri = artworkUri
            )

            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play media in background", e)
            promise.reject("PLAY_FAILED", "Failed to play media: ${e.message}", e)
        }
    }

    /**
     * Actualizar metadata del contenido actual en Android Auto
     * Se llama desde React Native cuando se reproduce contenido desde la app
     */
    @ReactMethod
    fun updateNowPlayingMetadata(metadata: ReadableMap) {
        try {
            val title = metadata.getString("title")
            val artist = metadata.getString("artist")
            val artworkUri = metadata.getString("artworkUri")

            Log.i(TAG, "Updating Now Playing metadata: $title - $artist")

            GlobalPlayerManager.updateMetadata(title, artist, artworkUri)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update Now Playing metadata", e)
        }
    }

    /**
     * Verificar si Android Auto está conectado
     */
    @ReactMethod
    fun isAndroidAutoConnected(promise: Promise) {
        try {
            val isConnected = VideoPlaybackService.liveInstance != null

            promise.resolve(isConnected)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check Android Auto connection", e)
            promise.resolve(false)
        }
    }

    /**
     * PLAYER-316: TRUE car-connection check for the app's "don't open video while connected to a car"
     * gate — the Android analog of iOS CarPlay's carPlayConnected. Unlike [isAndroidAutoConnected]
     * (which is just "media service alive" and is true for any background phone playback) this reflects
     * the live projection / AAOS state from gearhead's CarConnection provider via [CarProjectionStatus].
     * Non-blocking (cached snapshot + async refresh), so it is safe to await from JS on every read.
     */
    @ReactMethod
    fun isCarConnected(promise: Promise) {
        try {
            promise.resolve(CarProjectionStatus.isProjectionActive(reactContext))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check car connection", e)
            promise.resolve(false)
        }
    }

    // ========================================================================
    // Métodos Helper Internos
    // ========================================================================

    /**
     * Verificar si la app está activa (en foreground)
     * Usado por MediaBrowserService para detectar estado de app
     */
    fun isAppActive(): Boolean {
        return try {
            val activityManager = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            val appProcesses = activityManager?.runningAppProcesses ?: return false

            appProcesses.any {
                it.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND &&
                    it.processName == reactContext.packageName
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking if app is active", e)
            false
        }
    }

    /**
     * Enviar evento a JavaScript
     *
     * @param eventName Nombre del evento
     * @param params Parámetros del evento (puede ser null)
     */
    fun sendEvent(eventName: String, params: WritableMap?) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)

            Log.d(TAG, "Event sent to JS: $eventName")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send event to JS: $eventName", e)
        }
    }

    /**
     * Parsear MediaItems desde ReadableArray
     *
     * Convierte el array de JavaScript a lista de MediaItem de Media3.
     *
     * @param array ReadableArray con items de JavaScript
     * @return Lista de MediaItem
     */
    private fun parseMediaItems(array: ReadableArray): List<MediaItem> {
        val items = mutableListOf<MediaItem>()

        for (i in 0 until array.size()) {
            try {
                val map = array.getMap(i) ?: continue
                buildMediaItem(map)?.let { items.add(it) }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse item at index $i", e)
            }
        }

        Log.d(TAG, "Parsed ${items.size} media items from ${array.size()} input items")
        return items
    }

    /**
     * Build a single Media3 [MediaItem] from a JS map. Shared by [parseMediaItems] (flat) and the
     * parentId-grouping pass in [setMediaLibrary], so the item-build logic lives in one place.
     * The per-item `parentId` is intentionally NOT encoded here — the caller reads it to decide
     * which MediaCache parent bucket the item belongs to.
     */
    private fun buildMediaItem(map: ReadableMap): MediaItem? {
        // ID es requerido
        val id = map.getString("id")
        if (id.isNullOrEmpty()) {
            Log.w(TAG, "Skipping item: missing id")
            return null
        }

        // Read GUAU content-style extras (PLAYER-267 / PLAYER-273 deferral).
        val extrasMap = map.getMap("extras")
        val styleExtras = mutableMapOf<String, String?>()
        if (extrasMap != null) {
            val it = extrasMap.keySetIterator()
            while (it.hasNextKey()) {
                val k = it.nextKey()
                // GUAU sends content-style values as strings ("1"/"2") and groupTitle as a string.
                styleExtras[k] = try {
                    extrasMap.getString(k)
                } catch (_: Exception) {
                    null
                }
            }
        }
        val contentStyleBundle = ContentStyle.toBundle(styleExtras)

        // Construir MediaItem
        val itemBuilder = MediaItem.Builder()
            .setMediaId(id)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(map.getString("title"))
                    .setSubtitle(map.getString("subtitle"))
                    .setArtist(map.getString("artist"))
                    .setAlbumTitle(map.getString("album"))
                    .setArtworkUri(
                        map.getString("artworkUri")?.let { Uri.parse(it) }
                    )
                    .setIsBrowsable(
                        if (map.hasKey("browsable")) map.getBoolean("browsable") else false
                    )
                    .setIsPlayable(
                        if (map.hasKey("playable")) map.getBoolean("playable") else false
                    )
                    .setExtras(contentStyleBundle) // PLAYER-267: content-style -> media3 -> Auto
                    .build()
            )

        // Añadir URI si está presente (necesario para reproducción)
        val uri = map.getString("uri")
        if (!uri.isNullOrEmpty()) {
            itemBuilder.setUri(uri)
        }

        return itemBuilder.build()
    }

    // ========================================================================
    // Métodos Públicos para MediaBrowserService
    // ========================================================================

    /**
     * Verificar si Android Auto está habilitado
     * Usado por MediaBrowserService para verificar estado
     */
    fun isAndroidAutoEnabled(): Boolean = isEnabled

    /**
     * Verificar si JavaScript está listo
     * Usado por MediaBrowserService para saber si puede enviar eventos
     */
    fun isJavaScriptReady(): Boolean = jsReady

    /**
     * Obtener instancia de MediaCache
     * Usado por MediaBrowserService para acceder al caché
     */
    fun getMediaCache(): MediaCache {
        if (mediaCache == null) {
            // getInstance() auto-inicializa el caché desde disco
            mediaCache = MediaCache.getInstance(reactContext)
        }
        return mediaCache!!
    }

    /**
     * Notificar al servicio que el contenido cambió
     *
     * Esto hace que Android Auto actualice su vista.
     *
     * @param parentId ID del nodo que cambió
     */
    private fun notifyContentChanged(parentId: String) {
        try {
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                VideoPlaybackService.liveInstance?.notifyChildrenChanged(parentId)
                Log.d(TAG, "Notified VideoPlaybackService of content change: $parentId")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to notify content change", e)
        }
    }

    override fun initialize() {
        super.initialize()
        instance = this
        // PLAYER-316: bridge live car projection state to JS (androidAutoConnected/androidAutoDisconnected)
        // so the app can block video the way iOS blocks on CarPlay. warmUp() registers the CarConnection
        // broadcast/observer up-front so transitions reach JS even while the app is in the foreground, and
        // so the first isCarConnected() seed is accurate instead of the conservative cold-read default.
        CarProjectionStatus.onProjectionChanged = { active ->
            sendEvent(if (active) EVENT_CONNECTED else EVENT_DISCONNECTED, null)
        }
        CarProjectionStatus.warmUp(reactContext)
        Log.d(TAG, "AndroidAutoModule initialized")
    }

    override fun invalidate() {
        super.invalidate()
        isEnabled = false
        jsReady = false
        CarProjectionStatus.onProjectionChanged = null
        instance = null
        Log.d(TAG, "AndroidAutoModule invalidated")
    }
}
