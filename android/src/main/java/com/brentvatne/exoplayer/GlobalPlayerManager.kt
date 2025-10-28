package com.brentvatne.exoplayer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import com.brentvatne.react.R

/**
 * Gestor global de player para Android Auto
 * 
 * Mantiene una instancia única de ExoPlayer que puede ser compartida entre:
 * - Android Auto (headless)
 * - Componente Video de React Native (con UI)
 * 
 * Esto asegura que la reproducción sea consistente y sincronizada.
 */
object GlobalPlayerManager {
    private const val TAG = "GlobalPlayerManager"
    private const val NOTIFICATION_ID = 1001
    private const val CHANNEL_ID = "android_auto_playback"
    
    private var globalPlayer: ExoPlayer? = null
    private var mediaSession: MediaSession? = null
    private var currentContext: Context? = null
    private var isNotificationShown = false
    
    /**
     * Obtener o crear el player global
     */
    fun getOrCreatePlayer(context: Context): ExoPlayer {
        if (globalPlayer == null) {
            Log.i(TAG, "Creating new global ExoPlayer instance")
            
            // Configurar audio attributes para Android Auto
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .setUsage(C.USAGE_MEDIA)
                .build()
            
            globalPlayer = ExoPlayer.Builder(context.applicationContext)
                .setAudioAttributes(audioAttributes, true) // true = handle audio focus
                .build()
            
            currentContext = context.applicationContext
            Log.i(TAG, "ExoPlayer created with audio focus handling")
        }
        return globalPlayer!!
    }
    
    /**
     * Obtener el player actual (si existe)
     */
    fun getPlayer(): ExoPlayer? = globalPlayer
    
    /**
     * Reproducir un media item
     * 
     * @param context Contexto de la aplicación
     * @param uri URI del media a reproducir
     * @param title Título del media
     * @param artist Artista/autor
     * @param artworkUri URI de la imagen
     */
    fun playMedia(
        context: Context,
        uri: String,
        title: String? = null,
        artist: String? = null,
        artworkUri: String? = null
    ) {
        Log.i(TAG, "Playing media: $uri")
        
        // Ejecutar en main thread (ExoPlayer requirement)
        Handler(Looper.getMainLooper()).post {
            try {
                val player = getOrCreatePlayer(context)
                
                // Crear MediaItem con metadata
                val mediaMetadata = MediaMetadata.Builder()
                    .setTitle(title)
                    .setArtist(artist)
                    .setArtworkUri(artworkUri?.let { android.net.Uri.parse(it) })
                    .build()
                
                val mediaItem = MediaItem.Builder()
                    .setUri(uri)
                    .setMediaMetadata(mediaMetadata)
                    .build()
                
                // Configurar y reproducir
                player.setMediaItem(mediaItem)
                player.prepare()
                player.playWhenReady = true
                
                Log.i(TAG, "Media playback started successfully")
                
                // Registrar con VideoPlaybackService si no está registrado
                if (!isNotificationShown) {
                    registerWithPlaybackService(context)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to play media on main thread", e)
            }
        }
    }
    
    /**
     * Registrar player con VideoPlaybackService
     */
    private fun registerWithPlaybackService(context: Context) {
        try {
            val player = globalPlayer ?: return
            
            Log.i(TAG, "Registering with VideoPlaybackService")
            
            // Iniciar el servicio
            val serviceIntent = Intent(context, VideoPlaybackService::class.java)
            context.startService(serviceIntent)
            
            // Bind al servicio
            val connection = object : android.content.ServiceConnection {
                override fun onServiceConnected(name: android.content.ComponentName?, binder: android.os.IBinder?) {
                    try {
                        val serviceBinder = binder as? PlaybackServiceBinder
                        val service = serviceBinder?.service
                        
                        if (service != null && player != null) {
                            // Registrar player para background (sin Activity)
                            service.registerPlayerForBackground(player)
                            Log.i(TAG, "Player registered with VideoPlaybackService")
                        }
                        
                        // Unbind después de registrar
                        context.unbindService(this)
                    } catch (e: Exception) {
                        Log.e(TAG, "Error registering player", e)
                    }
                }
                
                override fun onServiceDisconnected(name: android.content.ComponentName?) {
                    Log.d(TAG, "Service disconnected")
                }
            }
            
            context.bindService(serviceIntent, connection, Context.BIND_AUTO_CREATE)
            isNotificationShown = true
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register with service", e)
        }
    }
    
    /**
     * Pausar reproducción
     */
    fun pause() {
        globalPlayer?.pause()
    }
    
    /**
     * Reanudar reproducción
     */
    fun play() {
        globalPlayer?.play()
    }
    
    /**
     * Actualizar metadata del contenido actual
     * Útil cuando se reproduce desde la app y queremos actualizar Android Auto
     */
    fun updateMetadata(title: String?, artist: String?, artworkUri: String?) {
        Handler(Looper.getMainLooper()).post {
            try {
                val player = globalPlayer ?: return@post
                
                // Actualizar metadata del MediaItem actual
                val currentItem = player.currentMediaItem
                if (currentItem != null) {
                    val updatedMetadata = currentItem.mediaMetadata.buildUpon()
                        .setTitle(title)
                        .setArtist(artist)
                        .setArtworkUri(artworkUri?.let { android.net.Uri.parse(it) })
                        .build()
                    
                    val updatedItem = currentItem.buildUpon()
                        .setMediaMetadata(updatedMetadata)
                        .build()
                    
                    // Reemplazar item actual con metadata actualizada
                    player.replaceMediaItem(player.currentMediaItemIndex, updatedItem)
                    
                    Log.i(TAG, "Metadata updated: $title - $artist")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to update metadata", e)
            }
        }
    }
    
    /**
     * Verificar si el player está reproduciendo
     */
    fun isPlaying(): Boolean {
        return globalPlayer?.isPlaying ?: false
    }
    
    /**
     * Detener y liberar el player
     */
    fun release() {
        Log.i(TAG, "Releasing global player")
        
        // Ocultar notificación
        if (isNotificationShown && currentContext != null) {
            val notificationManager = currentContext!!.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(NOTIFICATION_ID)
            isNotificationShown = false
        }
        
        // Liberar MediaSession
        mediaSession?.release()
        mediaSession = null
        
        // Liberar player
        globalPlayer?.release()
        globalPlayer = null
    }
}
