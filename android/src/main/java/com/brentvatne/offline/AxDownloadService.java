package com.brentvatne.offline;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;

import com.brentvatne.react.R;
import androidx.media3.exoplayer.offline.Download;
import androidx.media3.exoplayer.offline.DownloadManager;
import androidx.media3.exoplayer.offline.DownloadService;
import androidx.media3.exoplayer.scheduler.PlatformScheduler;
import androidx.media3.exoplayer.offline.DownloadNotificationHelper;
import androidx.media3.common.util.NotificationUtil;
import androidx.media3.common.util.Util;

import java.util.List;

/**
 * A class that extends Exoplayer's DownloadService class.
 * Defines a service that enables the downloads to continue even when the
 * app is in background.
 */
public class AxDownloadService extends DownloadService {

    private static Context mContext;
    private static final String CHANNEL_ID = "download_channel";
    private static final int JOB_ID = 1;
    private static final int FOREGROUND_NOTIFICATION_ID = 1;
    public static final String NOTIFICATION = "com.brentvatne.offline.AxDownloadService";
    public static final String PROGRESS = "progress";
    public static final String KEY_CONTENT_ID = "content_id";

    // Helper for creating a download notifications
    private DownloadNotificationHelper notificationHelper;

    public AxDownloadService() {
        super(FOREGROUND_NOTIFICATION_ID,
            DEFAULT_FOREGROUND_NOTIFICATION_UPDATE_INTERVAL,
            CHANNEL_ID,
            androidx.media3.exoplayer.R.string.exo_download_notification_channel_name,
            0);
    }

    private void init(){
        Log.d("Downloads", "+++ [AxDownloadService] init");

        try {
            DownloadManager downloadManager = AxOfflineManager.getInstance().getDownloadManager();

            if (downloadManager != null) {
                downloadManager.addListener(new TerminalStateNotificationHelper(this, notificationHelper, FOREGROUND_NOTIFICATION_ID + 1));
                Log.d("Downloads", "AxDownloadService initialized successfully");
            } else {
                Log.w("Downloads", "DownloadManager is null during AxDownloadService init. TerminalStateNotificationHelper not registered. Service will continue without it.");
            }
        } catch (Exception e) {
            Log.e("Downloads", "Error during AxDownloadService init (non-fatal): " + e.getMessage(), e);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        mContext = getApplicationContext();

        // Create notificationHelper BEFORE init() to guarantee it's available
        // when getForegroundNotification() is called by the base DownloadService class.
        try {
            notificationHelper = new DownloadNotificationHelper(this, CHANNEL_ID);
        } catch (Exception e) {
            Log.e("Downloads", "Failed to create DownloadNotificationHelper: " + e.getMessage(), e);
        }

        // CRITICAL: Call startForeground() immediately in onCreate() to satisfy the
        // Android 12+ foreground service contract. The base DownloadService class calls
        // startForeground() in onStartCommand(), but that may not execute fast enough
        // after Context.startForegroundService() is invoked, causing
        // ForegroundServiceDidNotStartInTimeException.
        try {
            Notification immediateNotification = buildImmediateNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(FOREGROUND_NOTIFICATION_ID, immediateNotification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(FOREGROUND_NOTIFICATION_ID, immediateNotification);
            }
            Log.d("Downloads", "startForeground() called immediately in onCreate()");
        } catch (Exception e) {
            Log.e("Downloads", "Failed to call startForeground() in onCreate(): " + e.getMessage(), e);
        }

        init();
    }

    private Notification buildImmediateNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Downloads", NotificationManager.IMPORTANCE_LOW);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_download)
                .setContentTitle("Preparing download...")
                .build();
    }

    @NonNull
    @Override
    protected DownloadManager getDownloadManager() {
        DownloadManager downloadManager = AxOfflineManager.getInstance().getDownloadManager();
        if (downloadManager == null) {
            Log.e("Downloads", "CRITICAL: DownloadManager is null. Attempting to reinitialize AxOfflineManager...");
            try {
                // Attempt to reinitialize the AxOfflineManager
                AxOfflineManager.getInstance().init(getApplicationContext());
                downloadManager = AxOfflineManager.getInstance().getDownloadManager();
                if (downloadManager == null) {
                    throw new IllegalStateException("DownloadManager is still null after reinitialization attempt");
                }
                Log.d("Downloads", "Successfully recovered DownloadManager after reinitialization");
            } catch (Exception e) {
                Log.e("Downloads", "Failed to recover DownloadManager: " + e.getMessage(), e);
                throw new IllegalStateException("DownloadManager is null and recovery failed. AxOfflineManager must be initialized before starting AxDownloadService", e);
            }
        }
        return downloadManager;
    }

    @Override
    protected PlatformScheduler getScheduler() {
        return Util.SDK_INT >= 21 ? new PlatformScheduler(this, JOB_ID) : null;
    }

    // Returns a notification to be displayed
    @Override
    protected Notification getForegroundNotification(List<Download> downloads, int i) {

        // Fallback: if notificationHelper is null (should not happen), return a basic notification
        // to satisfy the foreground service contract and prevent ForegroundServiceDidNotStartInTimeException
        if (notificationHelper == null) {
            Log.e("Downloads", "CRITICAL: notificationHelper is null in getForegroundNotification. Using fallback notification.");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Downloads", NotificationManager.IMPORTANCE_LOW);
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    nm.createNotificationChannel(channel);
                }
            }
            return new Notification.Builder(this, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_download)
                    .setContentTitle("Downloading...")
                    .build();
        }

        Notification notification = notificationHelper.buildProgressNotification(this, R.drawable.ic_download, null, null, downloads, i);

        if (notification != null && notification.extras != null && i < downloads.size()) {
            // Notification about download progress is sent here
            String currentDownloadId = downloads.get(i).request.id;
            int currentProgress = notification.extras.getInt(Notification.EXTRA_PROGRESS);
            
            // Enviar notificación para la descarga actual (comportamiento original)
            Download currentDownload = downloads.get(i);
            // Solo enviar notificación de progreso si la descarga está realmente en progreso
            if (currentDownload.state == Download.STATE_DOWNLOADING) {
                sendNotification(currentProgress, currentDownloadId);
                Log.d("Downloads", "Notificando descarga actual: " + currentDownloadId + 
                      " - Estado: " + getStateString(currentDownload.state) + 
                      " - Progreso: " + currentProgress + "%");
            } else if (currentDownload.state == Download.STATE_QUEUED || 
                      currentDownload.state == Download.STATE_RESTARTING) {
                // Para descargas en cola o reiniciando, siempre enviar progreso 0
                sendNotification(0, currentDownloadId);
                Log.d("Downloads", "Notificando descarga en cola/reinicio: " + currentDownloadId + 
                      " - Estado: " + getStateString(currentDownload.state) + 
                      " - Progreso: 0%");
            }
            
            // Opcional: enviar notificaciones individuales para todas las descargas activas
            for (int j = 0; j < downloads.size(); j++) {
                Download download = downloads.get(j);
                if (j != i) {  // No es la descarga actual
                    if (download.state == Download.STATE_DOWNLOADING) {
                        // Solo para descargas realmente en progreso
                        int downloadProgress = (int) download.getPercentDownloaded();
                        sendNotification(downloadProgress, download.request.id);
                        Log.d("Downloads", "Notificando descarga adicional: " + download.request.id + 
                              " - Estado: " + getStateString(download.state) + 
                              " - Progreso: " + downloadProgress + "%");
                    } else if (download.state == Download.STATE_QUEUED || 
                              download.state == Download.STATE_RESTARTING) {
                        // Para descargas en cola o reiniciando, siempre enviar progreso 0
                        sendNotification(0, download.request.id);
                        Log.d("Downloads", "Notificando descarga adicional en cola/reinicio: " + 
                              download.request.id + " - Estado: " + getStateString(download.state) + 
                              " - Progreso: 0%");
                    }
                }
            }
        }

        return notification;

    }

    // Método auxiliar para obtener el estado como string para logging
    private String getStateString(int state) {
        switch (state) {
            case Download.STATE_DOWNLOADING: return "DOWNLOADING";
            case Download.STATE_COMPLETED: return "COMPLETED";
            case Download.STATE_FAILED: return "FAILED";
            case Download.STATE_QUEUED: return "QUEUED";
            case Download.STATE_REMOVING: return "REMOVING";
            case Download.STATE_RESTARTING: return "RESTARTING";
            case Download.STATE_STOPPED: return "STOPPED";
            default: return "UNKNOWN(" + state + ")";
        }
    }

    // A method that sends a notification
    private void sendNotification(int progress, String content_id) {

        Log.d("Downloads", "+++ [AxDownloadService] sendNotification " + content_id + " " + progress);
        Intent intent = new Intent(NOTIFICATION);
        intent.setPackage(mContext.getPackageName());
        intent.putExtra(PROGRESS, progress);
        intent.putExtra(KEY_CONTENT_ID, content_id);
        sendBroadcast(intent);
    }

    // For listening download changes and sending notifications about it
    private static final class TerminalStateNotificationHelper implements DownloadManager.Listener {

        private final Context context;
        private final DownloadNotificationHelper notificationHelper;
        private int nextNotificationId;

        public TerminalStateNotificationHelper(Context context, DownloadNotificationHelper notificationHelper, int firstNotificationId) {
            this.context = context.getApplicationContext();
            this.notificationHelper = notificationHelper;
            nextNotificationId = firstNotificationId;
        }

        @Override
        public void onDownloadChanged(DownloadManager manager, Download download, Exception exception) {
            
            // Log para estado REMOVING (cuando se está borrando)
            if (download.state == Download.STATE_REMOVING) {
                Log.d("Downloads", "===== DOWNLOAD REMOVING =====");
                Log.d("Downloads", "Download ID: " + download.request.id);
                Log.d("Downloads", "URI: " + download.request.uri);
                Log.d("Downloads", "Bytes downloaded: " + download.getBytesDownloaded());
                Log.d("Downloads", "Files will be deleted by ExoPlayer");
            }

            // Añadir logging detallado para diagnóstico de fallas
            if (download.state == Download.STATE_FAILED) {
                Log.e("Downloads", "===== DOWNLOAD FAILED =====");
                Log.e("Downloads", "Download ID: " + download.request.id);
                Log.e("Downloads", "URI: " + download.request.uri);
                Log.e("Downloads", "Progress at failure: " + download.getPercentDownloaded() + "%");
                Log.e("Downloads", "Bytes downloaded: " + download.getBytesDownloaded() + " / " + download.contentLength);
                Log.e("Downloads", "Failure reason code: " + download.failureReason);
                
                if (exception != null) {
                    Log.e("Downloads", "Exception: " + exception.getMessage(), exception);
                    Log.e("Downloads", "Exception type: " + exception.getClass().getName());
                    
                    // Registrar el stack trace completo
                    StackTraceElement[] stackTrace = exception.getStackTrace();
                    if (stackTrace != null && stackTrace.length > 0) {
                        Log.e("Downloads", "Stack trace:");
                        for (StackTraceElement element : stackTrace) {
                            Log.e("Downloads", "  at " + element.toString());
                        }
                    }
                    
                    // Registrar causa raíz si existe
                    Throwable cause = exception.getCause();
                    if (cause != null) {
                        Log.e("Downloads", "Root cause: " + cause.getMessage());
                        Log.e("Downloads", "Root cause type: " + cause.getClass().getName());
                    }
                }
            }

            Notification notification;
            if (download.state == Download.STATE_COMPLETED) {
                notification =
                        notificationHelper.buildDownloadCompletedNotification(context,
                                R.drawable.ic_download_done,
                                null,
                                Util.fromUtf8Bytes(download.request.data));
            } else if (download.state == Download.STATE_FAILED) {
                notification =
                        notificationHelper.buildDownloadFailedNotification(context,
                                R.drawable.ic_download_done,
                                null,
                                Util.fromUtf8Bytes(download.request.data));
            } else {
                return;
            }
            NotificationUtil.setNotification(context, nextNotificationId++, notification);

        }
        
        @Override
        public void onDownloadRemoved(DownloadManager manager, Download download) {
            Log.d("Downloads", "===== DOWNLOAD REMOVED =====");
            Log.d("Downloads", "Download ID: " + download.request.id);
            Log.d("Downloads", "Files have been deleted by ExoPlayer");
        }

    }

}