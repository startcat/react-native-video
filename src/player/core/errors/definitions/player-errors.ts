/*
 * Categoría: PLAYER_*
 * Errores relacionados con la reproducción de contenido multimedia
 *
 */

export const PLAYER_ERROR_DEFINITIONS = {
	// === ERRORES DE REPRODUCCIÓN BÁSICOS ===
	// Nota: Estos errores están definidos para compatibilidad con errores nativos
	// pero actualmente no se lanzan desde código TypeScript
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


    // === ERRORES DE ANALYTICS ===
	PLAYER_ANALYTICS_PLUGIN_CREATION_FAILED: {
		message: "Failed to create analytics plugin.",
	},
	PLAYER_ANALYTICS_PLUGIN_EXECUTION_ERROR: {
		message: "Error executing analytics plugin method.",
	},
	PLAYER_ANALYTICS_PLUGIN_DESTROY_ERROR: {
		message: "Error destroying analytics plugin.",
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
	PLAYER_SOURCE_URL_PARSING_ERROR: {
		message: "Error parsing source URL parameters.",
	},

    // === ERRORES DE GESTIÓN DE EVENTOS ===
    PLAYER_ERROR_PROCESSING_ERROR: {
        message: "Error processing error event.",
    },

    // === ERRORES DE EVENT HANDLERS ===
    PLAYER_EVENT_HANDLER_INITIALIZATION_FAILED: {
        message: "Failed to initialize video event handler.",
    },
    PLAYER_EVENT_HANDLER_LOAD_START_FAILED: {
        message: "Error handling load start event.",
    },
    PLAYER_EVENT_HANDLER_LOAD_FAILED: {
        message: "Error handling load event.",
    },
    PLAYER_EVENT_HANDLER_PROGRESS_FAILED: {
        message: "Error handling progress event.",
    },
    PLAYER_EVENT_HANDLER_PLAYBACK_STATE_CHANGED_FAILED: {
        message: "Error handling playback state change event.",
    },
    PLAYER_EVENT_HANDLER_BUFFER_FAILED: {
        message: "Error handling buffer event.",
    },
    PLAYER_EVENT_HANDLER_SEEK_FAILED: {
        message: "Error handling seek event.",
    },
    PLAYER_EVENT_HANDLER_PLAYBACK_RATE_CHANGE_FAILED: {
        message: "Error handling playback rate change event.",
    },
    PLAYER_EVENT_HANDLER_VOLUME_CHANGE_FAILED: {
        message: "Error handling volume change event.",
    },
    PLAYER_EVENT_HANDLER_END_FAILED: {
        message: "Error handling end event.",
    },
    PLAYER_EVENT_HANDLER_ERROR_FAILED: {
        message: "Error handling error event.",
    },
    PLAYER_EVENT_HANDLER_RECEIVE_AD_EVENT_FAILED: {
        message: "Error handling ad event.",
    },
    PLAYER_EVENT_HANDLER_AUDIO_TRACKS_FAILED: {
        message: "Error handling audio tracks event.",
    },
    PLAYER_EVENT_HANDLER_TEXT_TRACKS_FAILED: {
        message: "Error handling text tracks event.",
    },
    PLAYER_EVENT_HANDLER_VIDEO_TRACKS_FAILED: {
        message: "Error handling video tracks event.",
    },
    PLAYER_EVENT_HANDLER_BANDWIDTH_UPDATE_FAILED: {
        message: "Error handling bandwidth update event.",
    },
    PLAYER_EVENT_HANDLER_ASPECT_RATIO_FAILED: {
        message: "Error handling aspect ratio event.",
    },
    PLAYER_EVENT_HANDLER_TIMED_METADATA_FAILED: {
        message: "Error handling timed metadata event.",
    },
    PLAYER_EVENT_HANDLER_READY_FOR_DISPLAY_FAILED: {
        message: "Error handling ready for display event.",
    },
    PLAYER_EVENT_HANDLER_AUDIO_BECOMING_NOISY_FAILED: {
        message: "Error handling audio becoming noisy event.",
    },
    PLAYER_EVENT_HANDLER_IDLE_FAILED: {
        message: "Error handling idle event.",
    },

    // === ERRORES DE TRACKING DE PROGRESO ===
    PLAYER_SEEK_TRACKING_ERROR: {
        message: "Error tracking seek operation.",
    },
    
    // === ERRORES DE PROGRESS MANAGERS ===
    PLAYER_PROGRESS_MANAGER_NOT_INITIALIZED: {
        message: "Progress manager must be initialized before use.",
    },
    PLAYER_PROGRESS_UPDATE_FAILED: {
        message: "Failed to update player progress data.",
    },
	PLAYER_PROGRESS_INVALID_STATE: {
		message: "Progress manager is in an invalid state for this operation.",
	},
    PLAYER_PROGRESS_MANAGER_CREATION_FAILED: {
        message: "Failed to create progress manager instance.",
    },


	// === ERRORES DE ANUNCIOS (ADS) ===
	PLAYER_AD_EVENT_PROCESSING_ERROR: {
		message: "Error processing ad event.",
	},


	// === ERRORES DE PLAYLIST ===
	// Nota: Estos errores están reservados para el sistema de playlists nativo
	// que se gestiona principalmente en el lado nativo (iOS/Android)
	PLAYLIST_INITIALIZATION_FAILED: {
		message: "Failed to initialize playlist manager.",
	},
	PLAYLIST_NOT_INITIALIZED: {
		message: "Playlist manager is not initialized.",
	},
	PLAYLIST_INVALID_ITEM: {
		message: "Invalid playlist item.",
	},
	PLAYLIST_EMPTY: {
		message: "Playlist cannot be empty.",
	},

    // === ERROR DESCONOCIDO ===
	PLAYER_UNKNOWN_999: {
		message: "Unknown player error occurred.",
	},
};
