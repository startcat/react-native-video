package com.brentvatne.exoplayer;

import android.content.Context;
import android.net.Uri;
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
    private static final String OFFLINE_MGR_CLASS = "com.overonplayerdownloads.offline.AxOfflineManager";

    private OveronOfflineDrmBridge() {}

    /**
     * PLAYER-360 — the downloaded MEDIA lives in the downloads module's media3
     * DownloadManager + Cache (a separate instance from RNV's inline AxOfflineManager,
     * which is empty). This returns the module's offline source pieces so RNV can build
     * the offline MediaSource from them.
     *
     * The module's AxOfflineManager mirrors RNV's API (shared ancestor) and is the same
     * live singleton the download used, so its tracker already knows the download.
     *
     * @return {DownloadRequest, DataSource.Factory} as Object[] (cast by caller), or null
     *         if the module is absent / has no download for this uri.
     */
    static Object[] getModuleOfflineSource(Context context, Uri uri) {
        if (context == null || uri == null) {
            return null;
        }
        try {
            Class<?> mgrCls = Class.forName(OFFLINE_MGR_CLASS);
            Object mgr = mgrCls.getMethod("getInstance").invoke(null);
            if (mgr == null) { Log.w(TAG, "PLAYER-360: module AxOfflineManager.getInstance() null"); return null; }
            // Idempotent init so the DownloadManager/index + cache are loaded (tracker is null until init()).
            try {
                mgrCls.getMethod("init", Context.class).invoke(mgr, context);
            } catch (Throwable t) {
                Log.w(TAG, "PLAYER-360: module AxOfflineManager.init() failed", t);
            }
            Object tracker = mgrCls.getMethod("getDownloadTracker").invoke(mgr);
            if (tracker == null) { Log.w(TAG, "PLAYER-360: module getDownloadTracker() null after init"); return null; }
            Object request = tracker.getClass().getMethod("getDownloadRequest", Uri.class).invoke(tracker, uri);
            if (request == null) { Log.w(TAG, "PLAYER-360: module getDownloadRequest() null for uri=" + uri); return null; }
            Object factory = mgrCls.getMethod("buildDataSourceFactory", Context.class).invoke(mgr, context);
            if (factory == null) { Log.w(TAG, "PLAYER-360: module buildDataSourceFactory() null"); return null; }
            Log.i(TAG, "PLAYER-360: using @overon downloads module offline source for uri=" + uri);
            return new Object[]{request, factory};
        } catch (ClassNotFoundException e) {
            Log.d(TAG, "PLAYER-360: @overon downloads module not present; skipping offline media bridge");
            return null;
        } catch (Throwable t) {
            Log.w(TAG, "PLAYER-360: offline media bridge failed for uri=" + uri, t);
            return null;
        }
    }

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
