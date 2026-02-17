# Plan de Implementación: Fix setTimeout sin cleanup en reintentos

> Basado en spec.md (revisado tras /verify) | Generado el 2026-02-17

## Resumen ejecutivo

- **Objetivo**: Completar protección de timers en RetryManager (flag destroyed + tests) y corregir QueueManager.destroy()
- **Fases**: 2
- **Estimación**: 20 minutos
- **Riesgo general**: Bajo

## Pre-requisitos

- [x] Timer tracking ya implementado en tarea 07
- [x] Baseline verificado — 241 tests passing

---

## Fases de implementación

### Fase 1: Añadir flag destroyed + corregir QueueManager.destroy()

**Archivos a modificar**:
- `managers/queue/RetryManager.ts` — añadir flag `destroyed`, proteger `scheduleRetry()`
- `managers/QueueManager.ts` — cambiar `clearAll()` → `destroy()` en `destroy()`

**Cambios específicos**:
1. Añadir `private destroyed = false` al RetryManager
2. En `scheduleRetry()`: si `destroyed`, hacer return sin programar
3. En `destroy()`: setear `destroyed = true` antes de `clearAll()`
4. En `QueueManager.destroy()`: cambiar `this.retryManager.clearAll()` → `this.retryManager.destroy()`

**Punto de verificación**:
```bash
npx jest src/player/features/offline/__tests__/ --no-coverage
```

**Estimación**: 10 minutos

---

### Fase 2: Añadir tests de timer cleanup

**Archivos a modificar**:
- `__tests__/managers/queue/RetryManager.test.ts` — añadir tests con fake timers

**Tests a añadir**:
1. `destroy() cancela timers pendientes` — scheduleRetry + destroy + advanceTimers → callback no ejecutado
2. `clearRetries(id) cancela timer individual` — scheduleRetry + clearRetries + advanceTimers → callback no ejecutado
3. `scheduleRetry() después de destroy() no programa nada` — destroy + scheduleRetry → no-op

**Punto de verificación**:
```bash
npx jest src/player/features/offline/__tests__/managers/queue/RetryManager.test.ts --no-coverage
```

**Estimación**: 10 minutos

---

## Verificación final

```bash
npx jest src/player/features/offline/__tests__/ --no-coverage
npx eslint src/player/features/offline/managers/queue/RetryManager.ts src/player/features/offline/managers/QueueManager.ts
```

## Rollback

```bash
git checkout -- src/player/features/offline/managers/queue/RetryManager.ts src/player/features/offline/managers/QueueManager.ts src/player/features/offline/__tests__/managers/queue/RetryManager.test.ts
```

## Aprobación

- [ ] Plan revisado
- [ ] Listo para implementar
