# Plan de Implementación: Eliminar módulo interno de analytics

> Basado en spec.md | Generado el 2026-02-20

## Resumen ejecutivo

- **Objetivo**: Eliminar los 10 archivos `.ts` del módulo interno `src/player/features/analytics/` conservando únicamente `docs/`
- **Fases**: 2
- **Estimación**: 15-30 minutos
- **Riesgo general**: Bajo

## Pre-requisitos

### Dependencias

- Ninguna

### Estado de git requerido

- Branch de trabajo: `refactor_plugins` (actual)
- ✅ Tarea 02 completada
- ✅ Tarea 03 completada
- ✅ Sin imports residuales al módulo interno

---

## Fases de implementación

### Fase 1: Eliminar archivos del módulo interno

**Objetivo**: Eliminar los 10 archivos `.ts` del módulo interno

**Archivos a eliminar**:

- `src/player/features/analytics/index.ts`
- `src/player/features/analytics/AnalyticsPluginFactory.ts`
- `src/player/features/analytics/AnalyticsPluginFactory.example.ts`
- `src/player/features/analytics/PlayerAnalyticsEvents.ts`
- `src/player/features/analytics/constants.ts`
- `src/player/features/analytics/hooks/usePlayerAnalyticsEvents.ts`
- `src/player/features/analytics/hooks/index.ts`
- `src/player/features/analytics/types/Plugin.ts`
- `src/player/features/analytics/types/Factory.ts`
- `src/player/features/analytics/types/index.ts`

**Cambios específicos**:

1. Eliminar los 10 archivos con `git rm`
2. Verificar que las carpetas `hooks/` y `types/` quedan vacías (solo contenían esos archivos)

**Punto de verificación**:

```bash
# Confirmar que no quedan archivos .ts fuera de docs/
find src/player/features/analytics/ -type f -name "*.ts" -o -name "*.tsx" | grep -v "/docs/"
# Resultado esperado: vacío

# Confirmar que docs/ sigue intacto
ls src/player/features/analytics/docs/
```

**Rollback de esta fase**:

```bash
git checkout HEAD -- src/player/features/analytics/
```

**Estimación**: 5 minutos

---

### Fase 2: Verificación TypeScript y limpieza

**Objetivo**: Confirmar que la eliminación no introduce errores nuevos

**Cambios específicos**:

1. Ejecutar `npx tsc --noEmit --skipLibCheck` y confirmar que el número de errores no supera el baseline (225)
2. Verificar que las carpetas vacías `hooks/` y `types/` no generan problemas

**Punto de verificación**:

```bash
# TypeScript check — debe mantenerse en 225 errores (baseline)
npx tsc --noEmit --skipLibCheck 2>&1 | grep -c "error TS"

# Confirmar que no hay imports rotos relacionados con analytics
npx tsc --noEmit --skipLibCheck 2>&1 | grep "analytics"
```

**Rollback de esta fase**:

```bash
git checkout HEAD -- src/player/features/analytics/
```

**Estimación**: 5 minutos

---

## Orden de ejecución

```
┌─────────┐
│ Fase 1  │  Eliminar 10 archivos
└────┬────┘
     │
┌────▼────┐
│ Fase 2  │  Verificar TypeScript
└─────────┘
```

### Dependencias entre fases

- Fase 2 depende de: Fase 1

### Puntos de no retorno

- Ninguno — git permite restaurar en cualquier momento

## Checklist pre-implementación

- [x] Spec revisado y aprobado
- [x] Baseline verificado (225 errores TS, sin imports residuales)
- [x] Branch `refactor_plugins` activo
- [x] Tareas 02 y 03 completadas

## Rollback global

```bash
git checkout HEAD -- src/player/features/analytics/
```

## Aprobación

- [ ] Plan revisado
- [ ] Listo para implementar
