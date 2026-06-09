package com.brentvatne.react.playlist

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.media.AudioAttributesCompat
import androidx.media.AudioFocusRequestCompat
import androidx.media.AudioManagerCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.brentvatne.exoplayer.CanonicalPlayerHolder
import com.brentvatne.exoplayer.PlaylistQueueState
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * PlaylistControlModule - Gestión centralizada de playlists
 *
 * Similar al módulo iOS, gestiona:
 * - Standalone mode: Player propio con auto-next
 * - Coordinated mode: Sincronización con ReactExoplayerView
 */
class PlaylistControlModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "PlaylistControlModule"
        const val MODULE_NAME = "PlaylistControlModule"

        // Broadcast actions (for coordinated mode)
        const val ACTION_VIDEO_ITEM_FINISHED = "com.brentvatne.react.VIDEO_ITEM_FINISHED"

        // Event names (match iOS)
        private const val EVENT_ITEM_CHANGED = "onPlaylistItemChanged"
        private const val EVENT_ITEM_STARTED = "onPlaylistItemStarted"
        private const val EVENT_ITEM_COMPLETED = "onPlaylistItemCompleted"
        private const val EVENT_ITEM_ERROR = "onPlaylistItemError"
        private const val EVENT_PLAYLIST_ENDED = "onPlaylistEnded"
        private const val EVENT_PROGRESS_UPDATED = "onPlaylistProgressUpdated"
        private const val EVENT_CONTROL_ACTION = "onPlaylistControlAction"
        private const val EVENT_PLAYBACK_STATE_CHANGED = "onPlaylistPlaybackStateChanged"
    }

    private val handler = Handler(Looper.getMainLooper())
    private val items = mutableListOf<PlaylistItem>()

    // PLAYER-281: republish the playlist "has next" flag on EVERY index change so the canonical
    // session's PlaylistAwareForwardingPlayer can expose COMMAND_SEEK_TO_NEXT (the single-item
    // ExoPlayer timeline never does). Using a property setter catches every mutation site
    // (setPlaylist / next / previous / goToIndex / auto-advance) without scattering publish calls.
    // setPlaylist publishes once more after config is parsed (repeat-mode affects getNextIndex).
    private var currentIndex: Int = 0
        set(value) {
            field = value
            PlaylistQueueState.hasNext = getNextIndex() != -1
            PlaylistQueueState.hasPrevious = getPreviousIndex() != -1
        }
    private var config = PlaylistConfiguration()
    private var isPlaybackActive = false
    private var hasSetupMediaSession = false

    // Track which items have already emitted ITEM_STARTED to prevent duplicates
    private val itemsStartedSet = mutableSetOf<String>()

    // Standalone mode components
    private var standalonePlayer: ExoPlayer? = null
    private var audioFocusRequest: AudioFocusRequestCompat? = null
    private var hasAudioFocus = false

    // Whether the standalonePlayer was paused due to a focus loss (any kind).
    // Used to decide whether to auto-resume on AUDIOFOCUS_GAIN. False means the
    // user explicitly paused / nothing was playing — don't auto-resume.
    private var pausedDueToFocusLoss = false

    private val broadcastReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                ACTION_VIDEO_ITEM_FINISHED -> {
                    val itemId = intent.getStringExtra("itemId")
                    Log.d(TAG, "📻 Broadcast received - Video item finished: $itemId")
                    handleItemCompletionInCoordinatedMode(itemId)
                }
            }
        }
    }

    init {
        // Register broadcast receiver for coordinated mode
        try {
            val filter = IntentFilter().apply {
                addAction(ACTION_VIDEO_ITEM_FINISHED)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Android 13+ requires explicit flag
                reactContext.registerReceiver(
                    broadcastReceiver,
                    filter,
                    Context.RECEIVER_NOT_EXPORTED
                )
            } else {
                reactContext.registerReceiver(
                    broadcastReceiver,
                    filter
                )
            }

            Log.d(TAG, "✅ Broadcast receiver registered successfully for playlist coordination")
            Log.d(TAG, "📻 Listening for action: $ACTION_VIDEO_ITEM_FINISHED")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to register broadcast receiver", e)
        }
    }

    override fun getName(): String = MODULE_NAME

    override fun invalidate() {
        super.invalidate()

        // Release standalone player if active
        releaseStandalonePlayer()

        try {
            reactApplicationContext.unregisterReceiver(broadcastReceiver)
            Log.d(TAG, "📻 Broadcast receiver unregistered")
        } catch (e: IllegalArgumentException) {
            // Receiver was already unregistered
            Log.d(TAG, "⚠️ Broadcast receiver already unregistered")
        }
    }

    override fun getConstants(): Map<String, Any> =
        mapOf(
            "EVENT_ITEM_CHANGED" to EVENT_ITEM_CHANGED,
            "EVENT_ITEM_STARTED" to EVENT_ITEM_STARTED,
            "EVENT_ITEM_COMPLETED" to EVENT_ITEM_COMPLETED,
            "EVENT_ITEM_ERROR" to EVENT_ITEM_ERROR,
            "EVENT_PLAYLIST_ENDED" to EVENT_PLAYLIST_ENDED,
            "EVENT_PROGRESS_UPDATED" to EVENT_PROGRESS_UPDATED,
            "EVENT_CONTROL_ACTION" to EVENT_CONTROL_ACTION,
            "EVENT_PLAYBACK_STATE_CHANGED" to EVENT_PLAYBACK_STATE_CHANGED
        )

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RCTEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RCTEventEmitter
    }

    @ReactMethod
    fun isModuleReady(promise: Promise) {
        promise.resolve(true)
        Log.d(TAG, "PlaylistControlModule is ready and responding")
    }

    /**
     * Initialize playlist with items and configuration
     */
    @ReactMethod
    fun setPlaylist(itemsArray: ReadableArray, configMap: ReadableMap, promise: Promise) {
        handler.post {
            try {
                // Parse items
                items.clear()
                itemsStartedSet.clear() // Clear started items tracking for new playlist
                var successCount = 0
                var failCount = 0

                for (i in 0 until itemsArray.size()) {
                    val item = PlaylistItem.fromMap(itemsArray.getMap(i))
                    if (item != null) {
                        items.add(item)
                        successCount++
                    } else {
                        failCount++
                        Log.w(TAG, "Failed to parse item at index $i")
                    }
                }

                Log.d(TAG, "Playlist loaded: $successCount items parsed successfully, $failCount failed")

                // Validate we have at least one item
                if (items.isEmpty()) {
                    promise.reject("PLAYLIST_ERROR", "No valid items in playlist. All ${itemsArray.size()} items failed to parse.")
                    return@post
                }

                // Parse config
                if (configMap.hasKey("startAt")) {
                    val requestedIndex = configMap.getInt("startAt")
                    currentIndex = requestedIndex.coerceIn(0, items.size - 1)
                    if (requestedIndex != currentIndex) {
                        Log.w(TAG, "Requested startAt=$requestedIndex adjusted to $currentIndex (max=${items.size - 1})")
                    }
                } else {
                    currentIndex = 0
                }

                if (configMap.hasKey("config")) {
                    try {
                        config = PlaylistConfiguration.fromMap(configMap.getMap("config"))
                        Log.d(
                            TAG,
                            "Config: autoNext=${config.autoNext}, repeatMode=${config.repeatMode}, shuffle=${config.shuffleEnabled}, coordinatedMode=${config.coordinatedMode}"
                        )
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to parse config, using defaults", e)
                        config = PlaylistConfiguration()
                    }
                }

                // PLAYER-281: re-publish now that repeatMode (config) is parsed — getNextIndex()/
                // getPreviousIndex() depend on it for the boundary/repeat-all case (the currentIndex
                // setter above ran with the previous config).
                PlaylistQueueState.hasNext = getNextIndex() != -1
                PlaylistQueueState.hasPrevious = getPreviousIndex() != -1

                Log.d(TAG, "About to check operation mode...")

                // Log operation mode
                val modeStr = if (config.coordinatedMode) "COORDINATED" else "STANDALONE"
                Log.d(TAG, "Operation mode: $modeStr (ReactExoplayerView handles playback: ${config.coordinatedMode})")

                Log.d(TAG, "After operation mode log...")
                Log.d(TAG, "config.coordinatedMode value: ${config.coordinatedMode}")

                // Setup standalone mode if needed (AFTER config is fully parsed)
                val shouldSetupStandalone = !config.coordinatedMode
                Log.d(TAG, "shouldSetupStandalone: $shouldSetupStandalone")

                if (shouldSetupStandalone) {
                    Log.d(TAG, "[Standalone] Initializing standalone mode...")
                    try {
                        setupStandaloneMode()
                        Log.d(TAG, "[Standalone] Setup completed, now loading item...")
                        loadCurrentItem()
                        Log.d(TAG, "[Standalone] Load item completed")
                    } catch (e: Exception) {
                        Log.e(TAG, "[Standalone] Failed to initialize: ${e.message}", e)
                        e.printStackTrace()
                    }
                } else {
                    Log.d(TAG, "Coordinated mode - skipping standalone setup")

                    // En modo coordinated, emitir ITEM_STARTED para que la reproducción comience
                    // notifyItemStarted() verificará si ya se emitió para evitar duplicados
                    val firstItem = items.getOrNull(currentIndex)
                    if (firstItem != null) {
                        emitItemStarted(firstItem)
                        itemsStartedSet.add(firstItem.id) // Track that this item has started
                        Log.d(TAG, "[Coordinated] ITEM_STARTED emitted for initial item: ${firstItem.metadata.title}")
                    }
                }

                Log.d(TAG, "setPlaylist completed successfully")
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Error setting playlist", e)
                promise.reject("PLAYLIST_ERROR", e.message, e)
            }
        }
    }

    /**
     * PLAYER-282: append ONE item to the live queue WITHOUT touching playback.
     *
     * Backs the incremental-playlist flow (fast-start with the tapped item → append the rest
     * async). Also the missing native half of the JS `PlaylistsManager.addItems()` loop, which
     * already calls `nativeModule.addItem(item)` per item (and silently warned before this
     * existed — the JS list updated but the native queue/next-button never did).
     */
    @ReactMethod
    fun addItem(itemMap: ReadableMap, promise: Promise) {
        handler.post {
            try {
                val item = PlaylistItem.fromMap(itemMap)
                if (item == null) {
                    promise.reject("PLAYLIST_ERROR", "Failed to parse item to append")
                    return@post
                }
                if (items.any { it.id == item.id }) {
                    Log.d(TAG, "[Append] Item already in queue, skipping: ${item.id}")
                    promise.resolve(false)
                    return@post
                }

                items.add(item)

                val hadNext = PlaylistQueueState.hasNext
                val hadPrevious = PlaylistQueueState.hasPrevious
                PlaylistQueueState.hasNext = getNextIndex() != -1
                PlaylistQueueState.hasPrevious = getPreviousIndex() != -1
                Log.d(
                    TAG,
                    "[Append] Added: ${item.metadata.title} (queue=${items.size}, hasNext=${PlaylistQueueState.hasNext})"
                )

                if (hadNext != PlaylistQueueState.hasNext || hadPrevious != PlaylistQueueState.hasPrevious) {
                    nudgeSessionCommandsRefresh()
                }

                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Error appending item", e)
                promise.reject("PLAYLIST_ERROR", e.message, e)
            }
        }
    }

    /**
     * PLAYER-282: media3 only re-queries [PlaylistAwareForwardingPlayer.getAvailableCommands] on a
     * player EVENT; a queue append alone fires none, so the next/previous buttons would stay
     * hidden until some unrelated event. [Player.setPlaylistMetadata] is a playback-neutral event
     * (EVENT_PLAYLIST_METADATA_CHANGED) that makes the session push fresh PlayerInfo. ExoPlayer
     * no-ops on EQUAL metadata — mirroring the CURRENT item's metadata changes on the first
     * append (playlistMetadata starts EMPTY), which is the case that matters (hasNext false→true
     * right after the fast-start).
     */
    private fun nudgeSessionCommandsRefresh() {
        val player = standalonePlayer ?: return
        try {
            player.setPlaylistMetadata(player.mediaMetadata)
            Log.d(TAG, "[Append] Session command refresh nudged (playlistMetadata)")
        } catch (e: Exception) {
            Log.w(TAG, "[Append] Failed to nudge session command refresh", e)
        }
    }

    /**
     * Clear the current playlist and reset state
     */
    @ReactMethod
    fun clearPlaylist(promise: Promise) {
        handler.post {
            try {
                Log.d(TAG, "Clearing playlist...")

                // Stop playback if active
                if (!config.coordinatedMode) {
                    releaseStandalonePlayer()
                }

                // Clear items and reset state
                items.clear()
                itemsStartedSet.clear() // Clear started items tracking
                currentIndex = 0
                isPlaybackActive = false

                Log.d(TAG, "Playlist cleared successfully")
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Error clearing playlist", e)
                promise.reject("CLEAR_PLAYLIST_ERROR", e.message, e)
            }
        }
    }

    /**
     * Control actions - work in both standalone and coordinated modes
     */

    @ReactMethod
    fun play(promise: Promise) {
        handler.post {
            try {
                if (config.coordinatedMode) {
                    // En modo coordinated, emitir evento para que ReactExoplayerView maneje
                    emitControlAction("play")
                    Log.d(TAG, "[Coordinated] Play action emitted")
                } else {
                    // En modo standalone, controlar directamente el player
                    standalonePlayer?.play()
                    Log.d(TAG, "[Standalone] Play action executed")
                }
                // Emitir evento de cambio de estado
                emitPlaybackStateChanged("playing")
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Error executing play", e)
                promise.reject("PLAY_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun pause(promise: Promise) {
        handler.post {
            try {
                if (config.coordinatedMode) {
                    emitControlAction("pause")
                    Log.d(TAG, "[Coordinated] Pause action emitted")
                } else {
                    standalonePlayer?.pause()
                    Log.d(TAG, "[Standalone] Pause action executed")
                }
                // Emitir evento de cambio de estado
                emitPlaybackStateChanged("paused")
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Error executing pause", e)
                promise.reject("PAUSE_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun seekTo(positionMs: Double, promise: Promise) {
        handler.post {
            try {
                val position = positionMs.toLong()
                if (config.coordinatedMode) {
                    val params = Arguments.createMap().apply {
                        putDouble("position", positionMs)
                    }
                    emitControlAction("seek", params)
                    Log.d(TAG, "[Coordinated] Seek action emitted: ${position}ms")
                } else {
                    standalonePlayer?.seekTo(position)
                    Log.d(TAG, "[Standalone] Seek action executed: ${position}ms")
                }
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Error executing seek", e)
                promise.reject("SEEK_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun next(promise: Promise) {
        handler.post {
            try {
                if (canGoNext()) {
                    if (config.coordinatedMode) {
                        emitControlAction("next")
                        Log.d(TAG, "[Coordinated] Next action emitted")
                        // También avanzar el índice localmente
                        val previousIndex = currentIndex
                        currentIndex = getNextIndex()
                        val nextItem = items[currentIndex]
                        emitItemChanged(nextItem, currentIndex, previousIndex)
                        // Emit item started event for coordinated mode
                        emitItemStarted(nextItem)
                        itemsStartedSet.add(nextItem.id)
                        Log.d(TAG, "[Coordinated] Item started event emitted")
                    } else {
                        advanceToNextItemStandalone()
                    }
                    promise.resolve(true)
                } else {
                    Log.w(TAG, "Cannot go to next: already at end")
                    promise.resolve(false)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error executing next", e)
                promise.reject("NEXT_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun previous(promise: Promise) {
        handler.post {
            try {
                if (canGoPrevious()) {
                    val previousIndex = currentIndex
                    currentIndex = getPreviousIndex()
                    val prevItem = items[currentIndex]

                    if (config.coordinatedMode) {
                        emitControlAction("previous")
                        Log.d(TAG, "[Coordinated] Previous action emitted")
                        emitItemChanged(prevItem, currentIndex, previousIndex)
                        // Emit item started event for coordinated mode
                        emitItemStarted(prevItem)
                        itemsStartedSet.add(prevItem.id)
                        Log.d(TAG, "[Coordinated] Item started event emitted")
                    } else {
                        Log.d(TAG, "[Standalone] Going to previous item: ${prevItem.metadata.title}")
                        emitItemChanged(prevItem, currentIndex, previousIndex)
                        loadCurrentItem()
                    }
                    promise.resolve(true)
                } else {
                    Log.w(TAG, "Cannot go to previous: already at start")
                    promise.resolve(false)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error executing previous", e)
                promise.reject("PREVIOUS_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        handler.post {
            try {
                if (config.coordinatedMode) {
                    emitControlAction("stop")
                    Log.d(TAG, "[Coordinated] Stop action emitted")
                } else {
                    standalonePlayer?.stop()
                    isPlaybackActive = false
                    Log.d(TAG, "[Standalone] Stop action executed")
                }
                // Emitir evento de cambio de estado
                emitPlaybackStateChanged("stopped")
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Error executing stop", e)
                promise.reject("STOP_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getPlaybackState(promise: Promise) {
        handler.post {
            try {
                val state = Arguments.createMap()

                if (config.coordinatedMode) {
                    state.putString("mode", "coordinated")
                    state.putInt("currentIndex", currentIndex)
                    state.putInt("totalItems", items.size)
                } else {
                    state.putString("mode", "standalone")
                    state.putInt("currentIndex", currentIndex)
                    state.putInt("totalItems", items.size)
                    state.putBoolean("isPlaying", standalonePlayer?.isPlaying ?: false)
                    state.putDouble("position", standalonePlayer?.currentPosition?.toDouble() ?: 0.0)
                    state.putDouble("duration", standalonePlayer?.duration?.toDouble() ?: 0.0)
                }

                promise.resolve(state)
            } catch (e: Exception) {
                Log.e(TAG, "Error getting playback state", e)
                promise.reject("STATE_ERROR", e.message, e)
            }
        }
    }

    /**
     * Navigate to specific index
     */
    @ReactMethod
    fun goToIndex(index: Int, promise: Promise) {
        handler.post {
            try {
                if (index < 0 || index >= items.size) {
                    promise.reject("INVALID_INDEX", "Index $index out of bounds")
                    return@post
                }

                val previousIndex = currentIndex
                currentIndex = index
                val item = items[index]

                // When moving to a different item, allow it to emit ITEM_STARTED again
                // (in case user goes back to a previous item)
                itemsStartedSet.clear()

                Log.d(TAG, "Going to index $index: ${item.metadata.title}")
                Log.d(TAG, "  Mode: ${if (config.coordinatedMode) "COORDINATED" else "STANDALONE"}")
                Log.d(TAG, "  Item type: ${item.type}")

                // Emit event to JavaScript
                emitItemChanged(item, index, previousIndex)

                // Handle based on mode
                if (config.coordinatedMode) {
                    Log.d(TAG, "🎯 COORDINATED mode: Event emitted, JavaScript will update <Video> source")
                    // In coordinated mode, JavaScript is responsible for updating the Video component source
                    // The emitted event (onPlaylistItemChanged) will trigger the update in the flavour
                } else {
                    Log.d(TAG, "🎯 STANDALONE mode: Loading in standalone player")
                    // In standalone mode, we manage our own ExoPlayer
                    loadCurrentItem()
                }

                Log.d(TAG, "✅ goToIndex completed successfully")
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("NAVIGATION_ERROR", e.message, e)
            }
        }
    }

    /**
     * Navigate to next item
     */
    @ReactMethod
    fun goToNext(promise: Promise) {
        handler.post {
            val nextIndex = getNextIndex()
            if (nextIndex == -1) {
                promise.resolve(false)
                return@post
            }
            goToIndex(nextIndex, promise)
        }
    }

    /**
     * Navigate to previous item
     */
    @ReactMethod
    fun goToPrevious(promise: Promise) {
        handler.post {
            val prevIndex = getPreviousIndex()
            if (prevIndex == -1) {
                promise.resolve(false)
                return@post
            }
            goToIndex(prevIndex, promise)
        }
    }

    /**
     * Get current item
     */
    @ReactMethod
    fun getCurrentItem(promise: Promise) {
        handler.post {
            val item = items.getOrNull(currentIndex)
            promise.resolve(item?.toMap())
        }
    }

    /**
     * Get current index
     */
    @ReactMethod
    fun getCurrentIndex(promise: Promise) {
        promise.resolve(currentIndex)
    }

    /**
     * Check if can go next
     */
    @ReactMethod
    fun canGoToNext(promise: Promise) {
        promise.resolve(getNextIndex() != -1)
    }

    /**
     * Check if can go previous
     */
    @ReactMethod
    fun canGoToPrevious(promise: Promise) {
        promise.resolve(getPreviousIndex() != -1)
    }

    /**
     * Notify that current item has finished (for coordinated mode)
     * This allows JavaScript to notify the native module when playback ends
     */
    @ReactMethod
    fun notifyItemFinished(itemId: String?, promise: Promise) {
        handler.post {
            try {
                Log.d(TAG, "📢 notifyItemFinished called from JavaScript: $itemId")

                // Handle item completion (works in both coordinated and standalone modes)
                if (config.coordinatedMode) {
                    handleItemCompletionInCoordinatedMode(itemId)
                } else {
                    // In standalone mode, just emit the completion event
                    // (auto-advance is handled internally by the native player)
                    val currentItem = items.getOrNull(currentIndex)
                    if (currentItem != null) {
                        emitItemCompleted(currentItem)
                    }
                }
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Error in notifyItemFinished", e)
                promise.reject("NOTIFY_ERROR", e.message, e)
            }
        }
    }

    /**
     * Notify that current item has started (for coordinated mode)
     * This allows JavaScript to notify the native module when content is loaded and ready
     */
    @ReactMethod
    fun notifyItemStarted(itemId: String?, promise: Promise) {
        handler.post {
            try {
                Log.d(TAG, "📢 notifyItemStarted called from JavaScript: $itemId")

                val currentItem = items.getOrNull(currentIndex)
                if (currentItem == null) {
                    Log.w(TAG, "⚠️ notifyItemStarted: No current item at index $currentIndex")
                    promise.resolve(false)
                    return@post
                }

                if (itemId != null && currentItem.id != itemId) {
                    Log.w(TAG, "⚠️ notifyItemStarted: Item ID mismatch - expected ${currentItem.id}, got $itemId")
                }

                // Check if this item already emitted ITEM_STARTED
                if (itemsStartedSet.contains(currentItem.id)) {
                    Log.d(TAG, "⏭️ Skipping duplicate ITEM_STARTED for: ${currentItem.id}")
                    promise.resolve(true)
                    return@post
                }

                // Emit item started event (works in both coordinated and standalone modes)
                emitItemStarted(currentItem)
                itemsStartedSet.add(currentItem.id)
                Log.d(TAG, "✅ Item started event emitted for: ${currentItem.metadata.title}")

                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Error in notifyItemStarted", e)
                promise.reject("NOTIFY_ERROR", e.message, e)
            }
        }
    }

    // ========== Private Methods ==========

    private fun getNextIndex(): Int =
        when {
            currentIndex < items.size - 1 -> currentIndex + 1
            config.repeatMode == PlaylistRepeatMode.ALL -> 0
            else -> -1
        }

    private fun getPreviousIndex(): Int =
        when {
            currentIndex > 0 -> currentIndex - 1
            config.repeatMode == PlaylistRepeatMode.ALL -> items.size - 1
            else -> -1
        }

    private fun canGoNext(): Boolean = getNextIndex() != -1

    private fun canGoPrevious(): Boolean = getPreviousIndex() != -1

    private fun handleItemCompletionInCoordinatedMode(itemId: String?) {
        val currentItem = items.getOrNull(currentIndex) ?: return

        if (itemId != null && currentItem.id != itemId) {
            Log.w(TAG, "Item ID mismatch: expected ${currentItem.id}, got $itemId")
        }

        // Emit completion event
        emitItemCompleted(currentItem)

        Log.d(TAG, "Item completed: ${currentItem.id}")

        // Auto-advance if enabled
        if (config.autoNext || currentItem.type == PlaylistItemType.TUDUM) {
            advanceToNextItem()
        }
    }

    /**
     * Advance to next item (used in coordinated mode when item finishes)
     * In coordinated mode, this only updates the index and emits event
     * JavaScript will handle updating the Video component source
     */
    private fun advanceToNextItem() {
        val nextIndex = getNextIndex()

        if (nextIndex == -1) {
            Log.d(TAG, "🏁 Playlist ended")
            isPlaybackActive = false
            emitPlaylistEnded()
            return
        }

        val previousIndex = currentIndex
        currentIndex = nextIndex
        val nextItem = items[currentIndex]

        Log.d(TAG, "Advancing to next item: ${nextItem.metadata.title}")
        Log.d(TAG, "  Mode: ${if (config.coordinatedMode) "COORDINATED" else "STANDALONE"}")

        // Emit event to JavaScript
        emitItemChanged(nextItem, currentIndex, previousIndex)

        // ❌ NO emitir ITEM_STARTED en modo coordinated aquí
        // En modo coordinated, JavaScript emitirá ITEM_STARTED cuando el contenido
        // realmente esté cargado y listo para reproducirse (en handleOnLoad)
        // Emitir ITEM_STARTED prematuramente causa que AudioPlayerBar llame a onEnd
        // antes de que el contenido se haya cargado, causando saltos de items
        if (!config.coordinatedMode) {
            // Solo en modo standalone emitimos ITEM_STARTED aquí
            emitItemStarted(nextItem)
            itemsStartedSet.add(nextItem.id)
            Log.d(TAG, "[Standalone] Item started event emitted")
        } else {
            Log.d(TAG, "[Coordinated] Skipping ITEM_STARTED emission - JavaScript will emit when content loads")
        }

        // In coordinated mode, JavaScript handles the source update via the event
        // In standalone mode, this is called from player listener which then loads the item
        Log.d(TAG, "✅ advanceToNextItem completed - event emitted")
    }

    private fun setupStandaloneMode() {
        Log.d(TAG, "Setting up STANDALONE mode...")

        // Release existing player if any
        releaseStandalonePlayer()

        try {
            // PLAYER-269: route through CanonicalPlayerHolder so the standalone player IS the
            // canonical player (ADR Auto-001, inv. 1 + 2).
            val playerListener = object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    val stateStr = when (playbackState) {
                        Player.STATE_IDLE -> "IDLE"
                        Player.STATE_BUFFERING -> "BUFFERING"
                        Player.STATE_READY -> "READY"
                        Player.STATE_ENDED -> "ENDED"
                        else -> "UNKNOWN"
                    }
                    Log.d(TAG, "[Standalone] Playback state: $stateStr")

                    // Emitir eventos de estado
                    when (playbackState) {
                        Player.STATE_BUFFERING -> emitPlaybackStateChanged("buffering")

                        Player.STATE_ENDED -> {
                            emitPlaybackStateChanged("ended")
                            handleStandaloneItemCompleted()
                        }
                    }
                }

                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    Log.d(TAG, "[Standalone] Is playing: $isPlaying")
                    if (isPlaying) {
                        val currentItem = items.getOrNull(currentIndex)
                        Log.d(TAG, "[Standalone] Now playing: ${currentItem?.metadata?.title}")
                        emitPlaybackStateChanged("playing")
                    } else {
                        emitPlaybackStateChanged("paused")
                    }
                }

                override fun onPlayerError(error: PlaybackException) {
                    Log.e(TAG, "[Standalone] Playback error: ${error.message}", error)
                    handleStandaloneItemError(error)
                }
            }

            // Route through holder — becomes the canonical (sole) audio player (inv. 1 + 2).
            standalonePlayer = CanonicalPlayerHolder.getOrCreate(reactApplicationContext) { ctx ->
                ExoPlayer.Builder(ctx).build().apply {
                    setAudioAttributes(
                        androidx.media3.common.AudioAttributes.Builder()
                            .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                            .setUsage(C.USAGE_MEDIA)
                            .build(),
                        true // PLAYER-278 (Option C): media3 owns focus for the canonical player
                    )
                    Log.d(TAG, "[Standalone/Canonical] ExoPlayer created via CanonicalPlayerHolder")
                }
            }.apply {
                addListener(playerListener)
            }

            // PLAYER-278 (Option C): the canonical player owns focus via media3
            // (handleAudioFocus=true above). Do NOT also run the manual focus listener — that
            // double-ownership is what left the COORDINATED path without an owner on AA-connect.

            Log.d(TAG, "[Standalone] Setup complete (canonical)")
        } catch (e: Exception) {
            Log.e(TAG, "[Standalone] Failed to setup: ${e.message}", e)
        }
    }

    private fun requestAudioFocus() {
        if (hasAudioFocus) {
            Log.d(TAG, "[Standalone] Already has audio focus")
            return
        }

        Log.d(TAG, "[Standalone] Requesting audio focus...")

        val manager = ContextCompat.getSystemService(reactApplicationContext, AudioManager::class.java)

        val focusRequest = AudioFocusRequestCompat.Builder(AudioManagerCompat.AUDIOFOCUS_GAIN)
            .setOnAudioFocusChangeListener { focusChange ->
                Log.d(TAG, "[Standalone] Audio focus changed: $focusChange")
                when (focusChange) {
                    AudioManager.AUDIOFOCUS_GAIN -> {
                        Log.d(TAG, "[Standalone] Audio focus GAINED")
                        hasAudioFocus = true
                        standalonePlayer?.volume = 1.0f
                        if (pausedDueToFocusLoss && isPlaybackActive) {
                            pausedDueToFocusLoss = false
                            standalonePlayer?.play()
                            Log.d(TAG, "[Standalone] Resumed after focus loss")
                        } else {
                            Log.d(TAG, "[Standalone] Not auto-resuming (no focus-loss pause pending)")
                        }
                    }

                    AudioManager.AUDIOFOCUS_LOSS -> {
                        // Permanent loss. Typical sources:
                        //   - Another in-app focus owner (RNTP MusicService) requesting GAIN
                        //     while we are playing. This is an internal sync glitch and we
                        //     want to reclaim quickly so playback continues uninterrupted.
                        //   - An external media app (Spotify, YouTube Music…) taking over.
                        //     Reclaiming here is aggressive but preserves prior behaviour.
                        //
                        // We cannot tell the two apart from the callback alone, so we keep
                        // the reclaim-with-delay strategy. Driver-distraction-safe because
                        // Assistant / calls / navigation use AUDIOFOCUS_LOSS_TRANSIENT, not
                        // AUDIOFOCUS_LOSS — handled in the branch below.
                        Log.d(TAG, "[Standalone] Audio focus LOST - will attempt reclaim")
                        hasAudioFocus = false
                        pausedDueToFocusLoss = true
                        standalonePlayer?.pause()
                        handler.postDelayed({
                            if (standalonePlayer != null && isPlaybackActive && !hasAudioFocus) {
                                Log.d(TAG, "[Standalone] Re-requesting audio focus after loss...")
                                requestAudioFocus()
                            }
                        }, 500)
                    }

                    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                        // Transient loss. This is the Android Auto driver-distraction case:
                        // Google Assistant, phone call, navigation turn-by-turn prompt.
                        // Policy mandates we pause and wait for the system to grant focus
                        // back. Reclaiming here would re-fail the Play Store review.
                        Log.d(TAG, "[Standalone] Audio focus LOST transient - pausing, waiting for GAIN")
                        hasAudioFocus = false
                        pausedDueToFocusLoss = true
                        standalonePlayer?.pause()
                    }

                    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                        Log.d(TAG, "[Standalone] Audio focus DUCK - reducing volume")
                        standalonePlayer?.volume = 0.3f
                    }
                }
            }
            .setAudioAttributes(
                AudioAttributesCompat.Builder()
                    .setUsage(AudioAttributesCompat.USAGE_MEDIA)
                    .setContentType(AudioAttributesCompat.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setWillPauseWhenDucked(true)
            .build()

        audioFocusRequest = focusRequest

        val result: Int = if (manager != null) {
            AudioManagerCompat.requestAudioFocus(manager, focusRequest)
        } else {
            Log.e(TAG, "[Standalone] AudioManager is null")
            AudioManager.AUDIOFOCUS_REQUEST_FAILED
        }

        hasAudioFocus = (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED)

        if (hasAudioFocus) {
            Log.d(TAG, "[Standalone] Audio focus GRANTED")
        } else {
            Log.e(TAG, "[Standalone] Audio focus DENIED")
        }
    }

    private fun abandonAudioFocus() {
        if (!hasAudioFocus) return

        Log.d(TAG, "[Standalone] Abandoning audio focus...")

        val manager = ContextCompat.getSystemService(reactApplicationContext, AudioManager::class.java)
        audioFocusRequest?.let { request ->
            if (manager != null) {
                AudioManagerCompat.abandonAudioFocusRequest(manager, request)
            }
        }

        hasAudioFocus = false
        Log.d(TAG, "[Standalone] Audio focus abandoned")
    }

    private fun loadCurrentItem() {
        val player = standalonePlayer
        if (player == null) {
            Log.e(TAG, "[Standalone] Cannot load item: player is null")
            return
        }

        val currentItem = items.getOrNull(currentIndex)
        if (currentItem == null) {
            Log.e(TAG, "[Standalone] Cannot load item: no item at index $currentIndex")
            return
        }

        try {
            Log.d(TAG, "[Standalone] Loading item: ${currentItem.metadata.title}")
            Log.d(TAG, "[Standalone] URI: ${currentItem.source.uri}")
            Log.d(TAG, "[Standalone] Type: ${currentItem.source.type}")

            // Check if item has DRM
            val drm = currentItem.source.drm
            if (drm != null) {
                Log.d(TAG, "[Standalone] Item has DRM configuration: ${drm.type}")
                Log.d(TAG, "[Standalone] License server: ${drm.licenseServer}")
                Log.d(TAG, "[Standalone] Multi-session: ${drm.multiSession}")
            }

            // Build MediaItem with DRM support
            // PLAYER-278: attach the queue item's metadata to the MediaItem — the MediaSession
            // derives its public metadata (lock-screen/widget/Android Auto now-playing) from
            // player.mediaMetadata; without title gearhead cancels the now-playing stream item
            // ("Invalid metadata, no title and subtitle").
            val mediaItem = DrmHelper.buildMediaItemWithDrm(
                uri = currentItem.source.uri,
                drm = drm
            ).buildUpon()
                .setMediaId(currentItem.id)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(currentItem.metadata.title)
                        .setSubtitle(currentItem.metadata.subtitle)
                        .setArtist(currentItem.metadata.artist)
                        .setAlbumTitle(currentItem.metadata.album)
                        .setArtworkUri(currentItem.metadata.imageUri?.let { Uri.parse(it) })
                        .build()
                )
                .build()

            player.setMediaItem(mediaItem)
            player.prepare()
            player.play()

            isPlaybackActive = true

            Log.d(TAG, "[Standalone] Item loaded and playing")

            // Emit started event
            emitItemStarted(currentItem)
            itemsStartedSet.add(currentItem.id)
        } catch (e: Exception) {
            Log.e(TAG, "[Standalone] Failed to load item: ${e.message}", e)

            // Emit error event
            val currentItem = items.getOrNull(currentIndex)
            if (currentItem != null) {
                emitItemError(currentItem, e.message ?: "Unknown error loading item")
            }
        }
    }

    private fun handleStandaloneItemCompleted() {
        Log.d(TAG, "[Standalone] Item completed")

        val currentItem = items.getOrNull(currentIndex)
        if (currentItem != null) {
            emitItemCompleted(currentItem)
        }

        // Auto-advance if enabled
        if (config.autoNext) {
            advanceToNextItemStandalone()
        }
    }

    private fun handleStandaloneItemError(error: PlaybackException) {
        Log.e(TAG, "[Standalone] Item error: ${error.message}")

        val currentItem = items.getOrNull(currentIndex)
        if (currentItem != null) {
            emitItemError(currentItem, error.message ?: "Unknown error")
        }

        // Skip to next if skipOnError is enabled
        if (config.skipOnError) {
            Log.d(TAG, "[Standalone] Skipping to next item due to error")
            advanceToNextItemStandalone()
        }
    }

    private fun advanceToNextItemStandalone() {
        val nextIndex = getNextIndex()

        if (nextIndex == -1) {
            Log.d(TAG, "🏁 [Standalone] Playlist ended")
            isPlaybackActive = false
            releaseStandalonePlayer()
            emitPlaylistEnded()
            return
        }

        val previousIndex = currentIndex
        currentIndex = nextIndex
        val nextItem = items[currentIndex]

        Log.d(TAG, "[Standalone] Advancing to next item: ${nextItem.metadata.title}")

        // Emit event
        emitItemChanged(nextItem, currentIndex, previousIndex)

        // Load next item
        loadCurrentItem()
    }

    private fun releaseStandalonePlayer() {
        standalonePlayer?.let { player ->
            Log.d(TAG, "[Standalone] Releasing player...")
            // PLAYER-269 (inv. 2): The canonical player's lifetime is owned by
            // VideoPlaybackService, not the React/module layer. Abandon focus but do NOT
            // release the player if the service still holds it as canonical.
            if (CanonicalPlayerHolder.isCanonical(player)) {
                Log.d(TAG, "[Standalone] Skipping release — player is canonical (service-owned, inv. 2)")
            } else {
                player.stop()
                player.release()
                Log.d(TAG, "[Standalone] Player released")
            }
            standalonePlayer = null
        }

        abandonAudioFocus()
        isPlaybackActive = false
    }

    // ========== Event Emitters ==========

    private fun emitItemChanged(item: PlaylistItem, index: Int, previousIndex: Int) {
        Log.d(TAG, "📤 Emitting EVENT_ITEM_CHANGED: itemId=${item.id}, index=$index, previousIndex=$previousIndex, title=${item.metadata.title}")
        sendEvent(
            EVENT_ITEM_CHANGED,
            Arguments.createMap().apply {
                putString("itemId", item.id)
                putInt("index", index)
                putInt("previousIndex", previousIndex)
                putMap("item", item.toMap())
                putInt("totalItems", items.size)
                putDouble("timestamp", System.currentTimeMillis().toDouble())
            }
        )
        Log.d(TAG, "✅ EVENT_ITEM_CHANGED emitted successfully")
    }

    private fun emitItemStarted(item: PlaylistItem) {
        sendEvent(
            EVENT_ITEM_STARTED,
            Arguments.createMap().apply {
                putString("itemId", item.id)
                putInt("index", currentIndex)
                putDouble("timestamp", System.currentTimeMillis().toDouble())
            }
        )
    }

    private fun emitItemCompleted(item: PlaylistItem) {
        sendEvent(
            EVENT_ITEM_COMPLETED,
            Arguments.createMap().apply {
                putString("itemId", item.id)
                putInt("index", currentIndex)
                putDouble("timestamp", System.currentTimeMillis().toDouble())
            }
        )
    }

    private fun emitItemError(item: PlaylistItem, errorMessage: String) {
        sendEvent(
            EVENT_ITEM_ERROR,
            Arguments.createMap().apply {
                putString("itemId", item.id)
                putInt("index", currentIndex)
                putString("errorMessage", errorMessage)
                putDouble("timestamp", System.currentTimeMillis().toDouble())
            }
        )
    }

    private fun emitPlaylistEnded() {
        sendEvent(
            EVENT_PLAYLIST_ENDED,
            Arguments.createMap().apply {
                putDouble("timestamp", System.currentTimeMillis().toDouble())
            }
        )
    }

    private fun emitControlAction(action: String, params: WritableMap? = null) {
        val eventData = params ?: Arguments.createMap()
        eventData.putString("action", action)
        eventData.putInt("currentIndex", currentIndex)
        eventData.putDouble("timestamp", System.currentTimeMillis().toDouble())
        sendEvent(EVENT_CONTROL_ACTION, eventData)
    }

    private fun emitPlaybackStateChanged(state: String) {
        val currentItem = items.getOrNull(currentIndex)
        sendEvent(
            EVENT_PLAYBACK_STATE_CHANGED,
            Arguments.createMap().apply {
                putString("state", state) // "playing", "paused", "stopped", "buffering", "ended"
                putString("itemId", currentItem?.id ?: "")
                putInt("index", currentIndex)
                putString("mode", if (config.coordinatedMode) "coordinated" else "standalone")
                putDouble("timestamp", System.currentTimeMillis().toDouble())

                // Información adicional en modo standalone
                if (!config.coordinatedMode && standalonePlayer != null) {
                    putBoolean("isPlaying", standalonePlayer?.isPlaying ?: false)
                    putDouble("position", standalonePlayer?.currentPosition?.toDouble() ?: 0.0)
                    putDouble("duration", standalonePlayer?.duration?.toDouble() ?: 0.0)
                }
            }
        )
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
