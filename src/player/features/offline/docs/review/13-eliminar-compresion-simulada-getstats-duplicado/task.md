# Tarea: Eliminar compresión simulada + getStats duplicado

> Tarea 13 de 19 | Fase C: Correcciones y limpieza
> Plan de refactorización de `src/player/features/offline/`

## Contexto

La auditoría identificó dos complejidades innecesarias:
- **CI-001**: `PersistenceService` tiene métodos `compress()` y `decompress()` que son stubs — no comprimen realmente, solo retornan los datos sin modificar. Añaden indirección sin valor.
- **CI-002**: `QueueManager` tiene dos métodos que calculan las mismas estadísticas: `getQueueStats()` (línea 899) y `getStats()` (línea 1964). `getStats()` además clona todos los items innecesariamente.

**IDs de auditoría relacionados**: CI-001, CI-002

## Objetivo

Eliminar la compresión simulada de PersistenceService y unificar los métodos de estadísticas duplicados en QueueManager.

## Alcance

### Código afectado

- `services/storage/PersistenceService.ts` — **MODIFICAR**: eliminar métodos `compress()` y `decompress()`, y sus llamadas en `saveDownloadState()` y `loadDownloadState()`
- `managers/QueueManager.ts` — **MODIFICAR**: eliminar `getStats()` (línea 1964); buscar consumidores y migrarlos a `getQueueStats()`

### Fuera de alcance

- NO cambiar la lógica de persistencia (solo eliminar la capa de compresión vacía)
- NO cambiar el formato de datos persistidos
- NO modificar `getQueueStats()`

## Requisitos funcionales

1. **[CI-001]**: Los métodos `compress()` y `decompress()` no deben existir
2. **[CI-002]**: Solo debe existir un método de estadísticas en QueueManager (`getQueueStats()`)

## Requisitos técnicos

1. Para CI-001: eliminar `compress()`, `decompress()` y las llamadas a ellos. Los datos se guardan/cargan directamente.
2. Para CI-002: buscar consumidores de `getStats()` con `grep -rn "\.getStats()" src/player/features/offline/` y migrarlos a `getQueueStats()`.

## Cambios de contrato

- **getStats() eliminado**: los consumidores deben usar `getQueueStats()`. La interfaz de retorno es compatible (ambos retornan `QueueStats`).

## Criterios de aceptación

### Funcionales
- [ ] `compress` y `decompress` no existen en PersistenceService
- [ ] `getStats` no existe en QueueManager (solo `getQueueStats`)
- [ ] Todos los consumidores de `getStats()` migrados a `getQueueStats()`
- [ ] Los datos se persisten y cargan correctamente sin la capa de compresión

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `npx jest __tests__/offline/` ✅

### Calidad
- [ ] Sin errores de TypeScript: `npx tsc --noEmit` ✅
- [ ] Build exitoso

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `__tests__/offline/managers/QueueManager.contract.test.ts` — valida `getQueueStats()`
- `__tests__/offline/utils/` — valida utilidades de persistencia

### Tests nuevos a crear

- Ninguno (eliminación de código)

## Dependencias

### Tareas previas requeridas
- Tarea 01 (Fase A): tests de contrato de QueueManager
- Tarea 05 (Fase A): tests de contrato de utilidades

### Tareas que dependen de esta
- Ninguna directamente

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: que `compress`/`decompress` hagan algo sutil no detectado (ej: transformación de datos)
- **Mitigación**: leer la implementación completa antes de eliminar; verificar que son stubs puros
- **Rollback**: `git revert HEAD`

## Estimación

1 hora

## Notas

- Verificar que `compress()` y `decompress()` realmente son stubs (retornan el input sin modificar). Si hacen alguna transformación, documentar y decidir si mantener.
- Para CI-002, verificar si `getStats()` y `getQueueStats()` retornan exactamente el mismo tipo. Si hay diferencias en la interfaz, crear un adaptador temporal.
