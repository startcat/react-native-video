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
};
