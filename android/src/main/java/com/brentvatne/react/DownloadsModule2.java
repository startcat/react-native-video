package com.brentvatne.react;

import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableType;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
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
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.TrackGroup;
import androidx.media3.exoplayer.source.TrackGroupArray;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
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
    private static final String DEFAULT_STREAMS_DIR = "streams";
    private static final String DEFAULT_BINARIES_DIR = "binaries";
    private static final String DEFAULT_LICENSES_DIR = "licenses";
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
    private String streamsDirectory = DEFAULT_STREAMS_DIR;
    private String binariesDirectory = DEFAULT_BINARIES_DIR;
    private String licensesDirectory = DEFAULT_LICENSES_DIR;
    private String subtitlesDirectory = DEFAULT_SUBTITLES_DIR;
    private int maxConcurrentDownloads = 3;
    private boolean notificationsEnabled = true;
    private String currentStreamQuality = "auto";
    private boolean allowCellularDownloads = false;
    private boolean requireWifi = true;

    // State tracking
    private volatile boolean pendingResumeAll = false;
    private volatile Promise pendingResumePromise = null;
    
    // Track quality setting per download
    private Map<String, String> activeDownloadQuality = new ConcurrentHashMap<>();
    
    // Track DRM message per download for offline license acquisition
    private Map<String, String> activeDrmMessages = new ConcurrentHashMap<>();

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

                // Obtener Download actual para incluir totalBytes y bytesDownloaded
                Download download = findDownloadById(contentID);
                if (download != null) {
                    // Calculate accurate total bytes (same logic as getDownloads/createDownloadInfoMap)
                    long reportedBytes = download.contentLength;
                    long estimatedBytes = 0;
                    long totalBytes = reportedBytes;
                    
                    if (download.getPercentDownloaded() >= 5 && download.getBytesDownloaded() > 0) {
                        estimatedBytes = (long) (download.getBytesDownloaded() / (download.getPercentDownloaded() / 100.0));
                        
                        if (reportedBytes == C.LENGTH_UNSET || reportedBytes <= 0) {
                            // ContentLength is unknown - ALWAYS use estimated size
                            totalBytes = estimatedBytes;
                        } else if (estimatedBytes > 0) {
                            // ContentLength is known - compare with estimated
                            double difference = Math.abs(reportedBytes - estimatedBytes) / (double) reportedBytes;
                            
                            if (difference > 0.10 && estimatedBytes < reportedBytes) {
                                totalBytes = estimatedBytes;
                            }
                        }
                    } else if (reportedBytes == C.LENGTH_UNSET || reportedBytes <= 0) {
                        // No progress yet and no reported size - use 0
                        totalBytes = 0;
                    }
                    
                    params.putDouble("totalBytes", (double) totalBytes);
                    params.putDouble("bytesDownloaded", (double) download.getBytesDownloaded());
                } else {
                    // Fallback si no se encuentra el download
                    params.putDouble("totalBytes", 0);
                    params.putDouble("bytesDownloaded", 0);
                }

                sendEvent("overonDownloadProgress", params);
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
            if (config.hasKey("streamsDir")) {
                streamsDirectory = config.getString("streamsDir");
            }
            if (config.hasKey("binariesDir")) {
                binariesDirectory = config.getString("binariesDir");
            }
            if (config.hasKey("licensesDir")) {
                licensesDirectory = config.getString("licensesDir");
            }
            if (config.hasKey("subtitlesDir")) {
                subtitlesDirectory = config.getString("subtitlesDir");
            }

            // Create directories if they don't exist
            createDirectoriesIfNeeded();

            Log.d(TAG, "Download directories configured - Streams: " + streamsDirectory + 
                       ", Binaries: " + binariesDirectory + ", Licenses: " + licensesDirectory);

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
            // IMPORTANTE: Samsung y otros fabricantes reservan espacio que StatFs no cuenta
            // Usar StorageStatsManager en Android 8.0+ para obtener el espacio real del sistema
            long totalSpace = 0;
            long availableSpace = 0;
            
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                try {
                    // Android 8.0+: Usar StorageStatsManager para obtener stats precisos
                    android.app.usage.StorageStatsManager storageStatsManager = 
                        (android.app.usage.StorageStatsManager) reactContext.getSystemService(Context.STORAGE_STATS_SERVICE);
                    
                    if (storageStatsManager != null) {
                        java.util.UUID uuid = android.os.storage.StorageManager.UUID_DEFAULT;
                        totalSpace = storageStatsManager.getTotalBytes(uuid);
                        availableSpace = storageStatsManager.getFreeBytes(uuid);
                        Log.d(TAG, "Device: " + android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL + ", Android: " + android.os.Build.VERSION.RELEASE);
                    } else {
                        Log.w(TAG, "StorageStatsManager service is null");
                    }
                } catch (SecurityException e) {
                    Log.w(TAG, "StorageStatsManager SecurityException (might need PACKAGE_USAGE_STATS permission): " + e.getMessage());
                } catch (Exception e) {
                    Log.w(TAG, "StorageStatsManager failed: " + e.getClass().getName() + " - " + e.getMessage());
                    e.printStackTrace();
                }
            }
            
            // Fallback a StatFs si StorageStatsManager no está disponible
            if (totalSpace == 0) {
                try {
                    File externalStorage = android.os.Environment.getExternalStorageDirectory();
                    StatFs stat = new StatFs(externalStorage.getPath());
                    totalSpace = stat.getTotalBytes();
                    availableSpace = stat.getAvailableBytes();
                } catch (Exception e) {
                    Log.e(TAG, "StatFs also failed: " + e.getMessage());
                }
            }
            
            long downloadSpace = getDownloadDirectorySize();
            Log.d(TAG, "Storage info - Total: " + totalSpace + ", Available: " + availableSpace + ", Used: " + (totalSpace - availableSpace));

            systemInfo.putDouble("totalSpace", (double) totalSpace);
            systemInfo.putDouble("availableSpace", (double) availableSpace);
            systemInfo.putDouble("downloadSpace", (double) downloadSpace);

            // Directory paths information
            File downloadDir = new File(reactContext.getFilesDir(), downloadDirectory);
            File tempDir = new File(reactContext.getCacheDir(), tempDirectory);
            systemInfo.putString("downloadDirectory", downloadDir.getAbsolutePath());
            systemInfo.putString("tempDirectory", tempDir.getAbsolutePath());
            
            Log.d(TAG, "Download directory: " + downloadDir.getAbsolutePath());
            Log.d(TAG, "Temp directory: " + tempDir.getAbsolutePath());

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
            Log.e(TAG, "Error getting system info", e);
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
            Log.d(TAG, "Step 1: Validating config");
            if (!validateDownloadConfig(config)) {
                Log.e(TAG, "Config validation failed");
                promise.reject("INVALID_CONFIG", "Invalid download configuration");
                return;
            }

            String id = config.getString(PROP_ID);
            String uri = config.getString(PROP_URI);
            String title = config.getString(PROP_TITLE);
            String quality = config.hasKey(PROP_QUALITY) ? config.getString(PROP_QUALITY) : currentStreamQuality;
            
            // Store quality for later use in onPrepared
            activeDownloadQuality.put(id, quality);
            
            Log.d(TAG, "Step 2: Config validated - ID: " + id + ", URI: " + uri + ", Quality: " + quality);

            // Check if download already exists in the index (including failed/stopped downloads)
            Download existingDownload = findDownloadInIndex(id);
            if (existingDownload != null) {
                int state = existingDownload.state;
                Log.d(TAG, "Found existing download in index: " + id + ", state: " + mapDownloadState(state));
                
                // Si está en un estado activo válido, rechazar
                if (state == Download.STATE_DOWNLOADING || state == Download.STATE_QUEUED || 
                    state == Download.STATE_RESTARTING || state == Download.STATE_COMPLETED) {
                    Log.e(TAG, "Download already exists in valid state: " + id);
                    promise.reject("DOWNLOAD_EXISTS", "Download with this ID already exists");
                    return;
                }
                
                // Si está en estado FAILED, STOPPED o REMOVING, limpiar antes de continuar
                if (state == Download.STATE_FAILED || state == Download.STATE_STOPPED || 
                    state == Download.STATE_REMOVING) {
                    Log.w(TAG, "Cleaning up stale download before re-adding: " + id + " (state: " + mapDownloadState(state) + ")");
                    forceRemoveDownloadFromIndex(id);
                }
            }
            Log.d(TAG, "Step 3: Download does not exist or was cleaned up, proceeding");

            // Create media item
            Log.d(TAG, "Step 4: Creating MediaItem");
            MediaItem mediaItem = createMediaItemFromConfig(config);
            if (mediaItem == null) {
                Log.e(TAG, "Failed to create MediaItem");
                promise.reject("MEDIA_ITEM_FAILED", "Failed to create MediaItem");
                return;
            }
            Log.d(TAG, "Step 5: MediaItem created successfully");

            // Download DRM license if needed
            if (config.hasKey(PROP_DRM)) {
                Log.d(TAG, "Step 6: Processing DRM license");
                downloadLicenseForItem(mediaItem);
            } else {
                Log.d(TAG, "Step 6: No DRM, skipping license");
            }

            // Prepare download helper
            Log.d(TAG, "Step 7: Checking AxDownloadTracker availability");
            if (mAxDownloadTracker != null) {
                Log.d(TAG, "Step 8: Getting DownloadHelper for ID: " + id);
                Log.d(TAG, "Active helpers before: " + activeHelpers.size());
                
                DownloadHelper helper = mAxDownloadTracker.getDownloadHelper(mediaItem, this.reactContext);
                if (helper == null) {
                    Log.e(TAG, "Failed to get DownloadHelper for ID: " + id);
                    Log.e(TAG, "MediaItem details - ID: " + mediaItem.mediaId + ", URI: " + mediaItem.localConfiguration.uri);
                    promise.reject("HELPER_FAILED", "Failed to create DownloadHelper for ID: " + id);
                    return;
                }
                
                Log.d(TAG, "Step 9: Storing helper for ID: " + id);
                // Clean up any existing helper for this ID (shouldn't happen, but safety check)
                DownloadHelper existingHelper = activeHelpers.get(id);
                if (existingHelper != null) {
                    Log.w(TAG, "Found existing helper for ID: " + id + ", releasing it");
                    try {
                        existingHelper.release();
                    } catch (Exception e) {
                        Log.e(TAG, "Error releasing existing helper", e);
                    }
                }
                
                activeHelpers.put(id, helper);
                Log.d(TAG, "Active helpers after: " + activeHelpers.size());
                
                Log.d(TAG, "Step 10: Calling helper.prepare() for ID: " + id);
                helper.prepare(this);
                
                Log.d(TAG, "Step 11: Prepare called, resolving promise for ID: " + id);
                promise.resolve(null);
            } else {
                Log.e(TAG, "AxDownloadTracker is null");
                promise.reject("DOWNLOAD_TRACKER_NULL", "DownloadTracker is not initialized");
            }

        } catch (Exception e) {
            Log.e(TAG, "Error adding download at step: " + e.getMessage(), e);
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
                Log.d(TAG, "Download helper released for: " + id);
            }

            // Clean up speed tracking (SIEMPRE, independientemente del estado del manager)
            downloadStartTimes.remove(id);
            lastBytesDownloaded.remove(id);
            lastSpeedCheckTime.remove(id);
            
            // Clean up quality setting
            activeDownloadQuality.remove(id);
            
            // Clean up DRM message
            activeDrmMessages.remove(id);

            // Release license if exists
            releaseLicenseForDownload(id);

            // Remove from download manager
            DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();
            if (manager != null) {
                // Send remove with foreground=false (will delete files)
                DownloadService.sendRemoveDownload(reactContext, AxDownloadService.class, id, false);
                Log.d(TAG, "Remove download command sent to DownloadService for: " + id);
                
                // Wait a bit for the download manager to process the removal
                // This ensures files are actually deleted before we resolve the promise
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                    Log.d(TAG, "Download removal completed (after delay) for: " + id);
                    promise.resolve(null);
                }, 500);
                return; // Don't resolve immediately
            } else {
                Log.w(TAG, "DownloadManager is null, attempting cleanup without it: " + id);
                
                // Intentar limpiar archivos manualmente si el manager no está disponible
                // Esto puede ocurrir si la descarga falló antes de iniciar
                try {
                    forceRemoveDownloadFromIndex(id);
                } catch (Exception cleanupError) {
                    Log.w(TAG, "Cleanup without manager failed (may be OK if download never started): " + cleanupError.getMessage());
                }
            }

            promise.resolve(null);
        } catch (Exception e) {
            Log.e(TAG, "Failed to remove download: " + id, e);
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
                sendEvent("overonDownloadResumeDeferred", params);
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
                    
                    // Calculate accurate total bytes (same logic as createDownloadInfoMap)
                    long reportedBytes = download.contentLength;
                    long estimatedBytes = 0;
                    long totalBytes = reportedBytes;

					Log.d(TAG, String.format("[getDownloads] Dani 1"));
                    
                    if (download.getPercentDownloaded() >= 5 && download.getBytesDownloaded() > 0) {
                        estimatedBytes = (long) (download.getBytesDownloaded() / (download.getPercentDownloaded() / 100.0));

						Log.d(TAG, String.format("[getDownloads] Dani 2"));
                        
                        if (reportedBytes == C.LENGTH_UNSET || reportedBytes <= 0) {
                            // ContentLength is unknown - ALWAYS use estimated size
                            totalBytes = estimatedBytes;
                            Log.d(TAG, String.format("[getDownloads] ContentLength unknown for %s, using estimated: %.2f MB (downloaded: %.2f MB, progress: %d%%)",
                                download.request.id,
                                estimatedBytes / (1024.0 * 1024.0),
                                download.getBytesDownloaded() / (1024.0 * 1024.0),
                                (int) download.getPercentDownloaded()));
                        } else if (estimatedBytes > 0) {
                            // ContentLength is known - compare with estimated
                            double difference = Math.abs(reportedBytes - estimatedBytes) / (double) reportedBytes;
                            
                            if (difference > 0.10 && estimatedBytes < reportedBytes) {
                                totalBytes = estimatedBytes;
                            }
                        }
                    } else if (reportedBytes == C.LENGTH_UNSET || reportedBytes <= 0) {
                        // No progress yet and no reported size - use 0
                        totalBytes = 0;
                    }

					Log.d(TAG, String.format("[getDownloads] Dani 3"));
                    
                    downloadInfo.putDouble("totalBytes", (double) totalBytes);
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
            // Buscar en el DownloadIndex completo, no solo en descargas activas
            Download download = findDownloadInIndex(id);
            
            if (download == null) {
                promise.resolve(false);
                return;
            }
            
            // Solo considerar que existe si está en un estado válido para reanudar
            // Excluir REMOVING, FAILED y STOPPED ya que estas descargas no se pueden reanudar
            boolean isValidState = download.state != Download.STATE_REMOVING 
                && download.state != Download.STATE_FAILED
                && download.state != Download.STATE_STOPPED;
            
            Log.d(TAG, "hasDownload(" + id + "): found=" + (download != null) + 
                ", state=" + mapDownloadState(download.state) + ", isValid=" + isValidState);
            
            promise.resolve(isValidState);
        } catch (Exception e) {
            Log.e(TAG, "hasDownload error for " + id, e);
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
                    // Inicializar en estado PAUSADO por defecto - JavaScript controlará cuando resumir
                    DownloadService.sendPauseDownloads(this.reactContext, AxDownloadService.class, true);
                } else {
                    throw new SecurityException("Foreground service permission required");
                }
            } else {
                DownloadService.start(this.reactContext, AxDownloadService.class);
                // Inicializar en estado PAUSADO por defecto - JavaScript controlará cuando resumir
                DownloadService.sendPauseDownloads(this.reactContext, AxDownloadService.class, true);
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
            if (headers != null) {
                Map<String, String> requestHeaders = new HashMap<>();
                
                // Convert ReadableMap to Map<String, String>
                try {
                    ReadableMapKeySetIterator iterator = headers.keySetIterator();
                    while (iterator.hasNextKey()) {
                        String key = iterator.nextKey();
                        if (headers.hasKey(key) && headers.getType(key) == ReadableType.String) {
                            String value = headers.getString(key);
                            if (value != null) {
                                requestHeaders.put(key, value);
                            }
                        }
                    }
                    Log.d(TAG, "Added DRM headers: " + requestHeaders.size() + " entries");
                    drmBuilder.setLicenseRequestHeaders(requestHeaders);
                } catch (Exception e) {
                    Log.w(TAG, "Error processing DRM headers", e);
                }
            }
        }
        
        // Store drmMessage if present (needed for Axinom offline downloads)
        if (drm.hasKey("drmMessage")) {
            String drmMessage = drm.getString("drmMessage");
            if (drmMessage != null && !drmMessage.trim().isEmpty()) {
                // We'll store it temporarily and retrieve it in downloadLicenseForItem
                // Since we don't have the download ID here, we'll use the licenseServer as key
                activeDrmMessages.put(licenseServer, drmMessage);
                Log.d(TAG, "Stored DRM message for license server: " + licenseServer);
            }
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
    
    /**
     * Busca una descarga en el DownloadIndex completo (incluye descargas no activas)
     * Esto es necesario para detectar descargas canceladas/fallidas que aún existen en el índice
     */
    private Download findDownloadInIndex(String id) {
        try {
            DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();
            if (manager == null) return null;
            
            DownloadIndex downloadIndex = manager.getDownloadIndex();
            if (downloadIndex == null) return null;
            
            DownloadCursor cursor = downloadIndex.getDownloads();
            while (cursor.moveToNext()) {
                Download download = cursor.getDownload();
                if (download != null && id.equals(download.request.id)) {
                    cursor.close();
                    return download;
                }
            }
            cursor.close();
            return null;
        } catch (Exception e) {
            Log.e(TAG, "Error finding download in index: " + id, e);
            return null;
        }
    }
    
    /**
     * Elimina una descarga del índice de forma síncrona y espera a que se complete
     * Útil para limpiar descargas problemáticas antes de crear nuevas
     */
    private void forceRemoveDownloadFromIndex(String id) {
        try {
            Log.d(TAG, "Force removing download from index: " + id);
            
            // Primero intentar con el servicio normal
            DownloadService.sendRemoveDownload(reactContext, AxDownloadService.class, id, false);
            
            // Esperar un poco para que se procese
            Thread.sleep(300);
            
            // Verificar si se eliminó
            Download stillExists = findDownloadInIndex(id);
            if (stillExists != null) {
                Log.w(TAG, "Download still exists after removal attempt, state: " + mapDownloadState(stillExists.state));
            } else {
                Log.d(TAG, "Download successfully removed from index: " + id);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error force removing download: " + id, e);
        }
    }

    private WritableMap createDownloadInfoMap(Download download) {
        WritableMap info = Arguments.createMap();

        info.putString("id", download.request.id);
        info.putString("uri", download.request.uri.toString());
        info.putString("state", mapDownloadState(download.state));
        info.putInt("progress", (int) download.getPercentDownloaded());
        
        // ExoPlayer's contentLength may report full manifest size instead of selected tracks
        // OR may be unknown (-1). Always try to estimate from actual progress.
        long reportedBytes = download.contentLength;
        long estimatedBytes = 0;
        long totalBytes = reportedBytes;
        
        // If we have progress > 5%, we can estimate the real total size
        if (download.getPercentDownloaded() >= 5 && download.getBytesDownloaded() > 0) {
            estimatedBytes = (long) (download.getBytesDownloaded() / (download.getPercentDownloaded() / 100.0));
            
            if (reportedBytes == C.LENGTH_UNSET || reportedBytes <= 0) {
                // ContentLength is unknown - ALWAYS use estimated size
                totalBytes = estimatedBytes;
                Log.d(TAG, String.format("ContentLength unknown for %s, using estimated: %.2f MB (downloaded: %.2f MB, progress: %d%%)",
                    download.request.id,
                    estimatedBytes / (1024.0 * 1024.0),
                    download.getBytesDownloaded() / (1024.0 * 1024.0),
                    (int) download.getPercentDownloaded()));
            } else if (estimatedBytes > 0) {
                // ContentLength is known - compare with estimated
                double difference = Math.abs(reportedBytes - estimatedBytes) / (double) reportedBytes;
                
                if (difference > 0.10 && estimatedBytes < reportedBytes) {
                    // Use estimated size as it's more accurate for selected quality
                    totalBytes = estimatedBytes;
                    Log.d(TAG, String.format("Using estimated size for %s: %.2f MB (reported: %.2f MB, difference: %.1f%%, progress: %d%%)",
                        download.request.id, 
                        estimatedBytes / (1024.0 * 1024.0),
                        reportedBytes / (1024.0 * 1024.0),
                        difference * 100,
                        (int) download.getPercentDownloaded()));
                } else {
                    Log.d(TAG, String.format("Using reported size for %s: %.2f MB (estimated: %.2f MB, downloaded: %.2f MB, progress: %d%%)",
                        download.request.id,
                        reportedBytes / (1024.0 * 1024.0),
                        estimatedBytes / (1024.0 * 1024.0),
                        download.getBytesDownloaded() / (1024.0 * 1024.0),
                        (int) download.getPercentDownloaded()));
                }
            }
        } else if (reportedBytes != C.LENGTH_UNSET && reportedBytes > 0) {
            // Early progress and we have reported size
            Log.d(TAG, String.format("Early progress for %s: %.2f MB total, %.2f MB downloaded (%d%%)",
                download.request.id,
                reportedBytes / (1024.0 * 1024.0),
                download.getBytesDownloaded() / (1024.0 * 1024.0),
                (int) download.getPercentDownloaded()));
        } else {
            // No progress yet and no reported size - use 0
            totalBytes = 0;
            Log.d(TAG, String.format("No size information available yet for %s (progress: %d%%)",
                download.request.id,
                (int) download.getPercentDownloaded()));
        }
        
        info.putDouble("totalBytes", (double) totalBytes);
        info.putDouble("downloadedBytes", (double) download.getBytesDownloaded());
        info.putDouble("speed", calculateDownloadSpeed(download.request.id));
        info.putInt("remainingTime", estimateRemainingTime(download.request.id,
                (int) download.getPercentDownloaded()));

        if (download.request.data != null) {
            info.putString("title", new String(download.request.data));
        }

        return info;
    }

    // Speed tracking for downloads
    private Map<String, Long> downloadStartTimes = new ConcurrentHashMap<>();
    private Map<String, Long> lastBytesDownloaded = new ConcurrentHashMap<>();
    private Map<String, Long> lastSpeedCheckTime = new ConcurrentHashMap<>();

    private double calculateDownloadSpeed(String downloadId) {
        try {
            Download download = findDownloadById(downloadId);
            if (download == null) return 0.0;

            long currentTime = System.currentTimeMillis();
            long currentBytes = download.getBytesDownloaded();
            
            Long lastTime = lastSpeedCheckTime.get(downloadId);
            Long lastBytes = lastBytesDownloaded.get(downloadId);
            
            if (lastTime != null && lastBytes != null && currentTime > lastTime) {
                long timeDiff = currentTime - lastTime;
                long bytesDiff = currentBytes - lastBytes;
                
                if (timeDiff > 0) {
                    // Speed in bytes per second
                    double speed = (double) bytesDiff / (timeDiff / 1000.0);
                    
                    // Update tracking data
                    lastSpeedCheckTime.put(downloadId, currentTime);
                    lastBytesDownloaded.put(downloadId, currentBytes);
                    
                    return Math.max(0, speed); // Ensure non-negative
                }
            }
            
            // Initialize tracking for new downloads
            lastSpeedCheckTime.put(downloadId, currentTime);
            lastBytesDownloaded.put(downloadId, currentBytes);
            return 0.0;
            
        } catch (Exception e) {
            Log.w(TAG, "Error calculating download speed for " + downloadId, e);
            return 0.0;
        }
    }

    private int estimateRemainingTime(String downloadId, int progress) {
        try {
            if (progress >= 100) return 0;
            
            double speed = calculateDownloadSpeed(downloadId);
            if (speed <= 0) return 0;
            
            Download download = findDownloadById(downloadId);
            if (download == null || download.contentLength <= 0) return 0;
            
            long remainingBytes = download.contentLength - download.getBytesDownloaded();
            if (remainingBytes <= 0) return 0;
            
            // Estimate in seconds
            return (int) Math.ceil(remainingBytes / speed);
            
        } catch (Exception e) {
            Log.w(TAG, "Error estimating remaining time for " + downloadId, e);
            return 0;
        }
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

        // Create streams subdirectory within Downloads
        File streamsDir = new File(reactContext.getFilesDir(), downloadDirectory + "/" + streamsDirectory);
        if (!streamsDir.exists()) {
            streamsDir.mkdirs();
            Log.d(TAG, "Created streams directory: " + streamsDir.getAbsolutePath());
        }

        // Create binaries subdirectory within Downloads
        File binariesDir = new File(reactContext.getFilesDir(), downloadDirectory + "/" + binariesDirectory);
        if (!binariesDir.exists()) {
            binariesDir.mkdirs();
            Log.d(TAG, "Created binaries directory: " + binariesDir.getAbsolutePath());
        }

        // Create licenses subdirectory within Downloads
        File licensesDir = new File(reactContext.getFilesDir(), downloadDirectory + "/" + licensesDirectory);
        if (!licensesDir.exists()) {
            licensesDir.mkdirs();
            Log.d(TAG, "Created licenses directory: " + licensesDir.getAbsolutePath());
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
            String licenseServerUrl = String.valueOf(drmConfig.licenseUri);
            
            // Try to get drmMessage from our stored map (set in createDrmConfiguration)
            String drmMessage = activeDrmMessages.get(licenseServerUrl);
            
            // If not found in map, try to get from request headers
            if (drmMessage == null || drmMessage.trim().isEmpty()) {
                if (drmConfig.licenseRequestHeaders != null && !drmConfig.licenseRequestHeaders.isEmpty()) {
                    // Try to get drmMessage from headers (common key names)
                    if (drmConfig.licenseRequestHeaders.containsKey("X-AxDRM-Message")) {
                        drmMessage = drmConfig.licenseRequestHeaders.get("X-AxDRM-Message");
                    } else if (drmConfig.licenseRequestHeaders.containsKey("drmMessage")) {
                        drmMessage = drmConfig.licenseRequestHeaders.get("drmMessage");
                    } else if (drmConfig.licenseRequestHeaders.containsKey("axDrmMessage")) {
                        drmMessage = drmConfig.licenseRequestHeaders.get("axDrmMessage");
                    }
                }
            }
            
            // If still empty, use the license URL itself as drmMessage (Axinom pattern)
            if (drmMessage == null || drmMessage.trim().isEmpty()) {
                Log.i(TAG, "Using license URL as DRM message for Axinom offline download");
                drmMessage = licenseServerUrl;
            }
            
            Log.d(TAG, "Downloading license with drmMessage length: " + drmMessage.length());
            
            mLicenseManager.downloadLicenseWithResult(
                    licenseServerUrl,
                    String.valueOf(Utility.getPlaybackProperties(mediaItem).uri),
                    drmMessage,
                    true
            );
            
            // Clean up the stored drmMessage after use
            activeDrmMessages.remove(licenseServerUrl);
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
            sendEvent("overonDownloadResumeDeferred", params);

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
                        sendEvent("overonDownloadResumedAfterDefer", params);
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

        // Clear speed tracking maps
        downloadStartTimes.clear();
        lastBytesDownloaded.clear();
        lastSpeedCheckTime.clear();

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
    public void onDownloadsChanged(int state, String id, Exception exception) {
        WritableMap params = Arguments.createMap();
        params.putString("id", id);
        params.putString("state", mapDownloadState(state));
        
        // Añadir información detallada del error si la descarga falló
        if (state == Download.STATE_FAILED && exception != null) {
            String errorMessage = exception.getMessage() != null ? exception.getMessage() : "Unknown error";
            String errorClass = exception.getClass().getName();
            String errorCause = null;
            
            if (exception.getCause() != null) {
                errorCause = exception.getCause().getMessage() != null ? 
                    exception.getCause().getMessage() : exception.getCause().getClass().getName();
            }
            
            // Check for "No space left on device" error
            boolean isNoSpaceError = isNoSpaceLeftError(exception);
            
            Log.e(TAG, "Emitting download error for ID: " + id);
            Log.e(TAG, "Error: " + errorMessage);
            Log.e(TAG, "Error class: " + errorClass);
            Log.e(TAG, "Is no space error: " + isNoSpaceError);
            
            if (isNoSpaceError) {
                // Emit specific NO_SPACE_LEFT error
                Log.e(TAG, "❌ NO SPACE LEFT ON DEVICE - Emitting specific error");
                
                // Get current progress for this download
                int progress = 0;
                Download download = findDownloadById(id);
                if (download != null) {
                    progress = (int) download.getPercentDownloaded();
                }
                
                WritableMap errorParams = Arguments.createMap();
                errorParams.putString("id", id);
                errorParams.putInt("progress", progress);
                
                WritableMap errorDetails = Arguments.createMap();
                errorDetails.putString("code", "NO_SPACE_LEFT");
                errorDetails.putString("message", "No hay espacio disponible en el dispositivo");
                errorDetails.putString("domain", "AndroidStorageError");
                errorDetails.putInt("errorCode", 28); // ENOSPC
                errorParams.putMap("error", errorDetails);
                
                sendEvent("overonDownloadError", errorParams);
                return; // Don't send the generic state changed event
            }
            
            // For other errors, include details in the state change event
            params.putString("errorMessage", errorMessage);
            params.putString("errorClass", errorClass);
            if (errorCause != null) {
                params.putString("errorCause", errorCause);
            }
        }
        
        sendEvent("overonDownloadStateChanged", params);
    }
    
    /**
     * Check if the exception is a "No space left on device" error
     */
    private boolean isNoSpaceLeftError(Exception exception) {
        if (exception == null) return false;
        
        String message = exception.getMessage();
        if (message != null) {
            String lowerMessage = message.toLowerCase();
            if (lowerMessage.contains("no space left") || 
                lowerMessage.contains("enospc") ||
                lowerMessage.contains("not enough space") ||
                lowerMessage.contains("insufficient storage") ||
                lowerMessage.contains("disk full") ||
                lowerMessage.contains("no queda espacio")) {
                return true;
            }
        }
        
        // Check cause recursively
        Throwable cause = exception.getCause();
        while (cause != null) {
            String causeMessage = cause.getMessage();
            if (causeMessage != null) {
                String lowerCauseMessage = causeMessage.toLowerCase();
                if (lowerCauseMessage.contains("no space left") || 
                    lowerCauseMessage.contains("enospc") ||
                    lowerCauseMessage.contains("not enough space") ||
                    lowerCauseMessage.contains("insufficient storage") ||
                    lowerCauseMessage.contains("disk full") ||
                    lowerCauseMessage.contains("no queda espacio")) {
                    return true;
                }
            }
            
            // Check for ErrnoException with ENOSPC (error code 28)
            if (cause instanceof android.system.ErrnoException) {
                android.system.ErrnoException errnoException = (android.system.ErrnoException) cause;
                if (errnoException.errno == 28) { // ENOSPC
                    return true;
                }
            }
            
            cause = cause.getCause();
        }
        
        // Check for IOException with specific error codes
        if (exception instanceof java.io.IOException) {
            // Some IOExceptions may wrap ENOSPC errors
            String className = exception.getClass().getName();
            if (className.contains("DiskFullException") || className.contains("NoSpaceException")) {
                return true;
            }
        }
        
        return false;
    }

    @Override
    public void onPrepared(@NonNull DownloadHelper helper) {
        Log.d(TAG, "===== onPrepared callback triggered =====");
        Log.d(TAG, "Active helpers count: " + activeHelpers.size());

        try {
            // Find the download ID associated with this helper
            String downloadId = null;
            for (Map.Entry<String, DownloadHelper> entry : activeHelpers.entrySet()) {
                Log.d(TAG, "Checking helper for ID: " + entry.getKey() + " (match: " + (entry.getValue() == helper) + ")");
                if (entry.getValue() == helper) {
                    downloadId = entry.getKey();
                    break;
                }
            }

            if (downloadId == null) {
                Log.e(TAG, "Could not find download ID for prepared helper");
                Log.e(TAG, "Active helpers: " + activeHelpers.keySet());
                
                WritableMap errorParams = Arguments.createMap();
                errorParams.putString("error", "Could not find download ID for prepared helper");
                sendEvent("overonDownloadPrepareError", errorParams);
                return;
            }

            Log.d(TAG, "Found download ID: " + downloadId + " for prepared helper");
            Log.d(TAG, "Creating DownloadRequest with ID: " + downloadId);

            // Apply quality-based track selection
            String quality = activeDownloadQuality.getOrDefault(downloadId, "auto");
            Log.d(TAG, "Applying track selection for quality: " + quality);
            
            if (!"auto".equals(quality)) {
                // Select specific quality variant (also selects all audio tracks)
                selectQualityTracks(helper, quality);
            } else {
                // Auto quality: select all audio tracks to ensure all languages are available offline
                Log.d(TAG, "Using auto quality - selecting all audio tracks for offline playback");
                selectAllAudioTracks(helper);
            }

            // Create download request from the prepared helper with our custom ID
            DownloadRequest downloadRequest = helper.getDownloadRequest(downloadId, downloadId.getBytes());
            
            Log.d(TAG, "========== DownloadRequest Details ==========");
            Log.d(TAG, "ID: " + downloadRequest.id);
            Log.d(TAG, "URI: " + downloadRequest.uri);
            Log.d(TAG, "StreamKeys count: " + downloadRequest.streamKeys.size());
            Log.d(TAG, "CustomCacheKey: " + downloadRequest.customCacheKey);
            Log.d(TAG, "MimeType: " + downloadRequest.mimeType);
            
            // Log selected track information
            for (int i = 0; i < downloadRequest.streamKeys.size(); i++) {
                androidx.media3.common.StreamKey streamKey = downloadRequest.streamKeys.get(i);
                Log.d(TAG, String.format("  StreamKey %d: periodIndex=%d, groupIndex=%d, streamIndex=%d",
                    i, streamKey.periodIndex, streamKey.groupIndex, streamKey.streamIndex));
            }
            Log.d(TAG, "=============================================");
            
            // Add the download to the DownloadManager
            DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();
            if (manager != null) {
                Log.d(TAG, "Adding download to DownloadManager: " + downloadId);
                manager.addDownload(downloadRequest);
                Log.d(TAG, "Download successfully added to DownloadManager: " + downloadId);
                
                // Check the Download object immediately after adding
                try {
                    // Small delay to allow DownloadManager to process
                    Thread.sleep(100);
                    Download download = findDownloadById(downloadId);
                    if (download != null) {
                        Log.d(TAG, "========== Download Object (Immediately After Adding) ==========");
                        Log.d(TAG, "contentLength: " + download.contentLength + 
                            (download.contentLength == C.LENGTH_UNSET ? " (C.LENGTH_UNSET)" : " bytes"));
                        Log.d(TAG, "bytesDownloaded: " + download.getBytesDownloaded());
                        Log.d(TAG, "percentDownloaded: " + download.getPercentDownloaded() + "%");
                        Log.d(TAG, "state: " + mapDownloadState(download.state));
                        Log.d(TAG, "stopReason: " + download.stopReason);
                        Log.d(TAG, "failureReason: " + download.failureReason);
                        Log.d(TAG, "=================================================================");
                    } else {
                        Log.w(TAG, "Download object not found immediately after adding (may be processing)");
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Error checking download object: " + e.getMessage());
                }
            } else {
                Log.e(TAG, "DownloadManager is null, cannot start download");
                
                WritableMap errorParams = Arguments.createMap();
                errorParams.putString("error", "DownloadManager is null");
                errorParams.putString("downloadId", downloadId);
                sendEvent("overonDownloadPrepareError", errorParams);
                return;
            }

            // Release the helper as it's no longer needed
            Log.d(TAG, "Releasing helper for: " + downloadId);
            helper.release();
            activeHelpers.remove(downloadId);
            // Note: Keep quality in map until download is removed, not just prepared
            Log.d(TAG, "Active helpers after removal: " + activeHelpers.size());

            WritableMap params = Arguments.createMap();
            params.putString("downloadId", downloadId);
            params.putString("message", "Download started successfully");
            Log.d(TAG, "Sending downloadPrepared event for: " + downloadId);
            sendEvent("overonDownloadPrepared", params);

        } catch (Exception e) {
            Log.e(TAG, "Error in onPrepared: " + e.getMessage(), e);
            Log.e(TAG, "Stack trace:", e);
            
            WritableMap params = Arguments.createMap();
            params.putString("error", e.getMessage());
            params.putString("details", e.toString());
            sendEvent("overonDownloadPrepareError", params);
        }
    }

    /**
     * Select tracks based on quality setting.
     * Selects the lowest bitrate video track that meets the quality requirements.
     */
    private void selectQualityTracks(DownloadHelper helper, String quality) {
        try {
            int maxBitrate;
            String qualityDesc;
            
            switch (quality) {
                case "low":
                    maxBitrate = 1500000; // 1.5 Mbps - will select 576p (1.47 Mbps)
                    qualityDesc = "low (≤1.5Mbps)";
                    break;
                case "medium":
                    maxBitrate = 3000000; // 3 Mbps - will select 720p (2.3 Mbps)
                    qualityDesc = "medium (≤3Mbps)";
                    break;
                case "high":
                    maxBitrate = 6000000; // 6 Mbps - will select 1080p (5.18 Mbps)
                    qualityDesc = "high (≤6Mbps)";
                    break;
                default:
                    Log.w(TAG, "Unknown quality: " + quality + ", using auto");
                    return;
            }
            
            Log.d(TAG, "Selecting " + qualityDesc + " quality tracks");
            
            // Iterate through all periods
            for (int periodIndex = 0; periodIndex < helper.getPeriodCount(); periodIndex++) {
                androidx.media3.exoplayer.trackselection.MappingTrackSelector.MappedTrackInfo mappedTrackInfo = 
                    helper.getMappedTrackInfo(periodIndex);
                
                if (mappedTrackInfo == null) {
                    Log.w(TAG, "MappedTrackInfo is null for period " + periodIndex);
                    continue;
                }
                
                // Clear default selections
                helper.clearTrackSelections(periodIndex);
                
                // For each renderer (video, audio, text)
                for (int rendererIndex = 0; rendererIndex < mappedTrackInfo.getRendererCount(); rendererIndex++) {
                    int trackType = mappedTrackInfo.getRendererType(rendererIndex);
                    
                    if (trackType == C.TRACK_TYPE_VIDEO) {
                        // Video track - select based on bitrate
                        selectVideoTrackByBitrate(helper, mappedTrackInfo, periodIndex, rendererIndex, maxBitrate);
                    } else if (trackType == C.TRACK_TYPE_AUDIO) {
                        // Audio tracks - select ALL track groups explicitly
                        selectAllTracksForRenderer(helper, mappedTrackInfo, periodIndex, rendererIndex, "AUDIO");
                    } else {
                        // Text and other tracks - select all
                        selectAllTracksForRenderer(helper, mappedTrackInfo, periodIndex, rendererIndex, "TEXT");
                    }
                }
            }
            
            Log.d(TAG, "Track selection completed for quality: " + quality);
            
        } catch (Exception e) {
            Log.e(TAG, "Error selecting quality tracks: " + e.getMessage(), e);
        }
    }

    /**
     * Select ALL track groups for a specific renderer by extracting languages and using
     * the Media3 convenience methods.
     */
    private void selectAllTracksForRenderer(DownloadHelper helper,
                                           androidx.media3.exoplayer.trackselection.MappingTrackSelector.MappedTrackInfo mappedTrackInfo,
                                           int periodIndex,
                                           int rendererIndex,
                                           String trackTypeName) {
        try {
            androidx.media3.exoplayer.source.TrackGroupArray trackGroups = mappedTrackInfo.getTrackGroups(rendererIndex);
            Log.d(TAG, "Period " + periodIndex + ", Renderer " + rendererIndex + " (" + trackTypeName + "): found " + trackGroups.length + " track groups");
            
            // Collect all languages from the track groups
            List<String> languages = new ArrayList<>();
            for (int groupIndex = 0; groupIndex < trackGroups.length; groupIndex++) {
                androidx.media3.common.TrackGroup trackGroup = trackGroups.get(groupIndex);
                for (int trackIndex = 0; trackIndex < trackGroup.length; trackIndex++) {
                    androidx.media3.common.Format format = trackGroup.getFormat(trackIndex);
                    Log.d(TAG, "  " + trackTypeName + " track: group=" + groupIndex + ", track=" + trackIndex + 
                        ", language=" + format.language + ", label=" + format.label);
                    if (format.language != null && !languages.contains(format.language)) {
                        languages.add(format.language);
                    }
                }
            }
            
            Log.d(TAG, "Period " + periodIndex + ", Renderer " + rendererIndex + " (" + trackTypeName + "): found " + languages.size() + " languages: " + languages);
            
            // Use the convenience methods to add all languages
            if ("AUDIO".equals(trackTypeName) && !languages.isEmpty()) {
                String[] langArray = languages.toArray(new String[0]);
                helper.addAudioLanguagesToSelection(langArray);
                Log.d(TAG, "Added " + langArray.length + " audio languages to selection");
            } else if ("TEXT".equals(trackTypeName) && !languages.isEmpty()) {
                String[] langArray = languages.toArray(new String[0]);
                helper.addTextLanguagesToSelection(true, langArray);
                Log.d(TAG, "Added " + langArray.length + " text languages to selection");
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Error selecting all tracks for renderer " + rendererIndex + ": " + e.getMessage(), e);
        }
    }

    /**
     * Select all audio tracks for download when using auto quality.
     * This ensures all audio languages are available for offline playback.
     * Uses Media3 convenience methods to add all audio languages.
     */
    private void selectAllAudioTracks(DownloadHelper helper) {
        try {
            Log.d(TAG, "Selecting all audio tracks for offline playback (auto quality)");
            
            // Collect all audio languages from all periods
            List<String> audioLanguages = new ArrayList<>();
            
            for (int periodIndex = 0; periodIndex < helper.getPeriodCount(); periodIndex++) {
                androidx.media3.exoplayer.trackselection.MappingTrackSelector.MappedTrackInfo mappedTrackInfo = 
                    helper.getMappedTrackInfo(periodIndex);
                
                if (mappedTrackInfo == null) {
                    Log.w(TAG, "MappedTrackInfo is null for period " + periodIndex);
                    continue;
                }
                
                // Find audio renderer and collect languages
                for (int rendererIndex = 0; rendererIndex < mappedTrackInfo.getRendererCount(); rendererIndex++) {
                    int trackType = mappedTrackInfo.getRendererType(rendererIndex);
                    
                    if (trackType == C.TRACK_TYPE_AUDIO) {
                        androidx.media3.exoplayer.source.TrackGroupArray trackGroups = mappedTrackInfo.getTrackGroups(rendererIndex);
                        Log.d(TAG, "Period " + periodIndex + ", Audio renderer " + rendererIndex + ": found " + trackGroups.length + " track groups");
                        
                        for (int groupIndex = 0; groupIndex < trackGroups.length; groupIndex++) {
                            androidx.media3.common.TrackGroup trackGroup = trackGroups.get(groupIndex);
                            for (int trackIndex = 0; trackIndex < trackGroup.length; trackIndex++) {
                                androidx.media3.common.Format format = trackGroup.getFormat(trackIndex);
                                Log.d(TAG, "  Audio track: group=" + groupIndex + ", track=" + trackIndex + 
                                    ", language=" + format.language + ", label=" + format.label);
                                if (format.language != null && !audioLanguages.contains(format.language)) {
                                    audioLanguages.add(format.language);
                                }
                            }
                        }
                    }
                }
            }
            
            // Add all audio languages to selection
            if (!audioLanguages.isEmpty()) {
                String[] langArray = audioLanguages.toArray(new String[0]);
                Log.d(TAG, "Adding " + langArray.length + " audio languages to selection: " + audioLanguages);
                helper.addAudioLanguagesToSelection(langArray);
                Log.d(TAG, "All audio languages added to selection");
            } else {
                Log.w(TAG, "No audio languages found to add");
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Error selecting all audio tracks: " + e.getMessage(), e);
        }
    }
    
    /**
     * Select the video track with highest bitrate that doesn't exceed maxBitrate.
     */
    private void selectVideoTrackByBitrate(DownloadHelper helper, 
                                          androidx.media3.exoplayer.trackselection.MappingTrackSelector.MappedTrackInfo mappedTrackInfo,
                                          int periodIndex, 
                                          int rendererIndex, 
                                          int maxBitrate) {
        try {
            androidx.media3.exoplayer.source.TrackGroupArray trackGroups = mappedTrackInfo.getTrackGroups(rendererIndex);
            
            int bestGroupIndex = -1;
            int bestTrackIndex = -1;
            int bestBitrate = 0;
            
            // Find the best quality track that doesn't exceed maxBitrate
            for (int groupIndex = 0; groupIndex < trackGroups.length; groupIndex++) {
                androidx.media3.common.TrackGroup trackGroup = trackGroups.get(groupIndex);
                
                for (int trackIndex = 0; trackIndex < trackGroup.length; trackIndex++) {
                    androidx.media3.common.Format format = trackGroup.getFormat(trackIndex);
                    int bitrate = format.bitrate;
                    
                    if (bitrate != androidx.media3.common.Format.NO_VALUE && 
                        bitrate <= maxBitrate && 
                        bitrate > bestBitrate) {
                        bestBitrate = bitrate;
                        bestGroupIndex = groupIndex;
                        bestTrackIndex = trackIndex;
                    }
                }
            }
            
            if (bestGroupIndex >= 0) {
                // Select the best matching track
                List<androidx.media3.exoplayer.trackselection.DefaultTrackSelector.SelectionOverride> overrides = new ArrayList<>();
                overrides.add(new androidx.media3.exoplayer.trackselection.DefaultTrackSelector.SelectionOverride(bestGroupIndex, bestTrackIndex));
                
                helper.addTrackSelectionForSingleRenderer(
                    periodIndex,
                    rendererIndex,
                    androidx.media3.exoplayer.offline.DownloadHelper.getDefaultTrackSelectorParameters(reactContext),
                    overrides
                );
                
                Log.d(TAG, String.format("Period %d, Renderer %d (VIDEO): selected group %d, track %d, bitrate %.2f Mbps",
                    periodIndex, rendererIndex, bestGroupIndex, bestTrackIndex, bestBitrate / 1000000.0));
            } else {
                // No track found within limit, select all (fallback)
                helper.addTrackSelectionForSingleRenderer(
                    periodIndex,
                    rendererIndex,
                    androidx.media3.exoplayer.offline.DownloadHelper.getDefaultTrackSelectorParameters(reactContext),
                    new ArrayList<>()
                );
                Log.w(TAG, "No video track found within bitrate limit, selecting all");
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Error selecting video track: " + e.getMessage(), e);
        }
    }

    @Override
    public void onPrepareError(@NonNull DownloadHelper helper, @NonNull IOException e) {
        Log.e(TAG, "===== onPrepareError callback triggered =====");
        Log.e(TAG, "Error: " + e.getMessage(), e);
        
        // Try to find which download failed
        String failedDownloadId = null;
        for (Map.Entry<String, DownloadHelper> entry : activeHelpers.entrySet()) {
            if (entry.getValue() == helper) {
                failedDownloadId = entry.getKey();
                break;
            }
        }
        
        if (failedDownloadId != null) {
            Log.e(TAG, "Download preparation failed for ID: " + failedDownloadId);
            // Clean up the failed helper
            activeHelpers.remove(failedDownloadId);
            Log.d(TAG, "Removed failed helper from activeHelpers. Remaining: " + activeHelpers.size());
        } else {
            Log.e(TAG, "Could not identify which download failed");
        }

        WritableMap params = Arguments.createMap();
        params.putString("error", e.getMessage());
        params.putString("details", e.toString());
        if (failedDownloadId != null) {
            params.putString("downloadId", failedDownloadId);
        }
        Log.d(TAG, "Sending downloadPrepareError event");
        sendEvent("overonDownloadPrepareError", params);
        
        // Release the helper
        try {
            helper.release();
        } catch (Exception releaseError) {
            Log.e(TAG, "Error releasing failed helper", releaseError);
        }
    }

    // =============================================================================
    // LICENSE MANAGER EVENTS
    // =============================================================================

    @Override
    public void onLicenseDownloaded(String manifestUrl) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        sendEvent("overonLicenseDownloaded", params);
    }

    @Override
    public void onLicenseDownloadedWithResult(String manifestUrl, byte[] keyIds) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        sendEvent("overonLicenseDownloaded", params);
    }

    @Override
    public void onLicenseDownloadFailed(int code, String description, String manifestUrl) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        params.putString("error", description);
        params.putInt("code", code);
        sendEvent("overonLicenseError", params);
    }

    @Override
    public void onLicenseCheck(boolean isValid, String manifestUrl) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        params.putBoolean("isValid", isValid);
        sendEvent("overonLicenseCheck", params);
    }

    @Override
    public void onLicenseCheckFailed(int code, String description, String manifestUrl) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        params.putString("error", description);
        params.putInt("code", code);
        sendEvent("overonLicenseCheckFailed", params);
    }

    @Override
    public void onLicenseReleased(String manifestUrl) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        sendEvent("overonLicenseReleased", params);
    }

    @Override
    public void onLicenseReleaseFailed(int code, String description, String manifestUrl) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        params.putString("error", description);
        params.putInt("code", code);
        sendEvent("overonLicenseReleaseFailed", params);
    }

    @Override
    public void onLicenseKeysRestored(String manifestUrl, byte[] keyIds) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        sendEvent("overonLicenseKeysRestored", params);
    }

    @Override
    public void onLicenseRestoreFailed(int code, String description, String manifestUrl) {
        WritableMap params = Arguments.createMap();
        params.putString("contentId", manifestUrl);
        params.putString("error", description);
        params.putInt("code", code);
        sendEvent("overonLicenseRestoreFailed", params);
    }

    @Override
    public void onAllLicensesReleased() {
        WritableMap params = Arguments.createMap();
        sendEvent("overonAllLicensesReleased", params);
    }

    @Override
    public void onAllLicensesReleaseFailed(int code, String description) {
        WritableMap params = Arguments.createMap();
        params.putString("error", description);
        params.putInt("code", code);
        sendEvent("overonAllLicensesReleaseFailed", params);
    }
}