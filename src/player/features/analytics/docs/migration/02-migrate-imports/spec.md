# Especificación Técnica: Migrar imports internos al paquete externo

> Generado a partir de task.md el 2026-02-19 | Actualizado con análisis automático

## Resumen

Reemplazar todos los imports que apuntan al módulo interno `src/player/features/analytics` por imports del paquete externo `@overon/react-native-overon-player-analytics-plugins` en los **10 archivos consumidores** identificados mediante análisis real del código.

---

## 1. Alcance

### Módulos afectados

**Directos (archivos a modificar — verificado con grep):**

| Archivo                                                    | Símbolo(s) importado(s)                                                     |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/player/core/events/VideoEventsAdapter.ts`             | `PlayerAnalyticsEvents`                                                     |
| `src/player/core/events/hooks/useVideoAnalytics.ts`        | `PlayerAnalyticsEvents`, `PlayerAnalyticsPlugin`                            |
| `src/player/core/events/types/index.ts`                    | `PlayerAnalyticsEvents`, `PlayerAnalyticsPlugin`                            |
| `src/player/core/events/handlers/AdEventsHandler.ts`       | `PlayerAnalyticsEvents`                                                     |
| `src/player/core/events/handlers/ErrorEventsHandler.ts`    | `PlayerAnalyticsEvents`                                                     |
| `src/player/core/events/handlers/MetadataEventsHandler.ts` | `PlayerAnalyticsEvents`                                                     |
| `src/player/core/events/handlers/PlaybackEventsHandler.ts` | `PlayerAnalyticsEvents`                                                     |
| `src/player/core/events/handlers/QualityEventsHandler.ts`  | `PlayerAnalyticsEvents`                                                     |
| `src/player/core/events/handlers/TrackEventsHandler.ts`    | `PlayerAnalyticsEvents`                                                     |
| `src/player/types/newTypes.ts`                             | `PlayerAnalyticsPlugin` (desde ruta profunda `../features/analytics/types`) |
| `src/player/features/index.ts`                             | re-export `export * from "./analytics"` → cambiar a re-export **selectivo** |

**Descartados del task.md original (no tienen import directo de analytics):**

- `src/player/flavours/audio/index.tsx`
- `src/player/flavours/normal/index.tsx`

**Indirectos:**

- `src/player/features/analytics/index.ts` — barrel file interno; queda intacto en esta tarea (se elimina en tarea 04)
- Cualquier consumidor externo del player que importe tipos de analytics a través de los re-exports del player

### Dependencias impactadas

**Externas (nueva fuente de imports):**

- `@overon/react-native-overon-player-analytics-plugins@^0.2.0` — ya declarado como peerDependency (tarea 01 completada)

**Internas (dejan de ser fuente de imports):**

- `src/player/features/analytics` — el módulo interno deja de ser importado desde fuera de su propio directorio

**Prerrequisito resuelto:**

- `@overon/react-native-overon-player-analytics-plugins` está instalado en `node_modules` como `devDependency` (añadido manualmente en `package.json`)

### Archivos de configuración

- Ninguno — solo cambios en imports de archivos TypeScript/TSX

---

## 2. Contratos

### Cambios en API pública

La API pública **no cambia** — los mismos símbolos están disponibles en el paquete externo con idéntica firma:

| Símbolo                                                   | Tipo de cambio | Antes (fuente)       | Después (fuente)                                       |
| --------------------------------------------------------- | -------------- | -------------------- | ------------------------------------------------------ |
| `PlayerAnalyticsEvents`                                   | Fuente cambia  | `features/analytics` | `@overon/react-native-overon-player-analytics-plugins` |
| `BaseAnalyticsPluginFactory`                              | Fuente cambia  | `features/analytics` | `@overon/react-native-overon-player-analytics-plugins` |
| `usePlayerAnalyticsEvents`                                | Fuente cambia  | `features/analytics` | `@overon/react-native-overon-player-analytics-plugins` |
| `PlayerAnalyticsPlugin` (tipo)                            | Fuente cambia  | `features/analytics` | `@overon/react-native-overon-player-analytics-plugins` |
| `AnalyticsFactoryConfig` (tipo)                           | Fuente cambia  | `features/analytics` | `@overon/react-native-overon-player-analytics-plugins` |
| `PluginConfig`, `PluginCreator`, `PluginRegistry` (tipos) | Fuente cambia  | `features/analytics` | `@overon/react-native-overon-player-analytics-plugins` |
| Todos los `*Params` types                                 | Fuente cambia  | `features/analytics` | `@overon/react-native-overon-player-analytics-plugins` |

### Cambios en tipos/interfaces

Ningún cambio de forma — los tipos son estructuralmente idénticos entre el módulo interno y el paquete externo. TypeScript los tratará como compatibles.

### Cambios en eventos/callbacks

Ninguno — la lógica de dispatching de eventos no cambia en esta tarea.

---

## 3. Flujo de datos

### Estado global afectado

Ninguno — cambio de imports en tiempo de compilación, sin efecto en estado de runtime.

### Persistencia

- **Local storage**: sin impacto
- **Base de datos**: sin impacto
- **Cache**: sin impacto

### Comunicación entre módulos

- El grafo de dependencias en runtime no cambia — los mismos módulos se comunican de la misma forma
- Solo cambia la fuente de resolución de módulos en tiempo de compilación/bundling

---

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change                                                                                                                                                                                                                                                                                                                                   | Severidad | Mitigación                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------ | --- |
| ~~El paquete externo no está instalado~~ (✅ resuelto — instalado como devDependency)                                                                                                                                                                                                                                                             | ~~Alta~~  | Resuelto                                                                             |
| `src/player/features/index.ts` hace `export * from "./analytics"` — el paquete externo exporta **6 grupos** (`AnalyticsPluginFactory`, `hooks`, `PlayerAnalyticsEvents`, `types`, `errors`, `constants`) vs. los **4 grupos** del módulo interno. Un `export *` del paquete externo expondría `errors` y `constants` en la API pública del player | Media     | Usar re-export **selectivo** en `features/index.ts` limitado a los 4 grupos actuales |     |
| Si algún handler importa un símbolo que el paquete externo no exporta (p.ej. un tipo interno), TypeScript fallará                                                                                                                                                                                                                                 | Media     | Verificar los imports exactos de cada handler antes de implementar                   |

### Impacto en rendimiento

- Ninguno en runtime — el bundler resuelve los imports en build time de la misma forma

### Casos edge problemáticos

- **`src/player/features/index.ts`**: actualmente hace `export * from "./analytics"`. El paquete externo exporta 2 grupos adicionales (`errors`, `constants`) que el módulo interno no expone. Usar re-export selectivo:
  ```typescript
  export { BaseAnalyticsPluginFactory } from "@overon/react-native-overon-player-analytics-plugins";
  export { PlayerAnalyticsEvents } from "@overon/react-native-overon-player-analytics-plugins";
  export { usePlayerAnalyticsEvents } from "@overon/react-native-overon-player-analytics-plugins";
  export type {
  	PlayerAnalyticsPlugin,
  	AnalyticsFactoryConfig,
  	PluginConfig,
  	PluginCreator,
  	PluginRegistry,
  } from "@overon/react-native-overon-player-analytics-plugins";
  // + todos los *Params types
  ```
- **`src/player/types/newTypes.ts`** importa desde la ruta profunda `../features/analytics/types` en lugar del barrel `../features/analytics`. El import nuevo debe apuntar al paquete externo directamente.

---

## 5. Estrategias

### Testing

- **Unitarios**: no aplica (cambio de imports, sin lógica nueva)
- **Integración**: no aplica
- **E2E**: no aplica
- **Manual**: `yarn tsc --noEmit` debe pasar sin nuevos errores relacionados con analytics; `grep -r "features/analytics" src/ --include="*.ts" --include="*.tsx" --exclude-dir=analytics` debe devolver vacío

### Rollback

1. Revertir los imports en los 10-11 archivos modificados (o `git revert HEAD`)
2. Verificar que `yarn tsc --noEmit` sigue pasando con los errores preexistentes del baseline

### Migración de datos

- **¿Necesaria?**: No
- **Estrategia**: N/A
- **Reversible**: Sí — `git revert` o edición manual de imports

---

## 6. Complejidad estimada

- **Nivel**: Media
- **Justificación**: 10-11 archivos a modificar, todos con cambios mecánicos de imports. El riesgo principal es el re-export selectivo en `features/index.ts` para no exponer `errors` y `constants` del paquete externo.
- **Tiempo estimado**: 20-40 minutos

---

## 7. Preguntas sin resolver

### Técnicas

- [x] **¿Está el paquete externo instalado localmente?** ✅ Resuelto — instalado como `devDependency` en `package.json`
- [x] **¿Qué exporta exactamente cada handler?** ✅ Resuelto — todos los handlers importan únicamente `PlayerAnalyticsEvents` (verificado con grep)
- [x] **`src/player/features/index.ts`: ¿`export *` o re-export selectivo?** ✅ Decidido — usar re-export **selectivo** para no exponer `errors` y `constants` del paquete externo
- [x] **¿Hay algún símbolo del módulo interno que el paquete externo no exporte?** ✅ Verificado — `PlayerAnalyticsEvents` y `PlayerAnalyticsPlugin` están en el paquete externo. Los 4 grupos del módulo interno están todos presentes en el paquete externo
- [ ] **¿Qué tipos `*Params` exactos exporta el paquete externo?** Verificar el `types/index.ts` del paquete externo para listar todos los params types que deben incluirse en el re-export selectivo de `features/index.ts`

### De negocio

- No aplica para esta tarea técnica.

### De rendimiento

- No aplica — cambio en tiempo de compilación.

---

## Aprobación

- [ ] Spec revisado
- [ ] Dudas resueltas (pendiente: tipos `*Params` exactos para re-export selectivo)
- [ ] Listo para verificación de baseline
