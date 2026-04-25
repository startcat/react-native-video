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
