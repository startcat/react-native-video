# Spec: Eliminar compresión simulada + getStats duplicado

> Especificación técnica | Tarea 13/19 | Fase C
> IDs auditoría: CI-001, CI-002

## 1. Objetivo

Eliminar dos complejidades innecesarias:

1. **CI-001**: Métodos `compress()`/`decompress()` en PersistenceService que son stubs (retornan datos sin modificar)
2. **CI-002**: Método `getStats()` duplicado en QueueManager (ya existe `getQueueStats()`)

## 2. Cambios requeridos

### CI-001: PersistenceService — eliminar compresión simulada

| Acción                           | Detalle                                                      |
| -------------------------------- | ------------------------------------------------------------ |
| Eliminar `compress()`            | Método stub que retorna datos sin modificar                  |
| Eliminar `decompress()`          | Método stub que retorna datos sin modificar                  |
| Actualizar `saveDownloadState()` | Eliminar llamada a `compress()`, guardar datos directamente  |
| Actualizar `loadDownloadState()` | Eliminar llamada a `decompress()`, cargar datos directamente |

### CI-002: QueueManager — eliminar getStats duplicado

| Acción                | Detalle                                                             |
| --------------------- | ------------------------------------------------------------------- |
| Eliminar `getStats()` | Duplica funcionalidad de `getQueueStats()`                          |
| Migrar consumidores   | Reemplazar `getStats()` → `getQueueStats()` en todos los call sites |

## 3. Pre-condiciones (verificar con /verify)

- [ ] Confirmar que `compress()` y `decompress()` son stubs puros (retornan input sin modificar)
- [ ] Confirmar que `getStats()` y `getQueueStats()` retornan el mismo tipo (`QueueStats`)
- [ ] Identificar todos los consumidores de `getStats()` con grep
- [ ] Tests de contrato pasando (baseline)

## 4. Contratos

### Contratos que NO cambian

- API pública de QueueManager (`getQueueStats()` intacto)
- Formato de datos persistidos (sin cambio)
- Comportamiento de persistencia (save/load)

### Contratos que cambian

- `getStats()` eliminado — consumidores deben usar `getQueueStats()`
- `compress()`/`decompress()` eliminados — métodos internos, sin impacto externo

## 5. Riesgos

| Riesgo                                          | Probabilidad | Impacto | Mitigación                                     |
| ----------------------------------------------- | ------------ | ------- | ---------------------------------------------- |
| compress/decompress hacen algo sutil            | Baja         | Alto    | Leer implementación completa antes de eliminar |
| getStats retorna tipo diferente a getQueueStats | Baja         | Medio   | Verificar tipos con /verify                    |
| Consumidores externos de getStats               | Baja         | Medio   | grep exhaustivo                                |

### Rollback

1. `git revert HEAD`

## 6. Complejidad estimada

- **Nivel**: Baja
- **Justificación**: Eliminación de stubs y deduplicación
- **Tiempo estimado**: 30-45 minutos

## 7. Preguntas resueltas por /verify

- [x] ¿`compress()`/`decompress()` son stubs puros? → **SÍ** — `compressData()` = `JSON.stringify(data)`, `decompressData()` = `JSON.parse(data)` — idéntico al else branch
- [x] ¿`getStats()` y `getQueueStats()` retornan el mismo tipo? → **SÍ** — ambos retornan `QueueStats`, lógica casi idéntica
- [x] ¿Cuántos consumidores tiene `queueManager.getStats()`? → **CERO** — grep no encuentra ningún call site
- [x] ¿`compressionEnabled` está activo por defecto? → **SÍ** — `defaultConfigs.ts:93` lo pone a `true`

### Nota sobre compressionEnabled

- El config `compressionEnabled` y su tipo en `types/persistence.ts` también deben eliminarse
- Las 6 call sites de `compressData()`/`decompressData()` deben reemplazarse por `JSON.stringify()`/`JSON.parse()` directamente
- El log de inicialización (línea 100) que muestra `compressionEnabled` debe actualizarse

### Nota sobre getStats en otros servicios

- `getStats()` existe en `StreamDownloadService`, `BinaryDownloadService`, `SubtitleDownloadService`, `DownloadService`, `NativeManager`, `PersistenceService` — estos son **diferentes** y NO se eliminan
- Solo se elimina `QueueManager.getStats()` que duplica `QueueManager.getQueueStats()`

## Aprobación

- [ ] Spec revisado
- [ ] Dudas resueltas
- [ ] Listo para verificación de baseline
