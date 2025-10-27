package com.brentvatne.react;

import android.util.Log;

import androidx.annotation.NonNull;

import com.brentvatne.exoplayer.ReactExoplayerView;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.uimanager.NativeViewHierarchyManager;
import com.facebook.react.uimanager.UIBlock;
import com.facebook.react.uimanager.UIManagerModule;

/**
 * Módulo nativo para gestión manual de Audio Focus
 * Permite consultar el estado del audio focus del player
 */
public class VideoAudioFocusModule extends ReactContextBaseJavaModule {
    private static final String TAG = "VideoAudioFocusModule";
    private static final String MODULE_NAME = "VideoAudioFocusModule";

    private final ReactApplicationContext reactContext;

    public VideoAudioFocusModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Obtiene el estado actual del audio focus de un player específico
     * 
     * @param viewTag Tag del componente Video
     * @param promise Promise que se resuelve con el estado del audio focus
     */
    @ReactMethod
    public void getAudioFocusState(final int viewTag, final Promise promise) {
        Log.d(TAG, "🔊 [AUDIO FOCUS Module] getAudioFocusState called for viewTag: " + viewTag);
        
        UIManagerModule uiManager = reactContext.getNativeModule(UIManagerModule.class);
        if (uiManager == null) {
            Log.e(TAG, "🔊 [AUDIO FOCUS Module] UIManagerModule is null");
            promise.reject("ERROR", "UIManagerModule not available");
            return;
        }
        
        uiManager.addUIBlock(new UIBlock() {
            @Override
            public void execute(NativeViewHierarchyManager nativeViewHierarchyManager) {
                try {
                    ReactExoplayerView view = (ReactExoplayerView) nativeViewHierarchyManager.resolveView(viewTag);
                    
                    if (view == null) {
                        Log.e(TAG, "🔊 [AUDIO FOCUS Module] View not found for tag: " + viewTag);
                        promise.reject("ERROR", "Video view not found");
                        return;
                    }
                    
                    boolean hasAudioFocus = view.getHasAudioFocus();
                    
                    Log.d(TAG, "🔊 [AUDIO FOCUS Module] Audio focus state: " + hasAudioFocus);
                    
                    WritableMap result = Arguments.createMap();
                    result.putBoolean("hasAudioFocus", hasAudioFocus);
                    
                    promise.resolve(result);
                    
                } catch (Exception e) {
                    Log.e(TAG, "🔊 [AUDIO FOCUS Module] Error getting audio focus state: " + e.getMessage(), e);
                    promise.reject("ERROR", "Failed to get audio focus state: " + e.getMessage());
                }
            }
        });
    }

    /**
     * Solicita audio focus manualmente para un player específico
     * 
     * @param viewTag Tag del componente Video
     * @param promise Promise que se resuelve con el resultado de la solicitud
     */
    @ReactMethod
    public void requestAudioFocus(final int viewTag, final Promise promise) {
        Log.d(TAG, "🔊 [AUDIO FOCUS Module] requestAudioFocus called for viewTag: " + viewTag);
        
        UIManagerModule uiManager = reactContext.getNativeModule(UIManagerModule.class);
        if (uiManager == null) {
            Log.e(TAG, "🔊 [AUDIO FOCUS Module] UIManagerModule is null");
            promise.reject("ERROR", "UIManagerModule not available");
            return;
        }
        
        uiManager.addUIBlock(new UIBlock() {
            @Override
            public void execute(NativeViewHierarchyManager nativeViewHierarchyManager) {
                try {
                    ReactExoplayerView view = (ReactExoplayerView) nativeViewHierarchyManager.resolveView(viewTag);
                    
                    if (view == null) {
                        Log.e(TAG, "🔊 [AUDIO FOCUS Module] View not found for tag: " + viewTag);
                        promise.reject("ERROR", "Video view not found");
                        return;
                    }
                    
                    boolean granted = view.manualRequestAudioFocus();
                    
                    Log.d(TAG, "🔊 [AUDIO FOCUS Module] Audio focus request result: " + granted);
                    
                    WritableMap result = Arguments.createMap();
                    result.putBoolean("granted", granted);
                    result.putBoolean("hasAudioFocus", granted);
                    
                    promise.resolve(result);
                    
                } catch (Exception e) {
                    Log.e(TAG, "🔊 [AUDIO FOCUS Module] Error requesting audio focus: " + e.getMessage(), e);
                    promise.reject("ERROR", "Failed to request audio focus: " + e.getMessage());
                }
            }
        });
    }

    /**
     * Abandona el audio focus manualmente para un player específico
     * 
     * @param viewTag Tag del componente Video
     * @param promise Promise que se resuelve cuando se abandona el audio focus
     */
    @ReactMethod
    public void abandonAudioFocus(final int viewTag, final Promise promise) {
        Log.d(TAG, "🔊 [AUDIO FOCUS Module] abandonAudioFocus called for viewTag: " + viewTag);
        
        UIManagerModule uiManager = reactContext.getNativeModule(UIManagerModule.class);
        if (uiManager == null) {
            Log.e(TAG, "🔊 [AUDIO FOCUS Module] UIManagerModule is null");
            promise.reject("ERROR", "UIManagerModule not available");
            return;
        }
        
        uiManager.addUIBlock(new UIBlock() {
            @Override
            public void execute(NativeViewHierarchyManager nativeViewHierarchyManager) {
                try {
                    ReactExoplayerView view = (ReactExoplayerView) nativeViewHierarchyManager.resolveView(viewTag);
                    
                    if (view == null) {
                        Log.e(TAG, "🔊 [AUDIO FOCUS Module] View not found for tag: " + viewTag);
                        promise.reject("ERROR", "Video view not found");
                        return;
                    }
                    
                    view.manualAbandonAudioFocus();
                    
                    Log.d(TAG, "🔊 [AUDIO FOCUS Module] Audio focus abandoned successfully");
                    
                    WritableMap result = Arguments.createMap();
                    result.putBoolean("success", true);
                    result.putBoolean("hasAudioFocus", false);
                    
                    promise.resolve(result);
                    
                } catch (Exception e) {
                    Log.e(TAG, "🔊 [AUDIO FOCUS Module] Error abandoning audio focus: " + e.getMessage(), e);
                    promise.reject("ERROR", "Failed to abandon audio focus: " + e.getMessage());
                }
            }
        });
    }
}
