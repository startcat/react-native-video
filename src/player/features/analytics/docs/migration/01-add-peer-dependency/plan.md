# Plan de Implementación: Añadir peerDependency del paquete externo de analytics

> Basado en spec.md | Generado el 2026-02-19

## Resumen ejecutivo

- **Objetivo**: Añadir `@overon/react-native-overon-player-analytics-plugins@^0.2.0` a `peerDependencies` en `package.json`
- **Fases**: 1
- **Estimación**: 5-10 minutos
- **Riesgo general**: Bajo

## Pre-requisitos

### Dependencias a instalar/actualizar

No aplica — este cambio es declarativo. No se instala ningún paquete en este repositorio.

### Configuración previa

- [x] `package.json` existe y es JSON válido
- [x] Sección `peerDependencies` ya existe
- [x] Paquete externo no está declarado en ninguna sección

### Estado de git requerido

- Branch de trabajo: `refactor_plugins` (ya activo)

---

## Fases de implementación

### Fase 1: Añadir peerDependencies en package.json

**Objetivo**: Declarar el paquete externo de analytics y sus dependencias transitivas como peerDependencies.

**Archivos a modificar**:

- `package.json` — añadir 3 entradas en `peerDependencies`

**Cambios específicos**:

1. Añadir `"@overon/react-native-overon-player-analytics-plugins": "^0.2.0"` en `peerDependencies`
2. Añadir `"@overon/react-native-logger": "^0.1.6"` en `peerDependencies`
3. Añadir `"@overon/react-native-overon-errors": "^0.1.1"` en `peerDependencies`

**Decisión de versiones** (resuelta en `/verify`):
- Usar `^0.2.0` en lugar de `>=0.2.0` — más seguro en paquetes `0.x` donde minor puede ser breaking
- Las versiones de dependencias transitivas se alinean con las que declara el paquete externo en su `package.json`

**Invariantes que podrían verse afectados**:
- Ninguno — cambio puramente declarativo, sin efecto en runtime ni en TypeScript

**Punto de verificación**:

```bash
# JSON válido
cat package.json | python3 -m json.tool > /dev/null && echo "✅ JSON válido"

# peerDependency presente
cat package.json | python3 -c "import sys,json; d=json.load(sys.stdin); p=d['peerDependencies']; print('✅', p.get('@overon/react-native-overon-player-analytics-plugins', '❌ NO ENCONTRADO'))"

# TypeScript sin nuevos errores (comparar con baseline: 18 errores preexistentes)
npx tsc --noEmit --skipLibCheck 2>&1 | wc -l
```

**Rollback de esta fase**:

```bash
git revert HEAD
```

**Estimación**: 5 minutos

---

## Orden de ejecución

```
┌─────────────────────────────────────────┐
│ Fase 1: Añadir peerDependencies         │
│         en package.json                 │
└─────────────────────────────────────────┘
```

### Dependencias entre fases

- Solo hay una fase, sin dependencias.

### Puntos de no retorno

- Ninguno — el cambio es completamente reversible con `git revert`.

## Testing por fase

| Fase | Tests unitarios | Tests integración | Verificación manual |
|---|---|---|---|
| 1 | N/A | N/A | JSON válido + peerDep presente + tsc sin nuevos errores |

## Checklist pre-implementación

- [x] Spec revisado y aprobado
- [x] Baseline verificado sin bloqueos
- [x] Branch de trabajo activo (`refactor_plugins`)
- [x] 18 errores TypeScript preexistentes documentados (no relacionados con esta tarea)

## Rollback global

```bash
git revert HEAD
```

O si no se ha hecho commit:

```bash
git checkout -- package.json
```

## Aprobación

- [ ] Plan revisado
- [ ] Listo para implementar
