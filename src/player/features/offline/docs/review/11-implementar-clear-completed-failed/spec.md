# Especificación Técnica: Implementar clearCompleted/clearFailed

> Generado a partir de task.md el 2026-02-17

## Resumen

Implementar `clearCompleted()` y `clearFailed()` en `DownloadsManager` delegando a `queueManager.clearByState()`. Actualmente son stubs que solo logean sin hacer nada.

## 1. Alcance

### Módulos afectados

**Directos:**

- `managers/DownloadsManager.ts`: Implementar `clearCompleted()` y `clearFailed()` delegando a QueueManager

**Indirectos:**

- Ninguno — `QueueManager.clearByState()` ya funciona correctamente

### Fuera de alcance

- NO modificar `QueueManager.clearByState()` (ya funciona)
- NO añadir lógica adicional (solo delegación)

## 2. Contratos

### Cambios en API pública

| Elemento                            | Tipo de cambio           | Antes           | Después                                           |
| ----------------------------------- | ------------------------ | --------------- | ------------------------------------------------- |
| `DownloadsManager.clearCompleted()` | Cambio de comportamiento | Stub (solo log) | Delega a `queueManager.clearByState([COMPLETED])` |
| `DownloadsManager.clearFailed()`    | Cambio de comportamiento | Stub (solo log) | Delega a `queueManager.clearByState([FAILED])`    |

### Cambios en tipos/interfaces

Ninguno — las firmas ya existen.

### Cambios en eventos/callbacks

Depende de si `clearByState` ya emite eventos. Verificar con `/verify`.

## 3. Flujo de datos

### Estado global afectado

- Cola de descargas: se eliminan items con estado COMPLETED o FAILED
- Persistencia: `clearByState` debería persistir el cambio

### Comunicación entre módulos

- `DownloadsManager.clearCompleted()` → `queueManager.clearByState([COMPLETED])`
- `DownloadsManager.clearFailed()` → `queueManager.clearByState([FAILED])`

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change                      | Severidad | Mitigación                                        |
| ------------------------------------ | --------- | ------------------------------------------------- |
| Cambio intencional de comportamiento | Baja      | Los stubs no hacían nada, ahora hacen lo esperado |

### Casos edge problemáticos

- **clearByState elimina archivos del disco**: Verificar si también llama a `nativeManager.removeDownload()`
- **Cola vacía**: `clearByState` con estados sin items debería ser no-op
- **clearCompleted no afecta otros estados**: Solo COMPLETED, no DOWNLOADING ni QUEUED

## 5. Estrategias

### Testing

- **Actualizar** tests de contrato existentes si verifican comportamiento stub
- **Nuevos tests**:
  - `clearCompleted()` elimina items COMPLETED
  - `clearFailed()` elimina items FAILED
  - `clearCompleted()` no afecta items en otros estados (DOWNLOADING, QUEUED)
- **Integración**: 243 tests existentes validan no regresión

### Rollback

1. `git revert HEAD`

## 6. Complejidad estimada

- **Nivel**: Muy baja
- **Justificación**: Solo delegación a método existente
- **Tiempo estimado**: 20-30 minutos

## 7. Preguntas resueltas por /verify

- [x] ¿`clearByState()` elimina archivos del disco? → **SÍ** — `storageService.deleteFile()` + `nativeManager.removeDownload()` para streams
- [x] ¿`clearByState()` emite eventos? → **SÍ** — emite `downloads_cleared_by_state`
- [x] ¿Tests de contrato verifican comportamiento stub? → **NO** — no hay tests para clearCompleted/clearFailed
- [x] ¿Son async? → **SÍ** — `Promise<void>` en ambos

### Nota: QueueManager ya tiene métodos públicos equivalentes

- `queueManager.cleanupCompleted()` → llama `clearByState([COMPLETED])`
- `queueManager.clearFailed()` → llama `clearByState([FAILED])`

La delegación puede usar estos métodos directamente.

## Aprobación

- [ ] Spec revisado
- [ ] Dudas resueltas
- [ ] Listo para verificación de baseline
