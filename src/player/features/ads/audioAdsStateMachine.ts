import type { OnReceiveAdEventData } from "../../../types/events";
import type { AudioAdsState } from "../../types";
import { AD_EVENT } from "./types";

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

export function deriveAudioAdsState(prev: AudioAdsState, event: OnReceiveAdEventData): AudioAdsState {
	switch (event.event) {
		case AD_EVENT.CONTENT_RESUME_REQUESTED:
		case AD_EVENT.ALL_ADS_COMPLETED:
			return { ...INITIAL_AUDIO_ADS_STATE };
		default:
			return prev;
	}
}
