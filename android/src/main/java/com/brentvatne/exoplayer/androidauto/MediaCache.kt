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
        
        @Volatile
        private var instance: MediaCache? = null
        
        /**
         * Obtener instancia singleton
         */
        fun getInstance(context: Context): MediaCache {
            return instance ?: synchronized(this) {
                instance ?: MediaCache(context.applicationContext).also { 
                    instance = it 
                }
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
        val mediaItems = cached.map { it.toMediaItem() }
        
        Log.d(TAG, "getChildren($parentId): ${mediaItems.size} items")
        return mediaItems
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
        val isBrowsable: Boolean,
        val isPlayable: Boolean,
        val parentId: String?
    ) {
        /**
         * Convertir a MediaItem de Media3
         */
        fun toMediaItem(): MediaItem {
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
                        .build()
                )
                .build()
        }
        
        companion object {
            /**
             * Crear desde MediaItem de Media3
             */
            fun fromMediaItem(item: MediaItem): CachedMediaItem {
                return CachedMediaItem(
                    mediaId = item.mediaId,
                    title = item.mediaMetadata.title?.toString(),
                    subtitle = item.mediaMetadata.subtitle?.toString(),
                    artist = item.mediaMetadata.artist?.toString(),
                    album = item.mediaMetadata.albumTitle?.toString(),
                    artworkUri = item.mediaMetadata.artworkUri?.toString(),
                    isBrowsable = item.mediaMetadata.isBrowsable ?: false,
                    isPlayable = item.mediaMetadata.isPlayable ?: false,
                    parentId = null // Se infiere del parentId en updateChildren
                )
            }
        }
    }
}
