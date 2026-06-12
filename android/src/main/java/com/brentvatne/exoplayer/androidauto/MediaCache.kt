package com.brentvatne.exoplayer.androidauto

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.util.concurrent.ConcurrentHashMap

/**
 * MediaCache - Sistema de caché para biblioteca de medios
 *
 * Almacena la biblioteca de medios en SharedPreferences para:
 * - Respuesta instantánea cuando Android Auto solicita contenido
 * - Disponibilidad con app cerrada
 * - Persistencia entre reinicios
 *
 * Usa memoria + disco para máximo rendimiento:
 * - Memoria (ConcurrentHashMap): Acceso rápido
 * - Disco (SharedPreferences): Persistencia
 */
class MediaCache private constructor(private val context: Context) {

    companion object {
        private const val TAG = "MediaCache"
        private const val PREFS_NAME = "android_auto_media_cache"
        private const val CACHE_KEY = "media_library"
        private const val ROOT_ID = "root"

        // PLAYER-286: last-played persistence keys for playback resumption.
        private const val KEY_LAST_PLAYED_MEDIA_ID = "last_played_media_id"
        private const val KEY_LAST_PLAYED_POSITION_MS = "last_played_position_ms"

        @Volatile
        private var instance: MediaCache? = null

        /**
         * Obtener instancia singleton
         *
         * IMPORTANTE: Inicializa automáticamente el caché desde disco
         * para que el servicio headless tenga contenido disponible inmediatamente.
         */
        fun getInstance(context: Context): MediaCache =
            instance ?: synchronized(this) {
                instance ?: MediaCache(context.applicationContext).also {
                    instance = it
                    // Inicializar automáticamente al crear la instancia
                    it.initialize()
                    Log.i(TAG, "MediaCache instance created and auto-initialized")
                }
            }
    }

    // SharedPreferences para persistencia
    private val prefs: SharedPreferences by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    // Gson para serialización
    private val gson = Gson()

    // Caché en memoria para acceso rápido
    // Estructura: parentId -> List<CachedMediaItem>
    private val memoryCache = ConcurrentHashMap<String, List<CachedMediaItem>>()

    // Flag de inicialización
    private var initialized = false

    /**
     * Inicializar caché
     * Carga datos desde disco a memoria
     *
     * NOTA: La inicialización se ejecuta automáticamente en getInstance()
     * para que el servicio headless tenga contenido disponible inmediatamente.
     * Este método es público para permitir reinicialización manual si es necesario.
     */
    fun initialize() {
        if (initialized) {
            Log.d(TAG, "Already initialized")
            return
        }

        try {
            loadCacheFromDisk()
            initialized = true
            Log.i(TAG, "MediaCache initialized with ${memoryCache.size} parent nodes")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize MediaCache", e)
        }
    }

    /**
     * Obtener hijos de un nodo padre
     *
     * @param parentId ID del padre ("root" para raíz)
     * @return Lista de MediaItems hijos
     */
    fun getChildren(parentId: String): List<MediaItem> {
        val cached = memoryCache[parentId] ?: emptyList()
        Log.d(TAG, "getChildren($parentId): ${cached.size} items")
        return cached.map { it.toMediaItem() }
    }

    /**
     * Obtener un item cacheado específico por su mediaId
     *
     * @param mediaId ID del media
     * @return CachedMediaItem o null si no existe
     */
    fun getCachedItem(mediaId: String): CachedMediaItem? {
        // Buscar en todos los nodos padre
        for (children in memoryCache.values) {
            val item = children.find { it.mediaId == mediaId }
            if (item != null) {
                Log.d(TAG, "getCachedItem($mediaId): found")
                return item
            }
        }
        Log.w(TAG, "getCachedItem($mediaId): not found")
        return null
    }

    /**
     * Actualizar hijos de un nodo padre
     *
     * Guarda en memoria y persiste en disco.
     *
     * @param parentId ID del padre
     * @param items Lista de MediaItems
     */
    fun updateChildren(parentId: String, items: List<MediaItem>) {
        try {
            val cachedItems = items.map { CachedMediaItem.fromMediaItem(it) }
            memoryCache[parentId] = cachedItems
            saveCacheToDisk()

            Log.i(TAG, "updateChildren($parentId): ${items.size} items cached")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update children for $parentId", e)
        }
    }

    /**
     * Obtener un item específico por ID
     *
     * Busca en todos los nodos del caché.
     *
     * @param mediaId ID del media
     * @return MediaItem o null si no se encuentra
     */
    fun getItem(mediaId: String): MediaItem? {
        for ((_, items) in memoryCache) {
            val item = items.find { it.mediaId == mediaId }
            if (item != null) {
                Log.d(TAG, "getItem($mediaId): Found")
                return item.toMediaItem()
            }
        }

        Log.d(TAG, "getItem($mediaId): Not found")
        return null
    }

    /**
     * Verificar si existe un item
     *
     * @param mediaId ID del media
     * @return true si existe
     */
    fun hasItem(mediaId: String): Boolean {
        for ((_, items) in memoryCache) {
            if (items.any { it.mediaId == mediaId }) {
                return true
            }
        }
        return false
    }

    /**
     * Verificar si el caché tiene contenido
     *
     * @return true si hay al menos un nodo con items
     */
    fun hasContent(): Boolean = memoryCache.isNotEmpty()

    /**
     * Buscar items por query
     *
     * Busca en títulos, subtítulos y artistas.
     *
     * @param query Texto de búsqueda
     * @return Lista de MediaItems que coinciden
     */
    fun search(query: String): List<MediaItem> {
        val lowerQuery = query.lowercase()
        val results = mutableListOf<MediaItem>()

        for ((_, items) in memoryCache) {
            for (item in items) {
                val matchesTitle = item.title?.lowercase()?.contains(lowerQuery) == true
                val matchesSubtitle = item.subtitle?.lowercase()?.contains(lowerQuery) == true
                val matchesArtist = item.artist?.lowercase()?.contains(lowerQuery) == true

                if (matchesTitle || matchesSubtitle || matchesArtist) {
                    results.add(item.toMediaItem())
                }
            }
        }

        Log.d(TAG, "search('$query'): ${results.size} results")
        return results
    }

    /**
     * Obtener todos los items reproducibles
     *
     * @return Lista de todos los items marcados como playable
     */
    fun getAllPlayableItems(): List<MediaItem> {
        val results = mutableListOf<MediaItem>()

        for ((_, items) in memoryCache) {
            results.addAll(items.filter { it.isPlayable }.map { it.toMediaItem() })
        }

        Log.d(TAG, "getAllPlayableItems(): ${results.size} items")
        return results
    }

    /**
     * PLAYER-286 (G3): persist the last-played mediaId + position so [onPlaybackResumption]
     * in [VideoLibraryCallback] can reconstruct a session for System UI / BT resume after
     * process death or reboot.
     *
     * Called from AndroidAutoModule.saveLastPlayed (@ReactMethod) which GUAU invokes on
     * ITEM_STARTED events.
     *
     * @param mediaId The mediaId that started playing.
     * @param positionMs The last known playback position in milliseconds.
     */
    fun saveLastPlayed(mediaId: String, positionMs: Long) {
        try {
            prefs.edit()
                .putString(KEY_LAST_PLAYED_MEDIA_ID, mediaId)
                .putLong(KEY_LAST_PLAYED_POSITION_MS, positionMs)
                .apply()
            Log.d(TAG, "saveLastPlayed: mediaId=$mediaId positionMs=$positionMs")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save last played", e)
        }
    }

    /**
     * PLAYER-286: retrieve the last-played mediaId (null if none recorded).
     */
    fun loadLastPlayedMediaId(): String? =
        try {
            prefs.getString(KEY_LAST_PLAYED_MEDIA_ID, null)
        } catch (e: Exception) {
            Log.e(TAG, "loadLastPlayedMediaId failed", e)
            null
        }

    /**
     * PLAYER-286: retrieve the last-played position in ms (0 if none recorded).
     */
    fun loadLastPlayedPositionMs(): Long =
        try {
            prefs.getLong(KEY_LAST_PLAYED_POSITION_MS, 0L)
        } catch (e: Exception) {
            Log.e(TAG, "loadLastPlayedPositionMs failed", e)
            0L
        }

    /**
     * Limpiar caché completo
     *
     * Elimina datos de memoria y disco.
     */
    fun clear() {
        try {
            memoryCache.clear()
            prefs.edit().clear().apply()
            Log.i(TAG, "Cache cleared")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clear cache", e)
        }
    }

    /**
     * Obtener estadísticas del caché
     *
     * @return Mapa con estadísticas
     */
    fun getStats(): Map<String, Any> {
        var totalItems = 0
        var playableItems = 0
        var browsableItems = 0

        for ((_, items) in memoryCache) {
            totalItems += items.size
            playableItems += items.count { it.isPlayable }
            browsableItems += items.count { it.isBrowsable }
        }

        return mapOf(
            "parentNodes" to memoryCache.size,
            "totalItems" to totalItems,
            "playableItems" to playableItems,
            "browsableItems" to browsableItems,
            "initialized" to initialized
        )
    }

    // ========================================================================
    // Métodos Privados - Persistencia
    // ========================================================================

    /**
     * Cargar caché desde disco
     */
    private fun loadCacheFromDisk() {
        try {
            val json = prefs.getString(CACHE_KEY, null)

            if (json.isNullOrEmpty()) {
                Log.d(TAG, "No cache data on disk")
                return
            }

            val type = object : TypeToken<Map<String, List<CachedMediaItem>>>() {}.type
            val diskCache: Map<String, List<CachedMediaItem>> = gson.fromJson(json, type)

            memoryCache.clear()
            memoryCache.putAll(diskCache)

            Log.i(TAG, "Loaded ${memoryCache.size} parent nodes from disk")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load cache from disk", e)
        }
    }

    /**
     * Guardar caché a disco
     */
    private fun saveCacheToDisk() {
        try {
            val json = gson.toJson(memoryCache)
            prefs.edit().putString(CACHE_KEY, json).apply()

            Log.d(TAG, "Cache saved to disk")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save cache to disk", e)
        }
    }

    // ========================================================================
    // Clase Interna - CachedMediaItem
    // ========================================================================

    /**
     * Representación serializable de MediaItem
     *
     * MediaItem de Media3 no es directamente serializable,
     * por lo que usamos esta clase intermedia.
     */
    data class CachedMediaItem(
        val mediaId: String,
        val title: String?,
        val subtitle: String?,
        val artist: String?,
        val album: String?,
        val artworkUri: String?,
        val mediaUri: String?, // URI del media para reproducción
        val isBrowsable: Boolean,
        val isPlayable: Boolean,
        val parentId: String?,
        // PLAYER-267: content-style hints (media3 bundle int keys) + group title, persisted across the
        // Gson disk round-trip so headless browse keeps GUAU's GRID/LIST/grouping intent.
        val contentStyleHints: Map<String, Int> = emptyMap(),
        val groupTitle: String? = null
    ) {
        /**
         * Convertir a MediaItem de Media3
         */
        fun toMediaItem(): MediaItem {
            val extras = android.os.Bundle()
            for ((k, v) in contentStyleHints) extras.putInt(k, v)
            groupTitle?.let {
                extras.putString(
                    androidx.media.utils.MediaConstants.DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_GROUP_TITLE,
                    it
                )
            }
            return MediaItem.Builder()
                .setMediaId(mediaId)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(title)
                        .setSubtitle(subtitle)
                        .setArtist(artist)
                        .setAlbumTitle(album)
                        .setArtworkUri(artworkUri?.let { Uri.parse(it) })
                        .setIsBrowsable(isBrowsable)
                        .setIsPlayable(isPlayable)
                        .setExtras(extras) // PLAYER-267
                        .build()
                )
                .build()
        }

        companion object {
            /**
             * Crear desde MediaItem de Media3
             */
            fun fromMediaItem(item: MediaItem): CachedMediaItem {
                val md = item.mediaMetadata
                val srcExtras = md.extras
                val hints = mutableMapOf<String, Int>()
                var group: String? = null
                if (srcExtras != null) {
                    for (key in listOf(
                        androidx.media.utils.MediaConstants.DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_SINGLE_ITEM,
                        androidx.media.utils.MediaConstants.DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_BROWSABLE,
                        androidx.media.utils.MediaConstants.DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_PLAYABLE
                    )) {
                        if (srcExtras.containsKey(key)) hints[key] = srcExtras.getInt(key)
                    }
                    group = srcExtras.getString(androidx.media.utils.MediaConstants.DESCRIPTION_EXTRAS_KEY_CONTENT_STYLE_GROUP_TITLE)
                }
                return CachedMediaItem(
                    mediaId = item.mediaId,
                    title = md.title?.toString(),
                    subtitle = md.subtitle?.toString(),
                    artist = md.artist?.toString(),
                    album = md.albumTitle?.toString(),
                    artworkUri = md.artworkUri?.toString(),
                    mediaUri = item.localConfiguration?.uri?.toString(), // URI del media
                    isBrowsable = md.isBrowsable ?: false,
                    isPlayable = md.isPlayable ?: false,
                    parentId = null, // Se infiere del parentId en updateChildren
                    contentStyleHints = hints,
                    groupTitle = group
                )
            }
        }
    }
}
