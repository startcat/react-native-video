# Especificación Técnica: Fix setTimeout sin cleanup en reintentos

> Generado a partir de task.md el 2026-02-17

## Resumen

Añadir tracking y cancelación de timers de reintento en `RetryManager` para evitar callbacks sobre estado inconsistente cuando el manager se destruye.

## 1. Alcance

### Módulos afectados

**Directos:**

- `managers/queue/RetryManager.ts`: Añadir `pendingTimers` Map, modificar `scheduleRetry()`, `clearRetries()`, `clearAll()`, `destroy()`

**Indirectos:**

- `managers/QueueManager.ts`: Verificar que `destroy()` llama a `retryManager.destroy()`

### Dependencias impactadas

Ninguna.

### Archivos de configuración

Ninguno.

## 2. Contratos

### Cambios en API pública

| Elemento                        | Tipo de cambio       | Antes                    | Después                                  |
| ------------------------------- | -------------------- | ------------------------ | ---------------------------------------- |
| `RetryManager.scheduleRetry()`  | Modificado (interno) | setTimeout sin tracking  | setTimeout con tracking en pendingTimers |
| `RetryManager.clearRetries(id)` | Modificado (interno) | Solo limpia retryTracker | También cancela timer pendiente          |
| `RetryManager.clearAll()`       | Modificado (interno) | Solo limpia retryTracker | También cancela todos los timers         |
| `RetryManager.destroy()`        | Modificado (interno) | Solo limpia retryTracker | También cancela todos los timers         |

### Cambios en tipos/interfaces

Ninguno — solo cambios internos.

### Cambios en eventos/callbacks

Ninguno.

## 3. Flujo de datos

### Estado global afectado

Ninguno.

### Persistencia

Sin impacto.

### Comunicación entre módulos

- `QueueManager.destroy()` → `RetryManager.destroy()`: Debe existir esta cadena

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change | Severidad | Mitigación                                         |
| --------------- | --------- | -------------------------------------------------- |
| Ninguno         | —         | Solo se añade cleanup, no se cambia comportamiento |

### Impacto en rendimiento

Ninguno — Map de timers es O(1) para add/delete.

### Casos edge problemáticos

- **scheduleRetry() después de destroy()**: Debe no programar nada o ser no-op
- **clearRetries() con timer ya ejecutado**: Timer ya no existe en Map, no-op correcto
- **Múltiples scheduleRetry() para mismo downloadId**: El segundo debe cancelar el primero

## 5. Estrategias

### Testing

- **Unitarios** (ampliar RetryManager.test.ts):
  - `destroy()` con timers pendientes → callbacks no se ejecutan
  - `clearRetries(id)` con timer pendiente → callback no se ejecuta
  - `scheduleRetry()` después de `destroy()` → no programa nada
  - Múltiples `scheduleRetry()` para mismo id → solo el último activo
- **Integración**: 241 tests existentes validan no regresión
- **Manual**: No aplica

### Rollback

1. `git revert HEAD`

### Migración de datos

- **¿Necesaria?**: No

## 6. Complejidad estimada

- **Nivel**: Baja
- **Justificación**: Añadir Map de timers + clearTimeout en métodos existentes
- **Tiempo estimado**: 30-45 minutos

## 7. Preguntas resueltas por /verify

- [x] ¿`scheduleRetry()` ya trackea timers? → **SÍ** — `pendingTimers: Map` ya existe (tarea 07)
- [x] ¿`QueueManager.destroy()` llama a `retryManager.destroy()`? → **NO** — llama `clearAll()` en vez de `destroy()`
- [x] ¿Hay otros setTimeout sin cleanup? → `DownloadsManager.ts:707` (fuera de alcance)

### Alcance revisado tras /verify

El timer tracking ya se implementó en tarea 07. Esta tarea se reduce a:

1. Cambiar `retryManager.clearAll()` → `retryManager.destroy()` en `QueueManager.destroy()`
2. Añadir flag `destroyed` en RetryManager para proteger `scheduleRetry()` post-destroy
3. Añadir 3-4 tests de timer cleanup con `jest.useFakeTimers()`

## Aprobación

- [ ] Spec revisado
- [ ] Dudas resueltas
- [ ] Listo para verificación de baseline
