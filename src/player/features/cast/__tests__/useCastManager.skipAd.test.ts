// performSkipAd is a pure helper with no React-Native dependencies.
// It is re-exported from ../hooks/useCastManager (which carries heavy
// native imports), so we import directly from the utils file to keep
// the test fast and dependency-free.
import { performSkipAd } from '../utils/performSkipAd';

describe('performSkipAd', () => {
  const makeLogger = () => ({
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  });

  test('returns false when client is null', async () => {
    const logger = makeLogger();
    const result = await performSkipAd({
      client: null,
      isPlayingAd: true,
      logger: logger as any,
    });
    expect(result).toBe(false);
  });

  test('returns false when no ad is playing (no native call)', async () => {
    const logger = makeLogger();
    const skipAdMock = jest.fn();
    const result = await performSkipAd({
      client: { skipAd: skipAdMock } as any,
      isPlayingAd: false,
      logger: logger as any,
    });
    expect(result).toBe(false);
    expect(skipAdMock).not.toHaveBeenCalled();
  });

  test('returns true when client.skipAd resolves', async () => {
    const logger = makeLogger();
    const skipAdMock = jest.fn().mockResolvedValue(undefined);
    const result = await performSkipAd({
      client: { skipAd: skipAdMock } as any,
      isPlayingAd: true,
      logger: logger as any,
    });
    expect(result).toBe(true);
    expect(skipAdMock).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalled();
  });

  test('returns false when client.skipAd rejects (no throw)', async () => {
    const logger = makeLogger();
    const skipAdMock = jest.fn().mockRejectedValue(new Error('receiver rejected'));
    const result = await performSkipAd({
      client: { skipAd: skipAdMock } as any,
      isPlayingAd: true,
      logger: logger as any,
    });
    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });
});
