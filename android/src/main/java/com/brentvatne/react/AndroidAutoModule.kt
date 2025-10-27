package com.brentvatne.react

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
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
class AndroidAutoModule(private val reactContext: ReactApplicationContext) 
    : ReactContextBaseJavaModule(reactContext) {
    
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
        
        // Singleton instance
        @Volatile
        private var instance: AndroidAutoModule? = null
        
        /**
         * Obtener instancia del módulo desde contexto estático
         * Usado por MediaBrowserService para acceder al módulo
         */
        fun getInstance(context: ReactApplicationContext): AndroidAutoModule {
            return instance ?: synchronized(this) {
                instance ?: AndroidAutoModule(context).also { instance = it }
            }
        }
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
            if (mediaCache == null) {
                mediaCache = MediaCache.getInstance(reactContext)
            }
            mediaCache?.initialize()
            Log.d(TAG, "MediaCache initialized")
            
            // Iniciar MediaBrowserService
            val intent = Intent(reactContext, com.brentvatne.exoplayer.androidauto.AndroidAutoMediaBrowserService::class.java)
            reactContext.startService(intent)
            Log.d(TAG, "MediaBrowserService started")
            
            // Inyectar instancia del módulo en el servicio
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                val service = com.brentvatne.exoplayer.androidauto.AndroidAutoMediaBrowserService.getInstance()
                service?.setAndroidAutoModule(this)
                Log.d(TAG, "Module instance injected into service")
            }, 500)
            
            isEnabled = true
            jsReady = true
            
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
            
            // Detener MediaBrowserService
            val intent = Intent(reactContext, com.brentvatne.exoplayer.androidauto.AndroidAutoMediaBrowserService::class.java)
            reactContext.stopService(intent)
            Log.d(TAG, "MediaBrowserService stopped")
            
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
            
            // Parsear y guardar en MediaCache
            val mediaItems = parseMediaItems(items)
            mediaCache?.updateChildren("root", mediaItems)
            
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
            
            // TODO FASE 6: Actualizar MediaSession
            // La MediaSession existente en VideoPlaybackService se actualizará
            // automáticamente cuando cambie el contenido en el reproductor.
            // Este método es principalmente para actualizaciones manuales.
            
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
            val status = Arguments.createMap().apply {
                putBoolean("enabled", isEnabled)
                putBoolean("connected", false) // TODO FASE 6: Verificar conexión real
                putBoolean("appActive", isAppActive())
                putBoolean("jsReady", jsReady)
            }
            
            Log.d(TAG, "Connection status: enabled=$isEnabled, appActive=${isAppActive()}, jsReady=$jsReady")
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
            
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set JavaScript ready", e)
            promise.reject("SET_READY_FAILED", "Failed to set JavaScript ready: ${e.message}", e)
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
                it.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND 
                && it.processName == reactContext.packageName 
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
                
                // ID es requerido
                val id = map.getString("id")
                if (id.isNullOrEmpty()) {
                    Log.w(TAG, "Skipping item at index $i: missing id")
                    continue
                }
                
                // Construir MediaItem
                val item = MediaItem.Builder()
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
                            .build()
                    )
                    .build()
                
                items.add(item)
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse item at index $i", e)
            }
        }
        
        Log.d(TAG, "Parsed ${items.size} media items from ${array.size()} input items")
        return items
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
            mediaCache = MediaCache.getInstance(reactContext)
            mediaCache?.initialize()
        }
        return mediaCache!!
    }
    
    override fun initialize() {
        super.initialize()
        instance = this
        Log.d(TAG, "AndroidAutoModule initialized")
    }
    
    override fun invalidate() {
        super.invalidate()
        isEnabled = false
        jsReady = false
        instance = null
        Log.d(TAG, "AndroidAutoModule invalidated")
    }
}
