# Tarea 02: Migrar imports internos al paquete externo

## Objetivo

Reemplazar todos los imports que apuntan al módulo interno `src/player/features/analytics` para que usen `@overon/react-native-overon-player-analytics-plugins`.

## Contexto

### Imports actuales a reemplazar

Todos los archivos que importan desde el módulo interno usan alguna de estas rutas relativas:
- `../../features/analytics`
- `../../../features/analytics`
- `../../../../features/analytics`
- `../features/analytics`

### API del paquete externo

El paquete externo exporta exactamente la misma API pública:

```typescript
// Clases principales
export { PlayerAnalyticsEvents } from '@overon/react-native-overon-player-analytics-plugins';
export { BaseAnalyticsPluginFactory } from '@overon/react-native-overon-player-analytics-plugins';

// Hook
export { usePlayerAnalyticsEvents } from '@overon/react-native-overon-player-analytics-plugins';

// Tipos (todos idénticos)
export type {
  PlayerAnalyticsPlugin,
  AnalyticsFactoryConfig,
  PluginConfig,
  PluginCreator,
  PluginRegistry,
  // ... todos los params types
} from '@overon/react-native-overon-player-analytics-plugins';
```

## Archivos a modificar

### 1. `src/player/core/events/VideoEventsAdapter.ts`

**Import actual:**
```typescript
import { PlayerAnalyticsEvents } from "../../features/analytics";
```

**Import nuevo:**
```typescript
import { PlayerAnalyticsEvents } from "@overon/react-native-overon-player-analytics-plugins";
```

### 2. `src/player/core/events/hooks/useVideoAnalytics.ts`

**Import actual:**
```typescript
import { PlayerAnalyticsEvents, type PlayerAnalyticsPlugin } from "../../../features/analytics";
```

**Import nuevo:**
```typescript
import { PlayerAnalyticsEvents, type PlayerAnalyticsPlugin } from "@overon/react-native-overon-player-analytics-plugins";
```

### 3. `src/player/core/events/handlers/AdEventsHandler.ts`

Verificar import actual y reemplazar la ruta relativa a `analytics` por el paquete externo.

### 4. `src/player/core/events/handlers/ErrorEventsHandler.ts`

Verificar import actual y reemplazar la ruta relativa a `analytics` por el paquete externo.

### 5. `src/player/core/events/handlers/MetadataEventsHandler.ts`

Verificar import actual y reemplazar la ruta relativa a `analytics` por el paquete externo.

### 6. `src/player/core/events/handlers/PlaybackEventsHandler.ts`

Verificar import actual y reemplazar la ruta relativa a `analytics` por el paquete externo.

### 7. `src/player/core/events/handlers/QualityEventsHandler.ts`

Verificar import actual y reemplazar la ruta relativa a `analytics` por el paquete externo.

### 8. `src/player/core/events/handlers/TrackEventsHandler.ts`

Verificar import actual y reemplazar la ruta relativa a `analytics` por el paquete externo.

### 9. `src/player/core/events/types/index.ts`

Verificar si re-exporta tipos de analytics y actualizar.

### 10. `src/player/flavours/audio/index.tsx`

Verificar import actual y reemplazar la ruta relativa a `analytics` por el paquete externo.

### 11. `src/player/flavours/normal/index.tsx`

Verificar import actual y reemplazar la ruta relativa a `analytics` por el paquete externo.

### 12. `src/player/types/newTypes.ts`

Verificar import actual y reemplazar la ruta relativa a `analytics` por el paquete externo.

### 13. `src/player/features/index.ts`

**Import/export actual:**
```typescript
export * from "./analytics";
```

**Cambio requerido:** Re-exportar desde el paquete externo en lugar del módulo interno:
```typescript
export * from "@overon/react-native-overon-player-analytics-plugins";
```

O bien, eliminar esta re-exportación si los consumidores deben importar directamente del paquete externo.

## Verificación

### Antes de implementar (`/verify`)

Ejecutar para ver todos los imports actuales:
```bash
grep -r "features/analytics" src/ --include="*.ts" --include="*.tsx" -l
grep -r "features/analytics" src/ --include="*.ts" --include="*.tsx" -n
```

### Después de implementar

```bash
# Verificar que no quedan imports al módulo interno (excepto dentro de analytics/docs/)
grep -r "features/analytics" src/ --include="*.ts" --include="*.tsx" \
  --exclude-dir="analytics"

# TypeScript check
yarn tsc --noEmit
```

## Criterios de aceptación

- [ ] Ningún archivo fuera de `src/player/features/analytics/` importa desde `features/analytics`
- [ ] Todos los imports usan `@overon/react-native-overon-player-analytics-plugins`
- [ ] `yarn tsc --noEmit` pasa sin errores relacionados con analytics
- [ ] Los tipos importados son compatibles (misma forma, mismos nombres)

## Notas

- Los tipos del paquete externo son **idénticos** a los internos — no hay cambios de forma ni nombres
- La API pública de `PlayerAnalyticsEvents` y `BaseAnalyticsPluginFactory` es idéntica
- El hook `usePlayerAnalyticsEvents` tiene la misma firma
- Esta tarea NO toca los errores (eso es la Tarea 03)
