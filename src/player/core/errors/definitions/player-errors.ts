/*
 * Categoría: PLAYER_*
 * Errores relacionados con la reproducción de contenido multimedia
 *
 */

export const PLAYER_ERROR_DEFINITIONS = {
	// === ERRORES DE REPRODUCCIÓN BÁSICOS ===
	PLAYER_MEDIA_LOAD_FAILED: {
		message: "Failed to load media content.",
	},
	PLAYER_MEDIA_DECODE_ERROR: {
		message: "Failed to decode media content.",
	},
	PLAYER_UNSUPPORTED_FORMAT: {
		message: "Media format not supported by this device.",
	},
	PLAYER_CODEC_NOT_SUPPORTED: {
		message: "Media codec not supported by this device.",
	},
	PLAYER_MANIFEST_PARSE_ERROR: {
		message: "Failed to parse media manifest.",
	},
	PLAYER_SEGMENT_LOAD_FAILED: {
		message: "Failed to load media segment.",
	},
	PLAYER_BUFFERING_TIMEOUT: {
		message: "Media buffering timeout exceeded.",
	},
	PLAYER_SEEK_FAILED: {
		message: "Failed to seek to requested position.",
	},

	// === ERRORES DE AUDIO ===
	PLAYER_AUDIO_RENDERER_ERROR: {
		message: "Audio renderer error occurred.",
	},
	PLAYER_AUDIO_TRACK_SELECTION_FAILED: {
		message: "Failed to select audio track.",
	},

	// === ERRORES DE VIDEO ===
	PLAYER_VIDEO_RENDERER_ERROR: {
		message: "Video renderer error occurred.",
	},
	PLAYER_VIDEO_SURFACE_ERROR: {
		message: "Video surface error occurred.",
	},

	// === ERRORES DE SUBTÍTULOS ===
	PLAYER_SUBTITLE_LOAD_FAILED: {
		message: "Failed to load subtitle track.",
	},
	PLAYER_SUBTITLE_PARSE_ERROR: {
		message: "Failed to parse subtitle content.",
	},

	// === ERRORES DE DRM ===
	PLAYER_DRM_KEY_ERROR: {
		message: "Failed to acquire DRM keys.",
	},
	PLAYER_DRM_LICENSE_SERVER_UNAVAILABLE: {
		message: "DRM license server unavailable.",
	},
	PLAYER_DRM_UNSUPPORTED_SCHEME: {
		message: "Unsupported DRM scheme.",
	},

	// === ERRORES DE CASTING ===
	PLAYER_CAST_DEVICE_NOT_FOUND: {
		message: "No cast device available.",
	},
	PLAYER_CAST_CONNECTION_FAILED: {
		message: "Failed to connect to cast device.",
	},
	PLAYER_CAST_PLAYBACK_INTERRUPTED: {
		message: "Cast playback interrupted.",
	},
	PLAYER_CAST_INVALID_SOURCE: {
		message: "Invalid or missing source URI for Cast.",
	},
	PLAYER_CAST_INVALID_MANIFEST: {
		message: "Invalid or missing manifest for Cast.",
	},
	PLAYER_CAST_INVALID_METADATA: {
		message: "Invalid or missing metadata for Cast.",
	},
	PLAYER_CAST_MESSAGE_BUILD_FAILED: {
		message: "Failed to build Cast message.",
	},
	PLAYER_CAST_NOT_READY: {
		message: "Cast device is not connected or ready to perform this action.",
	},
	PLAYER_CAST_OPERATION_FAILED: {
		message: "Cast operation failed to execute.",
	},

	// === ERRORES DE AIRPLAY ===
	PLAYER_AIRPLAY_NOT_AVAILABLE: {
		message: "AirPlay is not available on this device.",
	},
	PLAYER_AIRPLAY_CONNECTION_FAILED: {
		message: "Failed to connect to AirPlay device.",
	},
	PLAYER_AIRPLAY_PLAYBACK_FAILED: {
		message: "AirPlay playback failed to start.",
	},
	PLAYER_AIRPLAY_MIRRORING_FAILED: {
		message: "AirPlay screen mirroring failed.",
	},
	PLAYER_AIRPLAY_ROUTE_SELECTION_FAILED: {
		message: "Failed to select AirPlay route.",
	},
	PLAYER_AIRPLAY_INTERRUPTED: {
		message: "AirPlay session was interrupted.",
	},
	PLAYER_AIRPLAY_UNSUPPORTED_CONTENT: {
		message: "Content type not supported by AirPlay.",
	},

	// === ERRORES DE SOURCE ===
	PLAYER_SOURCE_NO_MANIFESTS_PROVIDED: {
		message: "No manifests provided to source.",
	},
	PLAYER_SOURCE_NO_MANIFEST_FOUND: {
		message: "No suitable manifest found for current configuration.",
	},
	PLAYER_SOURCE_OFFLINE_CONTENT_NOT_FOUND: {
		message: "Offline content not found for specified ID.",
	},
	PLAYER_SOURCE_OFFLINE_FILE_URI_INVALID: {
		message: "Invalid file URI for offline content.",
	},
	PLAYER_SOURCE_URI_CALCULATION_FAILED: {
		message: "Failed to calculate source URI.",
	},
	PLAYER_SOURCE_MANIFEST_URI_INVALID: {
		message: "Invalid manifest URI provided.",
	},
	PLAYER_SOURCE_URL_PARSING_ERROR: {
		message: "Error parsing source URL parameters.",
	},
	PLAYER_SOURCE_CONFIGURATION_INVALID: {
		message: "Invalid source configuration provided.",
	},

	// === ERRORES DE TUDUM ===
	PLAYER_TUDUM_SOURCE_HOOK_FAILED: {
		message: "Tudum source hook execution failed.",
	},
	PLAYER_TUDUM_MANIFEST_HOOK_FAILED: {
		message: "Tudum manifest hook execution failed.",
	},
	PLAYER_TUDUM_SOURCE_INVALID: {
		message: "Invalid tudum source returned from hook.",
	},
	PLAYER_TUDUM_MANIFEST_INVALID: {
		message: "Invalid tudum manifest returned from hook.",
	},
	PLAYER_TUDUM_URI_GENERATION_FAILED: {
		message: "Failed to generate tudum URI from manifest.",
	},
	PLAYER_TUDUM_DRM_PROCESSING_FAILED: {
		message: "Failed to process DRM for tudum content.",
	},
	PLAYER_TUDUM_CONFIGURATION_INVALID: {
		message: "Invalid tudum configuration provided.",
	},

	// === ERRORES DE GESTIÓN DE EVENTOS ===
	PLAYER_EVENT_ANALYTICS_DISPATCH_FAILED: {
		message: "Failed to dispatch analytics event.",
	},
	PLAYER_EVENT_CALLBACK_EXECUTION_ERROR: {
		message: "Error executing event callback.",
	},
	PLAYER_EVENT_STATE_SYNCHRONIZATION_ERROR: {
		message: "Event state synchronization failed.",
	},
	PLAYER_ERROR_PROCESSING_ERROR: {
		message: "Error processing error event.",
	},

	// === ERRORES DE TRACKING DE PROGRESO ===
	PLAYER_PROGRESS_TRACKING_FAILED: {
		message: "Failed to track playback progress.",
	},
	PLAYER_SEEK_TRACKING_ERROR: {
		message: "Error tracking seek operation.",
	},
	PLAYER_SEEK_TRACKING_TIMEOUT: {
		message: "Seek operation tracking timeout.",
	},
	PLAYER_POSITION_CALCULATION_ERROR: {
		message: "Error calculating playback position.",
	},

	// === ERRORES DE METADATA Y PISTAS ===
	PLAYER_TRACK_ENUMERATION_FAILED: {
		message: "Failed to enumerate available tracks.",
	},
	PLAYER_TRACK_METADATA_EXTRACTION_ERROR: {
		message: "Error extracting track metadata.",
	},
	PLAYER_TIMED_METADATA_PARSE_ERROR: {
		message: "Failed to parse timed metadata.",
	},

	// === ERRORES DE ANUNCIOS (ADS) ===
	PLAYER_AD_EVENT_PROCESSING_ERROR: {
		message: "Error processing ad event.",
	},
	PLAYER_AD_BREAK_TRACKING_FAILED: {
		message: "Failed to track ad break progression.",
	},
	PLAYER_AD_METADATA_INVALID: {
		message: "Invalid or missing ad metadata.",
	},

	// === ERRORES DE CALIDAD Y BITRATE ===
	PLAYER_QUALITY_DETECTION_FAILED: {
		message: "Failed to detect video quality changes.",
	},
	PLAYER_BITRATE_CALCULATION_ERROR: {
		message: "Error calculating current bitrate.",
	},
	PLAYER_ADAPTIVE_STREAMING_ERROR: {
		message: "Adaptive streaming quality adjustment failed.",
	},

	// === ERRORES DEL SISTEMA NATIVO DE DESCARGAS ===
	NATIVE_MANAGER_INITIALIZATION_FAILED: {
		message: "Failed to initialize native downloads manager.",
	},
	NATIVE_MODULE_SETUP_FAILED: {
		message: "Failed to setup native downloads module.",
	},
	NATIVE_MODULE_INIT_FAILED: {
		message: "Failed to initialize native downloads module.",
	},
	NATIVE_MANAGER_NOT_INITIALIZED: {
		message: "Native manager is not initialized.",
	},

	// === ERRORES DE GESTIÓN DE DESCARGAS NATIVAS ===
	NATIVE_ADD_DOWNLOAD_FAILED: {
		message: "Failed to add download to native module.",
	},
	NATIVE_REMOVE_DOWNLOAD_FAILED: {
		message: "Failed to remove download from native module.",
	},
	NATIVE_PAUSE_DOWNLOAD_FAILED: {
		message: "Failed to pause download in native module.",
	},
	NATIVE_RESUME_DOWNLOAD_FAILED: {
		message: "Failed to resume download in native module.",
	},
	NATIVE_CANCEL_DOWNLOAD_FAILED: {
		message: "Failed to cancel download in native module.",
	},

	// === ERRORES DE CONTROL MASIVO NATIVO ===
	NATIVE_PAUSE_ALL_FAILED: {
		message: "Failed to pause all downloads in native module.",
	},
	NATIVE_RESUME_ALL_FAILED: {
		message: "Failed to resume all downloads in native module.",
	},
	NATIVE_CANCEL_ALL_FAILED: {
		message: "Failed to cancel all downloads in native module.",
	},
	NATIVE_START_PROCESSING_FAILED: {
		message: "Failed to start download processing in native module.",
	},
	NATIVE_STOP_PROCESSING_FAILED: {
		message: "Failed to stop download processing in native module.",
	},
	NATIVE_EVENT_HANDLING_FAILED: {
		message: "Failed to handle native event.",
	},

	// === ERRORES DE CONSULTAS NATIVAS ===
	NATIVE_GET_DOWNLOADS_FAILED: {
		message: "Failed to get downloads list from native module.",
	},
	NATIVE_GET_DOWNLOAD_FAILED: {
		message: "Failed to get download info from native module.",
	},
	NATIVE_GET_STATS_FAILED: {
		message: "Failed to get download statistics from native module.",
	},

	// === ERRORES DE CONFIGURACIÓN NATIVA ===
	NATIVE_SET_QUALITY_FAILED: {
		message: "Failed to set stream quality in native module.",
	},
	NATIVE_SET_NETWORK_POLICY_FAILED: {
		message: "Failed to set network policy in native module.",
	},
	NATIVE_SET_LIMITS_FAILED: {
		message: "Failed to set download limits in native module.",
	},
	NATIVE_SET_DIRECTORIES_FAILED: {
		message: "Failed to set download directories in native module.",
	},

	// === ERRORES DE DRM NATIVO ===
	NATIVE_DOWNLOAD_LICENSE_FAILED: {
		message: "Failed to download DRM license in native module.",
	},
	NATIVE_CHECK_LICENSE_FAILED: {
		message: "Failed to check DRM license status in native module.",
	},
	NATIVE_RENEW_LICENSE_FAILED: {
		message: "Failed to renew DRM license in native module.",
	},
	NATIVE_RELEASE_LICENSE_FAILED: {
		message: "Failed to release DRM license in native module.",
	},
	NATIVE_RELEASE_ALL_LICENSES_FAILED: {
		message: "Failed to release all DRM licenses in native module.",
	},

	// === ERRORES DE UTILIDADES NATIVAS ===
	NATIVE_GENERATE_ID_FAILED: {
		message: "Failed to generate download ID in native module.",
	},
	NATIVE_REFRESH_SYSTEM_INFO_FAILED: {
		message: "Failed to refresh system info from native module.",
	},

	// === ERROR DESCONOCIDO ===
	PLAYER_UNKNOWN_999: {
		message: "Unknown player error occurred.",
	},
};
