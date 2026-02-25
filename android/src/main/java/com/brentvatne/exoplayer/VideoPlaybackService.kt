package com.brentvatne.exoplayer

import android.annotation.SuppressLint
import android.app.Activity
import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.MediaStyleNotificationHelper
import androidx.media3.session.SessionCommand
import com.brentvatne.common.toolbox.DebugLog
import okhttp3.internal.immutableListOf
import com.brentvatne.react.R
import android.content.pm.ServiceInfo

class PlaybackServiceBinder(val service: VideoPlaybackService) : Binder()

class VideoPlaybackService : MediaSessionService() {
    private var mediaSessionsList = mutableMapOf<ExoPlayer, MediaSession>()
    private var binder = PlaybackServiceBinder(this)
    private var sourceActivity: Class<Activity>? = null
    private var isForegroundServiceStarted = false

    // Controls for Android 13+ - see buildNotification function
    private val commandSeekForward = SessionCommand(COMMAND.SEEK_FORWARD.stringValue, Bundle.EMPTY)
    private val commandSeekBackward = SessionCommand(COMMAND.SEEK_BACKWARD.stringValue, Bundle.EMPTY)

    @SuppressLint("PrivateResource")
    private val seekForwardBtn = CommandButton.Builder()
        .setDisplayName("forward")
        .setSessionCommand(commandSeekForward)
        .setIconResId(R.drawable.ic_next)
        .build()

    @SuppressLint("PrivateResource")
    private val seekBackwardBtn = CommandButton.Builder()
        .setDisplayName("backward")
        .setSessionCommand(commandSeekBackward)
        .setIconResId(R.drawable.ic_prev)
        .build()

    // Método para verificar si la app está en primer plano
    private fun isAppInForeground(): Boolean {
        return try {
            val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager?
            if (activityManager == null) {
                Log.w(TAG, "ActivityManager is null, assuming app is not in foreground")
                return false
            }
            
            val appProcesses = activityManager.runningAppProcesses
            if (appProcesses == null) {
                Log.w(TAG, "Running app processes list is null, assuming app is not in foreground")
                return false
            }
            
            val packageName = packageName
            for (appProcess in appProcesses) {
                if (appProcess.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND 
                    && appProcess.processName == packageName) {
                    Log.d(TAG, "App is in foreground")
                    return true
                }
            }
            
            Log.d(TAG, "App is not in foreground")
            false
        } catch (e: Exception) {
            Log.e(TAG, "Error checking if app is in foreground: ${e.message}", e)
            false
        }
    }

    // Método seguro para iniciar foreground service
    private fun startForegroundServiceSafely(id: Int, notification: Notification): Boolean {
        return try {
            if (!isAppInForeground()) {
                Log.w(TAG, "Cannot start foreground service - app not in foreground")
                return false
            }
            
            startForeground(id, notification)
            isForegroundServiceStarted = true
            Log.d(TAG, "Foreground service started successfully")
            true
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException starting foreground service: ${e.message}", e)
            false
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error starting foreground service: ${e.message}", e)
            false
        }
    }

    // Player Registry

    fun registerPlayer(player: ExoPlayer, from: Class<Activity>) {
        if (mediaSessionsList.containsKey(player)) {
            return
        }
        sourceActivity = from

        val mediaSession = MediaSession.Builder(this, player)
            .setId("RNVideoPlaybackService_" + player.hashCode())
            .setCallback(VideoPlaybackCallback())
            .setCustomLayout(immutableListOf(seekForwardBtn, seekBackwardBtn))
            .build()

        mediaSessionsList[player] = mediaSession
        addSession(mediaSession)

        // Solo iniciar foreground service si la app está en primer plano
        if (!isForegroundServiceStarted) {
            if (!startForegroundServiceSafely(mediaSession.player.hashCode(), buildNotification(mediaSession))) {
                Log.w(TAG, "Could not start foreground service, continuing without it")
                // Continuar sin foreground service - la funcionalidad básica seguirá funcionando
            }
        }
    }

    fun unregisterPlayer(player: ExoPlayer) {
        DebugLog.d(TAG, "VideoPlaybackService unregisterPlayer")
        hidePlayerNotification(player)
        val session = mediaSessionsList.remove(player)
        session?.release()
        if (mediaSessionsList.isEmpty()) {
            cleanup()
            stopSelf()
        }
    }

    // Callbacks

    override fun onCreate() {
        super.onCreate()

        val notificationManager: NotificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            notificationManager.createNotificationChannel(
                NotificationChannel(
                    NOTIFICATION_CHANEL_ID,
                    NOTIFICATION_CHANEL_ID,
                    NotificationManager.IMPORTANCE_LOW
                )
            )
        }

        // NO llamar startForeground aquí - solo cuando se registre un player
        Log.d(TAG, "VideoPlaybackService created, waiting for player registration")
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = null

    override fun onBind(intent: Intent?): IBinder {
        super.onBind(intent)
        return binder
    }

    override fun onUpdateNotification(session: MediaSession, startInForegroundRequired: Boolean) {
        createSessionNotification(session)
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        cleanup()
        stopSelf()
    }

    override fun onDestroy() {
        DebugLog.d(TAG, "VideoPlaybackService onDestroy")
        cleanup()
        // Stop foreground service before deleting the channel to avoid
        // SecurityException: "Not allowed to delete channel with a foreground service"
        if (isForegroundServiceStarted) {
            try {
                stopForeground(STOP_FOREGROUND_REMOVE)
                isForegroundServiceStarted = false
            } catch (e: Exception) {
                Log.w(TAG, "Error stopping foreground service: ${e.message}")
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val notificationManager: NotificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.deleteNotificationChannel(NOTIFICATION_CHANEL_ID)
            } catch (e: Exception) {
                Log.w(TAG, "Error deleting notification channel: ${e.message}")
            }
        }
        super.onDestroy()
    }

    private fun createDefaultNotification(): Notification {
        DebugLog.d(TAG, "VideoPlaybackService createDefaultNotification")
        return NotificationCompat.Builder(this, NOTIFICATION_CHANEL_ID)
            .setContentTitle("Reproduciendo...")
            .setSmallIcon(R.drawable.ic_play)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createSessionNotification(session: MediaSession) {
        val notificationManager: NotificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            notificationManager.createNotificationChannel(
                NotificationChannel(
                    NOTIFICATION_CHANEL_ID,
                    NOTIFICATION_CHANEL_ID,
                    NotificationManager.IMPORTANCE_LOW
                )
            )
        }

        if (session.player.currentMediaItem == null) {
            notificationManager.cancel(session.player.hashCode())
            return
        }

        val notification = buildNotification(session)

        notificationManager.notify(session.player.hashCode(), notification)
    }

    private fun buildNotification(session: MediaSession): Notification {
        val returnToPlayer = Intent(this, sourceActivity ?: this.javaClass).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        /*
         * On Android 13+ controls are automatically handled via media session
         * On Android 12 and bellow we need to add controls manually
         */
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            NotificationCompat.Builder(this, NOTIFICATION_CHANEL_ID)
                .setSmallIcon(R.drawable.ic_play)
                .setStyle(MediaStyleNotificationHelper.MediaStyle(session))
                .setContentIntent(PendingIntent.getActivity(this, 0, returnToPlayer, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
                .build()
        } else {
            val playerId = session.player.hashCode()

            // Action for COMMAND.SEEK_BACKWARD
            val seekBackwardIntent = Intent(this, VideoPlaybackService::class.java).apply {
                putExtra("PLAYER_ID", playerId)
                putExtra("ACTION", COMMAND.SEEK_BACKWARD.stringValue)
            }
            val seekBackwardPendingIntent = PendingIntent.getService(
                this,
                playerId * 10,
                seekBackwardIntent,
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            // ACTION FOR COMMAND.TOGGLE_PLAY
            val togglePlayIntent = Intent(this, VideoPlaybackService::class.java).apply {
                putExtra("PLAYER_ID", playerId)
                putExtra("ACTION", COMMAND.TOGGLE_PLAY.stringValue)
            }
            val togglePlayPendingIntent = PendingIntent.getService(
                this,
                playerId * 10 + 1,
                togglePlayIntent,
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            // ACTION FOR COMMAND.SEEK_FORWARD
            val seekForwardIntent = Intent(this, VideoPlaybackService::class.java).apply {
                putExtra("PLAYER_ID", playerId)
                putExtra("ACTION", COMMAND.SEEK_FORWARD.stringValue)
            }
            val seekForwardPendingIntent = PendingIntent.getService(
                this,
                playerId * 10 + 2,
                seekForwardIntent,
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            NotificationCompat.Builder(this, NOTIFICATION_CHANEL_ID)
                // Show controls on lock screen even when user hides sensitive content.
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setSmallIcon(R.drawable.ic_play)
                // Add media control buttons that invoke intents in your media service
                .addAction(R.drawable.ic_prev, "Seek Backward", seekBackwardPendingIntent) // #0
                .addAction(
                    if (session.player.isPlaying) {
                        R.drawable.ic_pause
                    } else {
                        R.drawable.ic_play
                    },
                    "Toggle Play",
                    togglePlayPendingIntent
                ) // #1
                .addAction(R.drawable.ic_next, "Seek Forward", seekForwardPendingIntent) // #2
                // Apply the media style template
                .setStyle(MediaStyleNotificationHelper.MediaStyle(session).setShowActionsInCompactView(0, 1, 2))
                .setContentTitle(session.player.mediaMetadata.title)
                .setContentText(session.player.mediaMetadata.description)
                .setContentIntent(PendingIntent.getActivity(this, 0, returnToPlayer, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
                .setLargeIcon(session.player.mediaMetadata.artworkUri?.let { session.bitmapLoader.loadBitmap(it).get() })
                .setOngoing(true)
                .build()
        }
    }

    private fun hidePlayerNotification(player: ExoPlayer) {
        DebugLog.d(TAG, "VideoPlaybackService hidePlayerNotification")
        val notificationManager: NotificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(player.hashCode())
    }

    private fun hideAllNotifications() {
        DebugLog.d(TAG, "VideoPlaybackService hideAllNotifications")
        val notificationManager: NotificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancelAll()
    }

    private fun cleanup() {
        DebugLog.d(TAG, "VideoPlaybackService cleanup")
        hideAllNotifications()
        mediaSessionsList.forEach { (_, session) ->
            session.release()
        }
        mediaSessionsList.clear()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Solo iniciar foreground si no está ya iniciado y si la app está en primer plano
        if (!isForegroundServiceStarted && isAppInForeground()) {
            startForegroundServiceSafely(1, createDefaultNotification())
        }
        
        intent?.let {
            val playerId = it.getIntExtra("PLAYER_ID", -1)
            val actionCommand = it.getStringExtra("ACTION")

            if (playerId < 0) {
                DebugLog.w(TAG, "Received Command without playerId")
                return super.onStartCommand(intent, flags, startId)
            }

            if (actionCommand == null) {
                DebugLog.w(TAG, "Received Command without action command")
                return super.onStartCommand(intent, flags, startId)
            }

            val session = mediaSessionsList.values.find { s -> s.player.hashCode() == playerId } ?: return super.onStartCommand(intent, flags, startId)

            handleCommand(commandFromString(actionCommand), session)
        }
        return super.onStartCommand(intent, flags, startId)
    }

    companion object {
        private const val SEEK_INTERVAL_MS = 10000L
        private const val TAG = "VideoPlaybackService"

        const val NOTIFICATION_CHANEL_ID = "RNVIDEO_SESSION_NOTIFICATION"

        enum class COMMAND(val stringValue: String) {
            NONE("NONE"),
            SEEK_FORWARD("COMMAND_SEEK_FORWARD"),
            SEEK_BACKWARD("COMMAND_SEEK_BACKWARD"),
            TOGGLE_PLAY("COMMAND_TOGGLE_PLAY"),
            PLAY("COMMAND_PLAY"),
            PAUSE("COMMAND_PAUSE")
        }

        fun commandFromString(value: String): COMMAND =
            when (value) {
                COMMAND.SEEK_FORWARD.stringValue -> COMMAND.SEEK_FORWARD
                COMMAND.SEEK_BACKWARD.stringValue -> COMMAND.SEEK_BACKWARD
                COMMAND.TOGGLE_PLAY.stringValue -> COMMAND.TOGGLE_PLAY
                COMMAND.PLAY.stringValue -> COMMAND.PLAY
                COMMAND.PAUSE.stringValue -> COMMAND.PAUSE
                else -> COMMAND.NONE
            }
        fun handleCommand(command: COMMAND, session: MediaSession) {
            // TODO: get somehow ControlsConfig here - for now hardcoded 10000ms

            when (command) {
                COMMAND.SEEK_BACKWARD -> session.player.seekTo(session.player.contentPosition - SEEK_INTERVAL_MS)
                COMMAND.SEEK_FORWARD -> session.player.seekTo(session.player.contentPosition + SEEK_INTERVAL_MS)
                COMMAND.TOGGLE_PLAY -> handleCommand(if (session.player.isPlaying) COMMAND.PAUSE else COMMAND.PLAY, session)
                COMMAND.PLAY -> session.player.play()
                COMMAND.PAUSE -> session.player.pause()
                else -> DebugLog.w(TAG, "Received COMMAND.NONE - was there an error?")
            }
        }
    }
}