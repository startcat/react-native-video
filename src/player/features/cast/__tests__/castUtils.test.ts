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

describe('castReducer — adClipSkippableAt (sync anchor)', () => {
  test('null when no ad is active', () => {
    const next = castReducer(baseInitial(), buildSyncPayload());
    expect(next.castState.media.adClipSkippableAt).toBeNull();
  });

  test('null when whenSkippable is null (fallback path, no countdown to anchor)', () => {
    const next = castReducer(
      baseInitial(),
      buildAdActive({ whenSkippable: null }, { currentAdBreakClipTime: 1 })
    );
    expect(next.castState.media.adClipSkippableAt).toBeNull();
  });

  test('anchors at now + remaining*1000 using fractional seconds (not Math.ceil)', () => {
    const fixedNow = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
    const next = castReducer(
      baseInitial(),
      buildAdActive({ whenSkippable: 5 }, { currentAdBreakClipTime: 2.4 })
    );
    // 5 - 2.4 = 2.6s remaining → expires at now + 2600
    expect(next.castState.media.adClipSkippableAt).toBe(fixedNow + 2600);
    jest.restoreAllMocks();
  });

  test('anchors at now (now + 0) when already skippable', () => {
    const fixedNow = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
    const next = castReducer(
      baseInitial(),
      buildAdActive({ whenSkippable: 5 }, { currentAdBreakClipTime: 8 })
    );
    expect(next.castState.media.adClipSkippableAt).toBe(fixedNow);
    jest.restoreAllMocks();
  });

  test('PRESERVES anchor across stream-position updates when receiver clip time has not changed', () => {
    const T0 = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(T0);
    const after1 = castReducer(
      baseInitial(),
      buildAdActive({ whenSkippable: 5 }, { currentAdBreakClipTime: 2.4 })
    );
    const firstAnchor = after1.castState.media.adClipSkippableAt;
    expect(firstAnchor).toBe(T0 + 2600);

    jest.spyOn(Date, 'now').mockReturnValue(T0 + 1000);
    const after2 = castReducer(
      { ...after1, logger: null } as any,
      buildSyncPayload({
        nativeStreamPosition: 101,
        nativeMediaStatus: {
          playerState: 'PLAYING',
          mediaInfo: {
            contentId: 'live://x',
            adBreakClips: [{ adBreakClipId: 'A', duration: 30, whenSkippable: 5 }],
          },
          adBreakStatus: {
            adBreakId: 'b1',
            adBreakClipId: 'A',
            currentAdBreakTime: 0,
            currentAdBreakClipTime: 2.4,
          },
        },
      })
    );
    expect(after2.castState.media.adClipSkippableAt).toBe(firstAnchor);
    jest.restoreAllMocks();
  });

  test('RE-ANCHORS when receiver pushes a new currentAdBreakClipTime', () => {
    const T0 = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(T0);
    const after1 = castReducer(
      baseInitial(),
      buildAdActive({ whenSkippable: 5 }, { currentAdBreakClipTime: 2.4 })
    );
    expect(after1.castState.media.adClipSkippableAt).toBe(T0 + 2600);

    const T1 = T0 + 800;
    jest.spyOn(Date, 'now').mockReturnValue(T1);
    const after2 = castReducer(
      { ...after1, logger: null } as any,
      buildAdActive({ whenSkippable: 5 }, { currentAdBreakClipTime: 3.2 })
    );
    expect(after2.castState.media.adClipSkippableAt).toBe(T1 + 1800);
    jest.restoreAllMocks();
  });

  test('RE-ANCHORS when the ad clip changes mid-pod', () => {
    const T0 = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(T0);
    const after1 = castReducer(
      baseInitial(),
      buildSyncPayload({
        nativeMediaStatus: {
          playerState: 'PLAYING',
          mediaInfo: {
            contentId: 'live://x',
            adBreakClips: [
              { adBreakClipId: 'A', duration: 15, whenSkippable: 5 },
              { adBreakClipId: 'B', duration: 30, whenSkippable: 7 },
            ],
          },
          adBreakStatus: {
            adBreakId: 'b1',
            adBreakClipId: 'A',
            currentAdBreakTime: 14,
            currentAdBreakClipTime: 4,
          },
        },
      })
    );
    expect(after1.castState.media.adClipSkippableAt).toBe(T0 + 1000);

    const T1 = T0 + 1500;
    jest.spyOn(Date, 'now').mockReturnValue(T1);
    const after2 = castReducer(
      { ...after1, logger: null } as any,
      buildSyncPayload({
        nativeMediaStatus: {
          playerState: 'PLAYING',
          mediaInfo: {
            contentId: 'live://x',
            adBreakClips: [
              { adBreakClipId: 'A', duration: 15, whenSkippable: 5 },
              { adBreakClipId: 'B', duration: 30, whenSkippable: 7 },
            ],
          },
          adBreakStatus: {
            adBreakId: 'b1',
            adBreakClipId: 'B',
            currentAdBreakTime: 15,
            currentAdBreakClipTime: 0,
          },
        },
      })
    );
    expect(after2.castState.media.adClipSkippableAt).toBe(T1 + 7000);
    jest.restoreAllMocks();
  });
});
