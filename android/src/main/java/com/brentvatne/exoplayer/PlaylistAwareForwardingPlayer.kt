package com.brentvatne.exoplayer

import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player

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
 * Wrap ONLY the instance handed to the `MediaLibrarySession`; every other caller keeps operating on
 * the raw ExoPlayer ([getWrappedPlayer] exposes it). Everything except `getAvailableCommands`
 * delegates to the wrapped player.
 *
 * The button TAP is routed by `VideoLibraryCallback.onPlayerCommandRequest` (PLAYER-268) →
 * `AndroidAutoModule.notifySkipTo*` → JS `PlaylistControl.next()/previous()`. Each next/previous
 * loads a new single MediaItem (`setMediaItem`) → `onMediaItemTransition` → media3 re-queries
 * `getAvailableCommands` → the buttons refresh for the new position.
 */
class PlaylistAwareForwardingPlayer(player: Player) : ForwardingPlayer(player) {
    override fun getAvailableCommands(): Player.Commands {
        val base = super.getAvailableCommands()
        if (!PlaylistQueueState.hasNext && !PlaylistQueueState.hasPrevious) {
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
        return builder.build()
    }
}
