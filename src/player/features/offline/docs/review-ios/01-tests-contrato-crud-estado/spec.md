# Especificación Técnica: Tests de contrato — CRUD y estado de descargas

> Generado a partir de task.md el 17/02/2026

## Resumen

Escribir tests de contrato XCTest que capturen el comportamiento actual de las operaciones CRUD y consultas de estado de `DownloadsModule2` antes de cualquier refactorización.

## 1. Alcance

### Módulos afectados

**Directos:**

- `ios/Downloads_v2/DownloadsModule2.swift`: Módulo bajo test — NO se modifica, solo se testea
- `ios/Tests/DownloadsModule2StateTests.swift`: **Nuevo** — tests CRUD y estado
- `ios/Tests/DownloadsModule2ConfigTests.swift`: **Nuevo** — tests configuración y validación URI

**Indirectos:**

- Proyecto Xcode (`react-native-video.xcodeproj` o workspace): Puede necesitar un target de tests si no existe
- `UserDefaults.standard`: Se usa en setUp/tearDown para limpiar estado entre tests

### Dependencias impactadas

**Internas:**

- `react_native_video` (target principal): Se importa con `@testable import react_native_video`
- `React` / `RCTEventEmitter`: Dependencia de `DownloadsModule2` que puede requerir mock del bridge

**Externas:**

- `XCTest`: Framework de testing de Apple (incluido en Xcode)
- `AVFoundation` (`AVAssetDownloadURLSession`): Dependencia de `addDownload()` — solo funciona en simulador/dispositivo con red

### Archivos de configuración

- Proyecto Xcode: Puede necesitar nuevo target de tests `DownloadsModule2Tests`
- `Info.plist` del target de tests: Si se crea target nuevo

## 2. Contratos

### Cambios en API pública

| Elemento | Tipo de cambio | Antes | Después |
| -------- | -------------- | ----- | ------- |
| —        | —              | —     | —       |

**No hay cambios en API pública.** Esta tarea solo añade tests.

### Cambios en tipos/interfaces

Ninguno — solo se consumen las interfaces existentes de `DownloadsModule2`.

### Cambios en eventos/callbacks

Ninguno.

## 3. Flujo de datos

### Estado global afectado

- `UserDefaults.standard`: Se limpia en `setUp()` para aislar tests. Keys afectadas:
  - `com.downloads.activeDownloads`
  - `com.downloads.assetPaths`
  - `com.downloads.assetBookmarks`
  - `com.downloads.subtitleBookmarks`
- `DownloadsModule2.isInitialized`: Propiedad privada que controla si `addDownload` funciona. Requiere llamar a `moduleInit()` primero, que a su vez crea `AVAssetDownloadURLSession` (requiere entorno iOS real).

### Persistencia

- **UserDefaults**: Se limpia antes de cada test y se restaura después
- **Base de datos**: No aplica
- **Cache**: No aplica

### Comunicación entre módulos

- Tests → `DownloadsModule2`: Llamadas directas a métodos públicos con resolver/rejecter
- `DownloadsModule2` → `RCTEventEmitter`: Puede emitir eventos durante tests — no se validan en esta tarea (se validarán en tareas posteriores)

## 4. Riesgos

### Compatibilidad hacia atrás

| Breaking change | Severidad | Mitigación           |
| --------------- | --------- | -------------------- |
| Ninguno         | —         | Solo se añaden tests |

### Impacto en rendimiento

- Sin impacto — los tests solo se ejecutan en CI/desarrollo

### Casos edge problemáticos

- **Instanciación de `DownloadsModule2` sin bridge RN**: `DownloadsModule2` hereda de `RCTEventEmitter` que normalmente requiere un bridge activo. Si `DownloadsModule2()` falla sin bridge, habrá que:
  1. Verificar si el init funciona sin bridge (probable que sí para la mayoría de métodos)
  2. Si falla, crear un mock mínimo del bridge o usar `swizzling` para evitar la dependencia
  3. Como último recurso, ejecutar como tests de integración en simulador con app RN arrancada

- **`addDownload` requiere `moduleInit()` + `AVAssetDownloadURLSession`**: `addDownload` tiene un guard `isInitialized` que rechaza con `NOT_INITIALIZED` si no se ha llamado a `moduleInit()`. Y `moduleInit()` crea `AVAssetDownloadURLSession` que requiere entorno iOS real. Los tests de `addDownload` con config válida necesitan o bien llamar a `moduleInit()` (requiere simulador) o bien setear `isInitialized = true` directamente (requiere acceso a propiedad privada vía `@testable`). Los tests de config inválida también necesitan `isInitialized` porque el guard se ejecuta antes de `validateDownloadConfig`.

- **`cancelDownload` delega a `removeDownload`**: Son la misma implementación (`cancelDownload` llama a `removeDownload` directamente). Los tests deben documentar este comportamiento.

- **Limpieza de UserDefaults entre tests**: Si los tests no limpian correctamente, pueden interferir entre sí. Mitigación: `setUp()` limpia todas las keys conocidas.

- **Orden de ejecución de tests**: XCTest no garantiza orden. Cada test debe ser independiente.

- **No existe target de tests**: El directorio `ios/Tests/` no existe y el proyecto `RCTVideo.xcodeproj` no tiene un target de tests. Hay que crear el target o usar el target de tests de una app ejemplo (ej: `FabricExample`).

## 5. Estrategias

### Testing

- **Unitarios**: Tests de cada método público de `DownloadsModule2` con casos normal, límite y error
- **Integración**: No aplica en esta tarea
- **E2E**: No aplica en esta tarea
- **Manual**: Ejecutar `xcodebuild test` y verificar que todos pasan en verde

### Rollback

1. `git revert HEAD` — elimina los ficheros de test
2. Si se creó un target de tests en Xcode, eliminarlo manualmente

### Migración de datos

- **¿Necesaria?**: No
- **Estrategia**: N/A
- **Reversible**: N/A

## 6. Inventario de tests

### Fichero 1: `ios/Tests/DownloadsModule2StateTests.swift`

Fuente: `03-estrategia-testing.md` sección 3.1.1

| #   | Test                                              | REQ     | Tipo       | Descripción                                                                                                                     |
| --- | ------------------------------------------------- | ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `testAddDownload_validConfig_createsDownloadInfo` | REQ-001 | Normal     | Config con id+uri+title → resolve                                                                                               |
| 2   | `testAddDownload_missingId_rejects`               | REQ-002 | Error      | Sin id → reject                                                                                                                 |
| 3   | `testAddDownload_missingUri_rejects`              | REQ-002 | Error      | Sin uri → reject                                                                                                                |
| 4   | `testAddDownload_missingTitle_rejects`            | REQ-002 | Error      | Sin title → reject                                                                                                              |
| 5   | `testAddDownload_extraFields_resolves`            | REQ-001 | Límite     | Config con campos extra → resolve                                                                                               |
| 6   | `testGetDownloads_empty_returnsEmptyArray`        | REQ-012 | Normal     | Sin descargas → `{"downloads": []}`                                                                                             |
| 7   | `testHasDownload_nonExistent_returnsFalse`        | REQ-014 | Error      | ID inexistente → false                                                                                                          |
| 8   | `testGetDownload_nonExistent_returnsNil`          | REQ-013 | Error      | ID inexistente → nil                                                                                                            |
| 9   | `testRemoveDownload_nonExistent_behavior`         | REQ-006 | Error      | ID inexistente → documenta comportamiento actual                                                                                |
| 10  | `testPauseDownload_nonExistent_behavior`          | REQ-003 | Error      | ID inexistente → documenta comportamiento actual                                                                                |
| 11  | `testResumeDownload_nonExistent_behavior`         | REQ-004 | Error      | ID inexistente → documenta comportamiento actual                                                                                |
| 12  | `testCancelDownload_nonExistent_behavior`         | REQ-005 | Error      | ID inexistente → documenta comportamiento actual                                                                                |
| 13  | `testGetStats_empty_returnsZeroCounts`            | REQ-015 | Normal     | Sin descargas → todos los contadores a 0                                                                                        |
| 14  | `testGetStats_returnsExpectedKeys`                | REQ-015 | Invariante | Verifica keys: `activeDownloads`, `queuedDownloads`, `completedDownloads`, `failedDownloads`, `totalDownloaded`, `averageSpeed` |
| 15  | `testPauseAll_empty_resolves`                     | REQ-007 | Límite     | Sin descargas → resolve sin error                                                                                               |
| 16  | `testResumeAll_empty_resolves`                    | REQ-008 | Límite     | Sin descargas → resolve sin error                                                                                               |
| 17  | `testCancelAll_empty_resolves`                    | REQ-009 | Límite     | Sin descargas → resolve sin error                                                                                               |

### Fichero 2: `ios/Tests/DownloadsModule2ConfigTests.swift`

Fuente: `03-estrategia-testing.md` sección 3.1.2

| #   | Test                                                 | REQ     | Tipo   | Descripción                                     |
| --- | ---------------------------------------------------- | ------- | ------ | ----------------------------------------------- |
| 1   | `testSetStreamQuality_validQuality_resolves`         | REQ-011 | Normal | "high" → resolve                                |
| 2   | `testSetStreamQuality_allValues_resolve`             | REQ-011 | Límite | "low", "medium", "high", "auto" → todos resolve |
| 3   | `testSetNetworkPolicy_validConfig_resolves`          | —       | Normal | Config con allowCellular/requireWifi → resolve  |
| 4   | `testSetDownloadLimits_validConfig_resolves`         | —       | Normal | Config con maxConcurrent → resolve              |
| 5   | `testValidateDownloadUri_validHLS_returnsStreamType` | REQ-002 | Normal | `.m3u8` → `{isValid: true, type: "stream"}`     |
| 6   | `testValidateDownloadUri_validMP4_returnsBinaryType` | REQ-002 | Normal | `.mp4` → `{isValid: true, type: "binary"}`      |
| 7   | `testValidateDownloadUri_invalidUri_returnsInvalid`  | REQ-002 | Error  | URI inválida → `{isValid: false}`               |
| 8   | `testValidateDownloadUri_emptyString_returnsInvalid` | REQ-002 | Límite | String vacío → `{isValid: false}`               |

**Total: 25 tests** (17 estado + 8 configuración)

## 7. Estructura de ficheros

```
ios/
├── Tests/                              ← puede que no exista, crear si necesario
│   ├── DownloadsModule2StateTests.swift   ← NUEVO
│   └── DownloadsModule2ConfigTests.swift  ← NUEVO
```

## 8. Patrón de test

Todos los tests siguen el mismo patrón por ser métodos bridge RN con resolver/rejecter:

```swift
func testNombreMetodo_caso_resultadoEsperado() {
    let expectation = self.expectation(description: "descripción")

    module.metodo(params, resolver: { result in
        // Asserts sobre result
        expectation.fulfill()
    }, rejecter: { code, message, error in
        // Asserts sobre error o XCTFail
        expectation.fulfill()
    })

    waitForExpectations(timeout: 5)
}
```

**Notas sobre el patrón:**

- Timeout de 5s para métodos síncronos, 10s para `addDownload` (que puede hacer I/O)
- `expectation.fulfill()` en AMBOS callbacks para evitar timeouts si el comportamiento es diferente al esperado
- Para métodos donde el comportamiento con ID inexistente es ambiguo (puede resolver o rechazar), el test documenta el comportamiento actual sin hacer `XCTFail`

## 9. Complejidad estimada

- **Nivel**: Baja
- **Justificación**: Solo se escriben tests, no se modifica código de producción. El código de test propuesto en la auditoría está casi listo para usar. El principal riesgo es la instanciación de `DownloadsModule2` sin bridge RN.
- **Tiempo estimado**: 1.5-2.5 horas

## 10. Preguntas sin resolver

### Técnicas

- [x] ¿Se puede instanciar `DownloadsModule2()` sin bridge RN activo? → **Por verificar en simulador**. El init de `RCTEventEmitter` puede requerir bridge.
- [x] ¿Existe ya un target de tests XCTest en el proyecto? → **NO existe**. Hay que crearlo.
- [ ] ¿El módulo target se llama `react_native_video` o tiene otro nombre para el import `@testable`?
- [x] ¿`addDownload` con config válida funciona en simulador sin red? → **Requiere `moduleInit()` primero**, que crea `AVAssetDownloadURLSession`. Probablemente necesita simulador con red.
- [ ] ¿Se puede acceder a `isInitialized` desde tests con `@testable import`? Es `private` — puede necesitar cambiar a `internal` o usar un helper.

### De negocio

- Ninguna — esta tarea no cambia comportamiento.

### De rendimiento

- Ninguna — solo tests.

## Aprobación

- [ ] Spec revisado
- [ ] Dudas resueltas
- [ ] Listo para verificación de baseline
