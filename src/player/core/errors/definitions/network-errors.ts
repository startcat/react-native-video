/*
 * Categoría: NETWORK_*
 * Errores relacionados con llamadas HTTP y conectividad de red
 *
 */

export const NETWORK_ERROR_DEFINITIONS = {
	// === ERRORES DE CONECTIVIDAD ===
	NETWORK_CONNECTION_001: {
		message: "No internet connection available.",
	},
	NETWORK_CONNECTION_002: {
		message: "Network request timeout.",
	},
	NETWORK_CONNECTION_003: {
		message: "DNS resolution failed.",
	},
	NETWORK_CONNECTION_004: {
		message: "SSL/TLS connection failed.",
	},

	// === ERRORES HTTP 4XX - CLIENTE ===
	NETWORK_HTTP_400: {
		message: "Bad request - invalid parameters sent to server.",
	},
	NETWORK_HTTP_401: {
		message: "Unauthorized - authentication required.",
	},
	NETWORK_HTTP_403: {
		message: "Forbidden - access denied to this resource.",
	},
	NETWORK_HTTP_404: {
		message: "Resource not found.",
	},
	NETWORK_HTTP_405: {
		message: "Method not allowed for this endpoint.",
	},
	NETWORK_HTTP_408: {
		message: "Request timeout.",
	},
	NETWORK_HTTP_409: {
		message: "Conflict - resource already exists or is in use.",
	},
	NETWORK_HTTP_410: {
		message: "Resource no longer available.",
	},
	NETWORK_HTTP_422: {
		message: "Unprocessable entity - validation failed.",
	},
	NETWORK_HTTP_429: {
		message: "Too many requests - rate limit exceeded.",
	},

	// === ERRORES HTTP 5XX - SERVIDOR ===
	NETWORK_HTTP_500: {
		message: "Internal server error.",
	},
	NETWORK_HTTP_501: {
		message: "Not implemented - server doesn't support this functionality.",
	},
	NETWORK_HTTP_502: {
		message: "Bad gateway - upstream server error.",
	},
	NETWORK_HTTP_503: {
		message: "Service unavailable - server temporarily overloaded.",
	},
	NETWORK_HTTP_504: {
		message: "Gateway timeout - upstream server didn't respond.",
	},
	NETWORK_HTTP_505: {
		message: "HTTP version not supported.",
	},

	// === ERRORES GENERALES DE RED ===
	NETWORK_PARSE_601: {
		message: "Failed to parse server response.",
	},
	NETWORK_PARSE_602: {
		message: "Invalid JSON response from server.",
	},
	NETWORK_PARSE_603: {
		message: "Unexpected response format from server.",
	},

	// === ERRORES DE RESTRICCIONES DE CONECTIVIDAD ===
	NETWORK_CELLULAR_RESTRICTED: {
		message: "This content is restricted on cellular data connection.",
	},
	NETWORK_DOWNLOADS_WIFI_RESTRICTED: {
		message: "Downloads are restricted to WiFi connections only.",
	},

	// === ERROR DESCONOCIDO ===
	NETWORK_UNKNOWN_999: {
		message: "Unknown network error occurred.",
	},
};
