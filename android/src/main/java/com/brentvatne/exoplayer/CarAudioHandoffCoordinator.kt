package com.brentvatne.exoplayer

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer

/**
 * Pure, testable handoff decision. No Android/media3 types so it runs on the JVM.
 *
 * PLAYER-278: Android Auto's `gearhead` grabs a PERMANENT audio focus the moment it connects
 * (projection startup), so media3 pauses the canonical player and — by design — does NOT
 * auto-resume a permanent loss (only TRANSIENT auto-resumes). We re-assert play() within a short
 * window after an automotive controller connects so the audio continues in the car automatically.
 */
object CarAudioHandoffPolicy {
    /** How long after an automotive controller connects we treat a focus-loss pause as the handoff. */
    const val HANDOFF_WINDOW_MS = 4_000L

    /**
     * Re-assert play after a focus-loss pause ONLY when: the user intends to play, the player is not
     * already playing, and we are still inside the connect handoff window. Outside the window a focus
     * loss (phone call, the user starting another car media app) is left paused — no fight.
     */
    fun shouldReassert(nowMs: Long, windowUntilMs: Long, userIntendsToPlay: Boolean, isPlaying: Boolean): Boolean =
        userIntendsToPlay && !isPlaying && nowMs <= windowUntilMs
}

/**
 * Keeps app audio playing across the Android-Auto connect handoff (PLAYER-278).
 *
 * Tracks the user's *intent to play* from [Player.Listener.onPlayWhenReadyChanged] reasons and, within
 * a short window after an automotive controller connects, re-calls [Player.play] when a focus-loss
 * pause happens — media3 then re-requests focus and the car grants it, so playback resumes. If the car
 * withholds focus, play() is a no-op and the player stays paused (safe asymmetry — no worse than today).
 *
 * Conservative by construction (see [CarAudioHandoffPolicy.shouldReassert]): the re-assert is bounded to
 * the connect handoff window, so a phone call or another car media app taking over later leaves us paused.
 *
 * Mode-agnostic: it hooks the CANONICAL player + the session onConnect, so it covers both the COORDINATED
 * (`ReactExoplayerView` `<Video>`) and STANDALONE (`PlaylistControlModule`) paths — closing the inv.4
 * COORDINATED hole — and it survives the Phase-6 single-session burn-down (no coupling to session topology).
 */
object CarAudioHandoffCoordinator {
    private const val TAG = "CarHandoff"

    /** How long after a focus-loss pause a later automotive onConnect still treats it as the handoff. */
    private const val RECENT_LOSS_GRACE_MS = 2_000L

    private val main = Handler(Looper.getMainLooper())

    @Volatile private var attached: ExoPlayer? = null

    @Volatile private var userIntendsToPlay = false

    @Volatile private var windowUntilMs = 0L

    @Volatile private var lastFocusLossPauseAtMs = 0L

    private val listener = object : Player.Listener {
        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            when (reason) {
                Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST -> userIntendsToPlay = playWhenReady

                Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM -> if (!playWhenReady) userIntendsToPlay = false

                Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS -> if (!playWhenReady) {
                    lastFocusLossPauseAtMs = SystemClock.elapsedRealtime()
                    maybeReassert("focus-loss-pause")
                }
            }
        }
    }

    /** Attach to the canonical player (idempotent). Called from VideoPlaybackService when it becomes canonical. */
    @Synchronized fun attach(player: ExoPlayer) {
        if (attached === player) return
        attached?.let { runCatching { it.removeListener(listener) } }
        attached = player
        player.addListener(listener)
        if (player.playWhenReady) userIntendsToPlay = true // already playing at attach time
        Log.d(TAG, "attached to canonical player")
    }

    @Synchronized fun detach(player: ExoPlayer) {
        if (attached === player) {
            runCatching { player.removeListener(listener) }
            attached = null
            Log.d(TAG, "detached from canonical player")
        }
    }

    /** True when the controller package is an automotive projection controller (Android Auto). */
    fun isAutomotive(pkg: String?): Boolean = pkg != null && (pkg.contains("gearhead") || pkg.contains("projection") || pkg.contains("android.media"))

    /** Call from a session callback's onConnect when [isAutomotive] is true. Arms the handoff window. */
    fun onCarControllerConnected() {
        val now = SystemClock.elapsedRealtime()
        windowUntilMs = now + CarAudioHandoffPolicy.HANDOFF_WINDOW_MS
        Log.i(TAG, "automotive controller connected — handoff window armed (${CarAudioHandoffPolicy.HANDOFF_WINDOW_MS}ms)")
        // connect-AFTER-loss ordering: gearhead may grab focus before we see onConnect.
        if (now - lastFocusLossPauseAtMs <= RECENT_LOSS_GRACE_MS) maybeReassert("connect-after-recent-loss")
        // connect-BEFORE-loss ordering: schedule a couple of checks across the window.
        scheduleReassert()
    }

    private fun maybeReassert(why: String) =
        main.post {
            val p = attached ?: return@post
            val now = SystemClock.elapsedRealtime()
            if (CarAudioHandoffPolicy.shouldReassert(now, windowUntilMs, userIntendsToPlay, p.isPlaying)) {
                Log.i(TAG, "[$why] re-asserting play() to keep audio in the car")
                // media3 re-requests focus; car grants -> resumes, denies -> stays paused (safe).
                runCatching { p.play() }.onFailure { Log.w(TAG, "[$why] play() failed", it) }
            } else {
                Log.d(TAG, "[$why] no re-assert (intends=$userIntendsToPlay, playing=${p.isPlaying}, inWindow=${now <= windowUntilMs})")
            }
        }

    private fun scheduleReassert() {
        main.postDelayed({ maybeReassert("scheduled-400") }, 400)
        main.postDelayed({ maybeReassert("scheduled-1200") }, 1200)
    }
}
