package com.brentvatne.exoplayer

import android.content.Context
import androidx.media3.exoplayer.ExoPlayer

/**
 * Process-wide single source of truth for the ONE canonical audio ExoPlayer (ADR Auto-001, inv. 1–2).
 *
 * Lifetime is owned by VideoPlaybackService; the React layer ATTACHES, it does not create.
 *
 * KILL-SWITCH: [reconcileEnabled] defaults to FALSE so merging this is behaviour-neutral.
 * Every behaviour-changing branch must check this flag.  The user enables it on-device to
 * validate before Phase 6 burns it down unconditionally.
 *
 * With the flag OFF → runtime behaviour is identical to PLAYER-266 state (two players).
 * With the flag ON  → single-canonical-player reconciliation is active (ADR Auto-001).
 */
object CanonicalPlayerHolder {

    /**
     * Kill-switch for staged rollout / rollback.
     * DEFAULT = false  →  behaviour-neutral (safe to merge without activation).
     * Set to true (in tests or on-device) to activate the reconciliation.
     */
    @Volatile var reconcileEnabled: Boolean = false

    @Volatile private var player: ExoPlayer? = null

    @Synchronized fun get(): ExoPlayer? = player

    @Synchronized fun getOrCreate(context: Context, factory: (Context) -> ExoPlayer): ExoPlayer {
        return player ?: factory(context.applicationContext).also { player = it }
    }

    @Synchronized fun set(p: ExoPlayer) { player = p }

    /**
     * Returns true when [p] is the canonical (and only) audio player.
     * Used to guard attach-on-mount and focus-owner checks.
     */
    @Synchronized fun isCanonical(p: ExoPlayer?): Boolean = p != null && p === player

    /**
     * Clear the holder reference.  release() is the CALLER's responsibility (the service owns
     * lifetime — invariant 2).  Do NOT call player.release() here.
     */
    @Synchronized fun clear() { player = null }
}
