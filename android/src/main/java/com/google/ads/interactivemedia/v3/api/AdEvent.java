package com.google.ads.interactivemedia.v3.api;

import java.util.Map;

/**
 * Stub de compilación del SDK de Google IMA (interactivemedia 3.30.3).
 *
 * Solo se compila cuando RNVideo_useExoplayerIMA=false; con el flag activo,
 * android/build.gradle excluye este directorio del sourceSet y se usa el SDK
 * real (transitivo de androidx.media3:media3-exoplayer-ima).
 *
 * Con el flag desactivado, ImaAdsLoader.Builder.build() (stub) devuelve null,
 * por lo que nunca se emiten eventos de anuncio: este tipo existe solo para
 * satisfacer al compilador. Firmas idénticas al SDK real.
 */
public interface AdEvent {

    Ad getAd();

    AdEventType getType();

    Map<String, String> getAdData();

    /** Enum idéntico al del SDK real 3.30.3 (mismos nombres y orden). */
    enum AdEventType {
        ALL_ADS_COMPLETED,
        AD_BREAK_FETCH_ERROR,
        CLICKED,
        COMPLETED,
        CUEPOINTS_CHANGED,
        CONTENT_PAUSE_REQUESTED,
        CONTENT_RESUME_REQUESTED,
        FIRST_QUARTILE,
        LOG,
        AD_BREAK_READY,
        MIDPOINT,
        PAUSED,
        RESUMED,
        SKIPPABLE_STATE_CHANGED,
        SKIPPED,
        STARTED,
        TAPPED,
        ICON_TAPPED,
        ICON_FALLBACK_IMAGE_CLOSED,
        THIRD_QUARTILE,
        LOADED,
        AD_PROGRESS,
        AD_BUFFERING,
        AD_BREAK_STARTED,
        AD_BREAK_ENDED,
        AD_PERIOD_STARTED,
        AD_PERIOD_ENDED,
    }

    interface AdEventListener {
        void onAdEvent(AdEvent adEvent);
    }
}
