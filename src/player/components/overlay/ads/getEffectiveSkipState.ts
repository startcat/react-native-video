/**
 * Pure helper that resolves the SkipAdButton's displayed state from the data
 * the cast reducer publishes plus a wall-clock `now`.
 *
 * Why this exists:
 *   `MediaStatus.adBreakStatus.currentAdBreakClipTime` only refreshes when the
 *   receiver pushes a status update (state changes), not continuously. We use
 *   `adClipSkippableAt` (an epoch ms anchor recomputed by the reducer on each
 *   real receiver tick) as the source of truth and interpolate `secondsLeft`
 *   locally using `now`. The button component owns the 0.5s tick that feeds
 *   `now` back in — this helper stays pure and trivially testable.
 *
 * Freeze semantics:
 *   When the receiver is not in PLAYING (paused/buffering during an ad), local
 *   advancement is incorrect (ad time on the TV is not progressing). The caller
 *   passes `frozenSecondsLeftWhenPaused` — the value it was displaying at the
 *   moment the receiver paused — and we return that verbatim, ignoring `now`.
 *   If the receiver pauses before we've snapshotted a value (first frame edge
 *   case), we compute against `now` once but don't advance further while paused.
 */
export interface GetEffectiveSkipStateInput {
  /** Whether an ad break is currently playing on the receiver. */
  isPlayingAd: boolean;
  /** Whether the reducer already says skipping is allowed (canSkipAd from MediaStatus). */
  canSkip: boolean;
  /**
   * Epoch ms (local clock) at which the current ad clip becomes skippable.
   * Re-anchored on each receiver MediaStatus push. Null when whenSkippable is
   * unknown (fallback path — caller hides the countdown).
   */
  adClipSkippableAt: number | null;
  /** Identifier of the active ad clip — used by callers to detect clip transitions. */
  adClipId: string | null;
  /**
   * Whether the cast receiver is currently in PLAYING (vs paused/buffering).
   * When false during an ad, the local countdown must freeze so it stays in
   * sync with the TV (which is also frozen).
   */
  isReceiverPlaying: boolean;
  /** Wall-clock epoch ms (typically `Date.now()` at render time). */
  now: number;
  /**
   * Seconds the button was showing at the moment the receiver paused, if any.
   * The component snapshots this on the pause edge and passes it back so the
   * displayed value doesn't drift while the TV is stalled.
   */
  frozenSecondsLeftWhenPaused?: number | null;
}

export interface EffectiveSkipState {
  effectiveCanSkip: boolean;
  effectiveSecondsLeft: number | null;
}

export function getEffectiveSkipState(input: GetEffectiveSkipStateInput): EffectiveSkipState {
  if (!input.isPlayingAd) {
    return { effectiveCanSkip: false, effectiveSecondsLeft: null };
  }

  if (input.canSkip) {
    return { effectiveCanSkip: true, effectiveSecondsLeft: 0 };
  }

  if (typeof input.adClipSkippableAt !== 'number') {
    return { effectiveCanSkip: false, effectiveSecondsLeft: null };
  }

  const computeSecondsLeft = (): number => {
    const remainingMs = input.adClipSkippableAt! - input.now;
    return Math.max(0, Math.ceil(remainingMs / 1000));
  };

  // Receiver is paused/buffering — hold the last value we showed instead of
  // continuing to tick down locally.
  if (!input.isReceiverPlaying) {
    const held =
      typeof input.frozenSecondsLeftWhenPaused === 'number'
        ? input.frozenSecondsLeftWhenPaused
        : computeSecondsLeft();
    return { effectiveCanSkip: held === 0, effectiveSecondsLeft: held };
  }

  const secondsLeft = computeSecondsLeft();
  return { effectiveCanSkip: secondsLeft === 0, effectiveSecondsLeft: secondsLeft };
}
