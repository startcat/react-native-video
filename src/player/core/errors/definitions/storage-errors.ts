/*
 * Categoría: STORAGE_*
 * Errores relacionados con almacenamiento local (AsyncStorage y SecureStorage/Keychain)
 *
 */

export const STORAGE_ERROR_DEFINITIONS = {
	// === ERRORES DE ASYNCSTORAGE ===
	STORAGE_ASYNC_001: {
		message: "AsyncStorage is not available on this device.",
	},
	STORAGE_ASYNC_002: {
		message: "Failed to write data to AsyncStorage.",
	},
	STORAGE_ASYNC_003: {
		message: "Failed to read data from AsyncStorage.",
	},
	STORAGE_ASYNC_004: {
		message: "Failed to remove data from AsyncStorage.",
	},
	STORAGE_ASYNC_005: {
		message: "Data corruption detected in AsyncStorage.",
	},
	STORAGE_ASYNC_006: {
		message: "AsyncStorage quota exceeded.",
	},

	// === ERRORES DE SECURE STORAGE (KEYCHAIN) ===
	STORAGE_SECURE_101: {
		message: "Keychain/SecureStorage is not available on this device.",
	},
	STORAGE_SECURE_102: {
		message: "Failed to write data to Keychain.",
	},
	STORAGE_SECURE_103: {
		message: "Failed to read data from Keychain.",
	},
	STORAGE_SECURE_104: {
		message: "Failed to remove data from Keychain.",
	},
	STORAGE_SECURE_105: {
		message: "Keychain access denied - biometric authentication failed.",
	},
	STORAGE_SECURE_106: {
		message: "Keychain item not found.",
	},
	STORAGE_SECURE_107: {
		message: "Keychain data corruption detected.",
	},
	STORAGE_SECURE_108: {
		message: "Keychain operation timeout.",
	},
	STORAGE_SECURE_109: {
		message: "Keychain service configuration error.",
	},

	// === ERRORES DE PERMISOS Y ACCESO ===
	STORAGE_PERMISSION_201: {
		message: "Storage access permission denied.",
	},
	STORAGE_PERMISSION_202: {
		message: "Device passcode/biometric authentication required for storage access.",
	},
	STORAGE_PERMISSION_203: {
		message: "Storage access restricted by device policy.",
	},

	// === ERRORES DE ESPACIO Y RECURSOS ===
	STORAGE_SPACE_301: {
		message: "Insufficient storage space available.",
	},
	STORAGE_SPACE_302: {
		message: "Storage quota limit reached.",
	},
	STORAGE_SPACE_303: {
		message: "Storage operation blocked by low memory.",
	},

	// === ERRORES DE SERIALIZACIÓN ===
	STORAGE_SERIALIZATION_401: {
		message: "Failed to serialize data for storage.",
	},
	STORAGE_SERIALIZATION_402: {
		message: "Failed to deserialize data from storage (JSON parse error).",
	},
	STORAGE_SERIALIZATION_403: {
		message: "Data type not supported for storage serialization.",
	},
	STORAGE_SERIALIZATION_404: {
		message: "Circular reference detected in data for storage.",
	},

	// === ERRORES DE INTEGRIDAD ===
	STORAGE_INTEGRITY_501: {
		message: "Storage data integrity check failed.",
	},
	STORAGE_INTEGRITY_502: {
		message: "Storage checksum validation failed.",
	},
	STORAGE_INTEGRITY_503: {
		message: "Storage encryption/decryption failed.",
	},

	// === ERROR DESCONOCIDO ===
	STORAGE_UNKNOWN_999: {
		message: "Unknown storage error occurred.",
	},
};
