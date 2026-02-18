# Plan de Implementación: Extraer DownloadStateStore

> Basado en spec.md (revisado tras /verify) | Generado el 2026-02-18

## Resumen ejecutivo

- **Objetivo**: Extraer la gestión del Map de descargas del QueueManager a una clase independiente `DownloadStateStore`
- **Fases**: 4
- **Estimación**: 2-3 horas
- **Riesgo general**: Medio

## Pre-requisitos

- [x] Tarea 07 (RetryManager) completada
- [x] Tarea 10 (setTimeout cleanup) completada
- [x] Baseline: 246 tests passing
- [x] 89 accesos a `this.downloadQueue` identificados

---

## Fases de implementación

### Fase 1: Crear DownloadStateStore con CRUD básico y locks

**Objetivo**: Crear la clase con la interfaz completa, CRUD del Map, deep clone, locks y persistencia.

**Archivos a crear**:
- `managers/queue/DownloadStateStore.ts` — nueva clase completa

**Cambios específicos**:
1. Crear clase `DownloadStateStore` (no singleton, recibe PersistenceService y Logger por constructor)
2. Implementar estado interno: `downloadQueue: Map<string, DownloadItem>`, `pendingOperations`, `lockTimeouts`
3. Implementar CRUD: `add()`, `remove()`, `get()`, `getAll()`, `has()`, `size`
4. Implementar filtros: `getByState()`, `getByType()`
5. Implementar `updateState()` con lógica de merge para COMPLETED (mover de QueueManager líneas 1772-1838)
6. Implementar `updateProgress()` con persistencia cada 10% (mover lógica de líneas 1851-1884, SIN speedCalculator)
7. Implementar locks: `acquireLock()`, `releaseLock()`, `isLocked()`, `isBeingRemoved()` (mover de líneas 1731-1765)
8. Implementar `deepClone()` (mover de línea 2503)
9. Implementar `loadFromPersistence()`, `reorder()`, `clear()`, `clearByState()`
10. Implementar `persist()` privado que delega a PersistenceService
11. Implementar `getQueuePositions()` (mover de líneas 891-901)

**Nota sobre updateProgress**: El store recibe `progress`, `bytesWritten`, `totalBytes` y actualiza `stats.progressPercent`, `stats.bytesDownloaded`, `stats.totalBytes`. NO calcula velocidad ni tiempo restante — eso lo hace QueueManager antes de llamar al store.

**Nota sobre updateState**: Mover la lógica compleja de merge con persistencia para COMPLETED tal cual. El store recibe `persistenceService` por constructor, así que puede hacer `loadDownloadState()` para el merge.

**Punto de verificación**:
```bash
npx tsc --noEmit --skipLibCheck 2>&1 | head -5
```

**Estimación**: 45 minutos

---

### Fase 2: Tests del DownloadStateStore

**Objetivo**: Crear tests unitarios para la nueva clase antes de integrarla.

**Archivos a crear**:
- `__tests__/offline/managers/queue/DownloadStateStore.test.ts`

**Cambios específicos**:
1. Test: `add()` añade item y persiste
2. Test: `remove()` elimina item y persiste
3. Test: `updateState()` cambia estado y persiste
4. Test: `updateProgress()` actualiza progreso, persiste cada 10%
5. Test: `getAll()` retorna deep clones
6. Test: `get()` retorna deep clone o null
7. Test: `getByState()` filtra correctamente
8. Test: `acquireLock()` / `releaseLock()` funcionan
9. Test: `acquireLock()` deniega si ya hay lock
10. Test: lock timeout de 30s libera automáticamente
11. Test: `clearByState()` elimina items por estado
12. Test: `loadFromPersistence()` carga datos guardados
13. Test: `remove()` de item inexistente
14. Test: `add()` con PersistenceService que falla

**Punto de verificación**:
```bash
npx jest __tests__/offline/managers/queue/DownloadStateStore.test.ts --no-coverage
```

**Estimación**: 30 minutos

---

### Fase 3: Migrar QueueManager para usar DownloadStateStore

**Objetivo**: Reemplazar los 89 accesos a `this.downloadQueue` por delegación al store.

**Archivos a modificar**:
- `managers/QueueManager.ts` — migración masiva

**Cambios específicos**:
1. Importar `DownloadStateStore`
2. Reemplazar propiedades: eliminar `downloadQueue`, `pendingOperations`, `lockTimeouts`; añadir `store: DownloadStateStore`
3. En constructor: crear `this.store = new DownloadStateStore(persistenceService, this.currentLogger)`
4. Migrar `initialize()`: `loadPersistedQueue()` → `this.store.loadFromPersistence()`
5. Migrar `addDownload()`: `this.downloadQueue.set/get` → `this.store.add/get/has`
6. Migrar `removeDownload()` y `forceRemoveDownload()`: `this.downloadQueue.get/set/delete` → `this.store.*`
7. Migrar `pauseDownload/resumeDownload`: `this.downloadQueue.get` → `this.store.get`
8. Migrar `pauseAll/resumeAll`: iteración sobre `this.downloadQueue.entries()` → usar `this.store.getByState()` + `this.store.updateState()`
9. Migrar `getAllDownloads/getDownload`: `this.downloadQueue.values/get` → `this.store.getAll/get`
10. Migrar `clearQueue`: `this.downloadQueue.clear` → `this.store.clear()`
11. Migrar `reorderQueue`: → `this.store.reorder()`
12. Migrar `filterByState/filterByType`: → `this.store.getByState/getByType`
13. Migrar `getQueuePositions`: → `this.store.getQueuePositions()` o mantener delegando
14. Migrar `getQueueStats`: `this.downloadQueue.values` → `this.store.getAll()`
15. Migrar `clearByState`: iteración → `this.store.clearByState()`
16. Migrar `updateDownloadState`: → `this.store.updateState()`
17. Migrar `updateDownloadProgress`: calcular velocidad con speedCalculator, luego `this.store.updateProgress()`
18. Migrar `getDownloadType`: → `this.store.get()`
19. Migrar `loadPersistedQueue`: → `this.store.loadFromPersistence()`
20. Migrar `syncWithNativeState` y `processQueue` y todos los demás accesos restantes
21. Eliminar métodos movidos: `acquireLock`, `releaseLock`, `isBeingRemoved`, `deepCloneItem`, `updateDownloadState` (privado), `loadPersistedQueue`
22. Verificar: `grep -cn "this\.downloadQueue" managers/QueueManager.ts` debe ser **0**

**Invariantes que podrían verse afectados**:
- API pública del QueueManager: se preserva delegando al store
- Persistencia: el store persiste igual que antes
- Locks: el store maneja locks igual que antes
- Deep clone: el store clona igual que antes

**Punto de verificación**:
```bash
grep -cn "this\.downloadQueue" src/player/features/offline/managers/QueueManager.ts
npx jest src/player/features/offline/__tests__/ --no-coverage
```

**Estimación**: 1 hora

---

### Fase 4: Verificación final y limpieza

**Objetivo**: Confirmar que no quedan accesos directos y que todo funciona.

**Archivos a modificar**:
- `managers/QueueManager.ts` — limpieza de imports no usados si los hay

**Cambios específicos**:
1. Verificar `grep -cn "this\.downloadQueue" managers/QueueManager.ts` = 0
2. Verificar que no quedan `pendingOperations` ni `lockTimeouts` en QueueManager
3. Ejecutar tests completos
4. Verificar que no hay imports no usados

**Punto de verificación**:
```bash
npx jest src/player/features/offline/__tests__/ --no-coverage
```

**Estimación**: 15 minutos

---

## Orden de ejecución

```
┌─────────┐
│ Fase 1  │  Crear DownloadStateStore
└────┬────┘
     │
┌────▼────┐
│ Fase 2  │  Tests del store
└────┬────┘
     │
┌────▼────┐
│ Fase 3  │  Migrar QueueManager (la más grande)
└────┬────┘
     │
┌────▼────┐
│ Fase 4  │  Verificación y limpieza
└─────────┘
```

Todas las fases son secuenciales.

## Testing por fase

| Fase | Tests | Verificación |
|------|-------|-------------|
| 1 | TypeScript compila | `npx tsc --noEmit --skipLibCheck` |
| 2 | 14 tests nuevos del store | `npx jest DownloadStateStore.test.ts` |
| 3 | 246 tests de contrato + 14 del store | `npx jest __tests__/offline/` |
| 4 | Todos los tests + grep = 0 | Tests + grep |

## Rollback global

```bash
git checkout -- src/player/features/offline/managers/QueueManager.ts
git clean -fd src/player/features/offline/managers/queue/DownloadStateStore.ts
git clean -fd src/player/features/offline/__tests__/offline/managers/queue/DownloadStateStore.test.ts
```

## Aprobación

- [ ] Plan revisado
- [ ] Orden de fases aprobado
- [ ] Listo para implementar
