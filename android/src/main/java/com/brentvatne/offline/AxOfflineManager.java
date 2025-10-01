package com.brentvatne.offline;

import android.content.Context;
import android.util.Log;

import androidx.media3.common.util.Util;
import androidx.media3.database.DatabaseProvider;
import androidx.media3.database.StandaloneDatabaseProvider;
import androidx.media3.exoplayer.offline.Download;
import androidx.media3.exoplayer.offline.DownloadIndex;
import androidx.media3.exoplayer.offline.DownloadManager;
import androidx.media3.exoplayer.offline.DownloadRequest;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.datasource.cache.Cache;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.NoOpCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;

import java.io.File;
import java.lang.reflect.Method;
import java.util.concurrent.Executors;

/**
 * A class that manages the initialization of DownloadManager and data source factory objects.
 */
public class AxOfflineManager {

    private static final String TAG = "Downloads";
    private static AxOfflineManager sAxOfflineManager;
    private DatabaseProvider databaseProvider;
    private File mDownloadDirectory;
    private DownloadManager mDownloadManager;
    private AxDownloadTracker mDownloadTracker;
    private Cache mDownloadCache;

    private static String DEFAULT_DOWNLOADS_FOLDER = "";

    // Return and create the AxOfflineManager instance if necessary
    public static AxOfflineManager getInstance() {
        if (sAxOfflineManager == null) {
            sAxOfflineManager = new AxOfflineManager();
        }
        return sAxOfflineManager;
    }

    public AxDownloadTracker getDownloadTracker() {
        if (mDownloadTracker == null) {
            Log.w(TAG, "getDownloadTracker() called but DownloadTracker is null. Call init() first.");
        }
        return mDownloadTracker;
    }
    
    /**
     * Check if AxOfflineManager is properly initialized
     * @return true if initialized, false otherwise
     */
    public boolean isInitialized() {
        return mDownloadManager != null && mDownloadTracker != null;
    }

    public DownloadManager getDownloadManager() {
        if (mDownloadManager == null) {
            Log.w(TAG, "getDownloadManager() called but DownloadManager is null. Call init() first.");
        }
        return mDownloadManager;
    }

    public void init(Context context) {
        init (context, new File(DEFAULT_DOWNLOADS_FOLDER));
    }

    // Initializing of AxOfflineManager
    public synchronized void init(Context context, File tempFolder) {
        if (context == null) {
            throw new IllegalArgumentException("Context cannot be null");
        }
        
        Log.d(TAG, "init() called with: context = [" + context + "]");

        try {
            // Safely get files directory
            java.io.File filesDir = context.getFilesDir();
            if (filesDir == null) {
                Log.w(TAG, "getFilesDir() returned null, using cache directory as fallback");
                filesDir = context.getCacheDir();
                if (filesDir == null) {
                    throw new IllegalStateException("Both getFilesDir() and getCacheDir() returned null");
                }
            }
            
            DEFAULT_DOWNLOADS_FOLDER = filesDir.getAbsolutePath();
            DEFAULT_DOWNLOADS_FOLDER = DEFAULT_DOWNLOADS_FOLDER.endsWith("/") ? DEFAULT_DOWNLOADS_FOLDER : (DEFAULT_DOWNLOADS_FOLDER + "/");
            DEFAULT_DOWNLOADS_FOLDER += "Downloads/Streams";  // Usar subdirectorio Streams dentro de Downloads

            File folder = new File(DEFAULT_DOWNLOADS_FOLDER);
            Log.d(TAG, "init() called with: folder = [" + folder + "] (Streams directory)");

            if (mDownloadManager == null) {
                mDownloadDirectory = folder;
                
                // Ensure download directory exists
                if (!folder.exists() && !folder.mkdirs()) {
                    Log.w(TAG, "Failed to create download directory: " + folder.getAbsolutePath());
                }
                
                initializeDownloadManager(context);
                
                Log.d(TAG, "AxOfflineManager initialized successfully");
            } else {
                Log.d(TAG, "AxOfflineManager already initialized, checking health...");
                // Verificar si el DownloadManager está en buen estado
                if (!isDownloadManagerHealthy()) {
                    Log.w(TAG, "DownloadManager appears unhealthy, reinitializing...");
                    reinitializeDownloadManager(context);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error initializing AxOfflineManager: " + e.getMessage(), e);
            throw new RuntimeException("Failed to initialize AxOfflineManager", e);
        }
    }

    private File getDownloadDirectory() {
        if (mDownloadDirectory == null) {
            mDownloadDirectory = new File(DEFAULT_DOWNLOADS_FOLDER);
            Log.d(TAG, "Setting value to mDownloadDirectory: " + mDownloadDirectory);
        }
        return mDownloadDirectory;
    }

    private synchronized Cache getDownloadCache(Context context) {
        if (mDownloadCache == null) {
            mDownloadCache = new SimpleCache(getDownloadDirectory(), new NoOpCacheEvictor(),
                    getDatabaseProvider(context));
        }
        return mDownloadCache;
    }

    // Returns a {@link DataSource.Factory}
    public DataSource.Factory buildDataSourceFactory(Context context) {
        DefaultDataSource.Factory upstreamFactory =
                new DefaultDataSource.Factory(context, buildHttpDataSourceFactory());
        return buildReadOnlyCacheDataSource(upstreamFactory, getDownloadCache(context));
    }

    // Returns a {@link HttpDataSource.Factory}
    private HttpDataSource.Factory buildHttpDataSourceFactory() {
        return new DefaultHttpDataSource.Factory();
    }

    private static CacheDataSource.Factory buildReadOnlyCacheDataSource(
            DataSource.Factory upstreamFactory, Cache cache) {
        return new CacheDataSource.Factory()
                .setCache(cache)
                .setUpstreamDataSourceFactory(upstreamFactory);
    }

    private DatabaseProvider getDatabaseProvider(Context context) {
        if (databaseProvider == null) {
            databaseProvider = new StandaloneDatabaseProvider(context.getApplicationContext());
        }
        return databaseProvider;
    }

    // Initialize DownloadManager with proper error handling
    private void initializeDownloadManager(Context context) {
        try {
            mDownloadManager = new DownloadManager(
                    context.getApplicationContext(),
                    getDatabaseProvider(context),
                    getDownloadCache(context),
                    buildHttpDataSourceFactory(),
                    Executors.newFixedThreadPool(6));
            mDownloadTracker = new AxDownloadTracker(context, buildDataSourceFactory(context),
                    mDownloadManager);
            configureDownloadManager();
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize DownloadManager: " + e.getMessage(), e);
            throw new RuntimeException("Failed to initialize DownloadManager", e);
        }
    }
    
    // Reinitialize DownloadManager when it becomes unhealthy
    private synchronized void reinitializeDownloadManager(Context context) {
        try {
            Log.w(TAG, "Reinitializing DownloadManager due to health issues...");
            
            // Clean up existing manager
            if (mDownloadManager != null) {
                try {
                    mDownloadManager.release();
                } catch (Exception e) {
                    Log.w(TAG, "Error releasing old DownloadManager: " + e.getMessage());
                }
            }
            
            // Clean up tracker
            if (mDownloadTracker != null) {
                try {
                    mDownloadTracker.clearDownloadHelper();
                } catch (Exception e) {
                    Log.w(TAG, "Error clearing DownloadTracker helper: " + e.getMessage());
                }
            }
            
            // Reinitialize
            mDownloadManager = null;
            mDownloadTracker = null;
            
            // Wait a bit to ensure cleanup
            Thread.sleep(500);
            
            initializeDownloadManager(context);
            
            Log.d(TAG, "DownloadManager successfully reinitialized");
        } catch (Exception e) {
            Log.e(TAG, "Failed to reinitialize DownloadManager: " + e.getMessage(), e);
            throw new RuntimeException("Failed to reinitialize DownloadManager", e);
        }
    }
    
    // Check if DownloadManager is in a healthy state
    private boolean isDownloadManagerHealthy() {
        if (mDownloadManager == null) {
            return false;
        }
        
        try {
            // Try to access the download index to check if it's working
            DownloadIndex downloadIndex = mDownloadManager.getDownloadIndex();
            if (downloadIndex == null) {
                Log.w(TAG, "DownloadIndex is null, DownloadManager may be unhealthy");
                return false;
            }
            
            // Try a simple operation to verify it's working
            downloadIndex.getDownloads();
            return true;
        } catch (Exception e) {
            Log.w(TAG, "DownloadManager health check failed: " + e.getMessage());
            return false;
        }
    }

    // Configure the DownloadManager to handle errors more gracefully
    private void configureDownloadManager() {
        if (mDownloadManager == null) {
            Log.w(TAG, "DownloadManager is null, skipping configuration");
            return;
        }

        try {
            // Limitar descargas paralelas para evitar sobrecarga en el servidor
            mDownloadManager.setMaxParallelDownloads(3);
            
            // Agregar listener personalizado para manejar descargas casi completas
            mDownloadManager.addListener(new DownloadManager.Listener() {
                @Override
                public void onDownloadChanged(DownloadManager manager, Download download, Exception exception) {
                    try {
                        // Detectar errores de handler muerto y reinicializar si es necesario
                        if (exception != null && exception.getMessage() != null && 
                            exception.getMessage().contains("Handler") && 
                            exception.getMessage().contains("dead thread")) {
                            Log.e(TAG, "Detected dead thread handler error for download: " + download.request.id);
                            Log.e(TAG, "This indicates DownloadManager threading issues. Consider restarting the service.");
                        }
                        
                        // Si la descarga falló pero estaba casi completa (>95%), simplemente ignorar el error
                        if (download.state == Download.STATE_FAILED && download.getPercentDownloaded() > 95.0) {
                            // Verificar que sea un archivo MPD (DASH)
                            if (download.request.uri.toString().toLowerCase().endsWith(".mpd")) {
                                // Comprobar que el error es 404 (o simplemente ignorar cualquier error al 95%)
                                boolean is404Error = (exception != null && exception.getMessage() != null && 
                                                     exception.getMessage().contains("404"));
                                
                                if (is404Error || true) { // true para ignorar cualquier error al 95%+
                                    Log.w(TAG, "Ignoring error for MPD download at " + download.getPercentDownloaded() + "%: " + 
                                              download.request.id + " - Error: " + (exception != null ? exception.getMessage() : "unknown"));
                                    
                                    // Simplemente dejar la descarga como está, considerarla válida para reproducción
                                    // No se elimina ni se reinicia - el contenido ya descargado debería ser suficiente
                                    
                                    // Opcional: registrar estadísticas para depuración
                                    Log.d(TAG, "MPD download stats - Bytes downloaded: " + download.getBytesDownloaded() + 
                                             " - ContentLength: " + download.contentLength);
                                }
                            }
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error in download listener: " + e.getMessage(), e);
                    }
                }
            });
            
            Log.d(TAG, "Successfully configured DownloadManager with enhanced error handling");
        } catch (Exception e) {
            Log.e(TAG, "Error configuring DownloadManager: " + e.getMessage(), e);
        }
    }
}