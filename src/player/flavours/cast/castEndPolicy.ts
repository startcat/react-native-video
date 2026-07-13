/**
 * Cast IDLE routing policy — PLAYER-383 / ADR-Cast-002 (Fase 0).
 *
 * The `@overon/react-native-cast` module EXPOSES the receiver's `idleReason` as a
 * bare fact; the routing POLICY lives here, in react-native-video (the orchestration
 * layer). This single predicate is the one authority for that decision, shared by
 * both IDLE paths of the cast flavour (the `onPlaybackEnded` callback and the
 * reactive `castMedia.isIdle` effect) so they can never drift apart.
 *
 * Only a natural end (`FINISHED`) on VOD authorises `onEnd` → auto-next (spec T11).
 * Every other idle reason is a handoff of the SAME content back to local playback,
 * NOT an end, and must NOT trigger auto-next:
 *   - `CANCELLED`   → a sender issued STOP (the receiver's "Atura l'emissió"/Stop) — T12
 *   - `INTERRUPTED` → a sender issued LOAD of a different media — T12
 *   - `ERROR`       → playback failed (surfaced as an error elsewhere) — not an end
 *   - `null`        → the receiver reported no reason — treat as handoff (safe default)
 *
 * Kept dependency-free (plain string comparison, no runtime import of the Cast SDK)
 * so it is unit-testable under the fork's jest without mocking native modules. The
 * literal below equals `MediaPlayerIdleReason.FINISHED` from react-native-google-cast.
 */

/** Canonical value of `MediaPlayerIdleReason.FINISHED` (react-native-google-cast). */
export const CAST_IDLE_REASON_FINISHED = "finished";

/**
 * True only when the receiver's idle reason denotes a natural end of content
 * (i.e. auto-next is authorised). Any other reason — including `null`/`undefined` —
 * is a handoff, not an end.
 */
export function isNaturalCastEnd(idleReason: string | null | undefined): boolean {
	return idleReason === CAST_IDLE_REASON_FINISHED;
}
