# Tarea: Hacer privado mapNativeStateToInternal en NativeEventBridge

> Tarea 21 de 21 | Fase E: Reestructuración
> Plan de refactorización de `src/player/features/offline/`

## Contexto

Detectado durante la revisión de la tarea 15 (extraer NativeEventBridge). El método `mapNativeStateToInternal()` es público por defecto, pero solo se usa internamente por `handleNativeStateChanged()`. Está público únicamente para permitir testing directo en `NativeEventBridge.test.ts`.

Es preferible hacerlo privado y testear el mapeo indirectamente a través del handler de state change, que es como realmente se usa.

**Origen**: Review de tarea 15, improvement #1

## Objetivo

Cambiar `mapNativeStateToInternal()` a privado y ajustar los tests para verificar el mapeo indirectamente.

## Alcance

### Código afectado

- `managers/queue/NativeEventBridge.ts` — **MODIFICAR**: añadir `private` a `mapNativeStateToInternal()`
- `__tests__/managers/queue/NativeEventBridge.test.ts` — **MODIFICAR**: reescribir test 12 para verificar mapeo via `onStateChanged` callback en lugar de llamada directa

### Fuera de alcance

- NO modificar QueueManager
- NO cambiar la lógica de mapeo

## Requisitos técnicos

1. Añadir `private` al método `mapNativeStateToInternal()`
2. Reescribir el test "should correctly map all native states to internal states" para enviar eventos de state change con cada estado nativo y verificar que el callback `onStateChanged` recibe el estado mapeado correcto

## Criterios de aceptación

### Funcionales
- [ ] `mapNativeStateToInternal` es privado
- [ ] Todos los estados nativos siguen mapeándose correctamente

### Testing
- [ ] Tests existentes de NativeEventBridge siguen pasando
- [ ] Test de mapeo reescrito para usar la interfaz pública (handler de state change)

### Calidad
- [ ] Sin errores de TypeScript
- [ ] Build exitoso

## Dependencias

### Tareas previas requeridas
- Tarea 15: NativeEventBridge debe existir

### Tareas que dependen de esta
- Ninguna

## Riesgo

- **Nivel**: bajo
- **Rollback**: `git revert HEAD`

## Estimación

10 minutos
