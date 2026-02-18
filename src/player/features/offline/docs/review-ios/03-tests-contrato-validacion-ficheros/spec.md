# Especificación Técnica: Tests de contrato — Validación y ficheros

> Generado a partir de task.md el 18/02/2026

## Resumen

Tests XCTest que capturan el comportamiento actual de validación de configuración, validación de integridad de assets, cálculo de tamaño de ficheros y limpieza de paths `/.nofollow` en `DownloadsModule2.swift`.

## 1. Alcance

### Módulos afectados

**Directos:**

- `ios/Downloads_v2/DownloadsModule2.swift` — Código bajo test (NO modificar)

**Indirectos:**

- Ninguno

### Ficheros de test a crear

- `ios/Tests/DownloadValidationTests.swift` — Tests de validación y operaciones de ficheros
- `examples/FabricExample/ios/FabricExampleTests/DownloadValidationTests.swift` — Copia sincronizada

## 2. Contratos

### Funciones bajo test

| Función                                     | Visibilidad         | Firma                                                             | Testeable directamente           |
| ------------------------------------------- | ------------------- | ----------------------------------------------------------------- | -------------------------------- |
| `validateDownloadConfig(_:)`                | `private`           | `(NSDictionary) -> Bool`                                          | ❌ Indirecto vía `addDownload`   |
| `validateAssetIntegrity(at:)`               | `private`           | `(URL) -> (isValid: Bool, error: String?)`                        | ❌ Indirecto — reproducir lógica |
| `validateAssetIntegrityRelaxed(at:)`        | `private`           | `(URL) -> (isValid: Bool, error: String?)`                        | ❌ Indirecto — reproducir lógica |
| `validateDownloadUri(_:resolver:rejecter:)` | `@objc` (internal)  | `(String, RCTPromiseResolveBlock, RCTPromiseRejectBlock) -> Void` | ✅ Directo                       |
| `calculateAssetSize(at:)`                   | `private`           | `(URL) -> Int64`                                                  | ❌ Indirecto — reproducir lógica |
| `calculateDirectorySize(at:)`               | `private`           | `(URL) -> Int64`                                                  | ❌ Indirecto — reproducir lógica |
| Limpieza `/.nofollow`                       | inline (no función) | Patrón repetido en múltiples sitios                               | ❌ Reproducir lógica             |

### Estrategia para métodos `private`

Dado que la mayoría de funciones son `private`, la estrategia es:

1. **`validateDownloadConfig`**: Testear indirectamente vía `addDownload` — si config es inválida, rechaza con `INVALID_CONFIG`. Requiere `moduleInit` previo.
2. **`validateAssetIntegrity` / `validateAssetIntegrityRelaxed`**: Reproducir la lógica de validación en los tests usando ficheros temporales reales. Verificar las mismas condiciones: directorio existe, no vacío, tamaño >= 1MB. La validación strict además verifica tracks AVURLAsset (no reproducible en test sin .movpkg real).
3. **`calculateAssetSize` / `calculateDirectorySize`**: Reproducir la lógica de cálculo de tamaño con directorios temporales de tamaño conocido.
4. **Limpieza `/.nofollow`**: Reproducir el patrón inline `path.hasPrefix("/.nofollow") → dropFirst("/.nofollow".count)`.

### Detalle de implementación por función

#### `validateDownloadConfig` (línea 1365)

```swift
private func validateDownloadConfig(_ config: NSDictionary) -> Bool {
    return config["id"] != nil && config["uri"] != nil && config["title"] != nil
}
```

- Requiere: `id`, `uri`, `title` no nil
- Llamada desde: `addDownload` (línea 397)
- Test indirecto: `addDownload` con config incompleta → `INVALID_CONFIG`

#### `validateDownloadUri` (línea 1100)

```swift
@objc func validateDownloadUri(_ uri: String, resolver resolve: ..., rejecter reject: ...) {
    let isValid = URL(string: uri) != nil
    let type = uri.contains(".m3u8") || uri.contains(".mpd") ? "stream" : "binary"
    resolve(["isValid": isValid, "type": type])
}
```

- `isValid`: `URL(string:)` no nil
- `type`: contiene `.m3u8` o `.mpd` → `"stream"`, sino → `"binary"`
- **Siempre resuelve** (nunca rechaza)

#### `validateAssetIntegrity` (línea 2337)

Pasos:

1. Handle `/.nofollow` prefix
2. Verificar directorio existe y es directorio
3. Verificar no vacío
4. Verificar tamaño >= 1MB (`1_000_000` bytes)
5. Verificar tracks AVURLAsset (video o audio)

#### `validateAssetIntegrityRelaxed` (línea 2387)

Igual que `validateAssetIntegrity` pero **sin paso 5** (skip track validation).

#### `calculateAssetSize` (línea 2427)

- Handle `/.nofollow` prefix
- Si no existe → retorna `0`
- Si es directorio → enumera recursivamente sumando `fileSize` de cada fichero (no directorios)
- Si es fichero → retorna su `fileSize`
- En caso de error → retorna `0`

#### `calculateDirectorySize` (línea 2593)

- Enumera recursivamente sumando `fileSize` de cada fichero
- Si enumerator falla → retorna `0`
- Más simple que `calculateAssetSize` (sin manejo de `/.nofollow`)

#### Limpieza `/.nofollow`

Patrón repetido en ~8 sitios:

```swift
if path.hasPrefix("/.nofollow") {
    let cleanPath = String(path.dropFirst("/.nofollow".count))
    // usar cleanPath
}
```

## 3. Flujo de datos

### Estado global afectado

- Ninguno — tests solo leen/verifican, no mutan estado del módulo

### Persistencia

- **UserDefaults**: No afectado
- **FileManager**: Tests crean/eliminan ficheros temporales

## 4. Riesgos

### Compatibilidad hacia atrás

Ningún breaking change — solo tests nuevos.

### Casos edge problemáticos

- **`validateAssetIntegrity` paso 5 (tracks AVURLAsset)**: No se puede testear sin un `.movpkg` real con tracks de video/audio. Los tests de integridad solo pueden verificar pasos 1-4. Documentar esta limitación.
- **`validateDownloadConfig` requiere `moduleInit`**: Para testear indirectamente vía `addDownload`, necesitamos que el módulo esté inicializado. Usar `XCTSkipUnless` como en tareas anteriores.
- **`calculateAssetSize` con `/.nofollow`**: Difícil crear paths con `/.nofollow` en el simulador. Testear la lógica de limpieza por separado.

## 5. Estrategias

### Testing

- **Unitarios**: Reproducir lógica de validación y cálculo con ficheros temporales
- **Integración**: `validateDownloadUri` directo, `validateDownloadConfig` indirecto vía `addDownload`

### Rollback

```bash
rm ios/Tests/DownloadValidationTests.swift
rm examples/FabricExample/ios/FabricExampleTests/DownloadValidationTests.swift
```

## 6. Inventario de tests

### Grupo 1: validateDownloadConfig (indirecto vía addDownload)

| #   | Test                                           | Tipo   | Descripción                                                                                         |
| --- | ---------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| 1   | `testValidateConfig_allFieldsPresent_accepted` | Normal | Config con id+uri+title → addDownload no rechaza con INVALID_CONFIG (puede rechazar por otra razón) |
| 2   | `testValidateConfig_missingId_rejected`        | Error  | Config sin id → INVALID_CONFIG                                                                      |
| 3   | `testValidateConfig_missingUri_rejected`       | Error  | Config sin uri → INVALID_CONFIG                                                                     |
| 4   | `testValidateConfig_missingTitle_rejected`     | Error  | Config sin title → INVALID_CONFIG                                                                   |
| 5   | `testValidateConfig_emptyDict_rejected`        | Error  | Dict vacío → INVALID_CONFIG                                                                         |
| 6   | `testValidateConfig_extraFields_accepted`      | Límite | Config con campos extra → no rechaza con INVALID_CONFIG                                             |

### Grupo 2: validateDownloadUri (directo)

| #   | Test                                        | Tipo   | Descripción                                                          |
| --- | ------------------------------------------- | ------ | -------------------------------------------------------------------- |
| 7   | `testValidateUri_hlsStream_validAndStream`  | Normal | `.m3u8` → isValid=true, type="stream"                                |
| 8   | `testValidateUri_dashStream_validAndStream` | Normal | `.mpd` → isValid=true, type="stream"                                 |
| 9   | `testValidateUri_mp4_validAndBinary`        | Normal | `.mp4` → isValid=true, type="binary"                                 |
| 10  | `testValidateUri_invalidUri_notValid`       | Error  | URI inválida → isValid=false                                         |
| 11  | `testValidateUri_emptyString_notValid`      | Límite | String vacío → isValid=false (URL(string:"") retorna nil? verificar) |
| 12  | `testValidateUri_hlsInPath_stream`          | Límite | `.m3u8` en medio del path → type="stream"                            |

### Grupo 3: Lógica de integridad de assets (reproducida)

| #   | Test                                                     | Tipo   | Descripción                                    |
| --- | -------------------------------------------------------- | ------ | ---------------------------------------------- |
| 13  | `testAssetIntegrity_directoryWithLargeFile_valid`        | Normal | Dir con fichero >1MB → pasa checks 1-4         |
| 14  | `testAssetIntegrity_nonExistentPath_invalid`             | Error  | Path inexistente → falla check 1               |
| 15  | `testAssetIntegrity_emptyDirectory_invalid`              | Error  | Dir vacío → falla check 2                      |
| 16  | `testAssetIntegrity_tooSmall_invalid`                    | Límite | Dir con fichero <1MB → falla check 3           |
| 17  | `testAssetIntegrity_fileNotDirectory_invalid`            | Límite | Fichero (no dir) → falla check 1 (isDirectory) |
| 18  | `testAssetIntegrityRelaxed_directoryWithLargeFile_valid` | Normal | Misma lógica sin check de tracks               |

### Grupo 4: Cálculo de tamaño (reproducido)

| #   | Test                                                     | Tipo   | Descripción                        |
| --- | -------------------------------------------------------- | ------ | ---------------------------------- |
| 19  | `testCalculateSize_singleFile_returnsFileSize`           | Normal | Fichero de 1024 bytes → 1024       |
| 20  | `testCalculateSize_directoryWithFiles_returnsSumOfSizes` | Normal | Dir con 3 ficheros → suma correcta |
| 21  | `testCalculateSize_emptyDirectory_returnsZero`           | Límite | Dir vacío → 0                      |
| 22  | `testCalculateSize_nonExistentPath_returnsZero`          | Error  | Path inexistente → 0               |
| 23  | `testCalculateSize_nestedDirectories_recursiveSum`       | Normal | Dir con subdirs → suma recursiva   |

### Grupo 5: Limpieza /.nofollow (reproducida)

| #   | Test                                       | Tipo   | Descripción                                 |
| --- | ------------------------------------------ | ------ | ------------------------------------------- |
| 24  | `testNofollow_pathWithPrefix_cleaned`      | Normal | `/.nofollow/path/to/file` → `/path/to/file` |
| 25  | `testNofollow_pathWithoutPrefix_unchanged` | Normal | `/path/to/file` → `/path/to/file`           |
| 26  | `testNofollow_emptyPath_unchanged`         | Límite | `""` → `""`                                 |
| 27  | `testNofollow_onlyPrefix_becomesEmpty`     | Límite | `"/.nofollow"` → `""`                       |

**Total: 27 tests**

## 7. Complejidad estimada

- **Nivel**: Media-Baja
- **Justificación**: La mayoría de funciones son `private` y requieren reproducir lógica o testing indirecto. Los tests de ficheros necesitan crear directorios temporales con contenido de tamaño conocido. `validateDownloadUri` es el único método testeable directamente.
- **Tiempo estimado**: 1.5-2 horas

## 8. Preguntas sin resolver

### Técnicas

- [x] ¿`URL(string: "")` retorna `nil` o un URL válido? → **Retorna `nil`**. Empty string → isValid=false. Confirmado con `swift -e`.
- [x] ¿Los tests de `validateDownloadConfig` vía `addDownload` requieren `moduleInit`? → **SÍ** — `addDownload` tiene guard `isInitialized` (línea 389). Usar `XCTSkipUnless`.
- [x] ¿`validateAssetIntegrity` es `private`? → **SÍ** (línea 2337). Reproducir lógica en tests.
- [x] ¿`calculateAssetSize` es `private`? → **SÍ** (línea 2427). Reproducir lógica en tests.
- [x] ¿`calculateDirectorySize` es `private`? → **SÍ** (línea 2593). Reproducir lógica en tests.

### De negocio

- Ninguna — esta tarea no cambia comportamiento.

### De rendimiento

- Ninguna — solo tests.

## Aprobación

- [ ] Spec revisado
- [ ] Dudas resueltas
- [ ] Listo para verificación de baseline
