package com.brentvatne.license;

import androidx.annotation.StringRes;

import com.brentvatne.react.R;

/**
 * License Manager error codes for DRM and offline license operations
 */
@SuppressWarnings("WeakerAccess")
public enum LicenseManagerErrorCode {
    /**
     * DRM scheme is not supported by current Android SDK
     */
    ERROR_300(300, R.string.license_player_error_300),
    /**
     * Unsupported DRM scheme
     */
    ERROR_301(301, R.string.license_player_error_301),
    /**
     * DRM session error
     */
    ERROR_302(302, R.string.license_player_error_302),
    /**
     * License file read/write exception
     */
    ERROR_303(303, R.string.license_player_error_303),
    /**
     * Error while reading manifest from .tar file
     */
    ERROR_304(304, R.string.license_player_error_304),
    /**
     * Cannot delete all licenses
     */
    ERROR_305(305, R.string.license_player_error_305),
    /**
     * Cannot parse DRM message
     */
    ERROR_306(306, R.string.license_player_error_306),
    /**
     * DRM message has no persistent flag
     */
    ERROR_307(307, R.string.license_player_error_307),
    /**
     * DRM license expired or will expire soon
     */
    ERROR_308(308, R.string.license_player_error_308),
    /**
     * Device provisioning failed
     */
    ERROR_309(309, R.string.license_player_error_309),
    /**
     * Invalid parameter provided to method
     */
    INVALID_PARAMETER(400, R.string.license_player_error_400);

    private int mCode;
    private int mDescription;

    LicenseManagerErrorCode(int code, @StringRes int description) {
        if (code <= 0) {
            throw new IllegalArgumentException("Error code must be positive, got: " + code);
        }
        if (description == 0) {
            throw new IllegalArgumentException("Description resource ID cannot be 0");
        }
        mCode = code;
        mDescription = description;
    }

    public int getCode() {
        return mCode;
    }

    public int getDescription() {
        return mDescription;
    }

    @Override
    public String toString() {
        return "LicenseManagerErrorCode{" +
                "name=" + name() +
                ", code=" + mCode +
                ", description=" + mDescription +
                '}';
    }

    @SuppressWarnings("unused")
    public static LicenseManagerErrorCode getByCode(int code) {
        try {
            return valueOf("ERROR_" + code);
        } catch (IllegalArgumentException e) {
            // Return a default error code if the specific code doesn't exist
            android.util.Log.w("LicenseManagerErrorCode", "Unknown error code: " + code + ", returning default error");
            return ERROR_300; // Default to first error code
        }
    }

    /**
     * Find error code by numeric code value, returns null if not found
     * @param code the numeric error code to search for
     * @return the matching LicenseManagerErrorCode or null if not found
     */
    @SuppressWarnings("unused")
    public static LicenseManagerErrorCode findByCode(int code) {
        for (LicenseManagerErrorCode errorCode : values()) {
            if (errorCode.getCode() == code) {
                return errorCode;
            }
        }
        return null;
    }
}
