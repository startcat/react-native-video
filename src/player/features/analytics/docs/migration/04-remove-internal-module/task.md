# Tarea 04: Eliminar el módulo interno de analytics

## Objetivo

Eliminar todos los archivos del módulo interno `src/player/features/analytics/` que han sido reemplazados por el paquete externo, conservando únicamente la carpeta `docs/`.

## Prerequisitos

**Esta tarea solo puede ejecutarse cuando las tareas 02 y 03 estén completadas:**
- ✅ Tarea 02: Todos los imports apuntan al paquete externo
- ✅ Tarea 03: Todos los errores usan `createAnalyticsError` / `createHandlerError`

## Archivos a eliminar

```
src/player/features/analytics/
├── AnalyticsPluginFactory.ts           ← ELIMINAR
├── AnalyticsPluginFactory.example.ts   ← ELIMINAR
├── PlayerAnalyticsEvents.ts            ← ELIMINAR
├── constants.ts                        ← ELIMINAR
├── index.ts                            ← ELIMINAR (o vaciar/redirigir)
├── hooks/
│   ├── usePlayerAnalyticsEvents.ts     ← ELIMINAR
│   └── index.ts                        ← ELIMINAR
└── types/
    ├── Plugin.ts                       ← ELIMINAR
    ├── Factory.ts                      ← ELIMINAR
    └── index.ts                        ← ELIMINAR
```

**Conservar:**
```
src/player/features/analytics/
└── docs/                               ← CONSERVAR (documentación)
    ├── README.md
    ├── eventos-plugin.md
    ├── guia-implementacion.md
    ├── mejores-practicas.md
    └── migration/                      ← CONSERVAR (este directorio)
```

## Decisión sobre `src/player/features/analytics/index.ts`

Hay dos opciones para el `index.ts` raíz del módulo:

**Opción A — Eliminar completamente:**
- Eliminar `index.ts`
- Actualizar `src/player/features/index.ts` para que re-exporte desde el paquete externo directamente

**Opción B — Convertir en re-export shim (recomendada para compatibilidad):**
- Mantener `index.ts` pero vaciar su contenido y hacer que re-exporte desde el paquete externo:
```typescript
// Shim de compatibilidad — re-exporta desde el paquete externo
export * from "@overon/react-native-overon-player-analytics-plugins";
```
- Esto permite que cualquier import residual que apunte a `features/analytics` siga funcionando

La Opción B es más segura durante la transición. Decidir durante `/spec`.

## Pasos de implementación

1. Verificar que no hay imports residuales al módulo interno:
   ```bash
   grep -r "features/analytics" src/ --include="*.ts" --include="*.tsx" \
     --exclude-dir="analytics"
   ```

2. Si el resultado está limpio, proceder a eliminar los archivos listados.

3. Si se elige Opción A: eliminar también `index.ts` y actualizar `src/player/features/index.ts`.

4. Si se elige Opción B: reemplazar el contenido de `index.ts` con el shim.

5. Ejecutar TypeScript check para confirmar que nada se rompe.

## Verificación

### Antes de eliminar (`/verify`)

```bash
# Confirmar que no hay imports residuales
grep -rn "from.*features/analytics" src/ --include="*.ts" --include="*.tsx" \
  | grep -v "src/player/features/analytics/"

# Confirmar que no hay referencias en tests
grep -rn "features/analytics" src/ --include="*.test.ts" --include="*.spec.ts"
```

### Después de eliminar

```bash
# Verificar que los archivos han sido eliminados
ls src/player/features/analytics/

# Verificar que solo queda docs/
find src/player/features/analytics/ -type f -name "*.ts" -o -name "*.tsx"
# Resultado esperado: vacío (ningún archivo .ts fuera de docs/)

# TypeScript check completo
yarn tsc --noEmit

# Lint check
yarn lint
```

## Criterios de aceptación

- [ ] Los 10 archivos `.ts` del módulo interno han sido eliminados
- [ ] La carpeta `docs/` y su contenido se conservan intactos
- [ ] `src/player/features/index.ts` no re-exporta desde el módulo interno eliminado
- [ ] `yarn tsc --noEmit` pasa sin errores
- [ ] `yarn lint` pasa sin errores
- [ ] No hay archivos huérfanos ni imports rotos

## Notas

- Los archivos de ejemplo (`AnalyticsPluginFactory.example.ts`) también deben eliminarse — son plantillas que ahora viven en la documentación del paquete externo
- Si existe algún test que importe desde el módulo interno, actualizarlo antes de eliminar
- La documentación en `docs/` puede actualizarse en una tarea posterior para reflejar que el código ahora vive en el paquete externo
