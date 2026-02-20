# Especificación Técnica: Eliminar módulo interno de analytics

> Generado a partir de task.md el 2026-02-20

## Resumen

Eliminar los 10 archivos `.ts` del módulo interno `src/player/features/analytics/` que han sido reemplazados por el paquete externo `@overon/react-native-overon-player-analytics-plugins`, conservando únicamente la carpeta `docs/`.

## 1. Alcance

### Módulos afectados

**Directos:**

- `src/player/features/analytics/`: módulo a eliminar (excepto `docs/`)
- `src/player/features/index.ts`: ya migrado en Tarea 02 — no requiere cambios adicionales

**Indirectos:**

- Ninguno — las Tareas 02 y 03 garantizan que no hay imports residuales al módulo interno

### Dependencias impactadas

**Internas:**

- Ninguna — todos los imports ya apuntan al paquete externo tras las Tareas 02 y 03

**Externas:**

- `@overon/react-native-overon-player-analytics-plugins@^0.2.0`: pasa a ser la única fuente de verdad para el sistema de analytics

### Archivos a eliminar

```
src/player/features/analytics/
├── AnalyticsPluginFactory.ts           ← ELIMINAR
├── AnalyticsPluginFactory.example.ts   ← ELIMINAR
├── PlayerAnalyticsEvents.ts            ← ELIMINAR
├── constants.ts                        ← ELIMINAR
├── index.ts                            ← ELIMINAR (ver decisión)
├── hooks/
│   ├── usePlayerAnalyticsEvents.ts     ← ELIMINAR
│   └── index.ts                        ← ELIMINAR
└── types/
    ├── Plugin.ts                       ← ELIMINAR
    ├── Factory.ts                      ← ELIMINAR
    └── index.ts                        ← ELIMINAR
```

### Archivos a conservar

```
src/player/features/analytics/
└── docs/                               ← CONSERVAR
    ├── README.md
    ├── eventos-plugin.md
    ├── guia-implementacion.md
    ├── mejores-practicas.md
    └── migration/                      ← CONSERVAR
```

### Archivos de configuración

- Ninguno

## 2. Contratos

### Decisión sobre `index.ts` raíz

**Opción A — Eliminar completamente (seleccionada):**

- Eliminar `src/player/features/analytics/index.ts`
- `src/player/features/index.ts` ya re-exporta directamente desde el paquete externo (migrado en Tarea 02) — no requiere cambios adicionales

**Justificación:** La Tarea 02 ya migró `src/player/features/index.ts` a re-exports selectivos del paquete externo. No existe ningún import residual al módulo interno (prerequisito verificado en Tareas 02 y 03). La Opción A es la más limpia.

### Cambios en API pública

| Elemento | Tipo de cambio | Antes | Después |
| -------- | -------------- | ----- | ------- |
| `src/player/features/analytics/index.ts` | Eliminado | Re-exportaba clases y tipos internos | N/A |
| `src/player/features/index.ts` | Sin cambio | Re-exports selectivos del paquete externo | Igual |

### Cambios en tipos/interfaces

Ninguno — los tipos ya se importan del paquete externo.

### Cambios en eventos/callbacks

Ninguno.

## 3. Flujo de datos

### Estado global afectado

Ninguno.

### Persistencia

- Sin impacto

### Comunicación entre módulos

Ningún cambio en runtime — es una eliminación de código muerto.

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change | Severidad | Mitigación |
| --------------- | --------- | ---------- |
| Imports residuales no detectados al módulo interno | Alta | Verificar con `grep` antes de eliminar — prerequisito del `/verify` |
| Archivos de ejemplo eliminados (`AnalyticsPluginFactory.example.ts`) | Baja | Son plantillas que ahora viven en la documentación del paquete externo |

### Impacto en rendimiento

- Ninguno — eliminación de código muerto, sin impacto en runtime

### Casos edge problemáticos

- **Imports dinámicos**: si algún archivo usa `import()` dinámico apuntando al módulo interno, `grep` estático no lo detectará. Poco probable dado el contexto.
- **Re-exports transitivos**: si algún archivo externo al repo importa desde `features/analytics` directamente (no a través de `features/index.ts`), se romperá. Verificar con `grep` en el `/verify`.

## 5. Estrategias

### Testing

- **Unitarios**: no aplica (sin suite de tests para este módulo)
- **Integración**: no aplica
- **E2E**: no aplica
- **Manual**: `npx tsc --noEmit --skipLibCheck` sin nuevos errores; `grep -r "features/analytics" src/ --include="*.ts" --include="*.tsx" --exclude-dir=analytics` sin resultados

### Rollback

1. `git revert HEAD` o restaurar los archivos eliminados desde git
2. Verificar que `npx tsc --noEmit --skipLibCheck` sigue pasando

### Migración de datos

- **¿Necesaria?**: No
- **Estrategia**: N/A
- **Reversible**: Sí (git)

## 6. Complejidad estimada

- **Nivel**: Baja
- **Justificación**: Eliminación de archivos sin lógica de sustitución — las Tareas 02 y 03 ya hicieron el trabajo pesado. El riesgo principal es un import residual no detectado, mitigado por el `/verify`.
- **Tiempo estimado**: 10-20 minutos

## 7. Preguntas sin resolver

### Técnicas

- [ ] **¿Hay imports residuales al módulo interno fuera de `src/player/features/analytics/`?** — Verificar en `/verify` con `grep`
- [ ] **¿Existe algún test que importe desde el módulo interno?** — Verificar en `/verify`
- [ ] **¿Hay imports dinámicos (`import()`) al módulo interno?** — Verificar en `/verify`

### De negocio

- No aplica.

### De rendimiento

- No aplica.

## Aprobación

- [ ] Spec revisado
- [ ] Decisión sobre `index.ts` confirmada (Opción A)
- [ ] Listo para verificación de baseline
