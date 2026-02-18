# Review: Tests de contrato — Persistencia

> 2 rondas de review | 18/02/2026
> Fichero revisado: `ios/Tests/DownloadsModule2PersistenceTests.swift`

## Ronda 1

### 🟡 BUG: Test 4 no cubría campo `state` como requerido

El `guard` de `restoreDownloadStates()` (línea 2656-2659) requiere **4 campos**: `id`, `uri`, `title` y `state`. El test solo incluía entradas sin `id`, `uri` y `title`, pero no sin `state`.

**Fix**: Añadida entrada sin `state` al array de test data. Actualizado assertion message a "1 de 5".

### ℹ️ NOTA: Tests 6-10 (Asset Paths) solo testean UserDefaults

Los métodos `saveAssetPath`, `loadAssetPaths`, `removeAssetPath`, `clearAllAssetPaths` son `private` — no accesibles ni con `@testable import`. Los tests verifican el formato de datos en UserDefaults, no el módulo directamente. Esto es aceptable dado la restricción de visibilidad, pero no detectaría un cambio en el formato de persistencia del módulo.

### ℹ️ NOTA: Nombres de ficheros temporales fijos

`createTempFile` usa nombres fijos como `"test-subtitle.vtt"`. No es un bug real porque XCTest ejecuta tests de una misma clase secuencialmente por defecto.

## Ronda 2

**Sin bugs nuevos.** Todos los fixes verificados:

- ✅ UserDefaults keys coinciden con producción (`activeStates`, `assetPaths`, `assetBookmarks`, `subtitleBookmarks`)
- ✅ `setUp()`/`tearDown()` limpian correctamente (UserDefaults + ficheros temporales)
- ✅ Tests de download state usan `XCTSkipUnless` para `moduleInit`
- ✅ Tests de bookmarks usan ficheros temporales reales para `bookmarkData()`
- ✅ Test 4 cubre los 4 campos requeridos del guard (`id`, `uri`, `title`, `state`)
- ✅ Test 13 verifica side-effect de auto-limpieza de bookmarks inválidos
- ✅ Test 17 verifica check de existencia de fichero en `resolveSubtitleBookmark`
- ✅ Test 19 verifica aislamiento de `removeAllSubtitleBookmarks`
- ✅ Test 20 verifica formato de key compuesta `downloadId:language`
- ✅ 21 tests totales (5 download state + 5 asset paths + 4 asset bookmarks + 7 subtitle bookmarks)

## Resumen de bugs encontrados y corregidos

| # | Severidad | Descripción | Estado |
|---|-----------|-------------|--------|
| 1 | 🟡 Media | Test 4 no cubría campo `state` en guard de `restoreDownloadStates` | ✅ Corregido |

## Veredicto

**✅ APROBADO** — Listo para commit.
