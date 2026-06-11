package com.brentvatne.exoplayer

import androidx.media3.common.Player
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * PLAYER-305: completeness guard for the manual `Player.Listener` mirror.
 *
 * `QueueAwareListener` (inside [PlaylistAwareForwardingPlayer]) forwards every listener callback
 * to the session's listener BY HAND, because Kotlin interface delegation (`by inner`) does not
 * generate overrides for Java default methods (the PLAYER-300 V1 incident: the compiled class only
 * had `onTimelineChanged`, the session never saw `onPlaybackStateChanged` and gearhead froze in
 * "obtaining selection").
 *
 * The failure mode is silent and returns on every media3 upgrade: a new callback added to
 * `Player.Listener` would compile fine and drop events towards the session. This test makes the
 * upgrade fail HERE instead of in the car: it asserts, via reflection, that the mirror declares an
 * override for EVERY method of the `Player.Listener` compiled against.
 */
class QueueAwareListenerDelegationTest {

    @Test
    fun queueAwareListenerOverrideaTodosLosMetodosDePlayerListener() {
        // initialize=false: we only need the declared-method table, never static init.
        val listenerClass = Class.forName(
            "com.brentvatne.exoplayer.PlaylistAwareForwardingPlayer\$QueueAwareListener",
            false,
            PlaylistAwareForwardingPlayer::class.java.classLoader
        )

        val missing = Player.Listener::class.java.methods
            .filter { it.declaringClass == Player.Listener::class.java }
            .filter { m ->
                runCatching { listenerClass.getDeclaredMethod(m.name, *m.parameterTypes) }.isFailure
            }
            .map { m -> "${m.name}(${m.parameterTypes.joinToString { it.simpleName }})" }
            .sorted()

        assertTrue(
            "QueueAwareListener NO declara override de ${missing.size} callback(s) de Player.Listener " +
                "— la delegación hacia la sesión los dropearía EN SILENCIO (clase de bug del " +
                "PLAYER-300 V1). Añade el override que falta en PlaylistAwareForwardingPlayer:\n" +
                missing.joinToString("\n"),
            missing.isEmpty()
        )
    }
}
