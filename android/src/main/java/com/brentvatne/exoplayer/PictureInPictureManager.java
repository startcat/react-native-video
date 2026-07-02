package com.brentvatne.exoplayer;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.pm.PackageManager;
import android.graphics.Rect;
import android.os.Build;
import android.util.Rational;
import android.view.View;

import androidx.activity.ComponentActivity;
import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;
import androidx.core.app.PictureInPictureModeChangedInfo;
import androidx.core.util.Consumer;
import androidx.media3.common.Format;
import androidx.media3.exoplayer.ExoPlayer;

import com.brentvatne.common.toolbox.DebugLog;
import com.facebook.react.uimanager.ThemedReactContext;

/**
 * OS-level Picture-in-Picture support for {@link ReactExoplayerView} (PLAYER-379).
 *
 * - API 26+: manual enter via {@link #enterPictureInPicture}.
 * - API 31+: auto-enter on home/leave via PictureInPictureParams.setAutoEnterEnabled.
 * - API 26-30: auto-enter fallback via the activity onUserLeaveHint listener.
 *
 * Activity callbacks are observed through the androidx.activity providers
 * (ComponentActivity.addOnPictureInPictureModeChangedListener / addOnUserLeaveHintListener),
 * so the host app does not need to override anything in its MainActivity. The host manifest
 * MUST declare android:supportsPictureInPicture="true" on the activity.
 */
public class PictureInPictureManager {
    private static final String TAG = "PictureInPictureManager";

    // PiP windows only accept aspect ratios between 1:2.39 and 2.39:1.
    private static final float MIN_PIP_ASPECT_RATIO = 1.0f / 2.39f;
    private static final float MAX_PIP_ASPECT_RATIO = 2.39f;

    private final ThemedReactContext themedReactContext;
    private final Consumer<Boolean> onPictureInPictureModeChanged;
    private final Runnable onUserLeaveHint;

    private Consumer<PictureInPictureModeChangedInfo> pictureInPictureModeChangedListener;
    private Runnable userLeaveHintListener;
    private ComponentActivity listenersActivity;

    public PictureInPictureManager(
            ThemedReactContext themedReactContext,
            Consumer<Boolean> onPictureInPictureModeChanged,
            Runnable onUserLeaveHint) {
        this.themedReactContext = themedReactContext;
        this.onPictureInPictureModeChanged = onPictureInPictureModeChanged;
        this.onUserLeaveHint = onUserLeaveHint;
    }

    public boolean isSupported() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return false;
        }
        Activity activity = themedReactContext.getCurrentActivity();
        if (activity == null) {
            return false;
        }
        return activity.getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    public boolean isInPictureInPictureMode() {
        Activity activity = themedReactContext.getCurrentActivity();
        if (activity == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return false;
        }
        return activity.isInPictureInPictureMode();
    }

    /**
     * Idempotent. Hooks the PiP mode-changed + user-leave-hint listeners on the current
     * activity. Safe to call opportunistically: no-ops until the activity is available.
     */
    public void registerActivityListeners() {
        if (listenersActivity != null || !isSupported()) {
            return;
        }
        Activity activity = themedReactContext.getCurrentActivity();
        if (!(activity instanceof ComponentActivity)) {
            DebugLog.w(TAG, "Current activity is not a ComponentActivity, PiP callbacks unavailable");
            return;
        }
        ComponentActivity componentActivity = (ComponentActivity) activity;
        pictureInPictureModeChangedListener = info ->
                onPictureInPictureModeChanged.accept(info.isInPictureInPictureMode());
        userLeaveHintListener = onUserLeaveHint;
        componentActivity.addOnPictureInPictureModeChangedListener(pictureInPictureModeChangedListener);
        componentActivity.addOnUserLeaveHintListener(userLeaveHintListener);
        listenersActivity = componentActivity;
    }

    public void unregisterActivityListeners() {
        if (listenersActivity == null) {
            return;
        }
        if (pictureInPictureModeChangedListener != null) {
            listenersActivity.removeOnPictureInPictureModeChangedListener(pictureInPictureModeChangedListener);
            pictureInPictureModeChangedListener = null;
        }
        if (userLeaveHintListener != null) {
            listenersActivity.removeOnUserLeaveHintListener(userLeaveHintListener);
            userLeaveHintListener = null;
        }
        listenersActivity = null;
    }

    /**
     * Enters PiP right now (manual trigger). {@code autoEnter} must reflect the current
     * auto-enter intent because PictureInPictureParams are sticky on the activity and
     * this call would otherwise clear a previously set auto-enter flag.
     */
    public void enterPictureInPicture(@Nullable ExoPlayer player, @Nullable View sourceView, boolean autoEnter) {
        DebugLog.d(TAG, "enterPictureInPicture requested (autoEnter=" + autoEnter + ")");
        if (!isSupported()) {
            DebugLog.w(TAG, "enterPictureInPicture ignored: PiP not supported on this device");
            return;
        }
        Activity activity = themedReactContext.getCurrentActivity();
        if (activity == null) {
            return;
        }
        registerActivityListeners();
        try {
            boolean entered = activity.enterPictureInPictureMode(buildParams(player, sourceView, autoEnter));
            if (!entered) {
                DebugLog.w(TAG, "enterPictureInPictureMode returned false (not allowed right now)");
            }
        } catch (IllegalStateException e) {
            // Typically the host activity is missing android:supportsPictureInPicture="true"
            DebugLog.e(TAG, "enterPictureInPictureMode failed: " + e.getMessage());
        }
    }

    /**
     * Updates the sticky PictureInPictureParams (auto-enter flag + aspect ratio + source
     * rect hint). Only meaningful on API 31+; earlier versions rely on the user-leave-hint
     * fallback instead.
     */
    public void updatePictureInPictureParams(boolean autoEnter, @Nullable ExoPlayer player, @Nullable View sourceView) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || !isSupported()) {
            return;
        }
        Activity activity = themedReactContext.getCurrentActivity();
        if (activity == null) {
            return;
        }
        if (autoEnter) {
            registerActivityListeners();
        }
        try {
            activity.setPictureInPictureParams(buildParams(player, sourceView, autoEnter));
        } catch (IllegalStateException e) {
            DebugLog.e(TAG, "setPictureInPictureParams failed: " + e.getMessage());
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.O)
    private PictureInPictureParams buildParams(@Nullable ExoPlayer player, @Nullable View sourceView, boolean autoEnter) {
        PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
        Rational aspectRatio = calculateAspectRatio(player);
        if (aspectRatio != null) {
            builder.setAspectRatio(aspectRatio);
        }
        if (sourceView != null) {
            Rect sourceRectHint = new Rect();
            if (sourceView.getGlobalVisibleRect(sourceRectHint)) {
                builder.setSourceRectHint(sourceRectHint);
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(autoEnter);
        }
        return builder.build();
    }

    @Nullable
    private Rational calculateAspectRatio(@Nullable ExoPlayer player) {
        if (player == null) {
            return null;
        }
        Format format = player.getVideoFormat();
        if (format == null || format.width <= 0 || format.height <= 0) {
            return null;
        }
        float ratio = (format.width * format.pixelWidthHeightRatio) / format.height;
        if (ratio < MIN_PIP_ASPECT_RATIO) {
            ratio = MIN_PIP_ASPECT_RATIO;
        } else if (ratio > MAX_PIP_ASPECT_RATIO) {
            ratio = MAX_PIP_ASPECT_RATIO;
        }
        // Rational from a normalized fraction keeps precision good enough for the PiP window
        return new Rational(Math.round(ratio * 10000), 10000);
    }
}
