# Tarea: Guard contra doble setup en NativeEventBridge

> Tarea 20 de 21 | Fase E: Reestructuración
> Plan de refactorización de `src/player/features/offline/`

## Contexto

Detectado durante la revisión de la tarea 15 (extraer NativeEventBridge). El método `setup()` de `NativeEventBridge` no tiene guard contra llamadas duplicadas. Si se llama dos veces (por ejemplo, por un bug de re-inicialización en QueueManager), se registrarían listeners duplicados sin limpiar los anteriores, causando que cada evento nativo se procese dos veces.

Este es un patrón pre-existente (el antiguo `setupNativeEventListeners()` tampoco tenía guard), pero ahora que la clase es independiente es el momento de corregirlo.

**Origen**: Review de tarea 15, improvement #2

## Objetivo

Añadir un guard en `NativeEventBridge.setup()` que prevenga la registración duplicada de listeners.

## Alcance

### Código afectado

- `managers/queue/NativeEventBridge.ts` — **MODIFICAR**: añadir flag `isSetup` y guard en `setup()`

### Fuera de alcance

- NO modificar QueueManager
- NO modificar NativeManager ni BinaryDownloadService

## Requisitos técnicos

1. Añadir propiedad privada `private isSetup: boolean = false`
2. En `setup()`: si `isSetup` es true, hacer teardown primero (o lanzar warning y retornar)
3. En `teardown()`: poner `isSetup = false`
4. Decisión de diseño: preferir teardown+re-setup sobre throw, para ser resiliente

## Criterios de aceptación

### Funcionales
- [ ] Llamar `setup()` dos veces no registra listeners duplicados
- [ ] Llamar `setup()` después de `teardown()` funciona correctamente

### Testing
- [ ] Tests existentes de NativeEventBridge siguen pasando
- [ ] Test nuevo: `setup()` llamado dos veces → solo 7 listeners registrados (no 14)

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

15 minutos
