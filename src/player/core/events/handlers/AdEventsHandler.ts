/*
 *  Handler específico para eventos de anuncios
 *
 */

import { PlayerError } from '../../../core/errors';
import { PlayerAnalyticsEvents } from '../../../features/analytics';

import type {
    OnReceiveAdEventData
} from '../../../../types/events';

export class AdEventsHandler {
    private analyticsEvents: PlayerAnalyticsEvents;
    private currentAdId?: string;
    private currentAdBreakId?: string;
    private adStartTime?: number;
    private isAdPlaying = false;

    constructor(analyticsEvents: PlayerAnalyticsEvents) {
        this.analyticsEvents = analyticsEvents;
    }

    handleAdEvent = (data: OnReceiveAdEventData) => {

        try {
            switch (data.event) {
                case 'STARTED':
                    this.handleAdStarted(data);
                    break;
                    
                case 'COMPLETED':
                    this.handleAdCompleted();
                    break;
                    
                case 'SKIPPED':
                    this.handleAdSkipped();
                    break;
                    
                case 'PAUSED':
                    this.handleAdPaused();
                    break;
                    
                case 'RESUMED':
                    this.handleAdResumed();
                    break;
                    
                case 'ERROR':
                    this.handleAdError();
                    break;
                    
                case 'AD_BREAK_STARTED':
                    this.handleAdBreakStarted(data);
                    break;
                    
                case 'AD_BREAK_ENDED':
                    this.handleAdBreakEnded();
                    break;
                    
                case 'ALL_ADS_COMPLETED':
                    this.handleAllAdsCompleted();
                    break;
                    
                case 'CONTENT_PAUSE_REQUESTED':
                    // El contenido debe pausarse para mostrar un anuncio
                    break;
                    
                case 'CONTENT_RESUME_REQUESTED':
                    this.handleContentResumeRequested();
                    break;
                    
                case 'FIRST_QUARTILE':
                case 'MIDPOINT':
                case 'THIRD_QUARTILE':
                    this.handleAdProgress(data);
                    break;
                    
                case 'CLICK':
                case 'TAPPED':
                    this.handleAdClick(data);
                    break;
                    
                case 'LOADED':
                    this.handleAdLoaded(data);
                    break;
                    
                case 'IMPRESSION':
                    this.handleAdImpression(data);
                    break;
                    
                default:
                    console.log(`[AdEventsHandler] Unhandled ad event: ${data.event}`);
                    throw new PlayerError('PLAYER_AD_EVENT_PROCESSING_ERROR', {
                        event: data.event,
                    });
            }
        } catch(error) {
            throw error;
        }

    };

    private handleAdStarted = (data: OnReceiveAdEventData) => {
        this.isAdPlaying = true;
        this.adStartTime = Date.now();
        this.currentAdId = this.extractAdId(data);
        
        this.analyticsEvents.onAdBegin({
            adId: this.currentAdId,
            adDuration: this.extractAdDuration(data),
            adPosition: this.extractAdPosition(data),
            adType: this.extractAdType(data)
        });
    };

    private handleAdCompleted = () => {
        this.analyticsEvents.onAdEnd({
            adId: this.currentAdId,
            completed: true
        });
        
        this.isAdPlaying = false;
        this.currentAdId = undefined;
        this.adStartTime = undefined;
    };

    private handleAdSkipped = () => {
        const skipPosition = this.adStartTime ? Date.now() - this.adStartTime : undefined;
        
        this.analyticsEvents.onAdSkip({
            adId: this.currentAdId,
            skipPosition
        });
        
        this.analyticsEvents.onAdEnd({
            adId: this.currentAdId,
            completed: false
        });
        
        this.isAdPlaying = false;
        this.currentAdId = undefined;
        this.adStartTime = undefined;
    };

    private handleAdPaused = () => {
        this.analyticsEvents.onAdPause({
            adId: this.currentAdId
        });
    };

    private handleAdResumed = () => {
        this.analyticsEvents.onAdResume({
            adId: this.currentAdId
        });
    };

    private handleAdError = () => {
        this.analyticsEvents.onAdEnd({
            adId: this.currentAdId,
            completed: false
        });
        
        this.isAdPlaying = false;
        this.currentAdId = undefined;
        this.adStartTime = undefined;
    };

    private handleAdBreakStarted = (data: OnReceiveAdEventData) => {
        this.currentAdBreakId = this.extractAdBreakId(data);
        
        this.analyticsEvents.onAdBreakBegin({
            adBreakId: this.currentAdBreakId,
            adCount: this.extractAdCount(data),
            adBreakPosition: this.extractAdBreakPosition(data)
        });
    };

    private handleAdBreakEnded = () => {
        this.analyticsEvents.onAdBreakEnd({
            adBreakId: this.currentAdBreakId
        });
        
        this.currentAdBreakId = undefined;
    };

    private handleAllAdsCompleted = () => {
        if (this.currentAdBreakId) {
            this.analyticsEvents.onAdBreakEnd({
                adBreakId: this.currentAdBreakId
            });
        }
        
        this.currentAdBreakId = undefined;
        this.isAdPlaying = false;
    };

    private handleContentResumeRequested = () => {
        this.analyticsEvents.onContentResume();
    };

    private handleAdProgress = (data: OnReceiveAdEventData) => {
        // Los eventos de progreso del anuncio se pueden usar para analíticas específicas
        console.log(`[AdEventsHandler] Ad progress: ${data.event}`);
    };

    private handleAdClick = (data: OnReceiveAdEventData) => {
        console.log(`[AdEventsHandler] Ad clicked: ${data.event}`);
    };

    private handleAdLoaded = (data: OnReceiveAdEventData) => {
        console.log(`[AdEventsHandler] Ad loaded: ${data.event}`);
    };

    private handleAdImpression = (data: OnReceiveAdEventData) => {
        console.log(`[AdEventsHandler] Ad impression: ${data.event}`);
    };

    /*
     * Métodos de utilidad para extraer datos del evento
     *
     */

    private extractAdId = (data: OnReceiveAdEventData): string => {
        return (data.data as any)?.adId || `ad_${Date.now()}`;
    };

    private extractAdDuration = (data: OnReceiveAdEventData): number | undefined => {
        return (data.data as any)?.duration ? (data.data as any).duration * 1000 : undefined;
    };

    private extractAdPosition = (data: OnReceiveAdEventData): number | undefined => {
        return (data.data as any)?.position ? (data.data as any).position * 1000 : undefined;
    };

    private extractAdType = (data: OnReceiveAdEventData): 'preroll' | 'midroll' | 'postroll' | undefined => {
        const position = (data.data as any)?.position;
        if (position === 0) return 'preroll';
        if (position === -1) return 'postroll';
        return 'midroll';
    };

    private extractAdBreakId = (data: OnReceiveAdEventData): string => {
        return (data.data as any)?.adBreakId || `adbreak_${Date.now()}`;
    };

    private extractAdCount = (data: OnReceiveAdEventData): number | undefined => {
        return (data.data as any)?.adCount;
    };

    private extractAdBreakPosition = (data: OnReceiveAdEventData): number | undefined => {
        return (data.data as any)?.adBreakPosition ? (data.data as any).adBreakPosition * 1000 : undefined;
    };

    /*
     * Getters
     *
     */

    getIsAdPlaying = () => this.isAdPlaying;
    getCurrentAdId = () => this.currentAdId;
    getCurrentAdBreakId = () => this.currentAdBreakId;

}