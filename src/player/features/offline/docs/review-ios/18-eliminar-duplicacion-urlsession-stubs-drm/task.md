# Tarea: Eliminar duplicación URLSession+data + stubs DRM

> Tarea 18 de 20 | Fase E: Eliminación de complejidad y limpieza
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

Hay dos problemas de código muerto/duplicado identificados en la auditoría:
1. **CI-005**: `Video/Features/URLSession+data.swift` duplica la extensión `synchronousDataTask()` que ya existe en `Extensions + Utils/Utils.swift`.
2. **CI-008/NC-012**: `DownloadDRMManager` (extraído en tarea 15) contiene métodos stub que resuelven sin hacer nada (`renewLicense`, `releaseAllLicenses`, `checkLicenseValidity`, etc.) y están expuestos en el bridge Obj-C.

**IDs de auditoría relacionados**: CI-005, CI-008, NC-012, SA-15

## Objetivo

Eliminar la duplicación de `URLSession+data` y decidir qué hacer con los métodos DRM stub: eliminar del bridge los que no se usan desde JS, o marcarlos como deprecated.

## Alcance

### Código afectado

- `ios/Video/Features/URLSession+data.swift` — **eliminar** (duplicado de Utils.swift)
- `ios/Downloads_v2/DownloadsModule2.m` — eliminar macros `RCT_EXTERN_METHOD` de métodos stub no usados desde JS
- `ios/Downloads_v2/DownloadDRMManager.swift` — marcar stubs restantes con `@available(*, deprecated, message: "Not implemented")`

### Fuera de alcance

- NO implementar los métodos stub (fuera del alcance de esta refactorización)
- NO eliminar `Utils.swift` ni su extensión `synchronousDataTask()`

## Requisitos funcionales

1. **[CI-005]**: Eliminar duplicación de `URLSession+data`
2. **[CI-008]**: Hacer explícitos los stubs DRM, eliminar del bridge los no usados
3. **[NC-012]**: Reducir el riesgo de que JS tome decisiones basadas en datos falsos

## Requisitos técnicos

1. Verificar que `URLSession+data.swift` y `Utils.swift` están en el mismo target de compilación
2. Verificar qué métodos DRM stub se llaman desde JS con `grep -r "renewLicense\|releaseAllLicenses\|checkLicenseValidity\|downloadLicenseForContent\|releaseLicenseForDownload" src/`
3. Eliminar del bridge los que no se usan
4. Marcar los que se usan como deprecated con warning

## Cambios de contrato

- **[CI-008]**: Los métodos DRM stub eliminados del bridge ya no serán accesibles desde JS. Si algún código JS los llama, recibirá error.
- **[CI-005]**: Sin cambio de contrato — la extensión sigue disponible desde `Utils.swift`.

## Criterios de aceptación

### Funcionales
- [ ] `URLSession+data.swift` eliminado
- [ ] Métodos DRM stub no usados eliminados del bridge
- [ ] Métodos DRM stub usados marcados como deprecated
- [ ] El proyecto compila sin errores

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- No hay tests específicos que validen estos stubs (porque no hacen nada)

### Tests nuevos a crear

- Ninguno — esta tarea elimina código, no añade funcionalidad.

## Dependencias

### Tareas previas requeridas
- Tareas 01-04 (Fase A): tests de contrato deben estar en verde

### Tareas que dependen de esta
- Tarea 20 (limpieza final)

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: Algún código JS podría llamar a un método stub eliminado del bridge
- **Mitigación**: Grep exhaustivo en el código TypeScript antes de eliminar
- **Rollback**: `git revert HEAD`

## Estimación

0.5-1 hora

## Notas

- La eliminación de `URLSession+data.swift` es trivial si ambos ficheros están en el mismo target. En Swift, las extensiones son globales dentro del target.
- Para los stubs DRM, la decisión es: si JS no los llama → eliminar del bridge. Si JS los llama → mantener pero marcar deprecated y loguear warning cuando se invoquen.
