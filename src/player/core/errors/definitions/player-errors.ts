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

    // === ERRORES DE ANALYTICS ===
	PLAYER_ANALYTICS_PLUGIN_CREATION_FAILED: {
		message: "Failed to create analytics plugin.",
	},
	PLAYER_ANALYTICS_PLUGIN_INITIALIZATION_FAILED: {
		message: "Analytics plugin failed to initialize.",
	},
	PLAYER_ANALYTICS_PLUGIN_EXECUTION_ERROR: {
		message: "Error executing analytics plugin method.",
	},
	PLAYER_ANALYTICS_PLUGIN_DESTROY_ERROR: {
		message: "Error destroying analytics plugin.",
	},
	PLAYER_ANALYTICS_FACTORY_REGISTRATION_FAILED: {
		message: "Failed to register analytics plugin in factory.",
	},
	PLAYER_ANALYTICS_INVALID_CONFIGURATION: {
		message: "Invalid analytics plugin configuration.",
	},
	PLAYER_ANALYTICS_MISSING_DEPENDENCY: {
		message: "Required analytics dependency not found.",
	},
	PLAYER_ANALYTICS_NETWORK_ERROR: {
		message: "Analytics network request failed.",
	},
	PLAYER_ANALYTICS_DATA_VALIDATION_FAILED: {
		message: "Analytics data validation failed.",
	},
	PLAYER_ANALYTICS_SESSION_CREATION_FAILED: {
		message: "Failed to create analytics session.",
	},
	PLAYER_ANALYTICS_METADATA_MAPPING_ERROR: {
		message: "Error mapping media data to analytics metadata.",
	},
	PLAYER_ANALYTICS_PLUGIN_NOT_FOUND: {
		message: "Requested analytics plugin not found in registry.",
	},
	PLAYER_ANALYTICS_ENVIRONMENT_MISMATCH: {
		message: "Analytics configuration environment mismatch.",
	},
	PLAYER_ANALYTICS_TRACKING_DISABLED: {
		message: "Analytics tracking is disabled or unavailable.",
	},
	PLAYER_ANALYTICS_BUFFER_OVERFLOW: {
		message: "Analytics event buffer overflow.",
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

    // === ERROR DESCONOCIDO ===
	PLAYER_UNKNOWN_999: {
		message: "Unknown player error occurred.",
	},
};
