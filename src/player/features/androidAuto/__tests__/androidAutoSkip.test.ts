// src/player/features/androidAuto/__tests__/androidAutoSkip.test.ts
// PLAYER-268: tests the AndroidAutoControl.onSkipToNext/Previous register/dispatch/unsubscribe contract.
// Uses a minimal functional DeviceEventEmitter stub (addListener + emit) so we can verify the
// full dispatch path without requiring a real RN runtime.

type Listener = (...args: unknown[]) => void;

// Shared listener store — persists across tests so class-registered listeners survive beforeEach.
const listeners: Record<string, Listener[]> = {};

const DeviceEventEmitterStub = {
  addListener: (event: string, cb: Listener) => {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
    return {
      remove: () => {
        listeners[event] = (listeners[event] || []).filter(l => l !== cb);
      },
    };
  },
  emit: (event: string, ...args: unknown[]) => {
    (listeners[event] || []).forEach(l => l(...args));
  },
  removeAllListeners: (event: string) => {
    listeners[event] = [];
  },
};

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {
    AndroidAutoModule: {
      enable: jest.fn().mockResolvedValue(true),
      disable: jest.fn().mockResolvedValue(true),
    },
  },
  DeviceEventEmitter: DeviceEventEmitterStub,
  NativeEventEmitter: jest.fn(() => ({ addListener: jest.fn(() => ({ remove: jest.fn() })) })),
}));

import { AndroidAutoControl } from '../AndroidAutoControl';

// Trigger AndroidAutoControl to register its DeviceEventEmitter listeners.
// initializeEventSystem is private; we call enable() on Android to invoke it.
// Since enable() calls the native module (mocked) we can call it synchronously here.
beforeAll(async () => {
  // enable() registers subscriptions via setupEventListeners()
  await AndroidAutoControl.enable().catch(() => { /* ignore if already enabled */ });
});

describe('AndroidAutoControl skip-to-next/previous callbacks (PLAYER-268)', () => {
  it('invokes the registered onSkipToNext callback when the native event fires', () => {
    const cb = jest.fn();
    const unsub = AndroidAutoControl.onSkipToNext(cb);

    DeviceEventEmitterStub.emit('onSkipToNext', {});
    expect(cb).toHaveBeenCalledTimes(1);

    unsub(); // clears skipToNextCallback → next emit should NOT call cb
    DeviceEventEmitterStub.emit('onSkipToNext', {});
    expect(cb).toHaveBeenCalledTimes(1); // still 1 — not called after unsubscribe
  });

  it('invokes the registered onSkipToPrevious callback when the native event fires', () => {
    const cb = jest.fn();
    AndroidAutoControl.onSkipToPrevious(cb);

    DeviceEventEmitterStub.emit('onSkipToPrevious', {});
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('only invokes the most-recently registered onSkipToNext (last-writer-wins, single active)', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    AndroidAutoControl.onSkipToNext(cb1);
    AndroidAutoControl.onSkipToNext(cb2); // replaces cb1

    DeviceEventEmitterStub.emit('onSkipToNext', {});
    expect(cb1).toHaveBeenCalledTimes(0); // replaced
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});
