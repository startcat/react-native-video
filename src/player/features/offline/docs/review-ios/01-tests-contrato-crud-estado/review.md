# Review: Tests de contrato — CRUD y estado

> 3 rondas de review | 18/02/2026
> Ficheros revisados: `ios/Tests/DownloadsModule2StateTests.swift`, `ios/Tests/DownloadsModule2ConfigTests.swift`

## Ronda 1

### 🔴 BUG: `pauseDownload`/`resumeDownload` no verificaban contrato

Los tests aceptaban tanto resolve como reject sin verificar nada. La producción **siempre rechaza** con `"DOWNLOAD_NOT_FOUND"` para IDs inexistentes.

**Fix**: Añadido `XCTFail` en resolve path y `XCTAssertEqual(code, "DOWNLOAD_NOT_FOUND")` en reject path.

### 🟡 MEJORA: `removeDownload` sin verificar error code

**Fix**: Añadido `XCTAssertEqual(code, "REMOVE_DOWNLOAD_FAILED")` en reject path.

### 🟡 MEJORA: Tests `addDownload` silenciaban fallos de `moduleInit`

Si `moduleInit` fallaba, `addDownload` rechazaba con `NOT_INITIALIZED` en vez del error de validación esperado. El test pasaba pero no testeaba lo que decía testear.

**Fix**: Extraído helper `initializeModule()` + `try XCTSkipUnless(initialized)` para skip limpio.

### 💡 SUGERENCIA: Verificar `type` en tests de URI inválida

**Fix**: Añadido `XCTAssertEqual(dict["type"] as? String, "binary")` en tests de URI inválida y vacía.

## Ronda 2

### 🔴 BUG: Key UserDefaults incorrecta en `setUp()`

`"com.downloads.activeDownloads"` **no existe** en producción. La key real es `"com.downloads.activeStates"` (definida como `ACTIVE_DOWNLOADS_KEY` en `DownloadsModule2.swift:254`).

**Impacto**: Los tests no limpiaban el estado persistido de descargas activas, causando potencial contaminación entre tests.

**Fix**: Corregida key a `"com.downloads.activeStates"`.

### 🟡 MEJORA: `cancelDownload` sin verificar contrato

El test aceptaba ambos paths sin assert. Dado que `cancelDownload` delega a `removeDownload`, debería verificar `"REMOVE_DOWNLOAD_FAILED"` en reject path.

**Fix**: Renombrado test a `testCancelDownload_nonExistent_delegatesToRemoveDownload` y añadido assert.

### 🟡 MEJORA: `ConfigTests` sin limpieza UserDefaults

`DownloadsModule2ConfigTests.setUp()` no limpiaba UserDefaults, inconsistente con `StateTests`.

**Fix**: Añadida limpieza idéntica a `StateTests`.

## Ronda 3

**Sin bugs nuevos.** Todos los fixes verificados:

- ✅ UserDefaults keys coinciden con producción
- ✅ Method signatures correctas
- ✅ Error codes verificados contra producción
- ✅ `setUp()`/`tearDown()` consistentes en ambos ficheros
- ✅ Helper `initializeModule()` con `XCTSkipUnless`
- ✅ 27 tests totales (19 state + 8 config)

## Resumen de bugs encontrados y corregidos

| # | Severidad | Descripción | Estado |
|---|-----------|-------------|--------|
| 1 | 🔴 Alta | Key UserDefaults `activeDownloads` → `activeStates` | ✅ Corregido |
| 2 | 🔴 Media | `pauseDownload`/`resumeDownload` no verificaban `DOWNLOAD_NOT_FOUND` | ✅ Corregido |
| 3 | 🟡 Media | `addDownload` tests silenciaban fallos de `moduleInit` | ✅ Corregido |
| 4 | 🟡 Media | `cancelDownload` sin verificar contrato | ✅ Corregido |
| 5 | 🟡 Baja | `ConfigTests` sin limpieza UserDefaults | ✅ Corregido |
| 6 | 🟡 Baja | Tests URI inválida sin verificar `type` | ✅ Corregido |

## Bug pre-existente en producción (no corregido)

**`pauseDownload` resuelve sin acción si no hay task**: Si una descarga existe en `activeDownloads` pero no tiene `downloadTask` (ej: después de app kill), `pauseDownload` resuelve sin cambiar el estado. No se corrige en esta tarea (Fase A: solo tests).

## Veredicto

**✅ APROBADO** — Listo para commit.
