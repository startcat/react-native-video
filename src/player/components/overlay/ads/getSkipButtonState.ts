export interface GetSkipButtonStateInput {
  isPlayingAd: boolean;
  canSkip: boolean;
  secondsUntilSkippable: number | null;
}

export type SkipButtonState =
  | { variant: 'hidden' }
  | { variant: 'countdown'; secondsLeft: number }
  | { variant: 'active' };

export function getSkipButtonState(input: GetSkipButtonStateInput): SkipButtonState {
  if (!input.isPlayingAd) return { variant: 'hidden' };
  if (input.canSkip) return { variant: 'active' };
  if (typeof input.secondsUntilSkippable === 'number' && input.secondsUntilSkippable > 0) {
    return { variant: 'countdown', secondsLeft: input.secondsUntilSkippable };
  }
  return { variant: 'hidden' };
}
