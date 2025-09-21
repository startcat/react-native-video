/*
 * Categoría: DOWNLOAD_*
 * Errores referentes a la descarga de contenidos y reproducción offline
 *
 */

export const DOWNLOAD_ERROR_DEFINITIONS = {
	// === ERRORES DE DESCARGA ===
	DOWNLOAD_FAILED: {
		message: "Failed to download media.",
	},
	DOWNLOAD_NO_SPACE: {
		message: "Not enough disk space to download media.",
	},
	DOWNLOAD_CORRUPTED: {
		message: "Downloaded file is corrupted.",
	},

	// === ERRORES DE ACCESO A CONTENIDO DESCARGADO ===
	DOWNLOAD_ACCESS_FILE_NOT_FOUND: {
		message: "Downloaded content file not found.",
	},
	DOWNLOAD_ACCESS_PERMISSION_DENIED: {
		message: "Permission denied to access downloaded content.",
	},
	DOWNLOAD_ACCESS_CORRUPTED_METADATA: {
		message: "Downloaded content metadata is corrupted.",
	},
	DOWNLOAD_ACCESS_EXPIRED: {
		message: "Downloaded content has expired.",
	},
	DOWNLOAD_ACCESS_INVALID_FORMAT: {
		message: "Downloaded content format is not supported.",
	},

	// === ERRORES DE DRM ===
	DOWNLOAD_DRM_LICENSE_EXPIRED: {
		message: "DRM license for downloaded content has expired.",
	},
	DOWNLOAD_DRM_LICENSE_NOT_FOUND: {
		message: "DRM license for downloaded content not found.",
	},
	DOWNLOAD_DRM_LICENSE_INVALID: {
		message: "DRM license for downloaded content is invalid.",
	},
	DOWNLOAD_DRM_DEVICE_NOT_AUTHORIZED: {
		message: "Device not authorized to play this DRM-protected content.",
	},
	DOWNLOAD_DRM_MAX_DEVICES_EXCEEDED: {
		message: "Maximum number of authorized devices exceeded for DRM content.",
	},
	DOWNLOAD_DRM_PLAYBACK_RESTRICTED: {
		message: "DRM restrictions prevent playback of downloaded content.",
	},
	DOWNLOAD_DRM_LICENSE_SERVER_ERROR: {
		message: "Failed to validate DRM license with server.",
	},
	DOWNLOAD_DRM_DECRYPTION_FAILED: {
		message: "Failed to decrypt DRM-protected downloaded content.",
	},

	// === ERRORES DE MÓDULO Y OPERACIONES OFFLINE ===
	DOWNLOAD_MODULE_UNAVAILABLE: {
		message: "Downloads module is not available.",
	},
	DOWNLOAD_INVALID_CONTENT_ID: {
		message: "Invalid content ID provided for download operation.",
	},
	DOWNLOAD_CONTENT_ACCESS_FAILED: {
		message: "Failed to access download content data.",
	},

    // === ERRORES CON LOS PERFILES ASSIGNADOS A LAS DESCARGAS ===
    DOWNLOAD_PROFILE_MANAGER_INITIALIZATION_FAILED: {
        message: "Failed to initialize profile manager.",
    },
    DOWNLOAD_PROFILE_MANAGER_NOT_INITIALIZED: {
        message: "Profile manager not initialized.",
    },

    // === ERRORES CON LA COLA DE DESCARGAS ===
    DOWNLOAD_QUEUE_MANAGER_INITIALIZATION_FAILED: {
        message: "Failed to initialize queue manager.",
    },
    DOWNLOAD_QUEUE_MANAGER_NOT_INITIALIZED: {
        message: "Queue manager not initialized.",
    },
    DOWNLOAD_QUEUE_ADD_ITEM_FAILED: {
        message: "Failed to add download to queue.",
    },
    DOWNLOAD_QUEUE_ITEM_NOT_FOUND: {
        message: "Download item not found.",
    },
    DOWNLOAD_QUEUE_REMOVE_FAILED: {
        message: "Failed to remove download from queue.",
    },
    DOWNLOAD_QUEUE_CLEANUP_FAILED: {
        message: "Failed to clean up completed downloads.",
    },
    DOWNLOAD_QUEUE_CLEAR_FAILED: {
        message: "Failed to clear download queue.",
    },
    DOWNLOAD_QUEUE_REORDER_FAILED: {
        message: "Failed to reorder download queue.",
    },
    DOWNLOAD_QUEUE_INVALID_CONCURRENT_COUNT: {
        message: "Invalid concurrent downloads count.",
    },
    DOWNLOAD_QUEUE_CLEAR_BY_STATE_FAILED: {
        message: "Failed to clear downloads by state.",
    },

    // === ERRORES CON EL SERVICIO DE DESCARGAS BINARIAS ===
    DOWNLOAD_BINARY_SERVICE_INITIALIZATION_FAILED: {
        message: "Failed to initialize binary download service.",
    },
    DOWNLOAD_BINARY_SERVICE_NOT_INITIALIZED: {
        message: "Binary download service not initialized.",
    },
    DOWNLOAD_BINARY_TASK_INVALID: {
        message: "Invalid binary download task.",
    },
    DOWNLOAD_BINARY_START_FAILED: {
        message: "Failed to start binary download.",
    },
    DOWNLOAD_BINARY_NOT_FOUND: {
        message: "Binary download not found.",
    },
    DOWNLOAD_BINARY_PAUSE_FAILED: {
        message: "Failed to pause binary download.",
    },
    DOWNLOAD_BINARY_RESUME_FAILED: {
        message: "Failed to resume binary download.",
    },
    DOWNLOAD_BINARY_CANCEL_FAILED: {
        message: "Failed to cancel binary download.",
    },
};
