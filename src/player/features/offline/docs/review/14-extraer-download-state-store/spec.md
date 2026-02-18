# Spec: Extraer DownloadStateStore

> Generado a partir de task.md el 2026-02-18

## Resumen

Extraer la gestión del Map de descargas (`this.downloadQueue`) del QueueManager a una clase independiente `DownloadStateStore` con interfaz pública tipada, persistencia delegada y tests propios.

## 1. Alcance

### Módulos afectados

**Directos:**

- `managers/QueueManager.ts` — reemplazar ~60 accesos a `this.downloadQueue` por `this.store.*`
- `managers/queue/DownloadStateStore.ts` — **CREAR** nueva clase

**Indirectos:**

- Ninguno — la interfaz pública del QueueManager no cambia

### Archivos a crear

- `managers/queue/DownloadStateStore.ts`
- `__tests__/offline/managers/queue/DownloadStateStore.test.ts`

### Archivos a modificar

- `managers/QueueManager.ts`

## 2. Contratos

### Cambios en API pública del QueueManager

**Ninguno** — el comportamiento público debe ser idéntico antes y después.

### Nueva interfaz: DownloadStateStore

```typescript
export class DownloadStateStore {
	constructor(persistenceService: PersistenceService, logger: Logger);
	async loadFromPersistence(): Promise<void>;
	async add(item: DownloadItem): Promise<void>;
	async remove(downloadId: string): Promise<void>;
	async updateState(
		downloadId: string,
		state: DownloadStates,
		fileUri?: string,
		fileSize?: number
	): Promise<void>;
	async updateProgress(
		downloadId: string,
		progress: number,
		bytesWritten?: number,
		totalBytes?: number
	): Promise<void>;
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

## 3. Flujo de datos

### Estado interno migrado

- `this.downloadQueue: Map<string, DownloadItem>` → `this.store` (DownloadStateStore)
- `this.operationLocks: Map<string, {...}>` → dentro del store

### Persistencia

- El store recibe `PersistenceService` por constructor
- `add()`, `remove()`, `updateState()`, `reorder()`, `clear()`, `clearByState()` persisten automáticamente
- `updateProgress()` persiste cada 10% (mismo comportamiento actual)

### Lo que NO se mueve al store

- `currentlyDownloading: Set<string>` — estado de scheduling, se queda en QueueManager
- `retryManager` — ya extraído, se queda en QueueManager
- Lógica de eventos y notificaciones — se queda en QueueManager

## 4. Riesgos

### Principal riesgo

Que algún acceso directo a `this.downloadQueue` se pierda durante la migración, causando lectura/escritura en un Map vacío.

### Mitigación

- `grep -n "this\.downloadQueue" managers/QueueManager.ts | wc -l` antes y después (después debe ser 0)
- Tests de contrato (246) como red de seguridad

### Compatibilidad hacia atrás

No hay breaking changes — la interfaz pública del QueueManager no cambia.

## 5. Estrategias

### Testing

- **Unitarios**: 14 tests nuevos para DownloadStateStore (ver task.md)
- **Regresión**: 246 tests de contrato existentes deben seguir pasando

### Rollback

1. `git revert HEAD`

## 6. Complejidad estimada

- **Nivel**: Media
- **Justificación**: ~60 accesos a migrar, lógica de persistencia y locks a mover
- **Tiempo estimado**: 2-3 horas

## 7. Preguntas resueltas por /verify

- [x] ¿Cuántos accesos exactos tiene `this.downloadQueue`? → **89** (grep -cn)
- [x] ¿Hay accesos fuera de QueueManager? → **NO** — Binary/StreamDownloadService tienen su propio `downloadQueue` (array, no Map)
- [x] ¿Lock timeout de 30s implementado? → **SÍ** — `acquireLock()` en línea 1731, usa `setTimeout(30000)` con `lockTimeouts` Map
- [x] ¿`updateProgress()` persiste cada 10%? → **SÍ** — línea 1881: `if (progress % 10 === 0)` persiste
- [x] ¿`operationLocks` tiene timeout? → **SÍ** — usa `pendingOperations` Map + `lockTimeouts` Map con 30s timeout

### Nota sobre locks

- `pendingOperations: Map<string, "removing" | "updating">` — almacena operación activa
- `lockTimeouts: Map<string, ReturnType<typeof setTimeout>>` — timeouts de seguridad
- `isBeingRemoved()` — helper que consulta `pendingOperations`
- Los 3 Maps (`pendingOperations`, `lockTimeouts`) + `acquireLock`/`releaseLock`/`isBeingRemoved` se mueven al store

### Nota sobre updateDownloadState (línea 1772)

- Para COMPLETED: merge con datos persistidos (subtítulos de StreamDownloadService)
- Para otros estados: usa item in-memory directamente
- Esta lógica compleja se mueve al store tal cual (como indica task.md)

### Nota sobre speedCalculator

- `updateDownloadProgress()` (línea 1845) usa `speedCalculator` singleton para calcular velocidad
- El store NO debe importar speedCalculator — la lógica de velocidad se queda en QueueManager
- El store solo gestiona el Map y la persistencia; QueueManager calcula velocidad antes de llamar al store

## Aprobación

- [ ] Spec revisado
- [ ] Dudas resueltas
- [ ] Listo para verificación de baseline
