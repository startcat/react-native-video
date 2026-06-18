package com.brentvatne.exoplayer;

import android.content.Context;
import android.net.Uri;
import android.util.Log;

import androidx.media3.datasource.DataSource;
import androidx.media3.exoplayer.offline.Download;
import androidx.media3.exoplayer.offline.DownloadCursor;
import androidx.media3.exoplayer.offline.DownloadIndex;
import androidx.media3.exoplayer.offline.DownloadManager;
import androidx.media3.exoplayer.offline.DownloadRequest;

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
     * PLAYER-356 — the downloaded MEDIA lives in the downloads module's media3
     * DownloadManager + Cache (a separate instance from RNV's inline AxOfflineManager,
     * which is empty). This returns the module's offline source pieces so RNV can build
     * the offline MediaSource from them.
     *
     * We reach the module's live AxOfflineManager singleton (the same one the download
     * used / the AxDownloadService owns) and read the DownloadRequest straight from its
     * PERSISTENT DownloadIndex — not from the tracker's in-memory map, which can be
     * unpopulated at playback time, and not via an exact-URI HashMap key, which can drift
     * from the playback URI. We match by URI first, then by download id (== contentId),
     * preferring a COMPLETED download. The media bytes are read back through the module's
     * own read-only cache factory, so no competing SimpleCache is created on the shared
     * Downloads/Streams folder.
     *
     * @return {DownloadRequest, DataSource.Factory} as Object[] (cast by caller), or null
     *         if the module is absent / has no usable download for this uri or id.
     */
    static Object[] getModuleOfflineSource(Context context, Uri uri, String downloadId) {
        if (context == null || uri == null) {
            return null;
        }
        try {
            Class<?> mgrCls = Class.forName(OFFLINE_MGR_CLASS);
            Object mgr = mgrCls.getMethod("getInstance").invoke(null);
            if (mgr == null) { Log.w(TAG, "PLAYER-356: module AxOfflineManager.getInstance() null"); return null; }

            // Idempotent init so the DownloadManager/index + SimpleCache are loaded. The
            // module owns the only SimpleCache on Downloads/Streams; we read back through
            // its own manager + factory, never building a competing cache.
            try {
                mgrCls.getMethod("init", Context.class).invoke(mgr, context);
            } catch (Throwable t) {
                Log.w(TAG, "PLAYER-356: module AxOfflineManager.init() failed (continuing)", t);
            }

            Object dmObj = mgrCls.getMethod("getDownloadManager").invoke(mgr);
            if (!(dmObj instanceof DownloadManager)) {
                Log.w(TAG, "PLAYER-356: module getDownloadManager() null/unexpected after init");
                return null;
            }
            DownloadManager downloadManager = (DownloadManager) dmObj;

            DownloadRequest uriMatch = null;
            DownloadRequest idMatch = null;
            DownloadIndex index = downloadManager.getDownloadIndex();
            try (DownloadCursor cursor = index.getDownloads()) {
                while (cursor.moveToNext()) {
                    Download d = cursor.getDownload();
                    if (d == null || d.request == null || d.state == Download.STATE_REMOVING) {
                        continue;
                    }
                    DownloadRequest r = d.request;
                    if (uri.equals(r.uri)) {
                        uriMatch = r;
                        if (d.state == Download.STATE_COMPLETED) {
                            break;
                        }
                    } else if (idMatch == null && downloadId != null && !downloadId.isEmpty()
                            && downloadId.equals(r.id)) {
                        idMatch = r;
                    }
                }
            }

            DownloadRequest request = (uriMatch != null) ? uriMatch : idMatch;
            if (request == null) {
                Log.w(TAG, "PLAYER-356: no module download found for uri=" + uri + " id=" + downloadId);
                return null;
            }

            Object factoryObj = mgrCls.getMethod("buildDataSourceFactory", Context.class).invoke(mgr, context);
            if (!(factoryObj instanceof DataSource.Factory)) {
                Log.w(TAG, "PLAYER-356: module buildDataSourceFactory() null/unexpected");
                return null;
            }

            Log.i(TAG, "PLAYER-356: using @overon downloads module offline source (matchedBy="
                    + (uriMatch != null ? "uri" : "id") + ") for uri=" + uri + " id=" + downloadId);
            return new Object[]{ request, factoryObj };
        } catch (ClassNotFoundException e) {
            Log.d(TAG, "PLAYER-356: @overon downloads module not present; skipping offline media bridge");
            return null;
        } catch (Throwable t) {
            Log.w(TAG, "PLAYER-356: offline media bridge failed for uri=" + uri, t);
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
