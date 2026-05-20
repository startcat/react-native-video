import { getEffectiveSkipState } from '../getEffectiveSkipState';

const T0 = 1_700_000_000_000;

describe('getEffectiveSkipState — basic gating', () => {
  test('hidden values when not playing an ad', () => {
    const result = getEffectiveSkipState({
      isPlayingAd: false,
      canSkip: false,
      adClipSkippableAt: T0 + 5000,
      adClipId: 'A',
      isReceiverPlaying: true,
      now: T0,
    });
    expect(result).toEqual({ effectiveCanSkip: false, effectiveSecondsLeft: null });
  });

  test('trusts reducer when canSkip is already true (no countdown)', () => {
    const result = getEffectiveSkipState({
      isPlayingAd: true,
      canSkip: true,
      adClipSkippableAt: T0 - 1000,
      adClipId: 'A',
      isReceiverPlaying: true,
      now: T0,
    });
    expect(result).toEqual({ effectiveCanSkip: true, effectiveSecondsLeft: 0 });
  });

  test('returns null seconds when no anchor available (fallback clip without whenSkippable)', () => {
    const result = getEffectiveSkipState({
      isPlayingAd: true,
      canSkip: false,
      adClipSkippableAt: null,
      adClipId: 'A',
      isReceiverPlaying: true,
      now: T0,
    });
    expect(result).toEqual({ effectiveCanSkip: false, effectiveSecondsLeft: null });
  });
});

describe('getEffectiveSkipState — local ticking from anchor', () => {
  test('floors-to-ceil seconds left from absolute timestamp', () => {
    // anchor = T0 + 3400 → at T0, 3.4s remaining → ceil = 4
    const result = getEffectiveSkipState({
      isPlayingAd: true,
      canSkip: false,
      adClipSkippableAt: T0 + 3400,
      adClipId: 'A',
      isReceiverPlaying: true,
      now: T0,
    });
    expect(result).toEqual({ effectiveCanSkip: false, effectiveSecondsLeft: 4 });
  });

  test('ticks down as `now` advances (no need for a new prop)', () => {
    const anchor = T0 + 3400;
    expect(
      getEffectiveSkipState({
        isPlayingAd: true,
        canSkip: false,
        adClipSkippableAt: anchor,
        adClipId: 'A',
        isReceiverPlaying: true,
        now: T0 + 500,
      }).effectiveSecondsLeft
    ).toBe(3); // 2.9s remaining → ceil = 3

    expect(
      getEffectiveSkipState({
        isPlayingAd: true,
        canSkip: false,
        adClipSkippableAt: anchor,
        adClipId: 'A',
        isReceiverPlaying: true,
        now: T0 + 1500,
      }).effectiveSecondsLeft
    ).toBe(2); // 1.9s remaining → ceil = 2
  });

  test('flips effectiveCanSkip=true once anchor is reached', () => {
    const result = getEffectiveSkipState({
      isPlayingAd: true,
      canSkip: false,
      adClipSkippableAt: T0,
      adClipId: 'A',
      isReceiverPlaying: true,
      now: T0,
    });
    expect(result).toEqual({ effectiveCanSkip: true, effectiveSecondsLeft: 0 });
  });

  test('never returns negative seconds', () => {
    const result = getEffectiveSkipState({
      isPlayingAd: true,
      canSkip: false,
      adClipSkippableAt: T0 - 5000,
      adClipId: 'A',
      isReceiverPlaying: true,
      now: T0,
    });
    expect(result.effectiveSecondsLeft).toBe(0);
    expect(result.effectiveCanSkip).toBe(true);
  });
});

describe('getEffectiveSkipState — freeze during receiver pause/buffer', () => {
  test('freezes the displayed seconds while receiver is paused (anchor is treated as held)', () => {
    // anchor = T0 + 4000 (4s left at T0). Receiver pauses at T0 with frozenSecondsLeft=4.
    // At T0+2000 receiver is still paused; we should still show 4, not 2.
    const result = getEffectiveSkipState({
      isPlayingAd: true,
      canSkip: false,
      adClipSkippableAt: T0 + 4000,
      adClipId: 'A',
      isReceiverPlaying: false,
      now: T0 + 2000,
      // The caller MUST pass the seconds it was showing at the pause moment so
      // we can hold it. This decouples the helper from internal mutable state.
      frozenSecondsLeftWhenPaused: 4,
    });
    expect(result.effectiveSecondsLeft).toBe(4);
    expect(result.effectiveCanSkip).toBe(false);
  });

  test('without a frozen value, paused state holds at the anchor evaluation (no advance)', () => {
    // When the caller has no frozen value yet (race), still don't tick — return the
    // currently-evaluated seconds for `now` but mark them as the floor.
    const result = getEffectiveSkipState({
      isPlayingAd: true,
      canSkip: false,
      adClipSkippableAt: T0 + 4000,
      adClipId: 'A',
      isReceiverPlaying: false,
      now: T0,
    });
    expect(result.effectiveSecondsLeft).toBe(4);
  });
});
