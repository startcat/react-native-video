package com.brentvatne.exoplayer

import android.os.Bundle
import androidx.media3.common.Player
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.brentvatne.exoplayer.VideoPlaybackService.Companion.COMMAND
import com.brentvatne.exoplayer.VideoPlaybackService.Companion.commandFromString
import com.brentvatne.exoplayer.VideoPlaybackService.Companion.handleCommand
import com.brentvatne.react.AndroidAutoModule
import com.google.common.util.concurrent.ListenableFuture

class VideoPlaybackCallback : MediaSession.Callback {
    override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
        try {
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailablePlayerCommands(
                    MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS.buildUpon()
                        .add(Player.COMMAND_SEEK_FORWARD)
                        .add(Player.COMMAND_SEEK_BACK)
                        .add(Player.COMMAND_SEEK_TO_NEXT) // PLAYER-268: car/lock-screen "next track"
                        .add(Player.COMMAND_SEEK_TO_PREVIOUS) // PLAYER-268: "previous track"
                        .build()
                ).setAvailableSessionCommands(
                    MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
                        .add(SessionCommand(COMMAND.SEEK_FORWARD.stringValue, Bundle.EMPTY))
                        .add(SessionCommand(COMMAND.SEEK_BACKWARD.stringValue, Bundle.EMPTY))
                        .build()
                )
                .build()
        } catch (e: Exception) {
            return MediaSession.ConnectionResult.reject()
        }
    }

    override fun onCustomCommand(
        session: MediaSession,
        controller: MediaSession.ControllerInfo,
        customCommand: SessionCommand,
        args: Bundle
    ): ListenableFuture<SessionResult> {
        handleCommand(commandFromString(customCommand.customAction), session)
        return super.onCustomCommand(session, controller, customCommand, args)
    }

    /**
     * PLAYER-268: intercept the OS/car "skip to next/previous" transport commands.
     * The canonical/registered player holds a single MediaItem (the playlist lives in
     * PlaylistControl), so letting media3 call player.seekToNext()/seekToPrevious() would
     * no-op / reset position. Instead we forward to JS (PlaylistControl.next()/previous())
     * via AndroidAutoModule and BLOCK the default handling for those two commands.
     * All other commands pass through unchanged (RESULT_SUCCESS = 0).
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
}
