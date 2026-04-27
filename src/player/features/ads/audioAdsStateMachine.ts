import type { OnReceiveAdEventData } from "../../../types/events";
import type { AudioAdsState } from "../../types";
import { AD_EVENT, type RawAdEventData } from "./types";

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
	const skipOffset = raw.skipOffset;
	if (raw.isSkippable !== true || skipOffset == null || skipOffset < 0) {
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
				totalAds: raw.totalAds ?? 0,
			};
		}
		case AD_EVENT.STARTED:
		case AD_EVENT.LOADED: {
			const raw = (event.data ?? {}) as RawAdEventData;
			const currentTime = raw.currentTime ?? 0;
			const next: AudioAdsState = {
				...prev,
				isPlayingAd: true,
				adTitle: raw.adTitle ?? prev.adTitle,
				duration: raw.duration ?? prev.duration,
				adIndex: raw.adPosition ?? prev.adIndex,
				totalAds: raw.totalAds ?? prev.totalAds,
				currentTime,
			};
			return { ...next, ...deriveSkippable(raw, currentTime) };
		}
		case AD_EVENT.AD_PROGRESS:
		case AD_EVENT.FIRST_QUARTILE:
		case AD_EVENT.MIDPOINT:
		case AD_EVENT.THIRD_QUARTILE: {
			const raw = (event.data ?? {}) as RawAdEventData;
			const currentTime = raw.currentTime ?? prev.currentTime;
			return {
				...prev,
				isPlayingAd: true,
				currentTime,
				duration: raw.duration ?? prev.duration,
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
