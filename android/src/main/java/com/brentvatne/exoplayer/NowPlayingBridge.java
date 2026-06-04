package com.brentvatne.exoplayer;

import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;

import com.brentvatne.common.toolbox.DebugLog;
import com.facebook.react.bridge.ReactContext;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;

/**
 * Reflective bridge to the optional {@code @overon} {@code player-now-playing} module.
 *
 * <p>RNV declares that module only as a peer dependency, so there is NO compile-time
 * coupling: we locate it through the React catalyst instance and register an
 * {@code IPlayerAdapter} (a dynamic {@link Proxy}) that hands the module our
 * {@link ExoPlayer}. The module then owns the media3 {@code MediaSession} +
 * lock-screen notification + foreground service. The only types crossing the
 * boundary are {@code androidx.media3.common.*}, which RNV already depends on.
 *
 * <p>If the module is not installed this is a silent no-op and playback is
 * unaffected. Replaces RNV's former inline now-playing stack
 * ({@code VideoPlaybackService} / {@code VideoPlaybackCallback}) — see PLAYER-210.
 */
final class NowPlayingBridge {
    private static final String TAG = "NowPlayingBridge";
    private static final String MODULE_NAME = "OveronPlayerNowPlaying";
    private static final String MODULE_CLASS = "com.overonplayernowplaying.OveronPlayerNowPlayingModule";
    private static final String ADAPTER_INTERFACE = "com.overonplayernowplaying.IPlayerAdapter";

    private final ExoPlayer player;
    private final List<Object> listeners = new ArrayList<>();
    private Player.Listener forwardingListener;
    private boolean registered = false;

    NowPlayingBridge(ExoPlayer player) {
        this.player = player;
    }

    /**
     * Registers our ExoPlayer with the now-playing module so it drives the
     * MediaSession + lock-screen notification. No-op if the module is absent.
     */
    void register(ReactContext reactContext) {
        if (registered || player == null) {
            return;
        }
        try {
            Class<?> moduleClass = Class.forName(MODULE_CLASS);
            Object module = reactContext.getCatalystInstance().getNativeModule(MODULE_NAME);
            if (module == null || !moduleClass.isInstance(module)) {
                return;
            }
            Class<?> adapterInterface = Class.forName(ADAPTER_INTERFACE);
            Object adapterProxy = Proxy.newProxyInstance(
                    adapterInterface.getClassLoader(),
                    new Class<?>[] {adapterInterface},
                    new AdapterInvocationHandler());
            Method registerMethod = moduleClass.getMethod("registerAdapter", adapterInterface);
            registerMethod.invoke(module, adapterProxy);
            registered = true;
        } catch (ClassNotFoundException e) {
            DebugLog.d(TAG, "player-now-playing module not installed; lock-screen controls disabled");
        } catch (Exception e) {
            DebugLog.w(TAG, "Could not register now-playing adapter: " + e.getMessage());
        }
    }

    /**
     * Stops forwarding player events. The module drops its MediaSession when the
     * underlying player is released (it owns the session lifecycle).
     */
    void unregister() {
        if (forwardingListener != null) {
            try {
                player.removeListener(forwardingListener);
            } catch (Exception ignored) {
            }
            forwardingListener = null;
        }
        listeners.clear();
        registered = false;
    }

    private void addListener(Object listener) {
        if (listener == null || listeners.contains(listener)) {
            return;
        }
        listeners.add(listener);
        if (forwardingListener == null) {
            forwardingListener =
                    new Player.Listener() {
                        @Override
                        public void onMediaMetadataChanged(MediaMetadata mediaMetadata) {
                            invokeListeners("onMetadataChanged", MediaMetadata.class, mediaMetadata);
                        }

                        @Override
                        public void onPlaybackStateChanged(int playbackState) {
                            invokeListeners("onPlaybackStateChanged", int.class, playbackState);
                        }

                        @Override
                        public void onIsPlayingChanged(boolean isPlaying) {
                            invokeListeners("onIsPlayingChanged", boolean.class, isPlaying);
                        }
                    };
            player.addListener(forwardingListener);
        }
    }

    private void removeListener(Object listener) {
        listeners.remove(listener);
        if (listeners.isEmpty() && forwardingListener != null) {
            player.removeListener(forwardingListener);
            forwardingListener = null;
        }
    }

    private void invokeListeners(String methodName, Class<?> paramType, Object arg) {
        for (Object listener : new ArrayList<>(listeners)) {
            try {
                Method method = listener.getClass().getMethod(methodName, paramType);
                method.invoke(listener, arg);
            } catch (Exception ignored) {
            }
        }
    }

    /**
     * Routes the now-playing module's {@code IPlayerAdapter} calls to our ExoPlayer.
     * {@code getPlayer} hands over the raw ExoPlayer (RNV plays a single item, so no
     * {@code PlaylistForwardingPlayer} / next-previous wiring is needed). Navigation
     * methods are no-ops.
     */
    private final class AdapterInvocationHandler implements InvocationHandler {
        @Override
        public Object invoke(Object proxy, Method method, Object[] args) {
            switch (method.getName()) {
                case "getPlayer":
                    return player;
                case "addListener":
                    if (args != null && args.length > 0) {
                        addListener(args[0]);
                    }
                    return null;
                case "removeListener":
                    if (args != null && args.length > 0) {
                        removeListener(args[0]);
                    }
                    return null;
                case "hashCode":
                    return System.identityHashCode(proxy);
                case "equals":
                    return args != null && args.length > 0 && proxy == args[0];
                case "toString":
                    return "RNVNowPlayingAdapter";
                default:
                    // setNavigationCallbacks / updateNavigationState / onNextRequested /
                    // onPreviousRequested — single video, no playlist: no-op.
                    return defaultReturn(method);
            }
        }
    }

    private static Object defaultReturn(Method method) {
        Class<?> returnType = method.getReturnType();
        if (returnType == boolean.class) {
            return false;
        }
        if (returnType == int.class) {
            return 0;
        }
        if (returnType == long.class) {
            return 0L;
        }
        return null;
    }
}
