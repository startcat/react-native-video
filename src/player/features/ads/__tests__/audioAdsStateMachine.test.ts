import type { OnReceiveAdEventData } from "../../../../types/events";
import { deriveAudioAdsState, INITIAL_AUDIO_ADS_STATE, AudioAdsStateMachine } from "../audioAdsStateMachine";

const evt = (event: string, data: Record<string, unknown> = {}): OnReceiveAdEventData =>
	({ event, data } as unknown as OnReceiveAdEventData);

describe("deriveAudioAdsState — idle transitions", () => {
	it("returns INITIAL_AUDIO_ADS_STATE shape with all known fields", () => {
		expect(INITIAL_AUDIO_ADS_STATE).toEqual({
			isPlayingAd: false,
			adTitle: undefined,
			currentTime: 0,
			duration: 0,
			adIndex: 0,
			totalAds: 0,
			canSkipAd: false,
			secondsUntilSkippable: null,
		});
	});

	it("CONTENT_RESUME_REQUESTED resets any state to IDLE", () => {
		const dirty = { ...INITIAL_AUDIO_ADS_STATE, isPlayingAd: true, adIndex: 2, currentTime: 5 };
		expect(deriveAudioAdsState(dirty, evt("CONTENT_RESUME_REQUESTED"))).toEqual(INITIAL_AUDIO_ADS_STATE);
	});

	it("ALL_ADS_COMPLETED resets any state to IDLE", () => {
		const dirty = { ...INITIAL_AUDIO_ADS_STATE, isPlayingAd: true, totalAds: 3 };
		expect(deriveAudioAdsState(dirty, evt("ALL_ADS_COMPLETED"))).toEqual(INITIAL_AUDIO_ADS_STATE);
	});
});

describe("deriveAudioAdsState — AD_BREAK_STARTED", () => {
	it("flips isPlayingAd to true and resets per-creative fields", () => {
		const dirty = { ...INITIAL_AUDIO_ADS_STATE, isPlayingAd: true, currentTime: 99, adIndex: 2, totalAds: 3 };
		const next = deriveAudioAdsState(dirty, evt("AD_BREAK_STARTED", { totalAds: 3 }));
		expect(next.isPlayingAd).toBe(true);
		expect(next.currentTime).toBe(0);
		expect(next.duration).toBe(0);
		expect(next.adIndex).toBe(0);
		expect(next.totalAds).toBe(3);
	});

	it("leaves totalAds=0 when not provided", () => {
		const next = deriveAudioAdsState(INITIAL_AUDIO_ADS_STATE, evt("AD_BREAK_STARTED"));
		expect(next.isPlayingAd).toBe(true);
		expect(next.totalAds).toBe(0);
	});
});

describe("deriveAudioAdsState — STARTED / LOADED", () => {
	it("captures creative metadata on STARTED", () => {
		const after = deriveAudioAdsState(
			deriveAudioAdsState(INITIAL_AUDIO_ADS_STATE, evt("AD_BREAK_STARTED", { totalAds: 2 })),
			evt("STARTED", { adTitle: "Hello Ad", duration: 15, adPosition: 1, totalAds: 2 }),
		);
		expect(after.isPlayingAd).toBe(true);
		expect(after.adTitle).toBe("Hello Ad");
		expect(after.duration).toBe(15);
		expect(after.adIndex).toBe(1);
		expect(after.totalAds).toBe(2);
		expect(after.currentTime).toBe(0);
	});

	it("LOADED is treated like STARTED (defensive on iOS)", () => {
		const after = deriveAudioAdsState(
			INITIAL_AUDIO_ADS_STATE,
			evt("LOADED", { adTitle: "X", duration: 10, adPosition: 1 }),
		);
		expect(after.isPlayingAd).toBe(true);
		expect(after.adTitle).toBe("X");
		expect(after.duration).toBe(10);
		expect(after.adIndex).toBe(1);
	});

	it("missing fields fall back to previous values", () => {
		const seeded = { ...INITIAL_AUDIO_ADS_STATE, isPlayingAd: true, adTitle: "Old", duration: 30, adIndex: 1 };
		const after = deriveAudioAdsState(seeded, evt("STARTED", {}));
		expect(after.adTitle).toBe("Old");
		expect(after.duration).toBe(30);
		expect(after.adIndex).toBe(1);
	});
});

describe("deriveAudioAdsState — progress events", () => {
	const seeded = {
		...INITIAL_AUDIO_ADS_STATE,
		isPlayingAd: true,
		adTitle: "Ad",
		duration: 15,
		adIndex: 1,
		totalAds: 1,
	};

	it("AD_PROGRESS updates currentTime and duration", () => {
		const next = deriveAudioAdsState(seeded, evt("AD_PROGRESS", { currentTime: 5, duration: 15 }));
		expect(next.currentTime).toBe(5);
		expect(next.duration).toBe(15);
		expect(next.isPlayingAd).toBe(true);
	});

	it.each(["FIRST_QUARTILE", "MIDPOINT", "THIRD_QUARTILE"])("%s also updates progress", (name) => {
		const next = deriveAudioAdsState(seeded, evt(name, { currentTime: 7 }));
		expect(next.currentTime).toBe(7);
	});

	it("COMPLETED snaps currentTime to duration and stays isPlayingAd", () => {
		const next = deriveAudioAdsState(seeded, evt("COMPLETED"));
		expect(next.currentTime).toBe(15);
		expect(next.isPlayingAd).toBe(true);
	});
});

describe("deriveAudioAdsState — skippable derivations", () => {
	it("non-skippable ad: canSkipAd=false, secondsUntilSkippable=null", () => {
		const next = deriveAudioAdsState(
			INITIAL_AUDIO_ADS_STATE,
			evt("STARTED", { duration: 15, isSkippable: false }),
		);
		expect(next.canSkipAd).toBe(false);
		expect(next.secondsUntilSkippable).toBeNull();
	});

	it("skippable but not yet reached: secondsUntilSkippable counts down (ceil)", () => {
		const next = deriveAudioAdsState(
			INITIAL_AUDIO_ADS_STATE,
			evt("AD_PROGRESS", { currentTime: 1.4, duration: 15, isSkippable: true, skipOffset: 5 }),
		);
		expect(next.canSkipAd).toBe(false);
		expect(next.secondsUntilSkippable).toBe(4);
	});

	it("skippable threshold reached: canSkipAd=true, secondsUntilSkippable=0", () => {
		const next = deriveAudioAdsState(
			INITIAL_AUDIO_ADS_STATE,
			evt("AD_PROGRESS", { currentTime: 5.2, duration: 15, isSkippable: true, skipOffset: 5 }),
		);
		expect(next.canSkipAd).toBe(true);
		expect(next.secondsUntilSkippable).toBe(0);
	});

	it("negative skipOffset (sentinel) treated as non-skippable", () => {
		const next = deriveAudioAdsState(
			INITIAL_AUDIO_ADS_STATE,
			evt("AD_PROGRESS", { currentTime: 5, duration: 15, isSkippable: true, skipOffset: -1 }),
		);
		expect(next.canSkipAd).toBe(false);
		expect(next.secondsUntilSkippable).toBeNull();
	});

	it("missing skipOffset treated as non-skippable", () => {
		const next = deriveAudioAdsState(
			INITIAL_AUDIO_ADS_STATE,
			evt("AD_PROGRESS", { currentTime: 5, duration: 15, isSkippable: true }),
		);
		expect(next.canSkipAd).toBe(false);
		expect(next.secondsUntilSkippable).toBeNull();
	});
});

describe("deriveAudioAdsState — passive and unknown events", () => {
	const seeded = { ...INITIAL_AUDIO_ADS_STATE, isPlayingAd: true, currentTime: 5 };

	it.each(["CONTENT_PAUSE_REQUESTED", "AD_BREAK_ENDED", "SKIPPED", "ERROR"])(
		"%s does not change isPlayingAd",
		(name) => {
			const next = deriveAudioAdsState(seeded, evt(name));
			expect(next.isPlayingAd).toBe(true);
		},
	);

	it("unknown event names are no-ops (state strictly equal)", () => {
		const next = deriveAudioAdsState(seeded, evt("SOMETHING_RANDOM"));
		expect(next).toBe(seeded);
	});

	it("known passive events return prev unchanged", () => {
		const next = deriveAudioAdsState(seeded, evt("AD_BREAK_ENDED"));
		expect(next).toBe(seeded);
	});
});

describe("AudioAdsStateMachine — emit semantics", () => {
	it("emits only when public state changes", () => {
		const onChange = jest.fn();
		const sm = new AudioAdsStateMachine(onChange);
		sm.handleEvent(evt("AD_BREAK_STARTED", { totalAds: 1 })); // change
		sm.handleEvent(evt("AD_BREAK_STARTED", { totalAds: 1 })); // no change
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange.mock.calls[0][0].isPlayingAd).toBe(true);
	});

	it("debounces sub-second currentTime changes (integer-second granularity)", () => {
		const onChange = jest.fn();
		const sm = new AudioAdsStateMachine(onChange);
		sm.handleEvent(evt("AD_BREAK_STARTED", { totalAds: 1 }));
		sm.handleEvent(evt("STARTED", { duration: 15, adPosition: 1, totalAds: 1 }));
		onChange.mockClear();
		sm.handleEvent(evt("AD_PROGRESS", { currentTime: 1.1, duration: 15 }));
		sm.handleEvent(evt("AD_PROGRESS", { currentTime: 1.4, duration: 15 }));
		sm.handleEvent(evt("AD_PROGRESS", { currentTime: 1.9, duration: 15 }));
		sm.handleEvent(evt("AD_PROGRESS", { currentTime: 2.0, duration: 15 }));
		expect(onChange).toHaveBeenCalledTimes(2); // floor 1, then floor 2
	});

	it("emits when secondsUntilSkippable integer changes", () => {
		const onChange = jest.fn();
		const sm = new AudioAdsStateMachine(onChange);
		sm.handleEvent(evt("AD_BREAK_STARTED"));
		sm.handleEvent(evt("STARTED", { duration: 15, isSkippable: true, skipOffset: 5 }));
		onChange.mockClear();
		sm.handleEvent(evt("AD_PROGRESS", { currentTime: 0.5, isSkippable: true, skipOffset: 5 }));
		sm.handleEvent(evt("AD_PROGRESS", { currentTime: 1.5, isSkippable: true, skipOffset: 5 }));
		expect(onChange).toHaveBeenCalledTimes(2);
		expect(onChange.mock.calls[0][0].secondsUntilSkippable).toBe(5);
		expect(onChange.mock.calls[1][0].secondsUntilSkippable).toBe(4);
	});
});

describe("AudioAdsStateMachine.reset", () => {
	it("emits IDLE state when called from a non-idle state", () => {
		const onChange = jest.fn();
		const sm = new AudioAdsStateMachine(onChange);
		sm.handleEvent(evt("AD_BREAK_STARTED", { totalAds: 1 }));
		onChange.mockClear();
		sm.reset();
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange.mock.calls[0][0]).toEqual(INITIAL_AUDIO_ADS_STATE);
	});

	it("is a no-op when already in IDLE state", () => {
		const onChange = jest.fn();
		const sm = new AudioAdsStateMachine(onChange);
		sm.reset();
		expect(onChange).not.toHaveBeenCalled();
	});
});

describe("deriveAudioAdsState — string-number coercion (Android bridge)", () => {
	it("STARTED with string fields parses correctly", () => {
		const after = deriveAudioAdsState(
			INITIAL_AUDIO_ADS_STATE,
			evt("STARTED", {
				adTitle: "X",
				duration: "15.0",
				adPosition: "1",
				totalAds: "2",
			}),
		);
		expect(after.duration).toBe(15);
		expect(after.adIndex).toBe(1);
		expect(after.totalAds).toBe(2);
	});

	it("AD_PROGRESS with string isSkippable + skipOffset parses correctly", () => {
		const next = deriveAudioAdsState(
			INITIAL_AUDIO_ADS_STATE,
			evt("AD_PROGRESS", {
				currentTime: "1.4",
				duration: "15.0",
				isSkippable: "true",
				skipOffset: "5.0",
			}),
		);
		expect(next.currentTime).toBe(1.4);
		expect(next.canSkipAd).toBe(false);
		expect(next.secondsUntilSkippable).toBe(4);
	});
});
