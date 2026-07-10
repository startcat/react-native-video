package com.google.ads.interactivemedia.v3.api;

/**
 * Stub de compilación del SDK de Google IMA (interactivemedia 3.30.3).
 *
 * Solo se compila cuando RNVideo_useExoplayerIMA=false; con el flag activo,
 * android/build.gradle excluye este directorio y se usa el SDK real.
 *
 * Subconjunto mínimo de la interfaz real: solo los métodos que consume
 * ReactExoplayerView, con firmas idénticas a las del SDK real. Nunca se
 * ejecuta con el flag desactivado (no hay ads loader que emita eventos).
 */
public interface Ad {

    String getAdId();

    String getAdSystem();

    String getContentType();

    double getDuration();

    AdPodInfo getAdPodInfo();
}
