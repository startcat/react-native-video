package com.brentvatne.exoplayer;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.media3.common.AdViewProvider;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.common.VideoSize;
import androidx.media3.common.text.Cue;
import androidx.media3.common.util.Assertions;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.SubtitleView;

import android.util.AttributeSet;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.SurfaceView;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.brentvatne.common.api.ResizeMode;
import com.brentvatne.common.api.SubtitleStyle;
import com.google.common.collect.ImmutableList;

import androidx.media3.ui.CaptionStyleCompat;
import android.util.Log;

import java.util.List;

public final class ExoPlayerView extends FrameLayout implements AdViewProvider {

    private View surfaceView;
    private final View shutterView;
    private final SubtitleView subtitleLayout;
    private final AspectRatioFrameLayout layout;
    private final ComponentListener componentListener;
    private ExoPlayer player;
    private final Context context;
    private final ViewGroup.LayoutParams layoutParams;
    private final FrameLayout adOverlayFrameLayout;

    private boolean useTextureView = true;
    private boolean useSecureView = false;
    private boolean hideShutterView = false;

    public ExoPlayerView(Context context) {
        this(context, null);
    }

    public ExoPlayerView(Context context, AttributeSet attrs) {
        this(context, attrs, 0);
    }

    public ExoPlayerView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);

        this.context = context;

        layoutParams = new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT);

        componentListener = new ComponentListener();

        FrameLayout.LayoutParams aspectRatioParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT);
        aspectRatioParams.gravity = Gravity.CENTER;
        layout = new AspectRatioFrameLayout(context);
        layout.setLayoutParams(aspectRatioParams);

        shutterView = new View(getContext());
        shutterView.setLayoutParams(layoutParams);
        shutterView.setBackgroundColor(ContextCompat.getColor(context, android.R.color.black));

        FrameLayout.LayoutParams subtitleParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        subtitleParams.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;

        subtitleLayout = new SubtitleView(context);
        subtitleLayout.setLayoutParams(subtitleParams);
        subtitleLayout.setUserDefaultStyle();
        subtitleLayout.setUserDefaultTextSize();

        updateSurfaceView();

        adOverlayFrameLayout = new FrameLayout(context);

        layout.addView(shutterView, 1, layoutParams);
        layout.addView(adOverlayFrameLayout, 2, layoutParams);
		layout.addView(subtitleLayout, 3, subtitleParams);

        addViewInLayout(layout, 0, aspectRatioParams);
        // addViewInLayout(subtitleLayout, 1, subtitleParams);
    }

    private void clearVideoView() {
        if (surfaceView instanceof TextureView) {
            player.clearVideoTextureView((TextureView) surfaceView);
        } else if (surfaceView instanceof SurfaceView) {
            player.clearVideoSurfaceView((SurfaceView) surfaceView);
        }
    }

    private void setVideoView() {
        if (surfaceView instanceof TextureView) {
            player.setVideoTextureView((TextureView) surfaceView);
        } else if (surfaceView instanceof SurfaceView) {
            player.setVideoSurfaceView((SurfaceView) surfaceView);
        }
    }

    public boolean isPlaying() {
        return player != null && player.isPlaying();
    }

    public void setSubtitleStyle(SubtitleStyle style) {
        // ensure we reset subtile style before reapplying it
        subtitleLayout.setUserDefaultStyle();
        subtitleLayout.setUserDefaultTextSize();

		Integer bgColor = style.getBackgroundColor();
    	int backgroundColor = (bgColor != null) ? bgColor : android.graphics.Color.BLACK;
    
		// Create CaptionStyleCompat with custom backgroundColor
		CaptionStyleCompat captionStyle = new CaptionStyleCompat(
			android.graphics.Color.WHITE,        // foregroundColor (text color)
			backgroundColor,                      // backgroundColor (behind text only)
			android.graphics.Color.TRANSPARENT,  // windowColor
			CaptionStyleCompat.EDGE_TYPE_NONE,   // edgeType
			android.graphics.Color.BLACK,        // edgeColor
			null                                 // typeface
		);

		// Apply style (replaces setUserDefaultStyle)
		subtitleLayout.setStyle(captionStyle);

        if (style.getFontSize() > 0) {
            subtitleLayout.setFixedTextSize(TypedValue.COMPLEX_UNIT_SP, style.getFontSize());
        }

        if (style.getOpacity() != 0) {
            subtitleLayout.setAlpha(style.getOpacity());
            subtitleLayout.setVisibility(View.VISIBLE);
        } else {
            subtitleLayout.setVisibility(View.GONE);
        }

		// Apply padding using post() to get parent dimensions
		subtitleLayout.post(new Runnable() {
			@Override
			public void run() {
				ViewGroup parent = (ViewGroup) subtitleLayout.getParent();
				if (parent != null) {
					int parentWidth = parent.getWidth();
					int parentHeight = parent.getHeight();
					
					// Interpret padding values as percentages (0-100)
					// If you pass paddingTop: 5, it means 5% of parent height
					int paddingLeft = (int) (parentWidth * style.getPaddingLeft() / 100f);
					int paddingRight = (int) (parentWidth * style.getPaddingRight() / 100f);
					int paddingTop = (int) (parentHeight * style.getPaddingTop() / 100f);
					int paddingBottom = (int) (parentHeight * style.getPaddingBottom() / 100f);
					
					subtitleLayout.setPadding(paddingLeft, paddingTop, paddingRight, paddingBottom);
					
					Log.d("SubtitleStyle", "Parent dimensions: " + parentWidth + "x" + parentHeight);
					Log.d("SubtitleStyle", "Padding percentages: " + style.getPaddingTop() + "% = " + paddingTop + "px");
				}
			}
		});

    }

    public void setShutterColor(Integer color) {
        shutterView.setBackgroundColor(color);
    }

    private void updateSurfaceView() {
        View view;
        if (!useTextureView || useSecureView) {
            view = new SurfaceView(context);
            if (useSecureView) {
                ((SurfaceView)view).setSecure(true);
            }
        } else {
            view = new TextureView(context);
            // Support opacity properly:
            ((TextureView) view).setOpaque(false);
        }
        view.setLayoutParams(layoutParams);

        surfaceView = view;
        if (layout.getChildAt(0) != null) {
            layout.removeViewAt(0);
        }
        layout.addView(surfaceView, 0, layoutParams);

        if (this.player != null) {
            setVideoView();
        }
    }

    private void updateShutterViewVisibility() {
        shutterView.setVisibility(this.hideShutterView ? View.INVISIBLE : View.VISIBLE);
    }

    @Override
    public void requestLayout() {
        super.requestLayout();
        post(measureAndLayout);
    }

    // AdsLoader.AdViewProvider implementation.

    @Override
    public ViewGroup getAdViewGroup() {
        return Assertions.checkNotNull(adOverlayFrameLayout, "exo_ad_overlay must be present for ad playback");
    }

    /**
     * Set the {@link ExoPlayer} to use. The {@link ExoPlayer#addListener} method of the
     * player will be called and previous
     * assignments are overridden.
     *
     * @param player The {@link ExoPlayer} to use.
     */
    public void setPlayer(ExoPlayer player) {
        if (this.player == player) {
            return;
        }
        if (this.player != null) {
            this.player.removeListener(componentListener);
            clearVideoView();
        }
        this.player = player;
        shutterView.setVisibility(this.hideShutterView ? View.INVISIBLE : View.VISIBLE);
        if (player != null) {
            setVideoView();
            player.addListener(componentListener);
        }
    }

    /**
     * Sets the resize mode which can be of value {@link ResizeMode.Mode}
     *
     * @param resizeMode The resize mode.
     */
    public void setResizeMode(@ResizeMode.Mode int resizeMode) {
        if (layout.getResizeMode() != resizeMode) {
            layout.setResizeMode(resizeMode);
            post(measureAndLayout);
        }
    }

    public void setUseTextureView(boolean useTextureView) {
        if (useTextureView != this.useTextureView) {
            this.useTextureView = useTextureView;
            updateSurfaceView();
        }
    }

    public void useSecureView(boolean useSecureView) {
        if (useSecureView != this.useSecureView) {
            this.useSecureView = useSecureView;
            updateSurfaceView();
        }
    }

    public void setHideShutterView(boolean hideShutterView) {
        this.hideShutterView = hideShutterView;
        updateShutterViewVisibility();
    }

    private final Runnable measureAndLayout = () -> {
        measure(
                MeasureSpec.makeMeasureSpec(getWidth(), MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(getHeight(), MeasureSpec.EXACTLY));
        layout(getLeft(), getTop(), getRight(), getBottom());
    };

    private void updateForCurrentTrackSelections(Tracks tracks) {
        if (tracks == null) {
            return;
        }
        ImmutableList<Tracks.Group> groups = tracks.getGroups();
        for (Tracks.Group group: groups) {
            if (group.getType() == C.TRACK_TYPE_VIDEO && group.length > 0) {
                // get the first track of the group to identify aspect ratio
                Format format = group.getTrackFormat(0);

                // update aspect ratio !
                layout.setAspectRatio(format.height == 0 ? 1 : (format.width * format.pixelWidthHeightRatio) / format.height);
                return;
            }
        }
        // no video tracks, in that case refresh shutterView visibility
        shutterView.setVisibility(this.hideShutterView ? View.INVISIBLE : View.VISIBLE);
    }

    public void invalidateAspectRatio() {
        // Resetting aspect ratio will force layout refresh on next video size changed
        layout.invalidateAspectRatio();
    }

    private final class ComponentListener implements Player.Listener {

        @Override
        public void onCues(@NonNull List<Cue> cues) {
            subtitleLayout.setCues(cues);
        }

        @Override
        public void onVideoSizeChanged(VideoSize videoSize) {
            boolean isInitialRatio = layout.getAspectRatio() == 0;
            if (videoSize.height == 0 || videoSize.width == 0) {
                // When changing video track we receive an ghost state with height / width = 0
                // No need to resize the view in that case
                return;
            }
            layout.setAspectRatio((videoSize.width * videoSize.pixelWidthHeightRatio) / videoSize.height);

            // React native workaround for measuring and layout on initial load.
            if (isInitialRatio) {
                post(measureAndLayout);
            }
        }

        @Override
        public void onRenderedFirstFrame() {
            shutterView.setVisibility(INVISIBLE);
        }

        @Override
        public void onTracksChanged(@NonNull Tracks tracks) {
            updateForCurrentTrackSelections(tracks);
        }
    }
}
