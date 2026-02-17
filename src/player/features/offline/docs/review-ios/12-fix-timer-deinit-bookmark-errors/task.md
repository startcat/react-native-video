# Tarea: Fix timer sin invalidación en deinit + errores de bookmark silenciados

> Tarea 12 de 20 | Fase C: Correcciones críticas
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`DownloadsModule2` tiene dos problemas relacionados con cleanup y manejo de errores:
1. **NC-008**: El `progressTimer` no se invalida en `deinit`, dejando un timer huérfano si el módulo se destruye (ej: hot reload).
2. **NC-009**: Los errores al crear bookmarks se silencian con `catch {}` vacío, lo que puede causar que una descarga completada no se pueda localizar tras un cambio de sandbox UUID.

**IDs de auditoría relacionados**: NC-008, NC-009, SA-12, SA-14

## Objetivo

Añadir `deinit` con invalidación del timer y reemplazar los catch vacíos de bookmarks por logging + emisión de warning a JS.

## Alcance

### Código afectado

- `ios/Downloads_v2/DownloadsModule2.swift`:
  - Añadir `deinit { invalidateProgressTimer() }` (NC-008)
  - Línea 2778-2780: `catch { // Failed to create bookmark }` → `catch { RCTLog("Warning: Failed to create bookmark for \(downloadId): \(error)"); sendEvent(withName: "onDownloadWarning", body: ["downloadId": downloadId, "warning": "bookmark_creation_failed"]) }` (NC-009)
  - Líneas similares en `saveSubtitleBookmark()` si aplica

### Fuera de alcance

- NO refactorizar el timer (se hará en tarea 13)
- NO cambiar la lógica de bookmarks (se moverá en tarea 06)

## Requisitos funcionales

1. **[NC-008]**: El timer se invalida cuando el módulo se destruye
2. **[NC-009]**: Los errores de bookmark se loguean y se emiten como warning a JS

## Requisitos técnicos

1. Añadir `deinit` a `DownloadsModule2`
2. Reemplazar catch vacíos por `RCTLog` + `sendEvent` con tipo "onDownloadWarning"
3. No introducir dependencias nuevas

## Cambios de contrato

- **[NC-009]**: Se emite un nuevo evento `onDownloadWarning` cuando falla la creación de un bookmark. La capa JS puede ignorarlo o mostrarlo al usuario.

## Criterios de aceptación

### Funcionales
- [ ] `DownloadsModule2` tiene `deinit` que invalida el timer
- [ ] Los catch vacíos de bookmarks ahora loguean el error
- [ ] Se emite evento `onDownloadWarning` cuando falla un bookmark

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅
- [ ] Test nuevo: verificar que `deinit` invalida el timer (puede ser difícil de testear directamente)

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `ios/Tests/DownloadsModule2PersistenceTests.swift` — valida que la persistencia sigue funcionando

### Tests nuevos a crear

- Mínimos — estos son fixes defensivos difíciles de testear unitariamente. La validación principal es que los tests de contrato siguen en verde y que el código compila.

## Dependencias

### Tareas previas requeridas
- Tareas 01-04 (Fase A): tests de contrato deben estar en verde

### Tareas que dependen de esta
- Ninguna directa

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: El nuevo evento `onDownloadWarning` podría causar un warning en la consola JS si no hay listener registrado.
- **Mitigación**: Verificar que `sendEvent` no falla si no hay listeners. En `RCTEventEmitter`, esto es seguro.
- **Rollback**: `git revert HEAD`

## Estimación

30-60 minutos

## Notas

- El `deinit` con `invalidateProgressTimer()` es una línea pero previene un leak de recursos.
- Los catch vacíos son un anti-patrón identificado en SA-14. Esta tarea corrige los más críticos (bookmarks). Los demás catch vacíos se pueden abordar en la tarea 20 (limpieza final).
