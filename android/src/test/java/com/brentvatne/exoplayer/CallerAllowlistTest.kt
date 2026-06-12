package com.brentvatne.exoplayer

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * PLAYER-311: el matcher automotive y la allowlist de callers (PLAYER-287) deben anclar por
 * segmento de package — un substring/prefijo laxo deja pasar packages de terceros como
 * controllers del coche (armando la ventana de handoff y los guards de PLAYER-297) o como
 * callers permitidos del catálogo.
 */
class CallerAllowlistTest {

    // ------------------------------------------------------------------
    // CarAudioHandoffCoordinator.isAutomotive
    // ------------------------------------------------------------------

    @Test
    fun gearheadEsAutomotive() {
        assertTrue(CarAudioHandoffCoordinator.isAutomotive("com.google.android.projection.gearhead"))
    }

    @Test
    fun automotiveOsEsAutomotive() {
        assertTrue(CarAudioHandoffCoordinator.isAutomotive("com.android.car.media"))
        assertTrue(CarAudioHandoffCoordinator.isAutomotive("com.android.car"))
    }

    @Test
    fun tercerosConSubstringsNoSonAutomotive() {
        assertFalse(CarAudioHandoffCoordinator.isAutomotive("com.evil.projectionfake"))
        assertFalse(CarAudioHandoffCoordinator.isAutomotive("com.foo.gearheadclone"))
        assertFalse(CarAudioHandoffCoordinator.isAutomotive("com.foo.android.mediaplayer"))
        // el falso positivo de la regresión E5: substring "android.media"
        assertFalse(CarAudioHandoffCoordinator.isAutomotive("evil.android.mediacontroller"))
        assertFalse(CarAudioHandoffCoordinator.isAutomotive("com.android.carfake"))
        assertFalse(CarAudioHandoffCoordinator.isAutomotive(null))
    }

    // ------------------------------------------------------------------
    // VideoLibraryCallback.isAllowedCaller (PLAYER-287)
    // ------------------------------------------------------------------

    @Test
    fun callersLegitimosPermitidos() {
        assertTrue(VideoLibraryCallback.isAllowedCaller("com.google.android.projection.gearhead"))
        assertTrue(VideoLibraryCallback.isAllowedCaller("android")) // framework (uid system)
        assertTrue(VideoLibraryCallback.isAllowedCaller("com.android.systemui"))
        assertTrue(VideoLibraryCallback.isAllowedCaller("com.android.bluetooth"))
        assertTrue(VideoLibraryCallback.isAllowedCaller("com.google.android.googlequicksearchbox"))
        assertTrue(VideoLibraryCallback.isAllowedCaller("com.samsung.android.app.musicplayer"))
        assertTrue(VideoLibraryCallback.isAllowedCaller("eus.eitb.guau"))
    }

    @Test
    fun callersConPrefijoFalsificadoRechazados() {
        assertFalse(VideoLibraryCallback.isAllowedCaller("androidevil.app"))
        assertFalse(VideoLibraryCallback.isAllowedCaller("com.androidx-fake.controller"))
        assertFalse(VideoLibraryCallback.isAllowedCaller("eus.eitb.guau2.clone"))
        assertFalse(VideoLibraryCallback.isAllowedCaller("com.evil.remote"))
        assertFalse(VideoLibraryCallback.isAllowedCaller(null))
    }
}
