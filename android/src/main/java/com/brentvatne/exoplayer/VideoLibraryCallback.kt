package com.brentvatne.exoplayer

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionResult
import com.brentvatne.exoplayer.androidauto.MediaCache
import com.brentvatne.react.AndroidAutoModule
import com.facebook.react.bridge.Arguments
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * PLAYER-269 Phase 4: MediaLibrarySession.Callback lifted from AndroidAutoMediaBrowserService
 * and adapted so that [VideoPlaybackService] becomes the single service hosting browse + playback.
 *
 * Key changes vs the original AndroidAutoMediaBrowserService inner class:
 * - [onAddMediaItems] drives the CANONICAL player (via [CanonicalPlayerHolder]) instead of
 *   calling [GlobalPlayerManager.playMedia] which would create a 2nd ExoPlayer.
 * - With [CanonicalPlayerHolder.reconcileEnabled] = false (kill-switch default), the callback
 *   is never instantiated; [VideoPlaybackService] stays as [MediaSessionService] (Phase 4 is
 *   only activated when reconcileEnabled = true).
 *
 * ADR Auto-001 invariants covered: 1 (one player), 3 (one session), 4 (sole focus owner).
 */
class VideoLibraryCallback(private val serviceContext: Context, private val mediaCache: MediaCache) : MediaLibrarySession.Callback {

    companion object {
        private const val TAG = "VideoLibraryCallback"
        private const val ROOT_ID = "root"
        private const val EMPTY_ROOT_ID = "empty_root"
    }

    private var appLaunchAttempted = false

    // ------------------------------------------------------------------
    // Connection
    // ------------------------------------------------------------------

    override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
        Log.d(TAG, "onConnect: ${controller.packageName}")

        val isEnabled = getAndroidAutoModule()?.isAndroidAutoEnabled() ?: false
        if (!isEnabled) {
            Log.w(TAG, "Android Auto not yet enabled, launching app in background…")
            launchAppInBackground()
        } else {
            Log.i(TAG, "Android Auto enabled, accepting connection with content")
        }

        // PLAYER-268: advertise skip-to-next/previous so the car/lock-screen render the buttons.
        return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
            .setAvailablePlayerCommands(
                MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS.buildUpon()
                    .add(Player.COMMAND_SEEK_TO_NEXT)
                    .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                    .build()
            )
            .build()
    }

    /**
     * PLAYER-268: intercept the OS/car "skip to next/previous" transport commands (flag-ON
     * canonical/browse session). Identical interception to VideoPlaybackCallback — flag-agnostic
     * across the PLAYER-269 reconcile flip. Routes to the playlist via JS (not ExoPlayer timeline).
     */
    override fun onPlayerCommandRequest(session: MediaSession, controller: MediaSession.ControllerInfo, playerCommand: Int): Int =
        when (playerCommand) {
            Player.COMMAND_SEEK_TO_NEXT -> {
                AndroidAutoModule.notifySkipToNext()
                SessionResult.RESULT_ERROR_NOT_SUPPORTED
            }

            Player.COMMAND_SEEK_TO_PREVIOUS -> {
                AndroidAutoModule.notifySkipToPrevious()
                SessionResult.RESULT_ERROR_NOT_SUPPORTED
            }

            else -> SessionResult.RESULT_SUCCESS
        }

    // ------------------------------------------------------------------
    // Browse tree
    // ------------------------------------------------------------------

    override fun onGetLibraryRoot(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        params: androidx.media3.session.MediaLibraryService.LibraryParams?
    ): ListenableFuture<LibraryResult<MediaItem>> {
        Log.d(TAG, "onGetLibraryRoot")
        val hasContent = mediaCache.hasContent()
        return if (hasContent) {
            val rootItem = MediaItem.Builder()
                .setMediaId(ROOT_ID)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setIsBrowsable(true)
                        .setIsPlayable(false)
                        .build()
                )
                .build()
            Futures.immediateFuture(LibraryResult.ofItem(rootItem, params))
        } else {
            Log.w(TAG, "MediaCache empty, returning empty root")
            val emptyRoot = MediaItem.Builder()
                .setMediaId(EMPTY_ROOT_ID)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setIsBrowsable(false)
                        .setIsPlayable(false)
                        .build()
                )
                .build()
            Futures.immediateFuture(LibraryResult.ofItem(emptyRoot, params))
        }
    }

    override fun onGetChildren(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        parentId: String,
        page: Int,
        pageSize: Int,
        params: androidx.media3.session.MediaLibraryService.LibraryParams?
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
        Log.d(TAG, "onGetChildren: parentId=$parentId, page=$page, pageSize=$pageSize")
        return try {
            val children = mediaCache.getChildren(parentId) ?: emptyList()
            Log.i(TAG, "Returning ${children.size} children for $parentId")

            val module = getAndroidAutoModule()
            if (module?.isJavaScriptReady() != true) {
                Log.i(TAG, "JavaScript not ready, launching app in background")
                launchAppInBackground()
            }

            // Notify JS if ready
            notifyJavaScriptBrowseRequest(parentId)

            Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(children), params))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get children for $parentId", e)
            Futures.immediateFuture(LibraryResult.ofError(LibraryResult.RESULT_ERROR_UNKNOWN))
        }
    }

    override fun onSearch(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        query: String,
        params: androidx.media3.session.MediaLibraryService.LibraryParams?
    ): ListenableFuture<LibraryResult<Void>> {
        Log.d(TAG, "onSearch: query=$query")
        return try {
            val results = mediaCache.search(query) ?: emptyList()
            Log.i(TAG, "Search '$query' returned ${results.size} results")
            notifyJavaScriptSearchRequest(query)
            Futures.immediateFuture(LibraryResult.ofVoid())
        } catch (e: Exception) {
            Log.e(TAG, "Search failed for query: $query", e)
            Futures.immediateFuture(LibraryResult.ofError(LibraryResult.RESULT_ERROR_UNKNOWN))
        }
    }

    // ------------------------------------------------------------------
    // Playback (the critical change: drives CANONICAL player, not GlobalPlayerManager)
    // ------------------------------------------------------------------

    override fun onAddMediaItems(
        mediaSession: MediaSession,
        controller: MediaSession.ControllerInfo,
        mediaItems: MutableList<MediaItem>
    ): ListenableFuture<MutableList<MediaItem>> {
        Log.i(TAG, "onAddMediaItems: ${mediaItems.size} items")
        return try {
            mediaItems.forEach { mediaItem ->
                val mediaId = mediaItem.mediaId
                Log.d(TAG, "Processing mediaId: $mediaId")

                val cachedItem = mediaCache.getCachedItem(mediaId)

                if (cachedItem != null && cachedItem.mediaUri != null) {
                    // PLAYER-269 (inv. 1): drive the CANONICAL player, not GlobalPlayerManager.
                    // With reconcileEnabled=true the canonical player is already alive;
                    // the session's internal player == canonical (set in registerPlayerInternal).
                    Log.i(TAG, "Playing directly from cache via canonical player: ${cachedItem.mediaUri}")
                    val player = CanonicalPlayerHolder.get()
                    if (player != null) {
                        Handler(Looper.getMainLooper()).post {
                            try {
                                player.setMediaItem(
                                    MediaItem.Builder()
                                        .setMediaId(mediaId)
                                        .setUri(cachedItem.mediaUri)
                                        .setMediaMetadata(
                                            MediaMetadata.Builder()
                                                .setTitle(cachedItem.title)
                                                .setArtist(cachedItem.artist)
                                                .setArtworkUri(
                                                    cachedItem.artworkUri?.let { android.net.Uri.parse(it) }
                                                )
                                                .build()
                                        )
                                        .build()
                                )
                                player.prepare()
                                player.playWhenReady = true
                            } catch (e: Exception) {
                                Log.e(TAG, "Failed to set media item on canonical player", e)
                            }
                        }
                    } else {
                        // Canonical not up yet (race); fall back to JS flow
                        Log.w(TAG, "Canonical player not available yet, falling back to JS flow")
                        notifyJavaScriptPlayRequest(mediaId)
                    }

                    // Also notify JS if ready (keeps the JS coordination path working)
                    val module = getAndroidAutoModule()
                    if (module?.isJavaScriptReady() == true) {
                        notifyJavaScriptPlayRequest(mediaId)
                    }
                } else {
                    // No URI in cache — use JS flow
                    Log.w(TAG, "No URI in cache, using JavaScript flow")
                    val module = getAndroidAutoModule()
                    if (module?.isJavaScriptReady() != true) {
                        launchAppInBackground()
                        Handler(Looper.getMainLooper()).postDelayed({
                            notifyJavaScriptPlayRequest(mediaId)
                        }, 2500)
                    } else {
                        notifyJavaScriptPlayRequest(mediaId)
                    }
                }
            }
            Futures.immediateFuture(mediaItems)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add media items", e)
            Futures.immediateFuture(mediaItems)
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private fun getAndroidAutoModule(): AndroidAutoModule? =
        try {
            AndroidAutoModule.getInstance()
        } catch (_: Exception) {
            null
        }

    private fun launchAppInBackground() {
        if (appLaunchAttempted) return
        appLaunchAttempted = true
        try {
            val pm = serviceContext.applicationContext.packageManager
            val launchIntent = pm.getLaunchIntentForPackage(serviceContext.applicationContext.packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                launchIntent.putExtra("LAUNCHED_FROM_ANDROID_AUTO", true)
                serviceContext.applicationContext.startActivity(launchIntent)
                Log.i(TAG, "App launched in background for Android Auto")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch app: ${e.message}", e)
        }
    }

    private fun notifyJavaScriptBrowseRequest(parentId: String) {
        try {
            val module = getAndroidAutoModule()
            if (module?.isJavaScriptReady() == true) {
                module.sendEvent(
                    AndroidAutoModule.EVENT_BROWSE_REQUEST,
                    Arguments.createMap().apply { putString("parentId", parentId) }
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to notify JS about browse request", e)
        }
    }

    private fun notifyJavaScriptPlayRequest(mediaId: String) {
        try {
            val module = getAndroidAutoModule()
            if (module?.isJavaScriptReady() == true) {
                module.sendEvent(
                    AndroidAutoModule.EVENT_PLAY_FROM_MEDIA_ID,
                    Arguments.createMap().apply { putString("mediaId", mediaId) }
                )
            } else {
                Log.w(TAG, "JavaScript not ready, cannot send play event")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to notify JS about play request", e)
        }
    }

    private fun notifyJavaScriptSearchRequest(query: String) {
        try {
            val module = getAndroidAutoModule()
            if (module?.isJavaScriptReady() == true) {
                module.sendEvent(
                    AndroidAutoModule.EVENT_SEARCH_REQUEST,
                    Arguments.createMap().apply { putString("query", query) }
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to notify JS about search request", e)
        }
    }
}
