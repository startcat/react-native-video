/**
 * PLAYER-269 Phase 2 — JS unit test for PlaylistControl.getPlaybackState passthrough.
 *
 * Verifies the TS surface that exposes playback-mode state used by the harness and
 * PLAYER-269 kill-switch gate assertions.  Pure JS — no native device required.
 */

jest.mock('react-native', () => ({
  NativeModules: {
    PlaylistControlModule: {
      getPlaybackState: jest.fn(),
      // stub required constants/events so module-level code doesn't throw
      EVENT_ITEM_CHANGED: 'onPlaylistItemChanged',
      EVENT_ITEM_STARTED: 'onPlaylistItemStarted',
      EVENT_ITEM_COMPLETED: 'onPlaylistItemCompleted',
      EVENT_ITEM_ERROR: 'onPlaylistItemError',
      EVENT_PLAYLIST_ENDED: 'onPlaylistEnded',
      EVENT_PROGRESS_UPDATED: 'onProgressUpdated',
      EVENT_CONTROL_ACTION: 'onControlAction',
      EVENT_PLAYBACK_STATE_CHANGED: 'onPlaybackStateChanged',
    },
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn(),
    removeAllListeners: jest.fn(),
  })),
  Platform: { OS: 'android' },
}));

import { PlaylistControl } from '../PlaylistControl';

describe('PlaylistControl.getPlaybackState (PLAYER-269 Phase 2)', () => {
  it('returns standalone mode state from the native module', async () => {
    const { NativeModules } = require('react-native');
    NativeModules.PlaylistControlModule.getPlaybackState.mockResolvedValue({
      mode: 'standalone',
      isPlaying: true,
      position: 12,
      currentIndex: 0,
      totalItems: 3,
    });
    const state = await PlaylistControl.getPlaybackState();
    expect(state.mode).toBe('standalone');
    expect(state.isPlaying).toBe(true);
    expect(state.position).toBe(12);
  });

  it('returns coordinated mode state from the native module', async () => {
    const { NativeModules } = require('react-native');
    NativeModules.PlaylistControlModule.getPlaybackState.mockResolvedValue({
      mode: 'coordinated',
      currentIndex: 2,
      totalItems: 5,
    });
    const state = await PlaylistControl.getPlaybackState();
    expect(state.mode).toBe('coordinated');
    expect(state.currentIndex).toBe(2);
  });
});
