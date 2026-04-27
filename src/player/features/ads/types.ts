/**
 * Internal-only types and constants for the audio ads state machine.
 * NOT exported from the package barrel.
 */

/**
 * Shape of the `data` payload that the native module emits inside
 * OnReceiveAdEventData. Spec types it as `{}`; actual runtime values are
 * platform-dependent and may be partial. Always read defensively.
 *
 * Note: Android's bridge serializes everything as strings (Map<String, String>).
 * iOS may pass numbers/booleans natively. The reducer normalizes both shapes.
 */
export type RawAdEventData = {
	adId?: string;
	adTitle?: string;
	/**
	 * 1-based position of the current creative in the break.
	 * Maps to AudioAdsState.adIndex when emitted publicly.
	 */
	adPosition?: number | string;
	totalAds?: number | string;
	/** Seconds elapsed within the current creative. */
	currentTime?: number | string;
	/** Total seconds of the current creative. */
	duration?: number | string;
	/** Seconds until the ad becomes skippable. Negative or absent means non-skippable. */
	skipOffset?: number | string;
	isSkippable?: boolean | string;
};

/**
 * Subset of IMA event names this state machine reacts to. Names not in this
 * set are treated as no-ops (with a single warning log per unknown name).
 */
export const AD_EVENT = {
	AD_BREAK_STARTED: "AD_BREAK_STARTED",
	AD_BREAK_ENDED: "AD_BREAK_ENDED",
	ALL_ADS_COMPLETED: "ALL_ADS_COMPLETED",
	CONTENT_PAUSE_REQUESTED: "CONTENT_PAUSE_REQUESTED",
	CONTENT_RESUME_REQUESTED: "CONTENT_RESUME_REQUESTED",
	LOADED: "LOADED",
	STARTED: "STARTED",
	COMPLETED: "COMPLETED",
	SKIPPED: "SKIPPED",
	ERROR: "ERROR",
	AD_PROGRESS: "AD_PROGRESS",
	FIRST_QUARTILE: "FIRST_QUARTILE",
	MIDPOINT: "MIDPOINT",
	THIRD_QUARTILE: "THIRD_QUARTILE",
} as const;

export type AdEventName = (typeof AD_EVENT)[keyof typeof AD_EVENT];
