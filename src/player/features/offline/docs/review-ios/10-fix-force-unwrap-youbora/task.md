# Tarea: Fix force unwrap en YouboraParams (NC-006)

> Tarea 10 de 20 | Fase C: Correcciones críticas
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`YouboraParams.swift` línea 83 contiene `(json["contentIsLive"] as? Bool)!` — un force unwrap que crashea la app si el campo `contentIsLive` no está presente en el diccionario. Este es uno de los 2 casos no contemplados de prioridad crítica (NC-006).

**IDs de auditoría relacionados**: NC-006, SA-08

## Objetivo

Eliminar el force unwrap en `YouboraParams.swift` reemplazándolo por un valor por defecto seguro, evitando el crash de la app.

## Alcance

### Código afectado

- `ios/Video/DataStructures/YouboraParams.swift` — línea 83: cambiar `(json["contentIsLive"] as? Bool)!` por `json["contentIsLive"] as? Bool ?? false`

### Fuera de alcance

- NO corregir otros force unwraps en otros ficheros (SA-08 tiene más, pero son de menor prioridad)
- NO refactorizar YouboraParams más allá de este fix

## Requisitos funcionales

1. **[NC-006]**: El parseo de YouboraParams no debe crashear si falta el campo `contentIsLive`

## Requisitos técnicos

1. Cambio de una sola línea: `(json["contentIsLive"] as? Bool)!` → `json["contentIsLive"] as? Bool ?? false`
2. No introducir dependencias nuevas

## Cambios de contrato

- **[NC-006]**: Cuando `contentIsLive` no está presente, ahora devuelve `false` en vez de crashear. El test de contrato que documentaba este crash debe actualizarse para verificar el nuevo comportamiento (devuelve `false`).

## Criterios de aceptación

### Funcionales
- [ ] `YouboraParams` con dict sin `contentIsLive` → `contentIsLive == false` (no crash)
- [ ] `YouboraParams` con dict con `contentIsLive: true` → `contentIsLive == true` (sin cambio)

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅
- [ ] El test de NC-006 en `DataStructureParsingTests.swift` se descomenta y verifica el nuevo comportamiento
- [ ] Test nuevo: `testYouboraParams_missingContentIsLive_defaultsFalse`

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `ios/Tests/DataStructureParsingTests.swift` — el test de YouboraParams sin `contentIsLive` estaba comentado documentando NC-006. Ahora se descomenta y se actualiza para verificar que devuelve `false`.

### Tests nuevos a crear

- Ninguno adicional — el test existente se descomenta y actualiza.

## Dependencias

### Tareas previas requeridas
- Tarea 04 (Fase A): tests de contrato de DataStructures deben estar en verde

### Tareas que dependen de esta
- Ninguna

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: Ninguno significativo. Es un cambio de una línea.
- **Mitigación**: El valor por defecto `false` es conservador (no live).
- **Rollback**: `git revert HEAD`

## Estimación

15-30 minutos

## Notas

- Este es el fix más sencillo del plan pero uno de los más impactantes: previene un crash en producción.
- Verificar si hay otros force unwraps en `YouboraParams.swift` que deban corregirse al mismo tiempo (SA-08 los lista).
