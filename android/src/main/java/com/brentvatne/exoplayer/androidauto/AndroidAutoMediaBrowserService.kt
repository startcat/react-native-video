package com.brentvatne.exoplayer.androidauto

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.brentvatne.react.AndroidAutoModule
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * AndroidAutoMediaBrowserService
 * 
 * Servicio que permite a Android Auto navegar y controlar la reproducción de medios.
 * 
 * Arquitectura:
 * - Usa MediaCache para responder instantáneamente con app cerrada
 * - Detecta si app está activa o cerrada
 * - Si app cerrada: abre app en background para reproducción
 * - Si app activa: envía eventos a JavaScript para coordinación
 * 
 * Flujos:
 * 1. Navegación: Android Auto solicita contenido → MediaCache responde
 * 2. Reproducción (app cerrada): Android Auto solicita play → Abre app → JS controla player
 * 3. Reproducción (app activa): Android Auto solicita play → Evento a JS → JS controla player
 */
class AndroidAutoMediaBrowserService : MediaLibraryService() {
    
    companion object {
        private const val TAG = "AndroidAutoMBS"
        private const val ROOT_ID = "root"
        private const val EMPTY_ROOT_ID = "empty_root"
        
        @Volatile
        private var instance: AndroidAutoMediaBrowserService? = null
        
        /**
         * Obtener instancia del servicio
         */
        fun getInstance(): AndroidAutoMediaBrowserService? = instance
    }
    
    private var mediaLibrarySession: MediaLibrarySession? = null
    private var androidAutoModule: AndroidAutoModule? = null
    private var mediaCache: MediaCache? = null
    private var appLaunchAttempted = false
    
    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.d(TAG, "Service created")
        
        try {
            // Workaround para ANR en Android 12+
            // Crear notificación vacía para evitar "Context.startForegroundService() did not call Service.startForeground()"
            startAndStopEmptyNotificationToAvoidANR()
            
            // Inicializar MediaCache
            mediaCache = MediaCache.getInstance(applicationContext)
            mediaCache?.initialize()
            
            // Crear MediaLibrarySession simple (sin player real)
            // El player real está en JavaScript/React Native
            mediaLibrarySession = MediaLibrarySession.Builder(this, createDummyPlayer(), MediaLibrarySessionCallback())
                .build()
            
            Log.i(TAG, "MediaBrowserService initialized successfully")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize service", e)
        }
    }
    
    /**
     * Workaround para evitar ANR en Android 12+
     * 
     * Android 12+ requiere que startForeground() se llame dentro de 5 segundos
     * después de startForegroundService(). Creamos una notificación vacía
     * y la detenemos inmediatamente para cumplir con este requisito.
     * 
     * Referencia: https://github.com/doublesymmetry/react-native-track-player/issues/1666
     */
    private fun startAndStopEmptyNotificationToAvoidANR() {
        try {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            // Crear canal de notificación en Android O+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    "android_auto_temp",
                    "Android Auto Temporary",
                    NotificationManager.IMPORTANCE_LOW
                )
                notificationManager.createNotificationChannel(channel)
            }
            
            // Crear notificación vacía
            val notificationBuilder = androidx.core.app.NotificationCompat.Builder(this, "android_auto_temp")
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_LOW)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setSmallIcon(android.R.drawable.ic_media_play)
            
            // Android 12+ requiere FOREGROUND_SERVICE_IMMEDIATE
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                notificationBuilder.foregroundServiceBehavior = 
                    androidx.core.app.NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE
            }
            
            val notification = notificationBuilder.build()
            startForeground(999, notification)
            
            // Detener inmediatamente
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
            
            Log.d(TAG, "Empty notification workaround completed")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start/stop empty notification", e)
        }
    }
    
    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? {
        Log.d(TAG, "onGetSession: ${controllerInfo.packageName}")
        return mediaLibrarySession
    }
    
    override fun onDestroy() {
        Log.d(TAG, "Service destroyed")
        mediaLibrarySession?.release()
        mediaLibrarySession = null
        androidAutoModule = null
        instance = null
        super.onDestroy()
    }
    
    // ========================================================================
    // MediaLibraryService Callback Implementation
    // ========================================================================
    
    /**
     * Callback extendido para manejar solicitudes de biblioteca
     */
    private inner class MediaLibrarySessionCallback : MediaLibrarySession.Callback {
        
        /**
         * Android Auto solicita conexión
         * 
         * Siempre aceptamos la conexión para que Android Auto vea la app.
         * Si no está habilitado, onGetLibraryRoot devolverá un root vacío.
         */
        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo
        ): MediaSession.ConnectionResult {
            Log.d(TAG, "onConnect: ${controller.packageName}")
            
            val isEnabled = getAndroidAutoModule()?.isAndroidAutoEnabled() ?: false
            
            if (isEnabled) {
                Log.i(TAG, "Android Auto enabled, accepting connection with content")
            } else {
                Log.w(TAG, "Android Auto not yet enabled, launching app in background...")
                launchAppInBackground()
            }
            
            return super.onConnect(session, controller)
        }
        
        /**
         * Android Auto solicita la raíz de navegación
         */
        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<MediaItem>> {
            Log.d(TAG, "onGetLibraryRoot")
            
            val isEnabled = getAndroidAutoModule()?.isAndroidAutoEnabled() ?: false
            
            return if (isEnabled) {
                val rootItem = MediaItem.Builder()
                    .setMediaId(ROOT_ID)
                    .setMediaMetadata(
                        androidx.media3.common.MediaMetadata.Builder()
                            .setIsBrowsable(true)
                            .setIsPlayable(false)
                            .build()
                    )
                    .build()
                
                Futures.immediateFuture(LibraryResult.ofItem(rootItem, params))
            } else {
                val emptyRoot = MediaItem.Builder()
                    .setMediaId(EMPTY_ROOT_ID)
                    .setMediaMetadata(
                        androidx.media3.common.MediaMetadata.Builder()
                            .setIsBrowsable(false)
                            .setIsPlayable(false)
                            .build()
                    )
                    .build()
                
                Futures.immediateFuture(LibraryResult.ofItem(emptyRoot, params))
            }
        }
        
        /**
         * Android Auto solicita items hijos de un nodo
         */
        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            Log.d(TAG, "onGetChildren: parentId=$parentId, page=$page, pageSize=$pageSize")
            
            try {
                val cache = getMediaCache()
                val children = cache?.getChildren(parentId) ?: emptyList()
                
                Log.i(TAG, "Returning ${children.size} children for $parentId")
                
                // Notificar a JavaScript si está listo
                notifyJavaScriptBrowseRequest(parentId)
                
                return Futures.immediateFuture(
                    LibraryResult.ofItemList(ImmutableList.copyOf(children), params)
                )
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get children for $parentId", e)
                return Futures.immediateFuture(
                    LibraryResult.ofError(LibraryResult.RESULT_ERROR_UNKNOWN)
                )
            }
        }
        
        /**
         * Android Auto solicita búsqueda
         */
        override fun onSearch(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<Void>> {
            Log.d(TAG, "onSearch: query=$query")
            
            try {
                val cache = getMediaCache()
                val results = cache?.search(query) ?: emptyList()
                
                Log.i(TAG, "Search '$query' returned ${results.size} results")
                
                // Notificar a JavaScript
                notifyJavaScriptSearchRequest(query)
                
                return Futures.immediateFuture(LibraryResult.ofVoid())
                
            } catch (e: Exception) {
                Log.e(TAG, "Search failed for query: $query", e)
                return Futures.immediateFuture(
                    LibraryResult.ofError(LibraryResult.RESULT_ERROR_UNKNOWN)
                )
            }
        }
        
        /**
         * Android Auto solicita agregar un item a la cola
         * 
         * En Media3, la reproducción se maneja a través de addMediaItems.
         * Cuando Android Auto quiere reproducir algo, lo agrega a la cola.
         */
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>
        ): ListenableFuture<MutableList<MediaItem>> {
            Log.i(TAG, "onAddMediaItems: ${mediaItems.size} items")
            
            try {
                // Procesar cada item
                mediaItems.forEach { mediaItem ->
                    val mediaId = mediaItem.mediaId
                    Log.d(TAG, "Processing mediaId: $mediaId")
                    
                    val module = getAndroidAutoModule()
                    if (module != null) {
                        // Verificar si app está activa
                        val isAppActive = module.isAppActive()
                        Log.d(TAG, "App active: $isAppActive")
                        
                        if (!isAppActive) {
                            // App cerrada: abrir en background
                            Log.i(TAG, "App not active, opening in background")
                            openAppInBackground()
                            
                            // Esperar un momento para que la app se inicialice
                            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                                notifyJavaScriptPlayRequest(mediaId)
                            }, 1000)
                        } else {
                            // App activa: enviar evento inmediatamente
                            Log.i(TAG, "App active, sending play event")
                            notifyJavaScriptPlayRequest(mediaId)
                        }
                    }
                }
                
                // Retornar los items para que Media3 los procese
                return Futures.immediateFuture(mediaItems)
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to add media items", e)
                return Futures.immediateFuture(mediaItems)
            }
        }
    }
    
    // ========================================================================
    // Métodos Helper
    // ========================================================================
    
    /**
     * Obtener instancia de AndroidAutoModule
     * 
     * Usa el singleton estático para acceder al módulo sin necesidad de contexto.
     */
    private fun getAndroidAutoModule(): AndroidAutoModule? {
        if (androidAutoModule == null) {
            try {
                // El módulo se registra automáticamente como singleton cuando React Native lo inicializa
                // Por ahora retornamos null si no está disponible
                Log.d(TAG, "AndroidAutoModule not yet initialized")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get AndroidAutoModule", e)
            }
        }
        return androidAutoModule
    }
    
    /**
     * Obtener instancia de MediaCache
     */
    private fun getMediaCache(): MediaCache? {
        if (mediaCache == null) {
            mediaCache = MediaCache.getInstance(applicationContext)
            mediaCache?.initialize()
        }
        return mediaCache
    }
    
    /**
     * Establecer instancia de AndroidAutoModule
     * 
     * Llamado por AndroidAutoModule cuando se inicializa.
     */
    fun setAndroidAutoModule(module: AndroidAutoModule) {
        androidAutoModule = module
        Log.d(TAG, "AndroidAutoModule instance set")
    }
    
    /**
     * Abrir la app en background si no está activa
     * 
     * Cuando Android Auto se conecta con la app cerrada, necesitamos
     * abrir la app para que JavaScript se inicialice y habilite Android Auto.
     */
    private fun launchAppInBackground() {
        if (appLaunchAttempted) {
            Log.d(TAG, "App launch already attempted")
            return
        }
        
        appLaunchAttempted = true
        
        try {
            val packageManager = applicationContext.packageManager
            val launchIntent = packageManager.getLaunchIntentForPackage(applicationContext.packageName)
            
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                
                Log.i(TAG, "Launching app in background...")
                applicationContext.startActivity(launchIntent)
                
                Log.i(TAG, "App launched successfully")
            } else {
                Log.e(TAG, "Could not get launch intent for app")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch app: ${e.message}", e)
        }
    }
    
    /**
     * Abrir app en background
     * 
     * Abre la actividad principal de la app sin traerla al frente.
     * Esto permite que JavaScript se inicialice y controle el player.
     */
    private fun openAppInBackground() {
        try {
            val packageName = applicationContext.packageName
            val intent = applicationContext.packageManager
                .getLaunchIntentForPackage(packageName)
            
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                // No usar FLAG_ACTIVITY_BROUGHT_TO_FRONT para mantener en background
                
                applicationContext.startActivity(intent)
                Log.i(TAG, "App opened in background")
            } else {
                Log.e(TAG, "Could not get launch intent for package: $packageName")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open app in background", e)
        }
    }
    
    /**
     * Notificar a JavaScript sobre solicitud de navegación
     */
    private fun notifyJavaScriptBrowseRequest(parentId: String) {
        try {
            val module = getAndroidAutoModule()
            if (module?.isJavaScriptReady() == true) {
                val params = Arguments.createMap().apply {
                    putString("parentId", parentId)
                }
                module.sendEvent(AndroidAutoModule.EVENT_BROWSE_REQUEST, params)
                Log.d(TAG, "Browse request event sent to JS: $parentId")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to notify JS about browse request", e)
        }
    }
    
    /**
     * Notificar a JavaScript sobre solicitud de reproducción
     */
    private fun notifyJavaScriptPlayRequest(mediaId: String) {
        try {
            val module = getAndroidAutoModule()
            if (module?.isJavaScriptReady() == true) {
                val params = Arguments.createMap().apply {
                    putString("mediaId", mediaId)
                }
                module.sendEvent(AndroidAutoModule.EVENT_PLAY_FROM_MEDIA_ID, params)
                Log.d(TAG, "Play request event sent to JS: $mediaId")
            } else {
                Log.w(TAG, "JavaScript not ready, cannot send play event")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to notify JS about play request", e)
        }
    }
    
    /**
     * Notificar a JavaScript sobre solicitud de búsqueda
     */
    private fun notifyJavaScriptSearchRequest(query: String) {
        try {
            val module = getAndroidAutoModule()
            if (module?.isJavaScriptReady() == true) {
                val params = Arguments.createMap().apply {
                    putString("query", query)
                }
                module.sendEvent(AndroidAutoModule.EVENT_SEARCH_REQUEST, params)
                Log.d(TAG, "Search request event sent to JS: $query")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to notify JS about search request", e)
        }
    }
    
    /**
     * Crear player dummy para MediaSession
     * 
     * Android Auto requiere un Player, pero el player real está en JavaScript.
     * Usamos ExoPlayer como placeholder.
     */
    private fun createDummyPlayer(): Player {
        return androidx.media3.exoplayer.ExoPlayer.Builder(this).build().apply {
            // Player vacío, solo para cumplir con la API
            playWhenReady = false
        }
    }
    
}
