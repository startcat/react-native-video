# Tarea: Tests de contrato — Persistencia

> Tarea 2 de 20 | Fase A: Red de seguridad
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

`DownloadsModule2.swift` persiste el estado de descargas, asset paths, asset bookmarks y subtitle bookmarks en UserDefaults mediante 3 mecanismos independientes (SA-07). Antes de extraer `DownloadPersistenceManager`, necesitamos tests que capturen el comportamiento actual de toda la lógica de persistencia.

**IDs de auditoría cubiertos**: REQ-016, REQ-017, REQ-018, REQ-019

## Objetivo

Escribir tests de contrato XCTest que capturen el comportamiento actual de la persistencia en UserDefaults (estado de descargas, asset paths, asset bookmarks, subtitle bookmarks) para que sirvan como red de seguridad durante la extracción de `DownloadPersistenceManager`.

## Fuente

El fichero `03-estrategia-testing.md` de la auditoría contiene código de test propuesto en la sección:
- **3.1.3** — DownloadsModule2: Persistencia

Usar ese código como punto de partida. Adaptarlo para que compile y ejecute correctamente.

**No rediseñar los tests desde cero.**

## Alcance

### Código bajo test (NO modificar)

- `ios/Downloads_v2/DownloadsModule2.swift` — funciones: `persistDownloadState()`, `restoreDownloadStates()`, `saveAssetPath()`, `loadAssetPaths()`, `removeAssetPath()`, `clearAllAssetPaths()`, `saveAssetBookmark()`, `resolveAssetBookmark()`, `removeAssetBookmark()`, `saveSubtitleBookmark()`, `resolveSubtitleBookmark()`, `removeSubtitleBookmark()`, `removeAllSubtitleBookmarks()`

### Ficheros de test a crear

- `ios/Tests/DownloadsModule2PersistenceTests.swift` — Tests de persistencia UserDefaults, bookmarks

### Fuera de alcance

- NO modificar código de producción
- NO testear operaciones CRUD (tarea 01), validación (tarea 03), ni DRM (tarea 04)

## Cobertura requerida

| Función/Método | Caso normal | Caso límite | Caso error | Invariantes |
|----------------|-------------|-------------|------------|-------------|
| `persistDownloadState()` / `restoreDownloadStates()` | Save → restore → datos coinciden | Restore sin datos previos → vacío | — | Roundtrip preserva todos los campos |
| `saveAssetPath()` / `loadAssetPaths()` | Save → load → path correcto | — | — | — |
| `removeAssetPath()` | Save → remove → load → nil | Remove sin save previo → no crash | — | — |
| `saveAssetBookmark()` / `resolveAssetBookmark()` | Save → resolve → URL válida | — | Fichero eliminado → resolve falla | Bookmark sobrevive en mismo proceso |
| `removeAssetBookmark()` | Save → remove → resolve → nil | — | — | — |
| `saveSubtitleBookmark()` / `resolveSubtitleBookmark()` | Save → resolve → URL válida | — | — | Clave compuesta downloadId:language |
| `removeSubtitleBookmark()` | Save → remove → resolve → nil | — | — | — |
| `removeAllSubtitleBookmarks()` | Save múltiples → removeAll para un ID → solo ese ID eliminado | — | — | No afecta otros IDs |

## Criterios de aceptación

- [ ] Todos los tests ejecutan sin errores
- [ ] Todos los tests pasan en verde contra el código actual sin modificaciones
- [ ] Cada función de persistencia tiene al menos: caso normal, caso límite, caso error
- [ ] Los tests usan `UserDefaults(suiteName:)` aislado para no contaminar estado global
- [ ] Los tests son independientes entre sí
- [ ] El comando `xcodebuild test -scheme react-native-video -only-testing:DownloadsModule2PersistenceTests` pasa con código 0

## Dependencias

### Tareas previas requeridas
- Ninguna

### Tareas que dependen de esta
- Tarea 06 (extraer DownloadPersistenceManager)
- Tarea 12 (fix bookmark errors NC-009)

## Riesgo

- **Nivel**: bajo
- **Principal riesgo**: Las funciones de persistencia son privadas en `DownloadsModule2`. Puede ser necesario testear indirectamente a través de la API pública (add → getDownload verifica que se persistió) o cambiar la visibilidad a `internal` para testing.
- **Mitigación**: Usar `@testable import` que da acceso a miembros `internal`. Si las funciones son `private`, testear indirectamente.

## Estimación

1.5-2.5 horas

## Notas

- Los tests de bookmarks necesitan crear ficheros temporales reales para generar bookmark data válida.
- Los tests deben limpiar UserDefaults en `setUp()` para garantizar aislamiento.
- La sección 3.1.3 de la auditoría ya incluye un patrón de `PersistenceTestCase` base con `testDefaults` y `testDirectory` que se puede reutilizar.
