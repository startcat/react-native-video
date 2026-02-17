# Tarea: Extraer RetryManager

> Tarea 07 de 19 | Fase B: Extracciones de bajo riesgo
> Plan de refactorización de `src/player/features/offline/`

## Contexto

La auditoría identificó (SA-03) que el QueueManager concentra demasiadas responsabilidades en 2645 líneas. La lógica de reintentos con backoff exponencial y clasificación de errores no reintentables (`handleDownloadFailure`, `isNonRetryableError`, `retryTracker`) es autocontenida y puede extraerse sin afectar al resto del QueueManager. Esta extracción es prerequisito para la tarea 10 (fix setTimeout cleanup) y la tarea 14 (DownloadStateStore).

**IDs de auditoría relacionados**: SA-03, REQ-008, REQ-009

## Objetivo

Extraer la lógica de reintentos del QueueManager a una clase independiente `RetryManager` con tests propios.

## Alcance

### Código afectado

- `managers/queue/RetryManager.ts` — **CREAR**: nueva clase con lógica de reintentos, backoff exponencial, clasificación de errores
- `managers/QueueManager.ts` — **MODIFICAR**: reemplazar `handleDownloadFailure()` (líneas 1655-1734), `isNonRetryableError()` (líneas 1739-1790) y `retryTracker` (línea 47) por delegación a `this.retryManager`

### Fuera de alcance

- NO modificar la lógica de reintentos (solo moverla)
- NO cambiar el comportamiento de `handleDownloadFailure`
- NO tocar otros métodos del QueueManager
- La tarea 10 se encargará de arreglar el setTimeout sin cleanup

## Requisitos funcionales

1. **[REQ-008]**: Reintentos con backoff exponencial (2^n * baseDelay, máximo 60s)
2. **[REQ-009]**: Errores no reintentables (NO_SPACE_LEFT, HTTP 404, asset validation) fallan inmediatamente

## Requisitos técnicos

1. Clase independiente (no singleton)
2. Interfaz pública:
```typescript
export class RetryManager {
  constructor(config: RetryConfig, logger: Logger);
  shouldRetry(downloadId: string, error: unknown): boolean;
  scheduleRetry(downloadId: string, onRetry: () => void): void;
  getRetryCount(downloadId: string): number;
  clearRetries(downloadId: string): void;
  clearAll(): void;
  isNonRetryableError(error: unknown): boolean;
  destroy(): void;
}

export interface RetryConfig {
  maxRetries: number;
  retryDelayMs: number;
  maxDelayMs: number;
}
```
3. No importar singletons directamente. Recibir dependencias por constructor.

## Cambios de contrato

- **Ninguno** — el comportamiento de reintentos debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] Descargas fallidas se reintentan con backoff exponencial
- [ ] Errores de espacio, HTTP 404, asset validation fallan inmediatamente sin reintentos
- [ ] Tras agotar reintentos, la descarga se marca como FAILED
- [ ] `retryTracker` ya no existe en QueueManager (delegado a RetryManager)

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `npx jest __tests__/offline/` ✅
- [ ] Tests nuevos de RetryManager cubren: backoff exponencial, clasificación de errores, límite de reintentos, clearRetries

### Calidad
- [ ] Sin errores de TypeScript: `npx tsc --noEmit` ✅
- [ ] Build exitoso

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `__tests__/offline/managers/QueueManager.contract.test.ts` — valida `notifyDownloadFailed` (reintentos y FAILED)

### Tests nuevos a crear

- `__tests__/offline/managers/queue/RetryManager.test.ts`:
  - Test 1: `shouldRetry` retorna true si hay reintentos disponibles
  - Test 2: `shouldRetry` retorna false si se agotaron los reintentos
  - Test 3: `shouldRetry` retorna false para errores no reintentables
  - Test 4: `scheduleRetry` programa callback con delay exponencial
  - Test 5: `isNonRetryableError` detecta NO_SPACE_LEFT
  - Test 6: `isNonRetryableError` detecta HTTP 404
  - Test 7: `isNonRetryableError` detecta asset validation errors
  - Test 8: `isNonRetryableError` retorna false para errores genéricos
  - Test 9: `clearRetries` resetea contador de un download
  - Test 10: `destroy` cancela todos los timers pendientes
  - Test 11 — caso límite: delay no excede maxDelayMs (60s)

## Dependencias

### Tareas previas requeridas
- Tarea 01 (Fase A): tests de contrato de QueueManager deben estar en verde

### Tareas que dependen de esta
- Tarea 10: fix setTimeout cleanup (usa RetryManager.destroy())
- Tarea 14: DownloadStateStore (reduce complejidad del QueueManager)

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: que el QueueManager llame a `handleDownloadFailure` desde múltiples puntos y alguno no se actualice
- **Mitigación**: `grep -n "handleDownloadFailure\|retryTracker\|isNonRetryableError" managers/QueueManager.ts` para encontrar todos los usos
- **Rollback**: `git revert HEAD`

## Estimación

1–2 horas

## Notas

- `handleDownloadFailure` usa `setTimeout` sin tracking. En esta tarea, mantener el mismo comportamiento (setTimeout sin cleanup). La tarea 10 se encargará de añadir tracking y cancelación.
- El RetryManager NO es singleton. El QueueManager lo instancia en su constructor/initialize.
