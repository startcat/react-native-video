package com.brentvatne.exoplayer

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
 */
object PlaylistQueueState {
    /** True when the JS playlist has an item after the current one (or repeat-all wraps). */
    @Volatile
    var hasNext: Boolean = false

    /** True when the JS playlist has an item before the current one (or repeat-all wraps). */
    @Volatile
    var hasPrevious: Boolean = false

    fun reset() {
        hasNext = false
        hasPrevious = false
    }
}
