package com.brentvatne.exoplayer

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession

/**
 * GlobalPlayerManager — PLAYER-269 Phase 3: folded onto CanonicalPlayerHolder.
 *
 * With [CanonicalPlayerHolder.reconcileEnabled] = false (default kill-switch):
 *   Behaviour is identical to pre-269: a local [globalPlayer] field; a 2nd ExoPlayer may coexist
 *   (the known PLAYER-266 dual-player state the harness documents).
 *
 * With [CanonicalPlayerHolder.reconcileEnabled] = true:
 *   [getOrCreatePlayer] delegates entirely to [CanonicalPlayerHolder]; no second ExoPlayer is
 *   ever built here.  [release] does NOT release the canonical player (service-owned, inv. 2).
 *   The local [globalPlayer] field becomes a mirror of the canonical one.
 *
 * Invariant 1 (ADR Auto-001): at most one audio ExoPlayer at any instant.
 */
object GlobalPlayerManager {
    private const val TAG = "GlobalPlayerManager"
    private const val NOTIFICATION_ID = 1001

    private var globalPlayer: ExoPlayer? = null
    private var mediaSession: MediaSession? = null
    private var currentContext: Context? = null
    private var isNotificationShown = false

    /**
     * Obtener o crear el player global.
     *
     * PLAYER-269: when [CanonicalPlayerHolder.reconcileEnabled] is true, delegates to the holder
     * so there is exactly ONE audio ExoPlayer (inv. 1).  The factory-built fallback (cold car
     * start before PlaylistControlModule ran) uses handleAudioFocus=false — focus is owned by the
     * canonical listener (inv. 4).
     */
    fun getOrCreatePlayer(context: Context): ExoPlayer {
        if (CanonicalPlayerHolder.reconcileEnabled) {
            // Inv. 1: no 2nd ExoPlayer.  Return canonical; create bare fallback ONLY if nothing
            // exists yet (cold car start before the standalone path has run).
            val canonical = CanonicalPlayerHolder.getOrCreate(context) { ctx ->
                Log.i(TAG, "[reconcile] Creating canonical ExoPlayer via CanonicalPlayerHolder (cold-car fallback)")
                ExoPlayer.Builder(ctx.applicationContext).build().apply {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                            .setUsage(C.USAGE_MEDIA)
                            .build(),
                        false // sole-owner focus handled by canonical listener, not ExoPlayer-internal (inv. 4)
                    )
                }
            }
            globalPlayer = canonical
            currentContext = context.applicationContext
            return canonical
        }

        // Kill-switch OFF (default pre-269 behaviour):
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

            // PLAYER-265 S1: count live audio players
            PlayerInstanceTracker.register(globalPlayer!!)

            currentContext = context.applicationContext
            Log.i(TAG, "ExoPlayer created with audio focus handling")
        }
        return globalPlayer!!
    }

    /**
     * Obtener el player actual (si existe).
     * With reconcileEnabled=true returns the canonical holder's player.
     */
    fun getPlayer(): ExoPlayer? {
        return if (CanonicalPlayerHolder.reconcileEnabled) {
            CanonicalPlayerHolder.get()
        } else {
            globalPlayer
        }
    }

    /**
     * Reproducir un media item.
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
            // PLAYER-269: read from holder when reconciliation is active
            val player = if (CanonicalPlayerHolder.reconcileEnabled) {
                CanonicalPlayerHolder.get() ?: return
            } else {
                globalPlayer ?: return
            }

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

                        if (service != null) {
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
        getPlayer()?.pause()
    }

    /**
     * Reanudar reproducción
     */
    fun play() {
        getPlayer()?.play()
    }

    /**
     * Actualizar metadata del contenido actual
     * Útil cuando se reproduce desde la app y queremos actualizar Android Auto
     */
    fun updateMetadata(title: String?, artist: String?, artworkUri: String?) {
        Handler(Looper.getMainLooper()).post {
            try {
                val player = getPlayer() ?: return@post

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
        return getPlayer()?.isPlaying ?: false
    }

    /**
     * Detener y liberar el player.
     *
     * PLAYER-269 (inv. 2): with reconcileEnabled=true, the canonical player is owned by
     * VideoPlaybackService — do NOT release it here; only release the MediaSession and clear
     * the local mirror.
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

        if (CanonicalPlayerHolder.reconcileEnabled) {
            // Canonical player lifetime is owned by VideoPlaybackService (inv. 2).
            // Do NOT call globalPlayer?.release() — just drop the local mirror reference.
            Log.d(TAG, "[reconcile] Skipping player.release() — canonical player is service-owned (inv. 2)")
        } else {
            // Pre-269 behaviour: release the local player
            globalPlayer?.release()
        }
        globalPlayer = null
    }
}
