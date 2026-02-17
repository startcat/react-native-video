# Plan de Implementación: Tests de contrato — CRUD y estado

> Basado en spec.md | Generado el 17/02/2026

## Resumen ejecutivo

- **Objetivo**: Escribir tests XCTest que capturen el comportamiento actual de las operaciones CRUD y configuración de `DownloadsModule2`
- **Fases**: 3
- **Estimación**: 1.5-2.5 horas
- **Riesgo general**: Bajo

## Pre-requisitos

### Configuración previa

- [ ] Verificar que el proyecto compila en Xcode con `xcodebuild build`
- [ ] Identificar el nombre del módulo para `@testable import`
- [ ] Verificar si `DownloadsModule2()` se puede instanciar sin bridge RN

### Estado de git requerido

- Branch base: `refactor_offline`
- Branch de trabajo: `refactor_offline_tasks/01-tests-contrato-crud-estado` (ya creado)

---

## Fases de implementación

### Fase 1: Crear infraestructura de tests

**Objetivo**: Tener un target de tests XCTest funcional que compile y ejecute un test trivial.

**Archivos a crear**:

- `ios/Tests/DownloadsModule2StateTests.swift` — Fichero de tests con setUp/tearDown y un test placeholder
- `ios/Tests/DownloadsModule2ConfigTests.swift` — Fichero de tests de configuración con setUp y un test placeholder

**Cambios específicos**:

1. Crear directorio `ios/Tests/` si no existe
2. Crear `DownloadsModule2StateTests.swift` con:
   - Import XCTest y `@testable import` del módulo
   - Clase `DownloadsModule2StateTests: XCTestCase`
   - `setUp()` que instancie `DownloadsModule2()` y limpie UserDefaults
   - `tearDown()` que limpie
   - Un test placeholder `testModuleCanBeInstantiated` que verifique que el módulo no es nil
3. Crear `DownloadsModule2ConfigTests.swift` con estructura similar
4. **DECISIÓN CRÍTICA**: Si `DownloadsModule2()` no se puede instanciar sin bridge:
   - Opción A: Usar el target de tests de `FabricExample` como host app
   - Opción B: Crear un helper que configure un bridge mínimo
   - Opción C: Mockear `RCTEventEmitter` con un protocolo

**Nota sobre target XCTest**: Al ser una librería CocoaPods, los tests se ejecutan normalmente dentro del target de tests de una app host. La opción más práctica es usar `examples/FabricExample` como app host. Si esto no es viable, se puede crear un target de tests standalone en `RCTVideo.xcodeproj`.

**Punto de verificación**:

```bash
# Opción A: Usando FabricExample como host
cd examples/FabricExample && xcodebuild test \
  -workspace FabricExample.xcworkspace \
  -scheme FabricExample \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -only-testing:DownloadsModule2StateTests/testModuleCanBeInstantiated \
  2>&1 | tail -5

# Opción B: Si se crea target standalone
xcodebuild test \
  -project ios/RCTVideo.xcodeproj \
  -scheme DownloadsModule2Tests \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  2>&1 | tail -5
```

**Rollback**: `git checkout -- ios/Tests/`

**Estimación**: 30-45 min (incluye investigar cómo ejecutar tests en el proyecto)

---

### Fase 2: Tests de estado y CRUD

**Objetivo**: Implementar los 17 tests de `DownloadsModule2StateTests.swift` que cubren operaciones CRUD y consultas de estado.

**Archivos a modificar**:

- `ios/Tests/DownloadsModule2StateTests.swift` — Añadir los 17 tests

**Cambios específicos**:

1. **Tests sin `moduleInit` (no requieren isInitialized)**:
   - `testGetDownloads_empty_returnsEmptyArray` — REQ-012
   - `testHasDownload_nonExistent_returnsFalse` — REQ-014
   - `testGetDownload_nonExistent_returnsNil` — REQ-013
   - `testGetStats_empty_returnsZeroCounts` — REQ-015
   - `testGetStats_returnsExpectedKeys` — REQ-015 (keys: activeDownloads, queuedDownloads, completedDownloads, failedDownloads, totalDownloaded, averageSpeed)
   - `testPauseAll_empty_resolves` — REQ-007
   - `testResumeAll_empty_resolves` — REQ-008
   - `testCancelAll_empty_resolves` — REQ-009
   - `testRemoveDownload_nonExistent_behavior` — REQ-006
   - `testPauseDownload_nonExistent_behavior` — REQ-003
   - `testResumeDownload_nonExistent_behavior` — REQ-004
   - `testCancelDownload_nonExistent_behavior` — REQ-005

2. **Tests que requieren `moduleInit` o bypass de isInitialized**:
   - `testAddDownload_validConfig_createsDownloadInfo` — REQ-001
   - `testAddDownload_missingId_rejects` — REQ-002
   - `testAddDownload_missingUri_rejects` — REQ-002
   - `testAddDownload_missingTitle_rejects` — REQ-002
   - `testAddDownload_extraFields_resolves` — REQ-001

3. **Estrategia para tests de addDownload**:
   - Intentar llamar a `moduleInit(nil)` en setUp y esperar a que resuelva
   - Si `moduleInit` falla sin entorno real, testear que `addDownload` rechaza con `NOT_INITIALIZED` (documenta el comportamiento actual)
   - Si `moduleInit` funciona, testear validación de config normalmente

4. **Patrón de cada test**: expectation + resolver/rejecter + waitForExpectations(timeout: 5-10)

**Invariantes que podrían verse afectados**:

- Ninguno — solo se lee el comportamiento actual

**Punto de verificación**:

```bash
xcodebuild test -only-testing:DownloadsModule2StateTests 2>&1 | grep -E "(Test Case|passed|failed)"
```

**Rollback**: `git checkout -- ios/Tests/DownloadsModule2StateTests.swift`

**Estimación**: 45-60 min

---

### Fase 3: Tests de configuración

**Objetivo**: Implementar los 8 tests de `DownloadsModule2ConfigTests.swift` que cubren configuración y validación de URI.

**Archivos a modificar**:

- `ios/Tests/DownloadsModule2ConfigTests.swift` — Añadir los 8 tests

**Cambios específicos**:

1. **Tests de configuración (síncronos, no requieren moduleInit)**:
   - `testSetStreamQuality_validQuality_resolves` — "high" → resolve
   - `testSetStreamQuality_allValues_resolve` — "low", "medium", "high", "auto" → todos resolve
   - `testSetNetworkPolicy_validConfig_resolves` — Config con allowCellular/requireWifi → resolve
   - `testSetDownloadLimits_validConfig_resolves` — Config con maxConcurrent → resolve

2. **Tests de validateDownloadUri (síncronos, no requieren moduleInit)**:
   - `testValidateDownloadUri_validHLS_returnsStreamType` — `.m3u8` → `{isValid: true, type: "stream"}`
   - `testValidateDownloadUri_validMP4_returnsBinaryType` — `.mp4` → `{isValid: true, type: "binary"}`
   - `testValidateDownloadUri_invalidUri_returnsInvalid` — URI con espacios → `{isValid: false}`
   - `testValidateDownloadUri_emptyString_returnsInvalid` — String vacío → `{isValid: false}`

3. **Nota**: `setStreamQuality`, `setNetworkPolicy` y `setDownloadLimits` resuelven síncronamente (no usan downloadQueue). `validateDownloadUri` también es síncrono. Aun así, usar expectations por consistencia con el patrón bridge.

**Punto de verificación**:

```bash
xcodebuild test -only-testing:DownloadsModule2ConfigTests 2>&1 | grep -E "(Test Case|passed|failed)"
```

**Rollback**: `git checkout -- ios/Tests/DownloadsModule2ConfigTests.swift`

**Estimación**: 20-30 min

---

## Orden de ejecución

```
┌─────────────────────────┐
│ Fase 1: Infraestructura │
│ (target + placeholder)  │
└────────────┬────────────┘
             │
     ┌───────┴───────┐
     │               │
┌────▼────┐   ┌──────▼──────┐
│ Fase 2  │   │   Fase 3    │  (paralelas)
│ Estado  │   │ Configuración│
└────┬────┘   └──────┬──────┘
     │               │
     └───────┬───────┘
             │
        ┌────▼────┐
        │ Commit  │
        └─────────┘
```

### Dependencias entre fases

- Fase 2 depende de: Fase 1 (target funcional)
- Fase 3 depende de: Fase 1 (target funcional)
- Fase 2 y Fase 3 son independientes entre sí

## Testing por fase

| Fase | Tests | Verificación |
|------|-------|-------------|
| 1 | 1 placeholder | Compila y ejecuta sin errores |
| 2 | 17 tests CRUD/estado | Todos pasan en verde |
| 3 | 8 tests configuración | Todos pasan en verde |
| **Total** | **25 tests** | `xcodebuild test` sale con código 0 |

## Checklist pre-implementación

- [x] Spec revisado y aprobado
- [x] Baseline verificado (con notas)
- [x] Branch creado (`refactor_offline_tasks/01-tests-contrato-crud-estado`)
- [ ] Entorno de desarrollo limpio
- [ ] Verificar compilación del proyecto iOS

## Rollback global

```bash
# Opción 1: Revert del commit
git revert HEAD

# Opción 2: Eliminar ficheros de test
rm -rf ios/Tests/

# Opción 3: Volver a refactor_offline
git checkout refactor_offline
git branch -D refactor_offline_tasks/01-tests-contrato-crud-estado
```

## Aprobación

- [ ] Plan revisado
- [ ] Orden de fases aprobado
- [ ] Listo para implementar
