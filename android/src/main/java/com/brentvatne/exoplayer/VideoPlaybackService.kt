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
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaStyleNotificationHelper
import androidx.media3.session.SessionCommand
import com.brentvatne.common.toolbox.DebugLog
import com.brentvatne.exoplayer.androidauto.MediaCache
import okhttp3.internal.immutableListOf
import com.brentvatne.react.R
import android.content.pm.ServiceInfo

class PlaybackServiceBinder(val service: VideoPlaybackService) : Binder()

/**
 * PLAYER-269: Promoted from [MediaSessionService] to [MediaLibraryService].
 *
 * A [MediaLibraryService] is-a [MediaSessionService], so the existing no-car
 * notification/session contract is preserved by construction (invariant 5).
 *
 * KILL-SWITCH ([CanonicalPlayerHolder.reconcileEnabled] = false by default):
 *   - Flag OFF  → pre-269 Map-based multi-session behaviour; [AndroidAutoMediaBrowserService]
 *                 still lives and owns the browse session.  Behaviour is identical to PLAYER-266.
 *   - Flag ON   → single canonical [MediaLibrarySession] over the canonical [ExoPlayer];
 *                 [AndroidAutoMediaBrowserService] is superseded by this service.
 *
 * Invariants (ADR Auto-001): 1 (one player), 2 (service-owned lifetime), 3 (one session),
 * 4 (sole focus owner), 5 (no-car regression gate).
 */
class VideoPlaybackService : MediaLibraryService() {

    // ---- Pre-269 (flag OFF) state ---------------------------------------------------
    private var mediaSessionsList = mutableMapOf<ExoPlayer, MediaSession>()

    // ---- PLAYER-269 (flag ON) state -------------------------------------------------
    /** The single canonical audio session (inv. 3). Null when flag is OFF. */
    private var canonicalSession: MediaLibrarySession? = null
    private var mediaCache: MediaCache? = null

    // ---- Shared state ---------------------------------------------------------------
    private var binder = PlaybackServiceBinder(this)
    private var sourceActivity: Class<Activity>? = null
    private var isForegroundServiceStarted = false

    // Controls for Android 13+
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

    // =====================================================================
    // Player Registry
    // =====================================================================

    fun registerPlayer(player: ExoPlayer, from: Class<Activity>) {
        registerPlayerInternal(player, from)
    }

    /**
     * Register player without Activity (for Android Auto background).
     */
    fun registerPlayerForBackground(player: ExoPlayer) {
        registerPlayerInternal(player, null)
    }

    private fun registerPlayerInternal(player: ExoPlayer, from: Class<Activity>?) {
        if (from != null) sourceActivity = from

        if (CanonicalPlayerHolder.reconcileEnabled) {
            // ---- PLAYER-269 path (flag ON) ----------------------------------------
            // Set this player as the canonical one (inv. 1 + 2).
            CanonicalPlayerHolder.set(player)

            val existing = canonicalSession
            if (existing != null) {
                // Attach the (possibly new) player to the existing session (inv. 2).
                if (existing.player !== player) {
                    Log.d(TAG, "[canonical] Attaching new player to existing MediaLibrarySession")
                    existing.setPlayer(player)
                }
                createSessionNotification(existing)
                return
            }

            // First registration: build the ONE canonical MediaLibrarySession (inv. 3).
            if (mediaCache == null) mediaCache = MediaCache.getInstance(this)
            val session = MediaLibrarySession.Builder(
                this,
                player,
                VideoLibraryCallback(this, mediaCache!!)
            )
                .setId("RNVideoCanonicalSession")
                .setCustomLayout(immutableListOf(seekForwardBtn, seekBackwardBtn))
                .build()

            canonicalSession = session
            addSession(session)
            PlayerInstanceTracker.register(player) // PLAYER-265 S1

            if (!isForegroundServiceStarted) {
                try {
                    startForeground(player.hashCode(), buildNotification(session))
                    isForegroundServiceStarted = true
                    Log.d(TAG, "[canonical] Foreground service started for canonical session")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to start foreground service", e)
                }
            } else {
                createSessionNotification(session)
            }
        } else {
            // ---- Pre-269 path (flag OFF / default) --------------------------------
            if (mediaSessionsList.containsKey(player)) return

            val mediaSession = MediaSession.Builder(this, player)
                .setId("RNVideoPlaybackService_" + player.hashCode())
                .setCallback(VideoPlaybackCallback())
                .setCustomLayout(immutableListOf(seekForwardBtn, seekBackwardBtn))
                .build()

            mediaSessionsList[player] = mediaSession
            addSession(mediaSession)
            PlayerInstanceTracker.register(player) // PLAYER-265 S1: count live audio players

            if (!isForegroundServiceStarted) {
                try {
                    startForeground(mediaSession.player.hashCode(), buildNotification(mediaSession))
                    isForegroundServiceStarted = true
                    Log.d(TAG, "Foreground service started for background playback")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to start foreground service", e)
                }
            } else {
                createSessionNotification(mediaSession)
            }
        }
    }

    fun unregisterPlayer(player: ExoPlayer) {
        DebugLog.d(TAG, "VideoPlaybackService unregisterPlayer")

        if (CanonicalPlayerHolder.reconcileEnabled) {
            // ---- PLAYER-269 path ----------------------------------------------------
            hidePlayerNotification(player)
            canonicalSession?.let { session ->
                removeSession(session)
                session.release()
            }
            canonicalSession = null
            PlayerInstanceTracker.unregister(player)
            CanonicalPlayerHolder.clear()
            cleanup()
            stopSelf()
        } else {
            // ---- Pre-269 path -------------------------------------------------------
            hidePlayerNotification(player)
            val session = mediaSessionsList.remove(player)
            PlayerInstanceTracker.unregister(player) // PLAYER-265 S1: decrement live audio player count
            session?.release()
            if (mediaSessionsList.isEmpty()) {
                cleanup()
                stopSelf()
            }
        }
    }

    // =====================================================================
    // Lifecycle Callbacks
    // =====================================================================

    override fun onCreate() {
        super.onCreate()
        liveInstance = this

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
        Log.d(TAG, "VideoPlaybackService created (reconcileEnabled=${CanonicalPlayerHolder.reconcileEnabled}), waiting for player registration")
    }

    /**
     * [MediaLibraryService.onGetSession] — returns the canonical [MediaLibrarySession] when
     * reconciliation is active; null otherwise (pre-269: sessions managed by the Map).
     */
    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? {
        return if (CanonicalPlayerHolder.reconcileEnabled) canonicalSession else null
    }

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
        liveInstance = null
        cleanup()
        val notificationManager: NotificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            notificationManager.deleteNotificationChannel(NOTIFICATION_CHANEL_ID)
        }
        super.onDestroy()
    }

    // =====================================================================
    // PLAYER-269 Phase 4.8: live-instance accessors for AndroidAutoModule repoint
    // (replaces AndroidAutoMediaBrowserService.getInstance() call sites)
    // =====================================================================

    /**
     * Exposes the canonical [MediaLibrarySession] (only non-null with reconcileEnabled=true).
     */
    fun librarySession(): MediaLibrarySession? = canonicalSession

    /**
     * Whether an Android Auto controller is connected (proxy check: canonical session alive).
     * Replaces AndroidAutoMediaBrowserService.isAndroidAutoConnected.
     */
    fun isAndroidAutoConnected(): Boolean = canonicalSession != null

    /**
     * Forward childrenChanged to the canonical session.
     * Replaces AndroidAutoMediaBrowserService.notifyChildrenChanged.
     */
    fun notifyChildrenChanged(parentId: String) {
        try {
            canonicalSession?.notifyChildrenChanged(parentId, 0, null)
            Log.d(TAG, "notifyChildrenChanged sent for: $parentId")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to notify children changed for $parentId", e)
        }
    }

    /**
     * Replaces AndroidAutoMediaBrowserService.onAndroidAutoEnabled.
     */
    fun onAndroidAutoEnabled() {
        try {
            canonicalSession?.notifyChildrenChanged("root", 0, null)
            Log.d(TAG, "onAndroidAutoEnabled: root refresh sent")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to notify root change on Android Auto enabled", e)
        }
    }

    /**
     * Replaces AndroidAutoMediaBrowserService.setAndroidAutoModule — no-op here since
     * [VideoLibraryCallback] reads [AndroidAutoModule.getInstance()] directly.
     */
    fun setAndroidAutoModule(@Suppress("UNUSED_PARAMETER") module: Any?) {
        // No-op: VideoLibraryCallback resolves AndroidAutoModule via its static getInstance().
        Log.d(TAG, "setAndroidAutoModule called (no-op in canonical service)")
    }

    // =====================================================================
    // Notification helpers
    // =====================================================================

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

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            NotificationCompat.Builder(this, NOTIFICATION_CHANEL_ID)
                .setSmallIcon(R.drawable.ic_play)
                .setStyle(MediaStyleNotificationHelper.MediaStyle(session))
                .setContentIntent(PendingIntent.getActivity(this, 0, returnToPlayer, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
                .build()
        } else {
            val playerId = session.player.hashCode()

            val seekBackwardIntent = Intent(this, VideoPlaybackService::class.java).apply {
                putExtra("PLAYER_ID", playerId)
                putExtra("ACTION", COMMAND.SEEK_BACKWARD.stringValue)
            }
            val seekBackwardPendingIntent = PendingIntent.getService(
                this, playerId * 10, seekBackwardIntent,
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            val togglePlayIntent = Intent(this, VideoPlaybackService::class.java).apply {
                putExtra("PLAYER_ID", playerId)
                putExtra("ACTION", COMMAND.TOGGLE_PLAY.stringValue)
            }
            val togglePlayPendingIntent = PendingIntent.getService(
                this, playerId * 10 + 1, togglePlayIntent,
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            val seekForwardIntent = Intent(this, VideoPlaybackService::class.java).apply {
                putExtra("PLAYER_ID", playerId)
                putExtra("ACTION", COMMAND.SEEK_FORWARD.stringValue)
            }
            val seekForwardPendingIntent = PendingIntent.getService(
                this, playerId * 10 + 2, seekForwardIntent,
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            NotificationCompat.Builder(this, NOTIFICATION_CHANEL_ID)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setSmallIcon(R.drawable.ic_play)
                .addAction(R.drawable.ic_prev, "Seek Backward", seekBackwardPendingIntent)
                .addAction(
                    if (session.player.isPlaying) R.drawable.ic_pause else R.drawable.ic_play,
                    "Toggle Play", togglePlayPendingIntent
                )
                .addAction(R.drawable.ic_next, "Seek Forward", seekForwardPendingIntent)
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
        if (CanonicalPlayerHolder.reconcileEnabled) {
            canonicalSession?.release()
            canonicalSession = null
        } else {
            mediaSessionsList.forEach { (_, session) -> session.release() }
            mediaSessionsList.clear()
        }
        isForegroundServiceStarted = false
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
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

            val session: MediaSession? = if (CanonicalPlayerHolder.reconcileEnabled) {
                canonicalSession?.takeIf { s -> s.player.hashCode() == playerId }
            } else {
                mediaSessionsList.values.find { s -> s.player.hashCode() == playerId }
            }

            if (session != null) handleCommand(commandFromString(actionCommand), session)
        }
        return super.onStartCommand(intent, flags, startId)
    }

    companion object {
        private const val SEEK_INTERVAL_MS = 10000L
        private const val TAG = "VideoPlaybackService"

        const val NOTIFICATION_CHANEL_ID = "RNVIDEO_SESSION_NOTIFICATION"

        /**
         * PLAYER-269 Phase 4.8: live instance accessor for [AndroidAutoModule] repoint.
         * Replaces [AndroidAutoMediaBrowserService.getInstance()] call sites.
         */
        @Volatile
        var liveInstance: VideoPlaybackService? = null
            private set

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
