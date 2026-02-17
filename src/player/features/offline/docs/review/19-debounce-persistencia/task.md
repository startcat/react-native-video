# Tarea: Debounce de persistencia

> Tarea 19 de 19 | Fase E: Reestructuración
> Plan de refactorización de `src/player/features/offline/`

## Contexto

La auditoría identificó (NC-003, SA-10) que `updateDownloadState()` llama a `persistenceService.saveDownloadState()` en CADA cambio de estado. Con múltiples descargas concurrentes, esto genera decenas de escrituras por segundo a AsyncStorage (SQLite en Android), degradando la UX con lag en la UI.

Tras la tarea 14 (DownloadStateStore), la persistencia está encapsulada en el store. Esta tarea añade un debounce inteligente que limita las escrituras a máximo 1 cada 2 segundos, con flush inmediato en estados críticos (COMPLETED, FAILED).

**IDs de auditoría relacionados**: NC-003, SA-10

## Objetivo

Reducir la frecuencia de escrituras a AsyncStorage mediante debounce en el DownloadStateStore, sin perder datos en estados críticos.

## Alcance

### Código afectado

- `managers/queue/DownloadStateStore.ts` — **MODIFICAR**: añadir debounce a `persist()`, con flush inmediato para COMPLETED y FAILED

### Fuera de alcance

- NO modificar PersistenceService
- NO cambiar el formato de datos persistidos
- NO modificar la lógica de `updateDownloadProgress()` (ya persiste cada 10%)
- NO tocar QueueManager directamente

## Requisitos funcionales

1. **[NC-003]**: Máximo 1 escritura a AsyncStorage cada 2 segundos durante descargas activas
2. **[SA-10]**: Estados críticos (COMPLETED, FAILED) se persisten inmediatamente
3. Los datos no se pierden si la app se cierra (flush en destroy)

## Requisitos técnicos

1. Añadir método privado `debouncedPersist()` con delay configurable (default 2000ms)
2. `updateState()` con estado COMPLETED o FAILED → persist inmediato (bypass debounce)
3. `updateState()` con otros estados → debounced persist
4. `updateProgress()` → debounced persist (ya tiene throttle de 10%)
5. `destroy()` → flush inmediato de datos pendientes
6. Interfaz:
```typescript
// En DownloadStateStore
private persistDebounceMs: number = 2000;
private pendingPersist: NodeJS.Timeout | null = null;

private schedulePersist(): void;
private flushPersist(): Promise<void>;
```

## Cambios de contrato

- **Cambio menor**: los datos se persisten con un delay de hasta 2 segundos en lugar de inmediatamente. En caso de crash de la app, se pueden perder hasta 2 segundos de progreso. Los estados COMPLETED y FAILED siguen siendo inmediatos.

## Criterios de aceptación

### Funcionales
- [ ] Durante descargas activas, máximo 1 escritura cada 2 segundos
- [ ] COMPLETED y FAILED se persisten inmediatamente
- [ ] `destroy()` persiste datos pendientes
- [ ] Tras reiniciar la app, el estado se restaura correctamente (con posible pérdida de hasta 2s de progreso)

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `npx jest __tests__/offline/` ✅
- [ ] Tests nuevos cubren: debounce, flush inmediato para COMPLETED/FAILED, destroy flush

### Calidad
- [ ] Sin errores de TypeScript: `npx tsc --noEmit` ✅
- [ ] Build exitoso

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `__tests__/offline/managers/QueueManager.contract.test.ts` — valida que la persistencia funciona

### Tests nuevos a crear

- Ampliar `__tests__/offline/managers/queue/DownloadStateStore.test.ts`:
  - Test 1: `updateState(DOWNLOADING)` → persist NO se llama inmediatamente
  - Test 2: `updateState(DOWNLOADING)` → persist se llama después de 2s (fake timers)
  - Test 3: `updateState(COMPLETED)` → persist se llama inmediatamente
  - Test 4: `updateState(FAILED)` → persist se llama inmediatamente
  - Test 5: múltiples `updateState` en <2s → solo 1 persist (debounce)
  - Test 6: `destroy()` con persist pendiente → persist se ejecuta
  - Test 7: `updateProgress()` → debounced persist
  - Test 8 — caso límite: `updateState(DOWNLOADING)` seguido de `updateState(COMPLETED)` en <2s → persist inmediato (COMPLETED gana)

## Dependencias

### Tareas previas requeridas
- Tarea 14: DownloadStateStore debe existir como clase independiente

### Tareas que dependen de esta
- Ninguna

## Riesgo

- **Nivel**: medio
- **Principal riesgo**: que el debounce cause pérdida de datos si la app crashea durante el delay
- **Mitigación**: 
  1. COMPLETED y FAILED siempre son inmediatos (los estados más importantes)
  2. El delay de 2s es un compromiso razonable: la pérdida máxima es progreso parcial
  3. `destroy()` hace flush
- **Rollback**: `git revert HEAD`

## Estimación

1–2 horas

## Notas

- Usar `jest.useFakeTimers()` para testear el debounce sin esperar 2 segundos reales.
- Considerar hacer el delay configurable via `DownloadStateStore` constructor para facilitar testing.
- El debounce de `updateProgress()` ya existe parcialmente (persiste cada 10%). Con el debounce del store, la persistencia real será: cada 10% de progreso Y máximo cada 2 segundos. Esto es más eficiente que el estado actual.
- En Android, AsyncStorage usa SQLite con un solo hilo de escritura. Reducir las escrituras de ~10/s a ~0.5/s es una mejora significativa de rendimiento.
