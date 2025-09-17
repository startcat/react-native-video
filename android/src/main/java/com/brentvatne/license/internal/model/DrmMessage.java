package com.brentvatne.license.internal.model;

/**
 * Model class representing a DRM (Digital Rights Management) message.
 * Contains information about DRM configuration including version,
 * key identifiers, and persistence settings for license management.
 */
@SuppressWarnings("unused")
public class DrmMessage {
    
    /** DRM message version identifier */
    private String version;
    
    /** Common Key ID for DRM content */
    private String comKeyId;
    
    /** Whether the license should be persistent (stored for offline use) */
    private boolean persistent;
    
    /** Whether keys are based on request parameters */
    private boolean keysBasedOnRequest;

    /**
     * Default constructor creating an empty DRM message
     */
    public DrmMessage() {
        // Default constructor
    }

    /**
     * Constructor with all parameters
     * 
     * @param version The DRM message version
     * @param comKeyId The common key identifier
     * @param persistent Whether the license should be persistent
     * @param keysBasedOnRequest Whether keys are based on request
     */
    public DrmMessage(String version, String comKeyId, boolean persistent, boolean keysBasedOnRequest) {
        this.version = version;
        this.comKeyId = comKeyId;
        this.persistent = persistent;
        this.keysBasedOnRequest = keysBasedOnRequest;
    }

    /**
     * Gets the DRM message version
     * @return the version string
     */
    public String getVersion() {
        return version;
    }

    /**
     * Sets the DRM message version
     * @param version the version to set
     */
    public void setVersion(String version) {
        this.version = version;
    }

    /**
     * Gets the common key ID
     * @return the common key ID
     */
    public String getComKeyId() {
        return comKeyId;
    }

    /**
     * Sets the common key ID
     * @param comKeyId the common key ID to set
     */
    public void setComKeyId(String comKeyId) {
        this.comKeyId = comKeyId;
    }

    /**
     * Checks if the license should be persistent
     * @return true if persistent, false otherwise
     */
    public boolean isPersistent() {
        return persistent;
    }

    /**
     * Sets whether the license should be persistent
     * @param persistent true for persistent license, false otherwise
     */
    public void setPersistent(boolean persistent) {
        this.persistent = persistent;
    }

    /**
     * Checks if keys are based on request parameters
     * @return true if keys are based on request, false otherwise
     */
    public boolean isKeysBasedOnRequest() {
        return keysBasedOnRequest;
    }

    /**
     * Sets whether keys are based on request parameters
     * @param keysBasedOnRequest true if keys are based on request, false otherwise
     */
    public void setKeysBasedOnRequest(boolean keysBasedOnRequest) {
        this.keysBasedOnRequest = keysBasedOnRequest;
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj) {
            return true;
        }
        if (obj == null || getClass() != obj.getClass()) {
            return false;
        }
        DrmMessage that = (DrmMessage) obj;
        return persistent == that.persistent &&
                keysBasedOnRequest == that.keysBasedOnRequest &&
                java.util.Objects.equals(version, that.version) &&
                java.util.Objects.equals(comKeyId, that.comKeyId);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(version, comKeyId, persistent, keysBasedOnRequest);
    }

    @Override
    public String toString() {
        return "DrmMessage{" +
                "version='" + version + '\'' +
                ", comKeyId='" + comKeyId + '\'' +
                ", persistent=" + persistent +
                ", keysBasedOnRequest=" + keysBasedOnRequest +
                '}';
    }

    /**
     * Validates if this DRM message has the minimum required information
     * @return true if the message is valid, false otherwise
     */
    public boolean isValid() {
        return version != null && !version.trim().isEmpty();
    }

    /**
     * Checks if this DRM message has a valid common key ID
     * @return true if comKeyId is not null and not empty, false otherwise
     */
    public boolean hasValidComKeyId() {
        return comKeyId != null && !comKeyId.trim().isEmpty();
    }

    /**
     * Creates a copy of this DRM message
     * @return a new DrmMessage instance with the same values
     */
    public DrmMessage copy() {
        return new DrmMessage(version, comKeyId, persistent, keysBasedOnRequest);
    }
}
