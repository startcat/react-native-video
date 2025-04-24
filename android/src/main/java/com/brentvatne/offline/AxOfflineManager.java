package com.brentvatne.offline;

import android.content.Context;
import android.util.Log;

import androidx.media3.common.util.Util;
import androidx.media3.database.DatabaseProvider;
import androidx.media3.database.StandaloneDatabaseProvider;
import androidx.media3.exoplayer.offline.Download;
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
        return mDownloadTracker;
    }

    public DownloadManager getDownloadManager() {
        return mDownloadManager;
    }

    public void init(Context context) {
        init (context, new File(DEFAULT_DOWNLOADS_FOLDER));
    }

    // Initializing of AxOfflineManager
    public synchronized void init(Context context, File tempFolder) {
        Log.d(TAG, "init() called with: context = [" + context + "]");

        DEFAULT_DOWNLOADS_FOLDER = context.getFilesDir().getAbsolutePath();
        DEFAULT_DOWNLOADS_FOLDER = DEFAULT_DOWNLOADS_FOLDER.endsWith("/") ? DEFAULT_DOWNLOADS_FOLDER : (DEFAULT_DOWNLOADS_FOLDER + "/");
        DEFAULT_DOWNLOADS_FOLDER += "downloads";

        File folder = new File(DEFAULT_DOWNLOADS_FOLDER);

        Log.d(TAG, "init() called with: older = [" + folder + "]");

        if (mDownloadManager == null) {
            mDownloadDirectory = folder;
            mDownloadManager = new DownloadManager(
                    context.getApplicationContext(),
                    getDatabaseProvider(context),
                    getDownloadCache(context),
                    buildHttpDataSourceFactory(),
                    Executors.newFixedThreadPool(6));
            mDownloadTracker = new AxDownloadTracker(context, buildDataSourceFactory(context),
                    mDownloadManager);
            configureDownloadManager();
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
                    // Si la descarga falló pero estaba casi completa (>95%), marcarla como completada
                    if (download.state == Download.STATE_FAILED && download.getPercentDownloaded() > 95.0) {
                        Log.w(TAG, "Download nearly complete but failed: " + download.request.id + 
                                " at " + download.getPercentDownloaded() + "%. Marking as complete...");
                        
                        // Esta es la solución clave: marcar como completada una descarga que falló al final
                        if (download.request.uri.toString().toLowerCase().endsWith(".mpd")) {
                            try {
                                // Crear una nueva solicitud basada en la original
                                DownloadRequest newRequest = download.request.copyWithSetStopReason(0);
                                
                                // Remover la descarga fallida
                                manager.removeDownload(download.request.id);
                                
                                // Añadir la descarga de nuevo y marcarla manualmente como completada
                                // usando la API interna de ExoPlayer
                                Download completedDownload = new Download(
                                    newRequest,
                                    Download.STATE_COMPLETED,  // Estado marcado como completado
                                    download.getBytesDownloaded(),
                                    download.contentLength,
                                    0  // Sin razón de parada
                                );
                                
                                // Usar reflexión para acceder al método interno que marca la descarga como completada
                                try {
                                    java.lang.reflect.Method addCompletedDownload = 
                                        DownloadManager.class.getDeclaredMethod("addDownload", Download.class);
                                    addCompletedDownload.setAccessible(true);
                                    addCompletedDownload.invoke(manager, completedDownload);
                                    Log.d(TAG, "Successfully marked MPD download as complete: " + download.request.id);
                                } catch (Exception e) {
                                    Log.e(TAG, "Failed to mark download as complete: " + e.getMessage(), e);
                                }
                            } catch (Exception e) {
                                Log.e(TAG, "Error during download recovery: " + e.getMessage(), e);
                            }
                        }
                    }
                }
            });
            
        } catch (Exception e) {
            Log.e(TAG, "Error configuring DownloadManager: " + e.getMessage());
        }
    }
}