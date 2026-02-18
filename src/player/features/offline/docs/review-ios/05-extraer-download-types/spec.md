# Especificación Técnica: Extraer DownloadTypes.swift

> Generado a partir de task.md el 18/02/2026

## Resumen

Extraer `DownloadState`, `DownloadInfo`, constantes de persistencia y calidad de descarga de `DownloadsModule2.swift` a un nuevo fichero `DownloadTypes.swift`, sin cambiar ningún comportamiento.

## 1. Alcance

### Módulos afectados

**Directos:**

- `ios/Downloads_v2/DownloadsModule2.swift`: se eliminan las definiciones de tipos (líneas 1-59) y constantes dispersas (líneas 245, 251-254)
- `ios/Downloads_v2/DownloadTypes.swift`: **nuevo fichero** con los tipos extraídos

**Indirectos (solo lectura, no se modifican):**

- `ios/Downloads/DownloadsModule.swift`: usa `DownloadState` (20 refs) — sigue funcionando porque está en el mismo target
- `ios/Managers/AssetDownloader.swift`: usa `DownloadState` (15 refs) — idem
- `ios/Downloads/Asset.swift`: usa `DownloadState` (6 refs) — idem
- `ios/Extensions + Utils/Notification.Name.swift`: usa `DownloadState` (1 ref) — idem
- `ios/Tests/DownloadStateTests.swift`: usa `DownloadState` (20 refs) — idem
- `ios/Tests/DownloadInfoSerializationTests.swift`: usa `DownloadInfo` (32 refs) — idem
- `ios/Tests/DownloadsModule2PersistenceTests.swift`: usa `DownloadState` (12 refs) — idem

### Dependencias impactadas

**Internas:** Ninguna

**Externas:** Ninguna — solo `Foundation` (ya importado)

### Archivos de configuración

- Ninguno. En Swift, los tipos en el mismo target son accesibles sin import explícito. No hay que tocar `project.pbxproj` si el fichero se crea en la misma carpeta y se añade al target.

## 2. Contratos

### Cambios en API pública

| Elemento | Tipo de cambio | Antes | Después |
|---|---|---|---|
| `DownloadState` | Movido (sin cambio) | Definido en `DownloadsModule2.swift:7-39` | Definido en `DownloadTypes.swift` |
| `DownloadInfo` | Movido (sin cambio) | Definido en `DownloadsModule2.swift:42-59` | Definido en `DownloadTypes.swift` |
| `DownloadConstants` | **Nuevo** enum | Constantes dispersas como `private let` en `DownloadsModule2` | Enum sin casos con `static let` |
| `DownloadQuality` | **Nuevo** enum | Switch inline en `createDownloadTask` (línea 1394) | Enum con propiedad `minBitrate` |

### Tipos actuales (código fuente real)

#### DownloadState (líneas 7-39, sin cambios)

```swift
@objc enum DownloadState: Int, CaseIterable {
    case notDownloaded = 0
    case preparing = 1
    case queued = 2
    case downloading = 3
    case paused = 4
    case completed = 5
    case failed = 6
    case removing = 7
    case stopped = 8
    case waitingForNetwork = 9
    case licenseExpired = 10
    case drmExpired = 11
    case restarting = 12
    
    var stringValue: String { ... } // 13 casos
}
```

> **Nota**: task.md dice "8 elementos" pero el código real tiene **13 casos**. Los tests existentes (`DownloadStateTests.swift:44`) ya validan 13. El spec usa el código real.

#### DownloadInfo (líneas 42-59, sin cambios)

```swift
struct DownloadInfo {
    let id: String
    let uri: String
    let title: String
    var state: DownloadState
    var progress: Float
    var totalBytes: Int64
    var downloadedBytes: Int64
    var speed: Double
    var remainingTime: Int
    var quality: String?
    var hasSubtitles: Bool
    var hasDRM: Bool
    var error: Error?
    var startTime: Date?
    var completionTime: Date?
    var assetPath: String?
}
```

#### DownloadConstants (nuevo)

```swift
enum DownloadConstants {
    // Claves de persistencia UserDefaults
    static let ACTIVE_DOWNLOADS_KEY = "com.downloads.activeStates"
    static let ASSET_PATHS_KEY = "com.downloads.assetPaths"
    static let ASSET_BOOKMARKS_KEY = "com.downloads.assetBookmarks"
    static let SUBTITLE_BOOKMARKS_KEY = "com.downloads.subtitleBookmarks"
    
    // Umbrales y valores por defecto
    static let DOWNLOAD_SPACE_CACHE_TTL: TimeInterval = 5.0
    static let PROGRESS_THRESHOLD: Float = 0.98
    static let MIN_ASSET_SIZE: Int64 = 1_000_000
    static let DEFAULT_ESTIMATED_SIZE: Int64 = 500_000_000
}
```

> **Nota sobre uso**: Las constantes se definen aquí pero los usos inline (`0.98`, `1_000_000`, etc.) en `DownloadsModule2.swift` **no se reemplazan en esta tarea**. Se reemplazarán en las tareas 06-09 cuando se extraigan las funciones que las usan. En esta tarea solo se mueven las `private let` que ya son constantes con nombre.

#### DownloadQuality (nuevo)

```swift
enum DownloadQuality: String {
    case low
    case medium
    case high
    case auto
    
    var minBitrate: Int {
        switch self {
        case .low: return 500_000
        case .medium: return 1_500_000
        case .high: return 3_000_000
        case .auto: return 0
        }
    }
}
```

### Cambios en eventos/callbacks

- Ninguno

## 3. Flujo de datos

### Estado global afectado

- Ninguno — solo se mueven definiciones de tipos

### Persistencia

- **UserDefaults**: Las claves se mueven de `private let` en `DownloadsModule2` a `DownloadConstants`. Los valores son idénticos.
- **No hay migración de datos** — las claves no cambian

### Comunicación entre módulos

- Sin cambios. Los tipos siguen en el mismo target Swift.

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change | Severidad | Mitigación |
|---|---|---|
| Ninguno | — | Los tipos mantienen la misma firma |

### Impacto en rendimiento

- Ninguno — cambio puramente estructural

### Casos edge problemáticos

- **`DownloadState` es `@objc`**: Debe mantener `@objc enum DownloadState: Int` para ser accesible desde Objective-C (`DownloadsModule2.m`). Verificar que el atributo se mantiene.
- **`DownloadInfo` no es `@objc`**: Es una struct Swift pura, no necesita atributos especiales.
- **Constantes `private let` → `static let`**: Al pasar de propiedades de instancia privadas a constantes estáticas públicas, los usos en `DownloadsModule2` deben cambiar de `self.ACTIVE_DOWNLOADS_KEY` a `DownloadConstants.ACTIVE_DOWNLOADS_KEY` (o simplemente `ACTIVE_DOWNLOADS_KEY` si no hay ambigüedad, pero el prefijo es más claro).

## 5. Estrategias

### Testing

- **Existentes (no modificar)**: `DownloadStateTests.swift` (5 tests), `DownloadInfoSerializationTests.swift` (5 tests) — validan que los tipos siguen funcionando igual
- **Nuevos**: `DownloadTypesTests.swift`:
  - `testDownloadState_allCases_has13Elements` — 13 casos (no 8 como dice task.md)
  - `testDownloadQuality_bitrates` — low=500000, medium=1500000, high=3000000, auto=0
  - `testDownloadQuality_fromString` — roundtrip string→enum
  - `testDownloadConstants_keysNotEmpty` — todas las claves de UserDefaults son no vacías
  - `testDownloadConstants_thresholds` — valores numéricos correctos

### Rollback

1. `git revert HEAD`
2. El compilador detectará inmediatamente si falta algún tipo

### Migración de datos

- **¿Necesaria?**: No
- **Reversible**: Sí

## 6. Complejidad estimada

- **Nivel**: Baja
- **Justificación**: Solo mover definiciones de tipos y crear 2 enums nuevos triviales. El compilador valida todo.
- **Tiempo estimado**: 0.5-1h

## 7. Preguntas sin resolver

### Técnicas

- [x] ¿Cuántos casos tiene `DownloadState`? → **13** (no 8 como dice task.md, verificado en código)
- [x] ¿`DownloadInfo` tiene `completionTime`? → **Sí** (la propuesta A1 no lo listaba, pero el código real sí)
- [ ] ¿Reemplazar los usos inline de constantes (`0.98`, `1_000_000`) en esta tarea o en las posteriores? → **En las posteriores** (según nota en task.md)

### De negocio

- Ninguna

### De rendimiento

- Ninguna

## Aprobación

- [ ] Spec revisado
- [ ] Dudas resueltas
- [ ] Listo para verificación de baseline
