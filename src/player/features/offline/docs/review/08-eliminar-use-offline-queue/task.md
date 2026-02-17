# Tarea: Eliminar useOfflineQueue

> Tarea 08 de 19 | Fase B: Extracciones de bajo riesgo
> Plan de refactorización de `src/player/features/offline/`

## Contexto

La auditoría identificó (CI-005, SA-06) que `useOfflineQueue.ts` (134 líneas) es redundante con `useDownloadsQueue.ts` (193 líneas). Ambos proporcionan interfaz reactiva para la cola de descargas, pero `useDownloadsQueue` tiene más funcionalidad. Además, `useOfflineQueue` tiene `maxConcurrent: 3` hardcodeado con un TODO pendiente.

**IDs de auditoría relacionados**: CI-005, SA-06

## Objetivo

Eliminar el hook redundante `useOfflineQueue` y migrar sus consumidores a `useDownloadsQueue`.

## Alcance

### Código afectado

- `hooks/useOfflineQueue.ts` — **ELIMINAR**: fichero completo
- `hooks/index.ts` — **MODIFICAR**: eliminar re-export de `useOfflineQueue`
- Consumidores (si existen) — **MODIFICAR**: reemplazar imports de `useOfflineQueue` por `useDownloadsQueue`

### Fuera de alcance

- NO modificar `useDownloadsQueue.ts`
- NO añadir funcionalidad nueva

## Requisitos funcionales

1. **[CI-005]**: No debe existir el hook `useOfflineQueue` tras completar la tarea
2. Todos los consumidores existentes deben funcionar con `useDownloadsQueue`

## Requisitos técnicos

1. Buscar consumidores: `grep -r "useOfflineQueue" src/` antes de eliminar
2. Si hay consumidores, mapear la API de `useOfflineQueue` a `useDownloadsQueue`
3. Actualizar `hooks/index.ts` para no exportar `useOfflineQueue`

## Cambios de contrato

- **useOfflineQueue eliminado**: los consumidores deben migrar a `useDownloadsQueue`. La API es compatible salvo por `maxConcurrent` que en `useOfflineQueue` estaba hardcodeado a 3.

## Criterios de aceptación

### Funcionales
- [ ] `useOfflineQueue.ts` no existe
- [ ] `grep -r "useOfflineQueue" src/` no devuelve resultados (excepto en docs)
- [ ] `hooks/index.ts` no exporta `useOfflineQueue`

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `npx jest __tests__/offline/` ✅

### Calidad
- [ ] Sin errores de TypeScript: `npx tsc --noEmit` ✅
- [ ] Build exitoso

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `__tests__/offline/managers/QueueManager.contract.test.ts` — valida que la cola sigue funcionando

### Tests nuevos a crear

- Ninguno (eliminación de código)

## Dependencias

### Tareas previas requeridas
- Tarea 01 (Fase A): tests de contrato de QueueManager deben estar en verde

### Tareas que dependen de esta
- Ninguna

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: que existan consumidores no detectados por grep (ej: imports dinámicos)
- **Mitigación**: verificar con `npx tsc --noEmit` que no hay errores de compilación tras eliminar
- **Rollback**: `git revert HEAD`

## Estimación

0.5 horas

## Notas

- Si no hay consumidores de `useOfflineQueue`, la tarea es trivial: eliminar fichero + actualizar index.
- Si hay consumidores, verificar que la API de `useDownloadsQueue` cubre todos los casos de uso.
