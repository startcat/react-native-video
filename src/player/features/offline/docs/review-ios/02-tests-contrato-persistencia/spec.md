# Especificación Técnica: Tests de contrato — Persistencia

> Generado a partir de task.md el 18/02/2026

## Resumen

Escribir tests de contrato XCTest que capturen el comportamiento actual de la persistencia en UserDefaults (estado de descargas, asset paths, asset bookmarks, subtitle bookmarks) de `DownloadsModule2` antes de cualquier refactorización.

## 1. Alcance

### Módulos afectados

**Directos:**

- `ios/Downloads_v2/DownloadsModule2.swift`: Módulo bajo test — NO se modifica, solo se testea
- `ios/Tests/DownloadsModule2PersistenceTests.swift`: **Nuevo** — tests de persistencia

**Indirectos:**

- Proyecto Xcode (`FabricExample.xcworkspace`): Target de tests existente `FabricExampleTests`
- `UserDefaults.standard`: Se usa en setUp/tearDown para limpiar estado entre tests
- `FileManager`: Necesario para crear ficheros temporales para tests de bookmarks

### Dependencias impactadas

**Internas:**

- `react_native_video` (target principal): Se importa con `@testable import react_native_video`
- `DownloadInfo` struct: Tipo `internal` — accesible con `@testable import`
- `DownloadState` enum: Tipo `@objc` público — accesible directamente

**Externas:**

- `XCTest`: Framework de testing de Apple
- `Foundation` (`UserDefaults`, `FileManager`, `URL`): Para persistencia y ficheros temporales

### Archivos de configuración

- Ninguno — se reutiliza el target de tests de `FabricExample` creado en tarea 01

## 2. Contratos

### Cambios en API pública

| Elemento | Tipo de cambio | Antes | Después |
| -------- | -------------- | ----- | ------- |
| —        | —              | —     | —       |

**No hay cambios en API pública.** Esta tarea solo añade tests.

### Cambios en tipos/interfaces

Ninguno.

### Cambios en eventos/callbacks

Ninguno.

## 3. Flujo de datos

### Estado global afectado

- `UserDefaults.standard`: Se limpia en `setUp()` para aislar tests. Keys afectadas:
  - `com.downloads.activeStates` (`ACTIVE_DOWNLOADS_KEY`)
  - `com.downloads.assetPaths` (`ASSET_PATHS_KEY`)
  - `com.downloads.assetBookmarks` (`ASSET_BOOKMARKS_KEY`)
  - `com.downloads.subtitleBookmarks` (`SUBTITLE_BOOKMARKS_KEY`)
- `FileManager.default.temporaryDirectory`: Se crean ficheros temporales para generar bookmark data válida. Se limpian en `tearDown()`.

### Persistencia

- **UserDefaults**: Se limpia antes de cada test y se restaura después
- **Ficheros temporales**: Se crean en `setUp()` y se eliminan en `tearDown()`
- **Cache**: No aplica

### Comunicación entre módulos

- Tests → `DownloadsModule2`: Llamadas directas a métodos internos (vía `@testable import`) y públicos
- `DownloadsModule2` → `UserDefaults.standard`: Lectura/escritura de estado persistido

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change | Severidad | Mitigación           |
| --------------- | --------- | -------------------- |
| Ninguno         | —         | Solo se añaden tests |

### Impacto en rendimiento

- Sin impacto — los tests solo se ejecutan en CI/desarrollo

### Casos edge problemáticos

- **Métodos `private` no accesibles con `@testable import`**: Las funciones de persistencia de asset paths (`saveAssetPath`, `loadAssetPaths`, `removeAssetPath`, `clearAllAssetPaths`) y state (`persistDownloadState`, `restoreDownloadStates`) son `private`. **Además, `activeDownloads` también es `private`** (línea 220: `private var activeDownloads: [String: DownloadInfo] = [:]`). `@testable import` solo da acceso a `internal`, no a `private`. **Estrategia**:
  - `restoreDownloadStates`: Escribir en UserDefaults con el formato de `persistDownloadState` → llamar a `moduleInit` (que invoca `restoreDownloadStates` en línea 1242) → verificar con API pública (`getDownloads`, `getDownload`, `hasDownload`) que los datos se restauraron.
  - `persistDownloadState`: Testear indirectamente — llamar a `addDownload` (que persiste) → leer UserDefaults directamente para verificar formato.
  - `saveAssetPath` / `removeAssetPath`: Testear indirectamente — se llaman desde `addDownload` y `removeDownload`. Verificar UserDefaults directamente.
  - `saveAssetBookmark` es `private`, pero `resolveAssetBookmark` es `internal`. Testear guardando bookmark data directamente en UserDefaults y usando `resolveAssetBookmark` para verificar.

- **Bookmark data requiere ficheros reales**: `url.bookmarkData()` necesita una URL que apunte a un fichero existente. Los tests deben crear ficheros temporales reales en el directorio temporal del simulador.

- **`resolveSubtitleBookmark` verifica existencia del fichero**: A diferencia de `resolveAssetBookmark`, el método de subtítulos hace `FileManager.default.fileExists(atPath:)` antes de retornar. Si el fichero temporal se elimina entre save y resolve, retorna `nil`.

- **`resolveAssetBookmark` auto-limpia bookmarks inválidos**: Si el bookmark data no se puede resolver, el método llama a `removeAssetBookmark` automáticamente. Esto es un side-effect que el test debe documentar.

- **`resolveAssetBookmark` auto-actualiza bookmarks stale**: Si el bookmark es stale (sandbox UUID cambió), el método lo actualiza automáticamente llamando a `saveAssetBookmark`.

- **Formato de persistencia de `persistDownloadState`**: Guarda un array de diccionarios con keys específicas: `id`, `uri`, `title`, `state` (stringValue), `progress`, `downloadedBytes`, `totalBytes`, `quality`, `assetPath`, `hasSubtitles`, `hasDRM`. El test de roundtrip debe verificar todas estas keys.

- **`restoreDownloadStates` usa fallback `.paused`**: Si el `stateString` no coincide con ningún `DownloadState.stringValue`, usa `.paused` como fallback. Esto es un comportamiento a documentar.

## 5. Estrategias

### Testing

- **Unitarios**: Tests de cada función de persistencia con casos normal, límite y error
- **Integración**: No aplica en esta tarea
- **E2E**: No aplica en esta tarea
- **Manual**: Ejecutar `xcodebuild test` y verificar que todos pasan en verde

### Rollback

1. `git revert HEAD` — elimina los ficheros de test
2. `rm ios/Tests/DownloadsModule2PersistenceTests.swift`

### Migración de datos

- **¿Necesaria?**: No
- **Estrategia**: N/A
- **Reversible**: N/A

## 6. Inventario de tests

### Fichero: `ios/Tests/DownloadsModule2PersistenceTests.swift`

#### Grupo 1: Download State Persistence (REQ-016)

| #   | Test                                                 | Tipo   | Descripción                                                                                                                                                                  |
| --- | ---------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `testPersistAndRestore_roundtrip_preservesAllFields` | Normal | Escribir estado en UserDefaults con formato de `persistDownloadState` → `moduleInit` → verificar con `getDownloads`/`getDownload`/`hasDownload` que los datos se restauraron |
| 2   | `testRestore_withoutPriorData_activeDownloadsEmpty`  | Límite | Sin datos en UserDefaults → `activeDownloads` vacío                                                                                                                          |
| 3   | `testRestore_withInvalidState_fallbackToPaused`      | Error  | State string no reconocido → fallback a `.paused`                                                                                                                            |
| 4   | `testRestore_withMissingRequiredFields_skipsEntry`   | Error  | Entrada sin `id`/`uri`/`title` → se ignora                                                                                                                                   |
| 5   | `testPersist_multipleDownloads_allPreserved`         | Normal | Múltiples descargas → todas se persisten y restauran                                                                                                                         |

#### Grupo 2: Asset Path Persistence (REQ-017)

| #   | Test                                         | Tipo   | Descripción                                                         |
| --- | -------------------------------------------- | ------ | ------------------------------------------------------------------- |
| 6   | `testSaveAndLoadAssetPath_roundtrip`         | Normal | Save path → verificar en UserDefaults → load devuelve path correcto |
| 7   | `testRemoveAssetPath_existingPath_removesIt` | Normal | Save → remove → load → nil para ese ID                              |
| 8   | `testRemoveAssetPath_nonExistent_noError`    | Límite | Remove sin save previo → no crash                                   |
| 9   | `testClearAllAssetPaths_removesAll`          | Normal | Save múltiples → clearAll → load → vacío                            |
| 10  | `testSaveAssetPath_overwritesExisting`       | Límite | Save path A → save path B para mismo ID → load devuelve B           |

#### Grupo 3: Asset Bookmark Persistence (REQ-018)

| #   | Test                                                                | Tipo   | Descripción                                                                |
| --- | ------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| 11  | `testSaveAndResolveAssetBookmark_roundtrip`                         | Normal | Crear fichero temp → save bookmark → resolve → URL válida                  |
| 12  | `testResolveAssetBookmark_nonExistent_returnsNil`                   | Límite | Resolve sin save → nil                                                     |
| 13  | `testResolveAssetBookmark_invalidData_removesBookmarkAndReturnsNil` | Error  | Guardar data inválida en UserDefaults → resolve → nil + bookmark eliminado |
| 14  | `testRemoveAssetBookmark_existingBookmark_removesIt`                | Normal | Save → remove → resolve → nil                                              |

#### Grupo 4: Subtitle Bookmark Persistence (REQ-019)

| #   | Test                                                      | Tipo       | Descripción                                                               |
| --- | --------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| 15  | `testSaveAndResolveSubtitleBookmark_roundtrip`            | Normal     | Crear fichero temp → save → resolve → URL válida                          |
| 16  | `testResolveSubtitleBookmark_nonExistent_returnsNil`      | Límite     | Resolve sin save → nil                                                    |
| 17  | `testResolveSubtitleBookmark_fileDeleted_returnsNil`      | Error      | Save → eliminar fichero → resolve → nil                                   |
| 18  | `testRemoveSubtitleBookmark_existingBookmark_removesIt`   | Normal     | Save → remove → resolve → nil                                             |
| 19  | `testRemoveAllSubtitleBookmarks_removesOnlyTargetId`      | Normal     | Save bookmarks para ID-A y ID-B → removeAll(ID-A) → ID-B sigue existiendo |
| 20  | `testSubtitleBookmark_compositeKey_format`                | Invariante | Verificar que la key en UserDefaults es `"downloadId:language"`           |
| 21  | `testSaveSubtitleBookmark_multipleLanguages_allPreserved` | Normal     | Save es, en, ca para mismo ID → resolve cada uno → todos válidos          |

**Total: 21 tests**

## 7. Visibilidad de métodos

| Método                         | Visibilidad | Estrategia de test                                                              |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------- |
| `persistDownloadState()`       | `private`   | Indirecto: manipular `activeDownloads` + verificar UserDefaults                 |
| `restoreDownloadStates()`      | `private`   | Indirecto: escribir en UserDefaults + verificar `activeDownloads` tras init     |
| `saveAssetPath()`              | `private`   | Indirecto: escribir en UserDefaults directamente                                |
| `loadAssetPaths()`             | `private`   | Indirecto: leer UserDefaults directamente                                       |
| `removeAssetPath()`            | `private`   | Indirecto: verificar UserDefaults tras operación pública                        |
| `clearAllAssetPaths()`         | `private`   | Indirecto: verificar UserDefaults                                               |
| `saveAssetBookmark()`          | `private`   | Indirecto: escribir bookmark data en UserDefaults directamente                  |
| `loadAssetBookmarks()`         | `private`   | Indirecto: leer UserDefaults directamente                                       |
| `removeAssetBookmark()`        | `private`   | Indirecto: verificar UserDefaults tras `resolveAssetBookmark` con data inválida |
| `resolveAssetBookmark()`       | `internal`  | **Directo** con `@testable import`                                              |
| `saveSubtitleBookmark()`       | `internal`  | **Directo** con `@testable import`                                              |
| `resolveSubtitleBookmark()`    | `internal`  | **Directo** con `@testable import`                                              |
| `removeSubtitleBookmark()`     | `internal`  | **Directo** con `@testable import`                                              |
| `removeAllSubtitleBookmarks()` | `internal`  | **Directo** con `@testable import`                                              |

**Nota clave**: Los métodos de asset path y download state son `private`. Para testarlos sin modificar producción, manipulamos UserDefaults directamente (escribir el formato esperado y verificar que el módulo lo lee correctamente, o verificar que UserDefaults contiene los datos esperados después de operaciones públicas).

## 8. Patrón de test

### Tests de UserDefaults directos (asset paths, download state)

```swift
func testSaveAndLoadAssetPath_roundtrip() {
    // Escribir directamente en UserDefaults (simula saveAssetPath)
    let paths: [String: String] = ["download-1": "/path/to/asset.movpkg"]
    UserDefaults.standard.set(paths, forKey: "com.downloads.assetPaths")

    // Leer directamente de UserDefaults (simula loadAssetPaths)
    let loaded = UserDefaults.standard.dictionary(forKey: "com.downloads.assetPaths") as? [String: String]
    XCTAssertEqual(loaded?["download-1"], "/path/to/asset.movpkg")
}
```

### Tests de bookmarks (requieren ficheros temporales)

```swift
func testSaveAndResolveSubtitleBookmark_roundtrip() {
    // Crear fichero temporal real
    let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("test-subtitle.vtt")
    FileManager.default.createFile(atPath: tempURL.path, contents: Data("WEBVTT".utf8))

    // Save bookmark (método internal)
    module.saveSubtitleBookmark(for: tempURL, downloadId: "d1", language: "es")

    // Resolve bookmark (método internal)
    let resolved = module.resolveSubtitleBookmark(forDownloadId: "d1", language: "es")
    XCTAssertNotNil(resolved)
    XCTAssertEqual(resolved?.lastPathComponent, "test-subtitle.vtt")

    // Cleanup
    try? FileManager.default.removeItem(at: tempURL)
}
```

## 9. Complejidad estimada

- **Nivel**: Media-Baja
- **Justificación**: Los métodos de subtítulos son `internal` y se pueden testear directamente. Los métodos de asset path y download state son `private` y requieren testing indirecto vía UserDefaults. Los tests de bookmarks necesitan ficheros temporales reales.
- **Tiempo estimado**: 1.5-2.5 horas

## 10. Preguntas sin resolver

### Técnicas

- [x] ¿`activeDownloads` es accesible con `@testable import`? → **NO, es `private`** (línea 220: `private var activeDownloads`). Hay que testear indirectamente vía API pública.
- [ ] ¿Los bookmarks creados en el directorio temporal del simulador sobreviven entre `save` y `resolve` en el mismo test? Debería funcionar, pero verificar.
- [x] ¿`restoreDownloadStates()` se llama automáticamente en `moduleInit()`? → **SÍ** (línea 1242). Se puede testear escribiendo en UserDefaults y luego llamando a `moduleInit`.

### De negocio

- Ninguna — esta tarea no cambia comportamiento.

### De rendimiento

- Ninguna — solo tests.

## Aprobación

- [ ] Spec revisado
- [ ] Dudas resueltas
- [ ] Listo para verificación de baseline
