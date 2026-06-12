package com.brentvatne.exoplayer

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * PLAYER-313: las lecturas de CarProjectionStatus desde main NUNCA bloquean — sirven siempre la
 * snapshot cacheada y piden refresh async cuando está fría o caducada. La política pura de lectura
 * es lo testable en JVM; la query binder real queda en el executor (gate = device/assembleDebug).
 */
class CarProjectionStatusCacheTest {

    @Test
    fun lecturaFriaAsumeActivoYPideRefresh() {
        // Conservador (semántica E5/297): sin datos, guards armados — nunca peor que el P0 original.
        assertEquals(
            CarProjectionStatus.CacheRead(active = true, needsRefresh = true),
            CarProjectionStatus.readCache(snapshot = null, nowMs = 0L, ttlMs = CarProjectionStatus.CACHE_TTL_MS)
        )
    }

    @Test
    fun snapshotFrescaSeSirveSinRefresh() {
        val snapshot = CarProjectionStatus.Snapshot(atMs = 10_000L, active = false)
        assertEquals(
            CarProjectionStatus.CacheRead(active = false, needsRefresh = false),
            CarProjectionStatus.readCache(snapshot, nowMs = 10_999L, ttlMs = 1_000L)
        )
    }

    @Test
    fun snapshotCaducadaSirveUltimoValorYPideRefresh() {
        val snapshot = CarProjectionStatus.Snapshot(atMs = 10_000L, active = true)
        assertEquals(
            CarProjectionStatus.CacheRead(active = true, needsRefresh = true),
            CarProjectionStatus.readCache(snapshot, nowMs = 11_000L, ttlMs = 1_000L)
        )
    }

    @Test
    fun edadIgualAlTtlCuentaComoCaducada() {
        val snapshot = CarProjectionStatus.Snapshot(atMs = 0L, active = false)
        val read = CarProjectionStatus.readCache(snapshot, nowMs = 1_000L, ttlMs = 1_000L)
        assertEquals(false, read.active)
        assertEquals(true, read.needsRefresh)
    }
}
