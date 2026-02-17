# Tarea: Extraer DownloadFileManager.swift

> Tarea 7 de 20 | Fase B: Extracciones de bajo riesgo
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`DownloadsModule2.swift` contiene operaciones de FileManager dispersas: creación de directorios, eliminación de assets descargados, cálculo de tamaño, y ~10 ocurrencias del patrón de limpieza de `/.nofollow` (SA-06, CI-004). Centralizar estas operaciones en un manager dedicado elimina la duplicación y facilita el testing.

**IDs de auditoría relacionados**: SA-01, SA-06, CI-004, REQ-006

## Objetivo

Extraer todas las operaciones de sistema de ficheros a `DownloadFileManager.swift`, incluyendo una función centralizada `cleanPath()` que reemplace las ~10 ocurrencias dispersas de manejo de `/.nofollow`.

## Alcance

### Código afectado

- `ios/Downloads_v2/DownloadsModule2.swift` — extraer funciones: `createDirectoriesIfNeeded()` (líneas 1252-1263), `removeDownloadedFiles()` (líneas 1597-1704), `calculateAssetSize()` (líneas 2427-2489), `calculateDirectorySize()` (líneas 2593-2615), código inline de `/.nofollow` (~10 ocurrencias)
- `ios/Downloads_v2/DownloadFileManager.swift` — **nuevo fichero**

### Fuera de alcance

- NO extraer `purgeOrphanedAssets()` en esta tarea (se queda en DownloadsModule2 por ahora, depende de estado activo)
- NO cambiar la API pública de `DownloadsModule2`

## Requisitos funcionales

1. **[REQ-006]**: Eliminar descarga completada (ficheros .movpkg, paths, bookmarks)
2. **[CI-004]**: Centralizar manejo de `/.nofollow` en una función `cleanPath()`

## Requisitos técnicos

1. Clase `DownloadFileManager` en `ios/Downloads_v2/`
2. Interfaz pública según sección A3 de `02-propuesta-segmentacion.md`
3. Depende de `DownloadPersistenceManager` (para resolución de bookmarks como fallback en `removeDownloadedFiles`)
4. Función `cleanPath(_ path: String) -> String` que centraliza la lógica de `/.nofollow`
5. `DownloadsModule2` crea instancia y delega todas las llamadas a FileManager

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] Todas las operaciones de FileManager están en `DownloadFileManager`
- [ ] No quedan ocurrencias de `/.nofollow` inline en `DownloadsModule2.swift`
- [ ] `cleanPath()` produce los mismos resultados que el código inline actual
- [ ] El proyecto compila sin errores

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅
- [ ] Tests nuevos cubren: cleanPath con/sin prefijo, calculateAssetSize, calculateDirectorySize, createDirectories

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `ios/Tests/DownloadValidationTests.swift` — valida cálculo de tamaño y limpieza de paths
- Estos tests NO se modifican

### Tests nuevos a crear

- `ios/Tests/DownloadFileManagerTests.swift`:
  - `testCleanPath_withNofollow_removesPrefix`: `/.nofollow/Library/...` → `/Library/...`
  - `testCleanPath_withoutNofollow_unchanged`: `/Library/...` → `/Library/...`
  - `testCleanPath_empty_returnsEmpty`: `""` → `""`
  - `testCalculateAssetSize_existingFile_returnsSize`: Fichero 1KB → 1024
  - `testCalculateDirectorySize_multipleFiles_returnsSum`: 3 ficheros → suma
  - `testCalculateDirectorySize_emptyDir_returnsZero`: Dir vacío → 0
  - `testCreateDirectories_createsAll`: Verifica que los 3 directorios existen

## Dependencias

### Tareas previas requeridas
- Tarea 06 (DownloadPersistenceManager): usa bookmarks como fallback en `removeDownloadedFiles`

### Tareas que dependen de esta
- Tarea 08 (DownloadValidator): usa `cleanPath` y `calculateAssetSize`
- Tarea 09 (DownloadStorageCalculator): usa `calculateDirectorySize`

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: `removeDownloadedFiles()` es la función más compleja (~110 líneas) con cascada de fallbacks. Puede ser difícil extraerla sin romper la lógica de fallback.
- **Mitigación**: Extraer la función completa sin simplificarla. La simplificación de la cascada se hará cuando se simplifique la triple persistencia (CI-001).
- **Rollback**: `git revert HEAD`

## Estimación

1.5-2.5 horas

## Notas

- La función `removeDownloadedFiles()` tiene una cascada de 3 intentos para localizar el fichero (assetPath → bookmark → pendingLocation). Esta lógica se mueve tal cual. La simplificación de CI-001 es una tarea futura.
- `cleanPath()` debe manejar el caso de path vacío y de path sin prefijo `/.nofollow` sin modificarlo.
