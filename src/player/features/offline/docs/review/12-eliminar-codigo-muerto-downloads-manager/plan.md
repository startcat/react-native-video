# Plan de Implementación: Eliminar código muerto en DownloadsManager

> Basado en spec.md (revisado tras /verify) | Generado el 2026-02-17

## Resumen ejecutivo

- **Objetivo**: Eliminar 5 métodos privados muertos (~250 líneas) de DownloadsManager.ts
- **Fases**: 1
- **Estimación**: 15 minutos
- **Riesgo general**: Bajo

## Pre-requisitos

- [x] Cadena completa de código muerto verificada con grep
- [x] Baseline verificado — 246 tests passing

---

## Fases de implementación

### Fase 1: Eliminar métodos muertos y sus comentarios

**Archivos a modificar**:
- `managers/DownloadsManager.ts` — eliminar 5 métodos privados

**Cambios específicos (en orden de líneas, de abajo hacia arriba para no desplazar offsets)**:
1. Eliminar `enforceGlobalLimits()` (líneas 714-730)
2. Eliminar `handleAutoRetry()` (líneas 693-712)
3. Eliminar `applyGlobalPolicies()` (líneas 676-691)
4. Eliminar `notifyQueueManagerOfEvent()` (líneas 490-600)
5. Eliminar `handleDownloadEvent()` (líneas 446-488)
6. Verificar que no quedan imports sin usar

**Punto de verificación**:
```bash
# Confirmar eliminación
grep -n "handleDownloadEvent\|notifyQueueManagerOfEvent\|handleAutoRetry\|enforceGlobalLimits\|applyGlobalPolicies" src/player/features/offline/managers/DownloadsManager.ts

# Tests
npx jest src/player/features/offline/__tests__/ --no-coverage
```

**Estimación**: 15 minutos

---

## Verificación final

```bash
npx jest src/player/features/offline/__tests__/ --no-coverage
```

## Rollback

```bash
git checkout -- src/player/features/offline/managers/DownloadsManager.ts
```

## Aprobación

- [ ] Plan revisado
- [ ] Listo para implementar
