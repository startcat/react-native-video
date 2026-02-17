# Tarea: Extraer DownloadTypes.swift

> Tarea 5 de 20 | Fase B: Extracciones de bajo riesgo
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`DownloadsModule2.swift` (2929 líneas) define inline el enum `DownloadState`, la struct `DownloadInfo`, y las constantes de persistencia. Estos tipos son usados por todo el módulo y serán importados por cada unidad extraída. Extraerlos es el paso fundacional de toda la refactorización (SA-01).

**IDs de auditoría relacionados**: SA-01, SA-13

## Objetivo

Extraer los tipos, enums y constantes del sistema de descargas a un fichero independiente `DownloadTypes.swift`, sin cambiar ningún comportamiento.

## Alcance

### Código afectado

- `ios/Downloads_v2/DownloadsModule2.swift` — extraer: enum `DownloadState` (líneas ~1-40), struct `DownloadInfo` (líneas ~40-70), constantes `ACTIVE_DOWNLOADS_KEY`, `ASSET_PATHS_KEY`, `ASSET_BOOKMARKS_KEY`, `SUBTITLE_BOOKMARKS_KEY`, `DOWNLOAD_SPACE_CACHE_TTL` (líneas ~70-100)
- `ios/Downloads_v2/DownloadTypes.swift` — **nuevo fichero** con los tipos extraídos

### Fuera de alcance

- NO mover lógica de negocio, solo definiciones de tipos y constantes
- NO cambiar nombres de tipos ni de propiedades
- NO modificar otros ficheros que usen estos tipos (en Swift, al estar en el mismo target, el import es implícito)

## Requisitos funcionales

1. **[SA-01]**: Reducir responsabilidades de `DownloadsModule2.swift` extrayendo tipos compartidos
2. **[SA-13]**: Extraer valores hardcodeados a constantes con nombre (`PROGRESS_THRESHOLD = 0.98`, `MIN_ASSET_SIZE = 1_000_000`, `DEFAULT_ESTIMATED_SIZE = 500_000_000`)

## Requisitos técnicos

1. Fichero `DownloadTypes.swift` en `ios/Downloads_v2/`
2. Interfaz pública según sección A1 de `02-propuesta-segmentacion.md`
3. Añadir enum `DownloadQuality` (extraído del switch en `createDownloadTask`, líneas 1384-1396) con propiedad `minBitrate`
4. Añadir enum `DownloadConstants` con todas las constantes dispersas
5. No introducir dependencias nuevas (solo Foundation)

## Cambios de contrato

- **Ninguno** — el comportamiento público debe ser idéntico antes y después.

## Criterios de aceptación

### Funcionales
- [ ] `DownloadTypes.swift` contiene `DownloadState`, `DownloadInfo`, `DownloadConstants`, `DownloadQuality`
- [ ] `DownloadsModule2.swift` ya no contiene estas definiciones
- [ ] El proyecto compila sin errores

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅
- [ ] Tests nuevos: verificar que `DownloadState.allCases` tiene 8 elementos, `stringValue` roundtrip, `DownloadQuality` bitrates correctos

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `ios/Tests/DownloadsModule2StateTests.swift` — valida que las operaciones CRUD siguen funcionando con los tipos extraídos
- `ios/Tests/DownloadStateTests.swift` — valida el enum DownloadState directamente
- Estos tests NO se modifican

### Tests nuevos a crear

- `ios/Tests/DownloadTypesTests.swift`:
  - `testDownloadState_allCases_has8Elements`: Verifica que el enum tiene los 8 estados esperados
  - `testDownloadQuality_bitrates`: Verifica que low=500000, medium=1500000, high=3000000
  - `testDownloadConstants_keysNotEmpty`: Verifica que las constantes de UserDefaults no están vacías

## Dependencias

### Tareas previas requeridas
- Tareas 01-04 (Fase A): tests de contrato deben estar en verde

### Tareas que dependen de esta
- Tarea 06 (DownloadPersistenceManager)
- Tarea 07 (DownloadFileManager)
- Tarea 13 (DownloadProgressTracker)
- Tarea 15 (DownloadDRMManager)

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: Olvidar mover alguna constante o tipo, causando error de compilación
- **Mitigación**: El compilador de Swift detectará inmediatamente cualquier tipo faltante
- **Rollback**: `git revert HEAD`

## Estimación

0.5-1.5 horas

## Notas

- En Swift, los tipos definidos en ficheros del mismo target son accesibles sin import explícito. Solo hay que mover las definiciones.
- Los valores hardcodeados de SA-13 (0.98, 1_000_000, 500_000_000, bitrates) se extraen a `DownloadConstants` y `DownloadQuality` en esta tarea, pero los usos inline se reemplazan en las tareas posteriores cuando se extraigan las funciones que los usan.
