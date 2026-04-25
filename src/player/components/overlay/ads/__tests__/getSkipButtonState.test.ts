import { getSkipButtonState } from '../getSkipButtonState';

describe('getSkipButtonState', () => {
  test('hidden when not playing an ad', () => {
    expect(getSkipButtonState({ isPlayingAd: false, canSkip: false, secondsUntilSkippable: 5 }))
      .toEqual({ variant: 'hidden' });
  });

  test('hidden when ad active but neither skippable nor in fallback (no whenSkippable AND not yet 5s)', () => {
    expect(
      getSkipButtonState({ isPlayingAd: true, canSkip: false, secondsUntilSkippable: null })
    ).toEqual({ variant: 'hidden' });
  });

  test('countdown when ad is active with a known whenSkippable still pending', () => {
    expect(
      getSkipButtonState({ isPlayingAd: true, canSkip: false, secondsUntilSkippable: 5 })
    ).toEqual({ variant: 'countdown', secondsLeft: 5 });
  });

  test('active when canSkip is true and secondsUntilSkippable is 0', () => {
    expect(
      getSkipButtonState({ isPlayingAd: true, canSkip: true, secondsUntilSkippable: 0 })
    ).toEqual({ variant: 'active' });
  });

  test('active when canSkip is true and secondsUntilSkippable is null (fallback C past grace)', () => {
    expect(
      getSkipButtonState({ isPlayingAd: true, canSkip: true, secondsUntilSkippable: null })
    ).toEqual({ variant: 'active' });
  });
});
