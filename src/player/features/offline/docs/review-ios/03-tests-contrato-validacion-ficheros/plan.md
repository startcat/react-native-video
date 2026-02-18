# Plan de Implementación: Tests de contrato — Validación y ficheros

> Basado en spec.md | Generado el 18/02/2026

## Resumen ejecutivo

- **Objetivo**: Escribir 27 tests XCTest que capturen el comportamiento de validación y operaciones de ficheros de `DownloadsModule2`
- **Fases**: 3
- **Estimación**: 1.5-2 horas
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
- Branch de trabajo: `refactor_offline_tasks/03-tests-contrato-validacion-ficheros` (ya creada)

---

## Fases de implementación

### Fase 1: validateDownloadUri (directo) + validateDownloadConfig (indirecto) + Limpieza /.nofollow

**Objetivo**: Implementar los tests que no requieren ficheros temporales complejos: `validateDownloadUri` (directo), `validateDownloadConfig` (indirecto vía `addDownload`), y limpieza `/.nofollow` (reproducción de lógica).

**Archivos a crear**:

- `ios/Tests/DownloadValidationTests.swift` — Fichero principal con todos los tests

**Cambios específicos**:

1. Crear clase `DownloadValidationTests` con `setUp()` que limpia UserDefaults y crea instancia de `DownloadsModule2`
2. Crear `tearDown()` que limpia UserDefaults y ficheros temporales
3. Crear helper `initializeModule()` con patrón `XCTSkipUnless` (reutilizado de tareas anteriores)
4. Implementar tests 7-12 (validateDownloadUri — directo):
   - Test 7: HLS `.m3u8` → isValid=true, type="stream"
   - Test 8: DASH `.mpd` → isValid=true, type="stream"
   - Test 9: MP4 → isValid=true, type="binary"
   - Test 10: URI inválida → isValid=false
   - Test 11: String vacío → isValid=false
   - Test 12: `.m3u8` en medio del path → type="stream"
5. Implementar tests 1-6 (validateDownloadConfig — indirecto vía addDownload):
   - Test 1: Config completa → no rechaza con INVALID_CONFIG
   - Test 2: Sin id → INVALID_CONFIG
   - Test 3: Sin uri → INVALID_CONFIG
   - Test 4: Sin title → INVALID_CONFIG
   - Test 5: Dict vacío → INVALID_CONFIG
   - Test 6: Campos extra → no rechaza con INVALID_CONFIG
6. Implementar tests 24-27 (limpieza /.nofollow — reproducción de lógica):
   - Test 24: Path con prefijo → limpio
   - Test 25: Path sin prefijo → sin cambio
   - Test 26: Path vacío → vacío
   - Test 27: Solo prefijo → vacío

**Punto de verificación**:

```
16 tests definidos. Tests de validateDownloadUri deben pasar siempre.
Tests de validateDownloadConfig requieren moduleInit (XCTSkipUnless).
Tests de /.nofollow son puramente lógicos, deben pasar siempre.
```

**Rollback de esta fase**:

```bash
rm ios/Tests/DownloadValidationTests.swift
```

**Estimación**: 40 min

---

### Fase 2: Integridad de assets (reproducción de lógica con dirs temporales)

**Objetivo**: Implementar tests que reproducen la lógica de `validateAssetIntegrity` y `validateAssetIntegrityRelaxed` usando directorios temporales reales.

**Archivos a modificar**:

- `ios/Tests/DownloadValidationTests.swift` — Añadir tests 13-18

**Cambios específicos**:

1. Crear helpers para directorios temporales:
   - `createTempDirectory(name:)` → URL de directorio temporal
   - `createFileInDirectory(_:name:sizeInBytes:)` → crea fichero de tamaño específico
2. Implementar tests 13-18:
   - Test 13: Dir con fichero >1MB → pasa checks 1-4 (dir existe, no vacío, tamaño >= 1MB)
   - Test 14: Path inexistente → falla (no existe)
   - Test 15: Dir vacío → falla (vacío)
   - Test 16: Dir con fichero <1MB → falla (tamaño insuficiente)
   - Test 17: Fichero (no directorio) → falla (no es directorio)
   - Test 18: Relaxed — dir con fichero >1MB → pasa (sin check de tracks)

**Nota**: No podemos verificar el paso 5 (tracks AVURLAsset) sin un `.movpkg` real. Los tests reproducen los pasos 1-4 que son verificables con ficheros temporales.

**Punto de verificación**:

```
6 tests de integridad definidos. Todos usan ficheros temporales reales.
Verificar que tearDown limpia correctamente los directorios temporales.
```

**Rollback de esta fase**:

```bash
git diff ios/Tests/DownloadValidationTests.swift | git apply -R
```

**Estimación**: 30 min

---

### Fase 3: Cálculo de tamaño (reproducción de lógica) + Copiar a FabricExample

**Objetivo**: Implementar tests de `calculateAssetSize`/`calculateDirectorySize` con directorios de tamaño conocido, y copiar el fichero final a FabricExampleTests.

**Archivos a modificar**:

- `ios/Tests/DownloadValidationTests.swift` — Añadir tests 19-23

**Archivos a crear**:

- `examples/FabricExample/ios/FabricExampleTests/DownloadValidationTests.swift` — Copia del fichero

**Cambios específicos**:

1. Implementar tests 19-23:
   - Test 19: Fichero de 1024 bytes → tamaño = 1024
   - Test 20: Dir con 3 ficheros → suma correcta
   - Test 21: Dir vacío → tamaño = 0
   - Test 22: Path inexistente → tamaño = 0
   - Test 23: Dir con subdirectorios → suma recursiva
2. Copiar fichero completo a `examples/FabricExample/ios/FabricExampleTests/`

**Punto de verificación**:

```
27 tests totales definidos en el fichero.
Fichero copiado a FabricExampleTests.
Ambas copias son idénticas.
```

**Rollback de esta fase**:

```bash
git diff ios/Tests/DownloadValidationTests.swift | git apply -R
rm examples/FabricExample/ios/FabricExampleTests/DownloadValidationTests.swift
```

**Estimación**: 30 min

---

## Orden de ejecución

```
┌─────────┐
│ Fase 1  │  URI + Config + /.nofollow (16 tests)
└────┬────┘
     │
┌────▼────┐
│ Fase 2  │  Integridad de assets (6 tests)
└────┬────┘
     │
┌────▼────┐
│ Fase 3  │  Cálculo de tamaño (5 tests) + Copiar
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
| 1    | 16 tests (6 URI + 6 config + 4 nofollow) | URI y nofollow pasan siempre. Config puede skip si moduleInit falla |
| 2    | 6 tests (integridad) | Requieren dirs temporales |
| 3    | 5 tests (tamaño) + copia | Requieren ficheros de tamaño conocido |

## Checklist pre-implementación

- [x] Spec revisado y aprobado
- [x] Baseline verificado sin bloqueos
- [x] Branch creado (`refactor_offline_tasks/03-tests-contrato-validacion-ficheros`)
- [x] Entorno de desarrollo limpio
- [x] Tests tareas 01-02 pasando

## Rollback global

```bash
git checkout refactor_offline
git branch -D refactor_offline_tasks/03-tests-contrato-validacion-ficheros
```

## Aprobación

- [ ] Plan revisado
- [ ] Orden de fases aprobado
- [ ] Listo para implementar
