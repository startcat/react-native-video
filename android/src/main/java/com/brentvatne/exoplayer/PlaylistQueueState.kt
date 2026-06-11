package com.brentvatne.exoplayer

import androidx.media3.common.MediaItem

/**
 * PLAYER-281: thread-safe snapshot of the JS-managed playlist's navigation state.
 *
 * The canonical ExoPlayer only ever holds a SINGLE MediaItem — `PlaylistControlModule` swaps the
 * source on next/previous and keeps the real N-item queue in its own state. media3 derives the
 * transport "next" button visibility from the *player's own* available commands, so a single-item
 * timeline never exposes `COMMAND_SEEK_TO_NEXT` and the car / lock-screen / phone notification hide
 * the next button (verified on-device: a session advertising the command via `onConnect` is
 * intersected with the player's real commands, so advertising alone is insufficient).
 *
 * `PlaylistControlModule` publishes [hasNext] here on every queue change; [PlaylistAwareForwardingPlayer]
 * reads it to add `COMMAND_SEEK_TO_NEXT` to the canonical player's advertised commands. The actual
 * skip is still routed by `VideoLibraryCallback.onPlayerCommandRequest` (PLAYER-268) →
 * `AndroidAutoModule.notifySkipToNext` → JS `PlaylistControl.next()`; this object only fixes button
 * *visibility*. Previous already shows (the single-item player exposes `COMMAND_SEEK_TO_PREVIOUS`
 * as seek-to-start), so only the next direction needs augmenting.
 *
 * PLAYER-300: additionally holds a metadata-only snapshot of the FULL queue ([snapshot]).
 * Gearhead paints the Now Playing queue from the session player's Timeline (media3
 * `MediaSessionLegacyStub.updateQueue` builds one legacy `QueueItem` per timeline window), so the
 * single-item raw timeline showed a 1-item queue. [PlaylistAwareForwardingPlayer] uses [snapshot]
 * to expose a synthetic N-window timeline to the session. Items carry mediaId + metadata ONLY (no
 * URI): streams are resolved in JS on demand (DRM/auth), the native player must never try to play
 * them by itself.
 */
object PlaylistQueueState {
    /**
     * PLAYER-300: immutable (items, index) pair published atomically so readers never see a new
     * list with a stale index (fields are written on the main thread, read by media3 session code
     * also on the main thread, but the single-reference publish keeps it safe regardless).
     */
    data class QueueSnapshot(val items: List<MediaItem>, val index: Int)

    private val EMPTY = QueueSnapshot(emptyList(), 0)

    /** True when the JS playlist has an item after the current one (or repeat-all wraps). */
    @Volatile
    var hasNext: Boolean = false

    /** True when the JS playlist has an item before the current one (or repeat-all wraps). */
    @Volatile
    var hasPrevious: Boolean = false

    /** PLAYER-300: the full JS queue (metadata-only MediaItems) + current index. */
    @Volatile
    var snapshot: QueueSnapshot = EMPTY
        private set

    /**
     * PLAYER-300: registered by the live [PlaylistAwareForwardingPlayer] (the one wrapping the
     * canonical session's player) so a queue-content change with no accompanying raw-player event
     * still re-publishes the timeline to the session. Cleared on [reset] (session teardown);
     * re-attach creates a new forwarding player which re-registers (last writer wins — only the
     * session's current wrapper matters).
     */
    @Volatile
    var onQueueChanged: (() -> Unit)? = null

    /** PLAYER-300: called by `PlaylistControlModule` on every queue/index mutation (main thread). */
    fun publishQueue(items: List<MediaItem>, index: Int) {
        snapshot = QueueSnapshot(items, index)
        onQueueChanged?.invoke()
    }

    fun reset() {
        hasNext = false
        hasPrevious = false
        snapshot = EMPTY
        onQueueChanged = null
    }
}
