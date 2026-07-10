package com.google.ads.interactivemedia.v3.api;

/**
 * Stub de compilación del SDK de Google IMA (interactivemedia 3.30.3).
 *
 * Solo se compila cuando RNVideo_useExoplayerIMA=false; con el flag activo,
 * android/build.gradle excluye este directorio y se usa el SDK real.
 * Interfaz completa, firmas idénticas a las del SDK real.
 */
public interface AdPodInfo {

    double getMaxDuration();

    double getTimeOffset();

    int getAdPosition();

    int getPodIndex();

    int getTotalAds();

    boolean isBumper();
}
