package com.brentvatne.license.internal.exception;

import com.brentvatne.license.LicenseManagerErrorCode;

/**
 * Custom exception for License Manager operations with structured error codes
 */
public class LicenseManagerException extends Exception {
    private final LicenseManagerErrorCode mErrorCode;
    private final String mExtraData;

    public LicenseManagerException(LicenseManagerErrorCode errorCode) {
        this(errorCode, null);
    }

    public LicenseManagerException(LicenseManagerErrorCode errorCode, String extraData) {
        super();
        if (errorCode == null) {
            throw new IllegalArgumentException("ErrorCode cannot be null");
        }
        mErrorCode = errorCode;
        mExtraData = extraData;
    }

    /**
     * Constructor with custom message and error code
     */
    public LicenseManagerException(LicenseManagerErrorCode errorCode, String message, String extraData) {
        super(message);
        if (errorCode == null) {
            throw new IllegalArgumentException("ErrorCode cannot be null");
        }
        mErrorCode = errorCode;
        mExtraData = extraData;
    }

    /**
     * Constructor with cause for exception chaining
     */
    public LicenseManagerException(LicenseManagerErrorCode errorCode, String extraData, Throwable cause) {
        super(cause);
        if (errorCode == null) {
            throw new IllegalArgumentException("ErrorCode cannot be null");
        }
        mErrorCode = errorCode;
        mExtraData = extraData;
    }

    /**
     * Constructor with custom message, extra data and cause
     */
    public LicenseManagerException(LicenseManagerErrorCode errorCode, String message, String extraData, Throwable cause) {
        super(message, cause);
        if (errorCode == null) {
            throw new IllegalArgumentException("ErrorCode cannot be null");
        }
        mErrorCode = errorCode;
        mExtraData = extraData;
    }

    public LicenseManagerErrorCode getErrorCode() {
        return mErrorCode;
    }

    public String getExtraData() {
        return mExtraData;
    }

    @Override
    public String getMessage() {
        String baseMessage = super.getMessage();
        if (baseMessage != null && !baseMessage.isEmpty()) {
            return baseMessage;
        }
        
        // Generate a meaningful message from error code and extra data
        StringBuilder message = new StringBuilder();
        message.append("License Manager Error [").append(mErrorCode.getCode()).append("]: ");
        message.append(mErrorCode.name());
        
        if (mExtraData != null && !mExtraData.trim().isEmpty()) {
            message.append(" - ").append(mExtraData);
        }
        
        return message.toString();
    }

    @Override
    public String toString() {
        return "LicenseManagerException{" +
                "errorCode=" + mErrorCode +
                ", extraData='" + mExtraData + '\'' +
                ", message='" + getMessage() + '\'' +
                ", cause=" + getCause() +
                '}';
    }
}
