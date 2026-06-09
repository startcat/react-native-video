const respondToBrowseRequest = jest.fn().mockResolvedValue(true);
const respondToSearchRequest = jest.fn().mockResolvedValue(true);

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {
    AndroidAutoModule: {
      enable: jest.fn().mockResolvedValue(true),
      setJavaScriptReady: jest.fn().mockResolvedValue(true),
      respondToBrowseRequest,
      respondToSearchRequest,
    },
  },
  DeviceEventEmitter: { addListener: jest.fn(() => ({ remove: jest.fn() })) },
  NativeEventEmitter: jest.fn(() => ({ addListener: jest.fn(() => ({ remove: jest.fn() })) })),
}));

import { AndroidAutoControl } from '../AndroidAutoControl';

describe('Android Auto dynamic round-trip (PLAYER-267 FASE 6)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forwards an onBrowseRequest callback result to native respondToBrowseRequest', async () => {
    const items = [{ id: 'a', title: 'A', browsable: true }];
    AndroidAutoControl.onBrowseRequest(async () => items as any);
    // @ts-expect-error exercise the private handler via the registered listener path
    await AndroidAutoControl['handleBrowseRequest']({ requestId: 'r1', parentId: 'root' });
    expect(respondToBrowseRequest).toHaveBeenCalledWith('root', items);
  });

  it('forwards an onSearch callback result to native respondToSearchRequest', async () => {
    const results = [{ id: 's', title: 'S', playable: true }];
    AndroidAutoControl.onSearch(() => results as any);
    // @ts-expect-error exercise the private handler
    AndroidAutoControl['handleSearchRequest']({ query: 'jazz' });
    await Promise.resolve();
    await Promise.resolve();
    expect(respondToSearchRequest).toHaveBeenCalledWith('jazz', results);
  });
});
