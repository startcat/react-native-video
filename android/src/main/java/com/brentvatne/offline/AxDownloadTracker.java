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
        void onDownloadsChanged(int state, String id, Exception exception);
    }

    private static final String TAG = "Downloads";
    
    // Umbral de progreso mínimo para considerar descargas MPD como exitosas
    // Cuando una descarga DASH/MPD falla pero ha alcanzado este porcentaje,
    // se considera que tiene suficiente contenido para reproducción offline
    private static final double HIGH_PROGRESS_THRESHOLD_PERCENT = 85.0;
    
    // Umbral de bytes descargados vs. estimado para considerar descarga completa
    // Si hemos descargado >80% del tamaño estimado total, considerar la descarga válida
    private static final double HIGH_BYTES_THRESHOLD_PERCENT = 0.80;

    private final Context mContext;
    private final DataSource.Factory mDataSourceFactory;
    private final HashMap<Uri, Download> mDownloads;
    private final DownloadIndex mDownloadIndex;
    private final CopyOnWriteArraySet<Listener> mListeners;
    private DownloadHelper mDownloadHelper;

    // Construction of AxDownloadTracker
    AxDownloadTracker(Context context, DataSource.Factory dataSourceFactory, DownloadManager downloadManager) {
        if (context == null) {
            throw new IllegalArgumentException("Context cannot be null");
        }
        if (dataSourceFactory == null) {
            throw new IllegalArgumentException("DataSourceFactory cannot be null");
        }
        if (downloadManager == null) {
            throw new IllegalArgumentException("DownloadManager cannot be null");
        }
        
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
            if (mDownloadIndex == null) {
                Log.e(TAG, "DownloadIndex is null, cannot load downloads");
                return;
            }
            
            DownloadCursor loadedDownloads = mDownloadIndex.getDownloads();
            if (loadedDownloads == null) {
                Log.w(TAG, "getDownloads() returned null cursor");
                return;
            }
            
            int downloadCount = 0;
            while (loadedDownloads.moveToNext()) {
                Download download = loadedDownloads.getDownload();
                if (download != null && download.request != null && download.request.uri != null) {
                    mDownloads.put(download.request.uri, download);
                    downloadCount++;
                } else {
                    Log.w(TAG, "Skipping invalid download entry");
                }
            }
            loadedDownloads.close();
            
            Log.d(TAG, "Loaded " + downloadCount + " downloads from database");
        } catch (IOException e) {
            Log.e(TAG, "Failed to query downloads from database", e);
        } catch (Exception e) {
            Log.e(TAG, "Unexpected error loading downloads", e);
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
        
        // Android 12+ validation for foreground service
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            if (mContext.checkSelfPermission(android.Manifest.permission.FOREGROUND_SERVICE) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                Log.w(TAG, "Cannot add download - FOREGROUND_SERVICE permission denied");
                throw new SecurityException("Foreground service permission required for downloads");
            }
        }
        
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
        
        // Permitir descargas con estado fallido si son MPD y tienen suficiente progreso
        // Usar threshold dinámico: >85% de segmentos O >80% de bytes descargados
        boolean hasEnoughSegments = download.getPercentDownloaded() > HIGH_PROGRESS_THRESHOLD_PERCENT;
        boolean hasEnoughBytes = false;
        
        if (download.getPercentDownloaded() >= 5 && download.getBytesDownloaded() > 0) {
            long estimatedTotal = (long)(download.getBytesDownloaded() / (download.getPercentDownloaded() / 100.0));
            double bytesRatio = download.getBytesDownloaded() / (double)estimatedTotal;
            hasEnoughBytes = bytesRatio > HIGH_BYTES_THRESHOLD_PERCENT;
        }
        
        boolean isHighProgressMpdFailure = (download.state == Download.STATE_FAILED && 
                                          (hasEnoughSegments || hasEnoughBytes) && 
                                          download.request.uri.toString().toLowerCase().endsWith(".mpd"));
        
        if (isHighProgressMpdFailure) {
            Log.i(TAG, "Allowing offline playback of high-progress MPD download: " + 
                  download.request.id + " (" + download.getPercentDownloaded() + "%, segments: " + 
                  hasEnoughSegments + ", bytes: " + hasEnoughBytes + ")");
            return download.request;
        }
        
        // Comportamiento normal para descargas no especiales
        return download.state != Download.STATE_FAILED ? download.request : null;
    }

    // Returns DownloadHelper - ALWAYS creates a new one
    public DownloadHelper getDownloadHelper(MediaItem mediaItem, Context context) {
        // IMPORTANT: Always create a NEW helper for each download request
        // The old helper (if any) should have been released by the caller
        try {
            Log.d(TAG, "Creating new DownloadHelper for MediaItem: " + mediaItem.mediaId);
            DownloadHelper newHelper = getDownloadHelper(mediaItem, new DefaultRenderersFactory(context));
            
            // Store the new helper (replacing any old one)
            // This allows tracking of the current helper for cleanup if needed
            mDownloadHelper = newHelper;
            
            return newHelper;
        } catch (Exception e) {
            Log.e(TAG, "Failed to create DownloadHelper for MediaItem: " + mediaItem.mediaId, e);
            e.printStackTrace();
            return null;
        }
    }

    // Clears DownloadHelper
    public void clearDownloadHelper() {
        if (mDownloadHelper != null) {
            Log.d(TAG, "Releasing and clearing DownloadHelper");
            try {
                mDownloadHelper.release();
            } catch (Exception e) {
                Log.e(TAG, "Error releasing DownloadHelper", e);
            }
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
            // Comprobar si es una descarga MPD fallida con suficiente progreso
            boolean isHighProgressMpdFailure = false;
            
            // Calcular si tiene suficientes bytes descargados (threshold dinámico)
            boolean hasEnoughBytes = false;
            if (download.getPercentDownloaded() >= 5 && download.getBytesDownloaded() > 0) {
                long estimatedTotal = (long)(download.getBytesDownloaded() / (download.getPercentDownloaded() / 100.0));
                double bytesRatio = download.getBytesDownloaded() / (double)estimatedTotal;
                hasEnoughBytes = bytesRatio > HIGH_BYTES_THRESHOLD_PERCENT;
            }
            
            boolean hasEnoughSegments = download.getPercentDownloaded() > HIGH_PROGRESS_THRESHOLD_PERCENT;
            boolean isMpdUri = download.request.uri.toString().toLowerCase().endsWith(".mpd");
            
            if (download.state == Download.STATE_FAILED && 
                (hasEnoughSegments || hasEnoughBytes) && 
                isMpdUri) {
                
                // Comprobar si es error 404
                boolean is404Error = (exception != null && exception.getMessage() != null && 
                                     exception.getMessage().contains("404"));
                
                if (is404Error || true) { // true para manejar cualquier error en MPD con suficiente progreso
                    isHighProgressMpdFailure = true;
                    // Calcular tamaño estimado para logging
                    long estimatedTotal = 0;
                    double bytesRatio = 0;
                    if (download.getPercentDownloaded() >= 5 && download.getBytesDownloaded() > 0) {
                        estimatedTotal = (long)(download.getBytesDownloaded() / (download.getPercentDownloaded() / 100.0));
                        bytesRatio = download.getBytesDownloaded() / (double)estimatedTotal;
                    }
                    
                    Log.w(TAG, "===== HANDLING HIGH PROGRESS MPD FAILURE AS SUCCESS =====");
                    Log.w(TAG, "Converting failed download to successful: " + download.request.id);
                    Log.w(TAG, "URI: " + download.request.uri);
                    Log.w(TAG, "Progress at conversion: " + download.getPercentDownloaded() + "% (segment threshold: >" + HIGH_PROGRESS_THRESHOLD_PERCENT + "%)");
                    Log.w(TAG, "Bytes downloaded: " + download.getBytesDownloaded() + " / " + download.contentLength);
                    Log.w(TAG, String.format("Estimated total: %.2f MB, Bytes ratio: %.1f%% (threshold: >%.0f%%)",
                        estimatedTotal / (1024.0 * 1024.0),
                        bytesRatio * 100,
                        HIGH_BYTES_THRESHOLD_PERCENT * 100));
                    Log.w(TAG, "Meets segment threshold: " + hasEnoughSegments + ", Meets bytes threshold: " + hasEnoughBytes);
                    Log.w(TAG, "Stop reason: " + download.stopReason);
                    Log.w(TAG, "Failure reason: " + download.failureReason);
                    if (exception != null) {
                        Log.w(TAG, "Original error message: " + exception.getMessage());
                        Log.w(TAG, "Original error class: " + exception.getClass().getName());
                        if (exception.getCause() != null) {
                            Log.w(TAG, "Error cause: " + exception.getCause().getMessage());
                        }
                    }
                    
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
                            listener.onDownloadsChanged(Download.STATE_COMPLETED, download.request.id, null);
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
                Log.e(TAG, "===== DOWNLOAD FAILED - DETAILED ERROR INFO =====");
                Log.e(TAG, "Download ID: " + download.request.id);
                Log.e(TAG, "URI: " + download.request.uri);
                Log.e(TAG, "Progress: " + download.getPercentDownloaded() + "%");
                Log.e(TAG, "Bytes downloaded: " + download.getBytesDownloaded() + " / " + download.contentLength);
                Log.e(TAG, "Stop reason: " + download.stopReason);
                Log.e(TAG, "Failure reason: " + download.failureReason);
                
                // Calcular thresholds para logging
                long estimatedTotal = 0;
                double bytesRatio = 0;
                boolean meetsSegmentThreshold = download.getPercentDownloaded() > HIGH_PROGRESS_THRESHOLD_PERCENT;
                boolean meetsBytesThreshold = false;
                
                if (download.getPercentDownloaded() >= 5 && download.getBytesDownloaded() > 0) {
                    estimatedTotal = (long)(download.getBytesDownloaded() / (download.getPercentDownloaded() / 100.0));
                    bytesRatio = download.getBytesDownloaded() / (double)estimatedTotal;
                    meetsBytesThreshold = bytesRatio > HIGH_BYTES_THRESHOLD_PERCENT;
                }
                
                boolean isMpd = download.request.uri.toString().toLowerCase().endsWith(".mpd");
                Log.e(TAG, "Segment threshold (>" + HIGH_PROGRESS_THRESHOLD_PERCENT + "%): " + meetsSegmentThreshold);
                Log.e(TAG, String.format("Bytes threshold (>%.0f%%, actual: %.1f%%): " + meetsBytesThreshold,
                    HIGH_BYTES_THRESHOLD_PERCENT * 100,
                    bytesRatio * 100));
                Log.e(TAG, String.format("Estimated total: %.2f MB (based on %.2f MB downloaded at %.1f%%)",
                    estimatedTotal / (1024.0 * 1024.0),
                    download.getBytesDownloaded() / (1024.0 * 1024.0),
                    download.getPercentDownloaded()));
                Log.e(TAG, "Is MPD: " + isMpd);
                Log.e(TAG, "Would convert to success: " + ((meetsSegmentThreshold || meetsBytesThreshold) && isMpd));
                
                if (exception != null) {
                    Log.e(TAG, "Exception class: " + exception.getClass().getName());
                    Log.e(TAG, "Exception message: " + exception.getMessage());
                    if (exception.getCause() != null) {
                        Log.e(TAG, "Exception cause: " + exception.getCause().getClass().getName());
                        Log.e(TAG, "Cause message: " + exception.getCause().getMessage());
                    }
                    // Print full stack trace
                    Log.e(TAG, "Full stack trace:", exception);
                } else {
                    Log.e(TAG, "No exception provided - download failed without exception details");
                }
                Log.e(TAG, "=================================================");
            } else if (download.state == Download.STATE_DOWNLOADING) {
                // Opcional: Registrar progreso para depuración
                if (download.getPercentDownloaded() > HIGH_PROGRESS_THRESHOLD_PERCENT) {
                    Log.d(TAG, "Download near completion: " + download.request.id + " - Progress: " + 
                           download.getPercentDownloaded() + "%");
                }
            }
            
            // Notificar a los oyentes con el estado real
            for (Listener listener : mListeners) {
                listener.onDownloadsChanged(download.state, download.request.id, exception);
            }
        }

        @Override
        public void onDownloadRemoved(DownloadManager downloadManager, Download download) {
            mDownloads.remove(download.request.uri);
            for (Listener listener : mListeners) {
                listener.onDownloadsChanged(download.state, download.request.id, null);
            }
        }
    }
}