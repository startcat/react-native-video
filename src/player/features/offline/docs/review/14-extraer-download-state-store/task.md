# Tarea: Extraer DownloadStateStore

> Tarea 14 de 19 | Fase D: Extracciones de riesgo medio
> Plan de refactorización de `src/player/features/offline/`

## Contexto

La auditoría identificó (SA-03) que el QueueManager mezcla la gestión del Map de descargas (CRUD, persistencia, locks, deep clone) con la orquestación de alto nivel (scheduling, eventos, reintentos). Extraer el store de estado es el paso más importante de la refactorización porque desbloquea las tareas 15 (NativeEventBridge), 16 (DownloadScheduler), 18 (romper dependencia circular) y 19 (debounce de persistencia).

**IDs de auditoría relacionados**: SA-03

## Objetivo

Extraer la gestión del Map de descargas del QueueManager a una clase independiente `DownloadStateStore` con interfaz pública tipada y tests propios.

## Alcance

### Código afectado

- `managers/queue/DownloadStateStore.ts` — **CREAR**: nueva clase con CRUD del Map, persistencia, locks, deep clone
- `managers/QueueManager.ts` — **MODIFICAR**: reemplazar accesos directos a `this.downloadQueue` por `this.store.*`. Eliminar ~400 líneas de lógica de estado.

### Fuera de alcance

- NO modificar la lógica de scheduling (tarea 16)
- NO modificar la lógica de eventos nativos (tarea 15)
- NO cambiar la interfaz pública del QueueManager
- NO cambiar el formato de datos persistidos

## Requisitos funcionales

1. **[SA-03]**: La gestión del Map de descargas debe estar encapsulada en una clase independiente
2. El QueueManager debe delegar todas las operaciones de estado al store

## Requisitos técnicos

1. Clase independiente (no singleton)
2. Interfaz pública:
```typescript
export class DownloadStateStore {
  constructor(persistenceService: PersistenceService, logger: Logger);
  async loadFromPersistence(): Promise<void>;
  async add(item: DownloadItem): Promise<void>;
  async remove(downloadId: string): Promise<void>;
  async updateState(downloadId: string, state: DownloadStates, fileUri?: string, fileSize?: number): Promise<void>;
  async updateProgress(downloadId: string, progress: number, bytesWritten?: number, totalBytes?: number): Promise<void>;
  get(downloadId: string): DownloadItem | null;
  getAll(): DownloadItem[];
  getByState(states: DownloadStates[]): DownloadItem[];
  getByType(type: DownloadType): DownloadItem[];
  has(downloadId: string): boolean;
  get size(): number;
  async reorder(newOrder: string[]): Promise<void>;
  async clear(): Promise<void>;
  async clearByState(states: DownloadStates[]): Promise<void>;
  acquireLock(downloadId: string, op: "removing" | "updating"): boolean;
  releaseLock(downloadId: string): void;
  isLocked(downloadId: string): boolean;
  deepClone(item: DownloadItem): DownloadItem;
}
```
3. Recibir `PersistenceService` por constructor (no importar singleton)
4. `getAll()` y `get()` retornan deep clones (mismo comportamiento actual)
5. `updateProgress()` solo persiste cada 10% (mismo comportamiento actual)

## Cambios de contrato

- **Ninguno** — el comportamiento público del QueueManager debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] `this.downloadQueue` ya no existe en QueueManager (reemplazado por `this.store`)
- [ ] Todas las operaciones CRUD del QueueManager delegan al store
- [ ] Los locks funcionan igual que antes
- [ ] La persistencia funciona igual que antes

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `npx jest __tests__/offline/` ✅
- [ ] Tests nuevos del DownloadStateStore cubren: add, remove, updateState, updateProgress, getAll (deep clone), locks, persistencia, clearByState

### Calidad
- [ ] Sin errores de TypeScript: `npx tsc --noEmit` ✅
- [ ] Build exitoso

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `__tests__/offline/managers/QueueManager.contract.test.ts` — valida toda la API pública del QueueManager

### Tests nuevos a crear

- `__tests__/offline/managers/queue/DownloadStateStore.test.ts`:
  - Test 1: `add()` añade item y persiste
  - Test 2: `remove()` elimina item y persiste
  - Test 3: `updateState()` cambia estado y persiste
  - Test 4: `updateProgress()` actualiza progreso, persiste cada 10%
  - Test 5: `getAll()` retorna deep clones
  - Test 6: `get()` retorna deep clone o null
  - Test 7: `getByState()` filtra correctamente
  - Test 8: `acquireLock()` / `releaseLock()` funcionan
  - Test 9: `acquireLock()` deniega si ya hay lock
  - Test 10: lock timeout de 30s libera automáticamente
  - Test 11: `clearByState()` elimina items por estado
  - Test 12: `loadFromPersistence()` carga datos guardados
  - Test 13 — caso límite: `remove()` de item inexistente
  - Test 14 — caso error: `add()` con PersistenceService que falla

## Dependencias

### Tareas previas requeridas
- Tarea 07: RetryManager extraído (reduce complejidad del QueueManager)
- Tarea 10: setTimeout cleanup (QueueManager más limpio)

### Tareas que dependen de esta
- Tarea 15: NativeEventBridge (usa store para actualizar estado)
- Tarea 16: DownloadScheduler (usa store para consultar items)
- Tarea 18: Romper dependencia circular (requiere store separado)
- Tarea 19: Debounce de persistencia (modifica store)

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: que algún acceso directo a `this.downloadQueue` se pierda durante la migración, causando que el QueueManager lea/escriba en un Map vacío
- **Mitigación**: `grep -n "this\.downloadQueue" managers/QueueManager.ts | wc -l` antes y después. Después debe ser 0. Tests de contrato como red de seguridad.
- **Rollback**: `git revert HEAD`

## Estimación

2–3 horas

## Notas

- Esta es la tarea más importante de la Fase D. Desbloquea 4 tareas posteriores.
- El QueueManager tiene ~60 accesos directos a `this.downloadQueue`. Cada uno debe migrarse a la API del store.
- Considerar si `currentlyDownloading` (Set) también debería moverse al store o quedarse en QueueManager. Recomendación: dejarlo en QueueManager por ahora (es estado de scheduling, no de persistencia).
- El merge con datos persistidos en `updateDownloadState()` para COMPLETED (líneas 1857-1866) es lógica compleja. Moverla al store tal cual, sin simplificar.
