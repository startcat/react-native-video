package com.brentvatne.exoplayer

import android.content.Context
import androidx.media3.exoplayer.ExoPlayer

/**
 * Process-wide single source of truth for the ONE canonical audio ExoPlayer (ADR Auto-001, inv. 1–2).
 *
 * Lifetime is owned by VideoPlaybackService; the React layer ATTACHES, it does not create.
 *
 * PLAYER-278 burn-down: the `reconcileEnabled` kill-switch (PLAYER-269 staged rollout) is GONE —
 * the canonical single-player reconciliation is now unconditional (the ADR-mandated end state).
 */
object CanonicalPlayerHolder {

    @Volatile private var player: ExoPlayer? = null

    @Synchronized fun get(): ExoPlayer? = player

    @Synchronized fun getOrCreate(context: Context, factory: (Context) -> ExoPlayer): ExoPlayer =
        player ?: factory(context.applicationContext).also {
            player = it
        }

    @Synchronized fun set(p: ExoPlayer) {
        player = p
    }

    /**
     * Returns true when [p] is the canonical (and only) audio player.
     * Used to guard attach-on-mount and focus-owner checks.
     */
    @Synchronized fun isCanonical(p: ExoPlayer?): Boolean = p != null && p === player

    /**
     * Clear the holder reference.  release() is the CALLER's responsibility (the service owns
     * lifetime — invariant 2).  Do NOT call player.release() here.
     */
    @Synchronized fun clear() {
        player = null
    }
}
