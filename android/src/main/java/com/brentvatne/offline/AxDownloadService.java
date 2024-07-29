package com.brentvatne.offline;

import android.app.Notification;
import android.content.Context;
import android.content.Intent;
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

        notificationHelper = new DownloadNotificationHelper(this, CHANNEL_ID);
        DownloadManager downloadManager = AxOfflineManager.getInstance().getDownloadManager();

        if (downloadManager != null) {
            downloadManager.addListener(new TerminalStateNotificationHelper(this, notificationHelper, FOREGROUND_NOTIFICATION_ID + 1));
        }

    }

    @Override
    public void onCreate() {
        super.onCreate();
        mContext = getApplicationContext();
        init();

    }

    @NonNull
    @Override
    protected DownloadManager getDownloadManager() {
        return AxOfflineManager.getInstance().getDownloadManager();
    }

    @Override
    protected PlatformScheduler getScheduler() {
        return Util.SDK_INT >= 21 ? new PlatformScheduler(this, JOB_ID) : null;
    }

    // Returns a notification to be displayed
    @Override
    protected Notification getForegroundNotification(List<Download> downloads, int i) {

        Notification notification = notificationHelper.buildProgressNotification(this, R.drawable.ic_download, null, null, downloads, i);

        if (notification != null && notification.extras != null && i < downloads.size()) {
            // Notification about download progress is sent here
            sendNotification(notification.extras.getInt(Notification.EXTRA_PROGRESS), downloads.get(i).request.id);
        }

        return notification;

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

    }

}