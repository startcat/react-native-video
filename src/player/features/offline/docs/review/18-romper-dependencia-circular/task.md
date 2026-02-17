# Tarea: Romper dependencia circular QueueManager ↔ DownloadsManager

> Tarea 18 de 19 | Fase E: Reestructuración
> Plan de refactorización de `src/player/features/offline/`

## Contexto

La auditoría identificó (SA-01, NC-006) la dependencia circular más crítica del sistema: `QueueManager` importa `downloadsManager` (línea 17) para llamar a `startDownloadNow()` en `sendToDestinationQueue()`, y `DownloadsManager` importa `queueManager` (línea 36) para delegar toda su API. Esta circularidad dificulta el testing aislado, puede causar `undefined` en ciertos bundlers, y es un code smell arquitectónico grave.

Tras las tareas 14 (DownloadStateStore) y 16 (DownloadScheduler), la llamada a `downloadsManager.startDownloadNow()` ya está encapsulada en el `DownloadScheduler` como callback `sendToDestination`. Esta tarea formaliza la inyección y elimina el import circular.

**IDs de auditoría relacionados**: SA-01, NC-006

## Objetivo

Eliminar el import circular entre QueueManager y DownloadsManager mediante inyección de dependencias.

## Alcance

### Código afectado

- `managers/QueueManager.ts` — **MODIFICAR**: eliminar `import { downloadsManager } from './DownloadsManager'`; recibir la función `startDownloadNow` como parámetro de `initialize()` o como callback del DownloadScheduler
- `managers/DownloadsManager.ts` — **MODIFICAR**: en `initializeSystemServices()`, pasar `this.startDownloadNow.bind(this)` al QueueManager durante la inicialización

### Fuera de alcance

- NO modificar la lógica de `startDownloadNow` (solo cambiar cómo se inyecta)
- NO modificar otros imports entre managers
- NO cambiar la interfaz pública de ningún manager

## Requisitos funcionales

1. **[SA-01]**: No debe existir import circular entre QueueManager y DownloadsManager
2. **[NC-006]**: El orden de evaluación de módulos no debe causar `undefined`

## Requisitos técnicos

1. QueueManager.initialize() acepta un callback opcional:
```typescript
interface QueueManagerInitConfig {
  // ... config existente ...
  startDownload?: (task: BinaryDownloadTask | StreamDownloadTask, type: DownloadType) => Promise<void>;
}
```
2. Si el DownloadScheduler ya existe (tarea 16), el callback se pasa al scheduler como `sendToDestination`.
3. Si el DownloadScheduler no existe aún, el callback se almacena en QueueManager y se usa en `sendToDestinationQueue()`.
4. DownloadsManager proporciona el callback durante su inicialización.

## Cambios de contrato

- **Ninguno** — el flujo de descargas debe ser idéntico. Solo cambia cómo se conectan los componentes.

## Criterios de aceptación

### Funcionales
- [ ] `grep -r "from.*DownloadsManager" managers/QueueManager.ts` no devuelve resultados
- [ ] `grep -r "from.*QueueManager" managers/DownloadsManager.ts` sigue existiendo (esta dirección es correcta)
- [ ] Las descargas se inician correctamente (el callback funciona)
- [ ] No hay `TypeError: Cannot read property 'startDownloadNow' of undefined` en ningún escenario

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `npx jest __tests__/offline/` ✅
- [ ] Test nuevo: QueueManager funciona sin import de DownloadsManager
- [ ] Test nuevo: callback de startDownload se invoca correctamente al procesar la cola

### Calidad
- [ ] Sin errores de TypeScript: `npx tsc --noEmit` ✅
- [ ] Sin dependencias circulares: verificar con `madge --circular managers/` o inspección manual
- [ ] Build exitoso

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `__tests__/offline/managers/QueueManager.contract.test.ts` — valida toda la API pública
- `__tests__/offline/managers/DownloadsManager.contract.test.ts` — valida que addDownload sigue funcionando

### Tests nuevos a crear

- Ampliar `__tests__/offline/managers/QueueManager.contract.test.ts`:
  - Test: QueueManager.initialize() con callback de startDownload → funciona
  - Test: QueueManager.initialize() sin callback → no crash (pero descargas no se inician)
- Ampliar `__tests__/offline/managers/queue/DownloadScheduler.test.ts`:
  - Test: sendToDestination callback se invoca al procesar item QUEUED

## Dependencias

### Tareas previas requeridas
- Tarea 14: DownloadStateStore (QueueManager simplificado)
- Tarea 16: DownloadScheduler (la función sendToDestination ya es un callback)

### Tareas que dependen de esta
- Ninguna

## Riesgo

- **Nivel**: alto
- **Principal riesgo**: que el timing de inicialización cambie y el callback no esté disponible cuando se necesita (ej: QueueManager intenta procesar antes de que DownloadsManager haya inyectado el callback)
- **Mitigación**: 
  1. El scheduler no procesa hasta que se llame a `start()` explícitamente
  2. DownloadsManager llama a `queueManager.initialize()` con el callback ANTES de llamar a `queueManager.start()`
  3. Tests de integración que verifican la secuencia completa
- **Rollback**: `git revert HEAD` — restaurar el import circular. El sistema funciona con él; es un code smell, no un bug.

## Estimación

2–3 horas

## Notas

- Esta es la tarea de mayor riesgo del plan. Proceder con cautela.
- Si el DownloadScheduler (tarea 16) ya existe, el cambio es más simple: el scheduler ya recibe `sendToDestination` como callback. Solo hay que eliminar el import y asegurar que el callback se propaga correctamente.
- Si el DownloadScheduler NO existe (ej: se decidió no hacer la tarea 16), el cambio es más invasivo: hay que modificar `sendToDestinationQueue()` para usar un callback almacenado en vez del import directo.
- Verificar que los tests de QueueManager no dependan del mock de `downloadsManager` para funcionar. Si lo hacen, actualizar los mocks para usar el nuevo patrón de callback.
