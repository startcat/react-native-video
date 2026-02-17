# Especificación Técnica: Eliminar useOfflineQueue

> Generado a partir de task.md el 2026-02-17

## Resumen

Eliminar el hook redundante `useOfflineQueue.ts` (134 líneas) que duplica funcionalidad de `useDownloadsQueue.ts`, y migrar consumidores si existen.

## 1. Alcance

### Módulos afectados

**Directos:**
- `hooks/useOfflineQueue.ts`: ELIMINAR — fichero completo
- `hooks/index.ts`: MODIFICAR — eliminar re-export de `useOfflineQueue`

**Indirectos:**
- Consumidores de `useOfflineQueue` (si existen): MODIFICAR — reemplazar import por `useDownloadsQueue`

### Dependencias impactadas

**Internas:**
- Ninguna nueva

**Externas:**
- Ninguna

### Archivos de configuración

- Ninguno

## 2. Contratos

### Cambios en API pública

| Elemento | Tipo de cambio | Antes | Después |
|---|---|---|---|
| `useOfflineQueue` | Eliminado | Hook exportado desde `hooks/index.ts` | No existe |

### Cambios en tipos/interfaces

Ninguno — `useDownloadsQueue` ya expone una API superset.

### Cambios en eventos/callbacks

Ninguno.

### Diferencia de API conocida

- `useOfflineQueue` tenía `maxConcurrent: 3` hardcodeado
- `useDownloadsQueue` usa la configuración del QueueManager (configurable)
- Los consumidores que dependían del hardcode deberán usar `setMaxConcurrent(3)` si necesitan ese valor específico

## 3. Flujo de datos

### Estado global afectado

- Ninguno — ambos hooks consumen el mismo QueueManager singleton

### Persistencia

- **Local storage**: sin impacto
- **Base de datos**: sin impacto
- **Cache**: sin impacto

### Comunicación entre módulos

- Sin cambios — el QueueManager sigue siendo el punto central

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change | Severidad | Mitigación |
|---|---|---|
| `useOfflineQueue` eliminado | Baja | Buscar consumidores con grep antes de eliminar; `npx tsc --noEmit` para detectar imports rotos |

### Impacto en rendimiento

- Ninguno

### Casos edge problemáticos

- **Imports dinámicos**: `grep -r` podría no detectar `require()` dinámicos o `import()` lazy. Mitigación: `npx tsc --noEmit` captura errores de tipo.
- **Consumidores fuera de `src/`**: poco probable pero verificar con grep en raíz del proyecto.

## 5. Estrategias

### Testing

- **Unitarios**: No se crean tests nuevos (es eliminación de código)
- **Integración**: Verificar que tests de contrato Fase A siguen en verde (241 tests)
- **E2E**: No aplica
- **Manual**: No aplica

### Rollback

1. `git revert HEAD`

### Migración de datos

- **¿Necesaria?**: No
- **Estrategia**: N/A
- **Reversible**: Sí

## 6. Complejidad estimada

- **Nivel**: Baja
- **Justificación**: Eliminación de fichero + actualización de index. Sin lógica nueva.
- **Tiempo estimado**: 15-30 minutos

## 7. Preguntas sin resolver

### Técnicas

- [ ] ¿Existen consumidores de `useOfflineQueue` en el codebase? (verificar con `/verify`)
- [ ] ¿El `hooks/index.ts` re-exporta `useOfflineQueue`? (verificar con `/verify`)

### De negocio

- Ninguna

### De rendimiento

- Ninguna

## Aprobación

- [ ] Spec revisado
- [ ] Dudas resueltas
- [ ] Listo para verificación de baseline
