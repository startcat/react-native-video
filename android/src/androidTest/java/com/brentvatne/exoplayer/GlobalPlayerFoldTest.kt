package com.brentvatne.exoplayer

import androidx.media3.exoplayer.ExoPlayer
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/**
 * PLAYER-269 Phase 3 gate: asserts GlobalPlayerManager.getOrCreatePlayer returns the SAME
 * instance the CanonicalPlayerHolder holds — no second ExoPlayer is created (inv. 1).
 *
 * PLAYER-278 burn-down: canonical reconciliation is unconditional (no kill-switch).
 */
@RunWith(AndroidJUnit4::class)
class GlobalPlayerFoldTest {

    @After
    fun tearDown() {
        CanonicalPlayerHolder.get()?.release()
        CanonicalPlayerHolder.clear()
    }

    @Test
    fun globalPlayerManager_returnsCanonical() {
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()

        // Pre-seed canonical player
        val canonical: ExoPlayer = CanonicalPlayerHolder.getOrCreate(ctx) { ExoPlayer.Builder(it).build() }

        // GlobalPlayerManager must return the SAME instance (inv. 1)
        val fromGpm = GlobalPlayerManager.getOrCreatePlayer(ctx)
        assertSame(
            "GlobalPlayerManager.getOrCreatePlayer() must return the canonical player, not a 2nd one",
            canonical,
            fromGpm
        )

        assertTrue(CanonicalPlayerHolder.isCanonical(fromGpm))
    }

    @Test
    fun globalPlayerManager_getPlayer_returnsCanonical() {
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val canonical: ExoPlayer = CanonicalPlayerHolder.getOrCreate(ctx) { ExoPlayer.Builder(it).build() }

        // getPlayer() should also return canonical
        val fromGpm = GlobalPlayerManager.getPlayer()
        assertSame(canonical, fromGpm)
    }
}
