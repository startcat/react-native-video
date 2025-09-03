/*
 *  Handler específico para eventos de errores
 *
 */

import { PlayerAnalyticsEvents } from '../../../features/analytics';


import type { PlayerError } from '../../../core/errors';

export class ErrorEventsHandler {
    private analyticsEvents: PlayerAnalyticsEvents;

    constructor(analyticsEvents: PlayerAnalyticsEvents) {
        this.analyticsEvents = analyticsEvents;
    }

    handleError = (error: PlayerError) => {
        const errorType = this.categorizeError(error);
        
        switch (errorType) {
            case 'network':
                this.analyticsEvents.onNetworkError({
                    errorCode: error.code,
                    errorMessage: error.message,
                    errorType: 'network',
                    isFatal: this.isErrorFatal(error),
                    statusCode: this.extractStatusCode(error),
                    url: this.extractUrl(error)
                });
                break;

            case 'drm':
                this.analyticsEvents.onContentProtectionError({
                    errorCode: error.code,
                    errorMessage: error.message,
                    errorType: 'drm',
                    isFatal: this.isErrorFatal(error),
                    drmType: this.extractDrmType(error)
                });
                break;

            case 'stream':
                this.analyticsEvents.onStreamError({
                    errorCode: error.code,
                    errorMessage: error.message,
                    errorType: 'playback',
                    isFatal: this.isErrorFatal(error),
                    streamUrl: this.extractStreamUrl(error),
                    bitrate: this.extractBitrate(error)
                });
                break;

            default:
                this.analyticsEvents.onError({
                    errorCode: error.code,
                    errorMessage: error.message,
                    errorType: 'other',
                    isFatal: this.isErrorFatal(error)
                });
        }
    };

    private categorizeError = (error: any): 'network' | 'drm' | 'stream' | 'other' => {
        
        // Usar la categoría del PlayerError directamente
        switch (error.category) {
            case 'CONNECTION':
                return 'network';
            case 'DRM':
            case 'LICENSE':
                return 'drm';
            case 'MEDIA':
                return 'stream';
            default:
                return 'other';
        }

    };

    private isErrorFatal = (error: PlayerError): boolean => {
        // Errores fatales basados en categoría y código
        const fatalCategories = ['DRM', 'LICENSE', 'PERMISSIONS'];
        const fatalCodes = [404, 401, 403, 415]; // MEDIA_NOT_FOUND, PERMISSION_DENIED, UNSUPPORTED_FORMAT
        
        return fatalCategories.includes(error.category) || fatalCodes.includes(error.code);
    };

    private extractStatusCode = (error: PlayerError): number | undefined => {
        // Extraer código de estado HTTP desde details
        return error.details?.statusCode || error.details?.httpStatusCode;
    };

    private extractUrl = (error: PlayerError): string | undefined => {
        // Extraer URL desde details
        return error.details?.url || error.details?.requestUrl;
    };

    private extractDrmType = (error: PlayerError): string | undefined => {
        // Extraer tipo de DRM desde details
        return error.details?.drmType || error.details?.licenseType;
    };

    private extractStreamUrl = (error: PlayerError): string | undefined => {
        // Extraer URL del stream desde details
        return error.details?.streamUrl || error.details?.manifestUrl;
    };

    private extractBitrate = (error: PlayerError): number | undefined => {
        // Extraer bitrate desde details
        return error.details?.bitrate;
    };

}