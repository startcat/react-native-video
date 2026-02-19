# Tarea 05: Verificación final y limpieza

## Objetivo

Realizar una verificación completa de la migración, asegurando que el sistema de analytics funciona correctamente usando el paquete externo, y limpiar cualquier residuo de la implementación interna.

## Prerequisitos

**Esta tarea solo puede ejecutarse cuando las tareas 01-04 estén completadas:**
- ✅ Tarea 01: peerDependency añadida en `package.json`
- ✅ Tarea 02: Todos los imports apuntan al paquete externo
- ✅ Tarea 03: Todos los errores usan `createAnalyticsError` / `createHandlerError`
- ✅ Tarea 04: Módulo interno eliminado

## Checklist de verificación

### 1. Verificación de imports

```bash
# No debe haber imports al módulo interno fuera de analytics/docs/
grep -rn "from.*features/analytics" src/ --include="*.ts" --include="*.tsx" \
  | grep -v "src/player/features/analytics/docs/"
# Resultado esperado: sin resultados
```

### 2. Verificación de errores residuales

```bash
# No deben quedar códigos de error del player usados en contexto de analytics
grep -rn "PLAYER_ANALYTICS_PLUGIN\|PLAYER_EVENT_HANDLER" \
  src/player/core/events/ \
  --include="*.ts" --include="*.tsx"
# Resultado esperado: sin resultados
```

### 3. TypeScript check completo

```bash
yarn tsc --noEmit
# Resultado esperado: sin errores
```

### 4. Lint check

```bash
yarn lint
# Resultado esperado: sin errores ni warnings relacionados con analytics
```

### 5. Verificación de estructura de archivos

```bash
# Solo debe existir la carpeta docs/ en analytics
find src/player/features/analytics/ -type f | sort
# Resultado esperado: solo archivos dentro de docs/
```

### 6. Verificación del package.json

```bash
# Confirmar que el peerDependency está presente
cat package.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('peerDependencies', {}).get('@overon/react-native-overon-player-analytics-plugins', 'NOT FOUND'))"
# Resultado esperado: >=0.2.0 (o la versión configurada)
```

### 7. Verificación de re-exports públicos

```bash
# Confirmar que src/player/features/index.ts re-exporta correctamente
grep -n "analytics\|overon-player-analytics" src/player/features/index.ts
```

## Limpieza de códigos de error obsoletos (opcional)

Tras la migración, los siguientes códigos en el sistema de errores interno del player pueden estar obsoletos:

```
PLAYER_ANALYTICS_PLUGIN_CREATION_FAILED
PLAYER_ANALYTICS_PLUGIN_EXECUTION_ERROR
PLAYER_ANALYTICS_PLUGIN_DESTROY_ERROR
PLAYER_EVENT_HANDLER_INITIALIZATION_FAILED
PLAYER_EVENT_HANDLER_LOAD_START_FAILED
PLAYER_EVENT_HANDLER_LOAD_FAILED
PLAYER_EVENT_HANDLER_PROGRESS_FAILED
PLAYER_EVENT_HANDLER_PLAYBACK_STATE_CHANGED_FAILED
PLAYER_EVENT_HANDLER_BUFFER_FAILED
PLAYER_EVENT_HANDLER_SEEK_FAILED
PLAYER_EVENT_HANDLER_PLAYBACK_RATE_CHANGE_FAILED
PLAYER_EVENT_HANDLER_VOLUME_CHANGE_FAILED
PLAYER_EVENT_HANDLER_END_FAILED
PLAYER_EVENT_HANDLER_ERROR_FAILED
PLAYER_EVENT_HANDLER_RECEIVE_AD_EVENT_FAILED
PLAYER_EVENT_HANDLER_AUDIO_TRACKS_FAILED
PLAYER_EVENT_HANDLER_TEXT_TRACKS_FAILED
PLAYER_EVENT_HANDLER_VIDEO_TRACKS_FAILED
PLAYER_EVENT_HANDLER_BANDWIDTH_UPDATE_FAILED
PLAYER_EVENT_HANDLER_ASPECT_RATIO_FAILED
PLAYER_EVENT_HANDLER_TIMED_METADATA_FAILED
PLAYER_EVENT_HANDLER_READY_FOR_DISPLAY_FAILED
PLAYER_EVENT_HANDLER_AUDIO_BECOMING_NOISY_FAILED
PLAYER_EVENT_HANDLER_IDLE_FAILED
```

**Acción:** Verificar si estos códigos se usan en algún otro lugar del codebase antes de eliminarlos:

```bash
grep -rn "PLAYER_ANALYTICS_PLUGIN\|PLAYER_EVENT_HANDLER" src/ \
  --include="*.ts" --include="*.tsx"
```

Si solo aparecen en la definición de errores y no en ningún `throw` ni `catch`, pueden eliminarse de `PLAYER_ERROR_DEFINITIONS`. Esto es **opcional** en esta tarea — puede hacerse en una tarea de limpieza de errores separada.

## Actualización de documentación

Verificar y actualizar si es necesario:

1. **`src/player/features/analytics/docs/README.md`** — Actualizar para indicar que el código ahora vive en `@overon/react-native-overon-player-analytics-plugins`
2. **`src/player/features/analytics/docs/guia-implementacion.md`** — Actualizar ejemplos de import
3. **`src/player/features/analytics/docs/eventos-plugin.md`** — Verificar que los ejemplos de código usan el import correcto

## Verificación de compatibilidad hacia atrás

Comprobar que los consumidores del player que usaban el sistema de analytics siguen funcionando:

1. El hook `useVideoAnalytics` sigue exportándose desde el mismo lugar
2. Los tipos `PlayerAnalyticsPlugin` y params siguen disponibles
3. `BaseAnalyticsPluginFactory` sigue disponible para que los proyectos extiendan su factory

```bash
# Verificar exports públicos del player
grep -n "analytics\|PlayerAnalyticsPlugin\|useVideoAnalytics\|BaseAnalyticsPluginFactory" \
  src/player/index.ts \
  src/index.ts
```

## Criterios de aceptación finales

- [ ] `grep -r "features/analytics" src/ --include="*.ts" --include="*.tsx" | grep -v docs/` → sin resultados
- [ ] `yarn tsc --noEmit` → sin errores
- [ ] `yarn lint` → sin errores
- [ ] `package.json` contiene `@overon/react-native-overon-player-analytics-plugins` en `peerDependencies`
- [ ] `src/player/features/analytics/` solo contiene la carpeta `docs/`
- [ ] La API pública del sistema de analytics sigue siendo accesible para los consumidores
- [ ] La documentación refleja el nuevo origen del código

## Notas finales

Una vez completada esta tarea, el sistema de analytics del player:
- **No tiene código propio** — toda la lógica vive en el paquete externo
- **Es mantenible de forma centralizada** — actualizaciones del paquete externo se aplican automáticamente
- **Tiene una API pública estable** — los consumidores no necesitan cambiar sus imports si usaban los exports del player
- **Tiene errores tipados** — usando el sistema `@overon/react-native-overon-errors` en lugar de `PlayerError` genérico
