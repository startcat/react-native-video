package com.brentvatne.exoplayer

import java.util.Collections
import java.util.WeakHashMap

/**
 * Debug-only tracker of live audio ExoPlayer instances for the in-car
 * verification harness (PLAYER-265, S1). Backed by a WeakHashMap so a GC'd
 * player drops out without leaking. NOT a production control surface — read
 * only by HarnessModule.livePlayerCount() in debug builds.
 */
object PlayerInstanceTracker {
    private val live = Collections.newSetFromMap(WeakHashMap<Any, Boolean>())

    @Synchronized
    fun register(player: Any) { live.add(player) }

    @Synchronized
    fun unregister(player: Any) { live.remove(player) }

    @Synchronized
    fun count(): Int = live.size
}
