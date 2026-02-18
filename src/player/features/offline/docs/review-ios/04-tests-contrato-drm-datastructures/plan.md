# Plan de Implementación: Tests de contrato — DRM y DataStructures

> Basado en spec.md | Generado el 18/02/2026

## Resumen ejecutivo

- **Objetivo**: Escribir 33 tests XCTest en 4 ficheros que capturen el comportamiento de persistencia DRM, DownloadState, DataStructures y serialización de DownloadInfo
- **Fases**: 4
- **Estimación**: 1.5-2 horas
- **Riesgo general**: Bajo

## Pre-requisitos

### Configuración previa

- [x] Target de tests `FabricExampleTests` configurado (tarea 01)
- [x] `@testable import react_native_video` funcional (tarea 01)

### Estado de git requerido

- Branch base: `refactor_offline`
- Branch de trabajo: `refactor_offline_tasks/04-tests-contrato-drm-datastructures` (ya creada)

---

## Fases de implementación

### Fase 1: DownloadStateTests.swift (5 tests)

**Objetivo**: Tests del enum `DownloadState` — stringValue, unicidad, allCases, rawValues.

**Archivos a crear**:

- `ios/Tests/DownloadStateTests.swift`

**Cambios específicos**:

1. Crear clase `DownloadStateTests` sin setUp/tearDown especial (enum puro, sin estado)
2. Test 9: `testStringValue_allCases_nonEmpty` — iterar allCases, verificar stringValue no vacío
3. Test 10: `testStringValue_allCases_unique` — Set de stringValues, count == allCases.count
4. Test 11: `testStringValue_specificValues` — verificar COMPLETED, DOWNLOADING, PAUSED, FAILED
5. Test 12: `testAllCases_count` — 13 casos
6. Test 13: `testRawValues_sequential` — rawValues 0-12

**Estimación**: 15 min

---

### Fase 2: DataStructureParsingTests.swift (15 tests)

**Objetivo**: Tests de parseo de VideoSource, DRMParams, TextTrack, YouboraParams, Chapter desde NSDictionary.

**Archivos a crear**:

- `ios/Tests/DataStructureParsingTests.swift`

**Cambios específicos**:

1. Crear clase `DataStructureParsingTests` sin setUp/tearDown especial (structs puros)
2. Tests 14-16: VideoSource — dict completo, nil, id como Int
3. Test 17: VideoSource — requestHeaders array → diccionario plano
4. Tests 18-20: DRMParams — dict completo, nil, con headers
5. Tests 21-23: TextTrack — dict completo, nil, con index explícito
6. Tests 24-25: YouboraParams — dict completo, nil
7. Test 26: YouboraParams NC-006 — **COMENTADO** con nota explicando force unwrap crash
8. Tests 27-28: Chapter — dict completo, nil

**Estimación**: 30 min

---

### Fase 3: DownloadInfoSerializationTests.swift (5 tests) + ContentKeyPersistenceTests.swift (8 tests)

**Objetivo**: Tests de serialización de DownloadInfo (reproducción de lógica private) y persistencia de claves DRM (dir temporal).

**Archivos a crear**:

- `ios/Tests/DownloadInfoSerializationTests.swift`
- `ios/Tests/ContentKeyPersistenceTests.swift`

**Cambios específicos para DownloadInfoSerializationTests**:

1. Crear clase con helper `createDownloadInfoDict(from:)` que reproduce la lógica de producción (línea 1958)
2. Test 29: Completed, progress 1.0 → progress=100
3. Test 30: Downloading, progress 0.45 → progress=45
4. Test 31: Verificar todos los campos del dict
5. Test 32: quality=nil → ""
6. Test 33: Crear DownloadInfo → campos correctos

**Cambios específicos para ContentKeyPersistenceTests**:

1. Crear clase con setUp que crea dir temporal y tearDown que lo elimina
2. Helper para reproducir formato de nombre de fichero: `{assetName}-{keyIV}-Key`
3. Helper para reproducir lógica de delete (parseo `skd://keyId:keyIV`)
4. Test 1: Write → read → datos coinciden
5. Test 2: Verificar formato URL
6. Test 3: Write → exists → true
7. Test 4: Sin write → exists → false
8. Test 5: Write → delete → not exists
9. Test 6: Delete sin write → no crash
10. Test 7: Write 3 → deleteAll → none exist
11. Test 8: keyId sin `:` → no crash, no delete

**Estimación**: 40 min

---

### Fase 4: Copiar a FabricExample

**Objetivo**: Copiar los 4 ficheros de test a FabricExampleTests.

**Archivos a crear**:

- `examples/FabricExample/ios/FabricExampleTests/DownloadStateTests.swift`
- `examples/FabricExample/ios/FabricExampleTests/DataStructureParsingTests.swift`
- `examples/FabricExample/ios/FabricExampleTests/DownloadInfoSerializationTests.swift`
- `examples/FabricExample/ios/FabricExampleTests/ContentKeyPersistenceTests.swift`

**Estimación**: 5 min

---

## Orden de ejecución

```
┌─────────┐   ┌─────────┐
│ Fase 1  │   │ Fase 2  │  (independientes)
│ DLState │   │ DataStr │
└────┬────┘   └────┬────┘
     │             │
     └──────┬──────┘
            │
       ┌────▼────┐
       │ Fase 3  │  (DLInfo + ContentKey)
       └────┬────┘
            │
       ┌────▼────┐
       │ Fase 4  │  (Copiar)
       └─────────┘
```

### Dependencias entre fases

- Fase 1 y Fase 2 son independientes
- Fase 3 es independiente de 1 y 2 (pero se ejecuta después por orden)
- Fase 4 depende de todas las anteriores

## Testing por fase

| Fase | Tests | Verificación |
| ---- | ----- | ------------ |
| 1    | 5 tests (DownloadState) | Pasan siempre — enum puro |
| 2    | 15 tests (DataStructures) | Pasan siempre — structs puros |
| 3    | 13 tests (DLInfo + ContentKey) | DLInfo pasa siempre. ContentKey usa dir temporal |
| 4    | 0 (copia) | diff entre ficheros |

## Checklist pre-implementación

- [x] Spec revisado y aprobado
- [x] Baseline verificado sin bloqueos
- [x] Branch creado
- [x] Todas las preguntas resueltas

## Rollback global

```bash
git checkout refactor_offline
git branch -D refactor_offline_tasks/04-tests-contrato-drm-datastructures
```

## Aprobación

- [ ] Plan revisado
- [ ] Orden de fases aprobado
- [ ] Listo para implementar
