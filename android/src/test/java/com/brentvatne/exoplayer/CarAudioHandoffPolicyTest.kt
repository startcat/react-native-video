package com.brentvatne.exoplayer

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * PLAYER-310: la ventana de handoff (PLAYER-278) no debe re-assertar play() cuando el
 * focus-loss lo provocó una superficie del propio proceso con foco TRANSIENT (vídeo/splash
 * con attach denegado, 288/297) — re-assertar pelearía contra nuestra propia superficie.
 */
class CarAudioHandoffPolicyTest {

    @Test
    fun reAssertaDentroDeVentanaSinDenialActivo() {
        assertTrue(
            CarAudioHandoffPolicy.shouldReassert(
                /* nowMs = */
                1_000L,
                /* windowUntilMs = */
                4_000L,
                /* userIntendsToPlay = */
                true,
                /* isPlaying = */
                false,
                /* transientDenialActive = */
                false
            )
        )
    }

    @Test
    fun noReAssertaConTransientDenialActivo() {
        assertFalse(
            CarAudioHandoffPolicy.shouldReassert(1_000L, 4_000L, true, false, true)
        )
    }

    @Test
    fun noReAssertaFueraDeVentana() {
        assertFalse(
            CarAudioHandoffPolicy.shouldReassert(5_000L, 4_000L, true, false, false)
        )
    }

    @Test
    fun noReAssertaSinIntencionDeReproducir() {
        assertFalse(
            CarAudioHandoffPolicy.shouldReassert(1_000L, 4_000L, false, false, false)
        )
    }

    @Test
    fun noReAssertaSiYaEstaReproduciendo() {
        assertFalse(
            CarAudioHandoffPolicy.shouldReassert(1_000L, 4_000L, true, true, false)
        )
    }
}
