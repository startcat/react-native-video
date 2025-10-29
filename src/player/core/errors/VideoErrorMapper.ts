import type { OnVideoErrorData } from "../../../specs/VideoNativeComponent";
import { PlayerError, PlayerErrorCodeKey } from "./";

/*
 *  Mapeo de códigos de error nativos a PlayerErrorCodeKey
 *
 */

const NATIVE_ERROR_CODE_MAPPING: Record<string | number, PlayerErrorCodeKey> = {
	// Android ExoPlayer Error Codes
	"2001": "NETWORK_HTTP_404",
	"2002": "PLAYER_UNSUPPORTED_FORMAT",
	"2003": "NETWORK_CONNECTION_002",
	"2004": "PLAYER_MEDIA_DECODE_ERROR",
	"3001": "PLAYER_DRM_KEY_ERROR",
	"3002": "PLAYER_DRM_LICENSE_SERVER_UNAVAILABLE",
	"3003": "PLAYER_DRM_UNSUPPORTED_SCHEME",
	"4001": "NETWORK_CONNECTION_001",
	"4002": "NETWORK_HTTP_503",

	// Android ExoPlayer IO Error Codes
	"22005": "STORAGE_SECURE_106", // ERROR_CODE_IO_FILE_NOT_FOUND - Downloaded content not found
	"22000": "NETWORK_CONNECTION_002", // ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT
	"22001": "NETWORK_CONNECTION_001", // ERROR_CODE_IO_NETWORK_CONNECTION_FAILED
	"22002": "NETWORK_CONNECTION_002", // ERROR_CODE_IO_READ_POSITION_OUT_OF_RANGE
	"22003": "PERMISSION_CAST_DENIED", // ERROR_CODE_IO_NO_PERMISSION
	"22004": "PLAYER_MEDIA_DECODE_ERROR", // ERROR_CODE_IO_CLEARTEXT_NOT_PERMITTED
	"22006": "NETWORK_HTTP_404", // ERROR_CODE_IO_BAD_HTTP_STATUS

	// Android ExoPlayer Parsing Error Codes
	"23000": "PLAYER_MANIFEST_PARSE_ERROR", // ERROR_CODE_PARSING_CONTAINER_MALFORMED
	"23001": "PLAYER_MANIFEST_PARSE_ERROR", // ERROR_CODE_PARSING_MANIFEST_MALFORMED
	"23002": "PLAYER_UNSUPPORTED_FORMAT", // ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED
	"23003": "PLAYER_UNSUPPORTED_FORMAT", // ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED

	// Android ExoPlayer Decoder Error Codes
	"24000": "PLAYER_MEDIA_DECODE_ERROR", // ERROR_CODE_DECODER_INIT_FAILED
	"24001": "PLAYER_MEDIA_DECODE_ERROR", // ERROR_CODE_DECODER_QUERY_FAILED
	"24002": "PLAYER_MEDIA_DECODE_ERROR", // ERROR_CODE_DECODING_FAILED
	"24003": "PLAYER_CODEC_NOT_SUPPORTED", // ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES
	"24004": "PLAYER_CODEC_NOT_SUPPORTED", // ERROR_CODE_DECODING_FORMAT_UNSUPPORTED

	// Android ExoPlayer Audio Error Codes
	"25000": "PLAYER_AUDIO_RENDERER_ERROR", // ERROR_CODE_AUDIO_TRACK_INIT_FAILED
	"25001": "PLAYER_AUDIO_RENDERER_ERROR", // ERROR_CODE_AUDIO_TRACK_WRITE_FAILED

	// Android ExoPlayer DRM Error Codes
	"26000": "PLAYER_DRM_KEY_ERROR", // ERROR_CODE_DRM_UNSPECIFIED
	"26001": "PLAYER_DRM_UNSUPPORTED_SCHEME", // ERROR_CODE_DRM_SCHEME_UNSUPPORTED
	"26002": "PLAYER_DRM_KEY_ERROR", // ERROR_CODE_DRM_PROVISIONING_FAILED
	"26003": "PLAYER_DRM_KEY_ERROR", // ERROR_CODE_DRM_CONTENT_ERROR
	"26004": "PLAYER_DRM_LICENSE_SERVER_UNAVAILABLE", // ERROR_CODE_DRM_LICENSE_ACQUISITION_FAILED
	"26005": "PLAYER_DRM_KEY_ERROR", // ERROR_CODE_DRM_DISALLOWED_OPERATION
	"26006": "PLAYER_DRM_KEY_ERROR", // ERROR_CODE_DRM_SYSTEM_ERROR
	"26007": "PLAYER_DRM_KEY_ERROR", // ERROR_CODE_DRM_DEVICE_REVOKED

	// iOS AVPlayer Error Codes
	"-11800": "PLAYER_UNKNOWN_999", // AVErrorUnknown
	"-11801": "DEVICE_INSUFFICIENT_MEMORY", // AVErrorOutOfMemory
	"-11803": "PLAYER_UNKNOWN_999", // AVErrorSessionNotRunning
	"-11804": "PERMISSION_CAST_DENIED", // AVErrorDeviceAlreadyUsedByAnotherSession
	"-11805": "NETWORK_HTTP_404", // AVErrorNoDataCaptured
	"-11806": "PLAYER_UNKNOWN_999", // AVErrorSessionConfigurationChanged
	"-11807": "STORAGE_SPACE_301", // AVErrorDiskFull
	"-11808": "DEVICE_STORAGE_FULL", // AVErrorDeviceWasDisconnected
	"-11809": "PLAYER_MEDIA_DECODE_ERROR", // AVErrorMediaChanged
	"-11810": "PLAYER_UNKNOWN_999", // AVErrorMaximumDurationReached
	"-11811": "STORAGE_SPACE_301", // AVErrorMaximumFileSizeReached
	"-11812": "NETWORK_CONNECTION_002", // AVErrorMediaDiscontinuity
	"-11813": "PLAYER_MEDIA_DECODE_ERROR", // AVErrorMaximumNumberOfSamplesForFileFormatReached
	"-11814": "DEVICE_STORAGE_FULL", // AVErrorDeviceNotConnected
	"-11815": "DEVICE_BATTERY_LOW", // AVErrorDeviceInUseByAnotherApplication
	"-11817": "PERMISSION_CAST_DENIED", // AVErrorDeviceLockedForConfigurationByAnotherProcess
	"-11818": "PLAYER_UNKNOWN_999", // AVErrorSessionWasInterrupted
	"-11819": "PLAYER_MEDIA_DECODE_ERROR", // AVErrorMediaServicesWereReset
	"-11820": "PLAYER_MEDIA_DECODE_ERROR", // AVErrorExportFailed
	"-11821": "PLAYER_MEDIA_DECODE_ERROR", // AVErrorDecodeFailed
	"-11822": "PLAYER_UNSUPPORTED_FORMAT", // AVErrorInvalidSourceMedia
	"-11823": "STORAGE_ASYNC_002", // AVErrorFileAlreadyExists
	"-11824": "PLAYER_MEDIA_DECODE_ERROR", // AVErrorCompositionTrackSegmentsNotContiguous
	"-11825": "PLAYER_MEDIA_DECODE_ERROR", // AVErrorInvalidCompositionTrackSegmentDuration
	"-11826": "PLAYER_MEDIA_DECODE_ERROR", // AVErrorInvalidCompositionTrackSegmentSourceStartTime
	"-11827": "PLAYER_MEDIA_DECODE_ERROR", // AVErrorInvalidCompositionTrackSegmentSourceDuration
	"-11828": "PLAYER_UNSUPPORTED_FORMAT", // AVErrorFileFormatNotRecognized
	"-11829": "PLAYER_MANIFEST_PARSE_ERROR", // AVErrorFileFailedToParse
	"-11830": "PLAYER_UNKNOWN_999", // AVErrorMaximumStillImageCaptureRequestsExceeded
	"-11831": "PLAYER_DRM_KEY_ERROR", // AVErrorContentIsProtected
	"-11832": "NETWORK_HTTP_404", // AVErrorNoImageAtTime
	"-11833": "PLAYER_CODEC_NOT_SUPPORTED", // AVErrorDecoderNotFound
	"-11834": "PLAYER_CODEC_NOT_SUPPORTED", // AVErrorEncoderNotFound
	"-11835": "PLAYER_DRM_LICENSE_SERVER_UNAVAILABLE", // AVErrorContentIsNotAuthorized
	"-11836": "PERMISSION_CAST_DENIED", // AVErrorApplicationIsNotAuthorized
	"-11837": "PERMISSION_CAST_DENIED", // AVErrorDeviceIsNotAvailableInBackground
	"-11838": "PLAYER_UNSUPPORTED_FORMAT", // AVErrorOperationNotSupportedForAsset
	"-11839": "PLAYER_CODEC_NOT_SUPPORTED", // AVErrorDecoderTemporarilyUnavailable
	"-11840": "PLAYER_CODEC_NOT_SUPPORTED", // AVErrorEncoderTemporarilyUnavailable
	"-11841": "PLAYER_VIDEO_RENDERER_ERROR", // AVErrorInvalidVideoComposition
	"-11842": "PERMISSION_CAST_DENIED", // AVErrorReferenceForbiddenByReferencePolicy
	"-11843": "PLAYER_UNSUPPORTED_FORMAT", // AVErrorInvalidOutputURLPathExtension
	"-11844": "PERMISSION_CAST_DENIED", // AVErrorScreenCaptureFailed
	"-11845": "PERMISSION_CAST_DENIED", // AVErrorDisplayWasDisabled
	"-11846": "PERMISSION_CAST_DENIED", // AVErrorTorchLevelUnavailable
	"-11847": "PLAYER_UNKNOWN_999", // AVErrorOperationInterrupted
	"-11848": "PLAYER_UNSUPPORTED_FORMAT", // AVErrorIncompatibleAsset
	"-11849": "PLAYER_MEDIA_LOAD_FAILED", // AVErrorFailedToLoadMediaData
	"-11850": "NETWORK_HTTP_503", // AVErrorServerIncorrectlyConfigured
	"-11852": "PERMISSION_CAST_DENIED", // AVErrorApplicationIsNotAuthorizedToUseDevice
	"-11853": "PLAYER_MANIFEST_PARSE_ERROR", // AVErrorFailedToParse
	"-11854": "PLAYER_UNSUPPORTED_FORMAT", // AVErrorFileTypeDoesNotSupportSampleReferences
	"-11855": "PLAYER_MEDIA_DECODE_ERROR", // AVErrorUndecodableMediaData
	"-11856": "NETWORK_CONNECTION_001", // AVErrorAirPlayControllerRequiresInternet
	"-11857": "NETWORK_CONNECTION_001", // AVErrorAirPlayReceiverRequiresInternet
	"-11858": "PLAYER_VIDEO_RENDERER_ERROR", // AVErrorVideoCompositorFailed
	"-11859": "PLAYER_UNKNOWN_999", // AVErrorRecordingAlreadyInProgress
	"-1009": "NETWORK_CONNECTION_001", // NSURLErrorNotConnectedToInternet
	"-1001": "NETWORK_CONNECTION_002", // NSURLErrorTimedOut

	// Códigos HTTP comunes
	"400": "NETWORK_HTTP_400",
	"401": "NETWORK_HTTP_401",
	"403": "NETWORK_HTTP_403",
	"404": "NETWORK_HTTP_404",
	"408": "NETWORK_HTTP_408",
	"415": "PLAYER_UNSUPPORTED_FORMAT",
	"500": "NETWORK_HTTP_500",
	"503": "NETWORK_HTTP_503",
};

/*
 *  Palabras clave para categorización automática de errores
 *
 */

const ERROR_KEYWORDS: Partial<Record<PlayerErrorCodeKey, string[]>> = {
	// Network errors
	NETWORK_CONNECTION_001: ["offline", "no internet", "network unavailable", "not connected"],
	NETWORK_CONNECTION_002: ["timeout", "timed out", "connection timeout"],
	NETWORK_CONNECTION_003: ["dns", "resolution failed", "hostname"],
	NETWORK_CONNECTION_004: ["ssl", "tls", "certificate", "handshake"],
	NETWORK_HTTP_400: ["bad request", "400"],
	NETWORK_HTTP_401: ["unauthorized", "401", "authentication"],
	NETWORK_HTTP_403: ["forbidden", "403", "access denied"],
	NETWORK_HTTP_404: [
		"not found",
		"404",
		"file not found",
		"resource not found",
		"ENOENT",
		"FileNotFoundException",
	],
	NETWORK_HTTP_408: ["request timeout", "408"],
	NETWORK_HTTP_500: ["internal server error", "500"],
	NETWORK_HTTP_503: ["service unavailable", "503", "server unavailable"],
	NETWORK_PARSE_601: ["parse error", "invalid response"],
	NETWORK_PARSE_602: ["json error", "invalid json"],
	NETWORK_UNKNOWN_999: ["unknown network error"],

	// Player errors
	PLAYER_MEDIA_LOAD_FAILED: ["failed to load", "load error", "media load"],
	PLAYER_MEDIA_DECODE_ERROR: ["decode error", "corrupted", "invalid", "malformed", "damaged"],
	PLAYER_UNSUPPORTED_FORMAT: ["unsupported", "format", "codec", "mime type"],
	PLAYER_CODEC_NOT_SUPPORTED: ["codec not supported", "decoder not found", "encoder not found"],
	PLAYER_MANIFEST_PARSE_ERROR: ["manifest", "playlist", "parse error"],
	PLAYER_SEGMENT_LOAD_FAILED: ["segment", "chunk load failed"],
	PLAYER_BUFFERING_TIMEOUT: ["buffering timeout", "buffer error"],
	PLAYER_SEEK_FAILED: ["seek failed", "seek error"],
	PLAYER_AUDIO_RENDERER_ERROR: ["audio renderer", "audio track error"],
	PLAYER_AUDIO_TRACK_SELECTION_FAILED: ["audio track selection"],
	PLAYER_VIDEO_RENDERER_ERROR: ["video renderer", "video surface"],
	PLAYER_VIDEO_SURFACE_ERROR: ["video surface error"],
	PLAYER_SUBTITLE_LOAD_FAILED: ["subtitle load", "subtitle error"],
	PLAYER_SUBTITLE_PARSE_ERROR: ["subtitle parse"],
	PLAYER_DRM_KEY_ERROR: ["drm", "key", "license", "protected", "encrypted"],
	PLAYER_DRM_LICENSE_SERVER_UNAVAILABLE: ["license server", "drm server", "authorization"],
	PLAYER_DRM_UNSUPPORTED_SCHEME: ["drm scheme", "protection scheme", "unsupported drm"],
	PLAYER_CAST_DEVICE_NOT_FOUND: ["cast device", "no cast", "chromecast not found"],
	PLAYER_CAST_CONNECTION_FAILED: ["cast connection", "cast failed", "chromecast connection"],
	PLAYER_CAST_PLAYBACK_INTERRUPTED: ["cast interrupted", "cast playback", "cast stopped"],
	PLAYER_CAST_INVALID_SOURCE: ["cast source", "invalid cast uri", "cast url"],
	PLAYER_CAST_INVALID_MANIFEST: ["cast manifest", "invalid manifest", "cast playlist"],
	PLAYER_CAST_INVALID_METADATA: ["cast metadata", "invalid metadata", "cast info"],
	PLAYER_CAST_MESSAGE_BUILD_FAILED: ["cast message", "message build", "cast protocol"],
	PLAYER_CAST_NOT_READY: ["cast not ready", "cast unavailable", "cast disconnected"],
	PLAYER_CAST_OPERATION_FAILED: ["cast operation", "cast error", "cast failed"],
	PLAYER_AIRPLAY_NOT_AVAILABLE: ["airplay not available"],
	PLAYER_AIRPLAY_CONNECTION_FAILED: ["airplay connection failed"],
	PLAYER_AIRPLAY_PLAYBACK_FAILED: ["airplay playback failed"],
	PLAYER_AIRPLAY_MIRRORING_FAILED: ["airplay mirroring failed"],
	PLAYER_AIRPLAY_ROUTE_SELECTION_FAILED: ["airplay route selection"],
	PLAYER_AIRPLAY_INTERRUPTED: ["airplay interrupted"],
	PLAYER_AIRPLAY_UNSUPPORTED_CONTENT: ["airplay unsupported content"],
	PLAYER_UNKNOWN_999: ["unknown", "unexpected", "generic error"],

	// Permission errors
	PERMISSION_CAST_DENIED: ["permission", "denied", "unauthorized", "access denied"],

	// Storage errors
	STORAGE_ASYNC_002: ["asyncstorage write failed"],
	STORAGE_SECURE_106: ["keychain item not found", "secure storage not found"],
	STORAGE_SPACE_301: ["insufficient space", "no space", "disk full", "storage full"],
	STORAGE_UNKNOWN_999: ["unknown storage error"],

	// Download errors
	DOWNLOAD_FAILED: ["download failed", "download error", "failed to download"],
	DOWNLOAD_NO_SPACE: ["no space", "disk full", "storage full", "insufficient space"],
	DOWNLOAD_CORRUPTED: ["download corrupted", "corrupted download", "download damaged"],
	DOWNLOAD_ACCESS_FILE_NOT_FOUND: ["downloaded file not found", "download not found"],
	DOWNLOAD_ACCESS_PERMISSION_DENIED: ["download permission denied", "download access denied"],
	DOWNLOAD_ACCESS_CORRUPTED_METADATA: ["download metadata corrupted"],
	DOWNLOAD_ACCESS_EXPIRED: ["download expired", "downloaded content expired"],
	DOWNLOAD_ACCESS_INVALID_FORMAT: ["download format invalid", "downloaded format not supported"],
	DOWNLOAD_DRM_LICENSE_EXPIRED: ["download drm expired", "download license expired"],
	DOWNLOAD_DRM_LICENSE_NOT_FOUND: ["download drm not found", "download license not found"],
	DOWNLOAD_DRM_LICENSE_INVALID: ["download drm invalid", "download license invalid"],
	DOWNLOAD_DRM_DEVICE_NOT_AUTHORIZED: ["download device not authorized"],
	DOWNLOAD_DRM_MAX_DEVICES_EXCEEDED: ["download max devices exceeded"],
	DOWNLOAD_DRM_PLAYBACK_RESTRICTED: ["download playback restricted"],
	DOWNLOAD_DRM_LICENSE_SERVER_ERROR: ["download license server error"],
	DOWNLOAD_DRM_DECRYPTION_FAILED: ["download decryption failed"],

	// Device errors
	DEVICE_INSUFFICIENT_MEMORY: ["insufficient memory", "out of memory"],
	DEVICE_STORAGE_FULL: ["storage full", "disk full"],
	DEVICE_BATTERY_LOW: ["battery low", "low battery"],
};

/*
 *  Convierte OnVideoErrorData del componente nativo a PlayerError estándar
 *
 */

export function mapVideoErrorToPlayerError(errorData: OnVideoErrorData): PlayerError {
	// Si errorData ya es un PlayerError, devolverlo directamente
	if (errorData instanceof PlayerError) {
		console.log(
			"mapVideoErrorToPlayerError: errorData is already a PlayerError, returning as-is"
		);
		return errorData;
	}

	const { error, target } = errorData;

	if (!error) {
		return new PlayerError("PLAYER_UNKNOWN_999", {
			originalError: errorData,
			target,
			nativeMessage: "Error object is null or undefined",
		});
	}

	// Extraer información básica del error
	const errorCode = extractErrorCode(error);
	const errorMessage = extractErrorMessage(error);
	const platform = detectPlatform(error);

	// Determinar el tipo de error PlayerError
	const playerErrorKey = determinePlayerErrorKey(errorCode, errorMessage, error);

	// Crear contexto adicional para el error simplificado
	const context = {
		originalError: error,
		platform,
		nativeCode: errorCode,
		nativeMessage: errorMessage,
		target,
		// Información específica por plataforma
		...(platform === "android" && {
			errorString: error.errorString,
			errorException: error.errorException,
			errorStackTrace: error.errorStackTrace,
		}),
		...(platform === "ios" && {
			domain: error.domain,
			localizedDescription: error.localizedDescription,
			localizedFailureReason: error.localizedFailureReason,
			localizedRecoverySuggestion: error.localizedRecoverySuggestion,
		}),
	};

	return new PlayerError(playerErrorKey, context);
}

/*
 *  Extrae el código de error del objeto error nativo
 *
 */

function extractErrorCode(error: OnVideoErrorData["error"]): string | number | undefined {
	if (!error) {
		return undefined;
	}

	// Android: errorCode (string)
	if (error.errorCode) {
		return error.errorCode;
	}

	// iOS: code (number)
	if (error.code !== undefined) {
		return error.code;
	}

	return undefined;
}

/*
 *  Extrae el mensaje de error más descriptivo disponible
 *
 */

function extractErrorMessage(error: OnVideoErrorData["error"]): string {
	if (!error) {
		return "Unknown error occurred";
	}

	// Priorizar mensajes más descriptivos
	if (error.localizedDescription) {
		return error.localizedDescription;
	}

	if (error.localizedFailureReason) {
		return error.localizedFailureReason;
	}

	if (error.errorString) {
		return error.errorString;
	}

	if (error.error) {
		return error.error;
	}

	if (error.errorException) {
		return error.errorException;
	}

	return "Unknown error occurred";
}

/*
 *  Detecta la plataforma basándose en las propiedades del error
 *
 */

function detectPlatform(error: OnVideoErrorData["error"]): "android" | "ios" | "unknown" {
	if (!error) {
		return "unknown";
	}

	// Android tiene errorString, errorException, errorStackTrace, errorCode
	if (error.errorString || error.errorException || error.errorStackTrace || error.errorCode) {
		return "android";
	}

	// iOS tiene domain, localizedDescription, localizedFailureReason, code
	if (
		error.domain ||
		error.localizedDescription ||
		error.localizedFailureReason ||
		error.code !== undefined
	) {
		return "ios";
	}

	return "unknown";
}

/*
 *  Determina el PlayerErrorCodeKey apropiado basándose en código y mensaje
 *
 */

function determinePlayerErrorKey(
	errorCode: string | number | undefined,
	errorMessage: string,
	error: OnVideoErrorData["error"]
): PlayerErrorCodeKey {
	// 1. Mapeo directo por código de error
	if (errorCode !== undefined) {
		const mappedKey = NATIVE_ERROR_CODE_MAPPING[errorCode];
		if (mappedKey) {
			return mappedKey;
		}
	}

	// 2. Buscar por palabras clave en el mensaje
	if (errorMessage) {
		const lowerMessage = errorMessage.toLowerCase();

		for (const errorKey in ERROR_KEYWORDS) {
			const keywords = ERROR_KEYWORDS[errorKey as PlayerErrorCodeKey];
			if (keywords) {
				for (let i = 0; i < keywords.length; i++) {
					const keyword = keywords[i];
					if (keyword && lowerMessage.indexOf(keyword.toLowerCase()) !== -1) {
						return errorKey as PlayerErrorCodeKey;
					}
				}
			}
		}
	}

	// 3. Análisis específico por plataforma
	if (error && typeof error === "object") {
		// iOS: usar domain para categorización
		if (error.domain && typeof error.domain === "string") {
			if (error.domain.indexOf("AVFoundation") !== -1) {
				return "PLAYER_MEDIA_DECODE_ERROR";
			}
			if (error.domain.indexOf("NSURLError") !== -1) {
				return "NETWORK_CONNECTION_002";
			}
		}
	}

	// 4. Fallback a error genérico
	return "PLAYER_UNKNOWN_999";
}

/*
 *  Utilidad para crear PlayerError desde mensaje simple (para casos donde no hay OnVideoErrorData)
 *
 */

function createPlayerErrorFromMessage(message: string, category?: PlayerErrorCodeKey): PlayerError {
	const errorKey = category || determinePlayerErrorKey(undefined, message, {});
	return new PlayerError(errorKey, { originalMessage: message });
}

/*
 *  Utilidad para verificar si un error es de una categoría específica
 *
 */

export function isErrorOfCategory(error: PlayerError, category: PlayerErrorCodeKey): boolean {
	return error.key === category;
}

/*
 *  Utilidad para manejar errores que pueden ser PlayerError o Error genérico
 *
 */

export function handleErrorException(
	error: any,
	fallbackCategory?: PlayerErrorCodeKey
): PlayerError {
	// Si ya es PlayerError, devolverlo tal como está
	if (error instanceof PlayerError) {
		return error;
	}

	// Si es Error genérico, convertirlo a PlayerError
	if (error instanceof Error) {
		return createPlayerErrorFromMessage(error.message, fallbackCategory);
	}

	// Si es string, crear PlayerError desde message
	if (typeof error === "string") {
		return createPlayerErrorFromMessage(error, fallbackCategory);
	}

	// Si es objeto con propiedades de OnVideoErrorData, usar mapeo
	if (error && typeof error === "object" && error.error) {
		return mapVideoErrorToPlayerError(error);
	}

	// Fallback para cualquier otro tipo
	return createPlayerErrorFromMessage(
		error?.message || error?.toString() || "Unknown error occurred",
		fallbackCategory || "PLAYER_UNKNOWN_999"
	);
}
