package com.brentvatne.exoplayer

import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.DeviceInfo
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Metadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import androidx.media3.common.TrackSelectionParameters
import androidx.media3.common.Tracks
import androidx.media3.common.VideoSize
import androidx.media3.common.text.Cue
import androidx.media3.common.text.CueGroup
import com.brentvatne.react.AndroidAutoModule
import java.util.concurrent.CopyOnWriteArraySet

/**
 * PLAYER-281: a [ForwardingPlayer] that augments the canonical ExoPlayer's available commands with
 * the seek-to-next / seek-to-previous commands based on the JS playlist position
 * ([PlaylistQueueState]). This is what makes the next/previous transport buttons appear AND route on
 * the car / lock-screen / phone notification, even though the underlying ExoPlayer only ever holds
 * one MediaItem (the queue lives in `PlaylistControlModule`).
 *
 * Both command flavours are advertised on purpose:
 * - `COMMAND_SEEK_TO_NEXT` / `COMMAND_SEEK_TO_PREVIOUS` → media3 renders the buttons + sets the
 *   legacy `PlaybackStateCompat.ACTION_SKIP_TO_*`.
 * - `COMMAND_SEEK_TO_NEXT_MEDIA_ITEM` / `COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM` → REQUIRED because a
 *   framework/legacy controller (e.g. the Samsung media widget / lock-screen) maps `skipToNext()` to
 *   `player.seekToNextMediaItem()`; without the MEDIA_ITEM command the tap is rejected BEFORE
 *   `onPlayerCommandRequest` ever runs (the button shows but does nothing — verified on-device).
 *
 * The button TAP is routed by `VideoLibraryCallback.onPlayerCommandRequest` (PLAYER-268) →
 * `AndroidAutoModule.notifySkipTo*` → JS `PlaylistControl.next()/previous()`. Each next/previous
 * loads a new single MediaItem (`setMediaItem`) → `onMediaItemTransition` → media3 re-queries
 * `getAvailableCommands` → the buttons refresh for the new position.
 *
 * PLAYER-300: additionally exposes the JS queue as a SYNTHETIC N-window [Timeline] so gearhead
 * paints the full Now Playing queue. media3 1.1.1 publishes the legacy queue from the session
 * player's timeline (`MediaSessionLegacyStub.updateQueue`: one `QueueItem` per window, id = window
 * index) and a queue-item tap arrives as `onSkipToQueueItem(queueId)` →
 * `playerWrapper.seekToDefaultPosition(queueId)`. So:
 * - [getCurrentTimeline] / [getMediaItemCount] / [getMediaItemAt] / [getCurrentMediaItemIndex] /
 *   [getCurrentPeriodIndex] are overridden from [PlaylistQueueState.snapshot] while the GATE holds
 *   (queue > 1 item AND the raw player's current mediaId matches the queue's current item — a
 *   mismatch means the queue is stale for what's actually playing, e.g. a fresh play-from-browse
 *   before JS re-publishes, and we fall back to the raw single-item behaviour).
 * - [seekTo]/[seekToDefaultPosition] with a media-item index are intercepted and routed to JS
 *   (`AndroidAutoModule.notifySkipToQueueItem` → `PlaylistControl.goToIndex`): the raw player NEVER
 *   seeks across the synthetic windows — it only ever holds one real item; streams resolve in JS.
 * - [addListener] wraps the session's listener so `onTimelineChanged` payloads (raw, 1 window) are
 *   substituted with the synthetic timeline — media3's `PlayerListener.onTimelineChanged` copies
 *   the PAYLOAD into `playerInfo` and re-publishes the legacy queue from it, so without this the
 *   queue would collapse back to 1 item on every JS item swap (`setMediaItem`).
 * - Queue-content changes with no raw-player event (PLAYER-282 incremental appends) re-fire a
 *   synthetic `onTimelineChanged(TIMELINE_CHANGE_REASON_PLAYLIST_CHANGED)` (debounced) via the
 *   [PlaylistQueueState.onQueueChanged] hook.
 *
 * Wrap ONLY the instance handed to the `MediaLibrarySession`; every other caller keeps operating on
 * the raw ExoPlayer ([getWrappedPlayer] exposes it).
 */
class PlaylistAwareForwardingPlayer(player: Player) : ForwardingPlayer(player) {

    companion object {
        private const val TAG = "PlaylistAwareFwdPlayer"

        /**
         * PLAYER-300: coalesce queue-content bursts (incremental appends after a fast-start,
         * PLAYER-282) into one timeline re-publish. Index changes are NOT delayed by this — the
         * raw player's own `setMediaItem` timeline event propagates them immediately (substituted
         * with the synthetic timeline by the listener wrapper).
         */
        private const val QUEUE_PUBLISH_DEBOUNCE_MS = 150L
    }

    /** Listeners added through this wrapper (i.e. by the MediaSession), for synthetic re-fires. */
    private val queueListeners = CopyOnWriteArraySet<QueueAwareListener>()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val publishRunnable = Runnable { fireQueueTimelineChanged() }

    /**
     * PLAYER-303: synthetic playback error raised from JS (`AndroidAutoModule.reportPlaybackError`).
     * media3 1.1.1 has no `MediaSession.sendError()`, but its legacy bridge derives
     * `PlaybackStateCompat` from `getPlayerError()` (`PlayerWrapper.createPlaybackStateCompat` →
     * `MediaUtils.convertToPlaybackStateCompatState`: non-null error → STATE_ERROR + errorMessage),
     * which is what gearhead renders. Exposing the error here — on the player the session wraps —
     * is the only seam that reaches that branch without touching media3 internals.
     * Cleared automatically when the raw player starts a new load (BUFFERING/READY), see
     * [clearSyntheticErrorOnRecovery].
     */
    @Volatile
    private var syntheticError: PlaybackException? = null

    init {
        // PLAYER-300: re-publish the timeline when the JS queue content changes without any
        // raw-player event. Last-writer-wins on purpose: only the wrapper currently attached to
        // the session matters (re-attach builds a new wrapper). Cleared by PlaylistQueueState.reset().
        PlaylistQueueState.onQueueChanged = {
            mainHandler.removeCallbacks(publishRunnable)
            mainHandler.postDelayed(publishRunnable, QUEUE_PUBLISH_DEBOUNCE_MS)
        }
    }

    // ------------------------------------------------------------------
    // PLAYER-281: command augmentation (next/previous visibility)
    // ------------------------------------------------------------------

    override fun getAvailableCommands(): Player.Commands {
        val base = super.getAvailableCommands()
        val queueActive = syntheticQueue() != null
        if (!PlaylistQueueState.hasNext && !PlaylistQueueState.hasPrevious && !queueActive) {
            return base
        }
        val builder = base.buildUpon()
        if (PlaylistQueueState.hasNext) {
            builder.add(Player.COMMAND_SEEK_TO_NEXT)
            builder.add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
        }
        if (PlaylistQueueState.hasPrevious) {
            builder.add(Player.COMMAND_SEEK_TO_PREVIOUS)
            builder.add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
        }
        if (queueActive) {
            // PLAYER-300: queue-item taps (legacy ACTION_SKIP_TO_QUEUE_ITEM). ExoPlayer already
            // advertises COMMAND_SEEK_TO_MEDIA_ITEM whenever it is not playing an ad; this is
            // belt-and-suspenders so the queue stays tappable no matter the raw player state.
            builder.add(Player.COMMAND_SEEK_TO_MEDIA_ITEM)
        }
        return builder.build()
    }

    // ------------------------------------------------------------------
    // PLAYER-300: synthetic queue timeline
    // ------------------------------------------------------------------

    /**
     * The consistency GATE: returns the queue snapshot only when it describes what the raw player
     * is actually playing. `PlaylistControlModule.loadCurrentItem` sets `mediaId = item.id` on the
     * real MediaItem, and the snapshot items carry the same ids, so a match means JS queue state
     * and native playback are in sync. On mismatch (stale queue, fresh browse play not yet
     * re-published by JS, coordinated-mode sources without mediaId) we fall back to the raw
     * single-item behaviour — exactly the pre-PLAYER-300 status quo.
     */
    private fun syntheticQueue(): PlaylistQueueState.QueueSnapshot? {
        val snap = PlaylistQueueState.snapshot
        if (snap.items.size <= 1) return null
        if (snap.index !in snap.items.indices) return null
        val playingId = wrappedPlayer.currentMediaItem?.mediaId ?: return null
        if (playingId != snap.items[snap.index].mediaId) return null
        return snap
    }

    override fun getCurrentTimeline(): Timeline {
        val snap = syntheticQueue() ?: return super.getCurrentTimeline()
        return QueueTimeline(snap.items)
    }

    override fun getCurrentMediaItemIndex(): Int = syntheticQueue()?.index ?: super.getCurrentMediaItemIndex()

    override fun getCurrentPeriodIndex(): Int = syntheticQueue()?.index ?: super.getCurrentPeriodIndex()

    override fun getMediaItemCount(): Int = syntheticQueue()?.items?.size ?: super.getMediaItemCount()

    override fun getMediaItemAt(index: Int): MediaItem {
        val snap = syntheticQueue() ?: return super.getMediaItemAt(index)
        return snap.items[index]
    }

    // ------------------------------------------------------------------
    // PLAYER-300: queue-item tap routing (gearhead onSkipToQueueItem)
    // ------------------------------------------------------------------

    override fun seekToDefaultPosition(mediaItemIndex: Int) {
        if (routeQueueSeek(mediaItemIndex, C.TIME_UNSET)) return
        super.seekToDefaultPosition(mediaItemIndex)
    }

    override fun seekTo(mediaItemIndex: Int, positionMs: Long) {
        if (routeQueueSeek(mediaItemIndex, positionMs)) return
        super.seekTo(mediaItemIndex, positionMs)
    }

    /**
     * Returns true when the indexed seek was handled (routed to the JS playlist, mapped onto the
     * raw single-item window, or safely dropped). False → delegate to the raw player untouched.
     */
    private fun routeQueueSeek(index: Int, positionMs: Long): Boolean {
        val snap = syntheticQueue()
        if (snap == null) {
            // No synthetic queue active: protect the raw single-item player from stale gearhead
            // queue ids (an IllegalSeekPositionException here would kill playback).
            if (index >= super.getMediaItemCount()) {
                Log.w(TAG, "Dropping seekTo(mediaItem=$index) — no JS queue and raw timeline is smaller")
                return true
            }
            return false
        }
        if (index == snap.index) {
            // Same item → map onto the raw player's single window (restart / in-item seek).
            if (positionMs == C.TIME_UNSET) super.seekToDefaultPosition() else super.seekTo(positionMs)
            return true
        }
        if (index !in snap.items.indices) {
            Log.w(TAG, "Dropping seekTo(mediaItem=$index) — outside JS queue (size=${snap.items.size})")
            return true
        }
        Log.d(TAG, "Queue item tap → JS goToIndex($index) (PLAYER-300)")
        AndroidAutoModule.notifySkipToQueueItem(index)
        return true
    }

    // ------------------------------------------------------------------
    // PLAYER-300 V2: media-item guard (the raw player must NEVER receive URI-less items)
    // ------------------------------------------------------------------
    //
    // The legacy stub turns every gearhead `playFromMediaId` into `handleMediaRequest` →
    // (default) `onSetMediaItems` → `VideoLibraryCallback.onAddMediaItems` — whose RETURN VALUE
    // (the metadata-only, URI-less request items; streams resolve in JS) is then set straight on
    // the session player: `PlayerWrapper.setMediaItems` → here → raw ExoPlayer →
    // `DefaultMediaSourceFactory.createMediaSource` NPE (`localConfiguration` checkNotNull).
    // PRE-EXISTING (the chain predates PLAYER-300 and was merely invisible: every evidence-297
    // logcat was captured gearhead-pid-only) and swallowed by AbstractFuture BEFORE mutating the
    // raw player — the real play is triggered by onAddMediaItems' side effects
    // (queueCarPlayRequest / notifyJavaScriptPlayRequest, PLAYER-280/286). Dropping the call here
    // is behaviourally identical to today's NPE (nothing reached the raw player either way),
    // minus the error: cold-start play keeps flowing through JS exactly as device-verified.
    //
    // Mixed lists are dropped whole (never observed: stub requests are all-or-nothing, and the
    // direct cache-hit branch sets its URI-ful item on the RAW player, not through this wrapper)
    // — partial forwarding would silently corrupt startIndex semantics.

    /** Returns true (and WARNs) when [items] must not reach the raw player (any item lacks a URI). */
    private fun dropUriLessItems(items: List<MediaItem>, op: String): Boolean {
        val uriLess = items.count { it.localConfiguration == null }
        if (uriLess == 0) return false
        Log.w(
            TAG,
            "$op: dropping $uriLess/${items.size} URI-less item(s) — queue items are metadata-only, playback resolves in JS (PLAYER-300)"
        )
        return true
    }

    override fun setMediaItems(mediaItems: MutableList<MediaItem>) {
        if (dropUriLessItems(mediaItems, "setMediaItems")) return
        super.setMediaItems(mediaItems)
    }

    override fun setMediaItems(mediaItems: MutableList<MediaItem>, resetPosition: Boolean) {
        if (dropUriLessItems(mediaItems, "setMediaItems(resetPosition)")) return
        super.setMediaItems(mediaItems, resetPosition)
    }

    override fun setMediaItems(mediaItems: MutableList<MediaItem>, startIndex: Int, startPositionMs: Long) {
        if (dropUriLessItems(mediaItems, "setMediaItems(startIndex=$startIndex)")) return
        super.setMediaItems(mediaItems, startIndex, startPositionMs)
    }

    override fun setMediaItem(mediaItem: MediaItem) {
        if (dropUriLessItems(listOf(mediaItem), "setMediaItem")) return
        super.setMediaItem(mediaItem)
    }

    override fun setMediaItem(mediaItem: MediaItem, startPositionMs: Long) {
        if (dropUriLessItems(listOf(mediaItem), "setMediaItem(startPositionMs)")) return
        super.setMediaItem(mediaItem, startPositionMs)
    }

    override fun setMediaItem(mediaItem: MediaItem, resetPosition: Boolean) {
        if (dropUriLessItems(listOf(mediaItem), "setMediaItem(resetPosition)")) return
        super.setMediaItem(mediaItem, resetPosition)
    }

    override fun addMediaItem(mediaItem: MediaItem) {
        if (dropUriLessItems(listOf(mediaItem), "addMediaItem")) return
        super.addMediaItem(mediaItem)
    }

    override fun addMediaItem(index: Int, mediaItem: MediaItem) {
        if (dropUriLessItems(listOf(mediaItem), "addMediaItem(index=$index)")) return
        super.addMediaItem(index, mediaItem)
    }

    override fun addMediaItems(mediaItems: MutableList<MediaItem>) {
        if (dropUriLessItems(mediaItems, "addMediaItems")) return
        super.addMediaItems(mediaItems)
    }

    override fun addMediaItems(index: Int, mediaItems: MutableList<MediaItem>) {
        if (dropUriLessItems(mediaItems, "addMediaItems(index=$index)")) return
        super.addMediaItems(index, mediaItems)
    }

    // ------------------------------------------------------------------
    // PLAYER-300: listener wrapping (timeline payload substitution)
    // ------------------------------------------------------------------

    override fun addListener(listener: Player.Listener) {
        val wrapped = QueueAwareListener(this, listener)
        queueListeners.add(wrapped)
        // super wraps again in media3's ForwardingListener (player substitution for onEvents) and
        // registers on the raw player; removal below relies on equals(), mirroring media3's own
        // add/remove contract.
        super.addListener(wrapped)
    }

    override fun removeListener(listener: Player.Listener) {
        val wrapped = QueueAwareListener(this, listener)
        queueListeners.remove(wrapped)
        super.removeListener(wrapped)
    }

    /**
     * Re-emits the (possibly synthetic) timeline to the session listener(s). media3's
     * `MediaSessionImpl.PlayerListener.onTimelineChanged` does all its work inside the individual
     * callback (playerInfo copy + legacy queue re-publish) — no `onEvents` needed (verified on
     * media3 1.1.1 sources).
     */
    private fun fireQueueTimelineChanged() {
        val timeline = getCurrentTimeline()
        for (l in queueListeners) {
            try {
                l.inner.onTimelineChanged(timeline, Player.TIMELINE_CHANGE_REASON_PLAYLIST_CHANGED)
            } catch (e: Exception) {
                Log.w(TAG, "queue timeline re-publish failed: ${e.message}")
            }
        }
    }

    // ------------------------------------------------------------------
    // PLAYER-303: synthetic playback error (JS play-flow failures → car UI)
    // ------------------------------------------------------------------

    override fun getPlayerError(): PlaybackException? = syntheticError ?: super.getPlayerError()

    /**
     * Raises a synthetic [PlaybackException] towards the session listener(s) so the legacy bridge
     * publishes STATE_ERROR + [message] (gearhead exits its loading state and shows the message).
     * Must be called on the main thread (same contract as every other session-facing call here).
     * media3's `MediaSessionImpl.PlayerListener.onPlayerError` republishes the legacy playback
     * state inside the individual callback — no `onEvents` needed (same pattern as
     * [fireQueueTimelineChanged], verified on media3 1.1.1 sources).
     */
    fun raiseSyntheticError(message: String) {
        val error = PlaybackException(message, null, PlaybackException.ERROR_CODE_UNSPECIFIED)
        syntheticError = error
        Log.i(TAG, "raiseSyntheticError: publishing STATE_ERROR towards session — $message (PLAYER-303)")
        for (l in queueListeners) {
            try {
                l.inner.onPlayerErrorChanged(error)
                l.inner.onPlayerError(error)
            } catch (e: Exception) {
                Log.w(TAG, "synthetic error publish failed: ${e.message}")
            }
        }
    }

    /**
     * The error must not outlive the failure it describes: the next real load on the raw player
     * (BUFFERING/READY) clears it BEFORE the state change is forwarded, so the very same event's
     * legacy re-publish already reads a clean `getPlayerError()`.
     */
    internal fun clearSyntheticErrorOnRecovery(playbackState: Int) {
        if (syntheticError != null &&
            (playbackState == Player.STATE_BUFFERING || playbackState == Player.STATE_READY)
        ) {
            syntheticError = null
            Log.i(TAG, "synthetic error cleared — playback recovering (state=$playbackState) (PLAYER-303)")
        }
    }

    /**
     * Substitutes `onTimelineChanged` payloads with the wrapper's current (synthetic) timeline and
     * EXPLICITLY forwards every other [Player.Listener] callback to [inner].
     *
     * PLAYER-300 V2 (P0 regression fix): the original implementation used Kotlin interface
     * delegation (`: Player.Listener by inner`). [Player.Listener] is a JAVA interface whose
     * methods are all default methods, and Kotlin delegation does NOT generate delegating
     * overrides for Java default methods — the compiled class only had `onTimelineChanged`
     * (dexdump-verified), so the session's PlayerListener never received
     * `onPlaybackStateChanged`/`onIsPlayingChanged`/anything else → legacy `setPlaybackState`
     * stayed frozen in NONE and gearhead never left "obtaining selection".
     *
     * The override set below mirrors media3 1.1.1 `ForwardingPlayer.ForwardingListener`
     * (ForwardingPlayer.java:925-1148) EXACTLY, including its deprecated-method behaviour:
     * - `onEvents` forwards with the FORWARDING player (this wrapper), never the raw one.
     * - deprecated `onLoadingChanged` forwards to `onIsLoadingChanged` (like media3).
     * - deprecated `onPlayerStateChanged` / `onPositionDiscontinuity(reason)` / `onCues(List)`
     *   forward to their deprecated counterparts (like media3) — no double-forwarding, because
     *   the default-method chaining happens in the SOURCE listener (the raw player calls both
     *   variants itself), not here.
     *
     * equals/hashCode let [removeListener]'s equals-based unregistration find the matching
     * instance on the raw player's listener set (same contract as media3's own ForwardingListener).
     */
    private class QueueAwareListener(private val player: PlaylistAwareForwardingPlayer, val inner: Player.Listener) : Player.Listener {

        override fun onEvents(p: Player, events: Player.Events) {
            // Replace the player with the forwarding wrapper (mirror of media3 ForwardingListener).
            inner.onEvents(player, events)
        }

        override fun onTimelineChanged(timeline: Timeline, reason: Int) {
            // PLAYER-300: substitute the raw 1-window payload with the synthetic queue timeline.
            inner.onTimelineChanged(player.currentTimeline, reason)
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            inner.onMediaItemTransition(mediaItem, reason)
        }

        override fun onTracksChanged(tracks: Tracks) {
            inner.onTracksChanged(tracks)
        }

        override fun onMediaMetadataChanged(mediaMetadata: MediaMetadata) {
            inner.onMediaMetadataChanged(mediaMetadata)
        }

        override fun onPlaylistMetadataChanged(mediaMetadata: MediaMetadata) {
            inner.onPlaylistMetadataChanged(mediaMetadata)
        }

        override fun onIsLoadingChanged(isLoading: Boolean) {
            inner.onIsLoadingChanged(isLoading)
        }

        @Deprecated("Deprecated in Java")
        override fun onLoadingChanged(isLoading: Boolean) {
            inner.onIsLoadingChanged(isLoading)
        }

        override fun onAvailableCommandsChanged(availableCommands: Player.Commands) {
            inner.onAvailableCommandsChanged(availableCommands)
        }

        override fun onTrackSelectionParametersChanged(parameters: TrackSelectionParameters) {
            inner.onTrackSelectionParametersChanged(parameters)
        }

        @Deprecated("Deprecated in Java")
        @Suppress("DEPRECATION")
        override fun onPlayerStateChanged(playWhenReady: Boolean, playbackState: Int) {
            inner.onPlayerStateChanged(playWhenReady, playbackState)
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            // PLAYER-303: a new real load invalidates any synthetic error before it is forwarded.
            player.clearSyntheticErrorOnRecovery(playbackState)
            inner.onPlaybackStateChanged(playbackState)
        }

        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            inner.onPlayWhenReadyChanged(playWhenReady, reason)
        }

        override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
            inner.onPlaybackSuppressionReasonChanged(playbackSuppressionReason)
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            inner.onIsPlayingChanged(isPlaying)
        }

        override fun onRepeatModeChanged(repeatMode: Int) {
            inner.onRepeatModeChanged(repeatMode)
        }

        override fun onShuffleModeEnabledChanged(shuffleModeEnabled: Boolean) {
            inner.onShuffleModeEnabledChanged(shuffleModeEnabled)
        }

        override fun onPlayerError(error: PlaybackException) {
            inner.onPlayerError(error)
        }

        override fun onPlayerErrorChanged(error: PlaybackException?) {
            inner.onPlayerErrorChanged(error)
        }

        @Deprecated("Deprecated in Java")
        @Suppress("DEPRECATION")
        override fun onPositionDiscontinuity(reason: Int) {
            inner.onPositionDiscontinuity(reason)
        }

        override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
            inner.onPositionDiscontinuity(oldPosition, newPosition, reason)
        }

        override fun onPlaybackParametersChanged(playbackParameters: PlaybackParameters) {
            inner.onPlaybackParametersChanged(playbackParameters)
        }

        override fun onSeekBackIncrementChanged(seekBackIncrementMs: Long) {
            inner.onSeekBackIncrementChanged(seekBackIncrementMs)
        }

        override fun onSeekForwardIncrementChanged(seekForwardIncrementMs: Long) {
            inner.onSeekForwardIncrementChanged(seekForwardIncrementMs)
        }

        override fun onMaxSeekToPreviousPositionChanged(maxSeekToPreviousPositionMs: Long) {
            inner.onMaxSeekToPreviousPositionChanged(maxSeekToPreviousPositionMs)
        }

        override fun onVideoSizeChanged(videoSize: VideoSize) {
            inner.onVideoSizeChanged(videoSize)
        }

        override fun onSurfaceSizeChanged(width: Int, height: Int) {
            inner.onSurfaceSizeChanged(width, height)
        }

        override fun onRenderedFirstFrame() {
            inner.onRenderedFirstFrame()
        }

        override fun onAudioSessionIdChanged(audioSessionId: Int) {
            inner.onAudioSessionIdChanged(audioSessionId)
        }

        override fun onAudioAttributesChanged(audioAttributes: AudioAttributes) {
            inner.onAudioAttributesChanged(audioAttributes)
        }

        override fun onVolumeChanged(volume: Float) {
            inner.onVolumeChanged(volume)
        }

        override fun onSkipSilenceEnabledChanged(skipSilenceEnabled: Boolean) {
            inner.onSkipSilenceEnabledChanged(skipSilenceEnabled)
        }

        @Deprecated("Deprecated in Java")
        @Suppress("DEPRECATION")
        override fun onCues(cues: MutableList<Cue>) {
            inner.onCues(cues)
        }

        override fun onCues(cueGroup: CueGroup) {
            inner.onCues(cueGroup)
        }

        override fun onMetadata(metadata: Metadata) {
            inner.onMetadata(metadata)
        }

        override fun onDeviceInfoChanged(deviceInfo: DeviceInfo) {
            inner.onDeviceInfoChanged(deviceInfo)
        }

        override fun onDeviceVolumeChanged(volume: Int, muted: Boolean) {
            inner.onDeviceVolumeChanged(volume, muted)
        }

        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is QueueAwareListener) return false
            return player === other.player && inner == other.inner
        }

        override fun hashCode(): Int = 31 * System.identityHashCode(player) + inner.hashCode()
    }

    /**
     * Metadata-only timeline over the JS queue: one window+period per item, durations unknown
     * (gearhead takes duration from MediaMetadataCompat, built from the raw player). Only ever
     * consumed by the session/controllers — the raw ExoPlayer never sees it.
     */
    private class QueueTimeline(private val mediaItems: List<MediaItem>) : Timeline() {

        override fun getWindowCount(): Int = mediaItems.size

        override fun getWindow(windowIndex: Int, window: Window, defaultPositionProjectionUs: Long): Window {
            window.set(
                /* uid = */
                windowIndex,
                /* mediaItem = */
                mediaItems[windowIndex],
                /* manifest = */
                null,
                /* presentationStartTimeMs = */
                C.TIME_UNSET,
                /* windowStartTimeMs = */
                C.TIME_UNSET,
                /* elapsedRealtimeEpochOffsetMs = */
                C.TIME_UNSET,
                /* isSeekable = */
                true,
                /* isDynamic = */
                false,
                /* liveConfiguration = */
                null,
                /* defaultPositionUs = */
                0L,
                /* durationUs = */
                C.TIME_UNSET,
                /* firstPeriodIndex = */
                windowIndex,
                /* lastPeriodIndex = */
                windowIndex,
                /* positionInFirstPeriodUs = */
                0L
            )
            return window
        }

        override fun getPeriodCount(): Int = mediaItems.size

        override fun getPeriod(periodIndex: Int, period: Period, setIds: Boolean): Period {
            period.set(
                /* id = */
                periodIndex,
                /* uid = */
                periodIndex,
                /* windowIndex = */
                periodIndex,
                /* durationUs = */
                C.TIME_UNSET,
                /* positionInWindowUs = */
                0L
            )
            return period
        }

        override fun getIndexOfPeriod(uid: Any): Int = (uid as? Int)?.takeIf { it in mediaItems.indices } ?: C.INDEX_UNSET

        override fun getUidOfPeriod(periodIndex: Int): Any = periodIndex
    }
}
