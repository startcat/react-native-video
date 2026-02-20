# Especificación Técnica: Verificación final y limpieza

> Generado a partir de task.md el 2026-02-20

## Resumen

Verificar que la migración completa del sistema de analytics es correcta y funcional, actualizar la documentación interna para reflejar el nuevo origen del código, y opcionalmente limpiar los códigos de error obsoletos del sistema interno de errores del player.

## 1. Alcance

### Módulos afectados

**Directos:**

- `src/player/features/analytics/docs/`: actualización de documentación (README.md, guia-implementacion.md, eventos-plugin.md)
- `src/player/core/errors/`: limpieza opcional de códigos de error obsoletos (`PLAYER_ANALYTICS_PLUGIN_*`, `PLAYER_EVENT_HANDLER_*`)

**Indirectos:**

- `src/player/features/index.ts`: verificación de re-exports públicos (sin cambios esperados)
- `src/player/index.ts` / `src/index.ts`: verificación de API pública (sin cambios esperados)

### Dependencias impactadas

**Internas:**

- Ninguna — verificación y documentación únicamente

**Externas:**

- `@overon/react-native-overon-player-analytics-plugins@^0.2.0`: fuente de verdad confirmada

### Archivos de configuración

- `package.json`: verificación de `peerDependencies` (sin cambios esperados)

## 2. Contratos

### Cambios en API pública

| Elemento | Tipo de cambio | Antes | Después |
| -------- | -------------- | ----- | ------- |
| Códigos de error obsoletos en `PLAYER_ERROR_DEFINITIONS` | Eliminado (opcional) | Definidos pero sin uso | Eliminados |
| Documentación `docs/README.md` | Modificado | Referencia al código interno | Referencia al paquete externo |

### Cambios en tipos/interfaces

Ninguno — solo verificación y documentación.

### Cambios en eventos/callbacks

Ninguno.

## 3. Flujo de datos

### Estado global afectado

Ninguno.

### Persistencia

- Sin impacto

### Comunicación entre módulos

Sin cambios en runtime.

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change | Severidad | Mitigación |
| --------------- | --------- | ---------- |
| Eliminación de códigos de error obsoletos de `PLAYER_ERROR_DEFINITIONS` | Baja | Verificar con `grep` que no se usan en ningún `throw`/`catch` antes de eliminar. Si se usan, posponer. |

### Impacto en rendimiento

- Ninguno

### Casos edge problemáticos

- **Códigos de error compartidos**: algunos códigos `PLAYER_EVENT_HANDLER_*` o `PLAYER_ANALYTICS_PLUGIN_*` podrían usarse en otros contextos no relacionados con analytics. Verificar exhaustivamente antes de eliminar.

## 5. Estrategias

### Testing

- **Unitarios**: no aplica
- **Integración**: no aplica
- **E2E**: no aplica
- **Manual**: ejecutar todos los `grep` del checklist del task.md y confirmar resultados limpios

### Rollback

1. `git revert HEAD` si se eliminaron códigos de error y algo se rompe
2. La documentación puede revertirse con `git checkout HEAD -- src/player/features/analytics/docs/`

### Migración de datos

- **¿Necesaria?**: No
- **Estrategia**: N/A
- **Reversible**: Sí

## 6. Complejidad estimada

- **Nivel**: Baja
- **Justificación**: Principalmente verificaciones con `grep` y `tsc`, más actualización de documentación. La limpieza de códigos de error es opcional y de bajo riesgo si se verifica previamente.
- **Tiempo estimado**: 20-40 minutos

## 7. Preguntas sin resolver

### Técnicas

- [ ] **¿Los códigos `PLAYER_ANALYTICS_PLUGIN_*` y `PLAYER_EVENT_HANDLER_*` se usan en algún `throw`/`catch` fuera del módulo analytics?** — Verificar en `/verify` con `grep`
- [ ] **¿La documentación en `docs/` referencia código interno que ya no existe?** — Revisar manualmente en `/verify`
- [ ] **¿`src/player/index.ts` y `src/index.ts` exponen correctamente la API pública de analytics?** — Verificar en `/verify`

### De negocio

- No aplica.

### De rendimiento

- No aplica.

## Aprobación

- [ ] Spec revisado
- [ ] Decisión sobre limpieza de códigos de error (¿hacerlo en esta tarea o posponer?)
- [ ] Listo para verificación de baseline
