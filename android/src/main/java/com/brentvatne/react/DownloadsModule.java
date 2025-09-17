package com.brentvatne.react;

import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.util.List;
import java.util.Map;
import java.util.HashMap;

import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import android.app.ActivityManager;
import android.app.ForegroundServiceStartNotAllowedException;
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

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.UUID;


public class DownloadsModule extends ReactContextBaseJavaModule implements LifecycleEventListener, IOfflineLicenseManagerListener, DownloadHelper.Callback, AxDownloadTracker.Listener{

    ReactApplicationContext reactContext;

    private static final String TAG = "Downloads";

    private static final String PROP_SRC_URI = "uri";
    private static final String PROP_SRC_ID = "id";
    private static final String PROP_SRC_TITLE = "title";
    private static final String PROP_DRM_TYPE = "type";
    private static final String PROP_DRM_LICENSESERVER = "licenseServer";
    private static final String PROP_DRM_HEADERS = "headers";

    // Manager class for offline licenses
    private OfflineLicenseManager mLicenseManager;
    // A class that manages the downloads: initializes the download requests, enables track selection
    // for downloading and listens to download status change events
    private AxDownloadTracker mAxDownloadTracker;
    // A helper for initializing and removing downloads
    private DownloadHelper mDownloadHelper;

    private static MediaItem currentMediaItem;
    
    // Variable para trackear si hay un resumeAll pendiente
    private volatile boolean pendingResumeAll = false;
    private volatile Promise pendingResumePromise = null;

    public DownloadsModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        reactContext.addLifecycleEventListener(this);
    }

    @Override
    public String getName() {
        return "DownloadsModule";
    }

    // For receiving broadcasts about download progress
    private final BroadcastReceiver mBroadcastReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent != null && intent.getExtras() != null) {
                Bundle bundle = intent.getExtras();

                int progress = bundle.getInt(AxDownloadService.PROGRESS);
                String contentID = bundle.getString(AxDownloadService.KEY_CONTENT_ID);

                Log.d(TAG, "+++ [Downloads] BroadcastReceiver: " + progress);
                Log.d(TAG, "+++ [Downloads] BroadcastReceiver contentID: " + contentID);
                WritableMap params = Arguments.createMap();
                params.putInt("percent", progress);
                params.putString("id", contentID);

                getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit("downloadProgress", params);

            }
        }
    };

    // Método para detectar si la app está en primer plano
    private boolean isAppInForeground() {
        try {
            if (getCurrentActivity() == null) {
                Log.w(TAG, "getCurrentActivity() returned null, assuming app is not in foreground");
                return false;
            }
            
            ActivityManager activityManager = (ActivityManager) getCurrentActivity().getSystemService(Context.ACTIVITY_SERVICE);
            if (activityManager == null) {
                Log.w(TAG, "ActivityManager is null, assuming app is not in foreground");
                return false;
            }
            
            List<ActivityManager.RunningAppProcessInfo> appProcesses = activityManager.getRunningAppProcesses();
            if (appProcesses == null) {
                Log.w(TAG, "Running app processes list is null, assuming app is not in foreground");
                return false;
            }
            
            String packageName = reactContext.getPackageName();
            for (ActivityManager.RunningAppProcessInfo appProcess : appProcesses) {
                if (appProcess.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND 
                    && appProcess.processName.equals(packageName)) {
                    Log.d(TAG, "App is in foreground");
                    return true;
                }
            }
            
            Log.d(TAG, "App is not in foreground");
            return false;
        } catch (Exception e) {
            Log.e(TAG, "Error checking if app is in foreground: " + e.getMessage(), e);
            return false;
        }
    }

    private void initOfflineManager() {
        Log.d(TAG, "initOfflineManager");

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

            if (Util.SDK_INT < 33){
                this.reactContext.registerReceiver(mBroadcastReceiver, new IntentFilter(AxDownloadService.NOTIFICATION));

            } else {
                this.reactContext.registerReceiver(mBroadcastReceiver, new IntentFilter(AxDownloadService.NOTIFICATION), this.reactContext.RECEIVER_NOT_EXPORTED);

            }

        }

    }

    // A method for checking whether network is available
    private boolean isNetworkAvailable(Context context) {
        ConnectivityManager connectivityManager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo activeNetworkInfo = null;
        if (connectivityManager != null) {
            activeNetworkInfo = connectivityManager.getActiveNetworkInfo();
        }
        return activeNetworkInfo != null && activeNetworkInfo.isConnected();
    }

    // A method for checking current download status and updating UI accordingly
    private void checkCurrentDownloadStatus() {
        if (mAxDownloadTracker != null && currentMediaItem != null) {
            // If currently selected video is downloaded:

            if (mAxDownloadTracker.isDownloaded(String.valueOf(Utility.getPlaybackProperties(currentMediaItem).uri))) {
                Log.d(TAG, "+++ [Downloads] checkCurrentDownloadStatus: is downloaded.");

                // If the selected video is protected, check if the license is also valid
                if (Utility.getDrmConfiguration(currentMediaItem) != null) {
                    Log.d(TAG, "+++ [Downloads] checkCurrentDownloadStatus: is protected. Checking if license is valid...");
                    mLicenseManager.checkLicenseValid(String.valueOf(Utility.getPlaybackProperties(currentMediaItem).uri));

                }

            } else {
                Log.d(TAG, "+++ [Downloads] checkCurrentDownloadStatus: is NOT downloaded.");

            }
        }
    }

    private MediaItem createMediaItem(ReadableMap src, @Nullable ReadableMap drm) {

        MediaItem.Builder mediaItemBuilder = new MediaItem.Builder();

        String uriString = src.hasKey(PROP_SRC_URI) ? src.getString(PROP_SRC_URI) : null;
        String id = src.hasKey(PROP_SRC_ID) ? src.getString(PROP_SRC_ID) : null;

        mediaItemBuilder.setMediaId(id);
        mediaItemBuilder.setUri(uriString);

        if (src.hasKey(PROP_SRC_TITLE)) {
            mediaItemBuilder.setMediaMetadata(new MediaMetadata.Builder().setTitle(src.getString(PROP_SRC_TITLE)).build());
        }

        if (drm != null) {

            String drmLicenseServer = drm.hasKey(PROP_DRM_LICENSESERVER) ? drm.getString(PROP_DRM_LICENSESERVER) : null;

            UUID drmUuid = Util.getDrmUuid(drm.getString("drmScheme"));
            MediaItem.DrmConfiguration.Builder drmConfigurationBuilder
                    = new MediaItem.DrmConfiguration.Builder(drmUuid);

            drmConfigurationBuilder.setLicenseUri(drmLicenseServer);

            Map<String, String> requestHeaders = new HashMap<>();
            requestHeaders.put("X-AxDRM-Message", "");
            drmConfigurationBuilder.setLicenseRequestHeaders(requestHeaders);

            mediaItemBuilder.setDrmConfiguration(drmConfigurationBuilder.build());

        }

        MediaItem mediaItem = mediaItemBuilder.build();

        return mediaItem;

    }

    /*
     * Public Methods
     *
     */

    @ReactMethod
    public void moduleInit(final Promise promise) {
        //Log.d(TAG, "+++ [Downloads] init");

        try {
            // Initializing the OfflineLicenseManager
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
        } catch (Exception e) {
            Log.e(TAG, "Error initializing DownloadsModule: " + e.getMessage(), e);
            promise.reject("INIT_FAILED", "Failed to initialize DownloadsModule: " + e.getMessage());
            return;
        }

        Log.d(TAG, "+++ [Downloads] start isOnNativeModulesQueueThread " + this.reactContext.isOnNativeModulesQueueThread());
        Log.d(TAG, "+++ [Downloads] start isOnJSQueueThread " + this.reactContext.isOnJSQueueThread());
        Log.d(TAG, "+++ [Downloads] start isOnUiQueueThread " + this.reactContext.isOnUiQueueThread());

        DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();

        if (manager != null){

            try {
                // Android 12+ validation for foreground service
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    if (this.reactContext.checkSelfPermission(android.Manifest.permission.FOREGROUND_SERVICE) == PackageManager.PERMISSION_GRANTED) {
                        DownloadService.start(this.reactContext, AxDownloadService.class);
                        DownloadService.sendPauseDownloads(this.reactContext, AxDownloadService.class, false);
                    } else {
                        Log.w(TAG, "Cannot start foreground service - FOREGROUND_SERVICE permission denied");
                        promise.reject("PERMISSION_DENIED", "Foreground service permission required for downloads");
                        return;
                    }
                } else {
                    DownloadService.start(this.reactContext, AxDownloadService.class);
                    DownloadService.sendPauseDownloads(this.reactContext, AxDownloadService.class, false);
                }

            } catch (IllegalStateException e) {
                try {
                    DownloadService.startForeground(this.reactContext, AxDownloadService.class);
                    DownloadService.sendPauseDownloads(this.reactContext, AxDownloadService.class, true);
                } catch (Exception ex) {
                    Log.e(TAG, "Failed to start AxDownloadService even with startForeground", ex);
                    promise.reject("SERVICE_START_FAILED", "Cannot start download service: " + ex.getMessage());
                    return;
                }
            }

        }

        promise.resolve(null);

    }

    @ReactMethod
    public void pauseAll(final Promise promise) {
        Log.d(TAG, "+++ [Downloads] pauseAll");

        DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();

        if (this.reactContext != null && manager != null){
            try {
                DownloadService.sendPauseDownloads(this.reactContext, AxDownloadService.class, false);
                promise.resolve(null);

            } catch (IllegalStateException e) {
                DownloadService.sendPauseDownloads(this.reactContext, AxDownloadService.class, true);
                promise.resolve(null);

            }

        } else {
            promise.reject("No context");
        }

    }

    @ReactMethod
    public void resumeAll(final Promise promise) {
        Log.d(TAG, "+++ [Downloads] resumeAll");

        DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();

        if (this.reactContext != null && manager != null){
            
            // Verificar si la app está en primer plano antes de intentar iniciar el servicio
            if (!isAppInForeground()) {
                Log.w(TAG, "App not in foreground, deferring resumeAll()");
                pendingResumeAll = true;
                pendingResumePromise = promise;
                
                // Notificar al usuario que las descargas se reanudarán cuando la app vuelva al primer plano
                WritableMap params = Arguments.createMap();
                params.putString("message", "Downloads will resume when app returns to foreground");
                getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit("downloadResumeDeferred", params);
                
                // No resolvemos la promise aquí, se resolverá cuando realmente se ejecute el resume
                return;
            }
            
            try {
                // Android 12+ validation for foreground service
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    if (this.reactContext.checkSelfPermission(android.Manifest.permission.FOREGROUND_SERVICE) != PackageManager.PERMISSION_GRANTED) {
                        Log.w(TAG, "Cannot resume downloads - FOREGROUND_SERVICE permission denied");
                        promise.reject("PERMISSION_DENIED", "Foreground service permission required for downloads");
                        return;
                    }
                }
                
                DownloadService.sendResumeDownloads(this.reactContext, AxDownloadService.class, false);
                promise.resolve(null);

            } catch (Exception e) {
                // Manejar todas las excepciones de forma unificada
                if (e.getClass().getSimpleName().contains("ForegroundServiceStartNotAllowedException") || 
                    e.getMessage() != null && e.getMessage().contains("startForegroundService() not allowed")) {
                    
                    Log.w(TAG, "Cannot start foreground service now, will retry when app comes to foreground", e);
                    pendingResumeAll = true;
                    pendingResumePromise = promise;
                    
                    // Notificar al usuario sobre el defer
                    WritableMap params = Arguments.createMap();
                    params.putString("message", "Downloads cannot start now due to Android restrictions. Will retry when app returns to foreground.");
                    params.putString("error", e.getMessage());
                    getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                            .emit("downloadResumeDeferred", params);
                    
                    // No resolvemos ni rechazamos la promise aquí, se resolverá cuando se ejecute el resume
                    return;
                    
                } else if (e instanceof IllegalStateException) {
                    Log.w(TAG, "IllegalStateException in resumeAll, trying with foreground=true", e);
                    try {
                        DownloadService.sendResumeDownloads(this.reactContext, AxDownloadService.class, true);
                        promise.resolve(null);
                    } catch (Exception ex) {
                        Log.e(TAG, "Failed to resume downloads even with foreground=true", ex);
                        promise.reject("RESUME_FAILED", "Failed to resume downloads: " + ex.getMessage());
                    }
                } else {
                    Log.e(TAG, "Unexpected error in resumeAll", e);
                    promise.reject("RESUME_ERROR", "Unexpected error resuming downloads: " + e.getMessage());
                }
            }

        } else {
            promise.reject("No context");
        }

    }

    @ReactMethod
    public void setItem(ReadableMap src, @Nullable ReadableMap drm, final Promise promise) {
        Log.d(TAG, "+++ [Downloads] setItem");

        currentMediaItem = createMediaItem(src, drm);
        promise.resolve(null);
    }

    @ReactMethod
    public void getList(final Promise promise) {
        Log.d(TAG, "+++ [Downloads] getList");

        WritableMap result = Arguments.createMap();
        WritableArray array = Arguments.createArray();

        DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();

        if (manager != null) {
            List<Download> downloads = manager.getCurrentDownloads();

            for (Download downloadItem:downloads){
                WritableMap item = Arguments.createMap();

                long length = downloadItem.contentLength;

                item.putString("id", downloadItem.request.id.toString());
                item.putString("uri", downloadItem.request.uri.toString());
                item.putString("state", getDownloadStateAsString(downloadItem.state));
                item.putDouble("length", (double)downloadItem.contentLength);
                item.putInt("percent", (int)downloadItem.getPercentDownloaded());

                array.pushMap(item);
            }

            result.putArray("downloads", array);
        }

        promise.resolve(result);
    }

    @ReactMethod
    public void addItem(ReadableMap src, @Nullable ReadableMap drm, final Promise promise) {
        Log.d(TAG, "+++ [Downloads] addItem");

        MediaItem mediaItem = createMediaItem(src, drm);
        currentMediaItem = mediaItem;

        // Prepare DownloadHelper
        if (mDownloadHelper != null) {
            mDownloadHelper.release();
            mDownloadHelper = null;
        }

        // Download a license if the content is protected
        if (drm != null){
            downloadLicenseWithResult(mediaItem);
        }

        if (mAxDownloadTracker != null){
            mAxDownloadTracker.clearDownloadHelper();
            mDownloadHelper = mAxDownloadTracker.getDownloadHelper(mediaItem, this.reactContext);
            try {
                mDownloadHelper.prepare(this);
                promise.resolve(null);

            } catch (Exception e) {
                //showToast("Download failed, exception: " + e.getMessage());
                Log.d(TAG, "+++ [Downloads] Download failed, exception: " + e.getMessage());
                promise.reject(e);
            }

        } else {
            Log.d(TAG, "+++ [Downloads] addItem mAxDownloadTracker is null");
            promise.reject("mAxDownloadTracker is null");
        }

    }

    @ReactMethod
    public void removeItem(ReadableMap src, @Nullable ReadableMap drm, final Promise promise) {
        Log.d(TAG, "+++ [Downloads] removeItem");

        MediaItem mediaItem = createMediaItem(src, drm);
        currentMediaItem = mediaItem;

        if (mediaItem != null){
            // License is removed for the selected video
            onRemoveLicense();
            Uri uri = Utility.getPlaybackProperties(mediaItem).uri;
            
            try {
                // Obtener el DownloadManager para operaciones directas
                DownloadManager downloadManager = AxOfflineManager.getInstance().getDownloadManager();
                
                // Intentar obtener un download request directamente
                DownloadRequest dr = mAxDownloadTracker.getDownloadRequest(uri);
                String downloadId = null;
                
                if (dr != null) {
                    // Si hay un request válido, usar su ID
                    downloadId = dr.id;
                } else {
                    // Buscar la descarga directamente en el índice de descargas,
                    // incluyendo las fallidas
                    DownloadIndex downloadIndex = downloadManager.getDownloadIndex();
                    try {
                        // Intentar encontrar la descarga por URI
                        DownloadCursor cursor = downloadIndex.getDownloads();
                        while (cursor.moveToNext()) {
                            Download download = cursor.getDownload();
                            if (download.request.uri.equals(uri)) {
                                downloadId = download.request.id;
                                Log.d(TAG, "+++ [Downloads] Found download with state " + download.state + 
                                    " and ID: " + downloadId);
                                break;
                            }
                        }
                    } catch (IOException e) {
                        Log.e(TAG, "+++ [Downloads] Error accessing download index: " + e.getMessage());
                    }
                }
                
                // Si encontramos un ID, eliminarlo
                if (downloadId != null) {
                    Log.d(TAG, "+++ [Downloads] Removing download: " + downloadId);
                    
                    // Android 12+ validation for foreground service
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        if (this.reactContext.checkSelfPermission(android.Manifest.permission.FOREGROUND_SERVICE) != PackageManager.PERMISSION_GRANTED) {
                            Log.w(TAG, "Cannot remove download - FOREGROUND_SERVICE permission denied");
                            promise.reject("PERMISSION_DENIED", "Foreground service permission required for download operations");
                            return;
                        }
                    }
                    
                    DownloadService.sendRemoveDownload(this.reactContext, AxDownloadService.class, downloadId, false);
                    promise.resolve(null);
                    return;
                }
                
                // Si llegamos aquí, no se encontró la descarga
                Log.w(TAG, "+++ [Downloads] No download found for URI: " + uri);
                promise.resolve(null);
            } catch (Exception e) {
                Log.e(TAG, "+++ [Downloads] Error removing download: " + e.getMessage());
                promise.reject("ERROR", "Failed to remove download: " + e.getMessage());
            }
        } else {
            promise.reject("No current item");
        }
    }

    @ReactMethod
    public void getItem(String uri, final Promise promise) {
        Log.d(TAG, "+++ [getItem] " + uri);

        WritableMap result = Arguments.createMap();

        if (uri != null){

            if (mAxDownloadTracker != null) {

                if (mAxDownloadTracker.isDownloaded(String.valueOf(uri))) {
                    Log.d(TAG, "+++ [getItem] is downloaded.");
                    result.putBoolean("isDownloaded", true);
                    result.putBoolean("isProtected", true);
                    mLicenseManager.checkLicenseValid(uri);

                    promise.resolve(result);

                } else {
                    Log.d(TAG, "+++ [getItem] is NOT downloaded.");
                    result.putBoolean("isDownloaded", false);
                    result.putBoolean("isProtected", false);
                    promise.resolve(result);
                }
            } else {
                Log.d(TAG, "+++ [getItem] No mAxDownloadTracker");
                promise.reject("NO_TRACKER", "AxDownloadTracker is not initialized");
            }

        } else {
            Log.d(TAG, "+++ [getItem] No uri");
            promise.reject("NO_URI", "URI parameter is required");
        }

    }

    @ReactMethod
    public void downloadLicense(final Promise promise) {
        Log.d(TAG, "+++ [Downloads] downloadLicense");

        MediaItem.DrmConfiguration drmConfiguration = Utility.getDrmConfiguration(currentMediaItem);
        if (drmConfiguration != null) {
            mLicenseManager.downloadLicenseWithResult(
                    String.valueOf(drmConfiguration.licenseUri),
                    String.valueOf(Utility.getPlaybackProperties(currentMediaItem).uri),
                    drmConfiguration.licenseRequestHeaders.get("X-AxDRM-Message"),
                    true
            );
        }

        promise.resolve(null);

    }

    @ReactMethod
    public void prepared() {
        if (mDownloadHelper == null) {
            Log.e(TAG, "prepared() called but mDownloadHelper is null");
            return;
        }
        
        if (currentMediaItem == null) {
            Log.e(TAG, "prepared() called but currentMediaItem is null");
            return;
        }
        
        if (mAxDownloadTracker == null) {
            Log.e(TAG, "prepared() called but mAxDownloadTracker is null");
            return;
        }
        
        try {
            int [][] tracks = getTracks();
            String title = currentMediaItem.mediaMetadata != null && currentMediaItem.mediaMetadata.title != null 
                ? currentMediaItem.mediaMetadata.title.toString() 
                : currentMediaItem.mediaId != null ? currentMediaItem.mediaId : "Unknown";
                
            mAxDownloadTracker.download(title, tracks);
        } catch (Exception e) {
            Log.e(TAG, "Error in prepared(): " + e.getMessage(), e);
        }
    }


    /*
     * Licenses
     *
     */

    private void downloadLicenseWithResult(MediaItem mediaItem) {
        // Result is handled in the OfflineLicenseManager class
        MediaItem.DrmConfiguration drmConfiguration = Utility.getDrmConfiguration(mediaItem);
        if (drmConfiguration != null) {
            mLicenseManager.downloadLicenseWithResult(
                    String.valueOf(drmConfiguration.licenseUri),
                    String.valueOf(Utility.getPlaybackProperties(mediaItem).uri),
                    drmConfiguration.licenseRequestHeaders.get("X-AxDRM-Message"),
                    true
            );
        }

    }

    private void onRemoveLicense() {
        // License is removed for the selected video
        mLicenseManager.releaseLicense(
                String.valueOf(Utility.getPlaybackProperties(currentMediaItem).uri));
    }



    /*
     * Tracks
     *
     */

    private int[][] getTracks() {
        ArrayList<int[]> tracks = new ArrayList<>();

        //Log.d(TAG, "getTracks...");

        // For demo we currently want to download the max bitrate video track and all audio and text tracks
        // Search through all periods
        for (int period = 0; period < mDownloadHelper.getPeriodCount(); period++) {
            MappingTrackSelector.MappedTrackInfo mappedTrackInfo = mDownloadHelper.getMappedTrackInfo(period);
            // Search through all the renderers
            for (int renderer = 0; renderer < mappedTrackInfo.getRendererCount(); renderer++) {
                boolean isVideoRenderer = false;
                int maxBitrate = Integer.MIN_VALUE;
                int videoTrackIndex = 0;
                TrackGroupArray trackGroupArray = mappedTrackInfo.getTrackGroups(renderer);
                if (mappedTrackInfo.getRendererType(renderer) == 2) {
                    isVideoRenderer = true;
                }
                // Search through groups inside the renderer
                for (int group = 0; group < trackGroupArray.length; group++) {
                    TrackGroup trackGroup = trackGroupArray.get(group);
                    // Finally search through tracks (representations)
                    for (int track = 0; track < trackGroup.length; track++) {
                        // For videos we only care about the max bitrate track that is available
                        if (isVideoRenderer && trackGroup.getFormat(track).bitrate > maxBitrate) {
                            maxBitrate = trackGroup.getFormat(track).bitrate;
                            videoTrackIndex = track;
                        } else if (!isVideoRenderer) {
                            int [] indexes = new int[] { period, renderer, group, track };
                            tracks.add(indexes);
                        }
                    }
                    if (isVideoRenderer) {
                        int [] indexes = new int[] { period, renderer, group, videoTrackIndex };
                        tracks.add(indexes);
                        break; // Found a video, currently not interested in other video groups
                    }
                }
            }
        }

        int [][] tracksToDownload = new int[tracks.size()][1];
        for (int i = 0; i < tracks.size(); i++) {
            tracksToDownload[i] = tracks.get(i);
        }
        for (int[] row : tracksToDownload){
            Log.d(TAG, "Tracks to download: " + Arrays.toString(row));
        }

        if (tracksToDownload.length == 0){
            Log.d(TAG, "NO Tracks to download");
        }
        return tracksToDownload;
    }



    /*
     * Events
     *
     */

    @Override
    public void onLicenseDownloaded(String manifestUrl) {
        Log.d(TAG, "+++ [Downloads] onLicenseDownloaded " + manifestUrl);
        WritableMap params = Arguments.createMap();
        params.putString("manifest", manifestUrl);
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onLicenseDownloaded", params);
    }

    @Override
    public void onLicenseDownloadedWithResult(String manifestUrl, byte[] keyIds) {
        Log.d(TAG, "+++ [Downloads] onLicenseDownloadedWithResult " + manifestUrl);
        WritableMap params = Arguments.createMap();
        params.putString("manifest", manifestUrl);
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onLicenseDownloaded", params);
    }

    @Override
    public void onLicenseDownloadFailed(int code, String description, String manifestUrl) {
        Log.d(TAG, "+++ [Downloads] onLicenseDownloadFailed " + manifestUrl);
        WritableMap params = Arguments.createMap();
        params.putString("manifest", manifestUrl);
        params.putString("error", description);
        params.putInt("code", code);
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onLicenseDownloadFailed", params);
    }

    @Override
    public void onLicenseCheck(boolean isValid, String manifestUrl) {
        Log.d(TAG, "+++ [Downloads] onLicenseCheck " + manifestUrl);
        WritableMap params = Arguments.createMap();
        params.putString("manifest", manifestUrl);
        params.putBoolean("isValid", isValid);
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onLicenseCheck", params);
    }

    @Override
    public void onLicenseCheckFailed(int code, String description, String manifestUrl) {
        Log.d(TAG, "+++ [Downloads] onLicenseCheckFailed " + manifestUrl);
        WritableMap params = Arguments.createMap();
        params.putString("manifest", manifestUrl);
        params.putString("error", description);
        params.putInt("code", code);
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onLicenseCheckFailed", params);
    }

    @Override
    public void onLicenseReleased(String manifestUrl) {
        Log.d(TAG, "+++ [Downloads] onLicenseReleased " + manifestUrl);
        WritableMap params = Arguments.createMap();
        params.putString("manifest", manifestUrl);
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onLicenseReleased", params);
    }

    @Override
    public void onLicenseReleaseFailed(int code, String description, String manifestUrl) {
        Log.d(TAG, "+++ [Downloads] onLicenseReleaseFailed " + manifestUrl);
        WritableMap params = Arguments.createMap();
        params.putString("manifest", manifestUrl);
        params.putString("error", description);
        params.putInt("code", code);
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onLicenseReleasedFailed", params);
    }

    @Override
    public void onLicenseKeysRestored(String manifestUrl, byte[] keyIds) {
        Log.d(TAG, "+++ [Downloads] onLicenseKeysRestored " + manifestUrl);
        WritableMap params = Arguments.createMap();
        params.putString("manifest", manifestUrl);
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onLicenseKeysRestored", params);
    }

    @Override
    public void onLicenseRestoreFailed(int code, String description, String manifestUrl) {
        Log.d(TAG, "+++ [Downloads] onLicenseRestoreFailed " + manifestUrl);
        WritableMap params = Arguments.createMap();
        params.putString("manifest", manifestUrl);
        params.putString("error", description);
        params.putInt("code", code);
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onLicenseRestoreFailed", params);
    }

    @Override
    public void onAllLicensesReleased() {
        Log.d(TAG, "+++ [Downloads] onAllLicensesReleased");
        WritableMap params = Arguments.createMap();
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onAllLicensesReleased", params);
    }

    @Override
    public void onAllLicensesReleaseFailed(int code, String description) {
        Log.d(TAG, "+++ [Downloads] onAllLicensesReleaseFailed: " + description);
        WritableMap params = Arguments.createMap();
        params.putString("error", description);
        params.putInt("code", code);
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onAllLicensesReleaseFailed", params);
    }

    @Override
    public void onDownloadsChanged(int state, String id) {

        WritableMap params = Arguments.createMap();
        params.putString("id", id);

        params.putString("state", getDownloadStateAsString(state));

        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onDownloadStateChanged", params);

    }

    @Override
    public void onPrepared(@NonNull DownloadHelper helper) {
        Log.d(TAG, "+++ [Downloads] onPrepared " + currentMediaItem.mediaId);

        int [][] tracks = getTracks();
        mAxDownloadTracker.download(currentMediaItem.mediaMetadata.title.toString(), tracks);

        WritableMap params = Arguments.createMap();
        params.putString("mediaId", currentMediaItem.mediaId);
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onPrepared", params);
    }

    @Override
    public void onPrepareError(@NonNull DownloadHelper helper, @NonNull IOException e) {
        Log.e(TAG, "Failed to start download", e);

        WritableMap params = Arguments.createMap();
        params.putString("mediaId", currentMediaItem.mediaId);
        params.putString("error", e.getMessage());
        getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("onPrepareError", params);
    }

    @Override
    public void onHostResume() {
        Log.d(TAG, "+++ [Downloads] onHostResume");

        // Intentar ejecutar resumeAll pendiente cuando la app vuelve al primer plano
        if (pendingResumeAll) {
            Log.d(TAG, "Executing pending resumeAll()");
            pendingResumeAll = false;
            
            // Ejecutar el resume de forma asíncrona para dar tiempo a que la app se estabilice
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override
                public void run() {
                    try {
                        DownloadManager manager = AxOfflineManager.getInstance().getDownloadManager();
                        if (reactContext != null && manager != null) {
                            try {
                                DownloadService.sendResumeDownloads(reactContext, AxDownloadService.class, false);
                                Log.d(TAG, "Successfully executed pending resumeAll()");
                                
                                // Resolver la promise pendiente si existe
                                if (pendingResumePromise != null) {
                                    pendingResumePromise.resolve(null);
                                    pendingResumePromise = null;
                                }
                                
                                // Notificar al JS que las descargas se han reanudado
                                WritableMap params = Arguments.createMap();
                                params.putString("message", "Downloads resumed successfully");
                                getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                                        .emit("downloadResumedAfterDefer", params);
                                
                            } catch (Exception e) {
                                Log.e(TAG, "Failed to execute pending resumeAll()", e);
                                
                                // Rechazar la promise pendiente si existe
                                if (pendingResumePromise != null) {
                                    pendingResumePromise.reject("RESUME_FAILED", "Failed to resume downloads after defer: " + e.getMessage());
                                    pendingResumePromise = null;
                                }
                            }
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error in pending resumeAll execution", e);
                        if (pendingResumePromise != null) {
                            pendingResumePromise.reject("RESUME_FAILED", "Error executing pending resume: " + e.getMessage());
                            pendingResumePromise = null;
                        }
                    }
                }
            }, 1000); // Delay de 1 segundo para estabilidad
        }

        /*
        if (mAxDownloadTracker != null) {
            mAxDownloadTracker.addListener(this);
        }

        if (this.reactContext != null){
            this.reactContext.registerReceiver(mBroadcastReceiver, new IntentFilter(AxDownloadService.NOTIFICATION));
        }
        */

    }

    @Override
    public void onHostPause() {
        Log.d(TAG, "+++ [Downloads] onHostPause");
        /*
        if (mAxDownloadTracker != null) {
            mAxDownloadTracker.removeListener(this);
        }

        if (this.reactContext != null){
            this.reactContext.unregisterReceiver(mBroadcastReceiver);
        }
        */

    }

    @Override
    public void onHostDestroy() {
        Log.d(TAG, "+++ [Downloads] onHostDestroy");

        // Limpiar promises pendientes
        if (pendingResumePromise != null) {
            pendingResumePromise.reject("APP_DESTROYED", "App was destroyed before resume could complete");
            pendingResumePromise = null;
        }
        pendingResumeAll = false;

        if (mAxDownloadTracker != null) {
            mAxDownloadTracker.removeListener(this);
            mAxDownloadTracker = null;
        }
        
        // Cleanup DownloadHelper to prevent memory leaks
        if (mDownloadHelper != null) {
            try {
                mDownloadHelper.release();
            } catch (Exception e) {
                Log.w(TAG, "Error releasing DownloadHelper: " + e.getMessage());
            } finally {
                mDownloadHelper = null;
            }
        }
        
        // Cleanup LicenseManager
        if (mLicenseManager != null) {
            try {
                mLicenseManager.release();
            } catch (Exception e) {
                Log.w(TAG, "Error releasing LicenseManager: " + e.getMessage());
            } finally {
                mLicenseManager = null;
            }
        }

        if (this.reactContext != null){
            try {
                this.reactContext.unregisterReceiver(mBroadcastReceiver);
            } catch (IllegalArgumentException e) {
                Log.w(TAG, "Error unregistering broadcast receiver: " + e.getMessage());
            }

        }

    }

    private String getDownloadStateAsString(int state){

        if (state == Download.STATE_COMPLETED){
            return "COMPLETED";

        } else if (state == Download.STATE_FAILED){
            return  "FAILED";

        } else if (state == Download.STATE_REMOVING){
            return  "REMOVING";

        } else if (state == Download.STATE_DOWNLOADING){
            return "DOWNLOADING";

        } else if (state == Download.STATE_QUEUED){
            return "QUEUED";

        } else if (state == Download.STATE_RESTARTING){
            return "RESTARTING";

        } else if (state == Download.STATE_STOPPED){
            return "STOPPED";

        } else {
            return "UNKNOWN";
        }

    }

}