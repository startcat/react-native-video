# Migración: Sistema de Analytics a peerDependency externo

## Objetivo

Migrar el sistema de plugins de analíticas interno (`src/player/features/analytics`) para que use `@overon/react-native-overon-player-analytics-plugins` como `peerDependency`, eliminando el código duplicado y centralizando el mantenimiento en el paquete externo.

## Contexto

### Estado actual

El sistema de analytics está implementado **internamente** en este repositorio:

```
src/player/features/analytics/
├── AnalyticsPluginFactory.ts       # Factory base abstracta
├── AnalyticsPluginFactory.example.ts
├── PlayerAnalyticsEvents.ts        # Dispatcher de eventos a plugins
├── constants.ts                    # Solo LOG_PREFIX
├── index.ts
├── hooks/
│   ├── usePlayerAnalyticsEvents.ts
│   └── index.ts
└── types/
    ├── Plugin.ts                   # Interfaz PlayerAnalyticsPlugin + params
    ├── Factory.ts                  # Tipos AnalyticsFactoryConfig, PluginCreator...
    └── index.ts
```

El código interno es consumido por:
- `src/player/core/events/VideoEventsAdapter.ts`
- `src/player/core/events/hooks/useVideoAnalytics.ts`
- `src/player/core/events/handlers/` (6 handlers)
- `src/player/flavours/audio/index.tsx`
- `src/player/flavours/normal/index.tsx`
- `src/player/types/newTypes.ts`
- `src/player/features/index.ts`

### Estado destino

El paquete externo `@overon/react-native-overon-player-analytics-plugins` (v0.2.0) ya contiene:
- `PlayerAnalyticsEvents` — idéntico en API, usa `@overon/react-native-logger` y `@overon/react-native-overon-errors`
- `BaseAnalyticsPluginFactory` — idéntico en API
- `usePlayerAnalyticsEvents` — idéntico en API
- Todos los tipos (`PlayerAnalyticsPlugin`, params, factory types) — idénticos
- Sistema de errores propio (`createAnalyticsError`, `AnalyticsError`)
- Logger centralizado (`getLogger`, `configureLogger`, `setLogLevel`)

### Diferencias clave a resolver

| Aspecto | Interno (actual) | Externo (destino) |
|---|---|---|
| Errores | `PlayerError` de `../../core/errors` | `createAnalyticsError` de `@overon/react-native-overon-errors` |
| Logging | `console.log` directo | `@overon/react-native-logger` via `getLogger()` |
| Constantes | Solo `LOG_PREFIX` | `LOG_TAGS`, `getLogger`, `configureLogger`, `LogLevel` |
| Exports | Sin `errors` ni `constants` | Exporta `errors` y `constants` también |

## Subtareas

Las subtareas siguen la metodología:
`/start-task → /spec → /verify → /plan → /implement → /review → /finish-task`

| # | Archivo | Descripción |
|---|---|---|
| 1 | [01-add-peer-dependency/task.md](./01-add-peer-dependency/task.md) | Añadir `@overon/react-native-overon-player-analytics-plugins` como peerDependency |
| 2 | [02-migrate-imports/task.md](./02-migrate-imports/task.md) | Migrar todos los imports internos al paquete externo |
| 3 | [03-migrate-error-codes/task.md](./03-migrate-error-codes/task.md) | Migrar códigos de error de `PlayerError` a `createAnalyticsError` |
| 4 | [04-remove-internal-module/task.md](./04-remove-internal-module/task.md) | Eliminar el módulo interno `src/player/features/analytics` |
| 5 | [05-verify-and-cleanup/task.md](./05-verify-and-cleanup/task.md) | Verificación final, TypeScript check y limpieza |

## Orden de ejecución

```
Tarea 1 → Tarea 2 → Tarea 3 → Tarea 4 → Tarea 5
```

Las tareas 2 y 3 pueden solaparse (son cambios en ficheros distintos), pero la 4 depende de que 2 y 3 estén completas.

## Archivos afectados (resumen)

### Modificar
- `package.json` — añadir peerDependency
- `src/player/core/events/VideoEventsAdapter.ts`
- `src/player/core/events/hooks/useVideoAnalytics.ts`
- `src/player/core/events/handlers/AdEventsHandler.ts`
- `src/player/core/events/handlers/ErrorEventsHandler.ts`
- `src/player/core/events/handlers/MetadataEventsHandler.ts`
- `src/player/core/events/handlers/PlaybackEventsHandler.ts`
- `src/player/core/events/handlers/QualityEventsHandler.ts`
- `src/player/core/events/handlers/TrackEventsHandler.ts`
- `src/player/flavours/audio/index.tsx`
- `src/player/flavours/normal/index.tsx`
- `src/player/types/newTypes.ts`
- `src/player/features/index.ts`

### Eliminar
- `src/player/features/analytics/` (directorio completo, excepto `docs/`)

## Criterios de éxito

- [ ] `yarn tsc` sin errores
- [ ] Todos los imports apuntan a `@overon/react-native-overon-player-analytics-plugins`
- [ ] El directorio `src/player/features/analytics/` solo contiene `docs/`
- [ ] `package.json` incluye el peerDependency con la versión correcta
- [ ] Los errores de analytics usan `createAnalyticsError` del paquete externo
- [ ] No hay referencias residuales al módulo interno en ningún `.ts` / `.tsx`
