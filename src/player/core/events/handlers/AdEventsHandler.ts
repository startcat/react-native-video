/*
 *  Handler específico para eventos de anuncios
 *
 */

import { PlayerAnalyticsEvents } from "@overon/react-native-overon-player-analytics-plugins";

import type { OnReceiveAdEventData } from "../../../../types/events";

// Cadencia mínima entre ticks de onAdProgress emitidos a los plugins (ms).
// Compensa la diferencia entre iOS (~4/s) y Android (~5-10/s) y se alinea con
// la cadencia natural de onProgress del contenido en este repo.
const AD_PROGRESS_THROTTLE_MS = 250;

export class AdEventsHandler {
	private analyticsEvents: PlayerAnalyticsEvents;
	private currentAdId?: string;
	private currentAdBreakId?: string;
	private adStartTime?: number;
	private isAdPlaying = false;
	private isAdPaused = false;
	private lastAdProgressTickTs = 0;
	private currentAdDurationMs?: number;
	private currentAdType?: "preroll" | "midroll" | "postroll";

	constructor(analyticsEvents: PlayerAnalyticsEvents) {
		this.analyticsEvents = analyticsEvents;
	}

	handleAdEvent = (data: OnReceiveAdEventData) => {
		switch (data.event) {
			case "STARTED":
				this.handleAdStarted(data);
				break;

			case "COMPLETED":
				this.handleAdCompleted();
				break;

			case "SKIPPED":
				this.handleAdSkipped();
				break;

			case "PAUSED":
				this.handleAdPaused();
				break;

			case "RESUMED":
				this.handleAdResumed();
				break;

			case "ERROR":
				this.handleAdError();
				break;

			case "AD_BREAK_STARTED":
				this.handleAdBreakStarted(data);
				break;

			case "AD_BREAK_ENDED":
				this.handleAdBreakEnded();
				break;

			case "ALL_ADS_COMPLETED":
				this.handleAllAdsCompleted();
				break;

			case "CONTENT_PAUSE_REQUESTED":
				// El contenido debe pausarse para mostrar un anuncio
				break;

			case "CONTENT_RESUME_REQUESTED":
				this.handleContentResumeRequested();
				break;

			case "FIRST_QUARTILE":
			case "MIDPOINT":
			case "THIRD_QUARTILE":
			case "AD_PROGRESS":
				this.handleAdProgress(data);
				break;

			case "CLICK":
			case "TAPPED":
				this.handleAdClick(data);
				break;

			case "LOADED":
				this.handleAdLoaded(data);
				break;

			case "IMPRESSION":
				this.handleAdImpression(data);
				break;

			// Android-only eventos informativos que no requieren acción
			case "AD_BUFFERING":
			case "AD_CAN_PLAY":
			case "AD_METADATA":
			case "DURATION_CHANGE":
			case "INTERACTION":
			case "LINEAR_CHANGED":
			case "LOG":
			case "SKIPPABLE_STATE_CHANGED":
			case "USER_CLOSE":
			case "VIDEO_CLICKED":
			case "VIDEO_ICON_CLICKED":
			case "VOLUME_CHANGED":
			case "VOLUME_MUTED":
			// iOS-only eventos informativos
			// eslint-disable-next-line no-fallthrough
			case "AD_PERIOD_ENDED":
			case "AD_PERIOD_STARTED":
			case "AD_BREAK_READY":
			case "CUEPOINTS_CHANGED":
			case "STREAM_LOADED":
			case "UNKNOWN":
				// Eventos informativos - no requieren acción, solo log en debug
				break;

			default:
				// Solo log warning para eventos desconocidos, no lanzar error
				console.warn(`[AdEventsHandler] Unknown ad event: ${data.event}`);
		}
	};

	private handleAdStarted = (data: OnReceiveAdEventData) => {
		this.isAdPlaying = true;
		this.isAdPaused = false;
		this.adStartTime = Date.now();
		this.lastAdProgressTickTs = 0;
		this.currentAdId = this.extractAdId(data);
		this.currentAdDurationMs = this.extractAdDuration(data);
		this.currentAdType = this.extractAdType(data);

		this.analyticsEvents.onAdBegin({
			adId: this.currentAdId,
			adDuration: this.currentAdDurationMs,
			adPosition: this.extractAdPosition(data),
			adType: this.currentAdType,
		});
	};

	private handleAdCompleted = () => {
		this.analyticsEvents.onAdEnd({
			adId: this.currentAdId,
			completed: true,
		});

		this.resetAdState();
	};

	private handleAdSkipped = () => {
		const skipPosition = this.adStartTime ? Date.now() - this.adStartTime : undefined;

		this.analyticsEvents.onAdSkip({
			adId: this.currentAdId,
			skipPosition,
		});

		this.analyticsEvents.onAdEnd({
			adId: this.currentAdId,
			completed: false,
		});

		this.resetAdState();
	};

	private handleAdPaused = () => {
		this.isAdPaused = true;
		this.analyticsEvents.onAdPause({
			adId: this.currentAdId,
		});
	};

	private handleAdResumed = () => {
		this.isAdPaused = false;
		this.analyticsEvents.onAdResume({
			adId: this.currentAdId,
		});
	};

	private handleAdError = () => {
		this.analyticsEvents.onAdEnd({
			adId: this.currentAdId,
			completed: false,
		});

		this.resetAdState();
	};

	private resetAdState = () => {
		this.isAdPlaying = false;
		this.isAdPaused = false;
		this.currentAdId = undefined;
		this.adStartTime = undefined;
		this.lastAdProgressTickTs = 0;
		this.currentAdDurationMs = undefined;
		this.currentAdType = undefined;
	};

	private handleAdBreakStarted = (data: OnReceiveAdEventData) => {
		this.currentAdBreakId = this.extractAdBreakId(data);

		this.analyticsEvents.onAdBreakBegin({
			adBreakId: this.currentAdBreakId,
			adCount: this.extractAdCount(data),
			adBreakPosition: this.extractAdBreakPosition(data),
		});
	};

	private handleAdBreakEnded = () => {
		this.analyticsEvents.onAdBreakEnd({
			adBreakId: this.currentAdBreakId,
		});

		this.currentAdBreakId = undefined;
		// Fix: el flag isAdPlaying se quedaba colgado si AD_BREAK_ENDED llegaba
		// sin un COMPLETED previo (caso conocido en streams DAI/SSAI). Asegurar
		// reset aquí para que el gate del adapter se libere correctamente.
		this.resetAdState();
	};

	private handleAllAdsCompleted = () => {
		if (this.currentAdBreakId) {
			this.analyticsEvents.onAdBreakEnd({
				adBreakId: this.currentAdBreakId,
			});
		}

		this.currentAdBreakId = undefined;
		this.resetAdState();
	};

	private handleContentResumeRequested = () => {
		this.analyticsEvents.onContentResume();
	};

	private handleAdProgress = (data: OnReceiveAdEventData) => {
		// Quartiles: log informativo, no emisión propia (los plugins ya tienen
		// resolución sub-quartil vía onAdProgress).
		if (data.event !== "AD_PROGRESS") {
			console.log(`[AdEventsHandler] Ad progress: ${data.event}`);
			return;
		}

		// Suspender la emisión durante pausas del anuncio. El plugin tiene
		// onAdPause/onAdResume para medir pausa; onAdProgress significa
		// "el reloj del anuncio avanzó".
		if (this.isAdPaused) {
			return;
		}

		// Throttle: garantizar al menos AD_PROGRESS_THROTTLE_MS entre emisiones,
		// independientemente de la cadencia nativa (iOS ~4/s, Android ~5-10/s).
		const now = Date.now();
		if (now - this.lastAdProgressTickTs < AD_PROGRESS_THROTTLE_MS) {
			return;
		}
		this.lastAdProgressTickTs = now;

		const positionMs = this.extractAdProgressPositionMs(data);
		const durationMs = this.extractAdProgressDurationMs(data);

		// Sin duración no podemos calcular percentageWatched de forma estable;
		// emitimos igualmente el evento con duration=0 para que el plugin
		// reciba el tick. percentageWatched queda en 0.
		const percentageWatched =
			durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0;

		this.analyticsEvents.onAdProgress({
			adId: this.currentAdId,
			adBreakId: this.currentAdBreakId,
			adType: this.currentAdType,
			position: positionMs,
			duration: durationMs,
			percentageWatched,
		});
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

	private extractAdType = (
		data: OnReceiveAdEventData
	): "preroll" | "midroll" | "postroll" | undefined => {
		const position = (data.data as any)?.position;
		if (position === 0) {
			return "preroll";
		}
		if (position === -1) {
			return "postroll";
		}
		return "midroll";
	};

	private extractAdBreakId = (data: OnReceiveAdEventData): string => {
		return (data.data as any)?.adBreakId || `adbreak_${Date.now()}`;
	};

	private extractAdCount = (data: OnReceiveAdEventData): number | undefined => {
		return (data.data as any)?.adCount;
	};

	private extractAdBreakPosition = (data: OnReceiveAdEventData): number | undefined => {
		return (data.data as any)?.adBreakPosition
			? (data.data as any).adBreakPosition * 1000
			: undefined;
	};

	/*
	 * Extractors específicos del payload de AD_PROGRESS.
	 *
	 * iOS (RCTIMAAdsManager.swift, delegate adDidProgressToTime:totalTime:):
	 *   { currentTime: number (seconds), duration: number (seconds) }
	 *
	 * Android (ReactExoplayerView.java, onAdEvent AD_PROGRESS):
	 *   { position: string (ms), duration: string (ms) }
	 *
	 * Si el payload nativo no trae los campos (versión antigua de la lib o
	 * fallo del IMA SDK), fallback al timer wallclock + duration cacheada de
	 * STARTED para no perder la emisión.
	 */

	private extractAdProgressPositionMs = (data: OnReceiveAdEventData): number => {
		const raw = data.data as any;
		// iOS: currentTime en segundos (TimeInterval).
		if (typeof raw?.currentTime === "number") {
			return Math.round(raw.currentTime * 1000);
		}
		// Android: position en ms como string.
		if (raw?.position !== undefined) {
			const parsed = Number(raw.position);
			if (Number.isFinite(parsed)) {
				return Math.max(0, Math.round(parsed));
			}
		}
		// Fallback: estimación por wallclock desde STARTED.
		return this.adStartTime ? Date.now() - this.adStartTime : 0;
	};

	private extractAdProgressDurationMs = (data: OnReceiveAdEventData): number => {
		const raw = data.data as any;
		const rawDuration = raw?.duration;
		if (typeof rawDuration === "number") {
			// iOS: duration en segundos.
			return Math.round(rawDuration * 1000);
		}
		if (rawDuration !== undefined) {
			// Android: duration en ms como string.
			const parsed = Number(rawDuration);
			if (Number.isFinite(parsed) && parsed > 0) {
				return Math.round(parsed);
			}
		}
		// Fallback: duración capturada en STARTED.
		return this.currentAdDurationMs ?? 0;
	};

	/*
	 * Getters
	 *
	 */

	getIsAdPlaying = () => this.isAdPlaying;
	getCurrentAdId = () => this.currentAdId;
	getCurrentAdBreakId = () => this.currentAdBreakId;
}
