# Plan de Implementación: Eliminar compresión simulada + getStats duplicado

> Basado en spec.md (revisado tras /verify) | Generado el 2026-02-17

## Resumen ejecutivo

- **Objetivo**: Eliminar compresión simulada de PersistenceService y método getStats() duplicado de QueueManager
- **Fases**: 2
- **Estimación**: 30 minutos
- **Riesgo general**: Bajo

## Pre-requisitos

- [x] compressData/decompressData confirmados como stubs puros
- [x] QueueManager.getStats() sin consumidores
- [x] Baseline verificado — 246 tests passing

---

## Fases de implementación

### Fase 1: Eliminar compresión simulada de PersistenceService

**Archivos a modificar**:
- `services/storage/PersistenceService.ts` — eliminar compressData/decompressData y simplificar call sites
- `types/persistence.ts` — eliminar propiedad `compressionEnabled`
- `defaultConfigs.ts` — eliminar `compressionEnabled: true`

**Cambios específicos**:
1. Eliminar métodos `compressData()` y `decompressData()`
2. En cada call site (6 total), reemplazar el ternario `this.config.compressionEnabled ? await this.compressData(data) : JSON.stringify(data)` por `JSON.stringify(data)` directamente
3. En cada call site de decompress, reemplazar por `JSON.parse(serializedData)` directamente
4. Eliminar `compressionEnabled` de `PersistenceServiceConfig` en types/persistence.ts
5. Eliminar `compressionEnabled: true` de defaultConfigs.ts
6. Actualizar log de inicialización (línea 100) para no mostrar compressionEnabled

**Punto de verificación**:
```bash
npx jest src/player/features/offline/__tests__/ --no-coverage
```

**Estimación**: 20 minutos

---

### Fase 2: Eliminar getStats() duplicado de QueueManager

**Archivos a modificar**:
- `managers/QueueManager.ts` — eliminar método `getStats()` (líneas ~1897-1953)

**Cambios específicos**:
1. Eliminar el método `getStats()` completo (~56 líneas)
2. Verificar con grep que no queden referencias

**Punto de verificación**:
```bash
grep -n "\.getStats()" src/player/features/offline/managers/QueueManager.ts
npx jest src/player/features/offline/__tests__/ --no-coverage
```

**Estimación**: 10 minutos

---

## Verificación final

```bash
npx jest src/player/features/offline/__tests__/ --no-coverage
```

## Rollback

```bash
git checkout -- src/player/features/offline/services/storage/PersistenceService.ts src/player/features/offline/managers/QueueManager.ts src/player/features/offline/types/persistence.ts src/player/features/offline/defaultConfigs.ts
```

## Aprobación

- [ ] Plan revisado
- [ ] Listo para implementar
