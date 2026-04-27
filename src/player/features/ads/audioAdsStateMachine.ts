import type { OnReceiveAdEventData } from "../../../types/events";
import type { AudioAdsState } from "../../types";
import { AD_EVENT, type RawAdEventData } from "./types";

const toNumber = (v: unknown): number | undefined => {
	if (v == null) return undefined;
	if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
	if (typeof v === "string") {
		const n = parseFloat(v);
		return Number.isFinite(n) ? n : undefined;
	}
	return undefined;
};

const toBool = (v: unknown): boolean => {
	if (typeof v === "boolean") return v;
	if (typeof v === "string") return v === "true";
	return false;
};

export const INITIAL_AUDIO_ADS_STATE: AudioAdsState = {
	isPlayingAd: false,
	adTitle: undefined,
	currentTime: 0,
	duration: 0,
	adIndex: 0,
	totalAds: 0,
	canSkipAd: false,
	secondsUntilSkippable: null,
};

function deriveSkippable(
	raw: RawAdEventData,
	currentTime: number,
): Pick<AudioAdsState, "canSkipAd" | "secondsUntilSkippable"> {
	const skipOffset = toNumber(raw.skipOffset);
	if (!toBool(raw.isSkippable) || skipOffset == null || skipOffset < 0) {
		return { canSkipAd: false, secondsUntilSkippable: null };
	}
	const remaining = Math.max(0, Math.ceil(skipOffset - currentTime));
	return { canSkipAd: remaining === 0, secondsUntilSkippable: remaining };
}

export function deriveAudioAdsState(prev: AudioAdsState, event: OnReceiveAdEventData): AudioAdsState {
	switch (event.event) {
		case AD_EVENT.CONTENT_RESUME_REQUESTED:
		case AD_EVENT.ALL_ADS_COMPLETED:
			return { ...INITIAL_AUDIO_ADS_STATE };
		case AD_EVENT.AD_BREAK_STARTED: {
			const raw = (event.data ?? {}) as RawAdEventData;
			return {
				...INITIAL_AUDIO_ADS_STATE,
				isPlayingAd: true,
				totalAds: toNumber(raw.totalAds) ?? 0,
			};
		}
		case AD_EVENT.STARTED:
		case AD_EVENT.LOADED: {
			// deriveSkippable intentionally NOT called here: STARTED does not
			// carry reliable currentTime in all platforms. The first AD_PROGRESS
			// event (~250ms later) computes canSkipAd / secondsUntilSkippable
			// correctly, and the change-detected emitter forwards that update.
			const raw = (event.data ?? {}) as RawAdEventData;
			const currentTime = toNumber(raw.currentTime) ?? 0;
			return {
				...prev,
				isPlayingAd: true,
				adTitle: raw.adTitle ?? prev.adTitle,
				duration: toNumber(raw.duration) ?? prev.duration,
				adIndex: toNumber(raw.adPosition) ?? prev.adIndex,
				totalAds: toNumber(raw.totalAds) ?? prev.totalAds,
				currentTime,
			};
		}
		case AD_EVENT.AD_PROGRESS:
		case AD_EVENT.FIRST_QUARTILE:
		case AD_EVENT.MIDPOINT:
		case AD_EVENT.THIRD_QUARTILE: {
			const raw = (event.data ?? {}) as RawAdEventData;
			const currentTime = toNumber(raw.currentTime) ?? prev.currentTime;
			return {
				...prev,
				isPlayingAd: true,
				currentTime,
				duration: toNumber(raw.duration) ?? prev.duration,
				...deriveSkippable(raw, currentTime),
			};
		}
		case AD_EVENT.COMPLETED:
			return { ...prev, isPlayingAd: true, currentTime: prev.duration };
		case AD_EVENT.AD_BREAK_ENDED:
		case AD_EVENT.CONTENT_PAUSE_REQUESTED:
		case AD_EVENT.SKIPPED:
		case AD_EVENT.ERROR:
			return prev;
		default:
			return prev;
	}
}

function publicStateEqual(a: AudioAdsState, b: AudioAdsState): boolean {
	return (
		a.isPlayingAd === b.isPlayingAd &&
		a.adTitle === b.adTitle &&
		a.duration === b.duration &&
		a.adIndex === b.adIndex &&
		a.totalAds === b.totalAds &&
		a.canSkipAd === b.canSkipAd &&
		a.secondsUntilSkippable === b.secondsUntilSkippable &&
		Math.floor(a.currentTime) === Math.floor(b.currentTime)
	);
}

/**
 * @internal
 *
 * Wraps `deriveAudioAdsState` and emits the new state via a callback
 * whenever the public state shape changes. Reachable from within the
 * package via `src/player/features/ads/index.ts` but NOT re-exported
 * from the package barrel — host apps subscribe via `events.onAdStateChanged`,
 * not by instantiating this class directly.
 */
export class AudioAdsStateMachine {
	private state: AudioAdsState = { ...INITIAL_AUDIO_ADS_STATE };
	private readonly onChange: (state: AudioAdsState) => void;

	constructor(onChange: (state: AudioAdsState) => void) {
		this.onChange = onChange;
	}

	handleEvent(event: OnReceiveAdEventData): void {
		const next = deriveAudioAdsState(this.state, event);
		if (!publicStateEqual(this.state, next)) {
			this.state = next;
			this.onChange(next);
		}
	}

	reset(): void {
		if (!publicStateEqual(this.state, INITIAL_AUDIO_ADS_STATE)) {
			this.state = { ...INITIAL_AUDIO_ADS_STATE };
			this.onChange(this.state);
		}
	}

	getState(): AudioAdsState {
		return { ...this.state };
	}
}
