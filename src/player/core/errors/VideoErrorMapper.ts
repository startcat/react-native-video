import type { OnVideoErrorData } from '../../../specs/VideoNativeComponent';
import { PlayerError, PlayerErrorCodeKey, PlayerErrorDetails } from './';

/*
 *  Mapeo de códigos de error nativos a PlayerErrorCodeKey
 *
 */

const NATIVE_ERROR_CODE_MAPPING: Record<string | number, PlayerErrorCodeKey> = {
    // Android ExoPlayer Error Codes
    '2001': 'MEDIA_NOT_FOUND',
    '2002': 'UNSUPPORTED_FORMAT', 
    '2003': 'NETWORK_TIMEOUT',
    '2004': 'MEDIA_CORRUPTED',
    '3001': 'DRM_KEY_ERROR',
    '3002': 'DRM_LICENSE_SERVER_UNAVAILABLE',
    '3003': 'DRM_UNSUPPORTED_SCHEME',
    '4001': 'NETWORK_OFFLINE',
    '4002': 'SERVER_UNAVAILABLE',
    
    // Android ExoPlayer IO Error Codes
    '22005': 'MEDIA_NOT_FOUND', // ERROR_CODE_IO_FILE_NOT_FOUND - Downloaded content not found
    '22000': 'NETWORK_TIMEOUT', // ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT
    '22001': 'NETWORK_OFFLINE', // ERROR_CODE_IO_NETWORK_CONNECTION_FAILED
    '22002': 'NETWORK_TIMEOUT', // ERROR_CODE_IO_READ_POSITION_OUT_OF_RANGE
    '22003': 'PERMISSION_DENIED', // ERROR_CODE_IO_NO_PERMISSION
    '22004': 'MEDIA_CORRUPTED', // ERROR_CODE_IO_CLEARTEXT_NOT_PERMITTED
    '22006': 'MEDIA_NOT_FOUND', // ERROR_CODE_IO_BAD_HTTP_STATUS
    
    // Android ExoPlayer Parsing Error Codes
    '23000': 'MEDIA_CORRUPTED', // ERROR_CODE_PARSING_CONTAINER_MALFORMED
    '23001': 'UNSUPPORTED_FORMAT', // ERROR_CODE_PARSING_MANIFEST_MALFORMED
    '23002': 'UNSUPPORTED_FORMAT', // ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED
    '23003': 'UNSUPPORTED_FORMAT', // ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED
    
    // Android ExoPlayer Decoder Error Codes
    '24000': 'MEDIA_CORRUPTED', // ERROR_CODE_DECODER_INIT_FAILED
    '24001': 'MEDIA_CORRUPTED', // ERROR_CODE_DECODER_QUERY_FAILED
    '24002': 'UNSUPPORTED_FORMAT', // ERROR_CODE_DECODING_FAILED
    '24003': 'UNSUPPORTED_FORMAT', // ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES
    '24004': 'UNSUPPORTED_FORMAT', // ERROR_CODE_DECODING_FORMAT_UNSUPPORTED
    
    // Android ExoPlayer Audio Error Codes
    '25000': 'UNSUPPORTED_FORMAT', // ERROR_CODE_AUDIO_TRACK_INIT_FAILED
    '25001': 'UNSUPPORTED_FORMAT', // ERROR_CODE_AUDIO_TRACK_WRITE_FAILED
    
    // Android ExoPlayer DRM Error Codes
    '26000': 'DRM_KEY_ERROR', // ERROR_CODE_DRM_UNSPECIFIED
    '26001': 'DRM_UNSUPPORTED_SCHEME', // ERROR_CODE_DRM_SCHEME_UNSUPPORTED
    '26002': 'DRM_KEY_ERROR', // ERROR_CODE_DRM_PROVISIONING_FAILED
    '26003': 'DRM_KEY_ERROR', // ERROR_CODE_DRM_CONTENT_ERROR
    '26004': 'DRM_LICENSE_SERVER_UNAVAILABLE', // ERROR_CODE_DRM_LICENSE_ACQUISITION_FAILED
    '26005': 'DRM_KEY_ERROR', // ERROR_CODE_DRM_DISALLOWED_OPERATION
    '26006': 'DRM_KEY_ERROR', // ERROR_CODE_DRM_SYSTEM_ERROR
    '26007': 'LICENSE_DEVICE_LIMIT_REACHED', // ERROR_CODE_DRM_DEVICE_REVOKED
    
    // iOS AVPlayer Error Codes
    '-11800': 'UNKNOWN_ERROR', // AVErrorUnknown
    '-11801': 'UNKNOWN_ERROR', // AVErrorOutOfMemory
    '-11803': 'OPERATION_ABORTED', // AVErrorSessionNotRunning
    '-11804': 'PERMISSION_DENIED', // AVErrorDeviceAlreadyUsedByAnotherSession
    '-11805': 'MEDIA_NOT_FOUND', // AVErrorNoDataCaptured
    '-11806': 'OPERATION_ABORTED', // AVErrorSessionConfigurationChanged
    '-11807': 'DOWNLOAD_NO_SPACE', // AVErrorDiskFull
    '-11808': 'PERMISSION_DENIED', // AVErrorDeviceWasDisconnected
    '-11809': 'MEDIA_CORRUPTED', // AVErrorMediaChanged
    '-11810': 'OPERATION_ABORTED', // AVErrorMaximumDurationReached
    '-11811': 'DOWNLOAD_NO_SPACE', // AVErrorMaximumFileSizeReached
    '-11812': 'NETWORK_TIMEOUT', // AVErrorMediaDiscontinuity
    '-11813': 'MEDIA_CORRUPTED', // AVErrorMaximumNumberOfSamplesForFileFormatReached
    '-11814': 'PERMISSION_DENIED', // AVErrorDeviceNotConnected
    '-11815': 'PERMISSION_DENIED', // AVErrorDeviceInUseByAnotherApplication
    '-11817': 'PERMISSION_DENIED', // AVErrorDeviceLockedForConfigurationByAnotherProcess
    '-11818': 'OPERATION_ABORTED', // AVErrorSessionWasInterrupted
    '-11819': 'MEDIA_CORRUPTED', // AVErrorMediaServicesWereReset
    '-11820': 'MEDIA_CORRUPTED', // AVErrorExportFailed
    '-11821': 'MEDIA_CORRUPTED', // AVErrorDecodeFailed
    '-11822': 'UNSUPPORTED_FORMAT', // AVErrorInvalidSourceMedia
    '-11823': 'MEDIA_NOT_FOUND', // AVErrorFileAlreadyExists
    '-11824': 'MEDIA_CORRUPTED', // AVErrorCompositionTrackSegmentsNotContiguous
    '-11825': 'MEDIA_CORRUPTED', // AVErrorInvalidCompositionTrackSegmentDuration
    '-11826': 'MEDIA_CORRUPTED', // AVErrorInvalidCompositionTrackSegmentSourceStartTime
    '-11827': 'MEDIA_CORRUPTED', // AVErrorInvalidCompositionTrackSegmentSourceDuration
    '-11828': 'UNSUPPORTED_FORMAT', // AVErrorFileFormatNotRecognized
    '-11829': 'MEDIA_CORRUPTED', // AVErrorFileFailedToParse
    '-11830': 'OPERATION_ABORTED', // AVErrorMaximumStillImageCaptureRequestsExceeded
    '-11831': 'DRM_KEY_ERROR', // AVErrorContentIsProtected
    '-11832': 'MEDIA_NOT_FOUND', // AVErrorNoImageAtTime
    '-11833': 'UNSUPPORTED_FORMAT', // AVErrorDecoderNotFound
    '-11834': 'UNSUPPORTED_FORMAT', // AVErrorEncoderNotFound
    '-11835': 'DRM_LICENSE_SERVER_UNAVAILABLE', // AVErrorContentIsNotAuthorized
    '-11836': 'PERMISSION_DENIED', // AVErrorApplicationIsNotAuthorized
    '-11837': 'PERMISSION_DENIED', // AVErrorDeviceIsNotAvailableInBackground
    '-11838': 'UNSUPPORTED_FORMAT', // AVErrorOperationNotSupportedForAsset
    '-11839': 'UNSUPPORTED_FORMAT', // AVErrorDecoderTemporarilyUnavailable
    '-11840': 'UNSUPPORTED_FORMAT', // AVErrorEncoderTemporarilyUnavailable
    '-11841': 'MEDIA_CORRUPTED', // AVErrorInvalidVideoComposition
    '-11842': 'PERMISSION_DENIED', // AVErrorReferenceForbiddenByReferencePolicy
    '-11843': 'UNSUPPORTED_FORMAT', // AVErrorInvalidOutputURLPathExtension
    '-11844': 'PERMISSION_DENIED', // AVErrorScreenCaptureFailed
    '-11845': 'PERMISSION_DENIED', // AVErrorDisplayWasDisabled
    '-11846': 'PERMISSION_DENIED', // AVErrorTorchLevelUnavailable
    '-11847': 'OPERATION_ABORTED', // AVErrorOperationInterrupted
    '-11848': 'UNSUPPORTED_FORMAT', // AVErrorIncompatibleAsset
    '-11849': 'MEDIA_CORRUPTED', // AVErrorFailedToLoadMediaData
    '-11850': 'SERVER_UNAVAILABLE', // AVErrorServerIncorrectlyConfigured
    '-11852': 'PERMISSION_DENIED', // AVErrorApplicationIsNotAuthorizedToUseDevice
    '-11853': 'MEDIA_CORRUPTED', // AVErrorFailedToParse
    '-11854': 'UNSUPPORTED_FORMAT', // AVErrorFileTypeDoesNotSupportSampleReferences
    '-11855': 'MEDIA_CORRUPTED', // AVErrorUndecodableMediaData
    '-11856': 'NETWORK_OFFLINE', // AVErrorAirPlayControllerRequiresInternet
    '-11857': 'NETWORK_OFFLINE', // AVErrorAirPlayReceiverRequiresInternet
    '-11858': 'MEDIA_CORRUPTED', // AVErrorVideoCompositorFailed
    '-11859': 'OPERATION_ABORTED', // AVErrorRecordingAlreadyInProgress
    '-1009': 'NETWORK_OFFLINE', // NSURLErrorNotConnectedToInternet
    '-1001': 'NETWORK_TIMEOUT', // NSURLErrorTimedOut
    
    // Códigos HTTP comunes
    '400': 'MEDIA_NOT_FOUND',
    '401': 'PERMISSION_DENIED',
    '403': 'PERMISSION_DENIED',
    '404': 'MEDIA_NOT_FOUND',
    '408': 'NETWORK_TIMEOUT',
    '415': 'UNSUPPORTED_FORMAT',
    '500': 'SERVER_UNAVAILABLE',
    '503': 'SERVER_UNAVAILABLE',
};

/*
 *  Palabras clave para categorización automática de errores
 *
 */

const ERROR_KEYWORDS: Record<PlayerErrorCodeKey, string[]> = {
    'NETWORK_TIMEOUT': ['timeout', 'timed out', 'connection timeout'],
    'NETWORK_OFFLINE': ['offline', 'no internet', 'network unavailable', 'not connected'],
    'SERVER_UNAVAILABLE': ['server', 'unavailable', '5xx', 'internal error'],
    'MEDIA_NOT_FOUND': ['not found', '404', 'file not found', 'resource not found', 'ENOENT', 'FileNotFoundException', 'No such file or directory', 'bad http status'],
    'UNSUPPORTED_FORMAT': ['unsupported', 'format', 'codec', 'mime type'],
    'MEDIA_CORRUPTED': ['corrupted', 'invalid', 'malformed', 'damaged'],
    'DRM_KEY_ERROR': ['drm', 'key', 'license', 'protected', 'encrypted'],
    'DRM_LICENSE_SERVER_UNAVAILABLE': ['license server', 'drm server', 'authorization'],
    'DRM_UNSUPPORTED_SCHEME': ['drm scheme', 'protection scheme', 'unsupported drm'],
    'PERMISSION_DENIED': ['permission', 'denied', 'unauthorized', '401', '403'],
    'MICROPHONE_ACCESS_DENIED': ['microphone', 'mic', 'audio permission', 'microphone denied'],
    'CAMERA_ACCESS_DENIED': ['camera', 'video permission', 'camera denied'],
    'LICENSE_EXPIRED': ['license expired', 'expired', 'license invalid'],
    'LICENSE_NOT_FOUND': ['license not found', 'no license', 'missing license'],
    'LICENSE_DEVICE_LIMIT_REACHED': ['device limit', 'too many devices', 'limit reached'],
    'CAST_DEVICE_NOT_FOUND': ['cast device', 'no cast', 'chromecast not found'],
    'CAST_CONNECTION_FAILED': ['cast connection', 'cast failed', 'chromecast connection'],
    'CAST_PLAYBACK_INTERRUPTED': ['cast interrupted', 'cast playback', 'cast stopped'],
    'CAST_INVALID_SOURCE': ['cast source', 'invalid cast uri', 'cast url'],
    'CAST_INVALID_MANIFEST': ['cast manifest', 'invalid manifest', 'cast playlist'],
    'CAST_INVALID_METADATA': ['cast metadata', 'invalid metadata', 'cast info'],
    'CAST_MESSAGE_BUILD_FAILED': ['cast message', 'message build', 'cast protocol'],
    'CAST_NOT_READY': ['cast not ready', 'cast unavailable', 'cast disconnected'],
    'CAST_OPERATION_FAILED': ['cast operation', 'cast error', 'cast failed'],
    'DOWNLOAD_FAILED': ['download failed', 'download error', 'failed to download'],
    'DOWNLOAD_NO_SPACE': ['no space', 'disk full', 'storage full', 'insufficient space'],
    'DOWNLOAD_CORRUPTED': ['download corrupted', 'corrupted download', 'download damaged'],
    'UNKNOWN_ERROR': ['unknown', 'unexpected', 'generic error'],
    'OPERATION_ABORTED': ['aborted', 'cancelled', 'stopped', 'interrupted'],
};

/*
 *  Convierte OnVideoErrorData del componente nativo a PlayerError estándar
 *
 */

export function mapVideoErrorToPlayerError(errorData: OnVideoErrorData): PlayerError {

    // Si errorData ya es un PlayerError, devolverlo directamente
    if (errorData instanceof PlayerError) {
        console.log('mapVideoErrorToPlayerError: errorData is already a PlayerError, returning as-is');
        return errorData;
    }

    const { error, target } = errorData;

    if (!error){
        return new PlayerError('UNKNOWN_ERROR', { 
            originalError: errorData,
            target,
            nativeMessage: 'Error object is null or undefined'
        });
    }
    
    // Extraer información básica del error
    const errorCode = extractErrorCode(error);
    const errorMessage = extractErrorMessage(error);
    const platform = detectPlatform(error);
    
    // Determinar el tipo de error PlayerError
    const playerErrorKey = determinePlayerErrorKey(errorCode, errorMessage, error);
    
    // Crear detalles adicionales
    const details: PlayerErrorDetails = {
        originalError: error,
        platform,
        nativeCode: errorCode,
        nativeMessage: errorMessage,
        target,
        // Información específica por plataforma
        ...(platform === 'android' && {
            errorString: error.errorString,
            errorException: error.errorException,
            errorStackTrace: error.errorStackTrace,
        }),
        ...(platform === 'ios' && {
            domain: error.domain,
            localizedDescription: error.localizedDescription,
            localizedFailureReason: error.localizedFailureReason,
            localizedRecoverySuggestion: error.localizedRecoverySuggestion,
        }),
    };
    
    return new PlayerError(playerErrorKey, details);
}

/*
 *  Extrae el código de error del objeto error nativo
 *
 */

function extractErrorCode(error: OnVideoErrorData['error']): string | number | undefined {
    if (!error) return undefined;

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

function extractErrorMessage(error: OnVideoErrorData['error']): string {
    if (!error) return 'Unknown error occurred';

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
    
    return 'Unknown error occurred';
}

/*
 *  Detecta la plataforma basándose en las propiedades del error
 *
 */

function detectPlatform(error: OnVideoErrorData['error']): 'android' | 'ios' | 'unknown' {
    if (!error) return 'unknown';

    // Android tiene errorString, errorException, errorStackTrace, errorCode
    if (error.errorString || error.errorException || error.errorStackTrace || error.errorCode) {
        return 'android';
    }
    
    // iOS tiene domain, localizedDescription, localizedFailureReason, code
    if (error.domain || error.localizedDescription || error.localizedFailureReason || error.code !== undefined) {
        return 'ios';
    }
    
    return 'unknown';
}

/*
 *  Determina el PlayerErrorCodeKey apropiado basándose en código y mensaje
 *
 */

function determinePlayerErrorKey(
    errorCode: string | number | undefined,
    errorMessage: string,
    error: OnVideoErrorData['error']
): PlayerErrorCodeKey {
    // 1. Mapeo directo por código de error
    if (errorCode !== undefined) {
        const mappedKey = NATIVE_ERROR_CODE_MAPPING[errorCode];
        if (mappedKey) {
            return mappedKey;
        }
    }
    
    // 2. Análisis por palabras clave en el mensaje
    const lowerMessage = errorMessage.toLowerCase();
    
    for (const [errorKey, keywords] of Object.entries(ERROR_KEYWORDS)) {
        for (const keyword of keywords) {
            if (lowerMessage.includes(keyword.toLowerCase())) {
                return errorKey as PlayerErrorCodeKey;
            }
        }
    }
    
    // 3. Análisis específico por dominio (iOS)
    if (error.domain) {
        if (error.domain.includes('AVFoundation')) {
            return 'MEDIA_CORRUPTED';
        }
        if (error.domain.includes('NSURLError')) {
            return 'NETWORK_TIMEOUT';
        }
    }
    
    // 4. Fallback a error genérico
    return 'UNKNOWN_ERROR';
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
 *  Utilidad para verificar si un error es recuperable
 *
 */

export function isRecoverableError(error: PlayerError): boolean {
    const recoverableErrors: PlayerErrorCodeKey[] = [
        'NETWORK_TIMEOUT',
        'NETWORK_OFFLINE', 
        'SERVER_UNAVAILABLE',
    ];
    
    return recoverableErrors.includes(error.key);
}

/*
 *  Utilidad para manejar errores que pueden ser PlayerError o Error genérico
 *
 */

export function handleErrorException(error: any, fallbackCategory?: PlayerErrorCodeKey): PlayerError {
    // Si ya es PlayerError, devolverlo tal como está
    if (error instanceof PlayerError) {
        return error;
    }
    
    // Si es Error genérico, convertirlo a PlayerError
    if (error instanceof Error) {
        return createPlayerErrorFromMessage(error.message, fallbackCategory);
    }
    
    // Si es string, crear PlayerError desde message
    if (typeof error === 'string') {
        return createPlayerErrorFromMessage(error, fallbackCategory);
    }
    
    // Si es objeto con propiedades de OnVideoErrorData, usar mapeo
    if (error && typeof error === 'object' && error.error) {
        return mapVideoErrorToPlayerError(error);
    }
    
    // Fallback para cualquier otro tipo
    return createPlayerErrorFromMessage(
        error?.message || error?.toString() || 'Unknown error occurred',
        fallbackCategory || 'UNKNOWN_ERROR'
    );
}