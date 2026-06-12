/**
 * PLAYER-312 — handleNativeItemChanged: el id del nativo manda sobre el índice.
 *
 * El incidente de PLAYER-301 cubrió la divergencia nativo > JS (índice fuera de rango →
 * fallback por itemId). Esta suite cubre además la divergencia INVERSA (índice válido pero
 * apuntando al item EQUIVOCADO): nunca se debe emitir un ITEM_CHANGED cuyo currentItem no
 * case con el itemId que reporta el nativo.
 */

jest.mock('react-native', () => ({
  NativeModules: {
    PlaylistControlModule: {
      getPlaybackState: jest.fn(),
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

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

// El singleton se instancia al cargar el módulo y Logger lee el global __DEV__ (RN runtime):
// definirlo ANTES de cargar — por eso require y no import (los import se hoistean).
(global as any).__DEV__ = false;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PlaylistsManager } = require('../PlaylistsManager');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PlaylistEventType } = require('../types');

const ITEMS = [
  { id: 'ep-1', metadata: { title: 'Episodio 1' } },
  { id: 'ep-2', metadata: { title: 'Episodio 2' } },
  { id: 'ep-3', metadata: { title: 'Episodio 3' } },
];

function setup() {
  const manager = PlaylistsManager.getInstance() as any;
  manager.items = ITEMS.map((i) => ({ ...i }));
  manager.currentIndex = 0;
  const received: any[] = [];
  manager.eventEmitter.removeAllListeners(PlaylistEventType.ITEM_CHANGED);
  manager.eventEmitter.on(PlaylistEventType.ITEM_CHANGED, (data: any) => received.push(data));
  return { manager, received };
}

describe('PlaylistsManager.handleNativeItemChanged (PLAYER-312)', () => {
  it('índice y id coherentes → emite el item del índice', () => {
    const { manager, received } = setup();
    manager.handleNativeItemChanged({ index: 1, itemId: 'ep-2' });
    expect(received).toHaveLength(1);
    expect(received[0].currentItem?.id).toBe('ep-2');
    expect(manager.currentIndex).toBe(1);
  });

  it('índice válido pero id de OTRO item → resuelve por id, no por índice', () => {
    const { manager, received } = setup();
    // divergencia inversa: el nativo dice índice 0 pero el item que suena es ep-3
    manager.handleNativeItemChanged({ index: 0, itemId: 'ep-3' });
    expect(received).toHaveLength(1);
    expect(received[0].currentItem?.id).toBe('ep-3');
    expect(manager.currentIndex).toBe(2);
  });

  it('índice válido pero id desconocido en el store → emite SIN currentItem (nunca el equivocado)', () => {
    const { manager, received } = setup();
    manager.handleNativeItemChanged({ index: 0, itemId: 'fantasma-99' });
    expect(received).toHaveLength(1);
    expect(received[0].currentItem).toBeUndefined();
  });

  it('PLAYER-301 (regresión): índice fuera de rango + id conocido → resuelve por id', () => {
    const { manager, received } = setup();
    manager.handleNativeItemChanged({ index: 7, itemId: 'ep-1' });
    expect(received).toHaveLength(1);
    expect(received[0].currentItem?.id).toBe('ep-1');
    expect(manager.currentIndex).toBe(0);
  });
});
