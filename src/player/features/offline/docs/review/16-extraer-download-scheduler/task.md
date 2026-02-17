# Tarea: Extraer DownloadScheduler

> Tarea 16 de 19 | Fase D: Extracciones de riesgo medio
> Plan de refactorización de `src/player/features/offline/`

## Contexto

La auditoría identificó (SA-03) que el QueueManager contiene ~200 líneas de lógica de scheduling: `setInterval` para procesamiento periódico, verificación de concurrencia, stagger delay de 500ms entre descargas, y auto-stop cuando no hay trabajo. Esta lógica es independiente del estado de las descargas y puede extraerse a una clase dedicada.

**IDs de auditoría relacionados**: SA-03, REQ-007

## Objetivo

Extraer la lógica de scheduling del QueueManager a una clase independiente `DownloadScheduler` que decida cuándo y qué descarga iniciar.

## Alcance

### Código afectado

- `managers/queue/DownloadScheduler.ts` — **CREAR**: nueva clase con lógica de scheduling, interval, concurrencia, stagger delay
- `managers/QueueManager.ts` — **MODIFICAR**: eliminar `start()` (línea 1101), `startProcessing()` (líneas 1117-1133), `stopProcessing()` (líneas 1140-1147), `processQueue()` (líneas 1155-1168), `doProcessQueue()` (líneas 1175-1338), `canDownloadNow()` (líneas 1346-1357), `sendToDestinationQueue()` (líneas 1365-1432). Reemplazar por delegación a `this.scheduler`.

### Fuera de alcance

- NO modificar la lógica de `sendToDestinationQueue` (solo moverla al scheduler o inyectarla como callback)
- NO cambiar el stagger delay de 500ms (eso es tarea futura)
- NO cambiar la interfaz pública del QueueManager

## Requisitos funcionales

1. **[REQ-007]**: El scheduler respeta el límite de descargas concurrentes
2. **[SA-03]**: La lógica de scheduling está encapsulada en DownloadScheduler

## Requisitos técnicos

1. Clase independiente (no singleton)
2. Interfaz pública:
```typescript
export class DownloadScheduler {
  constructor(config: SchedulerConfig, deps: SchedulerDependencies);
  start(): void;
  stop(): void;
  isRunning(): boolean;
  forceProcessNow(): void;
  setMaxConcurrent(count: number): void;
  destroy(): void;
}

export interface SchedulerConfig {
  maxConcurrentDownloads: number;
  processIntervalMs: number;
  staggerDelayMs: number;
}

export interface SchedulerDependencies {
  getQueuedItems: () => DownloadItem[];
  getActiveCount: () => number;
  sendToDestination: (item: DownloadItem) => Promise<void>;
  isNetworkAvailable: () => boolean;
  isWifiRequired: () => boolean;
  isWifiConnected: () => boolean;
  onDownloadStarting: (downloadId: string) => void;
  onDownloadStartFailed: (downloadId: string, error: unknown) => void;
  logger: Logger;
}
```
3. Recibir dependencias como funciones inyectadas (no importar singletons)
4. `destroy()` debe limpiar el `setInterval`

## Cambios de contrato

- **Ninguno** — el comportamiento de scheduling debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] Las descargas se inician automáticamente cuando hay capacidad
- [ ] El límite de concurrencia se respeta
- [ ] El stagger delay de 500ms entre descargas consecutivas se mantiene
- [ ] El scheduler se detiene cuando no hay trabajo
- [ ] `start()`, `startProcessing()`, `stopProcessing()`, `processQueue()`, `doProcessQueue()` ya no existen en QueueManager

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `npx jest __tests__/offline/` ✅
- [ ] Tests nuevos del DownloadScheduler cubren: respeta maxConcurrent, stagger delay, auto-stop, re-verificación tras delay

### Calidad
- [ ] Sin errores de TypeScript: `npx tsc --noEmit` ✅
- [ ] Build exitoso

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `__tests__/offline/managers/QueueManager.contract.test.ts` — valida que descargas se procesan correctamente

### Tests nuevos a crear

- `__tests__/offline/managers/queue/DownloadScheduler.test.ts`:
  - Test 1: `start()` inicia procesamiento periódico
  - Test 2: respeta maxConcurrentDownloads (no inicia más de N)
  - Test 3: stagger delay de 500ms entre descargas consecutivas
  - Test 4: auto-stop cuando no hay items en QUEUED ni activos
  - Test 5: re-verificación de concurrencia después del stagger delay
  - Test 6: re-verificación de estado QUEUED después del stagger delay
  - Test 7: `stop()` detiene el interval
  - Test 8: `forceProcessNow()` procesa inmediatamente
  - Test 9: `setMaxConcurrent()` actualiza el límite
  - Test 10: no inicia si red no disponible
  - Test 11: no inicia si WiFi requerido y no hay WiFi
  - Test 12: `destroy()` limpia interval y estado
  - Test 13 — caso error: `sendToDestination` falla → error de red vuelve a QUEUED

## Dependencias

### Tareas previas requeridas
- Tarea 14: DownloadStateStore (el scheduler consulta items via callbacks del store)

### Tareas que dependen de esta
- Tarea 18: Romper dependencia circular (el scheduler recibe `sendToDestination` como callback inyectado)

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: que la lógica de re-verificación tras el stagger delay (líneas 1252-1276) no se replique correctamente, causando race conditions
- **Mitigación**: copiar la lógica exactamente como está. Tests con fake timers para simular el delay.
- **Rollback**: `git revert HEAD`

## Estimación

2 horas

## Notas

- `doProcessQueue()` es el método más complejo del QueueManager (~160 líneas). Moverlo al scheduler tal cual, sin simplificar.
- El scheduler NO debe importar `downloadsManager` directamente. La función `sendToDestination` se inyecta como callback. Esto es clave para romper la dependencia circular en la tarea 18.
- `canDownloadNow()` consulta `networkService` y `configManager`. En el scheduler, estas consultas se hacen via callbacks inyectados (`isNetworkAvailable`, `isWifiRequired`, `isWifiConnected`).
- Usar `jest.useFakeTimers()` para testear el interval y el stagger delay.
