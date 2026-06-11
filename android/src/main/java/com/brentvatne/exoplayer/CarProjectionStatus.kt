package com.brentvatne.exoplayer

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.os.SystemClock
import android.util.Log

/**
 * PLAYER-297 (E5 regression): live Android-Auto PROJECTION state, as opposed to "gearhead has a
 * MediaController connected to our session".
 *
 * Why: gearhead keeps its MediaController connected to the canonical MediaLibrarySession
 * indefinitely after projection ends (device evidence 2026-06-11, SM-A155F: still connected
 * >6 min after stopping the DHU head-unit server — it never disconnects, so a
 * MediaSession.Callback.onDisconnected-based live-set would never fire either). Inspecting
 * `connectedControllers` alone is therefore a STALE signal: the PLAYER-297 guards stayed armed
 * phone-only — the on-screen video skipped its notification registration and `unregisterPlayer`
 * kept the canonical session alive (ghost audio resume on player exit).
 *
 * Source of truth: the CarConnection content provider that Android Auto (gearhead) hosts for
 * `androidx.car.app.connection.CarConnection`. The contract is public and app-agnostic (any app
 * may query it — it is NOT limited to car-app-library apps), so we query it directly instead of
 * pulling the whole `androidx.car.app:app` dependency for one int:
 *
 *   content://androidx.car.app.connection  →  column "CarConnectionState"
 *   0 = not connected · 1 = native (AAOS) · 2 = projection
 *
 * Device evidence: with projection stopped (E5 state) the provider returns CarConnectionState=0
 * while the stale gearhead controller is still attached — exactly the discriminator we need.
 * Both "stop the DHU head-unit server" and "physically unplug USB" end gearhead's projection
 * session, which updates this provider; only the DHU case is device-verified so far, the
 * physical-unplug case rides the same provider contract (re-verify on a real head unit).
 *
 * Failure semantics:
 * - cursor null / column or row missing → NOT connected. Mirrors androidx
 *   CarConnectionTypeLiveData: provider absent means no (or pre-2021) gearhead, so projection is
 *   impossible anyway.
 * - query throws → assume ACTIVE. Conservative: with an automotive controller attached this keeps
 *   the anti-crash guards armed (pre-E5-fix behaviour) — never worse than the original P0.
 *
 * A short TTL cache bounds the cross-process provider query (binder IPC) during RN view
 * mount/unmount storms — [VideoPlaybackService.hasAutomotiveController] is called from view init
 * and register/unregister paths on the main thread.
 */
object CarProjectionStatus {
    private const val TAG = "CarProjectionStatus"

    /** Contract constants of androidx.car.app.connection.CarConnection(TypeLiveData). */
    private const val CAR_CONNECTION_AUTHORITY = "androidx.car.app.connection"
    private const val CAR_CONNECTION_STATE_COLUMN = "CarConnectionState"
    private const val CONNECTION_TYPE_NOT_CONNECTED = 0

    private const val CACHE_TTL_MS = 1_000L

    private data class Snapshot(val atMs: Long, val active: Boolean)

    @Volatile private var lastSnapshot: Snapshot? = null

    /** True while a car is actually connected (projection, or AAOS native), per gearhead's provider. */
    fun isProjectionActive(context: Context): Boolean {
        val now = SystemClock.elapsedRealtime()
        lastSnapshot?.let { if (now - it.atMs < CACHE_TTL_MS) return it.active }
        val active = queryProvider(context)
        lastSnapshot = Snapshot(now, active)
        return active
    }

    private fun queryProvider(context: Context): Boolean =
        try {
            val uri = Uri.Builder()
                .scheme(ContentResolver.SCHEME_CONTENT)
                .authority(CAR_CONNECTION_AUTHORITY)
                .build()
            context.contentResolver.query(uri, arrayOf(CAR_CONNECTION_STATE_COLUMN), null, null, null)
                ?.use { cursor ->
                    val idx = cursor.getColumnIndex(CAR_CONNECTION_STATE_COLUMN)
                    if (idx < 0 || !cursor.moveToNext()) {
                        Log.w(TAG, "CarConnection provider responded without a state — assuming no car")
                        false
                    } else {
                        cursor.getInt(idx) != CONNECTION_TYPE_NOT_CONNECTED
                    }
                }
                ?: false // provider missing (no/very old gearhead) → projection impossible
        } catch (e: Exception) {
            // Conservative: keep the PLAYER-297 anti-crash guards armed rather than risk tearing
            // down a session a car might still be attached to (pre-E5-fix behaviour).
            Log.w(TAG, "CarConnection query failed — assuming car still attached: ${e.message}")
            true
        }
}
