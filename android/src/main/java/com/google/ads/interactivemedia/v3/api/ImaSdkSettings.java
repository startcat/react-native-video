package com.google.ads.interactivemedia.v3.api;

/**
 * Stub de compilación del SDK de Google IMA (interactivemedia 3.30.3).
 *
 * Solo se compila cuando RNVideo_useExoplayerIMA=false; con el flag activo,
 * android/build.gradle excluye este directorio y se usa el SDK real.
 *
 * ATENCIÓN: a diferencia de los stubs de eventos, este tipo SÍ se ejecuta en
 * runtime con el flag desactivado (ReactExoplayerView llama a
 * ImaSdkFactory.getInstance().createImaSdkSettings().setLanguage(...) de forma
 * incondicional), por lo que la implementación que devuelve la factoría debe
 * ser un no-op funcional, nunca lanzar. Subconjunto mínimo de la interfaz
 * real, firmas idénticas.
 */
public interface ImaSdkSettings {

    String getLanguage();

    void setLanguage(String language);
}
