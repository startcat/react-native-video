package com.brentvatne.exoplayer

import android.content.BroadcastReceiver
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

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
 * Threading (PLAYER-313): the provider query is a cross-process binder IPC and the callers
 * ([VideoPlaybackService.hasAutomotiveController]) run on the MAIN thread during RN view
 * init/release. Reads are therefore NON-BLOCKING: they always serve the cached snapshot and, when
 * it is stale (TTL) or absent, schedule an async refresh on a dedicated single thread. Push
 * updates ride the `ACTION_CAR_CONNECTION_UPDATED` broadcast — the actual androidx CarConnection
 * change-signal contract (gearhead does NOT notifyChange the provider URI: device-verified
 * 2026-06-12, a ContentObserver never fired across a projection end while the broadcast pattern
 * is what CarConnectionTypeLiveData itself uses) — so the E5 transition (projection ends) lands
 * in the cache without waiting for a consult. A [ContentObserver] on the URI stays registered as
 * belt-and-braces. [VideoPlaybackService.onCreate] warms the cache up-front so the cold path
 * below is effectively unreachable in real flows.
 *
 * Failure semantics:
 * - no snapshot yet (cold read) → assume ACTIVE. Conservative: with an automotive controller
 *   attached this keeps the anti-crash guards armed (pre-E5-fix behaviour) — never worse than the
 *   original P0; the warm-up refresh replaces it within milliseconds.
 * - cursor null / column or row missing → NOT connected. Mirrors androidx
 *   CarConnectionTypeLiveData: provider absent means no (or pre-2021) gearhead, so projection is
 *   impossible anyway.
 * - query throws → assume ACTIVE (same conservative rationale as the cold read).
 */
object CarProjectionStatus {
    private const val TAG = "CarProjectionStatus"

    /** Contract constants of androidx.car.app.connection.CarConnection(TypeLiveData). */
    private const val CAR_CONNECTION_AUTHORITY = "androidx.car.app.connection"
    private const val CAR_CONNECTION_STATE_COLUMN = "CarConnectionState"
    private const val CONNECTION_TYPE_NOT_CONNECTED = 0
    private const val ACTION_CAR_CONNECTION_UPDATED = "androidx.car.app.connection.action.CAR_CONNECTION_UPDATED"

    internal const val CACHE_TTL_MS = 1_000L

    internal data class Snapshot(val atMs: Long, val active: Boolean)

    internal data class CacheRead(val active: Boolean, val needsRefresh: Boolean)

    @Volatile private var lastSnapshot: Snapshot? = null

    private val refreshInFlight = AtomicBoolean(false)

    @Volatile private var observerRegistered = false

    /**
     * PLAYER-316: optional listener fired on every real projection-state transition. AndroidAutoModule
     * wires this to emit androidAutoConnected/androidAutoDisconnected to JS so the app can gate video
     * playback the way iOS gates on CarPlay's carPlayConnected. Runs on the refresh executor thread.
     */
    @Volatile var onProjectionChanged: ((Boolean) -> Unit)? = null

    private val refreshExecutor by lazy {
        Executors.newSingleThreadExecutor { r ->
            Thread(r, "CarProjectionStatus").apply { isDaemon = true }
        }
    }

    /**
     * True while a car is actually connected (projection, or AAOS native), per gearhead's provider.
     * Non-blocking: serves the cached snapshot; stale/cold reads trigger an async refresh.
     */
    fun isProjectionActive(context: Context): Boolean {
        val read = readCache(lastSnapshot, SystemClock.elapsedRealtime(), CACHE_TTL_MS)
        if (read.needsRefresh) scheduleRefresh(context.applicationContext)
        return read.active
    }

    /** Pre-populates the cache off-main so the first real consult never hits the cold fallback. */
    fun warmUp(context: Context) {
        scheduleRefresh(context.applicationContext)
    }

    /**
     * Pure read policy (JVM-tested): fresh snapshot → serve as-is; stale snapshot → serve the last
     * known value and ask for a refresh; no snapshot → conservative ACTIVE plus refresh.
     */
    internal fun readCache(snapshot: Snapshot?, nowMs: Long, ttlMs: Long): CacheRead =
        when {
            snapshot == null -> CacheRead(active = true, needsRefresh = true)
            nowMs - snapshot.atMs < ttlMs -> CacheRead(snapshot.active, needsRefresh = false)
            else -> CacheRead(snapshot.active, needsRefresh = true)
        }

    private fun scheduleRefresh(appContext: Context) {
        if (!refreshInFlight.compareAndSet(false, true)) return
        try {
            refreshExecutor.execute {
                try {
                    registerPushSourcesIfNeeded(appContext)
                    val active = queryProvider(appContext)
                    val previous = lastSnapshot?.active
                    lastSnapshot = Snapshot(SystemClock.elapsedRealtime(), active)
                    if (previous != active) {
                        Log.i(TAG, "car projection state → active=$active")
                        // PLAYER-316: notify the connect/disconnect gate (also fires on the first read,
                        // previous==null, which seeds JS with the initial value — idempotent there).
                        onProjectionChanged?.invoke(active)
                    }
                } finally {
                    refreshInFlight.set(false)
                }
            }
        } catch (e: Exception) {
            // RejectedExecutionException et al.: release the latch so a later consult can retry.
            refreshInFlight.set(false)
            Log.w(TAG, "CarConnection refresh could not be scheduled: ${e.message}")
        }
    }

    /**
     * Push updates so projection transitions land in the cache without waiting for a consult.
     * Primary: the `ACTION_CAR_CONNECTION_UPDATED` broadcast — the change signal androidx
     * CarConnectionTypeLiveData actually listens to (RECEIVER_EXPORTED: gearhead sends it).
     * Secondary, belt-and-braces: a ContentObserver on the provider URI (device evidence
     * 2026-06-12: gearhead does NOT notifyChange it, but it is free to keep). Best-effort: on
     * failure the TTL refresh path still keeps the cache current.
     */
    private fun registerPushSourcesIfNeeded(appContext: Context) {
        if (observerRegistered) return
        try {
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    scheduleRefresh(appContext)
                }
            }
            val filter = IntentFilter(ACTION_CAR_CONNECTION_UPDATED)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                appContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                appContext.registerReceiver(receiver, filter)
            }
            val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
                override fun onChange(selfChange: Boolean) {
                    scheduleRefresh(appContext)
                }
            }
            appContext.contentResolver.registerContentObserver(carConnectionUri(), false, observer)
            observerRegistered = true
        } catch (e: Exception) {
            Log.w(TAG, "CarConnection push registration failed — TTL refresh only: ${e.message}")
        }
    }

    private fun carConnectionUri(): Uri =
        Uri.Builder()
            .scheme(ContentResolver.SCHEME_CONTENT)
            .authority(CAR_CONNECTION_AUTHORITY)
            .build()

    private fun queryProvider(context: Context): Boolean =
        try {
            context.contentResolver.query(carConnectionUri(), arrayOf(CAR_CONNECTION_STATE_COLUMN), null, null, null)
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
