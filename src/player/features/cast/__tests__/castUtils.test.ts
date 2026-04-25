import { castReducer, createInitialCastState } from '../utils/castUtils';

const baseInitial = () => ({
  castState: createInitialCastState(),
  lastValidPosition: 0,
  updateSequence: 0,
  logger: null,
}) as any;

const buildSyncPayload = (overrides: any = {}) => ({
  type: 'SYNC_UPDATE' as const,
  payload: {
    nativeCastState: 'CONNECTED',
    nativeSession: { deviceName: 'TV' },
    nativeClient: {},
    nativeMediaStatus: {
      playerState: 'PLAYING',
      mediaInfo: { contentId: 'live://x', adBreakClips: [] },
      activeTrackIds: [],
      adBreakStatus: null,
      ...overrides.nativeMediaStatus,
    },
    nativeStreamPosition: 100,
    ...overrides,
  },
});

describe('castReducer — currentAdBreakClip resolution', () => {
  test('null when no ad break is active', () => {
    const next = castReducer(baseInitial(), buildSyncPayload());
    expect(next.castState.media.currentAdBreakClip).toBeNull();
    expect(next.castState.media.isPlayingAd).toBe(false);
  });

  test('resolves the matching clip from adBreakClips by adBreakClipId', () => {
    const next = castReducer(
      baseInitial(),
      buildSyncPayload({
        nativeMediaStatus: {
          playerState: 'PLAYING',
          mediaInfo: {
            contentId: 'live://x',
            adBreakClips: [
              { adBreakClipId: 'clipA', duration: 30, whenSkippable: 5 },
              { adBreakClipId: 'clipB', duration: 15, whenSkippable: null },
            ],
          },
          adBreakStatus: {
            adBreakId: 'break1',
            adBreakClipId: 'clipB',
            currentAdBreakTime: 30,
            currentAdBreakClipTime: 0,
          },
        },
      })
    );
    expect(next.castState.media.isPlayingAd).toBe(true);
    expect(next.castState.media.currentAdBreakClip).toEqual({
      adBreakClipId: 'clipB',
      title: null,
      duration: 15,
      whenSkippable: null,
    });
  });

  test('null when adBreakClipId does not match any clip in the array', () => {
    const next = castReducer(
      baseInitial(),
      buildSyncPayload({
        nativeMediaStatus: {
          playerState: 'PLAYING',
          mediaInfo: {
            contentId: 'live://x',
            adBreakClips: [{ adBreakClipId: 'clipA', duration: 30, whenSkippable: 5 }],
          },
          adBreakStatus: {
            adBreakId: 'break1',
            adBreakClipId: 'unknown',
            currentAdBreakTime: 1,
            currentAdBreakClipTime: 1,
          },
        },
      })
    );
    expect(next.castState.media.currentAdBreakClip).toBeNull();
  });

  test('null when mediaInfo.adBreakClips is missing (bridge without patch)', () => {
    const next = castReducer(
      baseInitial(),
      buildSyncPayload({
        nativeMediaStatus: {
          playerState: 'PLAYING',
          mediaInfo: { contentId: 'live://x' },
          adBreakStatus: {
            adBreakId: 'break1',
            adBreakClipId: 'clipA',
            currentAdBreakTime: 1,
            currentAdBreakClipTime: 1,
          },
        },
      })
    );
    expect(next.castState.media.currentAdBreakClip).toBeNull();
  });
});

const buildAdActive = (clipOverrides: any, statusOverrides: any) =>
  buildSyncPayload({
    nativeMediaStatus: {
      playerState: 'PLAYING',
      mediaInfo: {
        contentId: 'live://x',
        adBreakClips: [{ adBreakClipId: 'A', duration: 30, ...clipOverrides }],
      },
      adBreakStatus: {
        adBreakId: 'b1',
        adBreakClipId: 'A',
        currentAdBreakTime: 0,
        currentAdBreakClipTime: 0,
        ...statusOverrides,
      },
    },
  });

describe('castReducer — canSkipAd / secondsUntilSkippable', () => {
  test('whenSkippable=5, elapsed=2 → canSkip=false, countdown=3', () => {
    const next = castReducer(
      baseInitial(),
      buildAdActive({ whenSkippable: 5 }, { currentAdBreakClipTime: 2 })
    );
    expect(next.castState.media.canSkipAd).toBe(false);
    expect(next.castState.media.secondsUntilSkippable).toBe(3);
  });

  test('whenSkippable=5, elapsed=5 → canSkip=true, countdown=0', () => {
    const next = castReducer(
      baseInitial(),
      buildAdActive({ whenSkippable: 5 }, { currentAdBreakClipTime: 5 })
    );
    expect(next.castState.media.canSkipAd).toBe(true);
    expect(next.castState.media.secondsUntilSkippable).toBe(0);
  });

  test('whenSkippable=5, elapsed=8 → canSkip=true, countdown=0 (clamped)', () => {
    const next = castReducer(
      baseInitial(),
      buildAdActive({ whenSkippable: 5 }, { currentAdBreakClipTime: 8 })
    );
    expect(next.castState.media.canSkipAd).toBe(true);
    expect(next.castState.media.secondsUntilSkippable).toBe(0);
  });

  test('fallback C — whenSkippable=null, elapsed=2 → canSkip=false, countdown=null', () => {
    const next = castReducer(
      baseInitial(),
      buildAdActive({ whenSkippable: null }, { currentAdBreakClipTime: 2 })
    );
    expect(next.castState.media.canSkipAd).toBe(false);
    expect(next.castState.media.secondsUntilSkippable).toBeNull();
  });

  test('fallback C — whenSkippable=null, elapsed=5 → canSkip=true, countdown=null', () => {
    const next = castReducer(
      baseInitial(),
      buildAdActive({ whenSkippable: null }, { currentAdBreakClipTime: 5 })
    );
    expect(next.castState.media.canSkipAd).toBe(true);
    expect(next.castState.media.secondsUntilSkippable).toBeNull();
  });

  test('whenSkippable=2.4, elapsed=0 → countdown=3 (Math.ceil)', () => {
    const next = castReducer(
      baseInitial(),
      buildAdActive({ whenSkippable: 2.4 }, { currentAdBreakClipTime: 0 })
    );
    expect(next.castState.media.secondsUntilSkippable).toBe(3);
  });
});
