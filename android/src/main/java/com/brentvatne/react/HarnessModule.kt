package com.brentvatne.react

import com.brentvatne.exoplayer.PlayerInstanceTracker
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Exposes the in-car harness counters to JS (debug verification only).
 * Register in ReactVideoPackage behind a BuildConfig.DEBUG guard so this
 * module is never shipped to production.
 *
 * PLAYER-265 S1 — livePlayerCount() is the JS-facing side of the
 * single-player invariant assertion.
 */
class HarnessModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "HarnessModule"

    @ReactMethod
    fun livePlayerCount(promise: Promise) {
        promise.resolve(PlayerInstanceTracker.count())
    }
}
