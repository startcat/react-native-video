package com.google.ads.interactivemedia.v3.api;

/**
 * Stub de compilación del SDK de Google IMA (interactivemedia 3.30.3).
 *
 * Solo se compila cuando RNVideo_useExoplayerIMA=false; con el flag activo,
 * android/build.gradle excluye este directorio y se usa el SDK real.
 *
 * ATENCIÓN: este stub SÍ se ejecuta en runtime con el flag desactivado
 * (ReactExoplayerView crea ImaSdkSettings de forma incondicional antes de
 * construir el ImaAdsLoader stub, cuyo build() devuelve null). Por eso
 * getInstance() y createImaSdkSettings() devuelven no-ops funcionales en vez
 * de lanzar. Subconjunto mínimo de la clase real, firmas idénticas.
 */
public class ImaSdkFactory {

    private static final ImaSdkFactory INSTANCE = new ImaSdkFactory();

    private ImaSdkFactory() {
    }

    public static ImaSdkFactory getInstance() {
        return INSTANCE;
    }

    public ImaSdkSettings createImaSdkSettings() {
        return new NoOpImaSdkSettings();
    }

    /** Implementación no-op: IMA está deshabilitado (useExoplayerIMA=false). */
    private static final class NoOpImaSdkSettings implements ImaSdkSettings {
        @Override
        public String getLanguage() {
            return null;
        }

        @Override
        public void setLanguage(String language) {
            // no-op: IMA deshabilitado
        }
    }
}
