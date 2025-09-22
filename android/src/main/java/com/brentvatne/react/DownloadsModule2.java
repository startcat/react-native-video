package com.brentvatne.react;

import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import android.app.ActivityManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.StatFs;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.brentvatne.license.OfflineLicenseManager;
import com.brentvatne.license.interfaces.IOfflineLicenseManagerListener;
import com.brentvatne.offline.AxDownloadService;
import com.brentvatne.offline.AxDownloadTracker;
import com.brentvatne.offline.AxOfflineManager;
import com.brentvatne.util.Utility;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.exoplayer.offline.Download;
import androidx.media3.exoplayer.offline.DownloadCursor;
import androidx.media3.exoplayer.offline.DownloadHelper;
import androidx.media3.exoplayer.offline.DownloadIndex;
import androidx.media3.exoplayer.offline.DownloadManager;
import androidx.media3.exoplayer.offline.DownloadRequest;
import androidx.media3.exoplayer.offline.DownloadService;
import androidx.media3.common.TrackGroup;
import androidx.media3.exoplayer.source.TrackGroupArray;
import androidx.media3.exoplayer.trackselection.MappingTrackSelector;
import androidx.media3.common.util.Util;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class DownloadsModule2 extends ReactContextBaseJavaModule
        implements LifecycleEventListener, IOfflineLicenseManagerListener,
        DownloadHelper.Callback, AxDownloadTracker.Listener {

    private static final String TAG = "DownloadsModule2";

    // Configuration constants
    private static final String DEFAULT_DOWNLOAD_DIR = "downloads";
    private static final String DEFAULT_TEMP_DIR = "temp";
    private static final String DEFAULT_SUBTITLES_DIR = "subtitles";

    // Property keys
    private static final String PROP_ID = "id";
    private static final String PROP_URI = "uri";
    private static final String PROP_TITLE = "title";
    private static final String PROP_QUALITY = "quality";
    private static final String PROP_ALLOW_CELLULAR = "allowCellular";
    private static final String PROP_DRM = "drm";
    private static final String PROP_SUBTITLES = "subtitles";

    private ReactApplicationContext reactContext;
    private OfflineLicenseManager mLicenseManager;
    private AxDownloadTracker mAxDownloadTracker;
    private Map<String, DownloadHelper> activeHelpers = new ConcurrentHashMap<>();

    // Configuration
    private Map<String, Object> moduleConfig = new HashMap<>();
    private String downloadDirectory = DEFAULT_DOWNLOAD_DIR;
    private String tempDirectory = DEFAULT_TEMP_DIR;
    private String subtitlesDirectory = DEFAULT_SUBTITLES_DIR;
    private int maxConcurrentDownloads = 3;
    private boolean notificationsEnabled = true;
    private String currentStreamQuality = "auto";
    private boolean allowCellularDownloads = false;
    private boolean requireWifi = true;

    // State tracking
    private volatile boolean pendingResumeAll = false;
    private volatile Promise pendingResumePromise = null;

    public DownloadsModule2(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        reactContext.addLifecycleEventListener(this);
        initializeDefaultConfig();
    }

    @Override
    public String getName() {
        return "DownloadsModule2";
    }

    private void initializeDefaultConfig() {
        moduleConfig.put("downloadDirectory", downloadDirectory);
        moduleConfig.put("tempDirectory", tempDirectory);
        moduleConfig.put("maxConcurrentDownloads", maxConcurrentDownloads);
        moduleConfig.put("enableNotifications", notificationsEnabled);
    }

    // Broadcast receiver for download progress
    private final BroadcastReceiver mBroadcastReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent != null && intent.getExtras() != null) {
                Bundle bundle = intent.getExtras();
                int progress = bundle.getInt(AxDownloadService.PROGRESS);
                String contentID = bundle.getString(AxDownloadService.KEY_CONTENT_ID);

                WritableMap params = Arguments.createMap();
                params.putInt("progress", progress);
                params.putString("id", contentID);
                params.putDouble("speed", calculateDownloadSpeed(contentID));
                params.putInt("remainingTime", estimateRemainingTime(contentID, progress));

                sendEvent("downloadProgress", params);
            }
        }
    };

    // =============================================================================
    // INITIALIZATION METHODS
    // =============================================================================

    @ReactMethod
    public void moduleInit(@Nullable ReadableMap config, final Promise promise) {
        Log.d(TAG, "Initializing DownloadsModule2");

        try {
            if (config != null) {
                updateModuleConfig(config);
            }

            // Initialize license manager
            if (this.reactContext == null) {
                promise.reject("CONTEXT_NULL", "React context is null");
                return;
            }

            mLicenseManager = new OfflineLicenseManager(this.reactContext);
            if (mLicenseManager == null) {
                promise.reject("LICENSE_MANAGER_INIT_FAILED", "Failed to initialize OfflineLicenseManager");
                return;
            }

            initOfflineManager();
            registerBroadcastReceiver();

            // Start download service
            startDownloadService();

            getSystemInfo(promise);

        } catch (Exception e) {
            Log.e(TAG, "Error initializing DownloadsModule2: " + e.getMessage(), e);
            promise.reject("INIT_FAILED", "Failed to initialize DownloadsModule2: " + e.getMessage());
        }
    }

    @ReactMethod
    public void setDownloadDirectories(ReadableMap config, final Promise promise) {
        try {
            if (config.hasKey("downloadDir")) {
                downloadDirectory = config.getString("downloadDir");
            }
            if (config.hasKey("tempDir")) {
                tempDirectory = config.getString("tempDir");
            }
            if (config.hasKey("subtitlesDir")) {
                subtitlesDirectory = config.getString("subtitlesDir");
            }

            // Create directories if they don't exist
            createDirectoriesIfNeeded();

            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("DIRECTORY_CONFIG_FAILED", "Failed to configure directories: " + e.getMessage());
        }
    }

    @ReactMethod
    public void getSystemInfo(final Promise promise) {
        try {
            WritableMap systemInfo = Arguments.createMap();

            // Storage information
            StatFs stat = new StatFs(reactContext.getFilesDir().getPath());
            long totalSpace = stat.getTotalBytes();
            long availableSpace = stat.getAvailableBytes();
            long downloadSpace = getDownloadDirectorySize();

            systemInfo.putDouble("totalSpace", (double) totalSpace);
            systemInfo.putDouble("availableSpace", (double) availableSpace);
            systemInfo.putDouble("downloadSpace", (double) downloadSpace);

            // Network information
            ConnectivityManager cm = (ConnectivityManager) reactContext.getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
            boolean isConnected = activeNetwork != null && activeNetwork.isConnectedOrConnecting();
            boolean isWifi = activeNetwork != null && activeNetwork.getType() == ConnectivityManager.TYPE_WIFI;
            boolean isCellular = activeNetwork != null && activeNetwork.getType() == ConnectivityManager.TYPE_MOBILE;

            systemInfo.putBoolean("isConnected", isConnected);
            systemInfo.putBoolean("isWifiConnected", isWifi);
            systemInfo.putBoolean("isCellularConnected", isCellular);

            promise.resolve(systemInfo);
        } catch (Exception e) {
            promise.reject("SYSTEM_INFO_FAILED", "Failed to get system info: " + e.getMessage());
        }
    }

    // =============================================================================
    // DOWNLOAD MANAGEMENT METHODS
    // =============================================================================

    @ReactMethod
    public void addDownload(ReadableMap config, final Promise promise) {
        Log.d(TAG, "Adding download");

        try {
            if (!validateDownloadConfig(config)) {
                promise.reject("INVALID_CONFIG", "Invalid download configuration");
                return;
            }

            String id = config.getString(PROP_ID);
            String uri = config.getString(PROP_URI);
            String title = config.getString(PROP_TITLE);

            // Check if download already exists
            if (findDownloadById(id) != null) {
                promise.reject("DOWNLOAD_EXISTS", "Download with this ID already exists");
                return;
            }

            // Create media item
            MediaItem mediaItem = createMediaItemFromConfig(config);

            // Download DRM license if needed
            if (config.hasKey(PROP_DRM)) {
                downloadLicenseForItem(mediaItem);
            }

            // Prepare download helper
            if (mAxDownloadTracker != null) {
                DownloadHelper helper = mAxDownloadTracker.getDownloadHelper(mediaItem, this.reactContext);
                activeHelpers.put(id, helper);
                helper.prepare(this);
                promise.resolve(null);
            } else {
                promise.reject("DOWNLOAD_TRACKER_NULL", "DownloadTracker is not initialized");
            }

        } catch (Exception e) {
            Log.e(TAG, "Error adding download: " + e.getMessage(), e);
            promise.reject("ADD_DOWNLOAD_FAILED", "Failed to add download: " + e.getMessage());
        }
    }

    @ReactMethod
    public void removeDownload(String id, final Promise promise) {
        Log.d(TAG, "Removing download: " + id);

        try {
            // Remove download helper if exists
            DownloadHelper helper = activeHelpers.remove(id);
            if (helper != null) {
                helper.release();
            }

            // Remove from download manager
            DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();
            if (manager != null) {
                DownloadService.sendRemoveDownload(reactContext, AxDownloadService.class, id, false);
            }

            // Release license if exists
            releaseLicenseForDownload(id);

            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("REMOVE_DOWNLOAD_FAILED", "Failed to remove download: " + e.getMessage());
        }
    }

    @ReactMethod
    public void pauseDownload(String id, final Promise promise) {
        Log.d(TAG, "Pausing download: " + id);

        try {
            DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();
            if (manager != null) {
                // Pause specific download
                DownloadService.sendSetStopReason(reactContext, AxDownloadService.class, id,
                        1, false); // STOP_REASON_PAUSED
                promise.resolve(null);
            } else {
                promise.reject("NO_DOWNLOAD_MANAGER", "Download manager not available");
            }
        } catch (Exception e) {
            promise.reject("PAUSE_DOWNLOAD_FAILED", "Failed to pause download: " + e.getMessage());
        }
    }

    @ReactMethod
    public void resumeDownload(String id, final Promise promise) {
        Log.d(TAG, "Resuming download: " + id);

        try {
            DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();
            if (manager != null) {
                // Resume specific download
                DownloadService.sendSetStopReason(reactContext, AxDownloadService.class, id,
                        0, false); // STOP_REASON_NONE
                promise.resolve(null);
            } else {
                promise.reject("NO_DOWNLOAD_MANAGER", "Download manager not available");
            }
        } catch (Exception e) {
            promise.reject("RESUME_DOWNLOAD_FAILED", "Failed to resume download: " + e.getMessage());
        }
    }

    @ReactMethod
    public void cancelDownload(String id, final Promise promise) {
        Log.d(TAG, "Cancelling download: " + id);

        try {
            // Remove download (same as removeDownload but with different intent)
            removeDownload(id, promise);
        } catch (Exception e) {
            promise.reject("CANCEL_DOWNLOAD_FAILED", "Failed to cancel download: " + e.getMessage());
        }
    }

    // =============================================================================
    // GLOBAL CONTROL METHODS
    // =============================================================================

    @ReactMethod
    public void pauseAll(final Promise promise) {
        Log.d(TAG, "Pausing all downloads");

        try {
            DownloadService.sendPauseDownloads(reactContext, AxDownloadService.class, false);
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("PAUSE_ALL_FAILED", "Failed to pause all downloads: " + e.getMessage());
        }
    }

    @ReactMethod
    public void resumeAll(final Promise promise) {
        Log.d(TAG, "Resuming all downloads");

        try {
            if (!isAppInForeground()) {
                Log.w(TAG, "App not in foreground, deferring resumeAll()");
                pendingResumeAll = true;
                pendingResumePromise = promise;

                WritableMap params = Arguments.createMap();
                params.putString("message", "Downloads will resume when app returns to foreground");
                sendEvent("downloadResumeDeferred", params);
                return;
            }

            startDownloadService();
            DownloadService.sendResumeDownloads(reactContext, AxDownloadService.class, false);
            promise.resolve(null);

        } catch (Exception e) {
            handleResumeAllError(e, promise);
        }
    }

    @ReactMethod
    public void cancelAll(final Promise promise) {
        Log.d(TAG, "Cancelling all downloads");

        try {
            DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();
            if (manager != null) {
                List<Download> downloads = manager.getCurrentDownloads();
                for (Download download : downloads) {
                    DownloadService.sendRemoveDownload(reactContext, AxDownloadService.class,
                            download.request.id, false);
                }
            }

            // Clear all helpers
            for (DownloadHelper helper : activeHelpers.values()) {
                helper.release();
            }
            activeHelpers.clear();

            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("CANCEL_ALL_FAILED", "Failed to cancel all downloads: " + e.getMessage());
        }
    }

    // =============================================================================
    // QUERY METHODS
    // =============================================================================

    @ReactMethod
    public void getDownloads(final Promise promise) {
        Log.d(TAG, "Getting downloads list");

        try {
            WritableArray downloadsArray = Arguments.createArray();
            DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();

            if (manager != null) {
                List<Download> downloads = manager.getCurrentDownloads();

                for (Download download : downloads) {
                    WritableMap downloadInfo = Arguments.createMap();

                    downloadInfo.putString("id", download.request.id);
                    downloadInfo.putString("uri", download.request.uri.toString());
                    downloadInfo.putString("state", mapDownloadState(download.state));
                    downloadInfo.putInt("progress", (int) download.getPercentDownloaded());
                    downloadInfo.putDouble("totalBytes", (double) download.contentLength);
                    downloadInfo.putDouble("downloadedBytes", (double) download.getBytesDownloaded());
                    downloadInfo.putDouble("speed", calculateDownloadSpeed(download.request.id));
                    downloadInfo.putInt("remainingTime", estimateRemainingTime(download.request.id,
                            (int) download.getPercentDownloaded()));

                    // Add additional metadata if available
                    if (download.request.data != null) {
                        downloadInfo.putString("title", new String(download.request.data));
                    }

                    downloadsArray.pushMap(downloadInfo);
                }
            }

            WritableMap result = Arguments.createMap();
            result.putArray("downloads", downloadsArray);
            promise.resolve(result);

        } catch (Exception e) {
            promise.reject("GET_DOWNLOADS_FAILED", "Failed to get downloads: " + e.getMessage());
        }
    }

    @ReactMethod
    public void getDownload(String id, final Promise promise) {
        Log.d(TAG, "Getting download info for: " + id);

        try {
            DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();
            if (manager == null) {
                promise.resolve(null);
                return;
            }

            Download download = findDownloadById(id);
            if (download == null) {
                promise.resolve(null);
                return;
            }

            WritableMap downloadInfo = createDownloadInfoMap(download);
            promise.resolve(downloadInfo);

        } catch (Exception e) {
            promise.reject("GET_DOWNLOAD_FAILED", "Failed to get download info: " + e.getMessage());
        }
    }

    @ReactMethod
    public void hasDownload(String id, final Promise promise) {
        try {
            boolean exists = findDownloadById(id) != null;
            promise.resolve(exists);
        } catch (Exception e) {
            promise.reject("HAS_DOWNLOAD_FAILED", "Failed to check download existence: " + e.getMessage());
        }
    }

    @ReactMethod
    public void getStats(final Promise promise) {
        try {
            WritableMap stats = Arguments.createMap();
            DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();

            if (manager != null) {
                List<Download> downloads = manager.getCurrentDownloads();

                int active = 0, queued = 0, completed = 0, failed = 0;
                long totalDownloaded = 0;
                double totalSpeed = 0;
                int speedCount = 0;

                for (Download download : downloads) {
                    switch (download.state) {
                        case Download.STATE_DOWNLOADING:
                            active++;
                            double speed = calculateDownloadSpeed(download.request.id);
                            if (speed > 0) {
                                totalSpeed += speed;
                                speedCount++;
                            }
                            break;
                        case Download.STATE_QUEUED:
                            queued++;
                            break;
                        case Download.STATE_COMPLETED:
                            completed++;
                            break;
                        case Download.STATE_FAILED:
                            failed++;
                            break;
                    }
                    totalDownloaded += download.getBytesDownloaded();
                }

                stats.putInt("activeDownloads", active);
                stats.putInt("queuedDownloads", queued);
                stats.putInt("completedDownloads", completed);
                stats.putInt("failedDownloads", failed);
                stats.putDouble("totalDownloaded", (double) totalDownloaded);
                stats.putDouble("averageSpeed", speedCount > 0 ? totalSpeed / speedCount : 0);
            }

            promise.resolve(stats);
        } catch (Exception e) {
            promise.reject("GET_STATS_FAILED", "Failed to get stats: " + e.getMessage());
        }
    }

    // =============================================================================
    // CONFIGURATION METHODS
    // =============================================================================

    @ReactMethod
    public void setStreamQuality(String quality, final Promise promise) {
        try {
            currentStreamQuality = quality;
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("SET_QUALITY_FAILED", "Failed to set stream quality: " + e.getMessage());
        }
    }

    @ReactMethod
    public void setNetworkPolicy(ReadableMap config, final Promise promise) {
        try {
            if (config.hasKey("allowCellular")) {
                allowCellularDownloads = config.getBoolean("allowCellular");
            }
            if (config.hasKey("requireWifi")) {
                requireWifi = config.getBoolean("requireWifi");
            }

            // Apply network policy to current downloads if needed
            applyNetworkPolicy();

            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("SET_NETWORK_POLICY_FAILED", "Failed to set network policy: " + e.getMessage());
        }
    }

    @ReactMethod
    public void setDownloadLimits(ReadableMap config, final Promise promise) {
        try {
            if (config.hasKey("maxConcurrent")) {
                maxConcurrentDownloads = config.getInt("maxConcurrent");
            }

            // Update download manager configuration
            DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();
            if (manager != null) {
                manager.setMaxParallelDownloads(maxConcurrentDownloads);
            }

            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("SET_LIMITS_FAILED", "Failed to set download limits: " + e.getMessage());
        }
    }

    @ReactMethod
    public void setNotificationConfig(ReadableMap config, final Promise promise) {
        try {
            if (config.hasKey("enabled")) {
                notificationsEnabled = config.getBoolean("enabled");
            }

            // Apply notification settings
            // Implementation depends on your notification system

            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("SET_NOTIFICATION_CONFIG_FAILED", "Failed to set notification config: " + e.getMessage());
        }
    }

    // =============================================================================
    // DRM MANAGEMENT METHODS
    // =============================================================================

    @ReactMethod
    public void downloadLicense(String contentId, ReadableMap drmConfig, final Promise promise) {
        try {
            if (mLicenseManager != null && drmConfig != null) {
                String licenseServer = drmConfig.getString("licenseServer");
                mLicenseManager.downloadLicenseWithResult(licenseServer, contentId, "", true);
                promise.resolve(null);
            } else {
                promise.reject("LICENSE_DOWNLOAD_FAILED", "License manager not available or invalid DRM config");
            }
        } catch (Exception e) {
            promise.reject("LICENSE_DOWNLOAD_FAILED", "Failed to download license: " + e.getMessage());
        }
    }

    @ReactMethod
    public void checkLicense(String contentId, final Promise promise) {
        try {
            if (mLicenseManager != null) {
                mLicenseManager.checkLicenseValid(contentId);
                // Result will be delivered via event
                promise.resolve(null);
            } else {
                promise.reject("LICENSE_CHECK_FAILED", "License manager not available");
            }
        } catch (Exception e) {
            promise.reject("LICENSE_CHECK_FAILED", "Failed to check license: " + e.getMessage());
        }
    }

    @ReactMethod
    public void renewLicense(String contentId, final Promise promise) {
        try {
            // Implementation depends on your DRM system
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("LICENSE_RENEW_FAILED", "Failed to renew license: " + e.getMessage());
        }
    }

    @ReactMethod
    public void releaseLicense(String contentId, final Promise promise) {
        try {
            if (mLicenseManager != null) {
                mLicenseManager.releaseLicense(contentId);
                promise.resolve(null);
            } else {
                promise.reject("LICENSE_RELEASE_FAILED", "License manager not available");
            }
        } catch (Exception e) {
            promise.reject("LICENSE_RELEASE_FAILED", "Failed to release license: " + e.getMessage());
        }
    }

    @ReactMethod
    public void releaseAllLicenses(final Promise promise) {
        try {
            if (mLicenseManager != null) {
                // Implementation depends on your license manager
                promise.resolve(null);
            } else {
                promise.reject("RELEASE_ALL_LICENSES_FAILED", "License manager not available");
            }
        } catch (Exception e) {
            promise.reject("RELEASE_ALL_LICENSES_FAILED", "Failed to release all licenses: " + e.getMessage());
        }
    }

    // =============================================================================
    // UTILITY METHODS
    // =============================================================================

    @ReactMethod
    public void generateDownloadId(String uri, final Promise promise) {
        try {
            String id = generateUniqueId(uri);
            promise.resolve(id);
        } catch (Exception e) {
            promise.reject("GENERATE_ID_FAILED", "Failed to generate download ID: " + e.getMessage());
        }
    }

    @ReactMethod
    public void validateDownloadUri(String uri, final Promise promise) {
        try {
            WritableMap result = Arguments.createMap();

            // Basic URI validation
            boolean isValid = uri != null && (uri.startsWith("http://") || uri.startsWith("https://"));
            result.putBoolean("isValid", isValid);

            if (isValid) {
                // Determine type based on URI
                String type = uri.contains(".m3u8") || uri.contains(".mpd") ? "stream" : "binary";
                result.putString("type", type);
            }

            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("VALIDATE_URI_FAILED", "Failed to validate URI: " + e.getMessage());
        }
    }

    // =============================================================================
    // HELPER METHODS
    // =============================================================================

    private void initOfflineManager() {
        if (AxOfflineManager.getInstance() != null && this.reactContext != null && mLicenseManager != null) {
            AxOfflineManager.getInstance().init(this.reactContext);

            if (mAxDownloadTracker == null) {
                mAxDownloadTracker = AxOfflineManager.getInstance().getDownloadTracker();
            }

            if (mAxDownloadTracker != null) {
                mAxDownloadTracker.addListener(this);
            } else {
                Log.e(TAG, "Failed to initialize AxDownloadTracker");
                throw new RuntimeException("Failed to initialize AxDownloadTracker");
            }

            mLicenseManager.setEventListener(this);
        }
    }

    private void registerBroadcastReceiver() {
        IntentFilter filter = new IntentFilter(AxDownloadService.NOTIFICATION);
        if (Build.VERSION.SDK_INT >= 33) {
            this.reactContext.registerReceiver(mBroadcastReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            this.reactContext.registerReceiver(mBroadcastReceiver, filter);
        }
    }

    private void startDownloadService() throws Exception {
        DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();
        if (manager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (this.reactContext.checkSelfPermission(android.Manifest.permission.FOREGROUND_SERVICE)
                        == PackageManager.PERMISSION_GRANTED) {
                    DownloadService.start(this.reactContext, AxDownloadService.class);
                    DownloadService.sendPauseDownloads(this.reactContext, AxDownloadService.class, false);
                } else {
                    throw new SecurityException("Foreground service permission required");
                }
            } else {
                DownloadService.start(this.reactContext, AxDownloadService.class);
                DownloadService.sendPauseDownloads(this.reactContext, AxDownloadService.class, false);
            }
        }
    }

    private boolean isAppInForeground() {
        try {
            if (getCurrentActivity() == null) return false;

            ActivityManager activityManager = (ActivityManager) getCurrentActivity()
                    .getSystemService(Context.ACTIVITY_SERVICE);
            if (activityManager == null) return false;

            List<ActivityManager.RunningAppProcessInfo> appProcesses =
                    activityManager.getRunningAppProcesses();
            if (appProcesses == null) return false;

            String packageName = reactContext.getPackageName();
            for (ActivityManager.RunningAppProcessInfo appProcess : appProcesses) {
                if (appProcess.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
                        && appProcess.processName.equals(packageName)) {
                    return true;
                }
            }
            return false;
        } catch (Exception e) {
            Log.e(TAG, "Error checking foreground status", e);
            return false;
        }
    }

    private MediaItem createMediaItemFromConfig(ReadableMap config) {
        MediaItem.Builder builder = new MediaItem.Builder();

        String id = config.getString(PROP_ID);
        String uri = config.getString(PROP_URI);
        String title = config.getString(PROP_TITLE);

        builder.setMediaId(id);
        builder.setUri(uri);

        if (title != null) {
            builder.setMediaMetadata(new MediaMetadata.Builder().setTitle(title).build());
        }

        // Add DRM configuration if present
        if (config.hasKey(PROP_DRM)) {
            ReadableMap drm = config.getMap(PROP_DRM);
            if (drm != null) {
                MediaItem.DrmConfiguration drmConfig = createDrmConfiguration(drm);
                builder.setDrmConfiguration(drmConfig);
            }
        }

        return builder.build();
    }

    private MediaItem.DrmConfiguration createDrmConfiguration(ReadableMap drm) {
        String type = drm.getString("type");
        String licenseServer = drm.getString("licenseServer");

        UUID drmUuid = Util.getDrmUuid(type);
        MediaItem.DrmConfiguration.Builder drmBuilder =
                new MediaItem.DrmConfiguration.Builder(drmUuid);

        drmBuilder.setLicenseUri(licenseServer);

        // Add headers if present
        if (drm.hasKey("headers")) {
            ReadableMap headers = drm.getMap("headers");
            Map<String, String> requestHeaders = new HashMap<>();
            // Convert ReadableMap to Map<String, String>
            // Implementation depends on your specific needs
            drmBuilder.setLicenseRequestHeaders(requestHeaders);
        }

        return drmBuilder.build();
    }

    private boolean validateDownloadConfig(ReadableMap config) {
        return config != null
                && config.hasKey(PROP_ID)
                && config.hasKey(PROP_URI)
                && config.hasKey(PROP_TITLE);
    }

    private String mapDownloadState(int state) {
        switch (state) {
            case Download.STATE_COMPLETED: return "COMPLETED";
            case Download.STATE_FAILED: return "FAILED";
            case Download.STATE_REMOVING: return "REMOVING";
            case Download.STATE_DOWNLOADING: return "DOWNLOADING";
            case Download.STATE_QUEUED: return "QUEUED";
            case Download.STATE_RESTARTING: return "RESTARTING";
            case Download.STATE_STOPPED: return "STOPPED";
            default: return "UNKNOWN";
        }
    }

    private Download findDownloadById(String id) {
        try {
            DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();
            if (manager == null) return null;

            List<Download> downloads = manager.getCurrentDownloads();
            for (Download download : downloads) {
                if (id.equals(download.request.id)) {
                    return download;
                }
            }
            return null;
        } catch (Exception e) {
            Log.e(TAG, "Error finding download by ID", e);
            return null;
        }
    }

    private WritableMap createDownloadInfoMap(Download download) {
        WritableMap info = Arguments.createMap();

        info.putString("id", download.request.id);
        info.putString("uri", download.request.uri.toString());
        info.putString("state", mapDownloadState(download.state));
        info.putInt("progress", (int) download.getPercentDownloaded());
        info.putDouble("totalBytes", (double) download.contentLength);
        info.putDouble("downloadedBytes", (double) download.getBytesDownloaded());
        info.putDouble("speed", calculateDownloadSpeed(download.request.id));
        info.putInt("remainingTime", estimateRemainingTime(download.request.id,
                (int) download.getPercentDownloaded()));

        if (download.request.data != null) {
            info.putString("title", new String(download.request.data));
        }

        return info;
    }

    private double calculateDownloadSpeed(String downloadId) {
        // Implementation depends on your speed tracking mechanism
        // This is a placeholder
        return 0.0;
    }

    private int estimateRemainingTime(String downloadId, int progress) {
        // Implementation depends on your speed tracking mechanism
        // This is a placeholder
        return 0;
    }

    private String generateUniqueId(String uri) {
        // Generate unique ID based on URI and timestamp
        return uri.hashCode() + "_" + System.currentTimeMillis();
    }

    private void updateModuleConfig(ReadableMap config) {
        if (config.hasKey("downloadDirectory")) {
            downloadDirectory = config.getString("downloadDirectory");
        }
        if (config.hasKey("tempDirectory")) {
            tempDirectory = config.getString("tempDirectory");
        }
        if (config.hasKey("maxConcurrentDownloads")) {
            maxConcurrentDownloads = config.getInt("maxConcurrentDownloads");
        }
        if (config.hasKey("enableNotifications")) {
            notificationsEnabled = config.getBoolean("enableNotifications");
        }
    }

    private void createDirectoriesIfNeeded() {
        // Create download directories
        File downloadDir = new File(reactContext.getFilesDir(), downloadDirectory);
        if (!downloadDir.exists()) {
            downloadDir.mkdirs();
        }

        File tempDir = new File(reactContext.getFilesDir(), tempDirectory);
        if (!tempDir.exists()) {
            tempDir.mkdirs();
        }

        File subtitlesDir = new File(reactContext.getFilesDir(), subtitlesDirectory);
        if (!subtitlesDir.exists()) {
            subtitlesDir.mkdirs();
        }
    }

    private long getDownloadDirectorySize() {
        try {
            File downloadDir = new File(reactContext.getFilesDir(), downloadDirectory);
            return calculateDirectorySize(downloadDir);
        } catch (Exception e) {
            return 0;
        }
    }

    private long calculateDirectorySize(File directory) {
        long size = 0;
        if (directory.exists() && directory.isDirectory()) {
            File[] files = directory.listFiles();
            if (files != null) {
                for (File file : files) {
                    if (file.isDirectory()) {
                        size += calculateDirectorySize(file);
                    } else {
                        size += file.length();
                    }
                }
            }
        }
        return size;
    }

    private void downloadLicenseForItem(MediaItem mediaItem) {
        MediaItem.DrmConfiguration drmConfig = Utility.getDrmConfiguration(mediaItem);
        if (drmConfig != null && mLicenseManager != null) {
            mLicenseManager.downloadLicenseWithResult(
                    String.valueOf(drmConfig.licenseUri),
                    String.valueOf(Utility.getPlaybackProperties(mediaItem).uri),
                    "",
                    true
            );
        }
    }

    private void releaseLicenseForDownload(String downloadId) {
        // Implementation depends on how you map download IDs to content IDs
        if (mLicenseManager != null) {
            mLicenseManager.releaseLicense(downloadId);
        }
    }

    private void applyNetworkPolicy() {
        // Implementation depends on your network policy enforcement
        // This might involve pausing/resuming downloads based on network type
    }

    private void handleResumeAllError(Exception e, Promise promise) {
        if (e.getClass().getSimpleName().contains("ForegroundServiceStartNotAllowedException") ||
                (e.getMessage() != null && e.getMessage().contains("startForegroundService() not allowed"))) {

            Log.w(TAG, "Cannot start foreground service now, will retry when app comes to foreground", e);
            pendingResumeAll = true;
            pendingResumePromise = promise;

            WritableMap params = Arguments.createMap();
            params.putString("message", "Downloads cannot start now due to Android restrictions. Will retry when app returns to foreground.");
            params.putString("error", e.getMessage());
            sendEvent("downloadResumeDeferred", params);

        } else {
            Log.e(TAG, "Unexpected error in resumeAll", e);
            promise.reject("RESUME_ERROR", "Unexpected error resuming downloads: " + e.getMessage());
        }
    }

    private void sendEvent(String eventName, WritableMap params) {
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
    }

    // =============================================================================
    // LIFECYCLE AND EVENT HANDLERS
    // =============================================================================

    @Override
    public void onHostResume() {
        Log.d(TAG, "onHostResume");

        if (pendingResumeAll) {
            Log.d(TAG, "Executing pending resumeAll()");
            pendingResumeAll = false;

            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                try {
                    DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();
                    if (reactContext != null && manager != null) {
                        DownloadService.sendResumeDownloads(reactContext, AxDownloadService.class, false);

                        if (pendingResumePromise != null) {
                            pendingResumePromise.resolve(null);
                            pendingResumePromise = null;
                        }

                        WritableMap params = Arguments.createMap();
                        params.putString("message", "Downloads resumed successfully");
                        sendEvent("downloadResumedAfterDefer", params);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Failed to execute pending resumeAll()", e);
                    if (pendingResumePromise != null) {
                        pendingResumePromise.reject("RESUME_FAILED", "Failed to resume downloads after defer: " + e.getMessage());
                        pendingResumePromise = null;
                    }
                }
            }, 1000);
        }
    }

    @Override
    public void onHostPause() {
        Log.d(TAG, "onHostPause");
    }

    @Override
    public void onHostDestroy() {
        Log.d(TAG, "onHostDestroy");

        if (pendingResumePromise != null) {
            pendingResumePromise.reject("APP_DESTROYED", "App was destroyed before resume could complete");
            pendingResumePromise = null;
        }
        pendingResumeAll = false;

        // Cleanup download helpers
        for (DownloadHelper helper : activeHelpers.values()) {
            try {
                helper.release();
            } catch (Exception e) {
                Log.w(TAG, "Error releasing DownloadHelper", e);
            }
        }
        activeHelpers.clear();

        if (mAxDownloadTracker != null) {
            mAxDownloadTracker.removeListener(this);
            mAxDownloadTracker = null;
        }

        if (mLicenseManager != null) {
            try {
                mLicenseManager.release();
            } catch (Exception e) {
                Log.w(TAG, "Error releasing LicenseManager", e);
            }
            mLicenseManager = null;
        }

        try {
            reactContext.unregisterReceiver(mBroadcastReceiver);
        } catch (IllegalArgumentException e) {
            Log.w(TAG, "Error unregistering broadcast receiver", e);
        }
    }

    // =============================================================================
    // DOWNLOAD TRACKER EVENTS
    // =============================================================================

    @Override
    public void onDownloadsChanged(int state, String id) {
        WritableMap params = Arguments.createMap();
        params.putString("id", id);
        params.putString("state", mapDownloadState(state));
        sendEvent("downloadStateChanged", params);
    }

    @Override
    public void onPrepared(@NonNull DownloadHelper helper) {
        Log.d(TAG, "Download prepared");

        // Find the corresponding download and start it
        // Implementation depends on how you track helper-to-download mapping

        WritableMap params = Arguments.createMap();
        sendEvent("downloadPrepared", params);
    }

    @Override
    public void onPrepareError(@NonNull DownloadHelper helper, @NonNull IOException e) {
        Log.e(TAG, "Download prepare error", e);

        WritableMap params = Arguments.createMap();
        params.putString("error", e.getMessage());
        sendEvent("downloadPrepareError", params);
    }

    // =============================================================================
    // LICENSE MANAGER EVENTS
    // =============================================================================

    @Override
    public void onLicenseDownloaded(String manifestUrl) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        sendEvent("licenseDownloaded", params);
    }

    @Override
    public void onLicenseDownloadedWithResult(String manifestUrl, byte[] keyIds) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        sendEvent("licenseDownloaded", params);
    }

    @Override
    public void onLicenseDownloadFailed(int code, String description, String manifestUrl) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        params.putString("error", description);
        params.putInt("code", code);
        sendEvent("licenseError", params);
    }

    @Override
    public void onLicenseCheck(boolean isValid, String manifestUrl) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        params.putBoolean("isValid", isValid);
        sendEvent("licenseCheck", params);
    }

    @Override
    public void onLicenseCheckFailed(int code, String description, String manifestUrl) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        params.putString("error", description);
        params.putInt("code", code);
        sendEvent("licenseCheckFailed", params);
    }

    @Override
    public void onLicenseReleased(String manifestUrl) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        sendEvent("licenseReleased", params);
    }

    @Override
    public void onLicenseReleaseFailed(int code, String description, String manifestUrl) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        params.putString("error", description);
        params.putInt("code", code);
        sendEvent("licenseReleaseFailed", params);
    }

    @Override
    public void onLicenseKeysRestored(String manifestUrl, byte[] keyIds) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        sendEvent("licenseKeysRestored", params);
    }

    @Override
    public void onLicenseRestoreFailed(int code, String description, String manifestUrl) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        params.putString("error", description);
        params.putInt("code", code);
        sendEvent("licenseRestoreFailed", params);
    }

    @Override
    public void onAllLicensesReleased() {
        WritableMap params = Arguments.createMap();
        sendEvent("allLicensesReleased", params);
    }

    @Override
    public void onAllLicensesReleaseFailed(int code, String description) {
        WritableMap params = Arguments.createMap();
        params.putString("error", description);
        params.putInt("code", code);
        sendEvent("allLicensesReleaseFailed", params);
    }
}