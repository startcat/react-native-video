# QueueManager Contract Tests — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Write contract tests that capture the current behavior of QueueManager as a safety net for refactoring.

**Architecture:** Single test file with jest mocks for all 9 singleton dependencies. Tests organized by API method category (CRUD, Control, Query, Events, Notifications, Config). Each test resets the singleton to ensure isolation.

**Tech Stack:** Jest, TypeScript, `@ts-ignore` for private property access in test setup.

---

## Fase 0: Infraestructura Jest

### Task 0.1: Crear jest.config.js

**Files:**
- Create: `jest.config.js`

**Step 1: Crear el fichero de configuración**

```js
module.exports = {
  preset: 'react-native',
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/src/**/__tests__/**/*.test.tsx',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|eventemitter3)/)',
  ],
  testEnvironment: 'node',
  setupFiles: [],
  collectCoverage: false,
};
```

**Step 2: Verificar que Jest detecta tests**

Run: `npx jest --listTests 2>&1 | grep -c "test.ts"`
Expected: 0 (aún no hay tests .test.ts)

**Step 3: Commit**

```bash
git add jest.config.js
git commit -m "chore: add jest.config.js for offline contract tests"
```

---

## Fase 1: Estructura del test, mocks y helpers

### Task 1.1: Crear fichero de test con mocks y helpers

**Files:**
- Create: `src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts`

**Step 1: Crear el fichero con todos los mocks y el helper `createMockDownloadItem`**

Los mocks deben usar rutas relativas desde `src/player/features/offline/__tests__/managers/`:

```typescript
// src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts

import { QueueManager } from '../../managers/QueueManager';
import { DownloadStates, DownloadType, DownloadItem, DownloadEventType } from '../../types';

// === MOCKS ===

jest.mock('../../services/storage/PersistenceService', () => ({
  persistenceService: {
    saveDownloadState: jest.fn().mockResolvedValue(undefined),
    loadDownloadState: jest.fn().mockResolvedValue(new Map()),
    saveProfileMappings: jest.fn().mockResolvedValue(undefined),
    loadProfileMappings: jest.fn().mockResolvedValue(new Map()),
  },
}));

jest.mock('../../services/storage/StorageService', () => ({
  storageService: {
    getBinariesDirectory: jest.fn().mockReturnValue('/mock/binaries'),
    deleteFile: jest.fn().mockResolvedValue(true),
    forceUpdate: jest.fn().mockResolvedValue(undefined),
    invalidateDownloadSpaceCache: jest.fn(),
  },
}));

jest.mock('../../services/network/NetworkService', () => ({
  networkService: {
    isOnline: jest.fn().mockReturnValue(true),
    isWifiConnected: jest.fn().mockReturnValue(true),
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
}));

jest.mock('../../managers/ConfigManager', () => ({
  configManager: {
    getConfig: jest.fn().mockReturnValue({ download_just_wifi: false }),
    initialize: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
}));

jest.mock('../../managers/DownloadsManager', () => ({
  downloadsManager: {
    startDownloadNow: jest.fn().mockResolvedValue('mock-id'),
  },
}));

jest.mock('../../managers/NativeManager', () => ({
  nativeManager: {
    subscribe: jest.fn().mockReturnValue(() => {}),
    removeDownload: jest.fn().mockResolvedValue(undefined),
    getDownloads: jest.fn().mockResolvedValue([]),
    initialize: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../managers/ProfileManager', () => ({
  profileManager: {
    getActiveProfileId: jest.fn().mockReturnValue('profile-1'),
    initialize: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
}));

jest.mock('../../services/download/BinaryDownloadService', () => ({
  binaryDownloadService: {
    subscribe: jest.fn().mockReturnValue(() => {}),
  },
}));

jest.mock('../../utils/SpeedCalculator', () => ({
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
    // Reset singleton
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
    queueManager.destroy();
  });

  it('placeholder — fichero carga correctamente', () => {
    expect(queueManager).toBeDefined();
  });
});
```

**Step 2: Ejecutar para verificar que el fichero carga y el placeholder pasa**

Run: `npx jest src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts --verbose`
Expected: 1 test passing

**Step 3: Commit**

```bash
git add src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts
git commit -m "test(offline): scaffold QueueManager contract test with mocks"
```

> **NOTA IMPORTANTE**: Si el test falla por problemas de import o mock, ajustar las rutas de mock antes de continuar. Los mocks deben coincidir exactamente con las rutas de import del QueueManager.ts real. Verificar los imports en `QueueManager.ts` líneas 7-32.

---

## Fase 2: Tests CRUD (addDownloadItem, removeDownload, forceRemoveDownload)

### Task 2.1: Tests de addDownloadItem (casos #1-#5)

**Files:**
- Modify: `src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts`

**Step 1: Añadir bloque `describe('addDownloadItem')`** dentro del describe principal, reemplazando el placeholder:

```typescript
  // --- addDownloadItem ---

  describe('addDownloadItem', () => {
    it('#1 debe añadir un item a la cola y retornar su ID', async () => {
      const item = createMockDownloadItem({ id: 'test-add-1' });
      const id = await queueManager.addDownloadItem(item);

      expect(id).toBe('test-add-1');
      expect(queueManager.getDownload('test-add-1')).not.toBeNull();
    });

    it('#2 debe retornar el ID existente si el item ya está en cola', async () => {
      const item = createMockDownloadItem({ id: 'test-dup' });
      await queueManager.addDownloadItem(item);
      const id2 = await queueManager.addDownloadItem(item);

      expect(id2).toBe('test-dup');
      expect(queueManager.getAllDownloads()).toHaveLength(1);
    });

    it('#3 debe emitir evento QUEUED al añadir', async () => {
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

    it('#4 debe lanzar error si no está inicializado', async () => {
      // @ts-ignore
      QueueManager.instance = undefined;
      const uninitQM = QueueManager.getInstance();
      // NO llamar initialize()
      const item = createMockDownloadItem();

      await expect(uninitQM.addDownloadItem(item)).rejects.toThrow();
    });

    it('#5 debe persistir el estado tras añadir', async () => {
      const { persistenceService } = require('../../services/storage/PersistenceService');
      persistenceService.saveDownloadState.mockClear();

      const item = createMockDownloadItem();
      await queueManager.addDownloadItem(item);

      expect(persistenceService.saveDownloadState).toHaveBeenCalled();
    });
  });
```

**Step 2: Ejecutar tests**

Run: `npx jest src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts --verbose`
Expected: 5 tests passing

### Task 2.2: Tests de removeDownload (casos #6-#9)

**Step 1: Añadir bloque `describe('removeDownload')`**

```typescript
  // --- removeDownload ---

  describe('removeDownload', () => {
    it('#6 debe eliminar un item cuando no quedan perfiles', async () => {
      const item = createMockDownloadItem({
        id: 'test-remove',
        profileIds: ['profile-1'],
      });
      await queueManager.addDownloadItem(item);
      await queueManager.removeDownload('test-remove', 'profile-1');

      expect(queueManager.getDownload('test-remove')).toBeNull();
    });

    it('#7 debe solo quitar el perfil si quedan otros perfiles', async () => {
      const item = createMockDownloadItem({
        id: 'test-multi-profile',
        profileIds: ['profile-1', 'profile-2'],
      });
      await queueManager.addDownloadItem(item);
      await queueManager.removeDownload('test-multi-profile', 'profile-1');

      const result = queueManager.getDownload('test-multi-profile');
      expect(result).not.toBeNull();
      expect(result!.profileIds).not.toContain('profile-1');
      expect(result!.profileIds).toContain('profile-2');
    });

    it('#8 debe emitir REMOVED solo cuando se elimina completamente', async () => {
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

    it('#9 debe lanzar error si el item no existe', async () => {
      await expect(
        queueManager.removeDownload('nonexistent', 'profile-1')
      ).rejects.toThrow();
    });
  });
```

**Step 2: Ejecutar tests**

Run: `npx jest src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts --verbose`
Expected: 9 tests passing

### Task 2.3: Tests de forceRemoveDownload (casos #10-#11)

**Step 1: Añadir bloque `describe('forceRemoveDownload')`**

```typescript
  // --- forceRemoveDownload ---

  describe('forceRemoveDownload', () => {
    it('#10 debe eliminar sin considerar perfiles', async () => {
      const item = createMockDownloadItem({
        id: 'test-force',
        profileIds: ['profile-1', 'profile-2'],
      });
      await queueManager.addDownloadItem(item);
      await queueManager.forceRemoveDownload('test-force');

      expect(queueManager.getDownload('test-force')).toBeNull();
    });

    it('#11 no debe lanzar error si el item no existe', async () => {
      await expect(
        queueManager.forceRemoveDownload('nonexistent')
      ).resolves.not.toThrow();
    });
  });
```

**Step 2: Ejecutar tests**

Run: `npx jest src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts --verbose`
Expected: 11 tests passing

**Step 3: Commit**

```bash
git add -A
git commit -m "test(offline): add CRUD contract tests for QueueManager"
```

---

## Fase 3: Tests de Control (pauseDownload, resumeDownload, pauseAll, resumeAll)

### Task 3.1: Tests de pause/resume (casos #12-#17)

**Step 1: Añadir bloques describe**

```typescript
  // --- pauseDownload ---

  describe('pauseDownload', () => {
    it('#12 debe cambiar estado de DOWNLOADING a PAUSED', async () => {
      const item = createMockDownloadItem({
        id: 'test-pause',
        state: DownloadStates.DOWNLOADING,
      });
      // @ts-ignore - acceso directo al Map para setup
      queueManager['downloadQueue'].set('test-pause', item);

      await queueManager.pauseDownload('test-pause');

      const result = queueManager.getDownload('test-pause');
      expect(result?.state).toBe(DownloadStates.PAUSED);
    });

    it('#13 no debe hacer nada si el estado no es DOWNLOADING', async () => {
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

  // --- resumeDownload ---

  describe('resumeDownload', () => {
    it('#14 debe cambiar estado de PAUSED a QUEUED', async () => {
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

  // --- pauseAll ---

  describe('pauseAll', () => {
    it('#15 debe pausar todas las descargas activas', () => {
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
    });

    it('#16 no debe afectar QUEUED ni COMPLETED', () => {
      const items = [
        createMockDownloadItem({ id: 'dl-q', state: DownloadStates.QUEUED }),
        createMockDownloadItem({ id: 'dl-c', state: DownloadStates.COMPLETED }),
      ];
      items.forEach(item => {
        // @ts-ignore
        queueManager['downloadQueue'].set(item.id, item);
      });

      queueManager.pauseAll();

      expect(queueManager.getDownload('dl-q')?.state).toBe(DownloadStates.QUEUED);
      expect(queueManager.getDownload('dl-c')?.state).toBe(DownloadStates.COMPLETED);
    });
  });

  // --- resumeAll ---

  describe('resumeAll', () => {
    it('#17 debe reanudar todas las PAUSED a QUEUED', async () => {
      const items = [
        createMockDownloadItem({ id: 'ra-1', state: DownloadStates.PAUSED }),
        createMockDownloadItem({ id: 'ra-2', state: DownloadStates.PAUSED }),
        createMockDownloadItem({ id: 'ra-3', state: DownloadStates.COMPLETED }),
      ];
      items.forEach(item => {
        // @ts-ignore
        queueManager['downloadQueue'].set(item.id, item);
      });

      await queueManager.resumeAll();

      expect(queueManager.getDownload('ra-1')?.state).toBe(DownloadStates.QUEUED);
      expect(queueManager.getDownload('ra-2')?.state).toBe(DownloadStates.QUEUED);
      expect(queueManager.getDownload('ra-3')?.state).toBe(DownloadStates.COMPLETED);
    });
  });
```

**Step 2: Ejecutar tests**

Run: `npx jest src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts --verbose`
Expected: 17 tests passing

**Step 3: Commit**

```bash
git add -A
git commit -m "test(offline): add control contract tests for QueueManager"
```

---

## Fase 4: Tests de Consulta (getAllDownloads, getDownload, getQueueStats)

### Task 4.1: Tests de consulta (casos #18-#21)

**Step 1: Añadir bloques describe**

```typescript
  // --- getAllDownloads ---

  describe('getAllDownloads', () => {
    it('#18 debe retornar copias profundas (no referencias)', async () => {
      const item = createMockDownloadItem({ id: 'clone-test' });
      await queueManager.addDownloadItem(item);

      const downloads = queueManager.getAllDownloads();
      downloads[0]!.title = 'MODIFIED';

      const original = queueManager.getDownload('clone-test');
      expect(original?.title).not.toBe('MODIFIED');
    });

    it('#19 debe retornar array vacío si la cola está vacía', () => {
      expect(queueManager.getAllDownloads()).toEqual([]);
    });
  });

  // --- getQueueStats ---

  describe('getQueueStats', () => {
    it('#20 debe retornar estadísticas correctas con mezcla de estados', () => {
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

    it('#21 debe retornar stats vacías si la cola está vacía', () => {
      const stats = queueManager.getQueueStats();
      expect(stats.total).toBe(0);
      expect(stats.downloading).toBe(0);
    });
  });
```

**Step 2: Ejecutar tests**

Run: `npx jest src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts --verbose`
Expected: 21 tests passing

**Step 3: Commit**

```bash
git add -A
git commit -m "test(offline): add query contract tests for QueueManager"
```

---

## Fase 5: Tests de Eventos (subscribe, subscribeToDownload)

### Task 5.1: Tests de eventos (casos #22-#24)

**Step 1: Añadir bloques describe**

```typescript
  // --- subscribe ---

  describe('subscribe', () => {
    it('#22 debe recibir eventos', async () => {
      const callback = jest.fn();
      queueManager.subscribe(DownloadEventType.QUEUED, callback);

      const item = createMockDownloadItem({ id: 'sub-1' });
      await queueManager.addDownloadItem(item);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('#23 unsubscribe debe funcionar', async () => {
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

  // --- subscribeToDownload ---

  describe('subscribeToDownload', () => {
    it('#24 debe filtrar eventos por downloadId', async () => {
      const callback = jest.fn();
      queueManager.subscribeToDownload('target-id', callback);

      // Emitir progreso para target-id
      const targetItem = createMockDownloadItem({
        id: 'target-id',
        state: DownloadStates.DOWNLOADING,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('target-id', targetItem);
      await queueManager.notifyDownloadProgress('target-id', 50, 5000, 10000);

      // Emitir progreso para otro-id
      const otherItem = createMockDownloadItem({
        id: 'other-id',
        state: DownloadStates.DOWNLOADING,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('other-id', otherItem);
      await queueManager.notifyDownloadProgress('other-id', 30, 3000, 10000);

      // Solo debe haber recibido eventos del target
      const targetCalls = callback.mock.calls.filter(
        (call: any[]) => call[0]?.downloadId === 'target-id'
      );
      expect(targetCalls.length).toBeGreaterThan(0);

      const otherCalls = callback.mock.calls.filter(
        (call: any[]) => call[0]?.downloadId === 'other-id'
      );
      expect(otherCalls.length).toBe(0);
    });
  });
```

**Step 2: Ejecutar tests**

Run: `npx jest src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts --verbose`
Expected: 24 tests passing

**Step 3: Commit**

```bash
git add -A
git commit -m "test(offline): add event contract tests for QueueManager"
```

---

## Fase 6: Tests de Notificaciones

### Task 6.1: Tests de notifyDownloadProgress (casos #25-#27)

**Step 1: Añadir bloque describe**

```typescript
  // --- notifyDownloadProgress ---

  describe('notifyDownloadProgress', () => {
    it('#25 debe actualizar progreso del item', async () => {
      const item = createMockDownloadItem({
        id: 'prog-1',
        state: DownloadStates.DOWNLOADING,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('prog-1', item);

      await queueManager.notifyDownloadProgress('prog-1', 50, 5000, 10000);

      const result = queueManager.getDownload('prog-1');
      expect(result?.stats.progressPercent).toBe(50);
    });

    it('#26 debe emitir evento PROGRESS', async () => {
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

    it('#27 no debe lanzar error si el item no existe', async () => {
      await expect(
        queueManager.notifyDownloadProgress('nonexistent', 50, 5000, 10000)
      ).resolves.not.toThrow();
    });
  });
```

### Task 6.2: Tests de notifyDownloadCompleted (casos #28-#30)

```typescript
  // --- notifyDownloadCompleted ---

  describe('notifyDownloadCompleted', () => {
    it('#28 debe cambiar estado a COMPLETED', async () => {
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
    });

    it('#29 debe tener progressPercent = 100 tras completar', async () => {
      const item = createMockDownloadItem({
        id: 'comp-pct',
        state: DownloadStates.DOWNLOADING,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('comp-pct', item);
      // @ts-ignore
      queueManager['currentlyDownloading'].add('comp-pct');

      await queueManager.notifyDownloadCompleted('comp-pct');

      const result = queueManager.getDownload('comp-pct');
      expect(result?.stats.progressPercent).toBe(100);
    });

    it('#30 debe emitir evento COMPLETED', async () => {
      const callback = jest.fn();
      queueManager.subscribe(DownloadEventType.COMPLETED, callback);

      const item = createMockDownloadItem({
        id: 'comp-evt',
        state: DownloadStates.DOWNLOADING,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('comp-evt', item);
      // @ts-ignore
      queueManager['currentlyDownloading'].add('comp-evt');

      await queueManager.notifyDownloadCompleted('comp-evt');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ downloadId: 'comp-evt' })
      );
    });
  });
```

### Task 6.3: Tests de notifyDownloadFailed (casos #31-#33)

```typescript
  // --- notifyDownloadFailed ---

  describe('notifyDownloadFailed', () => {
    it('#31 debe marcar como FAILED tras agotar reintentos', async () => {
      const item = createMockDownloadItem({
        id: 'fail-1',
        state: DownloadStates.DOWNLOADING,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('fail-1', item);
      // @ts-ignore
      queueManager['currentlyDownloading'].add('fail-1');
      // Setear reintentos >= maxRetries (default 3) para forzar FAILED
      // @ts-ignore
      queueManager['retryTracker'].set('fail-1', 10);

      await queueManager.notifyDownloadFailed('fail-1', { message: 'Network error' });

      const result = queueManager.getDownload('fail-1');
      expect(result?.state).toBe(DownloadStates.FAILED);
    });

    it('#32 debe deduplicar si ya está en FAILED', async () => {
      const callback = jest.fn();
      queueManager.subscribe(DownloadEventType.FAILED, callback);

      const item = createMockDownloadItem({
        id: 'fail-dup',
        state: DownloadStates.FAILED,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('fail-dup', item);

      await queueManager.notifyDownloadFailed('fail-dup', { message: 'error' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('#33 debe emitir evento FAILED', async () => {
      const callback = jest.fn();
      queueManager.subscribe(DownloadEventType.FAILED, callback);

      const item = createMockDownloadItem({
        id: 'fail-evt',
        state: DownloadStates.DOWNLOADING,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('fail-evt', item);
      // @ts-ignore
      queueManager['currentlyDownloading'].add('fail-evt');
      // @ts-ignore
      queueManager['retryTracker'].set('fail-evt', 10);

      await queueManager.notifyDownloadFailed('fail-evt', { message: 'error' });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ downloadId: 'fail-evt' })
      );
    });
  });
```

### Task 6.4: Tests de notifyDownloadPaused / notifyDownloadResumed (casos #34-#35)

```typescript
  // --- notifyDownloadPaused / notifyDownloadResumed ---

  describe('notifyDownloadPaused', () => {
    it('#34 debe cambiar estado a PAUSED', async () => {
      const item = createMockDownloadItem({
        id: 'np-1',
        state: DownloadStates.DOWNLOADING,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('np-1', item);

      await queueManager.notifyDownloadPaused('np-1');

      const result = queueManager.getDownload('np-1');
      expect(result?.state).toBe(DownloadStates.PAUSED);
    });
  });

  describe('notifyDownloadResumed', () => {
    it('#35 debe cambiar estado a DOWNLOADING', async () => {
      const item = createMockDownloadItem({
        id: 'nr-1',
        state: DownloadStates.PAUSED,
      });
      // @ts-ignore
      queueManager['downloadQueue'].set('nr-1', item);

      await queueManager.notifyDownloadResumed('nr-1');

      const result = queueManager.getDownload('nr-1');
      expect(result?.state).toBe(DownloadStates.DOWNLOADING);
    });
  });
```

**Step 2: Ejecutar todos los tests de notificaciones**

Run: `npx jest src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts --verbose`
Expected: 35 tests passing

**Step 3: Commit**

```bash
git add -A
git commit -m "test(offline): add notification contract tests for QueueManager"
```

---

## Fase 7: Tests de Configuración y Gestión de Cola

### Task 7.1: Tests de setMaxConcurrent, reorderQueue, clearQueue, cleanupCompleted, clearFailed (casos #36-#41)

```typescript
  // --- setMaxConcurrent ---

  describe('setMaxConcurrent', () => {
    it('#36 debe actualizar el límite', () => {
      queueManager.setMaxConcurrent(5);
      // @ts-ignore
      expect(queueManager['config'].maxConcurrentDownloads).toBe(5);
    });

    it('#37 debe lanzar error con valor <= 0', () => {
      expect(() => queueManager.setMaxConcurrent(0)).toThrow();
      expect(() => queueManager.setMaxConcurrent(-1)).toThrow();
    });
  });

  // --- reorderQueue ---

  describe('reorderQueue', () => {
    it('#38 debe reordenar items según el nuevo orden', async () => {
      const items = [
        createMockDownloadItem({ id: 'r-1' }),
        createMockDownloadItem({ id: 'r-2' }),
        createMockDownloadItem({ id: 'r-3' }),
      ];
      for (const item of items) {
        await queueManager.addDownloadItem(item);
      }

      await queueManager.reorderQueue(['r-3', 'r-1', 'r-2']);

      const downloads = queueManager.getAllDownloads();
      const ids = downloads.map(d => d.id);
      expect(ids).toEqual(['r-3', 'r-1', 'r-2']);
    });
  });

  // --- clearQueue ---

  describe('clearQueue', () => {
    it('#39 debe eliminar todos los items', async () => {
      const items = [
        createMockDownloadItem({ id: 'cq-1' }),
        createMockDownloadItem({ id: 'cq-2' }),
      ];
      for (const item of items) {
        await queueManager.addDownloadItem(item);
      }

      await queueManager.clearQueue();

      expect(queueManager.getAllDownloads()).toHaveLength(0);
    });
  });

  // --- cleanupCompleted ---

  describe('cleanupCompleted', () => {
    it('#40 debe eliminar solo items COMPLETED', async () => {
      const items = [
        createMockDownloadItem({ id: 'cc-1', state: DownloadStates.COMPLETED }),
        createMockDownloadItem({ id: 'cc-2', state: DownloadStates.QUEUED }),
        createMockDownloadItem({ id: 'cc-3', state: DownloadStates.FAILED }),
      ];
      items.forEach(item => {
        // @ts-ignore
        queueManager['downloadQueue'].set(item.id, item);
      });

      await queueManager.cleanupCompleted();

      expect(queueManager.getDownload('cc-1')).toBeNull();
      expect(queueManager.getDownload('cc-2')).not.toBeNull();
      expect(queueManager.getDownload('cc-3')).not.toBeNull();
    });
  });

  // --- clearFailed ---

  describe('clearFailed', () => {
    it('#41 debe eliminar solo items FAILED', async () => {
      const items = [
        createMockDownloadItem({ id: 'cf-1', state: DownloadStates.FAILED }),
        createMockDownloadItem({ id: 'cf-2', state: DownloadStates.QUEUED }),
        createMockDownloadItem({ id: 'cf-3', state: DownloadStates.COMPLETED }),
      ];
      items.forEach(item => {
        // @ts-ignore
        queueManager['downloadQueue'].set(item.id, item);
      });

      await queueManager.clearFailed();

      expect(queueManager.getDownload('cf-1')).toBeNull();
      expect(queueManager.getDownload('cf-2')).not.toBeNull();
      expect(queueManager.getDownload('cf-3')).not.toBeNull();
    });
  });
```

**Step 2: Ejecutar todos los tests**

Run: `npx jest src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts --verbose`
Expected: 41 tests passing

**Step 3: Commit**

```bash
git add -A
git commit -m "test(offline): add config and queue management contract tests for QueueManager"
```

---

## Fase 8: Verificación final

### Task 8.1: Ejecutar suite completa y verificar

**Step 1: Ejecutar todos los tests con cobertura**

Run: `npx jest src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts --verbose`
Expected: 41 tests passing, 0 failing

**Step 2: Verificar que no se ha modificado código de producción**

Run: `git diff --name-only HEAD~5 -- src/player/features/offline/managers/ src/player/features/offline/services/ src/player/features/offline/types/ src/player/features/offline/utils/`
Expected: No output (ningún fichero de producción modificado)

**Step 3: Commit final si hay ajustes pendientes**

Si hubo ajustes durante la verificación:
```bash
git add -A
git commit -m "test(offline): fix contract test adjustments after verification"
```

---

## Checklist de criterios de aceptación

- [ ] Todos los tests ejecutan sin errores
- [ ] Todos los tests pasan en verde contra el código actual sin modificaciones
- [ ] Cada función/método público tiene al menos: caso normal, caso límite, caso error
- [ ] Los mocks son realistas (reflejan dependencias reales, no stubs vacíos)
- [ ] Los tests son independientes entre sí (no dependen de orden de ejecución)
- [ ] `npx jest src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts` pasa con código 0

## Notas para el implementador

1. **Si un test falla contra el código actual**: El código actual es la verdad. Ajustar el test para que refleje el comportamiento real, no el esperado. Documentar como comentario si el comportamiento parece un bug.

2. **Mocks de Logger**: QueueManager usa `Logger` internamente. Si da problemas, añadir mock:
   ```typescript
   jest.mock('../../../logger', () => ({
     Logger: jest.fn().mockImplementation(() => ({
       info: jest.fn(),
       warn: jest.fn(),
       error: jest.fn(),
       debug: jest.fn(),
     })),
   }));
   ```

3. **Mocks de PlayerError**: QueueManager lanza `PlayerError`. Si da problemas de import, añadir mock:
   ```typescript
   jest.mock('../../../../core/errors', () => ({
     PlayerError: class PlayerError extends Error {
       constructor(code: string, context?: any) {
         super(code);
         this.name = 'PlayerError';
       }
     },
   }));
   ```

4. **Timers**: `notifyDownloadFailed` usa `setTimeout` para reintentos. Si causa problemas, usar `jest.useFakeTimers()` en los tests de retry.
