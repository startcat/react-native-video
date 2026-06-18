package com.brentvatne.exoplayer;

import android.content.Context;
import android.util.Log;

import java.lang.reflect.Method;

/**
 * PLAYER-360 — reflective bridge to the @overon DRM module's offline keySetId store.
 *
 * The downloads module acquires + persists the offline Widevine license (keySetId) via
 * @overon/react-native-overon-player-drm, keyed by contentId. RNV's inline offline-DRM
 * restore reads from a SEPARATE store, so it never finds that license (ERROR_303). This
 * bridge lets RNV read the module-persisted keySetId at playback and mirror it into the
 * inline store so the existing restore path succeeds.
 *
 * RNV declares no compile-time dependency on the DRM module; its class is on the runtime
 * classpath via React Native autolinking when the host app installs the module. Returns
 * null when the module is absent or no license is stored — callers fall back to the
 * inline behaviour unchanged.
 */
final class OveronOfflineDrmBridge {
    private static final String TAG = "Downloads";
    private static final String DRM_CLASS = "com.overonplayerdrm.OfflineLicenseManager";

    private OveronOfflineDrmBridge() {}

    /**
     * @return Base64 (NO_WRAP) of the persisted offline Widevine keySetId for contentId,
     *         or null if the DRM module is absent or has no stored license.
     */
    static String getOfflineKeySetIdBase64(Context context, String contentId) {
        if (context == null || contentId == null || contentId.isEmpty()) {
            return null;
        }
        try {
            Class<?> cls = Class.forName(DRM_CLASS);
            Method m = cls.getMethod("readOfflineKeySetIdBase64", Context.class, String.class);
            Object result = m.invoke(null, context, contentId);
            return (result instanceof String) ? (String) result : null;
        } catch (ClassNotFoundException e) {
            Log.d(TAG, "PLAYER-360: @overon DRM module not present; skipping offline keySetId bridge");
            return null;
        } catch (Throwable t) {
            Log.w(TAG, "PLAYER-360: offline keySetId bridge failed for contentId=" + contentId, t);
            return null;
        }
    }
}
