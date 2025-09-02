export type PlayerErrorCategory =
    | "PERMISSIONS"
    | "DRM"
    | "LICENSE"
    | "CONNECTION"
    | "MEDIA"
    | "CAST"
    | "DOWNLOADS"
    | "OTHER";

export interface PlayerErrorDetails {
    [key: string]: any; // Información adicional opcional
}

export const PLAYER_ERROR_CODES = {

    // --- PERMISSIONS ---
    PERMISSION_DENIED: {
        code: 401,
        category: "PERMISSIONS",
        message: "Permission denied to access media.",
    },
    MICROPHONE_ACCESS_DENIED: {
        code: 402,
        category: "PERMISSIONS",
        message: "Microphone access denied by user.",
    },
    CAMERA_ACCESS_DENIED: {
        code: 403,
        category: "PERMISSIONS",
        message: "Camera access denied by user.",
    },
  
    // --- DRM ---
    DRM_KEY_ERROR: {
        code: 451,
        category: "DRM",
        message: "Failed to acquire DRM keys.",
    },
    DRM_LICENSE_SERVER_UNAVAILABLE: {
        code: 452,
        category: "DRM",
        message: "DRM license server unavailable.",
    },
    DRM_UNSUPPORTED_SCHEME: {
        code: 453,
        category: "DRM",
        message: "Unsupported DRM scheme.",
    },
  
    // --- LICENSE ---
    LICENSE_EXPIRED: {
        code: 460,
        category: "LICENSE",
        message: "License expired or invalid.",
    },
    LICENSE_NOT_FOUND: {
        code: 461,
        category: "LICENSE",
        message: "License not found for this media.",
    },
    LICENSE_DEVICE_LIMIT_REACHED: {
        code: 462,
        category: "LICENSE",
        message: "Device limit reached for this license.",
    },
  
    // --- CONNECTION ---
    NETWORK_TIMEOUT: {
        code: 408,
        category: "CONNECTION",
        message: "Network timeout while loading media.",
    },
    NETWORK_OFFLINE: {
        code: 471,
        category: "CONNECTION",
        message: "No internet connection available.",
    },
    SERVER_UNAVAILABLE: {
        code: 503,
        category: "CONNECTION",
        message: "Media server temporarily unavailable.",
    },
  
    // --- MEDIA ---
    UNSUPPORTED_FORMAT: {
        code: 415,
        category: "MEDIA",
        message: "Unsupported media format.",
    },
    MEDIA_NOT_FOUND: {
        code: 404,
        category: "MEDIA",
        message: "Requested media not found.",
    },
    MEDIA_CORRUPTED: {
        code: 480,
        category: "MEDIA",
        message: "Media file is corrupted or unreadable.",
    },
  
    // --- CAST ---
    CAST_DEVICE_NOT_FOUND: {
        code: 601,
        category: "CAST",
        message: "No cast device available.",
    },
    CAST_CONNECTION_FAILED: {
        code: 602,
        category: "CAST",
        message: "Failed to connect to cast device.",
    },
    CAST_PLAYBACK_INTERRUPTED: {
        code: 603,
        category: "CAST",
        message: "Cast playback interrupted.",
    },
    CAST_INVALID_SOURCE: {
        code: 604,
        category: "CAST",
        message: "Invalid or missing source URI for Cast.",
    },
    CAST_INVALID_MANIFEST: {
        code: 605,
        category: "CAST", 
        message: "Invalid or missing manifest for Cast.",
    },
    CAST_INVALID_METADATA: {
        code: 606,
        category: "CAST",
        message: "Invalid or missing metadata for Cast.",
    },
    CAST_MESSAGE_BUILD_FAILED: {
        code: 607,
        category: "CAST",
        message: "Failed to build Cast message.",
    },
    CAST_NOT_READY: {
        code: 608,
        category: "CAST",
        message: "Cast device is not connected or ready to perform this action.",
    },
    CAST_OPERATION_FAILED: {
        code: 609,
        category: "CAST",
        message: "Cast operation failed to execute.",
    },
  
    // --- DOWNLOADS ---
    DOWNLOAD_FAILED: {
        code: 701,
        category: "DOWNLOADS",
        message: "Failed to download media.",
    },
    DOWNLOAD_NO_SPACE: {
        code: 702,
        category: "DOWNLOADS",
        message: "Not enough disk space to download media.",
    },
    DOWNLOAD_CORRUPTED: {
        code: 703,
        category: "DOWNLOADS",
        message: "Downloaded file is corrupted.",
    },
  
    // --- OTHER ---
    UNKNOWN_ERROR: {
        code: 999,
        category: "OTHER",
        message: "An unknown error occurred.",
    },
    OPERATION_ABORTED: {
        code: 998,
        category: "OTHER",
        message: "Operation aborted by user.",
    },

  } as const;
  
  export type PlayerErrorCodeKey = keyof typeof PLAYER_ERROR_CODES;
  