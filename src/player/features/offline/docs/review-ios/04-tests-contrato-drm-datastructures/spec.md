# Especificación Técnica: Tests de contrato — DRM y DataStructures

> Generado a partir de task.md el 18/02/2026

## Resumen

Tests XCTest que capturan el comportamiento actual de persistencia de claves DRM FairPlay, enum `DownloadState`, serialización de `DownloadInfo`, y parseo de DataStructures (`VideoSource`, `DRMParams`, `TextTrack`, `YouboraParams`, `Chapter`) desde `NSDictionary`.

## 1. Alcance

### Módulos afectados

**Directos:**

- `ios/Managers/ContentKeyManager.swift` — Persistencia de claves FairPlay (write/delete/exists)
- `ios/Downloads_v2/DownloadsModule2.swift` — `DownloadState` enum, `DownloadInfo` struct, `createDownloadInfoDict()`
- `ios/Video/DataStructures/VideoSource.swift` — Parseo desde NSDictionary
- `ios/Video/DataStructures/DRMParams.swift` — Parseo desde NSDictionary
- `ios/Video/DataStructures/TextTrack.swift` — Parseo desde NSDictionary
- `ios/Video/DataStructures/YouboraParams.swift` — Parseo desde NSDictionary (contiene NC-006)
- `ios/Video/DataStructures/Chapter.swift` — Parseo desde NSDictionary

**Indirectos:**

- `ios/Downloads/Asset.swift` — Usado por `deleteAllPeristableContentKeys(forAsset:)`

### Ficheros de test a crear

- `ios/Tests/ContentKeyPersistenceTests.swift`
- `ios/Tests/DownloadStateTests.swift`
- `ios/Tests/DataStructureParsingTests.swift`
- `ios/Tests/DownloadInfoSerializationTests.swift`
- Copias en `examples/FabricExample/ios/FabricExampleTests/`

## 2. Contratos

### Funciones bajo test

| Función | Visibilidad | Firma | Testeable directamente |
|---------|-------------|-------|----------------------|
| `writePersistableContentKey(contentKey:withAssetName:withContentKeyIV:)` | `internal` | `(Data, String, String) throws -> Void` | ✅ Pero usa `contentKeyDirectory` (lazy, crea dir en Documents) |
| `persistableContentKeyExistsOnDisk(withAssetName:withContentKeyIV:)` | `internal` | `(String, String) -> Bool` | ✅ |
| `urlForPersistableContentKey(withAssetName:withContentKeyIV:)` | `internal` | `(String, String) -> URL?` | ✅ |
| `deletePeristableContentKey(withAssetName:withContentKeyId:)` | `internal` | `(String, String) -> Void` | ✅ (keyId formato `skd://keyId:keyIV`) |
| `deleteAllPeristableContentKeys(forAsset:)` | `internal` | `(Asset) -> Void` | ✅ |
| `DownloadState.stringValue` | `internal` | `-> String` | ✅ |
| `DownloadState.allCases` | `internal` | `-> [DownloadState]` | ✅ |
| `createDownloadInfoDict(from:)` | `private` | `(DownloadInfo) -> [String: Any]` | ❌ Reproducir lógica |
| `VideoSource.init(_:)` | `internal` | `(NSDictionary!) -> VideoSource` | ✅ |
| `DRMParams.init(_:)` | `internal` | `(NSDictionary!) -> DRMParams` | ✅ |
| `TextTrack.init(_:)` | `internal` | `(NSDictionary!) -> TextTrack` | ✅ |
| `TextTrack.init(_:index:)` | `internal` | `(NSDictionary!, Int) -> TextTrack` | ✅ |
| `YouboraParams.init(_:)` | `internal` | `(NSDictionary!) -> YouboraParams` | ✅ |
| `Chapter.init(_:)` | `internal` | `(NSDictionary!) -> Chapter` | ✅ |

### Detalle de implementación por función

#### ContentKeyManager — Persistencia de claves

**Estrategia**: NO usar el singleton `ContentKeyManager.sharedManager`. Reproducir la lógica de persistencia usando un directorio temporal propio. Las funciones de persistencia usan `contentKeyDirectory` (lazy property que crea `.keys` en Documents). Para tests aislados, escribimos/leemos directamente en un dir temporal.

**`urlForPersistableContentKey`** (línea 615):
```
contentKeyDirectory.appendingPathComponent("\(assetName)-\(keyIV)-Key")
```
Formato del nombre de fichero: `{assetName}-{keyIV}-Key`

**`deletePeristableContentKey`** (línea 626):
- Parsea `keyId` quitando `skd://` prefix
- Separa por `:` y toma `components[1]` como `keyIV`
- Requiere formato `skd://keyId:keyIV` o `keyId:keyIV`
- Guard: `components.count >= 2` — si no, retorna sin hacer nada

#### DownloadState enum (línea 7)

- 13 casos: `notDownloaded`, `preparing`, `queued`, `downloading`, `paused`, `completed`, `failed`, `removing`, `stopped`, `waitingForNetwork`, `licenseExpired`, `drmExpired`, `restarting`
- `stringValue`: cada caso retorna string UPPER_SNAKE_CASE
- `CaseIterable`: se puede iterar con `DownloadState.allCases`
- Raw values: Int 0-12

#### DownloadInfo struct (línea 42)

Campos: `id`, `uri`, `title`, `state`, `progress`, `totalBytes`, `downloadedBytes`, `speed`, `remainingTime`, `quality`, `hasSubtitles`, `hasDRM`, `error`, `startTime`, `completionTime`, `assetPath`

#### createDownloadInfoDict (línea 1958) — `private`

```swift
private func createDownloadInfoDict(from downloadInfo: DownloadInfo) -> [String: Any] {
    return [
        "id": downloadInfo.id,
        "uri": downloadInfo.uri,
        "title": downloadInfo.title,
        "state": downloadInfo.state.stringValue,
        "progress": Int(downloadInfo.progress * 100),  // ← Float → Int percentage
        "totalBytes": downloadInfo.totalBytes,
        "downloadedBytes": downloadInfo.downloadedBytes,
        "speed": downloadInfo.speed,
        "remainingTime": downloadInfo.remainingTime,
        "quality": downloadInfo.quality ?? "",
        "hasSubtitles": downloadInfo.hasSubtitles,
        "hasDRM": downloadInfo.hasDRM
    ]
}
```

**Nota**: `progress` se convierte de Float (0.0-1.0) a Int (0-100). Es `private` — reproducir lógica.

#### VideoSource (línea 1, VideoSource.swift)

- `guard json != nil` → defaults (nil/false)
- `id`: acepta `String` o `Int` (convierte a String)
- `requestHeaders`: array de `[key: String, value: Any]` → diccionario plano
- `cropStart`/`cropEnd`: `Float64` → `Int64` (rounded)

#### DRMParams (línea 1, DRMParams.swift)

- `guard json != nil` → defaults (all nil)
- `headers`: mismo patrón que `requestHeaders` en VideoSource

#### TextTrack (línea 1, TextTrack.swift)

- `guard json != nil` → defaults (empty strings, nil index)
- Init con index explícito: `init(_:index:)` — ignora index del json, usa el parámetro
- Segundo init crea `NSMutableDictionary` con index añadido

#### YouboraParams (línea 1, YouboraParams.swift)

- `guard json != nil` → defaults (nil, `contentIsLive = false`)
- **⚠️ NC-006 (línea 83)**: `self.contentIsLive = (json["contentIsLive"] as? Bool)!`
  - Force unwrap `!` → **CRASH** si `contentIsLive` no está en el dict o no es Bool
  - Test debe estar **comentado** con nota explicando el bug

#### Chapter (línea 1, Chapter.swift)

- `guard json != nil` → defaults (empty string, nil, 0)
- Campos: `title`, `uri`, `startTime`, `endTime`

## 3. Flujo de datos

### Estado global afectado

- Ninguno — tests solo crean/leen ficheros temporales y structs

### Persistencia

- **FileManager**: Tests de ContentKey crean/eliminan ficheros `.key` en dir temporal
- **UserDefaults**: `deletePeristableContentKey` hace `removeObject(forKey:)` — limpiar en tearDown

## 4. Riesgos

### Casos edge problemáticos

- **ContentKeyManager singleton**: NO usar `ContentKeyManager.sharedManager` en tests. Reproducir lógica de persistencia con dir temporal.
- **YouboraParams NC-006**: El force unwrap en línea 83 crashea si `contentIsLive` falta. Test debe estar comentado.
- **`deletePeristableContentKey` formato keyId**: Requiere `skd://keyId:keyIV` — si formato incorrecto, retorna silenciosamente.

## 5. Estrategias

### Testing

- **ContentKeyPersistenceTests**: Dir temporal, write/read/delete ficheros `.key` directamente
- **DownloadStateTests**: Verificar stringValue, unicidad, roundtrip, allCases
- **DataStructureParsingTests**: Crear NSDictionary → init → verificar campos
- **DownloadInfoSerializationTests**: Crear DownloadInfo → reproducir createDownloadInfoDict → verificar

### Rollback

```bash
rm ios/Tests/ContentKeyPersistenceTests.swift
rm ios/Tests/DownloadStateTests.swift
rm ios/Tests/DataStructureParsingTests.swift
rm ios/Tests/DownloadInfoSerializationTests.swift
rm examples/FabricExample/ios/FabricExampleTests/ContentKeyPersistenceTests.swift
rm examples/FabricExample/ios/FabricExampleTests/DownloadStateTests.swift
rm examples/FabricExample/ios/FabricExampleTests/DataStructureParsingTests.swift
rm examples/FabricExample/ios/FabricExampleTests/DownloadInfoSerializationTests.swift
```

## 6. Inventario de tests

### Fichero 1: ContentKeyPersistenceTests.swift

| # | Test | Tipo | Descripción |
|---|------|------|-------------|
| 1 | `testWriteAndRead_roundtrip` | Normal | Write key data → read from file → datos coinciden |
| 2 | `testUrlForPersistableContentKey_format` | Normal | Verificar formato `{assetName}-{keyIV}-Key` |
| 3 | `testPersistableContentKeyExists_afterWrite_true` | Normal | Write → exists → true |
| 4 | `testPersistableContentKeyExists_beforeWrite_false` | Normal | Sin write → exists → false |
| 5 | `testDelete_existingKey_removesFile` | Normal | Write → delete → not exists |
| 6 | `testDelete_nonExistentKey_noError` | Límite | Delete sin write → no crash |
| 7 | `testDeleteAll_multipleKeys_removesAll` | Normal | Write 3 → deleteAll → none exist |
| 8 | `testDelete_invalidKeyIdFormat_noError` | Límite | keyId sin `:` separator → no crash, no delete |

### Fichero 2: DownloadStateTests.swift

| # | Test | Tipo | Descripción |
|---|------|------|-------------|
| 9 | `testStringValue_allCases_nonEmpty` | Normal | Todos los casos → string no vacío |
| 10 | `testStringValue_allCases_unique` | Invariante | Todos los stringValue son únicos |
| 11 | `testStringValue_specificValues` | Normal | Verificar valores específicos (COMPLETED, DOWNLOADING, etc.) |
| 12 | `testAllCases_count` | Invariante | 13 casos totales |
| 13 | `testRawValues_sequential` | Invariante | Raw values 0-12 secuenciales |

### Fichero 3: DataStructureParsingTests.swift

| # | Test | Tipo | Descripción |
|---|------|------|-------------|
| 14 | `testVideoSource_completeDict_allFieldsParsed` | Normal | Dict completo → campos correctos |
| 15 | `testVideoSource_nilDict_defaults` | Límite | nil → defaults (nil/false) |
| 16 | `testVideoSource_idAsInt_convertedToString` | Límite | id como Int → String |
| 17 | `testVideoSource_requestHeaders_parsed` | Normal | Array de headers → diccionario plano |
| 18 | `testDRMParams_completeDict_allFieldsParsed` | Normal | Dict completo → campos correctos |
| 19 | `testDRMParams_nilDict_defaults` | Límite | nil → defaults (all nil) |
| 20 | `testDRMParams_withHeaders_parsed` | Normal | Headers array → diccionario plano |
| 21 | `testTextTrack_completeDict_allFieldsParsed` | Normal | Dict completo → campos correctos |
| 22 | `testTextTrack_nilDict_defaults` | Límite | nil → defaults (empty strings) |
| 23 | `testTextTrack_withExplicitIndex_usesIndex` | Límite | init con index → usa parámetro, no json |
| 24 | `testYoubora_completeDict_allFieldsParsed` | Normal | Dict completo → campos correctos |
| 25 | `testYoubora_nilDict_defaults` | Límite | nil → defaults (nil, contentIsLive=false) |
| 26 | `testYoubora_missingContentIsLive_CRASH_NC006` | Error | **COMENTADO** — documenta NC-006 force unwrap |
| 27 | `testChapter_completeDict_allFieldsParsed` | Normal | Dict completo → campos correctos |
| 28 | `testChapter_nilDict_defaults` | Límite | nil → defaults (empty, 0) |

### Fichero 4: DownloadInfoSerializationTests.swift

| # | Test | Tipo | Descripción |
|---|------|------|-------------|
| 29 | `testCreateDict_completed_progress100` | Normal | Completed, progress 1.0 → progress=100 |
| 30 | `testCreateDict_downloading_progress45` | Normal | Downloading, progress 0.45 → progress=45 |
| 31 | `testCreateDict_allFieldsMapped` | Normal | Verificar todos los campos del dict |
| 32 | `testCreateDict_qualityNil_emptyString` | Límite | quality=nil → "" |
| 33 | `testDownloadInfo_structCreation` | Normal | Crear DownloadInfo → campos correctos |

**Total: 33 tests en 4 ficheros**

## 7. Complejidad estimada

- **Nivel**: Media
- **Justificación**: 4 ficheros de test, múltiples structs/enums. ContentKey requiere dir temporal. YouboraParams tiene bug documentado. `createDownloadInfoDict` es private.
- **Tiempo estimado**: 1.5-2 horas

## 8. Preguntas sin resolver

### Técnicas

- [x] ¿`ContentKeyManager` es singleton? → **SÍ** (`sharedManager`). NO usar en tests — reproducir lógica con dir temporal.
- [x] ¿`createDownloadInfoDict` es `private`? → **SÍ** (línea 1958). Reproducir lógica.
- [x] ¿`DownloadState` es `@objc`? → **SÍ** (línea 7). Accesible con `@testable import`.
- [x] ¿`DownloadInfo` es struct? → **SÍ** (línea 42). Creación directa.
- [x] ¿`deletePeristableContentKey` requiere formato `skd://`? → Sí, hace `replacingOccurrences(of: "skd://", with: "")` y luego split por `:`.
- [x] ¿YouboraParams NC-006 es force unwrap? → **SÍ** (línea 83): `(json["contentIsLive"] as? Bool)!`

### De negocio

- Ninguna

### De rendimiento

- Ninguna

## Aprobación

- [ ] Spec revisado
- [ ] Dudas resueltas
- [ ] Listo para verificación de baseline
