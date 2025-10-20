package com.brentvatne.react;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * Módulo nativo para Sleep Timer global
 * No depende de referencias al player, usa MediaSession para pausar
 */
public class VideoSleepTimerModule extends ReactContextBaseJavaModule {
    private static final String TAG = "VideoSleepTimerModule";
    private static final String MODULE_NAME = "VideoSleepTimerModule";

    // Estado del timer (global, singleton)
    private static Handler sleepTimerHandler;
    private static Runnable sleepTimerRunnable;
    private static int sleepTimerRemainingSeconds = 0;
    private static boolean sleepTimerActive = false;
    private static boolean sleepTimerFinishCurrentMode = false; // true = pausar al finalizar episodio actual

    private final ReactApplicationContext reactContext;
    private BroadcastReceiver mediaEndedReceiver;

    public VideoSleepTimerModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        
        // Configurar listeners
        setupMediaEndListener();
        setupBroadcastReceiver();
    }
    
    /**
     * Configura el listener para detectar cuando el media termina
     */
    private void setupMediaEndListener() {
        reactContext.addLifecycleEventListener(new com.facebook.react.bridge.LifecycleEventListener() {
            @Override
            public void onHostResume() {}
            
            @Override
            public void onHostPause() {}
            
            @Override
            public void onHostDestroy() {
                // Limpiar timer y receiver al destruir
                cancelSleepTimer();
                unregisterBroadcastReceiver();
            }
        });
    }
    
    /**
     * Configura el BroadcastReceiver para escuchar cuando el media termina
     * Esto permite que el modo finish-current funcione en background
     */
    private void setupBroadcastReceiver() {
        mediaEndedReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                Log.d(TAG, "🔔 [SLEEP TIMER Module] Broadcast received: SLEEP_TIMER_MEDIA_ENDED");
                handleMediaEnded();
            }
        };
        
        IntentFilter filter = new IntentFilter("com.brentvatne.react.SLEEP_TIMER_MEDIA_ENDED");
        
        // Android 13+ (API 33+) requiere especificar RECEIVER_NOT_EXPORTED
        // Este receiver es interno de la app, no debe ser accesible desde fuera
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(mediaEndedReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            reactContext.registerReceiver(mediaEndedReceiver, filter);
        }
        
        Log.d(TAG, "🔔 [SLEEP TIMER Module] BroadcastReceiver registered");
    }
    
    /**
     * Desregistra el BroadcastReceiver
     */
    private void unregisterBroadcastReceiver() {
        if (mediaEndedReceiver != null) {
            try {
                reactContext.unregisterReceiver(mediaEndedReceiver);
                Log.d(TAG, "🔔 [SLEEP TIMER Module] BroadcastReceiver unregistered");
            } catch (Exception e) {
                Log.e(TAG, "🔔 [SLEEP TIMER Module] Error unregistering receiver: " + e.getMessage());
            }
        }
    }
    
    /**
     * Maneja el evento de media terminado
     * Lógica centralizada para finish-current mode
     */
    private void handleMediaEnded() {
        Log.d(TAG, "🔔 [SLEEP TIMER Module] handleMediaEnded called");
        
        if (sleepTimerActive && sleepTimerFinishCurrentMode) {
            Log.d(TAG, "🔔 [SLEEP TIMER Module] ⏸️ Media ended in finish-current mode - PAUSING");
            cancelSleepTimer();
            pauseViaMediaSession();
        } else {
            Log.d(TAG, "🔔 [SLEEP TIMER Module] Media ended but timer not in finish-current mode (active=" + sleepTimerActive + ", finishCurrentMode=" + sleepTimerFinishCurrentMode + ")");
        }
    }
    
    /**
     * Método público para notificar que el media ha terminado desde JavaScript
     * Útil cuando la app está en foreground y JavaScript detecta onEnd
     */
    @ReactMethod
    public void notifyMediaEnded() {
        Log.d(TAG, "🔔 [SLEEP TIMER Module] notifyMediaEnded called from JavaScript");
        handleMediaEnded();
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Activa el sleep timer con los segundos especificados
     * Si ya existe un timer activo, lo reinicia con el nuevo valor
     */
    @ReactMethod
    public void activateSleepTimer(int seconds) {
        Log.d(TAG, "🔔 [SLEEP TIMER Module] ========================================");
        Log.d(TAG, "🔔 [SLEEP TIMER Module] activateSleepTimer called with " + seconds + " seconds");

        // Cancelar timer existente si lo hay
        cancelSleepTimer();

        // Configurar nuevo timer en modo tiempo
        sleepTimerRemainingSeconds = seconds;
        sleepTimerActive = true;
        sleepTimerFinishCurrentMode = false; // Modo tiempo, no finish-current

        Log.d(TAG, "🔔 [SLEEP TIMER Module] Timer configured: active=" + sleepTimerActive + ", remaining=" + sleepTimerRemainingSeconds + ", finishCurrentMode=" + sleepTimerFinishCurrentMode);

        // Crear handler si no existe
        if (sleepTimerHandler == null) {
            sleepTimerHandler = new Handler(Looper.getMainLooper());
            Log.d(TAG, "🔔 [SLEEP TIMER Module] Handler created");
        }

        // Crear runnable para el tick del timer
        sleepTimerRunnable = new Runnable() {
            @Override
            public void run() {
                sleepTimerTick();
            }
        };

        // Iniciar timer (se ejecuta cada segundo)
        sleepTimerHandler.postDelayed(sleepTimerRunnable, 1000);

        Log.d(TAG, "🔔 [SLEEP TIMER Module] Timer scheduled successfully");
        Log.d(TAG, "🔔 [SLEEP TIMER Module] ========================================");
    }

    /**
     * Activa el sleep timer en modo "Finalizar episodio actual"
     * La reproducción se pausará cuando el media actual llegue a su fin
     */
    @ReactMethod
    public void activateFinishCurrentTimer() {
        Log.d(TAG, "🔔 [SLEEP TIMER Module] ========================================");
        Log.d(TAG, "🔔 [SLEEP TIMER Module] activateFinishCurrentTimer called");

        // Cancelar timer existente si lo hay
        cancelSleepTimer();

        // Configurar timer en modo finish-current
        sleepTimerRemainingSeconds = -1; // -1 indica modo finish-current
        sleepTimerActive = true;
        sleepTimerFinishCurrentMode = true;

        Log.d(TAG, "🔔 [SLEEP TIMER Module] Timer configured: active=" + sleepTimerActive + ", finishCurrentMode=" + sleepTimerFinishCurrentMode);
        Log.d(TAG, "🔔 [SLEEP TIMER Module] Will pause when current media ends");
        Log.d(TAG, "🔔 [SLEEP TIMER Module] ========================================");
    }

    /**
     * Cancela el sleep timer activo
     */
    @ReactMethod
    public void cancelSleepTimer() {
        Log.d(TAG, "🔔 [SLEEP TIMER Module] cancelSleepTimer called");

        if (sleepTimerHandler != null && sleepTimerRunnable != null) {
            sleepTimerHandler.removeCallbacks(sleepTimerRunnable);
        }

        sleepTimerRemainingSeconds = 0;
        sleepTimerActive = false;
        sleepTimerFinishCurrentMode = false;
        sleepTimerRunnable = null;

        Log.d(TAG, "🔔 [SLEEP TIMER Module] Timer canceled: active=" + sleepTimerActive);
    }

    /**
     * Obtiene el estado actual del sleep timer
     */
    @ReactMethod
    public void getSleepTimerStatus(Promise promise) {
        Log.d(TAG, "🔔 [SLEEP TIMER Module] getSleepTimerStatus called: active=" + sleepTimerActive + ", remaining=" + sleepTimerRemainingSeconds + ", finishCurrentMode=" + sleepTimerFinishCurrentMode);
        
        WritableMap status = Arguments.createMap();
        status.putBoolean("isActive", sleepTimerActive);
        status.putInt("remainingSeconds", sleepTimerRemainingSeconds);
        status.putBoolean("isFinishCurrentMode", sleepTimerFinishCurrentMode);
        
        promise.resolve(status);
    }

    /**
     * Tick del timer que se ejecuta cada segundo
     */
    private void sleepTimerTick() {
        if (!sleepTimerActive) {
            Log.d(TAG, "🔔 [SLEEP TIMER Module] sleepTimerTick called but timer is NOT active");
            return;
        }

        sleepTimerRemainingSeconds--;

        Log.d(TAG, "🔔 [SLEEP TIMER Module] ⏱️ TICK - remaining: " + sleepTimerRemainingSeconds + " seconds");

        // Si llegamos a 0, pausar usando MediaSession
        if (sleepTimerRemainingSeconds <= 0) {
            Log.d(TAG, "🔔 [SLEEP TIMER Module] ⏸️ Timer reached 0 - PAUSING via MediaSession");
            cancelSleepTimer();
            pauseViaMediaSession();
        } else {
            // Continuar el timer
            if (sleepTimerHandler != null && sleepTimerRunnable != null) {
                sleepTimerHandler.postDelayed(sleepTimerRunnable, 1000);
            }
        }
    }

    /**
     * Pausa la reproducción directamente y emite evento a JavaScript
     * Funciona en background sin depender de JavaScript
     */
    private void pauseViaMediaSession() {
        try {
            Log.d(TAG, "🔔 [SLEEP TIMER Module] Pausing playback directly via broadcast");
            
            // Enviar broadcast para pausar el player (funciona en background)
            Intent pauseIntent = new Intent("com.brentvatne.react.SLEEP_TIMER_PAUSE_PLAYBACK");
            reactContext.sendBroadcast(pauseIntent);
            Log.d(TAG, "🔔 [SLEEP TIMER Module] ✓ Pause broadcast sent");
            
            // También emitir evento a JavaScript para actualizar UI (si está en foreground)
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("sleepTimerFinished", null);
            
            Log.d(TAG, "🔔 [SLEEP TIMER Module] ✅ Playback paused and event emitted");
        } catch (Exception e) {
            Log.e(TAG, "🔔 [SLEEP TIMER Module] ❌ Error pausing playback: " + e.getMessage());
        }
    }
}
