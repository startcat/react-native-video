# Plan de Implementación: Implementar clearCompleted/clearFailed

> Basado en spec.md (revisado tras /verify) | Generado el 2026-02-17

## Resumen ejecutivo

- **Objetivo**: Implementar `clearCompleted()` y `clearFailed()` en DownloadsManager delegando a QueueManager
- **Fases**: 2
- **Estimación**: 20 minutos
- **Riesgo general**: Bajo

## Pre-requisitos

- [x] QueueManager.cleanupCompleted() y clearFailed() ya funcionan
- [x] DownloadsManager importa queueManager (línea 36)
- [x] Baseline verificado — 243 tests passing

---

## Fases de implementación

### Fase 1: Implementar delegación en DownloadsManager

**Archivos a modificar**:
- `managers/DownloadsManager.ts` — reemplazar stubs de `clearCompleted()` y `clearFailed()`

**Cambios específicos**:
1. En `clearCompleted()` (línea 1258): reemplazar TODO stub con `await queueManager.cleanupCompleted()`
2. En `clearFailed()` (línea 1263): reemplazar TODO stub con `await queueManager.clearFailed()`
3. Mantener logging existente

**Punto de verificación**:
```bash
npx jest src/player/features/offline/__tests__/ --no-coverage
```

**Estimación**: 5 minutos

---

### Fase 2: Añadir tests de contrato

**Archivos a modificar**:
- `__tests__/managers/DownloadsManager.contract.test.ts` — añadir tests para clearCompleted/clearFailed

**Tests a añadir**:
1. `clearCompleted()` elimina items COMPLETED
2. `clearFailed()` elimina items FAILED
3. `clearCompleted()` no afecta items en otros estados (DOWNLOADING, QUEUED)

**Punto de verificación**:
```bash
npx jest src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts --no-coverage
```

**Estimación**: 15 minutos

---

## Verificación final

```bash
npx jest src/player/features/offline/__tests__/ --no-coverage
```

## Rollback

```bash
git checkout -- src/player/features/offline/managers/DownloadsManager.ts src/player/features/offline/__tests__/managers/DownloadsManager.contract.test.ts
```

## Aprobación

- [ ] Plan revisado
- [ ] Listo para implementar
