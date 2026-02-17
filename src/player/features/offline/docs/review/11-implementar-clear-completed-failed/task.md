# Tarea: Implementar clearCompleted/clearFailed

> Tarea 11 de 19 | Fase C: Correcciones y limpieza
> Plan de refactorización de `src/player/features/offline/`

## Contexto

La auditoría identificó (NC-012) que `DownloadsManager.clearCompleted()` y `DownloadsManager.clearFailed()` son stubs que solo logean un mensaje sin hacer nada. Los métodos equivalentes en QueueManager (`clearByState`) sí funcionan. El usuario cree que ha limpiado las descargas pero siguen ahí.

**IDs de auditoría relacionados**: NC-012

## Objetivo

Implementar `clearCompleted()` y `clearFailed()` en DownloadsManager delegando a `queueManager.clearByState()`.

## Alcance

### Código afectado

- `managers/DownloadsManager.ts` — **MODIFICAR**: implementar `clearCompleted()` (línea ~1258) y `clearFailed()` (línea ~1263) delegando a `queueManager.clearByState([DownloadStates.COMPLETED])` y `queueManager.clearByState([DownloadStates.FAILED])` respectivamente

### Fuera de alcance

- NO modificar QueueManager.clearByState (ya funciona)
- NO añadir lógica adicional (solo delegación)

## Requisitos funcionales

1. **[NC-012]**: `clearCompleted()` elimina todas las descargas con estado COMPLETED
2. **[NC-012]**: `clearFailed()` elimina todas las descargas con estado FAILED

## Requisitos técnicos

1. Delegar a `queueManager.clearByState()` que ya implementa la lógica correctamente
2. Mantener el logging existente
3. Emitir eventos si es necesario (verificar si `clearByState` ya los emite)

## Cambios de contrato

- **clearCompleted()**: antes no hacía nada, ahora elimina descargas completadas. Este es un cambio intencional de comportamiento. El test de contrato de DownloadsManager deberá actualizarse si testea este método.
- **clearFailed()**: antes no hacía nada, ahora elimina descargas fallidas. Mismo caso.

## Criterios de aceptación

### Funcionales
- [ ] `clearCompleted()` elimina todas las descargas COMPLETED de la cola
- [ ] `clearFailed()` elimina todas las descargas FAILED de la cola
- [ ] Tras llamar a `clearCompleted()`, `getDownloads()` no contiene items COMPLETED

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `npx jest __tests__/offline/` ✅ (excepto si hay tests que verifican el comportamiento stub actual — en ese caso, actualizar con justificación)
- [ ] Test nuevo: `clearCompleted()` elimina items COMPLETED
- [ ] Test nuevo: `clearFailed()` elimina items FAILED
- [ ] Test nuevo: `clearCompleted()` no afecta items en otros estados

### Calidad
- [ ] Sin errores de TypeScript: `npx tsc --noEmit` ✅
- [ ] Build exitoso

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `__tests__/offline/managers/DownloadsManager.contract.test.ts`

### Tests nuevos a crear

- Ampliar `__tests__/offline/managers/DownloadsManager.contract.test.ts`:
  - Test: `clearCompleted()` elimina items COMPLETED
  - Test: `clearFailed()` elimina items FAILED
  - Test: `clearCompleted()` no afecta DOWNLOADING ni QUEUED

## Dependencias

### Tareas previas requeridas
- Tarea 02 (Fase A): tests de contrato de DownloadsManager deben estar en verde

### Tareas que dependen de esta
- Ninguna

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: que `clearByState` también elimine archivos del disco (verificar implementación)
- **Mitigación**: leer `QueueManager.clearByState()` para confirmar qué hace exactamente
- **Rollback**: `git revert HEAD`

## Estimación

0.5 horas

## Notas

- Verificar si `clearByState` en QueueManager también llama a `nativeManager.removeDownload()` para limpiar el módulo nativo, o si solo limpia el Map y la persistencia.
