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
	// true cuando el break lo hemos abierto nosotros (IMA client-side) y no el
	// SDK (AD_BREAK_STARTED, solo DAI). Solo esos se cierran en CONTENT_RESUME.
	private adBreakSynthesized = false;
	private adBreakSeq = 0;
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
				// El contenido se pausa para dar paso a un pod: en IMA client-side
				// es el unico aviso de que empieza un ad break (EITB-1702).
				this.openSyntheticAdBreak(data);
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
		// Red de seguridad: si no hubo CONTENT_PAUSE_REQUESTED (o llego sin
		// abrir break), el primer anuncio abre el break el mismo.
		this.openSyntheticAdBreak(data);
		this.isAdPlaying = true;
		this.isAdPaused = false;
		this.adStartTime = Date.now();
		this.lastAdProgressTickTs = 0;
		this.currentAdId = this.extractAdId(data);
		this.currentAdDurationMs = this.extractAdDuration(data);
		this.currentAdType = this.extractAdType(data);

		this.analyticsEvents.on("onAdBegin", {
			adId: this.currentAdId,
			adDuration: this.currentAdDurationMs,
			adPosition: this.extractAdPosition(data),
			adType: this.currentAdType,
		});
	};

	private handleAdCompleted = () => {
		this.analyticsEvents.on("onAdEnd", {
			adId: this.currentAdId,
			completed: true,
		});

		this.resetAdState();
	};

	private handleAdSkipped = () => {
		const skipPosition = this.adStartTime ? Date.now() - this.adStartTime : undefined;

		this.analyticsEvents.on("onAdSkip", {
			adId: this.currentAdId,
			skipPosition,
		});

		this.analyticsEvents.on("onAdEnd", {
			adId: this.currentAdId,
			completed: false,
		});

		this.resetAdState();
	};

	private handleAdPaused = () => {
		this.isAdPaused = true;
		this.analyticsEvents.on("onAdPause", {
			adId: this.currentAdId,
		});
	};

	private handleAdResumed = () => {
		this.isAdPaused = false;
		this.analyticsEvents.on("onAdResume", {
			adId: this.currentAdId,
		});
	};

	private handleAdError = () => {
		this.analyticsEvents.on("onAdEnd", {
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
		this.adBreakSynthesized = false;

		this.analyticsEvents.on("onAdBreakBegin", {
			adBreakId: this.currentAdBreakId,
			adCount: this.extractAdCount(data),
			adBreakPosition: this.extractAdBreakPosition(data),
		});
	};

	private handleAdBreakEnded = () => {
		this.analyticsEvents.on("onAdBreakEnd", {
			adBreakId: this.currentAdBreakId,
		});

		this.currentAdBreakId = undefined;
		this.adBreakSynthesized = false;
		// Fix: el flag isAdPlaying se quedaba colgado si AD_BREAK_ENDED llegaba
		// sin un COMPLETED previo (caso conocido en streams DAI/SSAI). Asegurar
		// reset aquí para que el gate del adapter se libere correctamente.
		this.resetAdState();
	};

	private handleAllAdsCompleted = () => {
		if (this.currentAdBreakId) {
			this.analyticsEvents.on("onAdBreakEnd", {
				adBreakId: this.currentAdBreakId,
			});
		}

		this.currentAdBreakId = undefined;
		this.adBreakSynthesized = false;
		this.resetAdState();
	};

	private handleContentResumeRequested = () => {
		// El pod ha terminado: cerrar el break sintetizado ANTES de avisar de la
		// reanudacion, para que los plugins vean adBreakEnd -> play en ese orden.
		this.closeSyntheticAdBreak();
		this.analyticsEvents.on("onContentResume", undefined);
	};

	/*
	 * Ad break sintetizado (IMA client-side, EITB-1702)
	 *
	 * El SDK de IMA solo emite AD_BREAK_STARTED / AD_BREAK_ENDED en DAI. En
	 * client-side el pod se delimita con CONTENT_PAUSE_REQUESTED y
	 * CONTENT_RESUME_REQUESTED, asi que sin esto ningun plugin recibia
	 * onAdBreakBegin/onAdBreakEnd — y Adobe, sin esos "bookends", descarta los
	 * adStart/adComplete y cuenta el anuncio como contenido.
	 */

	private openSyntheticAdBreak = (data?: OnReceiveAdEventData) => {
		if (this.currentAdBreakId) {
			return;
		}
		this.adBreakSeq += 1;
		this.currentAdBreakId = `adbreak_${Date.now()}_${this.adBreakSeq}`;
		this.adBreakSynthesized = true;

		this.analyticsEvents.on("onAdBreakBegin", {
			adBreakId: this.currentAdBreakId,
			adCount: data ? this.extractAdCount(data) : undefined,
			adBreakPosition: data ? this.extractAdBreakPosition(data) : undefined,
		});
	};

	private closeSyntheticAdBreak = () => {
		if (!this.currentAdBreakId || !this.adBreakSynthesized) {
			return;
		}
		this.analyticsEvents.on("onAdBreakEnd", {
			adBreakId: this.currentAdBreakId,
		});
		this.currentAdBreakId = undefined;
		this.adBreakSynthesized = false;
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

		this.analyticsEvents.on("onAdProgress", {
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
		// El nativo manda la duracion en segundos, como cadena en Android.
		const seconds = Number((data.data as any)?.duration);
		return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : undefined;
	};

	private extractAdPosition = (data: OnReceiveAdEventData): number | undefined => {
		return (data.data as any)?.position ? (data.data as any).position * 1000 : undefined;
	};

	private extractAdType = (
		data: OnReceiveAdEventData
	): "preroll" | "midroll" | "postroll" | undefined => {
		const d = data.data as any;
		// IMA AdPodInfo (propagado por el nativo, PLAYER-368). Los valores llegan como
		// string en el mapa del evento. podIndex: 0=pre-roll, -1=post-roll, >0=mid-roll.
		const podIndex = d?.podIndex != null ? Number(d.podIndex) : undefined;
		if (podIndex !== undefined && !Number.isNaN(podIndex)) {
			if (podIndex === 0) {
				return "preroll";
			}
			if (podIndex === -1) {
				return "postroll";
			}
			return "midroll";
		}
		// timeOffset (segundos): 0=pre-roll, <0=post-roll, >0=mid-roll.
		const timeOffset = d?.timeOffset != null ? Number(d.timeOffset) : undefined;
		if (timeOffset !== undefined && !Number.isNaN(timeOffset)) {
			if (timeOffset === 0) {
				return "preroll";
			}
			if (timeOffset < 0) {
				return "postroll";
			}
			return "midroll";
		}
		// Fallback heredado por posición de reproducción (no fiable; último recurso).
		const position = d?.position;
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
		// `totalAds` viene del AdPodInfo de IMA (PLAYER-368), como cadena.
		const d = data.data as any;
		const raw = d?.adCount ?? d?.totalAds;
		const n = Number(raw);
		return raw != null && Number.isFinite(n) ? n : undefined;
	};

	private extractAdBreakPosition = (data: OnReceiveAdEventData): number | undefined => {
		// En ms. `adBreakPosition` (s) si alguien lo manda; si no, el
		// `timeOffset` (s) del AdPodInfo, que en post-roll es -1 y no vale.
		const d = data.data as any;
		if (d?.adBreakPosition) {
			return Number(d.adBreakPosition) * 1000;
		}
		const offset = Number(d?.timeOffset);
		return d?.timeOffset != null && Number.isFinite(offset) && offset >= 0
			? Math.round(offset * 1000)
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
