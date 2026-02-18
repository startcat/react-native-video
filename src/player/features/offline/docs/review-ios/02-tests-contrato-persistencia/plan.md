# Plan de Implementación: Tests de contrato — Persistencia

> Basado en spec.md | Generado el 18/02/2026

## Resumen ejecutivo

- **Objetivo**: Escribir 21 tests XCTest que capturen el comportamiento de persistencia de `DownloadsModule2` en UserDefaults
- **Fases**: 3
- **Estimación**: 1.5-2.5 horas
- **Riesgo general**: Bajo

## Pre-requisitos

### Dependencias a instalar/actualizar

Ninguna — se reutiliza el target `FabricExampleTests` creado en tarea 01.

### Configuración previa

- [x] Target de tests `FabricExampleTests` configurado (tarea 01)
- [x] Bridging header creado (tarea 01)
- [x] `@testable import react_native_video` funcional (tarea 01)

### Estado de git requerido

- Branch base: `refactor_offline`
- Branch de trabajo: `refactor_offline_tasks/02-tests-contrato-persistencia` (ya creada)

---

## Fases de implementación

### Fase 1: Tests de Download State Persistence y Asset Paths

**Objetivo**: Implementar tests para `persistDownloadState`/`restoreDownloadStates` (indirectos) y `saveAssetPath`/`loadAssetPaths`/`removeAssetPath`/`clearAllAssetPaths` (vía UserDefaults directo).

**Archivos a crear**:

- `ios/Tests/DownloadsModule2PersistenceTests.swift` — Fichero principal con todos los tests de persistencia

**Cambios específicos**:

1. Crear clase `DownloadsModule2PersistenceTests` con `setUp()` que limpia las 4 keys de UserDefaults y crea instancia de `DownloadsModule2`
2. Crear `tearDown()` que limpia UserDefaults y ficheros temporales
3. Implementar tests 1-5 (Download State Persistence):
   - Test 1: Escribir array de dicts en UserDefaults con formato de `persistDownloadState` → `moduleInit` → verificar con `getDownloads` que se restauraron. Usar `XCTSkipUnless` si `moduleInit` falla.
   - Test 2: Sin datos en UserDefaults → `moduleInit` → `getDownloads` devuelve array vacío
   - Test 3: State string no reconocido → fallback a `PAUSED`
   - Test 4: Entrada sin campos requeridos → se ignora
   - Test 5: Múltiples descargas → todas se restauran
4. Implementar tests 6-10 (Asset Path Persistence — UserDefaults directo):
   - Test 6: Save path en UserDefaults → leer → correcto
   - Test 7: Save → remove → leer → nil
   - Test 8: Remove sin save previo → no crash
   - Test 9: Save múltiples → clear all → vacío
   - Test 10: Save path A → save path B mismo ID → B sobrescribe A

**Invariantes que podrían verse afectados**:

- Ninguno — solo lectura/escritura de UserDefaults

**Punto de verificación**:

```
Verificar que el fichero compila y los tests 1-10 están definidos.
Los tests de download state (1-5) pueden necesitar XCTSkipUnless si moduleInit falla.
Los tests de asset path (6-10) son puramente UserDefaults y deben pasar siempre.
```

**Rollback de esta fase**:

```bash
rm ios/Tests/DownloadsModule2PersistenceTests.swift
```

**Estimación**: 45 min

---

### Fase 2: Tests de Asset Bookmark Persistence

**Objetivo**: Implementar tests para `saveAssetBookmark`/`resolveAssetBookmark`/`removeAssetBookmark` usando ficheros temporales reales.

**Archivos a modificar**:

- `ios/Tests/DownloadsModule2PersistenceTests.swift` — Añadir tests 11-14

**Cambios específicos**:

1. Añadir helper `createTempFile(name:content:)` que crea un fichero temporal y retorna su URL
2. Implementar tests 11-14:
   - Test 11: Crear fichero temp → generar bookmark data → guardar en UserDefaults → `resolveAssetBookmark` → URL válida
   - Test 12: `resolveAssetBookmark` sin bookmark guardado → nil
   - Test 13: Guardar data inválida en UserDefaults → `resolveAssetBookmark` → nil + bookmark eliminado de UserDefaults
   - Test 14: Guardar bookmark → eliminar de UserDefaults → `resolveAssetBookmark` → nil

**Nota sobre `saveAssetBookmark`**: Es `private`, así que guardamos bookmark data directamente en UserDefaults con la key `com.downloads.assetBookmarks`. Luego usamos `resolveAssetBookmark` (que es `internal`) para verificar.

**Punto de verificación**:

```
Tests 11-14 definidos. Tests 11 y 14 requieren ficheros temporales reales.
Test 13 verifica el side-effect de auto-limpieza de bookmarks inválidos.
```

**Rollback de esta fase**:

```bash
git diff ios/Tests/DownloadsModule2PersistenceTests.swift | git apply -R
```

**Estimación**: 30 min

---

### Fase 3: Tests de Subtitle Bookmark Persistence + Copiar a FabricExample

**Objetivo**: Implementar tests para `saveSubtitleBookmark`/`resolveSubtitleBookmark`/`removeSubtitleBookmark`/`removeAllSubtitleBookmarks` y copiar el fichero final a `FabricExampleTests`.

**Archivos a modificar**:

- `ios/Tests/DownloadsModule2PersistenceTests.swift` — Añadir tests 15-21

**Archivos a crear**:

- `examples/FabricExample/ios/FabricExampleTests/DownloadsModule2PersistenceTests.swift` — Copia del fichero de tests

**Cambios específicos**:

1. Implementar tests 15-21:
   - Test 15: Crear fichero temp → `saveSubtitleBookmark` → `resolveSubtitleBookmark` → URL válida
   - Test 16: `resolveSubtitleBookmark` sin bookmark → nil
   - Test 17: Save → eliminar fichero → resolve → nil (verifica check de existencia)
   - Test 18: Save → `removeSubtitleBookmark` → resolve → nil
   - Test 19: Save bookmarks para ID-A y ID-B → `removeAllSubtitleBookmarks(ID-A)` → ID-B sigue existiendo
   - Test 20: Verificar que la key en UserDefaults tiene formato `downloadId:language`
   - Test 21: Save es, en, ca para mismo ID → resolve cada uno → todos válidos
2. Copiar fichero completo a `examples/FabricExample/ios/FabricExampleTests/`

**Nota sobre subtitle bookmarks**: Todos los métodos son `internal` — se pueden llamar directamente con `@testable import`.

**Punto de verificación**:

```
21 tests totales definidos en el fichero.
Fichero copiado a FabricExampleTests.
Ambas copias son idénticas.
```

**Rollback de esta fase**:

```bash
git diff ios/Tests/DownloadsModule2PersistenceTests.swift | git apply -R
rm examples/FabricExample/ios/FabricExampleTests/DownloadsModule2PersistenceTests.swift
```

**Estimación**: 45 min

---

## Orden de ejecución

```
┌─────────┐
│ Fase 1  │  Download State + Asset Paths (10 tests)
└────┬────┘
     │
┌────▼────┐
│ Fase 2  │  Asset Bookmarks (4 tests)
└────┬────┘
     │
┌────▼────┐
│ Fase 3  │  Subtitle Bookmarks (7 tests) + Copiar
└─────────┘
```

### Dependencias entre fases

- Fase 2 depende de Fase 1 (fichero base + helpers)
- Fase 3 depende de Fase 2 (fichero completo)

### Fases paralelas

- Ninguna — secuencial

### Puntos de no retorno

- Ninguno — todo es reversible eliminando ficheros de test

## Testing por fase

| Fase | Tests | Verificación |
| ---- | ----- | ------------ |
| 1    | 10 tests (5 download state + 5 asset paths) | Tests 6-10 deben pasar siempre. Tests 1-5 pueden skip si moduleInit falla |
| 2    | 4 tests (asset bookmarks) | Requieren ficheros temporales |
| 3    | 7 tests (subtitle bookmarks) + copia | Todos directos vía @testable import |

## Checklist pre-implementación

- [x] Spec revisado y aprobado
- [x] Baseline verificado sin bloqueos
- [x] Branch creado (`refactor_offline_tasks/02-tests-contrato-persistencia`)
- [x] Entorno de desarrollo limpio
- [x] Tests tarea 01 pasando

## Rollback global

```bash
git checkout refactor_offline
git branch -D refactor_offline_tasks/02-tests-contrato-persistencia
```

## Aprobación

- [ ] Plan revisado
- [ ] Orden de fases aprobado
- [ ] Listo para implementar
