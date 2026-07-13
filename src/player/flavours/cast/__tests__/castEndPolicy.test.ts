import { CAST_IDLE_REASON_FINISHED, isNaturalCastEnd } from "../castEndPolicy";

/**
 * Cast IDLE routing policy — PLAYER-383 / ADR-Cast-002 (Fase 0).
 *
 * The module exposes `idleReason` as a fact; RNV decides. This locks the decision
 * table: only FINISHED is a natural end (→ onEnd/auto-next, T11); STOP (CANCELLED),
 * a new LOAD (INTERRUPTED), an ERROR, or an unknown reason (null) are a handoff of
 * the same content, not an end (T12/T13) — auto-next must be suppressed.
 *
 * `MediaPlayerIdleReason` (react-native-google-cast) values are the lowercase
 * strings used here; the module surfaces them verbatim.
 */
describe("castEndPolicy — isNaturalCastEnd (PLAYER-383)", () => {
	it("FINISHED is a natural end → auto-next authorised (T11)", () => {
		expect(isNaturalCastEnd("finished")).toBe(true);
		// sentinel matches the RNGC enum value it stands for
		expect(CAST_IDLE_REASON_FINISHED).toBe("finished");
	});

	it("CANCELLED (STOP / 'Atura l'emissió') is a handoff, NOT an end (T12)", () => {
		expect(isNaturalCastEnd("cancelled")).toBe(false);
	});

	it("INTERRUPTED (new LOAD) is a handoff, NOT an end (T12)", () => {
		expect(isNaturalCastEnd("interrupted")).toBe(false);
	});

	it("ERROR is not a natural end (surfaced as error elsewhere)", () => {
		expect(isNaturalCastEnd("error")).toBe(false);
	});

	it("null / undefined reason defaults to handoff, never auto-next (T13)", () => {
		expect(isNaturalCastEnd(null)).toBe(false);
		expect(isNaturalCastEnd(undefined)).toBe(false);
	});

	it("an unknown/future reason is treated as a handoff (safe default)", () => {
		expect(isNaturalCastEnd("some-future-reason")).toBe(false);
	});
});
