package com.brentvatne.exoplayer

import androidx.media3.exoplayer.ExoPlayer
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CanonicalPlayerHolderTest {

    @After
    fun tearDown() {
        CanonicalPlayerHolder.get()?.release()
        CanonicalPlayerHolder.clear()
    }

    @Test
    fun getOrCreate_returnsSameInstance() {
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val factory = { c: android.content.Context -> ExoPlayer.Builder(c).build() }
        val first = CanonicalPlayerHolder.getOrCreate(ctx, factory)
        val second = CanonicalPlayerHolder.getOrCreate(ctx, factory)
        assertSame("getOrCreate must not build a 2nd player", first, second)
        assertTrue(CanonicalPlayerHolder.isCanonical(first))
    }

    @Test
    fun clear_removesReference() {
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val factory = { c: android.content.Context -> ExoPlayer.Builder(c).build() }
        val p = CanonicalPlayerHolder.getOrCreate(ctx, factory)
        CanonicalPlayerHolder.clear()
        assertNull("after clear(), get() should be null", CanonicalPlayerHolder.get())
        assertFalse(CanonicalPlayerHolder.isCanonical(p))
        p.release() // manual teardown since holder was cleared
    }

    @Test
    fun reconcileEnabled_defaultsFalse() {
        // Kill-switch MUST default to false for safe merge (user requirement PLAYER-269)
        assertFalse(
            "reconcileEnabled must default to false so merging is behaviour-neutral",
            CanonicalPlayerHolder.reconcileEnabled
        )
    }
}
