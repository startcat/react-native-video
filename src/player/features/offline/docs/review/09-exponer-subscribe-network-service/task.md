# Tarea: Exponer subscribe en NetworkService

> Tarea 09 de 19 | Fase B: Extracciones de bajo riesgo
> Plan de refactorización de `src/player/features/offline/`

## Contexto

La auditoría identificó (SA-05) que `useNetworkStatus.ts` accede a la propiedad interna `eventEmitter` del `NetworkService` mediante un casting forzado (`as unknown as NetworkServiceWithEventEmitter`). Esto rompe la encapsulación y se rompería silenciosamente si `NetworkService` cambia su implementación interna.

**IDs de auditoría relacionados**: SA-05

## Objetivo

Añadir un método público `onEvent()` al `NetworkService` que permita suscribirse a eventos sin acceder a propiedades internas, y actualizar `useNetworkStatus` para usarlo.

## Alcance

### Código afectado

- `services/network/NetworkService.ts` — **MODIFICAR**: añadir método público `onEvent(event: string, callback: Function): () => void`
- `hooks/useNetworkStatus.ts` — **MODIFICAR**: reemplazar casting forzado por llamada a `networkService.onEvent()`

### Fuera de alcance

- NO cambiar la lógica de monitoreo de red
- NO modificar otros hooks

## Requisitos funcionales

1. **[SA-05]**: `useNetworkStatus` no debe usar casting forzado para acceder al eventEmitter

## Requisitos técnicos

1. Método público en NetworkService:
```typescript
public onEvent(event: string, callback: (...args: any[]) => void): () => void {
  this.eventEmitter.on(event, callback);
  return () => this.eventEmitter.off(event, callback);
}
```
2. Eliminar la interfaz `NetworkServiceWithEventEmitter` de `useNetworkStatus.ts`
3. Eliminar el casting `as unknown as NetworkServiceWithEventEmitter`

## Cambios de contrato

- **Ninguno** — se añade un método público nuevo, no se modifica comportamiento existente.

## Criterios de aceptación

### Funcionales
- [ ] `useNetworkStatus` funciona sin casting forzado
- [ ] `grep -n "as unknown as" hooks/useNetworkStatus.ts` no devuelve resultados
- [ ] `grep -n "NetworkServiceWithEventEmitter" hooks/useNetworkStatus.ts` no devuelve resultados

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `npx jest __tests__/offline/` ✅

### Calidad
- [ ] Sin errores de TypeScript: `npx tsc --noEmit` ✅
- [ ] Build exitoso

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `__tests__/offline/managers/QueueManager.contract.test.ts` — valida que NetworkService sigue funcionando

### Tests nuevos a crear

- Ninguno (cambio mínimo, cubierto por tests existentes)

## Dependencias

### Tareas previas requeridas
- Tarea 01 (Fase A): tests de contrato deben estar en verde

### Tareas que dependen de esta
- Ninguna

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: mínimo. Se añade un método público sin cambiar nada existente.
- **Mitigación**: —
- **Rollback**: `git revert HEAD`

## Estimación

0.5 horas

## Notas

- Verificar si otros hooks o ficheros usan el mismo patrón de casting forzado con `grep -rn "as unknown as.*EventEmitter" src/player/features/offline/`.
