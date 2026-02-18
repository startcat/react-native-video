# Plan de Implementación: Extraer DownloadTypes.swift

> Basado en spec.md | Generado el 18/02/2026

## Resumen ejecutivo

- **Objetivo**: Extraer tipos, enums y constantes de `DownloadsModule2.swift` a `DownloadTypes.swift`
- **Fases**: 3
- **Estimación**: 30-45 min
- **Riesgo general**: Bajo

## Pre-requisitos

### Estado de git requerido

- Branch base: `refactor_offline`
- Branch de trabajo: `refactor_offline_tasks/05-extraer-download-types` ✅

### Checklist

- [x] Spec revisado y aprobado
- [x] Baseline verificado sin bloqueos
- [x] Branch creado
- [x] Tests de contrato pasando

---

## Fases de implementación

### Fase 1: Crear DownloadTypes.swift con tipos extraídos

**Objetivo**: Crear el nuevo fichero con `DownloadState`, `DownloadInfo`, `DownloadConstants` y `DownloadQuality`.

**Archivos a crear**:

- `ios/Downloads_v2/DownloadTypes.swift` — tipos, enums y constantes del sistema de descargas

**Cambios específicos**:

1. Crear fichero con `import Foundation`
2. Mover `DownloadState` enum (líneas 7-39 de DownloadsModule2.swift) — copia exacta, mantener `@objc`
3. Mover `DownloadInfo` struct (líneas 42-59) — copia exacta
4. Crear `DownloadConstants` enum con las 4 claves de UserDefaults + `DOWNLOAD_SPACE_CACHE_TTL` + constantes numéricas (`PROGRESS_THRESHOLD`, `MIN_ASSET_SIZE`, `DEFAULT_ESTIMATED_SIZE`)
5. Crear `DownloadQuality` enum con casos `low`, `medium`, `high`, `auto` y propiedad `minBitrate`

**Invariantes preservados**:

- `DownloadState` rawValues 0-12 idénticos
- `DownloadState.stringValue` mapping idéntico
- `DownloadInfo` campos y orden idénticos (memberwise init)
- Valores de constantes idénticos a los actuales

**Punto de verificación**: El fichero existe y tiene la estructura correcta.

**Estimación**: 10 min

---

### Fase 2: Eliminar tipos de DownloadsModule2.swift y actualizar referencias a constantes

**Objetivo**: Eliminar las definiciones movidas y actualizar los 14 usos de constantes para usar `DownloadConstants.XXX`.

**Archivos a modificar**:

- `ios/Downloads_v2/DownloadsModule2.swift` — eliminar tipos (líneas 1-59), eliminar 5 `private let` constantes (líneas 245, 251-254), actualizar 14 usos de constantes

**Cambios específicos**:

1. Eliminar líneas 1-59 (DownloadState + DownloadInfo) — ya están en DownloadTypes.swift
2. Eliminar las 5 declaraciones `private let` de constantes (líneas 245, 251-254)
3. Reemplazar 14 usos de constantes con prefijo `DownloadConstants.`:
   - `ACTIVE_DOWNLOADS_KEY` → `DownloadConstants.ACTIVE_DOWNLOADS_KEY` (2 usos)
   - `ASSET_PATHS_KEY` → `DownloadConstants.ASSET_PATHS_KEY` (4 usos)
   - `ASSET_BOOKMARKS_KEY` → `DownloadConstants.ASSET_BOOKMARKS_KEY` (3 usos)
   - `SUBTITLE_BOOKMARKS_KEY` → `DownloadConstants.SUBTITLE_BOOKMARKS_KEY` (4 usos)
   - `DOWNLOAD_SPACE_CACHE_TTL` → `DownloadConstants.DOWNLOAD_SPACE_CACHE_TTL` (1 uso)

**Invariantes preservados**:

- Todos los usos de constantes apuntan a los mismos valores string/numéricos
- Los tests no se modifican (hardcodean los strings)

**Punto de verificación**: Proyecto compila sin errores.

**Estimación**: 15 min

---

### Fase 3: Crear tests y copiar a FabricExample

**Objetivo**: Crear `DownloadTypesTests.swift` con tests para los nuevos enums, y copiar los ficheros nuevos/modificados al target de tests de FabricExample.

**Archivos a crear**:

- `ios/Tests/DownloadTypesTests.swift` — tests para DownloadConstants y DownloadQuality

**Archivos a copiar a FabricExample** (para que los tests ejecuten):

- `examples/FabricExample/ios/FabricExampleTests/DownloadTypesTests.swift`

**Cambios específicos**:

1. Crear `DownloadTypesTests.swift` con:
   - `testDownloadState_allCases_has13Elements`
   - `testDownloadQuality_bitrates` (low=500000, medium=1500000, high=3000000, auto=0)
   - `testDownloadConstants_keysNotEmpty`
   - `testDownloadConstants_thresholds`
2. Copiar el fichero de tests a FabricExample

**Punto de verificación**: `Cmd+U` en Xcode — todos los tests pasan (existentes + nuevos).

**Estimación**: 10 min

---

## Orden de ejecución

```
┌─────────┐
│ Fase 1  │  Crear DownloadTypes.swift
└────┬────┘
     │
┌────▼────┐
│ Fase 2  │  Limpiar DownloadsModule2.swift
└────┬────┘
     │
┌────▼────┐
│ Fase 3  │  Tests + copiar a FabricExample
└─────────┘
```

Todas las fases son secuenciales.

### Puntos de no retorno

- Ninguno — todo es reversible con `git revert HEAD`

## Testing por fase

| Fase | Verificación |
|------|-------------|
| 1 | Fichero creado con estructura correcta |
| 2 | Proyecto compila sin errores |
| 3 | Cmd+U: todos los tests pasan (existentes + nuevos) |

## Rollback global

```bash
git checkout refactor_offline
git branch -D refactor_offline_tasks/05-extraer-download-types
```

## Aprobación

- [ ] Plan revisado
- [ ] Orden de fases aprobado
- [ ] Listo para implementar
