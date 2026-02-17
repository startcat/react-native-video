# Plan de Implementación: Extraer RetryManager

> Generado a partir de spec.md el 2026-02-17

## Resumen

- **Archivos creados**: 1 (`managers/queue/RetryManager.ts`)
- **Archivos modificados**: 2 (`managers/QueueManager.ts`, `__tests__/managers/QueueManager.contract.test.ts`)
- **Tests creados**: 1 (`__tests__/managers/queue/RetryManager.test.ts`)
- **Estimación**: 1-2 horas

## Fase 1: Crear RetryManager

1. Crear `managers/queue/RetryManager.ts` con:
   - `RetryConfig` interface
   - `RetryManager` class con: `shouldRetry`, `scheduleRetry`, `getRetryCount`, `clearRetries`, `clearAll`, `isNonRetryableError`, `destroy`
   - Lógica de backoff exponencial: `delay = min(retryDelayMs * 2^(n-1), maxDelayMs)`
   - Clasificación de errores no reintentables (NO_SPACE_LEFT, HTTP 4xx, asset validation)

### Verificación
```bash
npx tsc --noEmit --skipLibCheck  # No type errors
```

## Fase 2: Refactor QueueManager

1. Importar `RetryManager` en QueueManager
2. Reemplazar `retryTracker: Map<string, number>` por `retryManager: RetryManager`
3. Inicializar `retryManager` en constructor con config del QueueManager
4. Reemplazar `handleDownloadFailure`:
   - `shouldRetry` + `scheduleRetry` para reintentos
   - `clearRetries` + emit FAILED para fallos permanentes
5. Reemplazar todos los `retryTracker.delete(id)` → `retryManager.clearRetries(id)`
6. Reemplazar todos los `retryTracker.clear()` → `retryManager.clearAll()`
7. Eliminar método `isNonRetryableError` del QueueManager
8. Actualizar tests de QueueManager que accedían a `retryTracker` directamente

### Verificación
```bash
npx jest src/player/features/offline/__tests__/ --no-coverage  # 230 tests still pass
```

## Fase 3: Write RetryManager tests

1. Crear `__tests__/managers/queue/RetryManager.test.ts` con 11 tests
2. Usar `jest.useFakeTimers()` para tests de `scheduleRetry`

### Verificación
```bash
npx jest src/player/features/offline/__tests__/managers/queue/RetryManager.test.ts --no-coverage
```

## Verificación final

```bash
npx jest src/player/features/offline/__tests__/ --no-coverage  # 241 tests
npx eslint src/player/features/offline/managers/queue/RetryManager.ts src/player/features/offline/managers/QueueManager.ts
```

## Rollback

```bash
git checkout -- src/player/features/offline/managers/QueueManager.ts src/player/features/offline/__tests__/managers/QueueManager.contract.test.ts
rm -rf src/player/features/offline/managers/queue/
rm -rf src/player/features/offline/__tests__/managers/queue/
```
