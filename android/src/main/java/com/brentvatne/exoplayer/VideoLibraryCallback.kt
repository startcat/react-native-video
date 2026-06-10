package com.brentvatne.exoplayer

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.brentvatne.exoplayer.androidauto.AndroidAutoBootstrapService
import com.brentvatne.exoplayer.androidauto.MediaCache
import com.brentvatne.react.AndroidAutoModule
import com.facebook.react.bridge.Arguments
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * The canonical MediaLibrarySession.Callback (lifted from the legacy AndroidAutoMediaBrowserService,
 * removed in the PLAYER-278 burn-down): [VideoPlaybackService] is the single service hosting
 * browse + playback for app, background, lock-screen/widget and Android Auto.
 *
 * - [onAddMediaItems] drives the CANONICAL player (via [CanonicalPlayerHolder]) instead of
 *   creating a 2nd ExoPlayer.
 * - Cold-start play (PLAYER-280): items GUAU serves have NO cached mediaUri (signed per-play
 *   URLs) → the play is queued on [AndroidAutoModule.queueCarPlayRequest] and the JS context is
 *   brought up WITHOUT an Activity via [AndroidAutoBootstrapService] (Android 15 BAL-blocks
 *   startActivity from background).
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

        // PLAYER-278: keep app audio playing across the AA connect handoff (canonical/single-session path).
        if (CarAudioHandoffCoordinator.isAutomotive(controller.packageName)) {
            CarAudioHandoffCoordinator.onCarControllerConnected()
        }

        val isEnabled = getAndroidAutoModule()?.isAndroidAutoEnabled() ?: false
        if (!isEnabled) {
            Log.w(TAG, "Android Auto not yet enabled, launching app in background…")
            launchAppInBackground()
        } else {
            Log.i(TAG, "Android Auto enabled, accepting connection with content")
        }

        // PLAYER-268: advertise skip-to-next/previous so the car/lock-screen render the buttons.
        // PLAYER-271: accept the ±seek custom session commands (notification forward/backward
        // buttons); DEFAULT_SESSION_AND_LIBRARY_COMMANDS keeps the browse (library) commands.
        return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
            .setAvailablePlayerCommands(
                MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS.buildUpon()
                    .add(Player.COMMAND_SEEK_TO_NEXT)
                    .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                    .build()
            )
            .setAvailableSessionCommands(
                MediaSession.ConnectionResult.DEFAULT_SESSION_AND_LIBRARY_COMMANDS.buildUpon()
                    .add(SessionCommand(VideoPlaybackService.Companion.COMMAND.SEEK_FORWARD.stringValue, Bundle.EMPTY))
                    .add(SessionCommand(VideoPlaybackService.Companion.COMMAND.SEEK_BACKWARD.stringValue, Bundle.EMPTY))
                    .build()
            )
            .build()
    }

    /**
     * PLAYER-271: the notification/widget ±seek buttons arrive as custom session commands
     * (COMMAND_SEEK_FORWARD/COMMAND_SEEK_BACKWARD). The handler lived in VideoPlaybackCallback,
     * deleted in the PLAYER-278 burn-down — without this override media3 drops the command and
     * the buttons are silent no-ops.
     */
    override fun onCustomCommand(
        session: MediaSession,
        controller: MediaSession.ControllerInfo,
        customCommand: SessionCommand,
        args: Bundle
    ): ListenableFuture<SessionResult> {
        VideoPlaybackService.handleCommand(VideoPlaybackService.commandFromString(customCommand.customAction), session)
        return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
    }

    /**
     * PLAYER-286 (G3): System UI / Bluetooth media buttons trigger this callback to resume
     * playback after process death or reboot. media3 calls this only if we have advertised
     * the `androidx.media3.session.MediaButtonReceiver` in the host manifest (GUAU declares it
     * per PLAYER-270 gotcha — library manifests don't merge).
     *
     * Strategy: load the last-played mediaId from [MediaCache] SharedPreferences (written by
     * AndroidAutoModule.saveLastPlayed on each ITEM_STARTED) and return a minimal
     * [MediaSession.MediaItemsWithStartPosition]. The mediaId has no signed URI in cache (signed
     * URLs expire) — media3 will call [onAddMediaItems] with this item, which triggers the normal
     * JS cold-start flow (bootstrap + `pendingCarPlayRequest`).
     *
     * If no last-played state exists: return RESULT_ERROR_NOT_SUPPORTED so media3 falls back
     * to its default (no resumption notification shown by System UI).
     */
    override fun onPlaybackResumption(
        session: MediaSession,
        controller: MediaSession.ControllerInfo
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
        Log.d(TAG, "onPlaybackResumption: controller=${controller.packageName}")
        val mediaId = mediaCache.loadLastPlayedMediaId()
        if (mediaId == null) {
            Log.w(TAG, "onPlaybackResumption: no last-played state found")
            return Futures.immediateFuture(
                MediaSession.MediaItemsWithStartPosition(emptyList(), 0, 0L)
            )
        }
        val positionMs = mediaCache.loadLastPlayedPositionMs()
        Log.i(TAG, "onPlaybackResumption: resuming mediaId=$mediaId at ${positionMs}ms")

        // Build a minimal MediaItem with cached metadata (if available) but NO mediaUri —
        // signed URLs are expired. onAddMediaItems will trigger the JS flow to resolve the URL.
        val cachedItem = mediaCache.getCachedItem(mediaId)
        val resumeItem = MediaItem.Builder()
            .setMediaId(mediaId)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(cachedItem?.title ?: "")
                    .setArtist(cachedItem?.artist)
                    .setArtworkUri(cachedItem?.artworkUri?.let { android.net.Uri.parse(it) })
                    .setIsPlayable(true)
                    .build()
            )
            .build()

        // Bootstrap the JS context if not already running (cold resume scenario).
        val module = getAndroidAutoModule()
        if (module?.isJavaScriptReady() != true) {
            Log.i(TAG, "onPlaybackResumption: JS not ready, bootstrapping + queuing play")
            AndroidAutoModule.queueCarPlayRequest(mediaId)
            launchAppInBackground()
        }

        return Futures.immediateFuture(
            MediaSession.MediaItemsWithStartPosition(listOf(resumeItem), 0, positionMs)
        )
    }

    /**
     * PLAYER-268/281: intercept the OS/car/widget "skip to next/previous" transport commands (flag-ON
     * canonical/browse session). Routes to the JS playlist (not the ExoPlayer timeline).
     *
     * Handles BOTH command flavours: a framework/legacy controller (Samsung media widget,
     * lock-screen) maps `skipToNext()` → `seekToNextMediaItem()` = COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
     * while media3 controllers may send COMMAND_SEEK_TO_NEXT. PlaylistAwareForwardingPlayer advertises
     * all four so they reach here; we reject the player op (single-item timeline) and drive the JS
     * queue instead.
     */
    override fun onPlayerCommandRequest(session: MediaSession, controller: MediaSession.ControllerInfo, playerCommand: Int): Int {
        Log.d(TAG, "onPlayerCommandRequest: cmd=$playerCommand from ${controller.packageName}") // PLAYER-281 diag
        return when (playerCommand) {
            Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> {
                AndroidAutoModule.notifySkipToNext()
                SessionResult.RESULT_ERROR_NOT_SUPPORTED
            }

            Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> {
                AndroidAutoModule.notifySkipToPrevious()
                SessionResult.RESULT_ERROR_NOT_SUPPORTED
            }

            else -> SessionResult.RESULT_SUCCESS
        }
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

    /**
     * PLAYER-284 (G1): gearhead calls onGetSearchResult AFTER onSearch returns success to fetch
     * the actual result list. media3 default returns RESULT_ERROR_NOT_SUPPORTED → gearhead shows
     * "no results" despite the search succeeding. We serve from the cache key written by
     * AndroidAutoModule.respondToSearchRequest("search:<query>").
     *
     * Empty query → all playable items (generic "play music" voice command).
     */
    override fun onGetSearchResult(
        session: MediaLibrarySession,
        browser: MediaSession.ControllerInfo,
        query: String,
        page: Int,
        pageSize: Int,
        params: androidx.media3.session.MediaLibraryService.LibraryParams?
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
        Log.d(TAG, "onGetSearchResult: query='$query', page=$page, pageSize=$pageSize")
        return try {
            val results: List<MediaItem> = if (query.isBlank()) {
                // Empty query = generic "pon música" voice command → return all playable items.
                Log.i(TAG, "onGetSearchResult: empty query → returning all playable items")
                mediaCache.getAllPlayableItems()
            } else {
                // Check the cache key written by respondToSearchRequest (parent="search:<query>").
                val cacheKey = "search:$query"
                val cached = mediaCache.getChildren(cacheKey)
                if (cached != null && cached.isNotEmpty()) {
                    Log.i(TAG, "onGetSearchResult: cache hit for '$query' (${cached.size} results)")
                    cached
                } else {
                    // Cache miss: results not yet back from JS. Ask JS again and return empty
                    // (gearhead will re-request once notifyChildrenChanged fires from
                    // respondToSearchRequest → AndroidAutoModule.notifyContentChanged).
                    Log.w(TAG, "onGetSearchResult: cache miss for '$query', re-triggering JS search")
                    notifyJavaScriptSearchRequest(query)
                    emptyList()
                }
            }
            Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(results), params))
        } catch (e: Exception) {
            Log.e(TAG, "onGetSearchResult failed for query: $query", e)
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

                // PLAYER-284 (G1): voice search path — "OK Google, pon X" arrives as
                // requestMetadata.searchQuery. Resolve to the first cached search result, or
                // trigger JS search flow if the cache is cold.
                val searchQuery = mediaItem.requestMetadata.searchQuery
                if (!searchQuery.isNullOrBlank()) {
                    Log.i(TAG, "onAddMediaItems: searchQuery='$searchQuery' — resolving via search cache")
                    val cacheKey = "search:$searchQuery"
                    val searchResults = mediaCache.getChildren(cacheKey)
                    if (searchResults != null && searchResults.isNotEmpty()) {
                        val firstResult = searchResults.first()
                        Log.i(TAG, "Search cache hit → delegating play for: ${firstResult.mediaId}")
                        // Recursive-safe: the resolved mediaId has no searchQuery, so this branch
                        // won't re-enter. Use JS flow to keep the single-write invariant.
                        notifyJavaScriptPlayRequest(firstResult.mediaId)
                    } else {
                        Log.w(TAG, "Search cache miss for '$searchQuery' — emitting play-from-search to JS")
                        notifyJavaScriptPlayFromSearch(searchQuery)
                    }
                    return@forEach
                }

                val cachedItem = mediaCache.getCachedItem(mediaId)

                if (cachedItem != null && cachedItem.mediaUri != null) {
                    // PLAYER-269 (inv. 1): drive the CANONICAL player, not GlobalPlayerManager.
                    // The session's internal player == canonical (set in registerPlayerInternal /
                    // ensureCanonicalSession).
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
                        // PLAYER-280: queue the play (setJavaScriptReady() delivers it when the
                        // bootstrap finishes — a fixed delay would lose it, init takes ~15-22s)
                        // and bring up the JS context headlessly (no Activity → no BAL).
                        Log.i(TAG, "JavaScript not ready, queueing play for: $mediaId")
                        AndroidAutoModule.queueCarPlayRequest(mediaId)
                        launchAppInBackground()
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

    /**
     * Inicializar el contexto JavaScript en background si no está activo (PLAYER-280).
     *
     * Android 15 bloquea (BAL) el startActivity(MainActivity) que se usaba antes, así que
     * arrancamos un HeadlessJsTaskService (servicio, no Activity → sin BAL) que crea el
     * contexto React y ejecuta la tarea de bootstrap registrada por el host.
     */
    private fun launchAppInBackground() {
        if (appLaunchAttempted) return
        appLaunchAttempted = true
        try {
            val appContext = serviceContext.applicationContext
            // Mantener la CPU despierta hasta que el contexto JS arranque
            // (el host declara WAKE_LOCK; si no, sólo perdemos el wake lock)
            try {
                com.facebook.react.HeadlessJsTaskService.acquireWakeLockNow(appContext)
            } catch (e: Exception) {
                Log.w(TAG, "Could not acquire wake lock for JS bootstrap: ${e.message}")
            }

            Log.i(TAG, "Starting headless JS bootstrap service...")
            appContext.startService(Intent(appContext, AndroidAutoBootstrapService::class.java))
            Log.i(TAG, "Headless JS bootstrap service started")
        } catch (e: Exception) {
            // IllegalStateException aquí = restricción background-service-start
            // (no esperada: este servicio ya corre como FGS vinculado por Android Auto)
            Log.e(TAG, "Failed to start headless JS bootstrap service: ${e.message}", e)
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

    /**
     * PLAYER-284 (G1): emit EVENT_PLAY_FROM_SEARCH so GUAU can resolve "OK Google, pon X"
     * via its own search logic and call PlaylistControl with the resolved content.
     * Falls back to queuing via AndroidAutoModule if JS is not ready yet.
     */
    private fun notifyJavaScriptPlayFromSearch(query: String) {
        try {
            val module = getAndroidAutoModule()
            if (module?.isJavaScriptReady() == true) {
                module.sendEvent(
                    AndroidAutoModule.EVENT_PLAY_FROM_SEARCH,
                    Arguments.createMap().apply { putString("query", query) }
                )
            } else {
                Log.w(TAG, "JS not ready for play-from-search '$query', launching app in background")
                launchAppInBackground()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to notify JS about play-from-search request", e)
        }
    }
}
