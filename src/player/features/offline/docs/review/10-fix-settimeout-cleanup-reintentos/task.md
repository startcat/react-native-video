# Tarea: Fix setTimeout sin cleanup en reintentos

> Tarea 10 de 19 | Fase C: Correcciones y limpieza
> Plan de refactorización de `src/player/features/offline/`

## Contexto

La auditoría identificó (NC-002) que `handleDownloadFailure()` programa reintentos con `setTimeout` sin trackear los timers. Si el QueueManager se destruye durante el delay, los callbacks se ejecutan sobre estado inconsistente, causando potenciales crashes o corrupción de estado.

Tras la tarea 07 (extracción de RetryManager), esta lógica ya estará en `RetryManager.scheduleRetry()`. Esta tarea añade tracking y cancelación de timers en `RetryManager.destroy()`.

**IDs de auditoría relacionados**: NC-002

## Objetivo

Garantizar que todos los `setTimeout` de reintentos se cancelan correctamente cuando el RetryManager (y por extensión el QueueManager) se destruye.

## Alcance

### Código afectado

- `managers/queue/RetryManager.ts` — **MODIFICAR**: añadir `Map<string, NodeJS.Timeout>` para trackear timers; cancelar en `destroy()`

### Fuera de alcance

- NO cambiar la lógica de backoff exponencial
- NO cambiar la clasificación de errores
- NO tocar QueueManager directamente

## Requisitos funcionales

1. **[NC-002]**: Los timers de reintento deben cancelarse al destruir el RetryManager

## Requisitos técnicos

1. Añadir propiedad privada `pendingTimers: Map<string, NodeJS.Timeout>`
2. En `scheduleRetry()`: guardar el timer en el Map
3. En `clearRetries(downloadId)`: cancelar el timer si existe
4. En `destroy()`: cancelar todos los timers pendientes
5. QueueManager.destroy() debe llamar a `this.retryManager.destroy()`

## Cambios de contrato

- **Ninguno** — el comportamiento de reintentos es idéntico. Solo se añade cleanup al destruir.

## Criterios de aceptación

### Funcionales
- [ ] `RetryManager.destroy()` cancela todos los timers pendientes
- [ ] `RetryManager.clearRetries(id)` cancela el timer de ese download
- [ ] Tras `destroy()`, ningún callback de reintento se ejecuta

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `npx jest __tests__/offline/` ✅
- [ ] Test nuevo: `destroy()` cancela timers pendientes (verificar con fake timers que el callback no se ejecuta)
- [ ] Test nuevo: `clearRetries()` cancela timer individual

### Calidad
- [ ] Sin errores de TypeScript: `npx tsc --noEmit` ✅
- [ ] Build exitoso

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `__tests__/offline/managers/QueueManager.contract.test.ts` — valida que reintentos siguen funcionando

### Tests nuevos a crear

- `__tests__/offline/managers/queue/RetryManager.test.ts` (ampliar los de tarea 07):
  - Test: `destroy()` con timers pendientes → callbacks no se ejecutan
  - Test: `clearRetries(id)` con timer pendiente → callback no se ejecuta
  - Test: `scheduleRetry()` después de `destroy()` → no programa nada (o lanza error)

## Dependencias

### Tareas previas requeridas
- Tarea 07: RetryManager debe existir como clase independiente

### Tareas que dependen de esta
- Tarea 14: DownloadStateStore (QueueManager más limpio)

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: mínimo. Solo se añade tracking de timers.
- **Mitigación**: —
- **Rollback**: `git revert HEAD`

## Estimación

1 hora

## Notas

- Usar `jest.useFakeTimers()` para verificar que los callbacks no se ejecutan tras `destroy()`.
- Considerar usar `clearRetries()` también cuando una descarga se elimina (no solo cuando se destruye el manager).
