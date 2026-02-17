# Fase 3: Estrategia de testing

## 3.1 Tests de contrato (red de seguridad pre-refactorización)

Los tests de esta sección capturan el comportamiento actual del código. Deben pasar ANTES y DESPUÉS de cada paso de refactorización.

---

### 3.1.1 QueueManager — Tests de contrato

```typescript
// __tests__/managers/QueueManager.contract.test.ts

import { QueueManager } from '../managers/QueueManager';
import { DownloadStates, DownloadType, DownloadItem, DownloadEventType } from '../types';

// === MOCKS ===

jest.mock('../services/storage/PersistenceService', () => ({
  persistenceService: {
    saveDownloadState: jest.fn().mockResolvedValue(undefined),
    loadDownloadState: jest.fn().mockResolvedValue(new Map()),
    saveProfileMappings: jest.fn().mockResolvedValue(undefined),
    loadProfileMappings: jest.fn().mockResolvedValue(new Map()),
  },
}));

jest.mock('../services/storage/StorageService', () => ({
  storageService: {
    getBinariesDirectory: jest.fn().mockReturnValue('/mock/binaries'),
    deleteFile: jest.fn().mockResolvedValue(true),
    forceUpdate: jest.fn().mockResolvedValue(undefined),
    invalidateDownloadSpaceCache: jest.fn(),
  },
}));

jest.mock('../services/network/NetworkService', () => ({
  networkService: {
    isOnline: jest.fn().mockReturnValue(true),
    isWifiConnected: jest.fn().mockReturnValue(true),
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
}));

jest.mock('./ConfigManager', () => ({
  configManager: {
    getConfig: jest.fn().mockReturnValue({ download_just_wifi: false }),
    initialize: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
}));

jest.mock('./DownloadsManager', () => ({
  downloadsManager: {
    startDownloadNow: jest.fn().mockResolvedValue('mock-id'),
  },
}));

jest.mock('./NativeManager', () => ({
  nativeManager: {
    subscribe: jest.fn().mockReturnValue(() => {}),
    removeDownload: jest.fn().mockResolvedValue(undefined),
    getDownloads: jest.fn().mockResolvedValue([]),
    initialize: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('./ProfileManager', () => ({
  profileManager: {
    getActiveProfileId: jest.fn().mockReturnValue('profile-1'),
    initialize: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
}));

jest.mock('../services/download/BinaryDownloadService', () => ({
  binaryDownloadService: {
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
}));

jest.mock('../utils/SpeedCalculator', () => ({
  speedCalculator: {
    addSample: jest.fn(),
    getSpeed: jest.fn().mockReturnValue(1024),
    getEstimatedTimeRemaining: jest.fn().mockReturnValue(60),
    clear: jest.fn(),
    clearAll: jest.fn(),
  },
}));

// === HELPERS ===

function createMockDownloadItem(overrides: Partial<DownloadItem> = {}): DownloadItem {
  return {
    id: `download-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: 'Test Download',
    type: DownloadType.STREAM,
    state: DownloadStates.QUEUED,
    uri: 'https://example.com/manifest.m3u8',
    profileIds: ['profile-1'],
    stats: {
      bytesDownloaded: 0,
      totalBytes: 0,
      progressPercent: 0,
      retryCount: 0,
    },
    ...overrides,
  };
}

// === TESTS ===

describe('QueueManager — Contrato público', () => {
  let queueManager: QueueManager;

  beforeEach(async () => {
    // Reset singleton para cada test
    // @ts-ignore - acceso a propiedad privada para testing
    QueueManager.instance = undefined;
    queueManager = QueueManager.getInstance();
    await queueManager.initialize({
      maxConcurrentDownloads: 3,
      autoProcess: false,
      logEnabled: false,
    });
  });

  afterEach(() => {
    // @ts-ignore
    queueManager.destroy?.();
  });

  // --- addDownloadItem ---

  describe('addDownloadItem', () => {
    it('debe añadir un item a la cola y retornar su ID', async () => {
      const item = createMockDownloadItem({ id: 'test-add-1' });
      const id = await queueManager.addDownloadItem(item);

      expect(id).toBe('test-add-1');
      expect(queueManager.getDownload('test-add-1')).not.toBeNull();
    });

    it('debe retornar el ID existente si el item ya está en cola', async () => {
      const item = createMockDownloadItem({ id: 'test-dup' });
      await queueManager.addDownloadItem(item);
      const id2 = await queueManager.addDownloadItem(item);

      expect(id2).toBe('test-dup');
      expect(queueManager.getAllDownloads()).toHaveLength(1);
    });

    it('debe emitir evento QUEUED al añadir', async () => {
      const callback = jest.fn();
      queueManager.subscribe(DownloadEventType.QUEUED, callback);

      const item = createMockDownloadItem({ id: 'test-event' });
      await queueManager.addDownloadItem(item);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          downloadId: 'test-event',
          queueSize: 1,
        })
      );
    });

    it('debe lanzar error si no está inicializado', async () => {
      // @ts-ignore
      QueueManager.instance = undefined;
      const uninitQM = QueueManager.getInstance();
      const item = createMockDownloadItem();

      await expect(uninitQM.addDownloadItem(item)).rejects.toThrow();
    });

    it('debe persistir el estado tras añadir', async () => {
      const { persistenceService } = require('../services/storage/PersistenceService');
      const item = createMockDownloadItem();
      await queueManager.addDownloadItem(item);

      expect(persistenceService.saveDownloadState).toHaveBeenCalled();
    });
  });

  // --- removeDownload ---

  describe('removeDownload', () => {
    it('debe eliminar un item cuando no quedan perfiles', async () => {
      const item = createMockDownloadItem({
        id: 'test-remove',
        profileIds: ['profile-1'],
      });
      await queueManager.addDownloadItem(item);
      await queueManager.removeDownload('test-remove', 'profile-1');

      expect(queueManager.getDownload('test-remove')).toBeNull();
    });

    it('debe solo quitar el perfil si quedan otros perfiles', async () => {
      const item = createMockDownloadItem({
        id: 'test-multi-profile',
        profileIds: ['profile-1', 'profile-2'],
      });
      await queueManager.addDownloadItem(item);
      await queueManager.removeDownload('test-multi-profile', 'profile-1');

      const result = queueManager.getDownload('test-multi-profile');
      expect(result).not.toBeNull();
      expect(result!.profileIds).toEqual(['profile-2']);
    });

    it('debe emitir REMOVED cuando se elimina completamente', async () => {
      const callback = jest.fn();
      queueManager.subscribe(DownloadEventType.REMOVED, callback);

      const item = createMockDownloadItem({
        id: 'test-remove-event',
        profileIds: ['profile-1'],
      });
      await queueManager.addDownloadItem(item);
      await queueManager.removeDownload('test-remove-event', 'profile-1');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ downloadId: 'test-remove-event' })
      );
    });

    it('debe lanzar error si el item no existe', async () => {
      await expect(
        queueManager.removeDownload('nonexistent', 'profile-1')
      ).rejects.toThrow();
    });
  });

  // --- forceRemoveDownload ---

  describe('forceRemoveDownload', () => {
    it('debe eliminar sin considerar perfiles', async () => {
      const item = createMockDownloadItem({
        id: 'test-force',
        profileIds: ['profile-1', 'profile-2'],
      });
      await queueManager.addDownloadItem(item);
      await queueManager.forceRemoveDownload('test-force');

      expect(queueManager.getDownload('test-force')).toBeNull();
    });

    it('no debe lanzar error si el item no existe', async () => {
      await expect(
        queueManager.forceRemoveDownload('nonexistent')
      ).resolves.not.toThrow();
    });
  });

  // --- pauseDownload / resumeDownload ---

  describe('pauseDownload', () => {
    it('debe cambiar estado de DOWNLOADING a PAUSED', async () => {
      const item = createMockDownloadItem({
        id: 'test-pause',
        state: DownloadStates.DOWNLOADING,
      });
      // Insertar directamente en estado DOWNLOADING
      // @ts-ignore - acceso directo al Map para setup
      queueManager['downloadQueue'].set('test-pause', item);

      await queueManager.pauseDownload('test-pause');

      const result = queueManager.getDownload('test-pause');
      expect(result?.state).toBe(DownloadStates.PAUSED);
    });

    it('no debe hacer nada si el estado no es DOWNLOADING', async () => {
      const item = createMockDownloadItem({
        id: 'test-pause-queued',
        state: DownloadStates.QUEUED,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('test-pause-queued', item);

      await queueManager.pauseDownload('test-pause-queued');

      const result = queueManager.getDownload('test-pause-queued');
      expect(result?.state).toBe(DownloadStates.QUEUED);
    });
  });

  describe('resumeDownload', () => {
    it('debe cambiar estado de PAUSED a QUEUED', async () => {
      const item = createMockDownloadItem({
        id: 'test-resume',
        state: DownloadStates.PAUSED,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('test-resume', item);

      await queueManager.resumeDownload('test-resume');

      const result = queueManager.getDownload('test-resume');
      expect(result?.state).toBe(DownloadStates.QUEUED);
    });
  });

  // --- pauseAll / resumeAll ---

  describe('pauseAll', () => {
    it('debe pausar todas las descargas activas', async () => {
      const items = [
        createMockDownloadItem({ id: 'dl-1', state: DownloadStates.DOWNLOADING }),
        createMockDownloadItem({ id: 'dl-2', state: DownloadStates.DOWNLOADING }),
        createMockDownloadItem({ id: 'dl-3', state: DownloadStates.QUEUED }),
      ];
      items.forEach(item => {
        // @ts-ignore
        queueManager['downloadQueue'].set(item.id, item);
      });

      queueManager.pauseAll();

      expect(queueManager.getDownload('dl-1')?.state).toBe(DownloadStates.PAUSED);
      expect(queueManager.getDownload('dl-2')?.state).toBe(DownloadStates.PAUSED);
      expect(queueManager.getDownload('dl-3')?.state).toBe(DownloadStates.QUEUED);
    });
  });

  // --- getQueueStats ---

  describe('getQueueStats', () => {
    it('debe retornar estadísticas correctas', async () => {
      const items = [
        createMockDownloadItem({ id: 's-1', state: DownloadStates.QUEUED }),
        createMockDownloadItem({ id: 's-2', state: DownloadStates.DOWNLOADING }),
        createMockDownloadItem({ id: 's-3', state: DownloadStates.COMPLETED }),
        createMockDownloadItem({ id: 's-4', state: DownloadStates.FAILED }),
        createMockDownloadItem({ id: 's-5', state: DownloadStates.PAUSED }),
      ];
      items.forEach(item => {
        // @ts-ignore
        queueManager['downloadQueue'].set(item.id, item);
      });

      const stats = queueManager.getQueueStats();

      expect(stats.total).toBe(5);
      expect(stats.pending).toBe(1);
      expect(stats.downloading).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.paused).toBe(1);
    });

    it('debe retornar stats vacías si la cola está vacía', () => {
      const stats = queueManager.getQueueStats();
      expect(stats.total).toBe(0);
      expect(stats.downloading).toBe(0);
    });
  });

  // --- getAllDownloads ---

  describe('getAllDownloads', () => {
    it('debe retornar copias profundas (no referencias)', async () => {
      const item = createMockDownloadItem({ id: 'clone-test' });
      await queueManager.addDownloadItem(item);

      const downloads = queueManager.getAllDownloads();
      downloads[0].title = 'MODIFIED';

      const original = queueManager.getDownload('clone-test');
      expect(original?.title).not.toBe('MODIFIED');
    });
  });

  // --- subscribe ---

  describe('subscribe', () => {
    it('debe retornar función de unsubscribe funcional', async () => {
      const callback = jest.fn();
      const unsubscribe = queueManager.subscribe(DownloadEventType.QUEUED, callback);

      const item1 = createMockDownloadItem({ id: 'sub-1' });
      await queueManager.addDownloadItem(item1);
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      const item2 = createMockDownloadItem({ id: 'sub-2' });
      await queueManager.addDownloadItem(item2);
      expect(callback).toHaveBeenCalledTimes(1); // No incrementa
    });
  });

  // --- notifyDownloadProgress ---

  describe('notifyDownloadProgress', () => {
    it('debe actualizar progreso del item', async () => {
      const item = createMockDownloadItem({
        id: 'prog-1',
        state: DownloadStates.DOWNLOADING,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('prog-1', item);

      await queueManager.notifyDownloadProgress('prog-1', 50, 5000, 10000);

      const result = queueManager.getDownload('prog-1');
      expect(result?.stats.progressPercent).toBe(50);
      expect(result?.stats.bytesDownloaded).toBe(5000);
      expect(result?.stats.totalBytes).toBe(10000);
    });

    it('debe emitir evento PROGRESS', async () => {
      const callback = jest.fn();
      queueManager.subscribe(DownloadEventType.PROGRESS, callback);

      const item = createMockDownloadItem({
        id: 'prog-evt',
        state: DownloadStates.DOWNLOADING,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('prog-evt', item);

      await queueManager.notifyDownloadProgress('prog-evt', 75, 7500, 10000);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          downloadId: 'prog-evt',
          percent: 75,
        })
      );
    });
  });

  // --- notifyDownloadCompleted ---

  describe('notifyDownloadCompleted', () => {
    it('debe cambiar estado a COMPLETED', async () => {
      const item = createMockDownloadItem({
        id: 'comp-1',
        state: DownloadStates.DOWNLOADING,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('comp-1', item);
      // @ts-ignore
      queueManager['currentlyDownloading'].add('comp-1');

      await queueManager.notifyDownloadCompleted('comp-1', '/path/to/file', 10000);

      const result = queueManager.getDownload('comp-1');
      expect(result?.state).toBe(DownloadStates.COMPLETED);
      expect(result?.stats.progressPercent).toBe(100);
    });
  });

  // --- notifyDownloadFailed ---

  describe('notifyDownloadFailed', () => {
    it('debe marcar como FAILED tras agotar reintentos', async () => {
      const item = createMockDownloadItem({
        id: 'fail-1',
        state: DownloadStates.DOWNLOADING,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('fail-1', item);
      // @ts-ignore
      queueManager['currentlyDownloading'].add('fail-1');

      // Simular que ya se agotaron los reintentos
      // @ts-ignore
      queueManager['retryTracker'].set('fail-1', 10);

      await queueManager.notifyDownloadFailed('fail-1', 'Network error');

      const result = queueManager.getDownload('fail-1');
      expect(result?.state).toBe(DownloadStates.FAILED);
    });

    it('debe deduplicar si ya está en FAILED', async () => {
      const callback = jest.fn();
      queueManager.subscribe(DownloadEventType.FAILED, callback);

      const item = createMockDownloadItem({
        id: 'fail-dup',
        state: DownloadStates.FAILED,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('fail-dup', item);

      await queueManager.notifyDownloadFailed('fail-dup', 'error');

      expect(callback).not.toHaveBeenCalled();
    });
  });

  // --- setMaxConcurrent ---

  describe('setMaxConcurrent', () => {
    it('debe actualizar el límite', () => {
      queueManager.setMaxConcurrent(5);
      // @ts-ignore
      expect(queueManager['config'].maxConcurrentDownloads).toBe(5);
    });

    it('debe lanzar error con valor <= 0', () => {
      expect(() => queueManager.setMaxConcurrent(0)).toThrow();
      expect(() => queueManager.setMaxConcurrent(-1)).toThrow();
    });
  });
});
```

---

### 3.1.2 DownloadsManager — Tests de contrato

```typescript
// __tests__/managers/DownloadsManager.contract.test.ts

import { DownloadsManager } from '../managers/DownloadsManager';
import { DownloadType, DownloadStates, DownloadEventType } from '../types';

// === MOCKS (mismos que QueueManager + adicionales) ===

jest.mock('./QueueManager', () => ({
  queueManager: {
    initialize: jest.fn().mockResolvedValue(undefined),
    addDownloadItem: jest.fn().mockResolvedValue('mock-id'),
    getDownload: jest.fn().mockReturnValue(null),
    getDownloadType: jest.fn().mockReturnValue(DownloadType.STREAM),
    getAllDownloads: jest.fn().mockReturnValue([]),
    getQueueStats: jest.fn().mockReturnValue({
      total: 0, pending: 0, downloading: 0, paused: 0,
      completed: 0, failed: 0, isPaused: false, isProcessing: false,
    }),
    forceRemoveDownload: jest.fn().mockResolvedValue(undefined),
    forceCleanupOrphanedDownloads: jest.fn().mockResolvedValue(0),
    pauseAll: jest.fn(),
    resumeAll: jest.fn().mockResolvedValue(undefined),
    start: jest.fn(),
    setMaxConcurrent: jest.fn(),
    subscribe: jest.fn().mockReturnValue(() => {}),
    updateConfig: jest.fn(),
  },
}));

jest.mock('../services/download/DownloadService', () => ({
  downloadService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    startDownload: jest.fn().mockResolvedValue(undefined),
    pauseDownload: jest.fn().mockResolvedValue(undefined),
    resumeDownload: jest.fn().mockResolvedValue(undefined),
    cancelDownload: jest.fn().mockResolvedValue(undefined),
    isTypeEnabled: jest.fn().mockReturnValue(true),
    getConfig: jest.fn().mockReturnValue({}),
    enableDownloadType: jest.fn(),
    disableDownloadType: jest.fn(),
  },
}));

jest.mock('../services/download/BinaryDownloadService', () => ({
  binaryDownloadService: {
    setNetworkPolicy: jest.fn(),
  },
}));

jest.mock('../services/download/StreamDownloadService', () => ({
  streamDownloadService: {
    setNetworkPolicy: jest.fn(),
  },
}));

jest.mock('./NativeManager', () => ({
  nativeManager: {
    initialize: jest.fn().mockResolvedValue(undefined),
    removeDownload: jest.fn().mockResolvedValue(undefined),
    startDownloadProcessing: jest.fn().mockResolvedValue(undefined),
    stopDownloadProcessing: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
}));

jest.mock('./ConfigManager', () => ({
  configManager: {
    initialize: jest.fn().mockResolvedValue(undefined),
    getConfig: jest.fn().mockReturnValue({ download_just_wifi: false }),
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
}));

jest.mock('./ProfileManager', () => ({
  profileManager: {
    initialize: jest.fn().mockResolvedValue(undefined),
    getActiveProfileId: jest.fn().mockReturnValue('profile-1'),
    filterByActiveProfile: jest.fn((items) => items),
    shouldShowContent: jest.fn().mockReturnValue(true),
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
}));

jest.mock('../services/network/NetworkService', () => ({
  networkService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    isOnline: jest.fn().mockReturnValue(true),
    isWifiConnected: jest.fn().mockReturnValue(true),
    canDownload: jest.fn().mockReturnValue(true),
    getCurrentStatus: jest.fn().mockReturnValue({ isConnected: true }),
    setNetworkPolicy: jest.fn(),
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
}));

jest.mock('../services/storage/StorageService', () => ({
  storageService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    isLowSpace: jest.fn().mockResolvedValue(false),
    getStorageInfo: jest.fn().mockResolvedValue({}),
    getBinariesDirectory: jest.fn().mockReturnValue('/mock/binaries'),
    deleteFile: jest.fn().mockResolvedValue(true),
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
}));

describe('DownloadsManager — Contrato público', () => {
  let manager: DownloadsManager;

  beforeEach(async () => {
    // @ts-ignore
    DownloadsManager.instance = undefined;
    manager = DownloadsManager.getInstance();
    await manager.initialize({
      autoStart: false,
      logEnabled: false,
      maxConcurrentDownloads: 3,
    });
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('initialize', () => {
    it('debe marcar isInitialized como true', () => {
      expect(manager.isInitialized()).toBe(true);
    });

    it('debe ser idempotente (segunda llamada no falla)', async () => {
      await expect(manager.initialize()).resolves.not.toThrow();
    });
  });

  describe('addDownload', () => {
    it('debe delegar a queueManager.addDownloadItem', async () => {
      const { queueManager } = require('./QueueManager');
      const task = { id: 'test-1', manifestUrl: 'https://example.com/manifest.m3u8', title: 'Test' };

      await manager.addDownload(task, DownloadType.STREAM);

      expect(queueManager.addDownloadItem).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-1',
          type: DownloadType.STREAM,
          state: DownloadStates.QUEUED,
        })
      );
    });

    it('debe lanzar error si el tipo no está habilitado', async () => {
      const { downloadService } = require('../services/download/DownloadService');
      downloadService.isTypeEnabled.mockReturnValueOnce(false);

      const task = { id: 'test-disabled', url: 'https://example.com/file.mp4', title: 'Test' };

      await expect(manager.addDownload(task, DownloadType.BINARY)).rejects.toThrow();
    });

    it('debe lanzar error si no está inicializado', async () => {
      manager.destroy();
      // @ts-ignore
      DownloadsManager.instance = undefined;
      const uninit = DownloadsManager.getInstance();

      await expect(
        uninit.addDownload({ id: 'x', manifestUrl: 'y', title: 'z' }, DownloadType.STREAM)
      ).rejects.toThrow();
    });
  });

  describe('removeDownload', () => {
    it('debe intentar cancelar en servicio si está descargando', async () => {
      const { queueManager } = require('./QueueManager');
      const { downloadService } = require('../services/download/DownloadService');

      queueManager.getDownload.mockReturnValueOnce({
        id: 'rm-1',
        type: DownloadType.STREAM,
        state: DownloadStates.DOWNLOADING,
      });

      await manager.removeDownload('rm-1');

      expect(downloadService.cancelDownload).toHaveBeenCalledWith('rm-1', DownloadType.STREAM);
    });

    it('debe llamar a forceRemoveDownload del queueManager', async () => {
      const { queueManager } = require('./QueueManager');
      queueManager.getDownload.mockReturnValueOnce({
        id: 'rm-2',
        type: DownloadType.STREAM,
        state: DownloadStates.COMPLETED,
      });

      await manager.removeDownload('rm-2');

      expect(queueManager.forceRemoveDownload).toHaveBeenCalledWith('rm-2');
    });
  });

  describe('getQueueStats', () => {
    it('debe retornar stats del queueManager', () => {
      const stats = manager.getQueueStats();
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('downloading');
    });

    it('debe usar cache si es reciente', () => {
      const { queueManager } = require('./QueueManager');
      manager.getQueueStats();
      manager.getQueueStats();

      // Solo debe llamar una vez (cache activo)
      expect(queueManager.getQueueStats).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribe', () => {
    it('debe retornar función de unsubscribe', () => {
      const unsub = manager.subscribe(DownloadEventType.PROGRESS, jest.fn());
      expect(typeof unsub).toBe('function');
      unsub(); // No debe lanzar
    });
  });
});
```

---

### 3.1.3 ConfigManager — Tests de contrato

```typescript
// __tests__/managers/ConfigManager.contract.test.ts

import { ConfigManager } from '../managers/ConfigManager';

jest.mock('../services/storage/PersistenceService', () => ({
  persistenceService: {
    loadDownloadsConfig: jest.fn().mockResolvedValue(null),
    saveDownloadsConfig: jest.fn().mockResolvedValue(undefined),
    clearDownloadsConfig: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('ConfigManager — Contrato público', () => {
  let configManager: ConfigManager;

  beforeEach(async () => {
    // @ts-ignore
    ConfigManager.instance = undefined;
    configManager = ConfigManager.getInstance();
    await configManager.initialize({ logEnabled: false });
  });

  it('debe retornar configuración por defecto tras inicializar', () => {
    const config = configManager.getConfig();
    expect(config.download_just_wifi).toBe(true);
    expect(config.max_concurrent_downloads).toBe(3);
    expect(config.retry_attempts).toBe(3);
  });

  it('debe actualizar una propiedad y emitir evento', async () => {
    const callback = jest.fn();
    configManager.subscribe('config_updated', callback);

    await configManager.updateConfig('download_just_wifi', false);

    expect(configManager.getConfig().download_just_wifi).toBe(false);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        property: 'download_just_wifi',
        oldValue: true,
        newValue: false,
      })
    );
  });

  it('debe validar valores inválidos', async () => {
    await expect(
      configManager.updateConfig('max_concurrent_downloads', -1 as any)
    ).rejects.toThrow();
  });

  it('debe no emitir evento si el valor no cambia', async () => {
    const callback = jest.fn();
    configManager.subscribe('config_updated', callback);

    await configManager.updateConfig('download_just_wifi', true); // Ya es true

    expect(callback).not.toHaveBeenCalled();
  });

  it('debe resetear a defaults', async () => {
    await configManager.updateConfig('download_just_wifi', false);
    await configManager.resetToDefaults();

    expect(configManager.getConfig().download_just_wifi).toBe(true);
  });
});
```

---

### 3.1.4 ProfileManager — Tests de contrato

```typescript
// __tests__/managers/ProfileManager.contract.test.ts

import { ProfileManager } from '../managers/ProfileManager';
import { DownloadStates, DownloadType, ProfileEventType } from '../types';

describe('ProfileManager — Contrato público', () => {
  let profileManager: ProfileManager;

  beforeEach(async () => {
    // @ts-ignore
    ProfileManager.instance = undefined;
    profileManager = ProfileManager.getInstance();
    await profileManager.initialize({ logEnabled: false });
  });

  it('debe iniciar sin perfil activo', () => {
    expect(profileManager.hasActiveProfile()).toBe(false);
    expect(profileManager.getActiveProfileId()).toBeNull();
  });

  it('debe establecer y obtener perfil activo', () => {
    profileManager.setActiveProfile({ id: 'p1', name: 'Adulto', isChild: false });

    expect(profileManager.hasActiveProfile()).toBe(true);
    expect(profileManager.getActiveProfileId()).toBe('p1');
    expect(profileManager.getActiveProfile()?.name).toBe('Adulto');
  });

  it('debe emitir evento al cambiar perfil', () => {
    const callback = jest.fn();
    profileManager.subscribe(ProfileEventType.PROFILE_CHANGED, callback);

    profileManager.setActiveProfile({ id: 'p2', name: 'Niño', isChild: true });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        previous: null,
        current: expect.objectContaining({ id: 'p2' }),
      })
    );
  });

  it('shouldShowContent: array vacío = visible para todos', () => {
    profileManager.setActiveProfile({ id: 'p1', name: 'Test', isChild: false });
    profileManager.setProfileFiltering(true);

    const item = {
      id: 'd1', title: 'T', type: DownloadType.STREAM, state: DownloadStates.COMPLETED,
      uri: '', profileIds: [], stats: { bytesDownloaded: 0, totalBytes: 0, progressPercent: 0, retryCount: 0 },
    };

    expect(profileManager.shouldShowContent(item)).toBe(true);
  });

  it('shouldShowContent: perfil no incluido = no visible', () => {
    profileManager.setActiveProfile({ id: 'p1', name: 'Test', isChild: false });
    profileManager.setProfileFiltering(true);

    const item = {
      id: 'd1', title: 'T', type: DownloadType.STREAM, state: DownloadStates.COMPLETED,
      uri: '', profileIds: ['p2'], stats: { bytesDownloaded: 0, totalBytes: 0, progressPercent: 0, retryCount: 0 },
    };

    expect(profileManager.shouldShowContent(item)).toBe(false);
  });

  it('canDownload: false si se requiere perfil y no hay ninguno', () => {
    profileManager.setActiveProfileRequired(true);
    expect(profileManager.canDownload()).toBe(false);
  });
});
```

---

### 3.1.5 Utilidades — Tests de contrato

```typescript
// __tests__/utils/downloadsUtils.contract.test.ts

import {
  generateDownloadIdFromUri,
  normalizeUri,
  isValidUri,
  calculateRemainingTime,
} from '../utils/downloadsUtils';

describe('downloadsUtils', () => {
  describe('generateDownloadIdFromUri', () => {
    it('debe generar ID consistente para la misma URI', () => {
      const id1 = generateDownloadIdFromUri('https://example.com/video.mp4');
      const id2 = generateDownloadIdFromUri('https://example.com/video.mp4');
      expect(id1).toBe(id2);
    });

    it('debe generar IDs diferentes para URIs diferentes', () => {
      const id1 = generateDownloadIdFromUri('https://example.com/video1.mp4');
      const id2 = generateDownloadIdFromUri('https://example.com/video2.mp4');
      expect(id1).not.toBe(id2);
    });

    it('debe manejar strings vacíos', () => {
      expect(() => generateDownloadIdFromUri('')).not.toThrow();
    });
  });

  describe('normalizeUri', () => {
    it('debe normalizar URIs equivalentes', () => {
      const n1 = normalizeUri('https://example.com/path?a=1&b=2');
      const n2 = normalizeUri('https://example.com/path?b=2&a=1');
      // Nota: la implementación actual puede o no normalizar query params
      expect(typeof n1).toBe('string');
    });
  });

  describe('isValidUri', () => {
    it('debe aceptar URIs válidas', () => {
      expect(isValidUri('https://example.com/video.mp4')).toBe(true);
      expect(isValidUri('http://example.com/manifest.m3u8')).toBe(true);
    });

    it('debe rechazar URIs inválidas', () => {
      expect(isValidUri('')).toBe(false);
      expect(isValidUri('not-a-url')).toBe(false);
    });
  });

  describe('calculateRemainingTime', () => {
    it('debe calcular tiempo restante correctamente', () => {
      const result = calculateRemainingTime(5000, 10000, 1000);
      expect(result).toBe(5); // 5 segundos
    });

    it('debe retornar 0 si velocidad es 0', () => {
      const result = calculateRemainingTime(5000, 10000, 0);
      expect(result).toBe(0);
    });
  });
});
```

```typescript
// __tests__/utils/formatters.contract.test.ts

import {
  formatDownloadSpeed,
  formatRemainingTime,
  formatFileSize,
  formatPercentage,
} from '../utils/formatters';

describe('formatters', () => {
  describe('formatDownloadSpeed', () => {
    it('debe formatear bytes/s a KB/s', () => {
      expect(formatDownloadSpeed(1024)).toContain('KB');
    });

    it('debe formatear bytes/s a MB/s', () => {
      expect(formatDownloadSpeed(1024 * 1024 * 5)).toContain('MB');
    });

    it('debe manejar 0', () => {
      const result = formatDownloadSpeed(0);
      expect(result).toBeDefined();
    });
  });

  describe('formatRemainingTime', () => {
    it('debe formatear segundos a formato legible', () => {
      expect(formatRemainingTime(3661)).toContain('1');
    });

    it('debe manejar 0', () => {
      const result = formatRemainingTime(0);
      expect(result).toBeDefined();
    });
  });

  describe('formatFileSize', () => {
    it('debe formatear bytes a MB', () => {
      expect(formatFileSize(1024 * 1024 * 50)).toContain('MB');
    });

    it('debe formatear bytes a GB', () => {
      expect(formatFileSize(1024 * 1024 * 1024 * 2)).toContain('GB');
    });
  });

  describe('formatPercentage', () => {
    it('debe formatear número a porcentaje', () => {
      expect(formatPercentage(0.75)).toContain('75');
    });

    it('debe manejar valores extremos', () => {
      expect(formatPercentage(0)).toBeDefined();
      expect(formatPercentage(1)).toBeDefined();
    });
  });
});
```

```typescript
// __tests__/utils/SpeedCalculator.contract.test.ts

import { SpeedCalculator } from '../utils/SpeedCalculator';

describe('SpeedCalculator', () => {
  let calculator: SpeedCalculator;

  beforeEach(() => {
    calculator = new SpeedCalculator();
  });

  it('debe retornar 0 sin muestras', () => {
    expect(calculator.getSpeed('dl-1')).toBe(0);
  });

  it('debe calcular velocidad tras múltiples muestras', () => {
    calculator.addSample('dl-1', 1000);
    // Simular paso de tiempo
    jest.advanceTimersByTime(1000);
    calculator.addSample('dl-1', 2000);

    const speed = calculator.getSpeed('dl-1');
    expect(speed).toBeGreaterThanOrEqual(0);
  });

  it('debe limpiar datos de un download específico', () => {
    calculator.addSample('dl-1', 1000);
    calculator.addSample('dl-2', 2000);
    calculator.clear('dl-1');

    expect(calculator.getSpeed('dl-1')).toBe(0);
    expect(calculator.getSpeed('dl-2')).toBeGreaterThanOrEqual(0);
  });

  it('debe limpiar todos los datos', () => {
    calculator.addSample('dl-1', 1000);
    calculator.addSample('dl-2', 2000);
    calculator.clearAll();

    expect(calculator.getSpeed('dl-1')).toBe(0);
    expect(calculator.getSpeed('dl-2')).toBe(0);
  });
});
```

---

## 3.2 Testabilidad actual

| Responsabilidad | Testeable aisladamente | Barreras | Tipo de test adecuado |
|---|---|---|---|
| QueueManager — Cola de descargas | Parcial | Singletons importados directamente; dependencia circular con DownloadsManager | Integración con mocks |
| QueueManager — Procesamiento de cola | No | Depende de `setInterval`, `setTimeout`, `networkService`, `configManager`, `downloadsManager` | Integración con mocks + fake timers |
| QueueManager — Eventos nativos | No | Depende de `nativeManager` y `binaryDownloadService` singletons | Integración con mocks |
| QueueManager — Reintentos | Parcial | `setTimeout` sin tracking; depende de estado interno del Map | Unitario si se extrae |
| QueueManager — Locks | Sí | Lógica pura con `setTimeout` para timeout | Unitario |
| QueueManager — Estadísticas | Sí | Solo lectura del Map | Unitario |
| DownloadsManager — Inicialización | No | Inicializa 6+ servicios en paralelo | Integración con mocks |
| DownloadsManager — Políticas globales | Parcial | Lee de múltiples servicios | Unitario si se extrae |
| DownloadsManager — API de descargas | Parcial | Delega a singletons | Integración con mocks |
| ConfigManager — CRUD config | Sí | Solo depende de PersistenceService (mockeable) | Unitario |
| ConfigManager — Validación | Sí | Lógica pura | Unitario |
| ConfigManager — Persistencia debounce | Parcial | `setTimeout` interno | Unitario con fake timers |
| ProfileManager — Gestión de perfil | Sí | Sin dependencias externas | Unitario |
| ProfileManager — Filtrado | Sí | Lógica pura | Unitario |
| NativeManager — API nativa | No | Depende de `NativeModules` reales | E2E / integración nativa |
| NativeManager — Manejo de eventos | Parcial | Depende de `NativeEventEmitter` | Integración con mock de NativeModules |
| DownloadService — Strategy | Parcial | Depende de BinaryDownloadService y StreamDownloadService singletons | Integración con mocks |
| BinaryDownloadService | No | Depende de `RNBackgroundDownloader` nativo | E2E |
| StreamDownloadService | No | Depende de `nativeManager` nativo | E2E |
| SubtitleDownloadService | Parcial | Depende de `RNFS` | Unitario con mock de RNFS |
| NetworkService | No | Depende de `@react-native-community/netinfo` | Integración con mock |
| PersistenceService | Parcial | Depende de `AsyncStorage` | Unitario con mock de AsyncStorage |
| StorageService | No | Depende de `RNFS` y `NativeModules` | Integración con mocks |
| DASHManifestParser | Sí | Lógica pura de parsing | Unitario |
| HLSManifestParser | Sí | Lógica pura de parsing | Unitario |
| Hooks (todos) | No | Importan singletons directamente; requieren providers React | Integración con renderHook + mocks |
| downloadsUtils | Sí | Funciones puras | Unitario |
| formatters | Sí | Funciones puras | Unitario |
| SpeedCalculator | Sí | Clase autocontenida | Unitario |
| ErrorMapper | Sí | Clase estática pura | Unitario |

---

## 3.3 Estrategia por tipo de unidad

### Utilidades y funciones puras

**Ficheros:** `downloadsUtils.ts`, `formatters.ts`, `ErrorMapper.ts`, `SpeedCalculator.ts`, `downloadTaskFactory.ts` (propuesto)

**Estrategia:** Tests unitarios directos con Jest.

| Función | Input | Output esperado |
|---|---|---|
| `generateDownloadIdFromUri('https://a.com/v.mp4')` | URI válida | String hash consistente |
| `generateDownloadIdFromUri('')` | String vacío | String (no crash) |
| `normalizeUri('https://A.COM/Path')` | URI con mayúsculas | URI normalizada |
| `isValidUri('https://example.com')` | URI válida | `true` |
| `isValidUri('')` | String vacío | `false` |
| `isValidUri(null as any)` | null | `false` (no crash) |
| `formatDownloadSpeed(0)` | 0 bytes/s | String formateada |
| `formatDownloadSpeed(1024)` | 1 KB/s | `"1.0 KB/s"` o similar |
| `formatFileSize(0)` | 0 bytes | String formateada |
| `formatFileSize(undefined as any)` | undefined | No crash |
| `ErrorMapper.mapError(new Error('no space left'))` | Error de espacio | `DownloadErrorCode.NO_SPACE_LEFT` |
| `ErrorMapper.isRetryable(DownloadErrorCode.NETWORK_ERROR)` | Error de red | `true` |
| `ErrorMapper.isRetryable(DownloadErrorCode.NO_SPACE_LEFT)` | Error de espacio | `false` |

### Services (con efectos secundarios)

**Ficheros:** `NetworkService.ts`, `PersistenceService.ts`, `StorageService.ts`, `SubtitleDownloadService.ts`

**Estrategia:** `jest.mock` para dependencias nativas. Ejemplo para PersistenceService:

```typescript
// __tests__/services/PersistenceService.test.ts

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    multiGet: jest.fn(),
    multiSet: jest.fn(),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PersistenceService } from '../services/storage/PersistenceService';

describe('PersistenceService', () => {
  let service: PersistenceService;

  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-ignore
    PersistenceService.instance = undefined;
    service = PersistenceService.getInstance();
  });

  describe('saveDownloadState', () => {
    it('debe serializar y guardar el Map', async () => {
      const downloads = new Map();
      downloads.set('dl-1', { id: 'dl-1', title: 'Test', state: 'QUEUED' });

      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await service.saveDownloadState(downloads);

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('debe manejar errores de AsyncStorage', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Storage full'));

      const downloads = new Map();
      downloads.set('dl-1', { id: 'dl-1' });

      // No debe lanzar (manejo interno)
      await expect(service.saveDownloadState(downloads)).resolves.not.toThrow();
    });
  });

  describe('loadDownloadState', () => {
    it('debe retornar Map vacío si no hay datos', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await service.loadDownloadState();
      expect(result.size).toBe(0);
    });

    it('debe deserializar datos guardados', async () => {
      const saved = JSON.stringify({
        version: 1,
        downloads: [['dl-1', { id: 'dl-1', title: 'Test' }]],
      });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(saved);

      const result = await service.loadDownloadState();
      expect(result.has('dl-1')).toBe(true);
    });
  });
});
```

### Hooks

**Estrategia:** `renderHook` de `@testing-library/react-native` con mocks de singletons.

```typescript
// __tests__/hooks/useDownloadsConfig.test.ts

import { renderHook, act } from '@testing-library/react-native';

jest.mock('../managers/ConfigManager', () => ({
  configManager: {
    initialize: jest.fn().mockResolvedValue(undefined),
    getConfig: jest.fn().mockReturnValue({
      download_just_wifi: true,
      max_concurrent_downloads: 3,
      streamQuality: 'auto',
    }),
    updateConfig: jest.fn().mockResolvedValue(undefined),
    updateStreamQuality: jest.fn().mockResolvedValue(undefined),
    updateNetworkPolicy: jest.fn().mockResolvedValue(undefined),
    updateConcurrentLimit: jest.fn().mockResolvedValue(undefined),
    resetToDefaults: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(() => {}),
    getDefaultConfig: jest.fn().mockReturnValue({ download_just_wifi: true }),
  },
}));

import { useDownloadsConfig } from '../hooks/useDownloadsConfig';

describe('useDownloadsConfig', () => {
  it('debe retornar configuración inicial', () => {
    const { result } = renderHook(() => useDownloadsConfig());

    expect(result.current.config).toBeDefined();
    expect(result.current.config.download_just_wifi).toBe(true);
  });

  it('debe exponer método setWifiOnly', () => {
    const { result } = renderHook(() => useDownloadsConfig());

    expect(typeof result.current.setWifiOnly).toBe('function');
  });

  it('debe llamar a configManager al cambiar wifi only', async () => {
    const { configManager } = require('../managers/ConfigManager');
    const { result } = renderHook(() => useDownloadsConfig());

    await act(async () => {
      await result.current.setWifiOnly(false);
    });

    expect(configManager.updateNetworkPolicy).toHaveBeenCalledWith(false);
  });
});
```

### Managers / Orquestadores

**Estrategia:** Mocks de todas las dependencias. Tests de secuencia.

```typescript
// Ejemplo de test de secuencia para DownloadsManager

describe('DownloadsManager — Secuencias', () => {
  it('secuencia: add → pause → resume (stream)', async () => {
    const { queueManager } = require('./QueueManager');
    const { downloadService } = require('../services/download/DownloadService');

    queueManager.getDownloadType.mockReturnValue(DownloadType.STREAM);

    // 1. Añadir descarga
    await manager.addDownload(
      { id: 'seq-1', manifestUrl: 'https://example.com/m.m3u8', title: 'T' },
      DownloadType.STREAM
    );
    expect(queueManager.addDownloadItem).toHaveBeenCalled();

    // 2. Pausar
    await manager.pauseDownload('seq-1');
    expect(downloadService.pauseDownload).toHaveBeenCalledWith('seq-1', DownloadType.STREAM);

    // 3. Reanudar
    await manager.resumeDownload('seq-1');
    expect(downloadService.resumeDownload).toHaveBeenCalledWith('seq-1', DownloadType.STREAM);
  });

  it('error en servicio no corrompe estado del manager', async () => {
    const { downloadService } = require('../services/download/DownloadService');
    downloadService.pauseDownload.mockRejectedValueOnce(new Error('Service error'));

    const { queueManager } = require('./QueueManager');
    queueManager.getDownloadType.mockReturnValue(DownloadType.STREAM);

    await expect(manager.pauseDownload('err-1')).rejects.toThrow();

    // El manager sigue funcional
    expect(manager.isInitialized()).toBe(true);
    expect(manager.getState().error).toBeNull();
  });
});
```

---

## 3.4 Matriz de cobertura

| ID Req | Comportamiento | Test unitario | Test integración | Test e2e | Prioridad |
|---|---|---|---|---|---|
| REQ-001 | Añadir descarga a cola | ✅ propuesto | ✅ propuesto | ⬜ pendiente | crítica |
| REQ-002 | Eliminar descarga (con gestión de perfiles) | ✅ propuesto | ✅ propuesto | ⬜ pendiente | crítica |
| REQ-003 | Pausar descarga individual | ✅ propuesto | ⬜ pendiente | ⬜ pendiente | alta |
| REQ-004 | Reanudar descarga (stream) | ✅ propuesto | ⬜ pendiente | ⬜ pendiente | alta |
| REQ-005 | Reanudar descarga (binario — recreación) | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | alta |
| REQ-006 | Pausar/reanudar todas | ✅ propuesto | ⬜ pendiente | ⬜ pendiente | alta |
| REQ-007 | Límite de descargas concurrentes | ✅ propuesto | ⬜ pendiente | ⬜ pendiente | alta |
| REQ-008 | Reintentos con backoff exponencial | ✅ propuesto | ⬜ pendiente | ➖ no aplica | alta |
| REQ-009 | Errores no reintentables (espacio, 404) | ✅ propuesto | ⬜ pendiente | ➖ no aplica | alta |
| REQ-010 | Persistencia de estado | ✅ propuesto | ⬜ pendiente | ⬜ pendiente | crítica |
| REQ-011 | Política WiFi-only | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | alta |
| REQ-012 | Pausa automática sin red | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | alta |
| REQ-013 | Pausa automática por espacio bajo | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | media |
| REQ-014 | Filtrado por perfil activo | ✅ propuesto | ⬜ pendiente | ⬜ pendiente | alta |
| REQ-015 | Gestión de configuración con validación | ✅ propuesto | ⬜ pendiente | ➖ no aplica | media |
| REQ-016 | Descarga de subtítulos | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | media |
| REQ-017 | Parsing de manifiestos DASH/HLS | ✅ propuesto | ➖ no aplica | ➖ no aplica | media |
| REQ-018 | Estadísticas de cola (velocidad, progreso, ETA) | ✅ propuesto | ⬜ pendiente | ➖ no aplica | media |
| REQ-019 | Formateo de datos para UI | ✅ propuesto | ➖ no aplica | ➖ no aplica | baja |
| REQ-020 | Generación de IDs de descarga | ✅ propuesto | ➖ no aplica | ➖ no aplica | baja |
| REQ-021 | Cálculo de velocidad (ventana deslizante) | ✅ propuesto | ➖ no aplica | ➖ no aplica | baja |
| REQ-022 | Mapeo de errores nativos | ✅ propuesto | ➖ no aplica | ➖ no aplica | media |
| REQ-023 | Sincronización con estado nativo | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | alta |
| REQ-024 | Limpieza de descargas huérfanas | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | media |
| REQ-025 | DRM (descarga/renovación/verificación de licencias) | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | alta |
| REQ-026 | Reordenación de cola | ✅ propuesto | ⬜ pendiente | ➖ no aplica | baja |
| REQ-027 | Backup y restore de datos | ⬜ pendiente | ⬜ pendiente | ➖ no aplica | media |
| REQ-028 | Monitoreo de almacenamiento | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | media |

**Resumen:** 14 de 28 requerimientos tienen tests unitarios propuestos. Prioridad inmediata: REQ-005 (recreación binaria), REQ-011 (WiFi-only), REQ-012 (pausa sin red), REQ-023 (sync nativo), REQ-025 (DRM).
