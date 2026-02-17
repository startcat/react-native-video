# Plan de Implementación: Eliminar useOfflineQueue

> Basado en spec.md | Generado el 2026-02-17

## Resumen ejecutivo

- **Objetivo**: Eliminar el hook huérfano `useOfflineQueue.ts` que no tiene consumidores ni re-export
- **Fases**: 1
- **Estimación**: 10 minutos
- **Riesgo general**: Bajo

## Pre-requisitos

### Dependencias a instalar/actualizar

Ninguna.

### Configuración previa

- [x] Spec revisado y aprobado
- [x] Baseline verificado — 241 tests passing, 0 consumidores encontrados

### Estado de git requerido

- Branch base: `refactor_offline`
- Branch de trabajo: `refactor_offline_tasks/08-eliminar-use-offline-queue`

---

## Fases de implementación

### Fase 1: Eliminar fichero huérfano

**Objetivo**: Eliminar `useOfflineQueue.ts` del codebase

**Archivos a eliminar**:
- `hooks/useOfflineQueue.ts` — hook redundante sin consumidores (134 líneas)

**Archivos a modificar**:
- Ninguno — `hooks/index.ts` ya no exporta `useOfflineQueue`

**Cambios específicos**:
1. Eliminar `hooks/useOfflineQueue.ts`
2. Verificar que no hay errores de compilación
3. Verificar que los 241 tests siguen pasando

**Invariantes que podrían verse afectados**:
- Ninguno — el fichero no tiene consumidores

**Punto de verificación**:

```bash
# 1. Verificar que no queda referencia
grep -rn "useOfflineQueue" src/ --include="*.ts" --include="*.tsx"

# 2. Tests de regresión
npx jest src/player/features/offline/__tests__/ --no-coverage

# 3. Lint
npx eslint src/player/features/offline/hooks/index.ts
```

**Rollback de esta fase**:

```bash
git checkout -- src/player/features/offline/hooks/useOfflineQueue.ts
```

**Estimación**: 10 minutos

---

## Orden de ejecución

```
┌─────────┐
│ Fase 1  │  (única fase)
└─────────┘
```

## Testing por fase

| Fase | Tests unitarios | Tests integración | Verificación manual |
|------|----------------|-------------------|---------------------|
| 1 | N/A (eliminación) | 241 tests existentes | `grep` sin resultados |

## Checklist pre-implementación

- [x] Spec revisado y aprobado
- [x] Baseline verificado sin bloqueos
- [x] Branch creado
- [x] Entorno de desarrollo limpio
- [x] Tests actuales pasando (241/241)

## Rollback global

```bash
git checkout -- src/player/features/offline/hooks/useOfflineQueue.ts
```

## Aprobación

- [ ] Plan revisado
- [ ] Orden de fases aprobado
- [ ] Listo para implementar
