package com.google.ads.interactivemedia.v3.api;

/**
 * Stub de compilación del SDK de Google IMA (interactivemedia 3.30.3).
 *
 * Solo se compila cuando RNVideo_useExoplayerIMA=false; con el flag activo,
 * android/build.gradle excluye este directorio y se usa el SDK real.
 *
 * Como en el SDK real, extiende Exception (getMessage()/getCause() heredados).
 * Nunca se instancia con el flag desactivado (no hay ads loader que emita
 * errores). Firmas idénticas al SDK real.
 */
public final class AdError extends Exception {

    public AdError(AdErrorType type, int errorCodeNumber, String message) {
        super(message);
    }

    public AdError(AdErrorType type, AdErrorCode errorCode, String message) {
        super(message);
    }

    public AdErrorCode getErrorCode() {
        return null;
    }

    public int getErrorCodeNumber() {
        return 0;
    }

    public AdErrorType getErrorType() {
        return null;
    }

    /** Enum idéntico al del SDK real 3.30.3 (mismos nombres y orden). */
    public enum AdErrorCode {
        INTERNAL_ERROR,
        VAST_MALFORMED_RESPONSE,
        UNKNOWN_AD_RESPONSE,
        VAST_TRAFFICKING_ERROR,
        VAST_LOAD_TIMEOUT,
        VAST_TOO_MANY_REDIRECTS,
        VIDEO_PLAY_ERROR,
        VAST_MEDIA_LOAD_TIMEOUT,
        VAST_LINEAR_ASSET_MISMATCH,
        OVERLAY_AD_PLAYING_FAILED,
        OVERLAY_AD_LOADING_FAILED,
        VAST_NONLINEAR_ASSET_MISMATCH,
        COMPANION_AD_LOADING_FAILED,
        UNKNOWN_ERROR,
        VAST_EMPTY_RESPONSE,
        FAILED_TO_REQUEST_ADS,
        VAST_ASSET_NOT_FOUND,
        ADS_REQUEST_NETWORK_ERROR,
        INVALID_ARGUMENTS,
        PLAYLIST_NO_CONTENT_TRACKING,
        UNEXPECTED_ADS_LOADED_EVENT,
        ADS_PLAYER_NOT_PROVIDED,
    }

    /** Enum idéntico al del SDK real 3.30.3. */
    public enum AdErrorType {
        LOAD,
        PLAY,
    }
}
