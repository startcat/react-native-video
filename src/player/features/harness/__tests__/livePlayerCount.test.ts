jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: { HarnessModule: { livePlayerCount: jest.fn().mockResolvedValue(1) } },
}));

import { livePlayerCount } from '../livePlayerCount';

describe('livePlayerCount (S1 invariant accessor)', () => {
  it('returns the native live audio-player count', async () => {
    await expect(livePlayerCount()).resolves.toBe(1);
  });

  it('asserts the single-player invariant (count <= 1)', async () => {
    const count = await livePlayerCount();
    expect(count).toBeLessThanOrEqual(1);
  });
});
