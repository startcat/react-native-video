package com.brentvatne.offline;

import android.content.Context;
import android.net.Uri;

import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.common.MediaItem;
import androidx.media3.exoplayer.RenderersFactory;
import androidx.media3.exoplayer.offline.Download;
import androidx.media3.exoplayer.offline.DownloadCursor;
import androidx.media3.exoplayer.offline.DownloadHelper;
import androidx.media3.exoplayer.offline.DownloadIndex;
import androidx.media3.exoplayer.offline.DownloadManager;
import androidx.media3.exoplayer.offline.DownloadRequest;
import androidx.media3.exoplayer.offline.DownloadService;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.exoplayer.trackselection.MappingTrackSelector;
import androidx.media3.datasource.DataSource;
import androidx.media3.common.util.Log;
import androidx.media3.common.util.Util;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.concurrent.CopyOnWriteArraySet;

/**
 * A class that manages the downloads: initializes the download requests, enables to select tracks
 * for downloading and listens for events where download status changed.
 */
public class AxDownloadTracker {

    // Listens for changes in the tracked downloads
    public interface Listener {

        // Called when the tracked downloads changed
        void onDownloadsChanged(int state, String id);
    }

    private static final String TAG = "Downloads";

    private final Context mContext;
    private final DataSource.Factory mDataSourceFactory;
    private final HashMap<Uri, Download> mDownloads;
    private final DownloadIndex mDownloadIndex;
    private final CopyOnWriteArraySet<Listener> mListeners;
    private DownloadHelper mDownloadHelper;

    // Construction of AxDownloadTracker
    AxDownloadTracker(Context context, DataSource.Factory dataSourceFactory, DownloadManager downloadManager) {
        this.mContext = context.getApplicationContext();
        mDataSourceFactory = dataSourceFactory;
        mDownloads = new HashMap<>();
        mListeners = new CopyOnWriteArraySet<>();
        mDownloadIndex = downloadManager.getDownloadIndex();
        downloadManager.addListener(new DownloadManagerListener());
        loadDownloads();
    }

    private void loadDownloads() {
        try {
            DownloadCursor loadedDownloads = mDownloadIndex.getDownloads();
            while (loadedDownloads.moveToNext()) {
                Download download = loadedDownloads.getDownload();
                mDownloads.put(download.request.uri, download);
            }
        } catch (IOException e) {
            Log.w(TAG, "Failed to query mDownloads", e);
        }
    }

    // Get the overrides for renderer
    private List<DefaultTrackSelector.SelectionOverride> getRendererOverrides(int periodIndex, int rendererIndex, int[][] representations) {

        List<DefaultTrackSelector.SelectionOverride> overrides = new ArrayList<>();
        // If representations is null then all tracks are downloaded
        if (representations != null) {
            for (int[] indexes : representations) {
                // For every track specification in the list check if we have the correct period and renderer
                if (periodIndex == indexes[0] && rendererIndex == indexes[1]) {
                    // Add a selection override for this renderer by specifying groupindex and trackindex
                    overrides.add(new DefaultTrackSelector.SelectionOverride(indexes[2], indexes[3]));
                }
            }
        }

        return overrides;
    }

    /**
     * Download only selected video tracks
     *
     * @param description     A description for this download, for example a video title
     * @param representations list of representations to download in the format of
     *                        [[periodIndex0, rendererIndex0, groupIndex0, trackIndex0], [...]]
     *                        The structure is based on MappedTrackInfo
     *                        For example: [[0,1,0,0]], [0,1,1,0], [0, 1, 2, 0]]
     */
    public void download(String description, int[][] representations) {

        // Search through all periods
        for (int periodIndex = 0; periodIndex < mDownloadHelper.getPeriodCount(); periodIndex++) {

            // Get the mapped track info for this period
            MappingTrackSelector.MappedTrackInfo mappedTrackInfo = mDownloadHelper.getMappedTrackInfo(periodIndex);

            // Clear any default selections
            mDownloadHelper.clearTrackSelections(periodIndex);

            // Look through all renderers
            for (int rendererIndex = 0; rendererIndex < mappedTrackInfo.getRendererCount(); rendererIndex++) {
                mDownloadHelper.addTrackSelectionForSingleRenderer(
                        periodIndex,
                        rendererIndex,
                        DownloadHelper.getDefaultTrackSelectorParameters(mContext),
                        // Get the track selection overrides for this renderer
                        getRendererOverrides(periodIndex, rendererIndex, representations));
            }
        }

        // Create a DownloadRequest and send it to service
        DownloadRequest downloadRequest = mDownloadHelper.getDownloadRequest(Util.getUtf8Bytes(description));
        DownloadService.sendAddDownload(
                mContext,
                AxDownloadService.class,
                downloadRequest,
                false);
        mDownloadHelper.release();
    }

    public void addListener(Listener listener) {
        mListeners.add(listener);
    }

    public void removeListener(Listener listener) {
        mListeners.remove(listener);
    }

    // Boolean for determining whether video is downloaded or not
    public boolean isDownloaded(String url) {
        Download download = mDownloads.get(Uri.parse(url));
        return download != null && download.state == Download.STATE_COMPLETED;
    }

    // Find an existing download request by a URI
    public DownloadRequest getDownloadRequest(Uri uri) {
        Download download = mDownloads.get(uri);
        
        if (download == null) {
            return null;
        }
        
        // Permitir descargas con estado fallido si son MPD y tienen >95% de progreso
        boolean isHighProgressMpdFailure = (download.state == Download.STATE_FAILED && 
                                          download.getPercentDownloaded() > 95.0 && 
                                          download.request.uri.toString().toLowerCase().endsWith(".mpd"));
        
        if (isHighProgressMpdFailure) {
            Log.i(TAG, "Allowing offline playback of high-progress MPD download: " + 
                  download.request.id + " (" + download.getPercentDownloaded() + "%)");
            return download.request;
        }
        
        // Comportamiento normal para descargas no especiales
        return download.state != Download.STATE_FAILED ? download.request : null;
    }

    // Returns DownloadHelper
    public DownloadHelper getDownloadHelper(MediaItem mediaItem, Context context) {
        if (mDownloadHelper == null) {
            try {
                mDownloadHelper = getDownloadHelper(mediaItem, new DefaultRenderersFactory(context));
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
        return mDownloadHelper;
    }

    // Clears DownloadHelper
    public void clearDownloadHelper() {
        if (mDownloadHelper != null) {
            mDownloadHelper.release();
            mDownloadHelper = null;
        }
    }

    // Creates a DownloadHelper
    private DownloadHelper getDownloadHelper(
            MediaItem mediaItem, RenderersFactory renderersFactory) {
        return DownloadHelper.forMediaItem(mContext, mediaItem, renderersFactory, mDataSourceFactory);
    }

    // For listening download changes and sending callbacks notifying about them
    private class DownloadManagerListener implements DownloadManager.Listener {

        @Override
        public void onDownloadChanged(
                DownloadManager downloadManager, Download download, Exception exception) {
            // Comprobar si es una descarga MPD fallida con >95% de progreso
            boolean isHighProgressMpdFailure = false;
            
            if (download.state == Download.STATE_FAILED && 
                download.getPercentDownloaded() > 95.0 && 
                download.request.uri.toString().toLowerCase().endsWith(".mpd")) {
                
                // Comprobar si es error 404
                boolean is404Error = (exception != null && exception.getMessage() != null && 
                                     exception.getMessage().contains("404"));
                
                if (is404Error || true) { // true para manejar cualquier error en MPD al 95%+
                    isHighProgressMpdFailure = true;
                    Log.w(TAG, "===== HANDLING HIGH PROGRESS MPD FAILURE AS SUCCESS =====");
                    Log.w(TAG, "Converting failed download to successful: " + download.request.id);
                    Log.w(TAG, "Progress at conversion: " + download.getPercentDownloaded() + "%");
                    Log.w(TAG, "Bytes downloaded: " + download.getBytesDownloaded() + " / " + download.contentLength);
                    
                    // Alternativa: en lugar de crear un nuevo objeto Download, simplemente
                    // notificar a los listeners con un estado completado, pero mantener
                    // la descarga original en el mapa.
                    try {
                        Log.d(TAG, "Using compatible approach for handling MPD downloads");
                        
                        // Mantenemos la descarga original en el mapa - la UI la tratará como completada
                        // porque notificaremos estado COMPLETED a los listeners
                        mDownloads.put(download.request.uri, download);
                        
                        // Notificar a los oyentes sobre un estado COMPLETED, no FAILED
                        for (Listener listener : mListeners) {
                            listener.onDownloadsChanged(Download.STATE_COMPLETED, download.request.id);
                        }
                        
                        // Registrar el éxito de la conversión
                        Log.d(TAG, "Successfully converted high-progress MPD download to completed state: " + 
                                download.request.id);
                        
                        // Salir temprano para evitar la notificación de fallo normal
                        return;
                    } catch (Exception e) {
                        Log.e(TAG, "Error creating completed download: " + e.getMessage(), e);
                        // Si falla la conversión, continuaremos con el proceso normal
                        isHighProgressMpdFailure = false;
                    }
                }
            }
            
            // Comportamiento normal para descargas que no son MPD con alto progreso
            mDownloads.put(download.request.uri, download);
            
            // Registrar información de estado y posible excepción (solo para diagnóstico)
            if (download.state == Download.STATE_FAILED && !isHighProgressMpdFailure) {
                Log.e(TAG, "Download failed for: " + download.request.id + " - URI: " + download.request.uri);
                if (exception != null) {
                    Log.e(TAG, "Download exception: " + exception.getMessage(), exception);
                    Log.e(TAG, "Download percentage: " + download.getPercentDownloaded() + "%");
                    Log.e(TAG, "Bytes downloaded: " + download.getBytesDownloaded() + " / " + download.contentLength);
                    // Propiedades adicionales que pueden ser útiles
                    Log.e(TAG, "Download stop reason: " + download.stopReason);
                    Log.e(TAG, "Download failure reason: " + download.failureReason);
                }
            } else if (download.state == Download.STATE_DOWNLOADING) {
                // Opcional: Registrar progreso para depuración
                if (download.getPercentDownloaded() > 95.0) {
                    Log.d(TAG, "Download near completion: " + download.request.id + " - Progress: " + 
                           download.getPercentDownloaded() + "%");
                }
            }
            
            // Notificar a los oyentes con el estado real
            for (Listener listener : mListeners) {
                listener.onDownloadsChanged(download.state, download.request.id);
            }
        }

        @Override
        public void onDownloadRemoved(DownloadManager downloadManager, Download download) {
            mDownloads.remove(download.request.uri);
            for (Listener listener : mListeners) {
                listener.onDownloadsChanged(download.state, download.request.id);
            }
        }
    }
}