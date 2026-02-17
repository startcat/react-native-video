# Especificación Técnica: Exponer subscribe en NetworkService

> Generado a partir de task.md el 2026-02-17

## Resumen

Añadir método público `onEvent()` al NetworkService para eliminar el casting forzado en `useNetworkStatus`, mejorando la encapsulación.

## 1. Alcance

### Módulos afectados

**Directos:**

- `services/network/NetworkService.ts`: Añadir método público `onEvent()`
- `hooks/useNetworkStatus.ts`: Reemplazar casting forzado por `networkService.onEvent()`
- `managers/QueueManager.ts`: Añadir método público `onEvent()` (mismo patrón encontrado en verify)
- `hooks/useDownloadsQueue.ts`: Reemplazar casting forzado por `queueManager.onEvent()`

**Indirectos:**

- Ninguno

> **Nota**: El `/verify` detectó que `useDownloadsQueue.ts:100` usa el mismo patrón de casting forzado (`queueManager as unknown as QueueManagerWithEventEmitter`). Se amplía el alcance para resolver ambos.

### Dependencias impactadas

Ninguna.

### Archivos de configuración

Ninguno.

## 2. Contratos

### Cambios en API pública

| Elemento                                   | Tipo de cambio | Antes                           | Después                                                                  |
| ------------------------------------------ | -------------- | ------------------------------- | ------------------------------------------------------------------------ |
| `NetworkService.onEvent()`                 | Nuevo          | No existe                       | `onEvent(event: string, callback: (...args: any[]) => void): () => void` |
| `NetworkServiceWithEventEmitter` interface | Eliminado      | Definida en useNetworkStatus.ts | No existe                                                                |
| Casting `as unknown as`                    | Eliminado      | Usado en useNetworkStatus.ts    | Reemplazado por `networkService.onEvent()`                               |

### Cambios en tipos/interfaces

**Antes** (en useNetworkStatus.ts):

```typescript
interface NetworkServiceWithEventEmitter {
	eventEmitter: EventEmitter;
	// ...
}
const service = networkService as unknown as NetworkServiceWithEventEmitter;
service.eventEmitter.on("networkChange", callback);
```

**Después**:

```typescript
const unsubscribe = networkService.onEvent("networkChange", callback);
// cleanup: unsubscribe();
```

### Cambios en eventos/callbacks

Ninguno — los eventos emitidos no cambian.

## 3. Flujo de datos

### Estado global afectado

Ninguno.

### Persistencia

Sin impacto.

### Comunicación entre módulos

- `useNetworkStatus` → `NetworkService`: Ahora usa API pública en vez de acceso interno

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change | Severidad | Mitigación                                                   |
| --------------- | --------- | ------------------------------------------------------------ |
| Ninguno         | —         | Se añade método nuevo, no se elimina nada del NetworkService |

### Impacto en rendimiento

Ninguno.

### Casos edge problemáticos

- **Otros ficheros con casting forzado**: Verificar con grep si hay más usos del patrón `as unknown as.*EventEmitter`

## 5. Estrategias

### Testing

- **Unitarios**: No se crean tests nuevos (cambio mínimo)
- **Integración**: 241 tests existentes validan que no hay regresión
- **Manual**: No aplica

### Rollback

1. `git revert HEAD`

### Migración de datos

- **¿Necesaria?**: No

## 6. Complejidad estimada

- **Nivel**: Baja
- **Justificación**: Añadir 3 líneas a NetworkService + reemplazar casting en useNetworkStatus
- **Tiempo estimado**: 15-30 minutos

## 7. Preguntas sin resolver

### Técnicas

- [ ] ¿Hay otros ficheros que usen el mismo patrón de casting forzado? (verificar con `/verify`)
- [ ] ¿Cuál es el nombre exacto del evento usado en useNetworkStatus? (verificar con `/verify`)

## Aprobación

- [ ] Spec revisado
- [ ] Dudas resueltas
- [ ] Listo para verificación de baseline
