# Tarea: Eliminar código muerto en DownloadsManager

> Tarea 12 de 19 | Fase C: Correcciones y limpieza
> Plan de refactorización de `src/player/features/offline/`

## Contexto

La auditoría identificó (CI-003, CI-004) que el DownloadsManager contiene métodos que nunca se invocan porque la suscripción a DownloadService está deshabilitada (comentario en línea 280). Además, `handleAutoRetry()` tiene un TODO sin implementar y `enforceGlobalLimits()` es un stub. La lógica real de reintentos está en QueueManager. Estos ~200 líneas de código muerto añaden confusión y dificultan la comprensión del flujo real.

**IDs de auditoría relacionados**: CI-003, CI-004, SA-12

## Objetivo

Eliminar los métodos muertos `handleDownloadEvent()`, `notifyQueueManagerOfEvent()`, `handleAutoRetry()` y `enforceGlobalLimits()` del DownloadsManager.

## Alcance

### Código afectado

- `managers/DownloadsManager.ts` — **MODIFICAR**: eliminar los siguientes métodos y sus referencias:
  - `handleDownloadEvent()` (líneas ~451-488)
  - `notifyQueueManagerOfEvent()` (líneas ~496-600)
  - `handleAutoRetry()` (líneas ~698-712)
  - `enforceGlobalLimits()` (líneas ~714-730)
  - `applyGlobalPolicies()` (líneas ~681-691) — si solo invoca a los métodos eliminados

### Fuera de alcance

- NO eliminar métodos que sí se usan (verificar con grep)
- NO modificar la lógica de coordinación entre servicios que sí funciona
- NO tocar QueueManager

## Requisitos funcionales

1. **[CI-003]**: `handleDownloadEvent` y `notifyQueueManagerOfEvent` eliminados
2. **[CI-004]**: `handleAutoRetry` y `enforceGlobalLimits` eliminados

## Requisitos técnicos

1. Antes de eliminar, verificar con grep que ningún otro código llama a estos métodos:
   ```
   grep -rn "handleDownloadEvent\|notifyQueueManagerOfEvent\|handleAutoRetry\|enforceGlobalLimits" src/player/features/offline/
   ```
2. Si algún método se referencia fuera de su definición, NO eliminarlo y documentar por qué.
3. Eliminar también cualquier import que quede sin usar tras la eliminación.

## Cambios de contrato

- **Ninguno** — se eliminan métodos que no se invocan. El comportamiento observable es idéntico.

## Criterios de aceptación

### Funcionales
- [ ] Los métodos eliminados no existen en el fichero
- [ ] `grep -n "handleDownloadEvent\|notifyQueueManagerOfEvent\|handleAutoRetry\|enforceGlobalLimits" managers/DownloadsManager.ts` no devuelve resultados
- [ ] No hay imports sin usar

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `npx jest __tests__/offline/` ✅

### Calidad
- [ ] Sin errores de TypeScript: `npx tsc --noEmit` ✅
- [ ] Build exitoso

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `__tests__/offline/managers/DownloadsManager.contract.test.ts` — valida que la API pública sigue funcionando

### Tests nuevos a crear

- Ninguno (eliminación de código muerto)

## Dependencias

### Tareas previas requeridas
- Tarea 02 (Fase A): tests de contrato de DownloadsManager deben estar en verde

### Tareas que dependen de esta
- Ninguna directamente (pero reduce ruido para tarea 17)

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: que algún método no sea realmente muerto y se use en un path no detectado por grep
- **Mitigación**: verificar con grep exhaustivo + `npx tsc --noEmit` + tests de contrato
- **Rollback**: `git revert HEAD`

## Estimación

0.5 horas

## Notas

- `applyGlobalPolicies()` puede tener lógica útil mezclada con las llamadas a los stubs. Leer cuidadosamente antes de eliminar. Si tiene lógica útil, solo eliminar las llamadas a los stubs.
