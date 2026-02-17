# Especificación Técnica: Extraer RetryManager

> Generado a partir de task.md el 2026-02-17

## Resumen

Extraer la lógica de reintentos (~135 líneas) del QueueManager a una clase independiente `RetryManager`. Incluye backoff exponencial, clasificación de errores no reintentables, y tracking de reintentos por descarga.

## Alcance

### Creado
- `managers/queue/RetryManager.ts` — clase independiente (no singleton)

### Modificado
- `managers/QueueManager.ts` — delega a `this.retryManager`
- `__tests__/managers/QueueManager.contract.test.ts` — actualiza acceso a retryTracker

### API pública

```typescript
class RetryManager {
  constructor(config?: Partial<RetryConfig>, logger?: Logger);
  shouldRetry(downloadId: string, error: unknown): boolean;
  scheduleRetry(downloadId: string, onRetry: () => void): void;
  getRetryCount(downloadId: string): number;
  clearRetries(downloadId: string): void;
  clearAll(): void;
  isNonRetryableError(error: unknown): boolean;
  destroy(): void;
}
```

## Tests: 11

| # | Test | Tipo |
|---|---|---|
| 1 | shouldRetry → true con reintentos disponibles | normal |
| 2 | shouldRetry → false tras agotar reintentos | normal |
| 3 | shouldRetry → false para errores no reintentables | normal |
| 4 | scheduleRetry con delay exponencial | normal |
| 5 | isNonRetryableError detecta NO_SPACE_LEFT | normal |
| 6 | isNonRetryableError detecta HTTP 404 | normal |
| 7 | isNonRetryableError detecta asset validation | normal |
| 8 | isNonRetryableError → false para errores genéricos | normal |
| 9 | clearRetries resetea contador | normal |
| 10 | destroy cancela timers pendientes | normal |
| 11 | delay no excede maxDelayMs | edge |
