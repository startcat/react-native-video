package com.brentvatne.react.playlist

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
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
        
        // Broadcast actions
        const val ACTION_VIDEO_ITEM_FINISHED = "com.brentvatne.react.VIDEO_ITEM_FINISHED"
        const val ACTION_LOAD_NEXT_SOURCE = "com.brentvatne.react.LOAD_NEXT_SOURCE"
        
        // Event names (match iOS)
        private const val EVENT_ITEM_CHANGED = "onNativeItemChanged"
        private const val EVENT_ITEM_STARTED = "onNativeItemStarted"
        private const val EVENT_ITEM_COMPLETED = "onNativeItemCompleted"
        private const val EVENT_ITEM_ERROR = "onNativeItemError"
        private const val EVENT_PLAYLIST_ENDED = "onNativePlaylistEnded"
        private const val EVENT_PROGRESS_UPDATED = "onNativeProgressUpdate"
    }

    private val handler = Handler(Looper.getMainLooper())
    private val items = mutableListOf<PlaylistItem>()
    private var currentIndex: Int = 0
    private var config = PlaylistConfiguration()
    private var isPlaybackActive = false
    private var hasSetupMediaSession = false

    private val broadcastReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                ACTION_VIDEO_ITEM_FINISHED -> {
                    val itemId = intent.getStringExtra("itemId")
                    Log.d(TAG, "🎬 Video item finished: $itemId")
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
            
            Log.d(TAG, "📡 Broadcast receiver registered successfully for playlist coordination")
            Log.d(TAG, "📡 Listening for action: $ACTION_VIDEO_ITEM_FINISHED")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to register broadcast receiver", e)
        }
    }

    override fun getName(): String = MODULE_NAME

    override fun invalidate() {
        super.invalidate()
        try {
            reactApplicationContext.unregisterReceiver(broadcastReceiver)
        } catch (e: IllegalArgumentException) {
            // Receiver was already unregistered
            Log.d(TAG, "Broadcast receiver already unregistered")
        }
    }

    override fun getConstants(): Map<String, Any> {
        return mapOf(
            "EVENT_ITEM_CHANGED" to EVENT_ITEM_CHANGED,
            "EVENT_ITEM_STARTED" to EVENT_ITEM_STARTED,
            "EVENT_ITEM_COMPLETED" to EVENT_ITEM_COMPLETED,
            "EVENT_ITEM_ERROR" to EVENT_ITEM_ERROR,
            "EVENT_PLAYLIST_ENDED" to EVENT_PLAYLIST_ENDED,
            "EVENT_PROGRESS_UPDATED" to EVENT_PROGRESS_UPDATED
        )
    }

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
        Log.d(TAG, "✅ PlaylistControlModule is ready and responding")
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
                var successCount = 0
                var failCount = 0
                
                for (i in 0 until itemsArray.size()) {
                    val item = PlaylistItem.fromMap(itemsArray.getMap(i))
                    if (item != null) {
                        items.add(item)
                        successCount++
                    } else {
                        failCount++
                        Log.w(TAG, "⚠️ Failed to parse item at index $i")
                    }
                }
                
                Log.d(TAG, "📋 Playlist loaded: $successCount items parsed successfully, $failCount failed")
                
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
                        Log.w(TAG, "⚠️ Requested startAt=$requestedIndex adjusted to $currentIndex (max=${items.size - 1})")
                    }
                } else {
                    currentIndex = 0
                }
                
                if (configMap.hasKey("config")) {
                    try {
                        config = PlaylistConfiguration.fromMap(configMap.getMap("config"))
                        Log.d(TAG, "⚙️ Config: autoNext=${config.autoNext}, repeatMode=${config.repeatMode}, shuffle=${config.shuffleEnabled}")
                    } catch (e: Exception) {
                        Log.e(TAG, "⚠️ Failed to parse config, using defaults", e)
                        config = PlaylistConfiguration()
                    }
                }
                
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error setting playlist", e)
                promise.reject("PLAYLIST_ERROR", e.message, e)
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
                val item = items[currentIndex]
                
                Log.d(TAG, "🎯 Going to index $index: ${item.metadata.title}")
                
                // Emit event
                emitItemChanged(item, index, previousIndex)
                
                // Send broadcast to ReactExoplayerView
                sendLoadNextSourceBroadcast(item)
                
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

    // ========== Private Methods ==========

    private fun getNextIndex(): Int {
        return when {
            currentIndex < items.size - 1 -> currentIndex + 1
            config.repeatMode == PlaylistRepeatMode.ALL -> 0
            else -> -1
        }
    }

    private fun getPreviousIndex(): Int {
        return when {
            currentIndex > 0 -> currentIndex - 1
            config.repeatMode == PlaylistRepeatMode.ALL -> items.size - 1
            else -> -1
        }
    }

    private fun handleItemCompletionInCoordinatedMode(itemId: String?) {
        val currentItem = items.getOrNull(currentIndex) ?: return
        
        if (itemId != null && currentItem.id != itemId) {
            Log.w(TAG, "⚠️ Item ID mismatch: expected ${currentItem.id}, got $itemId")
        }
        
        // Emit completion event
        emitItemCompleted(currentItem)
        
        Log.d(TAG, "📊 Item completed: ${currentItem.id}")
        
        // Auto-advance if enabled
        if (config.autoNext || currentItem.type == PlaylistItemType.TUDUM) {
            advanceToNextItem()
        }
    }

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
        
        Log.d(TAG, "⏭️ Advancing to next item: ${nextItem.metadata.title}")
        
        // Emit event
        emitItemChanged(nextItem, currentIndex, previousIndex)
        
        // Send broadcast to ReactExoplayerView
        sendLoadNextSourceBroadcast(nextItem)
    }

    private fun sendLoadNextSourceBroadcast(item: PlaylistItem) {
        val intent = Intent(ACTION_LOAD_NEXT_SOURCE).apply {
            putExtra("itemId", item.id)
            putExtra("uri", item.source.uri)
            putExtra("type", item.source.type)
            // TODO: Add headers support
        }
        reactApplicationContext.sendBroadcast(intent)
    }

    private fun setupStandaloneMode() {
        // TODO: Implement standalone mode
        // - Create ExoPlayer instance
        // - Setup MediaSession
        // - Setup notification
        // - Load first item
        Log.d(TAG, "⚠️ Standalone mode not yet implemented")
    }

    private fun loadCurrentItem() {
        // TODO: Load item in standalone player
        Log.d(TAG, "⚠️ loadCurrentItem not yet implemented")
    }

    // ========== Event Emitters ==========

    private fun emitItemChanged(item: PlaylistItem, index: Int, previousIndex: Int) {
        sendEvent(EVENT_ITEM_CHANGED, Arguments.createMap().apply {
            putString("itemId", item.id)
            putInt("index", index)
            putInt("previousIndex", previousIndex)
            putMap("item", item.toMap())
            putInt("totalItems", items.size)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        })
    }

    private fun emitItemCompleted(item: PlaylistItem) {
        sendEvent(EVENT_ITEM_COMPLETED, Arguments.createMap().apply {
            putString("itemId", item.id)
            putInt("index", currentIndex)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        })
    }

    private fun emitPlaylistEnded() {
        sendEvent(EVENT_PLAYLIST_ENDED, Arguments.createMap().apply {
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        })
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
